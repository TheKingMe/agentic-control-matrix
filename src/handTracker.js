import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * HandTracker - Dual-Hand (2-Hand) & Single-Hand MediaPipe Tracking Engine
 * 
 * Supports:
 * 1. Dual-Hand (2 Hands) Tracking:
 *    - Left Hand ➔ Controls Robot Left Arm & Left Side Kinematics
 *    - Right Hand ➔ Controls Robot Right Arm & Right Side Kinematics
 *    - Two-Hand Center (avgX, avgY, avgSize) ➔ Body Translation (X/Y/Z)
 *    - Hand Elevation Delta ➔ Body Yaw & Organic Banking
 *    - Alternating Arm Pumps ➔ Walking & Running Strides
 *    - Two Fists ➔ Crouch Shield / Stop
 *    - Both Hands Open / Raised ➔ Celebration & Ready
 * 2. Single-Hand Fallback:
 *    - Gracefully controls individual limbs and whole-hand motion if only 1 hand is in view
 * 3. 10 Fingertip Screen Coordinates for Dual 10-Tether Puppet Strings
 */
export class HandTracker {
  constructor(videoElement) {
    this.video = videoElement;
    this.landmarker = null;
    this.isReady = false;
    this.lastVideoTime = -1;

    // Number of hands detected in current frame (0, 1, or 2)
    this.handCount = 0;

    // Dual hands state
    this.leftHand = null;
    this.rightHand = null;

    // Combined dual-hand metrics
    this.dual = {
      detected: false,
      handCount: 0,
      avgX: 0.5,
      avgY: 0.5,
      avgSize: 0.2,
      distance: 0.4,
      tiltAngle: 0.0,
      isTwoFists: false,
      isBothOpen: false,
      isBothPinch: false,
      isAlternating: false,
      strideCycle: 0
    };

    // Primary hand state (for backward compatibility)
    this.hand = this.createEmptyHandState();
    this.curls = { thumb: 0.0, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 };

    // Low-pass filter state
    this.smoothL = { x: 0.35, y: 0.5, size: 0.2, angle: 0, prevY: 0.5, prevX: 0.35, velY: 0, velX: 0, curls: { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 } };
    this.smoothR = { x: 0.65, y: 0.5, size: 0.2, angle: 0, prevY: 0.5, prevX: 0.65, velY: 0, velX: 0, curls: { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 } };

    this.onGestureAction = null;
  }

  createEmptyHandState() {
    return {
      detected: false,
      side: 'single', // 'left', 'right', or 'single'
      x: 0.5,
      y: 0.5,
      size: 0.2,
      angle: 0.0,
      deltaX: 0.0,
      deltaY: 0.0,
      velocityX: 0.0,
      velocityY: 0.0,
      pinchDist: 1.0,
      isPinching: false,
      isHeavyLifting: false,
      isPeaceSign: false,
      isFist: false,
      isOpenPalm: false,
      activeStateName: 'NO_HAND',
      curls: { thumb: 0.0, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 },
      rawCurls: { thumb: 0.0, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 },
      landmarks: null,
      screenFingertips: []
    };
  }

