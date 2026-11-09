import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * RobotMech - Articulated 3D Cyber Android (`robot.glb`)
 * Full Responsive Kinematics Engine for Single-Hand & Dual-Hand Teleoperation
 * 
 * Features:
 * - Direct, real-time skeletal articulation of EVERY piece on the 3D Android robot:
 *   * Right Arm (Shoulder, Upper Arm, Forearm/Elbow, Fingers): driven by Thumb / Right Hand
 *   * Left Arm (Shoulder, Upper Arm, Forearm/Elbow, Fingers): driven by Index / Left Hand
 *   * Legs & Walk/Run: Middle finger curl or dual-hand alternating jog triggers walking strides
 *   * Body Rotation: Ring finger curl + horizontal drag rotates robot 360°
 *   * Elevation (Jump Up / Crouch Down): Pinky up elevates; Pinky curled crouches
 *   * Head: Pitches and pans naturally to track the user's hand and face
 *   * Torso: Tilts and rolls with hand orientation
 *   * Hand Gestures: Fist/Pinch clenches fists & punches; Peace waves; Open celebrates; Thumbs up
 * - 10-Tether Bezier Loom anchors dynamically to live bone positions
 */
export class RobotMech {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "RobotSystem";

    // Frame Hero Position: Centered, wide framing, base scale 0.70
    this.baseX = 0.0;
    this.baseY = -1.05;
    this.baseZ = 0.0;
    this.baseScale = 0.70;
    this.root.position.set(this.baseX, this.baseY, this.baseZ);
    this.root.scale.set(this.baseScale, this.baseScale, this.baseScale);

    this.targetOffset = new THREE.Vector3(0, 0, 0);
    this.targetScale = this.baseScale;
    this.targetRotY = 0.0;
    this.targetRollZ = 0.0;
    this.targetHeight = 0.0;

    // Tracking mode: 'mirror' (responsive 1:1 motion) or 'pivot' (stationary)
    this.trackingMode = 'mirror';
    this.currentModelMode = 'gltf';

    // Walk animation cycle timer
    this.walkCycle = 0;
    this.isWalking = false;

    // Kinematic smoothing states
    this.currentArmLiftR = 0.0;
    this.currentArmSweepR = 0.0;
    this.currentElbowR = 0.15;
    this.currentArmLiftL = 0.0;
    this.currentArmSweepL = 0.0;
    this.currentElbowL = 0.15;
    this.currentHeadPitch = 0.0;
    this.currentHeadYaw = 0.0;
    this.currentClench = 0.0;
    this.currentTorsoRoll = 0.0;
    this.currentTorsoLean = 0.0;

    // Materials & Geometries
    this.buildHolographicPlatform();
    this.loadGLTFModel();

