/**
 * VisionEngine - MediaPipe Hand Landmarker & Gesture Recognition Subsystem
 * Tracks up to 2 hands in real-time with 21 3D landmarks, coordinate projection,
 * EMA temporal smoothing, and high-level sci-fi gesture heuristics.
 */

// MediaPipe Tasks-Vision CDN Loader
const MEDIAPIPE_CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

export class VisionEngine {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.isMirrored = options.isMirrored !== false; // Default true
    this.pinchThreshold = options.pinchThreshold || Math.max(65, Math.round(window.innerHeight * 0.075)); // Adaptive Screen px distance
    
    this.handLandmarker = null;
    this.isModelLoaded = false;
    this.isStreaming = false;
    this.isDemoMode = false;
    
    this.lastVideoTime = -1;
    this.results = null;
    
    // Temporal smoothing state (Exponential Moving Average)
    this.alpha = 0.65; // Smoothing factor (0 = infinite lag, 1 = raw jitter)
    this.smoothedHands = []; // Stores smoothed landmark arrays for up to 2 hands
    
    // High-level gesture states per hand
    this.gestureStates = [
      { isPinching: false, pinchPoint: { x: 0, y: 0, z: 0 }, isOpenPalm: false, isPointing: false, swipeSpeed: 0 },
      { isPinching: false, pinchPoint: { x: 0, y: 0, z: 0 }, isOpenPalm: false, isPointing: false, swipeSpeed: 0 }
    ];

    // Tracking metrics
    this.fps = 0;
    this.latencyMs = 0;
    this.confidence = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();