  async init() {
    try {
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks('./assets/wasm');
      } catch (e) {
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      const modelAssetPath = './assets/models/hand_landmarker.task';

      // Initialize with numHands: 2 for FULL DUAL-HAND TRACKING
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2
        });
      } catch (gpuErr) {
        console.warn('Falling back to CPU delegate for 2-hand tracking:', gpuErr);
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 2
        });
      }

      this.isReady = true;
      console.log('MediaPipe HandLandmarker initialized successfully with 2-HAND SUPPORT.');
      return true;
    } catch (err) {
      console.error('Error initializing HandLandmarker:', err);
      return false;
    }
  }

  smoothstep(min, max, val) {
    const x = Math.max(0, Math.min(1, (val - min) / (max - min)));
    return x * x * (3 - 2 * x);
  }

  /**
   * Evaluates individual hand features & finger curls
   */
  processHandLandmarks(lm, smoothState, deltaSeconds) {
    const wrist = lm[0];
    const rawMirroredX = 1.0 - wrist.x;
    const rawY = wrist.y;

    // Smooth position (factor 0.15 for quick response with zero jitter)
    smoothState.x += (rawMirroredX - smoothState.x) * 0.15;
    smoothState.y += (rawY - smoothState.y) * 0.15;

    const deltaX = smoothState.x - smoothState.prevX;
    const deltaY = smoothState.y - smoothState.prevY;
    const velX = deltaX / Math.max(deltaSeconds, 0.001);
    const velY = deltaY / Math.max(deltaSeconds, 0.001);
    smoothState.prevX = smoothState.x;
    smoothState.prevY = smoothState.y;
    smoothState.velX = velX;
    smoothState.velY = velY;

    // Size
    const midMcp = lm[9];
    const rawSize = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y);
    smoothState.size += (rawSize - smoothState.size) * 0.12;

    // Angle / roll
    const dx = (1.0 - midMcp.x) - rawMirroredX;
    const dy = rawY - midMcp.y;
    const rawAngle = Math.atan2(dx, dy);
    smoothState.angle += (rawAngle - smoothState.angle) * 0.12;

    // 5 Finger Curls with Hermite easing
    const fingerDefs = {
      thumb:  { tip: 4,  base: 2,  minD: 0.60, maxD: 1.15 },
      index:  { tip: 8,  base: 5,  minD: 0.65, maxD: 1.85 },
      middle: { tip: 12, base: 9,  minD: 0.70, maxD: 2.00 },
      ring:   { tip: 16, base: 13, minD: 0.65, maxD: 1.85 },
      pinky:  { tip: 20, base: 17, minD: 0.60, maxD: 1.65 }
    };

    const curls = {};
    const rawCurls = {};
    if (!smoothState.curls) {
      smoothState.curls = { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 };
    }

    for (const [finger, def] of Object.entries(fingerDefs)) {
      const ptTip = lm[def.tip];
      const ptBase = lm[def.base];
      const dTip = Math.hypot(ptTip.x - wrist.x, ptTip.y - wrist.y, (ptTip.z || 0) - (wrist.z || 0));
      const dBase = Math.hypot(ptBase.x - wrist.x, ptBase.y - wrist.y, (ptBase.z || 0) - (wrist.z || 0));

      let ratio = 1.0;
      if (dBase > 0.001) ratio = dTip / dBase;

      const normCurl = 1.0 - this.smoothstep(def.minD, def.maxD, ratio);
      rawCurls[finger] = normCurl;
      smoothState.curls[finger] += (normCurl - smoothState.curls[finger]) * 0.22;
      curls[finger] = smoothState.curls[finger];
    }

    // Gestures for this hand
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const pinchDist = Math.hypot(
      (1.0 - thumbTip.x) - (1.0 - indexTip.x),
      thumbTip.y - indexTip.y,
      (thumbTip.z || 0) - (indexTip.z || 0)
    );

    const isPinch = pinchDist < 0.054;
    const allCurls = Object.values(curls);
    const isOpenPalm = allCurls.every(c => c < 0.28);
    const isFist = allCurls.every(c => c > 0.68);
    const isPeaceSign = curls.index < 0.32 && curls.middle < 0.32 && curls.ring > 0.52 && curls.pinky > 0.52;

    const screenFingertips = this.getScreenFingertips(lm);

    return {
      detected: true,
      x: smoothState.x,
      y: smoothState.y,
      size: smoothState.size,
      angle: smoothState.angle,
      deltaX,
      deltaY,
      velocityX: velX,
      velocityY: velY,
      pinchDist,
      isPinching: isPinch,
      isHeavyLifting: isPinch && velY < -0.40,
      isPeaceSign,
      isFist,
      isOpenPalm,
      curls,
      rawCurls,
      landmarks: lm,
      screenFingertips
    };
  }

  /**
   * Process video frame for up to 2 hands
   */
  update(timestampMs, deltaSeconds = 0.016) {
    if (!this.isReady || !this.landmarker || this.video.readyState < 2 || this.video.paused) {
      this.handCount = 0;
      this.hand.detected = false;
      this.dual.detected = false;
      return null;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.hand;
    }
    this.lastVideoTime = this.video.currentTime;

    const results = this.landmarker.detectForVideo(this.video, timestampMs);

    if (results && results.landmarks && results.landmarks.length > 0) {
      this.handCount = results.landmarks.length;

      // -----------------------------------------------------------------------
      // CASE 1: TWO HANDS DETECTED (FULL DUAL-HAND PUPPETEER MODE)
      // -----------------------------------------------------------------------
      if (this.handCount >= 2) {
        const rawHand0 = this.processHandLandmarks(results.landmarks[0], this.smoothL, deltaSeconds);
        const rawHand1 = this.processHandLandmarks(results.landmarks[1], this.smoothR, deltaSeconds);

        // Sort by X coordinate in screen space:
        // leftHand is the one on the user's left visual side (x < other.x)
        // rightHand is the one on the user's right visual side (x > other.x)
        if (rawHand0.x < rawHand1.x) {
          this.leftHand = rawHand0;
          this.rightHand = rawHand1;
        } else {
          this.leftHand = rawHand1;
          this.rightHand = rawHand0;
        }

        this.leftHand.side = 'left';
        this.rightHand.side = 'right';

        // Dual combined metrics
        const avgX = (this.leftHand.x + this.rightHand.x) * 0.5;
        const avgY = (this.leftHand.y + this.rightHand.y) * 0.5;
        const avgSize = (this.leftHand.size + this.rightHand.size) * 0.5;
        const handDist = Math.hypot(this.rightHand.x - this.leftHand.x, this.rightHand.y - this.leftHand.y);
        const tiltAngle = Math.atan2(this.rightHand.y - this.leftHand.y, this.rightHand.x - this.leftHand.x);

        const isTwoFists = this.leftHand.isFist && this.rightHand.isFist;
        const isBothOpen = this.leftHand.isOpenPalm && this.rightHand.isOpenPalm;
        const isBothPinch = this.leftHand.isPinching && this.rightHand.isPinching;

        // Alternating stride detection (one hand moves down while other moves up)
        const vertVelDiff = Math.abs(this.leftHand.velocityY - this.rightHand.velocityY);
        const isAlternating = vertVelDiff > 0.8;

        this.dual = {
          detected: true,
          handCount: 2,
          avgX,
          avgY,
          avgSize,
          distance: handDist,
          tiltAngle,
          isTwoFists,
          isBothOpen,
          isBothPinch,
          isAlternating,
          leftHand: this.leftHand,
          rightHand: this.rightHand
        };

        // Primary hand representation (midpoint)
        this.hand.detected = true;
        this.hand.x = avgX;
        this.hand.y = avgY;
        this.hand.size = avgSize;
        this.hand.angle = tiltAngle;
        this.hand.isFist = isTwoFists;
        this.hand.isOpenPalm = isBothOpen;
        this.hand.isPinching = isBothPinch || this.leftHand.isPinching || this.rightHand.isPinching;
        this.hand.isPeaceSign = this.leftHand.isPeaceSign || this.rightHand.isPeaceSign;
        this.hand.pinchDist = Math.min(this.leftHand.pinchDist, this.rightHand.pinchDist);
        this.hand.activeStateName = isTwoFists ? 'TWO_FISTS_SHIELD' :
                                   isBothOpen ? 'BOTH_HANDS_OPEN' :
                                   isBothPinch ? 'DUAL_PINCH_GRAB' :
                                   'DUAL_HAND_CONTROL';

        // Blend curls for debug display
        for (const k of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
          this.curls[k] += (((this.leftHand.curls[k] + this.rightHand.curls[k]) * 0.5) - this.curls[k]) * 0.15;
          this.hand.curls[k] = this.curls[k];
        }

        // Combine fingertips for 10-tether rendering
        this.hand.screenFingertips = [
          ...this.leftHand.screenFingertips,
          ...this.rightHand.screenFingertips
        ];

      } else {
        // ---------------------------------------------------------------------
        // CASE 2: SINGLE HAND DETECTED
        // ---------------------------------------------------------------------
        const rawWristX = 1.0 - results.landmarks[0][0].x;
        const targetSmooth = rawWristX < 0.5 ? this.smoothL : this.smoothR;
        const single = this.processHandLandmarks(results.landmarks[0], targetSmooth, deltaSeconds);
        this.hand = single;
        this.hand.side = single.x < 0.5 ? 'left' : 'right';

        if (this.hand.side === 'left') {
          this.leftHand = single;
          this.rightHand = null;
        } else {
          this.rightHand = single;
          this.leftHand = null;
        }

        this.dual = {
          detected: false,
          handCount: 1,
          avgX: single.x,
          avgY: single.y,
          avgSize: single.size,
          distance: 0.0,
          tiltAngle: single.angle,
          isTwoFists: false,
          isBothOpen: false,
          isBothPinch: false,
          isAlternating: false,
          leftHand: this.leftHand,
          rightHand: this.rightHand
        };

        for (const k of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
          this.curls[k] += (single.curls[k] - this.curls[k]) * 0.15;
        }

        this.hand.activeStateName = single.isFist ? 'FIST_STOP' :
                                   single.isPeaceSign ? 'PEACE_BEAMS' :
                                   single.isPinching ? 'PINCH_GRAB' :
                                   single.isOpenPalm ? 'OPEN_PALM' : 'SINGLE_HAND';
      }

    } else {
      this.handCount = 0;
      this.hand.detected = false;
      this.dual.detected = false;
      this.leftHand = null;
      this.rightHand = null;
      this.hand.activeStateName = 'NO_HAND';
    }

    return this.hand;
  }

  getScreenFingertips(landmarks) {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;

    const videoAspect = vw / vh;
    const screenAspect = sw / sh;

    let rw, rh, ox, oy;
    if (screenAspect > videoAspect) {
      rw = sw;
      rh = sw / videoAspect;
      ox = 0;
      oy = (sh - rh) / 2;
    } else {
      rh = sh;
      rw = sh * videoAspect;
      ox = (sw - rw) / 2;
      oy = 0;
    }

    const tipIndices = [4, 8, 12, 16, 20];
    return tipIndices.map(idx => {
      const pt = landmarks[idx];
      const sx = ox + (1.0 - pt.x) * rw;
      const sy = oy + pt.y * rh;
      return { x: sx, y: sy };
    });
  }
}
