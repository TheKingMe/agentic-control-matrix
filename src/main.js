import * as THREE from 'three';
import { RobotMech } from './robot.js';
import { HandTracker } from './handTracker.js';
import { PuppetStrings } from './puppetStrings.js';
import { AgentBrain } from './agentBrain.js';
import { HUDController } from './hud.js';

/* =============================================================================
   AGENTIC CONTROL MATRIX // MAIN BOOTSTRAP ENGINE
   Replicates the exact Sci-Fi Holographic Interface from the Blueprint
   ============================================================================= */

const video = document.getElementById('webcam');
const sceneCanvas = document.getElementById('scene-canvas');
const stringsCanvas = document.getElementById('strings-canvas');
const terminalBody = document.getElementById('terminal-body');
const startModal = document.getElementById('start-modal');
const modalStatus = document.getElementById('modal-status');
const btnStartCam = document.getElementById('btn-start-camera');
const btnStartDemo = document.getElementById('btn-start-demo');

let isWebcamMode = true;
let lastFrameTime = performance.now();
let frameCounter = 0;
let lastFpsUpdate = performance.now();

// Zoom state - Reduced zoom by default (further back, plenty of room)
let cameraBaseZ = 5.2;
let cameraTargetZ = 5.2;
let zoomLevels = [
  { label: 'ZOOM: 0.8x (WIDE DEFAULT)', z: 5.2 },
  { label: 'ZOOM: 1.1x (MEDIUM)', z: 4.2 },
  { label: 'ZOOM: 1.4x (CLOSE)', z: 3.3 }
];
let currentZoomIdx = 0;

// -----------------------------------------------------------------------------
// 1. THREE.JS HERO SCENE SETUP
// -----------------------------------------------------------------------------
const scene = new THREE.Scene();

// Camera setup: Reduced zoom, centered on robot stage with 44 FOV
const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.08, cameraBaseZ);
camera.lookAt(0, 0.0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas: sceneCanvas,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Sci-Fi Hologram Cyberpunk Lighting
const ambientLight = new THREE.AmbientLight(0x1a2444, 2.0);
scene.add(ambientLight);

const dirLightCyan = new THREE.DirectionalLight(0x00f0ff, 2.6);
dirLightCyan.position.set(4, 5, 4);
scene.add(dirLightCyan);

const dirLightAmber = new THREE.DirectionalLight(0xffaa22, 2.2);
dirLightAmber.position.set(-4, -1, 3);
scene.add(dirLightAmber);

// Dynamic Window Resize Handler with Auto-Framing
function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;

  // If narrow aspect ratio, pull camera back slightly so robot is never clipped
  const aspectCompensation = Math.max(1.0, 1.45 / Math.max(camera.aspect, 0.5));
  cameraTargetZ = zoomLevels[currentZoomIdx].z * aspectCompensation;

  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onWindowResize);

// Smooth Mouse Wheel Zoom
window.addEventListener('wheel', (e) => {
  cameraTargetZ = THREE.MathUtils.clamp(cameraTargetZ + e.deltaY * 0.003, 2.2, 5.8);
}, { passive: true });

// -----------------------------------------------------------------------------
// 2. SUBSYSTEM INITIALIZATION
// -----------------------------------------------------------------------------
const robot = new RobotMech(scene);
const puppetStrings = new PuppetStrings(scene, camera, stringsCanvas);
const handTracker = new HandTracker(video);

const agentBrain = new AgentBrain(terminalBody, (newStatus) => {
  hud.setStatus(newStatus);
});