    // Synthetic hand state for fallback mouse simulation
    this.syntheticHandEnabled = false;
    this.mousePos = { x: 0.5, y: 0.5, isDown: false };
    this.initMouseListener();
  }

  /**
   * Initializes MediaPipe HandLandmarker with GPU delegate and low-latency settings
   */
  async initModel(onProgress) {
    if (this.isModelLoaded && this.handLandmarker) return true;

    try {
      if (onProgress) onProgress("INITIALIZING NEURAL MATRIX...");

      // 1. Load Vision Bundle (local with CDN fallback)
      let FilesetResolver, HandLandmarker;
      try {
        const localModule = await import("../assets/wasm/vision_bundle.mjs");
        FilesetResolver = localModule.FilesetResolver;
        HandLandmarker = localModule.HandLandmarker;
      } catch (e) {
        const cdnModule = await import(`${MEDIAPIPE_CDN_BASE}/vision_bundle.mjs`);
        FilesetResolver = cdnModule.FilesetResolver;
        HandLandmarker = cdnModule.HandLandmarker;
      }
      
      if (onProgress) onProgress("MOUNTING WASM RUNTIME...");
      const wasmPath = new URL("./assets/wasm", window.location.href).href;
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(wasmPath);
      } catch (e) {
        vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_CDN_BASE}/wasm`);
      }

      if (onProgress) onProgress("CONFIGURING HAND LANDMARKER MODEL...");

      // 2. Absolute URL ensures model is always found from Workers or Main Thread
      const modelPath = new URL("./assets/models/hand_landmarker.task", window.location.href).href;

      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35
        });
      } catch (gpuErr) {
        console.warn("GPU delegate unavailable, falling back to CPU:", gpuErr);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35
        });
      }

      this.isModelLoaded = true;
      this.syntheticHandEnabled = false; // Never use synthetic hand when real model is loaded
      if (onProgress) onProgress("NEURAL MATRIX READY (ONLINE)");
      return true;
    } catch (err) {
      console.error("Failed to initialize MediaPipe HandLandmarker:", err);
      if (!this.isStreaming) {
        this.syntheticHandEnabled = true; // Fallback to synthetic mode ONLY if no camera
      }
      return false;
    }
  }

  /**
   * Starts native camera stream via navigator.mediaDevices.getUserMedia
   */
  async startCamera(deviceId = null) {
    try {
      this.video.muted = true;
      this.video.playsInline = true;

      // 1. Try ideal resolution without facingMode (avoids OverconstrainedError on desktop webcams)
      let stream = null;
      try {
        const constraints = {
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId } } : {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (conErr) {
        console.warn("High-res constraints failed, falling back to basic { video: true }:", conErr);
        // 2. Fall back to basic video constraint (guaranteed to work on USB/laptop webcams)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      this.isStreaming = true;
      this.isDemoMode = false;
      return true;
    } catch (err) {
      console.error("Camera stream request failed completely:", err);
      return false;
    }
  }

  /**
   * Starts demo video stream (from assets/demo.mp4)
   */
  async startDemoVideo(videoSrc = "assets/demo.mp4") {
    try {
      if (this.video.srcObject) {
        this.video.srcObject.getTracks().forEach(track => track.stop());
        this.video.srcObject = null;
      }
      this.video.src = videoSrc;
      this.video.loop = true;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      this.isStreaming = true;
      this.isDemoMode = true;
      return true;
    } catch (err) {
      console.warn("Failed to load demo video, enabling synthetic mode:", err);
      this.syntheticHandEnabled = true;
      return false;
    }
  }

  /**
   * Enumerates available video input devices
   */
  async getVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e) {
      return [];
    }
  }

  /**
   * Updates hand landmark tracking for the current animation frame
   */
  update(currentTimeMs) {
    const startTime = performance.now();

    // Only allow synthetic mouse hand if NOT streaming real camera or demo video
    if (this.syntheticHandEnabled && !this.isStreaming) {
      this.updateSyntheticHand(currentTimeMs);
      this.updateMetrics(startTime);
      return this.getTrackingPayload();
    }

    if (!this.handLandmarker || !this.isStreaming || this.video.readyState < 2) {
      return null;
    }

    // Process on every frame if time progressed
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      try {
        this.results = this.handLandmarker.detectForVideo(this.video, performance.now());
      } catch (e) {
        console.warn("HandLandmarker detection error:", e);
      }
    }

    if (this.results && this.results.landmarks && this.results.landmarks.length > 0) {
      this.processRawLandmarks(this.results.landmarks, this.results.handedness);
    } else {
      // Fade out smoothed landmarks when hand is temporarily lost
      this.smoothedHands = [];
      this.gestureStates.forEach(g => {
        g.isPinching = false;
        g.isOpenPalm = false;
        g.isPointing = false;
      });
      this.confidence = 0;
    }

    this.updateMetrics(startTime);
    return this.getTrackingPayload();
  }

  /**
   * Accurate projection mapping from raw video frame to screen under CSS object-fit: cover
   */
  getScreenPoint(normX, normY) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const vidW = this.video.videoWidth || screenW;
    const vidH = this.video.videoHeight || screenH;

    // object-fit: cover aspect scaling
    const scale = Math.max(screenW / vidW, screenH / vidH);
    const renderedW = vidW * scale;
    const renderedH = vidH * scale;
    const offsetX = (screenW - renderedW) * 0.5;
    const offsetY = (screenH - renderedH) * 0.5;

    // Flip horizontal axis if mirrored
    const flippedX = this.isMirrored ? (1.0 - normX) : normX;
    const screenX = offsetX + flippedX * renderedW;
    const screenY = offsetY + normY * renderedH;

    return {
      x: screenX / screenW,
      y: screenY / screenH
    };
  }

  /**
   * Temporal EMA Smoothing & Coordinate Space Transformation
   */
  processRawLandmarks(rawHands, handednessList) {
    const currentHands = [];

    rawHands.forEach((rawLandmarks, handIdx) => {
      if (handIdx >= 2) return;

      const prevSmoothed = this.smoothedHands[handIdx];
      const smoothed = [];

      for (let i = 0; i < 21; i++) {
        const raw = rawLandmarks[i];
        const proj = this.getScreenPoint(raw.x, raw.y);
        const targetX = proj.x;
        const targetY = proj.y;
        const targetZ = raw.z;

        if (!prevSmoothed || !prevSmoothed[i]) {
          smoothed.push({ x: targetX, y: targetY, z: targetZ });
        } else {
          smoothed.push({
            x: prevSmoothed[i].x * (1 - this.alpha) + targetX * this.alpha,
            y: prevSmoothed[i].y * (1 - this.alpha) + targetY * this.alpha,
            z: prevSmoothed[i].z * (1 - this.alpha) + targetZ * this.alpha
          });
        }
      }

      currentHands.push(smoothed);
      this.analyzeGestures(smoothed, handIdx);
    });

    this.smoothedHands = currentHands;
    this.confidence = 0.95;
  }

  /**
   * Gesture Heuristics Analysis (Pinch, Open Palm, Point/Swipe)
   */
  analyzeGestures(landmarks, handIdx) {
    const state = this.gestureStates[handIdx];

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // Screen-space Euclidean distance for pinch detection (Thumb to Index or Thumb to Middle)
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const dxIndex = (thumbTip.x - indexTip.x) * screenW;
    const dyIndex = (thumbTip.y - indexTip.y) * screenH;
    const distIndex = Math.hypot(dxIndex, dyIndex);

    const dxMiddle = (thumbTip.x - middleTip.x) * screenW;
    const dyMiddle = (thumbTip.y - middleTip.y) * screenH;
    const distMiddle = Math.hypot(dxMiddle, dyMiddle);

    const pinchDistPx = Math.min(distIndex, distMiddle);

    // 1. PINCH DETECTION with Hysteresis (Easy to grab, hard to accidentally drop)
    const wasPinching = state.isPinching;
    const pinchThreshold = Math.max(75, Math.round(screenH * 0.085));
    const releaseThreshold = pinchThreshold + 30;

    if (!wasPinching) {
      state.isPinching = pinchDistPx < pinchThreshold;
    } else {
      state.isPinching = pinchDistPx < releaseThreshold;
    }

    state.pinchDistPx = pinchDistPx;
    state.pinchPoint = {
      x: (thumbTip.x + indexTip.x) * 0.5 * screenW,
      y: (thumbTip.y + indexTip.y) * 0.5 * screenH,
      z: (thumbTip.z + indexTip.z) * 0.5
    };
    state.justPinched = !wasPinching && state.isPinching;
    state.justReleased = wasPinching && !state.isPinching;

    // 2. OPEN PALM DETECTION
    const distT = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y);
    const distI = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
    const distM = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
    const distR = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
    const distP = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);

    const avgDist = (distT + distI + distM + distR + distP) / 5;
    state.isOpenPalm = avgDist > 0.35 && !state.isPinching;

    // 3. POINTING GESTURE
    const isIndexExtended = distI > 0.28;
    const isOthersCurled = distM < 0.24 && distR < 0.22 && distP < 0.2;
    state.isPointing = isIndexExtended && isOthersCurled;
  }

  /**
   * Fallback Synthetic Hand for Testing without camera/GPU
   */
  initMouseListener() {
    window.addEventListener('mousemove', (e) => {
      this.mousePos.x = e.clientX / window.innerWidth;
      this.mousePos.y = e.clientY / window.innerHeight;
    });
    window.addEventListener('mousedown', () => { this.mousePos.isDown = true; });
    window.addEventListener('mouseup', () => { this.mousePos.isDown = false; });
  }

  updateSyntheticHand(timeMs) {
    const t = timeMs * 0.002;
    const mx = this.mousePos.x;
    const my = this.mousePos.y;

    // Build synthetic 21 landmarks centered on cursor
    const hand = [];
    const spread = 0.04;
    const pinchClose = this.mousePos.isDown ? 0.01 : 0.05;

    // Wrist
    hand[0] = { x: mx, y: my + 0.12, z: 0 };
    // Thumb (0, 1, 2, 3, 4)
    hand[4] = { x: mx - pinchClose, y: my - 0.02, z: 0 };
    // Index (5, 6, 7, 8)
    hand[8] = { x: mx + (this.mousePos.isDown ? -0.01 : 0.01), y: my - 0.05, z: 0 };
    // Middle (9, 10, 11, 12)
    hand[12] = { x: mx + 0.04, y: my - 0.06 + Math.sin(t) * 0.005, z: 0 };
    // Ring (13, 14, 15, 16)
    hand[16] = { x: mx + 0.07, y: my - 0.04 + Math.cos(t) * 0.005, z: 0 };
    // Pinky (17, 18, 19, 20)
    hand[20] = { x: mx + 0.09, y: my - 0.01, z: 0 };

    // Fill intermediate knuckles
    for (let i = 0; i < 21; i++) {
      if (!hand[i]) {
        hand[i] = { x: mx + (i % 5 - 2) * 0.02, y: my + (Math.floor(i / 5)) * 0.03, z: 0 };
      }
    }

    this.smoothedHands = [hand];
    this.analyzeGestures(hand, 0);
    this.confidence = 0.99;
  }

  updateMetrics(startTime) {
    this.latencyMs = Math.round(performance.now() - startTime);
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  getTrackingPayload() {
    return {
      hands: this.smoothedHands,
      gestures: this.gestureStates,
      fps: this.fps,
      latency: this.latencyMs,
      confidence: this.confidence,
      isDemoMode: this.isDemoMode,
      handCount: this.smoothedHands.length
    };
  }

  setMirrored(mirrored) {
    this.isMirrored = mirrored;
  }
}
