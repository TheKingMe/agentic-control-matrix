/**
 * HologramScene - Three.js WebGL Holographic 3D Subsystem
 * Renders the 3D Animated Robot / Cyber Mech directly inside the Left Holographic Window,
 * with full GLTF model loading, animation mixing (Idle, Wave, Dance, Punch), procedural models,
 * custom holographic scanline/Fresnel shaders, gaze tracking, and drag-and-drop 3D file support.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class HologramScene {
  constructor(canvasElement, mechCanvasElement) {
    this.fullscreenCanvas = canvasElement;
    this.mechCanvas = mechCanvasElement || document.getElementById('mech-canvas');

    // 1. Fullscreen Atmospheric Particles Scene
    this.initFullscreenScene();

    // 2. Dedicated 3D Holographic Robot Viewport Scene
    this.initMechScene();

    // State
    this.currentModelType = 'animated-robot'; // 'animated-robot' | 'cyber-mech' | 'drone' | 'custom'
    this.shadingMode = 'texture'; // 'texture' | 'holo' | 'wire' - default to texture so robot face and metallic shaders are vivid
    this.currentActionName = 'Idle';

    // Animation & Mixers
    this.mixer = null;
    this.animationsMap = new Map();
    this.clock = new THREE.Clock();

    // Robot Interactive Rotation & Zoom
    this.targetRotY = 0;
    this.currentRotY = 0;
    this.targetRotX = 0;
    this.currentRotX = 0;
    this.targetZoom = 1.0;
    this.currentZoom = 1.0;

    // Build procedural cyber mech immediately so viewport is NEVER blank
    this.buildProceduralMech();

    // Load animated GLTF robot model asynchronously
    this.loadBuiltinRobot();
    this.initMouseOrbit();
    this.initDragAndDrop();
    this.initResizeListeners();
  }

  /* ========================================================================
     1. FULLSCREEN SCENE (Atmospheric dust, depth field)
     ======================================================================== */
  initFullscreenScene() {
    this.fsWidth = window.innerWidth;
    this.fsHeight = window.innerHeight;

    this.fsRenderer = new THREE.WebGLRenderer({
      canvas: this.fullscreenCanvas,
      alpha: true,
      antialias: true
    });
    this.fsRenderer.setSize(this.fsWidth, this.fsHeight);
    this.fsRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.fsScene = new THREE.Scene();
    this.fsCamera = new THREE.PerspectiveCamera(50, this.fsWidth / this.fsHeight, 1, 3000);
    this.fsCamera.position.z = 800;

    // Floating cyber dust particles
    const count = 120;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 1200;
      pos[i + 1] = (Math.random() - 0.5) * 800;
      pos[i + 2] = (Math.random() - 0.5) * 500;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 3,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    this.fsParticles = new THREE.Points(geom, mat);
    this.fsScene.add(this.fsParticles);
  }

  /* ========================================================================
     2. ROBOT VIEWPORT SCENE (Dedicated inside Left Window)
     ======================================================================== */
  initMechScene() {
    const parent = this.mechCanvas.parentElement;
    this.mechWidth = parent ? (parent.clientWidth || 360) : 360;
    this.mechHeight = parent ? (parent.clientHeight || 420) : 420;

    this.mechRenderer = new THREE.WebGLRenderer({
      canvas: this.mechCanvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.mechRenderer.setSize(this.mechWidth, this.mechHeight, false);
    this.mechRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mechRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.mechScene = new THREE.Scene();

    // Perspective Camera centered on Robot
    this.mechCamera = new THREE.PerspectiveCamera(40, this.mechWidth / this.mechHeight, 0.1, 1000);
    this.mechCamera.position.set(0, 0, 190);
    this.mechCamera.lookAt(0, 0, 0);

    // Bright, high-contrast dynamic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    this.mechScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x00f0ff, 3.0);
    keyLight.position.set(120, 180, 150);
    this.mechScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffaa22, 2.5);
    rimLight.position.set(-150, -60, 100);
    this.mechScene.add(rimLight);

    const coreLight = new THREE.PointLight(0x00f0ff, 3.5, 300);
    coreLight.position.set(0, 5, 50);
    this.mechScene.add(coreLight);
    this.coreLight = coreLight;

    // Root container for all robot models
    this.robotContainer = new THREE.Group();
    this.mechScene.add(this.robotContainer);

    // Orbiting Holographic Rings
    this.initHoloRings();
  }

  initHoloRings() {
    this.ringsGroup = new THREE.Group();

    // Ring 1: Outer cyan radar ring
    const ring1Geom = new THREE.RingGeometry(68, 70, 48);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    this.ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
    this.ring1.rotation.x = Math.PI / 2.2;
    this.ringsGroup.add(this.ring1);

    // Ring 2: Inner amber dashed ring
    const ring2Geom = new THREE.RingGeometry(52, 53.5, 6);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    this.ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
    this.ring2.rotation.x = Math.PI / 2.1;
    this.ringsGroup.add(this.ring2);

    this.mechScene.add(this.ringsGroup);
  }

  /* ========================================================================
     3. HOLOGRAPHIC MATERIALS (Robust for Skinned & Static Meshes)
     ======================================================================== */
  createHoloMaterial(baseColorHex = 0x00f0ff, isWireframe = false) {
    return new THREE.MeshStandardMaterial({
      color: baseColorHex,
      emissive: isWireframe ? baseColorHex : 0x003344,
      emissiveIntensity: 0.5,
      metalness: 0.5,
      roughness: 0.3,
      wireframe: isWireframe,
      transparent: isWireframe,
      opacity: isWireframe ? 0.75 : 1.0,
      side: THREE.DoubleSide
    });
  }

  /* ========================================================================
     4. MODEL LOADERS: BUILT-IN ANIMATED ROBOT & PROCEDURAL MECH
     ======================================================================== */
  async loadBuiltinRobot() {
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync('./assets/models/robot.glb');
      
      this.clearRobotContainer();
      const model = gltf.scene;
      
      // Auto-fit to viewport
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 95 / maxDim;
      model.scale.set(scale, scale, scale);

      // Center model directly at origin so it floats dead-center inside holographic rings
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.x = -center.x * scale;
      model.position.y = -center.y * scale;
      model.position.z = -center.z * scale;

      // Setup Animation Mixer
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        this.animationsMap.clear();

        gltf.animations.forEach(clip => {
          const action = this.mixer.clipAction(clip);
          this.animationsMap.set(clip.name, action);
        });

        // Start with Walking animation so robot is stepping in active motion like the video!
        this.playAction('Walking');
      }

      this.activeModel = model;
      this.cachedMaterials = [];
      model.traverse(node => {
        if (node.isMesh) {
          this.cachedMaterials.push({ mesh: node, origMat: node.material });
        }
      });

      this.applyShadingMode(this.shadingMode);

      this.robotContainer.add(model);
      this.currentModelType = 'animated-robot';
      this.updateHUDModelLabel('ANIMATED ROBOT');

    } catch (err) {
      console.warn("Failed to load robot.glb, using Procedural Cyber Mech:", err);
      this.buildProceduralMech();
    }
  }

  buildProceduralMech() {
    this.clearRobotContainer();

    const mech = new THREE.Group();
    const cyanMat = this.createHoloMaterial(0x00f0ff, false);
    const cyanWire = this.createHoloMaterial(0x00f0ff, true);
    const amberMat = this.createHoloMaterial(0xffaa22, false);

    // Torso & Chest Armor
    const chestGeom = new THREE.BoxGeometry(38, 48, 30);
    const chest = new THREE.Mesh(chestGeom, cyanMat);
    const chestWire = new THREE.Mesh(chestGeom, cyanWire);
    mech.add(chest, chestWire);

    // Glowing Arc Core
    const coreGeom = new THREE.SphereGeometry(10, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95
    });
    this.mechCore = new THREE.Mesh(coreGeom, coreMat);
    this.mechCore.position.set(0, 4, 15);
    mech.add(this.mechCore);

    // Head with Visor
    const headGeom = new THREE.BoxGeometry(24, 20, 24);
    const head = new THREE.Mesh(headGeom, cyanMat);
    head.position.set(0, 36, 0);

    const visorGeom = new THREE.BoxGeometry(20, 6, 6);
    const visor = new THREE.Mesh(visorGeom, amberMat);
    visor.position.set(0, 2, 12);
    head.add(visor);
    mech.add(head);
    this.mechHead = head;

    // Arms
    [-1, 1].forEach(side => {
      const arm = new THREE.Group();
      arm.position.set(side * 30, 16, 0);

      const shoulderGeom = new THREE.ConeGeometry(14, 18, 4);
      const shoulder = new THREE.Mesh(shoulderGeom, cyanMat);
      shoulder.rotation.z = side * -Math.PI / 2;
      arm.add(shoulder);

      const bicepGeom = new THREE.CylinderGeometry(4, 5, 24, 8);
      const bicep = new THREE.Mesh(bicepGeom, cyanMat);
      bicep.position.set(side * 4, -14, 0);
      arm.add(bicep);

      const clawGeom = new THREE.BoxGeometry(9, 24, 11);
      const claw = new THREE.Mesh(clawGeom, amberMat);
      claw.position.set(side * 4, -36, 4);
      arm.add(claw);

      if (side === -1) this.mechArmR = arm; else this.mechArmL = arm;
      mech.add(arm);
    });

    // Legs
    [-1, 1].forEach(side => {
      const leg = new THREE.Group();
      leg.position.set(side * 14, -30, 0);

      const thighGeom = new THREE.BoxGeometry(11, 28, 12);
      const thigh = new THREE.Mesh(thighGeom, cyanMat);
      thigh.position.set(0, -14, 0);
      leg.add(thigh);

      const footGeom = new THREE.BoxGeometry(12, 10, 22);
      const foot = new THREE.Mesh(footGeom, amberMat);
      foot.position.set(0, -32, 4);
      leg.add(foot);

      if (side === -1) this.mechLegR = leg; else this.mechLegL = leg;
      mech.add(leg);
    });

    mech.position.y = 8;
    this.robotContainer.add(mech);
    this.activeModel = mech;
    this.currentModelType = 'cyber-mech';
    this.updateHUDModelLabel('CYBER MECH T-800');
  }

  buildDroneSentinel() {
    this.clearRobotContainer();

    const drone = new THREE.Group();
    const cyanMat = this.createHoloMaterial(0x00f0ff, false);
    const amberMat = this.createHoloMaterial(0xffaa22, false);

    // Center Core Eye
    const coreGeom = new THREE.SphereGeometry(24, 24, 24);
    const core = new THREE.Mesh(coreGeom, cyanMat);
    drone.add(core);

    // Glowing Eye Lens
    const lensGeom = new THREE.CylinderGeometry(8, 8, 4, 16);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
    const lens = new THREE.Mesh(lensGeom, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 23;
    drone.add(lens);

    // Gyro Gimbal Rings
    this.droneGimbals = [];
    [36, 44, 52].forEach((r, idx) => {
      const ringGeom = new THREE.TorusGeometry(r, 1.6, 8, 36);
      const ringMat = idx % 2 === 0 ? cyanMat : amberMat;
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      drone.add(ringMesh);
      this.droneGimbals.push({ mesh: ringMesh, speed: (idx + 1) * 0.8 * (idx % 2 === 0 ? 1 : -1) });
    });

    this.robotContainer.add(drone);
    this.activeModel = drone;
    this.currentModelType = 'drone';
    this.updateHUDModelLabel('DRONE SENTINEL');
  }

  /* ========================================================================
     5. CUSTOM 3D MODEL LOADER (.GLB / .GLTF)
     ======================================================================== */
  async loadCustomFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const contents = e.target.result;
      const loader = new GLTFLoader();
      try {
        const gltf = await loader.parseAsync(contents, '');
        this.clearRobotContainer();

        const model = gltf.scene;

        // Auto-scale & center
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 75 / maxDim;
        model.scale.set(scale, scale, scale);

        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.x = -center.x * scale;
        model.position.y = -center.y * scale;
        model.position.z = -center.z * scale;

        // Setup Animations if present
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          this.animationsMap.clear();
          gltf.animations.forEach(clip => {
            this.animationsMap.set(clip.name, this.mixer.clipAction(clip));
          });
          const firstClip = gltf.animations[0].name;
          this.playAction(firstClip);
        }

        this.cachedMaterials = [];
        model.traverse(node => {
          if (node.isMesh) {
            this.cachedMaterials.push({ mesh: node, origMat: node.material });
          }
        });

        this.applyShadingMode(this.shadingMode);

        this.robotContainer.add(model);
        this.activeModel = model;
        this.currentModelType = 'custom';
        this.updateHUDModelLabel(file.name.toUpperCase().substring(0, 16));

      } catch (err) {
        console.error("Failed to parse custom 3D model:", err);
        alert("Error loading 3D model: Please upload a valid .glb or .gltf file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  clearRobotContainer() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.animationsMap.clear();
    while (this.robotContainer.children.length > 0) {
      const obj = this.robotContainer.children[0];
      this.robotContainer.remove(obj);
    }
    this.mechHead = null;
    this.mechCore = null;
    this.droneGimbals = null;
  }

  /* ========================================================================
     6. ACTIONS & SHADING MODES
     ======================================================================== */
  playAction(actionName) {
    if (!this.mixer || !this.animationsMap.has(actionName)) return;

    const newAction = this.animationsMap.get(actionName);
    if (this.currentAction && this.currentAction !== newAction) {
      this.currentAction.fadeOut(0.3);
    }
    newAction.reset().fadeIn(0.3).play();
    this.currentAction = newAction;
    this.currentActionName = actionName;

    const actionBtn = document.getElementById('btn-robot-action');
    if (actionBtn) {
      actionBtn.textContent = `ACT: ${actionName.toUpperCase()}`;
    }
  }

  cycleModel() {
    if (this.currentModelType === 'animated-robot') {
      this.buildProceduralMech();
    } else if (this.currentModelType === 'cyber-mech') {
      this.buildDroneSentinel();
    } else {
      this.loadBuiltinRobot();
    }
  }

  cycleShading() {
    const modes = ['holo', 'texture', 'wire'];
    const nextIdx = (modes.indexOf(this.shadingMode) + 1) % modes.length;
    this.applyShadingMode(modes[nextIdx]);
  }

  applyShadingMode(mode) {
    this.shadingMode = mode;
    const holoMat = this.createHoloMaterial(0x00f0ff, false);
    const wireMat = this.createHoloMaterial(0x00f0ff, true);

    if (this.cachedMaterials && this.cachedMaterials.length > 0) {
      this.cachedMaterials.forEach(({ mesh, origMat }) => {
        if (mode === 'holo') {
          mesh.material = holoMat;
        } else if (mode === 'wire') {
          mesh.material = wireMat;
        } else {
          mesh.material = origMat;
        }
      });
    }

    const btn = document.getElementById('btn-robot-shading');
    if (btn) btn.textContent = `FX: ${mode.toUpperCase()}`;
  }

  cycleAction() {
    if (!this.mixer || this.animationsMap.size === 0) return;
    const available = ['Idle', 'Walking', 'Wave', 'Dance', 'Punch', 'ThumbsUp'];
    const valid = available.filter(name => this.animationsMap.has(name));
    if (valid.length === 0) return;

    const currentIdx = valid.indexOf(this.currentActionName);
    const nextName = valid[(currentIdx + 1) % valid.length];
    this.playAction(nextName);
  }

  updateHUDModelLabel(label) {
    const el = document.getElementById('robot-model-name');
    if (el) el.textContent = label;
  }

  /* ========================================================================
     7. MOUSE ORBIT, ZOOM & DRAG-AND-DROP
     ======================================================================== */
  initMouseOrbit() {
    let isDragging = false;
    let prevX = 0, prevY = 0;

    this.mechCanvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      this.targetRotY += dx * 0.015;
      this.targetRotX += dy * 0.015;
      this.targetRotX = Math.max(-0.6, Math.min(0.6, this.targetRotX));
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    // Scroll to zoom
    this.mechCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetZoom += e.deltaY * -0.0015;
      this.targetZoom = Math.max(0.6, Math.min(2.2, this.targetZoom));
    }, { passive: false });
  }

  initDragAndDrop() {
    const container = this.mechCanvas.parentElement;
    ['dragenter', 'dragover'].forEach(name => {
      container.addEventListener(name, (e) => {
        e.preventDefault();
        container.style.boxShadow = '0 0 35px #00f0ff';
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      container.addEventListener(name, (e) => {
        e.preventDefault();
        container.style.boxShadow = '';
      });
    });

    container.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) {
          this.loadCustomFile(file);
        } else {
          alert('Please drop a valid .glb or .gltf 3D file.');
        }
      }
    });
  }

  rotateMech(deltaRad) {
    this.targetRotY += deltaRad;
  }

  /* ========================================================================
     8. RENDER LOOP
     ======================================================================== */
  render(timeMs, trackingPayload) {
    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Update Animation Mixer (Robot walking, waving, idling)
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // 2. Gesture-Driven Puppet Marionette Reactions!
    if (trackingPayload && trackingPayload.gestures && trackingPayload.gestures[0]) {
      const g = trackingPayload.gestures[0];
      if (g.isOpenPalm && this.currentActionName !== 'Wave' && this.animationsMap.has('Wave')) {
        this.playAction('Wave');
      } else if (g.isPinching && this.currentActionName !== 'ThumbsUp' && this.animationsMap.has('ThumbsUp')) {
        this.playAction('ThumbsUp');
      } else if (!g.isOpenPalm && !g.isPinching && this.currentActionName !== 'Walking' && this.animationsMap.has('Walking')) {
        this.playAction('Walking');
      }
    }

    // Procedural Cyber Mech walking & arm swinging!
    if (this.mechArmL && this.mechArmR) {
      const walkSpeed = time * 4.5;
      this.mechArmL.rotation.x = Math.sin(walkSpeed) * 0.55;
      this.mechArmR.rotation.x = -Math.sin(walkSpeed) * 0.55;
      if (this.mechLegL && this.mechLegR) {
        this.mechLegL.rotation.x = -Math.sin(walkSpeed) * 0.45;
        this.mechLegR.rotation.x = Math.sin(walkSpeed) * 0.45;
      }
    }

    // 3. Update Procedural Animations (Gimbals, Core Pulse, Rings)
    if (this.droneGimbals) {
      this.droneGimbals.forEach(g => {
        g.mesh.rotation.x += g.speed * delta;
        g.mesh.rotation.y += g.speed * 0.7 * delta;
      });
    }

    if (this.mechCore) {
      const coreScale = 1.0 + Math.sin(time * 5.0) * 0.18;
      this.mechCore.scale.set(coreScale, coreScale, coreScale);
    }

    if (this.coreLight) {
      this.coreLight.intensity = 2.5 + Math.sin(time * 5.0) * 1.0;
    }

    // Rotate Holo Rings
    if (this.ring1) this.ring1.rotation.z += 0.8 * delta;
    if (this.ring2) this.ring2.rotation.z -= 0.5 * delta;

    // 4. Smooth Rotation & Zoom Interpolation
    this.currentRotY = THREE.MathUtils.lerp(this.currentRotY, this.targetRotY, 0.1);
    this.currentRotX = THREE.MathUtils.lerp(this.currentRotX, this.targetRotX, 0.1);
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, 0.1);

    this.robotContainer.rotation.y = this.currentRotY + Math.sin(time * 0.8) * 0.1;
    this.robotContainer.rotation.x = this.currentRotX;
    this.robotContainer.scale.set(this.currentZoom, this.currentZoom, this.currentZoom);

    // Marionette Puppet tracking: Hand Y movement controls robot vertical bobbing & jumping!
    let targetHoverY = Math.sin(time * 2.2) * 3.5;
    if (trackingPayload && trackingPayload.hands && trackingPayload.hands[0]) {
      const wrist = trackingPayload.hands[0][0];
      const handOffsetY = (0.5 - wrist.y) * 45.0; // Hand up -> Robot jumps up!
      targetHoverY += handOffsetY;

      // Robot turns to face user's hand position across screen
      const handOffsetX = (wrist.x - 0.5) * 1.6;
      this.targetRotY = THREE.MathUtils.lerp(this.targetRotY, handOffsetX, 0.1);
    }
    this.robotContainer.position.y = THREE.MathUtils.lerp(this.robotContainer.position.y, targetHoverY, 0.15);

    // Head tracking finger if available
    if (this.mechHead && trackingPayload && trackingPayload.hands && trackingPayload.hands[0]) {
      const indexTip = trackingPayload.hands[0][8];
      const targetLookX = (indexTip.x - 0.5) * 0.8;
      const targetLookY = (indexTip.y - 0.5) * 0.6;
      this.mechHead.rotation.y = THREE.MathUtils.lerp(this.mechHead.rotation.y, targetLookX, 0.1);
      this.mechHead.rotation.x = THREE.MathUtils.lerp(this.mechHead.rotation.x, -targetLookY, 0.1);
    }

    // 5. Render Robot Viewport
    this.mechRenderer.render(this.mechScene, this.mechCamera);

    // 6. Render Fullscreen Atmosphere
    if (this.fsParticles) {
      this.fsParticles.rotation.y = time * 0.02;
    }
    this.fsRenderer.render(this.fsScene, this.fsCamera);
  }

  setMechScreenPosition(x, y) {
    // Window position handled naturally by DOM element
  }

  initResizeListeners() {
    window.addEventListener('resize', () => {
      this.fsWidth = window.innerWidth;
      this.fsHeight = window.innerHeight;
      this.fsRenderer.setSize(this.fsWidth, this.fsHeight);
      this.fsCamera.aspect = this.fsWidth / this.fsHeight;
      this.fsCamera.updateProjectionMatrix();

      const rect = this.mechCanvas.parentElement.getBoundingClientRect();
      this.mechWidth = rect.width || 360;
      this.mechHeight = rect.height || 420;
      this.mechRenderer.setSize(this.mechWidth, this.mechHeight);
      this.mechCamera.aspect = this.mechWidth / this.mechHeight;
      this.mechCamera.updateProjectionMatrix();
    });
  }
}
