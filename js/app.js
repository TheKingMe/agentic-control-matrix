/**
 * App - Master Controller & Application Orchestrator
 * Coordinates Vision, Hologram WebGL Scene, Spline Filaments, HUD Windows, and Audio.
 */

import { audioEngine } from './audioEngine.js';
import { VisionEngine } from './visionEngine.js';
import { HologramScene } from './hologramScene.js';
import { FilamentEngine } from './filamentEngine.js';
import { HUDEngine } from './hudEngine.js';

class Application {
  constructor() {
    // DOM references
    this.video = document.getElementById('webcam-video');
    this.webglCanvas = document.getElementById('webgl-canvas');
    this.hudCanvas = document.getElementById('hud-canvas');
    this.modalBackdrop = document.getElementById('permission-modal');
    this.modalStatus = document.getElementById('modal-status');
    this.btnStartCam = document.getElementById('btn-start-cam');
    this.btnStartDemo = document.getElementById('btn-start-demo');

    // Controls
    this.btnToggleAudio = document.getElementById('btn-toggle-audio');
    this.btnToggleMirror = document.getElementById('btn-toggle-mirror');
    this.btnCyclePalette = document.getElementById('btn-cycle-palette');
    this.btnResetWindows = document.getElementById('btn-reset-windows');
    this.btnSwitchMode = document.getElementById('btn-switch-mode');

    // Robot Window Controls
    this.btnCycleModel = document.getElementById('btn-cycle-model');
    this.btnRobotAction = document.getElementById('btn-robot-action');
    this.btnRobotShading = document.getElementById('btn-robot-shading');
    this.btnLoadCustom = document.getElementById('btn-load-custom');
    this.gltfFileInput = document.getElementById('gltf-file-input');

    // State
    this.isMirrored = true;
    this.palettes = ['gold', 'cyan', 'emerald'];
    this.paletteIndex = 0;

    // Subsystems
    this.vision = new VisionEngine(this.video, { isMirrored: this.isMirrored });
    this.hologramScene = new HologramScene(this.webglCanvas, document.getElementById('mech-canvas'));
    this.filamentEngine = new FilamentEngine(this.hudCanvas);
    this.hud = new HUDEngine(this.hologramScene);

    this.isRunning = false;

    this.initUI();
  }