const hud = new HUDController({
  onToggleStrings: (enabled) => {
    puppetStrings.enabled = enabled;
  },
  onToggleTerminal: (enabled) => {
    // Handled by CSS
  },
  onToggleCards: (enabled) => {
    // Handled by CSS
  },
  onToggleModel: (mode) => {
    robot.setModelMode(mode);
    agentBrain.appendLine(`>> ACTIVE MODEL: ${mode.toUpperCase()}`, "sys");
  },
  onToggleTracking: (mode) => {
    robot.setTrackingMode(mode);
    agentBrain.appendLine(`>> TRACKING MODE: ${mode.toUpperCase()}`, "sys");
  },
  onToggleZoom: (btn) => {
    currentZoomIdx = (currentZoomIdx + 1) % zoomLevels.length;
    btn.textContent = zoomLevels[currentZoomIdx].label;
    onWindowResize();
  },
  onModeChange: (mode) => {
    agentBrain.setMode(mode);
  },
  onApiKeyChange: (key) => {
    agentBrain.setApiKey(key);
  },
  onToggleFeed: () => {
    toggleFeedSource();
  },
  onResetRobot: () => {
    robot.targetOffset.set(0, 0, 0);
    robot.targetScale = 0.70;
    robot.targetRotY = 0.0;
    robot.targetTorsoYaw = 0.0;
    cameraTargetZ = 5.2;
    currentZoomIdx = 0;
    const zoomBtn = document.getElementById('btn-toggle-zoom');
    if (zoomBtn) zoomBtn.textContent = 'ZOOM: 0.8x (WIDE DEFAULT)';
    agentBrain.appendLine(">> ROBOT CAMERA & POSE RE-CENTERED", "warn");
  }
});

// Wire HandTracker Gestures to AgentBrain
handTracker.onGestureAction = (gestureType, statusHint) => {
  agentBrain.handleGestureInstruction(gestureType, statusHint);
};

// -----------------------------------------------------------------------------
// 3. VIDEO FEED MANAGEMENT (Webcam, DroidCam & Demo Video Fallback)
// -----------------------------------------------------------------------------
let availableVideoDevices = [];
let currentCameraDeviceId = localStorage.getItem('preferred_cam_id') || null;

async function refreshCameraDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableVideoDevices = devices.filter(d => d.kind === 'videoinput');

    const startSelect = document.getElementById('start-camera-select');
    const settingsSelect = document.getElementById('settings-camera-select');
    const camBtn = document.getElementById('btn-toggle-cam-device');
    const modalList = document.getElementById('camera-device-list');

    const populate = (sel) => {
      if (!sel) return;
      sel.innerHTML = '';
      if (availableVideoDevices.length === 0) {
        sel.innerHTML = '<option value="">Default System Camera</option>';
        return;
      }

      availableVideoDevices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        const label = dev.label || `Camera ${idx + 1}`;
        const isDroid = /droid/i.test(label);
        const isOBS = /obs/i.test(label);
        opt.textContent = isDroid ? `⭐ ${label} (DroidCam Recommended)` : (isOBS ? `🎥 ${label}` : label);
        sel.appendChild(opt);
      });
    };

    populate(startSelect);
    populate(settingsSelect);

    // Populate interactive cards in the Camera Selection Modal
    if (modalList) {
      modalList.innerHTML = '';
      availableVideoDevices.forEach((dev) => {
        const card = document.createElement('div');
        const isDroid = /droid/i.test(dev.label);
        const isOBS = /obs/i.test(dev.label);
        const isActive = dev.deviceId === currentCameraDeviceId;

        card.className = `camera-device-card ${isActive ? 'active' : ''}`;

        let icon = '💻';
        let typeTag = 'INTEGRATED WEBCAM';
        if (isDroid) { icon = '📱'; typeTag = 'PHONE WEBCAM (DROIDCAM)'; }
        else if (isOBS) { icon = '🎥'; typeTag = 'OBS VIRTUAL CAMERA'; }

        card.innerHTML = `
          <div class="cam-title">
            <span style="font-size: 18px;">${icon}</span>
            <div>
              <div style="font-size: 12px; font-weight: bold; color: #ffffff;">${dev.label || 'Video Device'}</div>
              <div style="font-size: 9px; color: #79a7c7; margin-top: 2px;">${typeTag}</div>
            </div>
          </div>
          <div class="cam-status">
            ${isActive ? '<strong style="color: var(--neon-green)">● CONNECTED</strong>' : '<span style="color: var(--neon-cyan)">CLICK TO SWITCH ➔</span>'}
          </div>
        `;

        card.addEventListener('click', () => {
          switchCamera(dev.deviceId, dev.label);
        });

        modalList.appendChild(card);
      });
    }

    // Auto-detect DroidCam if not explicitly set
    const droidCam = availableVideoDevices.find(d => /droid/i.test(d.label));
    if (!currentCameraDeviceId && droidCam) {
      currentCameraDeviceId = droidCam.deviceId;
    }

    if (currentCameraDeviceId) {
      if (startSelect) startSelect.value = currentCameraDeviceId;
      if (settingsSelect) settingsSelect.value = currentCameraDeviceId;
    }

    // Update Dock Button Text
    const activeDev = availableVideoDevices.find(d => d.deviceId === currentCameraDeviceId) || availableVideoDevices[0];
    if (camBtn) {
      if (activeDev) {
        const isDroid = /droid/i.test(activeDev.label);
        const isOBS = /obs/i.test(activeDev.label);
        let prefix = '📷';
        if (isDroid) prefix = '📱 DROIDCAM';
        else if (isOBS) prefix = '🎥 OBS CAM';
        else prefix = '💻 WEBCAM';
        camBtn.textContent = prefix;
        camBtn.classList.toggle('highlight', isDroid || isOBS);
      } else {
        camBtn.textContent = '📷 CAM: SELECT';
      }
    }
  } catch (err) {
    console.warn('Could not enumerate cameras:', err);
  }
}