    this.scene.add(this.root);
  }

  buildHolographicPlatform() {
    this.platformGroup = new THREE.Group();
    this.platformGroup.position.y = 0.01;
    this.root.add(this.platformGroup);

    // Outer Concentric Ring
    this.ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.35, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      })
    );
    this.ringOuter.rotation.x = -Math.PI / 2;
    this.platformGroup.add(this.ringOuter);

    // Middle Concentric Ring
    this.ringMiddle = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.95, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffaa22,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
      })
    );
    this.ringMiddle.rotation.x = -Math.PI / 2;
    this.platformGroup.add(this.ringMiddle);

    // Inner Concentric Target Ring
    this.ringInner = new THREE.Mesh(
      new THREE.RingGeometry(0.40, 0.46, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      })
    );
    this.ringInner.rotation.x = -Math.PI / 2;
    this.platformGroup.add(this.ringInner);

    // Subtle Radial Floor Grid
    const gridHelper = new THREE.PolarGridHelper(1.5, 8, 4, 32, 0x00f0ff, 0x1f3b60);
    gridHelper.position.y = 0.005;
    this.platformGroup.add(gridHelper);

    // Torso Telemetry Arc
    this.torsoReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.78, 48, 1, 0, Math.PI * 1.5),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      })
    );
    this.torsoReticle.rotation.x = Math.PI / 2;
    this.torsoReticle.position.set(0, 1.45, 0);
    this.root.add(this.torsoReticle);
  }

  loadGLTFModel() {
    this.gltfGroup = new THREE.Group();
    this.gltfGroup.name = "GLTFAndroid";
    this.root.add(this.gltfGroup);

    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.activeActionName = 'Idle';
    this.bones = {};
    this.initialTransforms = {};

    const loader = new GLTFLoader();
    loader.load(
      './assets/models/robot.glb',
      (gltf) => {
        this.gltfScene = gltf.scene;
        this.gltfScene.scale.set(0.68, 0.68, 0.68);
        this.gltfScene.position.set(0, 0, 0);
        this.gltfGroup.add(this.gltfScene);

        // Map bones and cache rest transforms
        this.gltfScene.traverse((child) => {
          if (child.isBone) {
            this.bones[child.name] = child;
            // Also store stripped key for dot-less lookup
            const clean = child.name.replace(/[\._]/g, '');
            this.bones[clean] = child;

            this.initialTransforms[child.name] = {
              quaternion: child.quaternion.clone(),
              position: child.position.clone(),
              scale: child.scale.clone()
            };
            this.initialTransforms[clean] = this.initialTransforms[child.name];
          }
        });

        // Setup Animation Mixer
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.gltfScene);
          gltf.animations.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            this.actions[clip.name] = action;
            if (['Punch', 'Jump', 'ThumbsUp', 'Dance', 'Wave'].includes(clip.name)) {
              action.setLoop(THREE.LoopRepeat);
            }
          });

          if (this.actions['Idle']) {
            this.actions['Idle'].play();
            this.currentAction = this.actions['Idle'];
            this.activeActionName = 'Idle';
          }
        }
      },
      undefined,
      (err) => console.warn('Could not load robot.glb:', err)
    );
  }

  setModelMode(mode) {
    // 3D Android is the exclusive active model
    this.currentModelMode = 'gltf';
  }

  setTrackingMode(mode) {
    this.trackingMode = mode;
  }

  playGLTFAnimation(name, fadeDuration = 0.22) {
    if (!this.mixer || !this.actions[name]) return;
    const nextAction = this.actions[name];
    if (this.currentAction === nextAction) return;

    if (this.currentAction) {
      this.currentAction.crossFadeTo(nextAction, fadeDuration, true);
    }
    nextAction.reset();
    nextAction.play();
    this.currentAction = nextAction;
    this.activeActionName = name;
  }

  /**
   * Main Responsive Kinematics Loop
   * Smooth, fluid, responsive control across EVERY piece of the 3D Android
   * DIRECT KINEMATICS - NO LOCKUPS, NO BLOCKING, ZERO JITTER
   */
  update(handTracker, time = 0, deltaSeconds = 0.016) {
    if (this.mixer) {
      this.mixer.update(deltaSeconds);
    }

    // Platform holographic rotation
    if (this.ringOuter) this.ringOuter.rotation.z = -time * 0.35;
    if (this.ringMiddle) this.ringMiddle.rotation.z = time * 0.55;
    if (this.ringInner) this.ringInner.rotation.z = -time * 0.85;
    if (this.torsoReticle) this.torsoReticle.rotation.z = time * 0.45;

    // Framerate-independent critically damped smoothing
    const dt = Math.min(deltaSeconds, 0.05);
    const smoothK = 1.0 - Math.exp(-14.0 * dt);
    const rootK = 1.0 - Math.exp(-10.0 * dt);

    const handCount = handTracker.handCount || 0;
    const leftHand = handTracker.leftHand;
    const rightHand = handTracker.rightHand;
    const dual = handTracker.dual;
    const primaryHand = handTracker.hand;
    const curls = handTracker.curls || { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };

    // Targets for kinematic solver
    let targetArmLiftR = 0.0;
    let targetArmSweepR = 0.0;
    let targetElbowR = 0.15;

    let targetArmLiftL = 0.0;
    let targetArmSweepL = 0.0;
    let targetElbowL = 0.15;

    let targetHeadPitch = 0.0;
    let targetHeadYaw = 0.0;
    let targetClench = 0.0;

    let targetTorsoRoll = 0.0;
    let targetTorsoLean = 0.0;
    let targetBodyRotate = 0.0;
    let targetElevation = 0.0;

    // Gesture classifications (clean, intentional thresholds)
    const isBothOpen = (handCount >= 2 && dual && dual.isBothOpen);
    const isPeace = (leftHand && leftHand.isPeaceSign) || (rightHand && rightHand.isPeaceSign) || (primaryHand && primaryHand.isPeaceSign);
    const isMiddleWalk = (curls.middle > 0.35);
    const isDualWalk = (handCount >= 2 && dual && dual.isAlternating);

    // -------------------------------------------------------------------------
    // 1. INPUT RESOLUTION (DUAL-HAND vs SINGLE-HAND)
    // -------------------------------------------------------------------------
    if (handCount >= 2 && leftHand && rightHand) {
      // MODE A: DUAL-HAND (2 HANDS) DIRECT TELEOPERATION
      // Right Hand drives Right Arm directly:
      const rLift = THREE.MathUtils.clamp((0.78 - rightHand.y) / 0.52, 0.0, 1.0);
      const rReachX = THREE.MathUtils.clamp((rightHand.x - 0.60) * 1.5, -0.5, 0.8);
      targetArmLiftR = rLift;
      targetArmSweepR = rReachX;
      targetElbowR = 0.15 + rLift * 1.15;

      // Left Hand drives Left Arm directly:
      const lLift = THREE.MathUtils.clamp((0.78 - leftHand.y) / 0.52, 0.0, 1.0);
      const lReachX = THREE.MathUtils.clamp((leftHand.x - 0.40) * 1.5, -0.8, 0.5);
      targetArmLiftL = lLift;
      targetArmSweepL = lReachX;
      targetElbowL = 0.15 + lLift * 1.15;

      // Head tracks midpoint of hands smoothly
      targetHeadPitch = -(dual.avgY - 0.50) * 0.65;
      targetHeadYaw = (dual.avgX - 0.50) * 0.70;

      // Torso roll from hand height delta
      targetTorsoRoll = -(rightHand.y - leftHand.y) * 0.35;
      targetBodyRotate = (dual.avgX - 0.50) * 2.2;

      // Elevation (Jump / Crouch) from average hand height
      targetElevation = -(dual.avgY - 0.50) * 1.3;

      targetClench = (rightHand.isFist || rightHand.isPinching || leftHand.isFist || leftHand.isPinching) ? 1.0 : 0.0;

    } else if (primaryHand && primaryHand.detected) {
      // MODE B: SINGLE-HAND FINGER-TO-PIECE DIRECT KINEMATICS

      // 1. THUMB -> RIGHT ARM:
      //    Thumb extended/open raises Right Arm smoothly from 0° up to 160° with elbow flex!
      //    Thumb curled lowers Right Arm down beside torso.
      const thumbLift = THREE.MathUtils.clamp((0.65 - curls.thumb) / 0.50, 0.0, 1.0);
      targetArmLiftR = thumbLift;
      targetArmSweepR = THREE.MathUtils.clamp((primaryHand.x - 0.50) * 0.7, -0.3, 0.5);
      targetElbowR = 0.15 + thumbLift * 1.15;

      // 2. INDEX -> LEFT ARM:
      //    Index extended/open raises Left Arm smoothly from 0° up to 160° with elbow flex!
      //    Index curled lowers Left Arm down beside torso.
      const indexLift = THREE.MathUtils.clamp((0.65 - curls.index) / 0.50, 0.0, 1.0);
      targetArmLiftL = indexLift;
      targetArmSweepL = THREE.MathUtils.clamp((0.50 - primaryHand.x) * 0.7, -0.3, 0.5);
      targetElbowL = 0.15 + indexLift * 1.15;

      // 3. MIDDLE -> LEGS (WALK / RUN):
      //    Middle finger curled triggers humanoid walking stride (handled dynamically below).

      // 4. RING -> BODY ROTATION (ROTATE 360°):
      //    Ring finger curl + hand horizontal drag rotates robot on platform.
      const ringRot = (0.50 - curls.ring) * 2.2;
      const dragRot = (primaryHand.x - 0.50) * 2.0;
      targetBodyRotate = ringRot + dragRot;

      // 5. PINKY -> JUMP & CROUCH (ELEVATION):
      //    Pinky extended UP: elevates robot up into the air!
      //    Pinky curled DOWN: crouches robot down with bent knees!
      const pinkyUp = THREE.MathUtils.clamp((0.55 - curls.pinky) / 0.45, 0.0, 1.0);
      const pinkyCrouch = THREE.MathUtils.clamp((curls.pinky - 0.50) / 0.40, 0.0, 1.0);
      const handElevate = -(primaryHand.y - 0.50) * 0.9;
      targetElevation = (pinkyUp * 0.65) - (pinkyCrouch * 0.40) + handElevate;

      // Head tracks hand position smoothly
      targetHeadPitch = -(primaryHand.y - 0.50) * 0.60;
      targetHeadYaw = (primaryHand.x - 0.50) * 0.70;

      // Torso tilt from hand angle
      targetTorsoRoll = -primaryHand.angle * 0.30;
      targetTorsoLean = (primaryHand.y - 0.50) * 0.20;

      targetClench = (primaryHand.isFist || primaryHand.isPinching) ? 1.0 : 0.0;

    } else {
      // Gentle idle breathing
      targetHeadPitch = Math.sin(time * 1.2) * 0.03;
      targetHeadYaw = Math.sin(time * 0.8) * 0.04;
      targetArmLiftR = 0.04 + Math.sin(time * 1.5) * 0.02;
      targetArmLiftL = 0.04 - Math.sin(time * 1.5) * 0.02;
      targetElbowR = 0.15;
      targetElbowL = 0.15;
    }

    // -------------------------------------------------------------------------
    // 2. WALKING & ACTION BLENDING (NEVER BLOCKS DIRECT ARM/BODY CONTROL)
    // -------------------------------------------------------------------------
    let walkBob = 0;
    if (isDualWalk || isMiddleWalk) {
      this.isWalking = true;
      const walkSpeed = isDualWalk ? 8.5 : (5.5 + curls.middle * 5.0);
      this.walkCycle += deltaSeconds * walkSpeed;
      walkBob = Math.abs(Math.sin(this.walkCycle * 2.0)) * 0.06;
    } else {
      this.isWalking = false;
    }

    let nextAnim = 'Idle';
    if (isBothOpen) {
      nextAnim = 'Dance'; // Celebration dance
    } else if (isPeace) {
      nextAnim = 'Wave'; // Friendly wave
    } else if (this.isWalking) {
      nextAnim = (curls.middle > 0.65 || (dual && dual.isAlternating)) ? 'Running' : 'Walking';
    } else {
      nextAnim = 'Idle';
    }

    this.playGLTFAnimation(nextAnim, 0.25);

    // -------------------------------------------------------------------------
    // 3. CONTINUOUS REAL-TIME SKELETAL ARTICULATION (DIRECT KINEMATICS)
    //    NEVER BLOCKED: Arms, elbows, head, torso, and fingers respond 100% of the time!
    // -------------------------------------------------------------------------
    this.currentArmLiftR += (targetArmLiftR - this.currentArmLiftR) * smoothK;
    this.currentArmSweepR += (targetArmSweepR - this.currentArmSweepR) * smoothK;
    this.currentElbowR += (targetElbowR - this.currentElbowR) * smoothK;

    this.currentArmLiftL += (targetArmLiftL - this.currentArmLiftL) * smoothK;
    this.currentArmSweepL += (targetArmSweepL - this.currentArmSweepL) * smoothK;
    this.currentElbowL += (targetElbowL - this.currentElbowL) * smoothK;

    this.currentHeadPitch += (targetHeadPitch - this.currentHeadPitch) * smoothK;
    this.currentHeadYaw += (targetHeadYaw - this.currentHeadYaw) * smoothK;
    this.currentClench += (targetClench - this.currentClench) * smoothK;
    this.currentTorsoRoll += (targetTorsoRoll - this.currentTorsoRoll) * smoothK;
    this.currentTorsoLean += (targetTorsoLean - this.currentTorsoLean) * smoothK;

    // 1. Right Arm (UpperArmR + LowerArmR) - DIRECT FULL CONTROL
    if (this.bones['UpperArmR'] && this.initialTransforms['UpperArmR']) {
      const initQ = this.initialTransforms['UpperArmR'].quaternion;
      const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.currentArmLiftR * 1.55);
      const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.currentArmLiftR * 0.70 + this.currentArmSweepR);
      this.bones['UpperArmR'].quaternion.copy(initQ).multiply(qZ).multiply(qX);
    }
    if (this.bones['LowerArmR'] && this.initialTransforms['LowerArmR']) {
      const initQ = this.initialTransforms['LowerArmR'].quaternion;
      const qElbow = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.currentElbowR);
      this.bones['LowerArmR'].quaternion.copy(initQ).multiply(qElbow);
    }

    // 2. Left Arm (UpperArmL + LowerArmL) - DIRECT FULL CONTROL
    if (this.bones['UpperArmL'] && this.initialTransforms['UpperArmL']) {
      const initQ = this.initialTransforms['UpperArmL'].quaternion;
      const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -this.currentArmLiftL * 1.55);
      const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.currentArmLiftL * 0.70 - this.currentArmSweepL);
      this.bones['UpperArmL'].quaternion.copy(initQ).multiply(qZ).multiply(qX);
    }
    if (this.bones['LowerArmL'] && this.initialTransforms['LowerArmL']) {
      const initQ = this.initialTransforms['LowerArmL'].quaternion;
      const qElbow = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.currentElbowL);
      this.bones['LowerArmL'].quaternion.copy(initQ).multiply(qElbow);
    }

    // 3. Cyber Fingers (Clench into fist / claws)
    const fingerBones = [
      'IndexR', 'Index2R', 'Middle1R', 'Middle2R', 'Ring1R', 'Ring2R', 'ThumbR', 'Thumb2R',
      'IndexL', 'Index2L', 'Middle1L', 'Middle2L', 'Ring1L', 'Ring2L', 'ThumbL', 'Thumb2L'
    ];
    fingerBones.forEach((name) => {
      if (this.bones[name] && this.initialTransforms[name]) {
        const initQ = this.initialTransforms[name].quaternion;
        const qCurl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.currentClench * 0.85);
        this.bones[name].quaternion.copy(initQ).multiply(qCurl);
      }
    });

    // 4. Head & Neck Interactive Look Tracking
    if (this.bones['Head'] && this.initialTransforms['Head']) {
      const initQ = this.initialTransforms['Head'].quaternion;
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.currentHeadPitch);
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.currentHeadYaw);
      this.bones['Head'].quaternion.copy(initQ).multiply(qPitch).multiply(qYaw);
    }

    // 5. Torso Tilt & Roll
    const torsoBone = this.bones['Torso_1'] || this.bones['Body'];
    if (torsoBone && this.initialTransforms[torsoBone.name]) {
      const initQ = this.initialTransforms[torsoBone.name].quaternion;
      const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.currentTorsoRoll);
      const qLean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.currentTorsoLean);
      torsoBone.quaternion.copy(initQ).multiply(qRoll).multiply(qLean);
    }

    // -------------------------------------------------------------------------
    // 4. ROOT PLATFORM ANCHORING, ELEVATION (UP) & ROTATION (ROTATE)
    // -------------------------------------------------------------------------
    if (primaryHand && primaryHand.detected) {
      const handX = (handCount >= 2 && dual) ? dual.avgX : primaryHand.x;
      const handSize = (handCount >= 2 && dual) ? dual.avgSize : primaryHand.size;

      if (this.trackingMode === 'mirror') {
        const horizGlide = (handX - 0.50) * 0.40;
        const depthTravel = THREE.MathUtils.clamp((handSize - 0.20) * 1.1, -0.35, 0.5);
        this.targetOffset.set(horizGlide, targetElevation + this.targetHeight + walkBob, depthTravel);
        this.targetRotY = targetBodyRotate;
        this.targetRollZ = 0.0;
        this.targetScale = this.baseScale;
      } else {
        // Centered pivot
        this.targetOffset.set(0, targetElevation + this.targetHeight + walkBob, 0);
        this.targetRotY = targetBodyRotate;
        this.targetRollZ = 0.0;
        this.targetScale = this.baseScale;
      }

      const isFist = (handCount >= 2 && dual && dual.isTwoFists) || primaryHand.isFist;
      const isPinch = (leftHand && leftHand.isPinching) || (rightHand && rightHand.isPinching) || primaryHand.isPinching;

      if (isFist) {
        this.torsoReticle.material.color.setHex(0xff3366);
      } else if (isPeace) {
        this.torsoReticle.material.color.setHex(0x00f0ff);
      } else if (isPinch) {
        this.torsoReticle.material.color.setHex(0xffaa22);
      } else {
        this.torsoReticle.material.color.setHex(0x00f0ff);
      }

    } else {
      // Idle floating when no hand present
      this.targetOffset.set(0, Math.sin(time * 1.8) * 0.025, 0);
      this.targetScale = this.baseScale;
      this.targetRotY = Math.sin(time * 0.6) * 0.05;
      this.targetRollZ = 0.0;
    }

    // Smooth root position, scale, and rotations with critically damped filter
    this.root.position.x += ((this.baseX + this.targetOffset.x) - this.root.position.x) * rootK;
    this.root.position.y += ((this.baseY + this.targetOffset.y) - this.root.position.y) * rootK;
    this.root.position.z += ((this.baseZ + this.targetOffset.z) - this.root.position.z) * rootK;

    const curScale = THREE.MathUtils.lerp(this.root.scale.x, this.targetScale, rootK);
    this.root.scale.set(curScale, curScale, curScale);
    this.root.rotation.y += (this.targetRotY - this.root.rotation.y) * rootK;
    this.root.rotation.z += (this.targetRollZ - this.root.rotation.z) * rootK;
  }

  /**
   * Attachment points for 10-Tether Bezier Loom directly from Android bones
   */
  getAttachmentPoints() {
    const a0 = new THREE.Vector3();
    const a1 = new THREE.Vector3();
    const a2 = new THREE.Vector3();
    const a3 = new THREE.Vector3();
    const a4 = new THREE.Vector3();

    const getBonePos = (name, def) => {
      const b = this.bones[name] || this.bones[name.replace(/[\._]/g, '')];
      if (b) {
        const v = new THREE.Vector3();
        b.getWorldPosition(v);
        return v;
      }
      return def ? def.clone() : this.root.position.clone();
    };

    const posRArm = getBonePos('Palm1R', getBonePos('LowerArmR', this.root.position));
    const posLArm = getBonePos('Palm1L', getBonePos('LowerArmL', this.root.position));
    const posLegR = getBonePos('FootR', getBonePos('LowerLegR', this.root.position));
    const posLegL = getBonePos('FootL', getBonePos('LowerLegL', this.root.position));
    const posTorso = getBonePos('Torso_1', getBonePos('Body', this.root.position));
    const posHead = getBonePos('Head', this.root.position);

    a0.copy(posRArm); // Thumb -> Right Arm / Hand
    a1.copy(posLArm); // Index -> Left Arm / Hand
    a2.copy(posLegR); // Middle -> Leg / Walk
    a3.copy(posTorso); // Ring -> Body / Torso
    a4.copy(posHead);  // Pinky -> Head / Elevation

    const leftArmShoulder = getBonePos('ShoulderL', posLArm);
    const leftArmUpper = getBonePos('UpperArmL', posLArm);
    const leftArmLower = getBonePos('LowerArmL', posLArm);

    const rightArmShoulder = getBonePos('ShoulderR', posRArm);
    const rightArmUpper = getBonePos('UpperArmR', posRArm);
    const rightArmLower = getBonePos('LowerArmR', posRArm);

    return {
      thumb: a0,
      index: a1,
      middle: a2,
      ring: a3,
      pinky: a4,
      leftSide: [
        leftArmShoulder,
        leftArmUpper,
        leftArmLower,
        posLArm,
        posLegL
      ],
      rightSide: [
        rightArmShoulder,
        rightArmUpper,
        rightArmLower,
        posRArm,
        posLegR
      ]
    };
  }
}