  initUI() {
    // Modal Start Buttons
    this.btnStartCam.addEventListener('click', () => this.boot(false));
    this.btnStartDemo.addEventListener('click', () => this.boot(true));

    // Robot Window Controls
    if (this.btnCycleModel) {
      this.btnCycleModel.addEventListener('click', () => {
        this.hologramScene.cycleModel();
        audioEngine.playPinchGrab();
      });
    }

    if (this.btnRobotAction) {
      this.btnRobotAction.addEventListener('click', () => {
        this.hologramScene.cycleAction();
        audioEngine.playPinchGrab();
      });
    }

    if (this.btnRobotShading) {
      this.btnRobotShading.addEventListener('click', () => {
        this.hologramScene.cycleShading();
        audioEngine.playPinchRelease();
      });
    }

    if (this.btnLoadCustom && this.gltfFileInput) {
      this.btnLoadCustom.addEventListener('click', () => {
        this.gltfFileInput.click();
      });

      this.gltfFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.hologramScene.loadCustomFile(e.target.files[0]);
          audioEngine.playBootChime();
        }
      });
    }

    // Audio SFX Toggle
    this.btnToggleAudio.addEventListener('click', () => {
      audioEngine.ensureContext();
      const muted = audioEngine.toggleMute();
      this.btnToggleAudio.classList.toggle('active', !muted);
      this.btnToggleAudio.querySelector('span').textContent = muted ? 'SFX: MUTED' : 'SFX: ACTIVE';
    });

    // Mirror Toggle
    this.btnToggleMirror.addEventListener('click', () => {
      this.isMirrored = !this.isMirrored;
      this.vision.setMirrored(this.isMirrored);
      this.video.classList.toggle('unmirrored', !this.isMirrored);
      this.btnToggleMirror.classList.toggle('active', this.isMirrored);
      audioEngine.playPinchRelease();
    });

    // Color Palette Cycle
    this.btnCyclePalette.addEventListener('click', () => {
      this.paletteIndex = (this.paletteIndex + 1) % this.palettes.length;
      const p = this.palettes[this.paletteIndex];
      this.filamentEngine.setPalette(p);
      this.btnCyclePalette.querySelector('span').textContent = `THEME: ${p.toUpperCase()}`;
      audioEngine.playPinchGrab();
    });

    // Reset Windows
    this.btnResetWindows.addEventListener('click', () => {
      this.hud.resetWindowPositions();
    });

    // Switch Mode (Live / Demo)
    this.btnSwitchMode.addEventListener('click', async () => {
      audioEngine.ensureContext();
      if (!this.vision.isStreaming || this.vision.isDemoMode) {
        await this.activateCamera();
      } else {
        await this.vision.startDemoVideo("assets/demo.mp4");
        this.btnSwitchMode.querySelector('span').textContent = 'FEED: DEMO REPLAY';
        this.btnSwitchMode.classList.remove('active');
        audioEngine.playBootChime();
      }
    });

    // Camera prompt banner click
    const camBanner = document.getElementById('cam-prompt-banner');
    if (camBanner) {
      camBanner.addEventListener('click', () => this.activateCamera());
    }

    // Auto-activate camera and audio on first click anywhere if blocked initially
    window.addEventListener('click', () => {
      audioEngine.ensureContext();
      if (!this.vision.isStreaming || this.vision.isDemoMode) {
        this.activateCamera();
      }
    }, { once: true });
  }

  async activateCamera() {
    audioEngine.ensureContext();
    const banner = document.getElementById('cam-prompt-banner');
    const success = await this.vision.startCamera();
    if (success) {
      if (banner) banner.style.display = 'none';
      this.btnSwitchMode.querySelector('span').textContent = 'FEED: LIVE CAM';
      this.btnSwitchMode.classList.add('active');
      audioEngine.playBootChime();
    } else {
      if (banner) banner.textContent = 'CAMERA BLOCKED — PLAYING DEMO REPLAY';
      await this.vision.startDemoVideo("assets/demo.mp4");
      this.btnSwitchMode.querySelector('span').textContent = 'FEED: DEMO REPLAY';
      this.btnSwitchMode.classList.remove('active');
      setTimeout(() => { if (banner) banner.style.display = 'none'; }, 3000);
    }
  }

  async boot(runDemoMode = false) {
    audioEngine.ensureContext();

    // 1. Immediately Hide Modal & Launch Render Loop
    this.modalBackdrop.classList.add('hidden');
    this.isRunning = true;
    requestAnimationFrame((t) => this.loop(t));

    // 2. Initialize Computer Vision & Camera in Parallel
    const modelPromise = this.vision.initModel((statusText) => {
      const topStatus = document.getElementById('top-status');
      if (topStatus) topStatus.textContent = statusText.includes('READY') ? 'ONLINE' : 'SYNCING';
    });

    const banner = document.getElementById('cam-prompt-banner');
    if (runDemoMode) {
      await this.vision.startDemoVideo("assets/demo.mp4");
      this.btnSwitchMode.querySelector('span').textContent = 'FEED: DEMO REPLAY';
    } else {
      const camSuccess = await this.vision.startCamera();
      if (!camSuccess) {
        if (banner) banner.style.display = 'block';
        await this.vision.startDemoVideo("assets/demo.mp4");
        this.btnSwitchMode.querySelector('span').textContent = 'FEED: DEMO REPLAY';
      } else {
        if (banner) banner.style.display = 'none';
        this.btnSwitchMode.querySelector('span').textContent = 'FEED: LIVE CAM';
        this.btnSwitchMode.classList.add('active');
      }
    }

    await modelPromise;
  }

  preload() {
    this.vision.initModel((statusText) => {
      if (this.modalStatus && !this.isRunning) {
        this.modalStatus.textContent = statusText;
      }
    });
  }

  loop(timestamp) {
    if (!this.isRunning) return;

    // 1. Update Hand Tracking & Gestures
    const trackingPayload = this.vision.update(timestamp);

    // 2. Update HUD & Floating Windows Physics
    this.hud.update(timestamp, trackingPayload);

    // 3. Render Three.js 3D Holographic Scene
    this.hologramScene.render(timestamp, trackingPayload);

    // 4. Render Glowing Energy Filaments & Reticles
    const windowAnchors = this.hud.getWindowAnchors();
    this.filamentEngine.render(timestamp, trackingPayload, windowAnchors);

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Reliable Bootstrap: runs immediately whether DOMContentLoaded already fired or not
const startApp = async () => {
  if (window.__holoApp) return;
  try {
    console.log("⚡ Bootstrapping Holographic AR Terminal...");
    window.__holoApp = new Application();
    await window.__holoApp.boot(false);
  } catch (err) {
    console.error("Critical bootstrap error:", err);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

// Resume audio synthesizer on first click anywhere
window.addEventListener('click', () => {
  audioEngine.ensureContext();
}, { once: true });