async function startWebcam(requestedDeviceId = null) {
  modalStatus.textContent = 'STATUS: REQUESTING CAMERA PERMISSION...';
  try {
    if (video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(t => t.stop());
    }

    const targetId = requestedDeviceId || currentCameraDeviceId;
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        deviceId: targetId ? { ideal: targetId } : undefined,
        facingMode: targetId ? undefined : 'user'
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    isWebcamMode = true;
    updateFeedButtonText('FEED: WEBCAM');
    hideStartModal();

    await refreshCameraDevices();
    agentBrain.appendLine(`>> CAMERA ONLINE: ${video.videoWidth}x${video.videoHeight}`, "sys");
  } catch (err) {
    console.warn('Webcam permission or device error:', err);
    if (requestedDeviceId) {
      currentCameraDeviceId = null;
      localStorage.removeItem('preferred_cam_id');
      return startWebcam(null);
    }
    modalStatus.textContent = 'CAMERA UNAVAILABLE // PLEASE CONNECT A CAMERA';
  }
}

async function switchCamera(deviceId, deviceLabel = '') {
  const alertBox = document.getElementById('camera-in-use-alert');
  const alertDetail = document.getElementById('camera-error-detail');
  if (alertBox) alertBox.classList.add('hidden');

  try {
    if (video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(t => t.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    isWebcamMode = true;
    currentCameraDeviceId = deviceId;
    localStorage.setItem('preferred_cam_id', deviceId);

    updateFeedButtonText('FEED: WEBCAM');
    document.getElementById('camera-modal')?.classList.add('hidden');
    await refreshCameraDevices();

    agentBrain.appendLine(`>> CAMERA CONNECTED: ${deviceLabel || 'ONLINE'}`, "sys");
    return true;
  } catch (err) {
    console.warn('Cannot open camera:', deviceId, deviceLabel, err);
    if (alertBox && alertDetail) {
      alertBox.classList.remove('hidden');
      if (/droid/i.test(deviceLabel)) {
        alertDetail.innerHTML = `<strong>DroidCam is locked by OBS Studio!</strong><br>• In OBS Studio, click <strong>"Start Virtual Camera"</strong> (bottom-right Controls) and select <strong>OBS Virtual Camera</strong> in this list.<br>• OR close OBS Studio to free DroidCam for Chrome.`;
      } else if (/obs/i.test(deviceLabel)) {
        alertDetail.innerHTML = `<strong>OBS Virtual Camera is not running!</strong><br>In OBS Studio, click the <strong>"Start Virtual Camera"</strong> button on the bottom-right Controls panel.`;
      } else {
        alertDetail.textContent = `Could not open camera: ${err.message || 'Device in use or busy'}`;
      }
    }
    // Maintain whatever camera is working
    startWebcam(null);
    return false;
  }
}

function toggleFeedSource() {
  startWebcam();
}

function hideStartModal() {
  if (startModal) {
    startModal.classList.add('hidden');
    startModal.style.display = 'none';
  }
}

function updateFeedButtonText(text) {
  const btn = document.getElementById('btn-toggle-feed');
  if (btn) btn.textContent = text;
}

btnStartCam?.addEventListener('click', () => startWebcam(currentCameraDeviceId));
btnStartDemo?.addEventListener('click', startDemoStream);

document.getElementById('start-camera-select')?.addEventListener('change', (e) => {
  switchCamera(e.target.value);
});

document.getElementById('settings-camera-select')?.addEventListener('change', (e) => {
  switchCamera(e.target.value);
});

document.getElementById('btn-toggle-cam-device')?.addEventListener('click', async () => {
  await refreshCameraDevices();
  document.getElementById('camera-modal')?.classList.remove('hidden');
});

document.getElementById('btn-close-camera-modal')?.addEventListener('click', () => {
  document.getElementById('camera-modal')?.classList.add('hidden');
});

// Enumerate cameras on startup
refreshCameraDevices();
navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameraDevices);

// Check if autostart requested via query param (e.g. ?autostart=demo)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('camera_modal') === '1') {
  refreshCameraDevices();
  document.getElementById('camera-modal')?.classList.remove('hidden');
}
if (urlParams.get('guide') === '1') {
  document.getElementById('guide-modal')?.classList.remove('hidden');
}
if (urlParams.get('model') === 'gltf') {
  robot.setModelMode('gltf');
  const btnModel = document.getElementById('btn-toggle-model');
  if (btnModel) btnModel.textContent = 'MODEL: GLTF ANDROID';
}
// Automatically start webcam immediately on page load
setTimeout(() => startWebcam(currentCameraDeviceId), 150);

// -----------------------------------------------------------------------------
// 4. MAIN ANIMATION & RENDER LOOP
// -----------------------------------------------------------------------------
function animate(now) {
  requestAnimationFrame(animate);

  const deltaSeconds = (now - lastFrameTime) * 0.001;
  lastFrameTime = now;
  const time = now * 0.001;

  // FPS Counter
  frameCounter++;
  if (now - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCounter * 1000) / (now - lastFpsUpdate));
    hud.updateFPS(fps);
    frameCounter = 0;
    lastFpsUpdate = now;
  }

  // Smooth Camera Zoom
  camera.position.z += (cameraTargetZ - camera.position.z) * 0.12;

  // 1. Process Vision & Hand Landmarks
  const handState = handTracker.update(now, deltaSeconds);
  hud.setTrackerOnline(handState && handState.detected, handTracker.handCount);

  // 2. Update Robot Kinematics (Dual-Hand + Single-Hand Kinematics)
  robot.update(handTracker, time, deltaSeconds);

  // 3. Render 3D Scene
  renderer.render(scene, camera);

  // 4. Render Strings, Lasers & Fingertip Reticles (Dual-Hand 10-Tethers or Single)
  if (handTracker.handCount > 0) {
    const robotAnchors = robot.getAttachmentPoints();
    puppetStrings.render(handTracker, robotAnchors, time);
  } else {
    puppetStrings.clear();
  }

  // 5. Update Debug Curl Bars
  hud.updateCurls(handTracker.curls);

  // 6. Update Blueprint Hologram Cards
  hud.updateBlueprintCards(handState, robot, handTracker);
}

// Initialize MediaPipe and bootstrap render loop
handTracker.init().then(() => {
  hud.setTrackerOnline(false);
  modalStatus.textContent = 'SYSTEM READY // CHOOSE INPUT FEED';
});

requestAnimationFrame(animate);
