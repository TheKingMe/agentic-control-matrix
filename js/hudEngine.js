/**
 * HUDEngine - Cyberpunk HUD, Floating Windows, Streaming Terminal & Gesture Interaction Subsystem
 * Manages holographic window positioning, drag-and-drop physics, real-time telemetry metrics,
 * and the streaming agentic pseudocode terminal.
 */

import { audioEngine } from './audioEngine.js';

export class HUDEngine {
  constructor(hologramScene) {
    this.hologramScene = hologramScene;

    // DOM Elements
    this.mechWindow = document.getElementById('mech-window');
    this.terminalWindow = document.getElementById('terminal-window');
    this.codeFeed = document.getElementById('code-feed');
    this.progressFill = document.getElementById('stream-progress-fill');

    // Metrics DOM elements
    this.valFps = document.getElementById('val-fps');
    this.valLatency = document.getElementById('val-latency');
    this.valConfidence = document.getElementById('val-confidence');
    this.valHands = document.getElementById('val-hands');
    this.topFps = document.getElementById('top-fps');
    this.topClock = document.getElementById('top-clock');
    this.mechStatus = document.getElementById('mech-status');

    // Window positional states & spring targets
    this.windows = {
      mech: {
        el: this.mechWindow,
        x: window.innerWidth * 0.06,
        y: window.innerHeight * 0.16,
        targetX: window.innerWidth * 0.06,
        targetY: window.innerHeight * 0.16,
        width: 360,
        height: 480,
        isDragged: false,
        draggedByHand: -1,
        dragOffset: { x: 0, y: 0 }
      },
      terminal: {
        el: this.terminalWindow,
        x: window.innerWidth - 440 - window.innerWidth * 0.06,
        y: window.innerHeight * 0.14,
        targetX: window.innerWidth - 440 - window.innerWidth * 0.06,
        targetY: window.innerHeight * 0.14,
        width: 440,
        height: 520,
        isDragged: false,
        draggedByHand: -1,
        dragOffset: { x: 0, y: 0 }
      }
    };

    // Agentic Pseudocode Stream Script (inspired by CodeCrafters video)
    this.logScript = [
      { text: "running world_indexer", class: "token-keyword" },
      { text: "running string_solver", class: "token-cyan" },
      { text: "running gesture_compiler****** ok", class: "token-green" },
      { text: "IDEA 32: puppets that dream when idle", class: "token-keyword" },
      { text: "LIFTING: migrate memory store (36KB)", class: "token-keyword" },
      { text: "**", class: "token-star" },
      { text: "done - M619 in 2.3s", class: "token-done" },
      { text: "LIFTING: compact heap (12.4 MB)", class: "token-keyword" },
      { text: "done - 1.8G in 1.1s", class: "token-done" },
      { text: "lifting: train epoch 12/40 (512 batches)", class: "token-cyan" },
      { text: "*******", class: "token-star" },
      { text: "done - 512 batches in 5.2s", class: "token-done" },
      { text: "EMBEDDING: rebuild semantic vector store", class: "token-keyword" },
      { text: "RUNNING: gesture_pipeline.compilation", class: "token-cyan" },
      { text: "running puppet_daemon*******", class: "token-green" },
      { text: "done - 84 nodes compiled in 14ms", class: "token-done" },
      { text: "IDEA 33: holographic filament synchronization", class: "token-keyword" },
      { text: "STATUS: NEURAL_BRIDGE_NOMINAL", class: "token-green" }
    ];
    this.scriptIndex = 0;
    this.lastLogTime = 0;
    this.progressPct = 42;

    this.initMouseDrag();
    this.updateWindowPositions(true);
  }

  /**
   * Initializes fallback mouse dragging for desktop usability
   */
  initMouseDrag() {
    ['mech', 'terminal'].forEach(key => {
      const win = this.windows[key];
      const header = win.el.querySelector('.window-header');
      if (!header) return;

      header.addEventListener('mousedown', (e) => {
        win.isDragged = true;
        win.draggedByHand = -99; // Mouse indicator
        win.dragOffset.x = e.clientX - win.x;
        win.dragOffset.y = e.clientY - win.y;
        win.el.classList.add('is-dragged');
        audioEngine.playPinchGrab();
      });
    });

    window.addEventListener('mousemove', (e) => {
      ['mech', 'terminal'].forEach(key => {
        const win = this.windows[key];
        if (win.isDragged && win.draggedByHand === -99) {
          win.targetX = e.clientX - win.dragOffset.x;
          win.targetY = e.clientY - win.dragOffset.y;
        }
      });
    });

    window.addEventListener('mouseup', () => {
      ['mech', 'terminal'].forEach(key => {
        const win = this.windows[key];
        if (win.isDragged && win.draggedByHand === -99) {
          win.isDragged = false;
          win.draggedByHand = -1;
          win.el.classList.remove('is-dragged');
          audioEngine.playPinchRelease();
        }
      });
    });
  }

  /**
   * Updates gestures and window physics every frame
   */
  update(timeMs, trackingPayload) {
    this.updateClock();
    this.updateStreamingTerminal(timeMs);

    if (trackingPayload) {
      this.updateTelemetryMetrics(trackingPayload);
      this.processGestureInteractions(trackingPayload);
    }

    this.updateWindowPositions(false);

    // Sync Mech 3D position with Left Window center
    const mechCenter = this.getWindowCenter('mech');
    this.hologramScene.setMechScreenPosition(mechCenter.x, mechCenter.y + 20);
  }

  /**
   * Processes Pinch to Drag & Pointing to Rotate
   */
  processGestureInteractions(trackingPayload) {
    const gestures = trackingPayload.gestures || [];

    gestures.forEach((gesture, handIdx) => {
      const pinch = gesture.pinchPoint;

      // 1. PINCH DETECTION & WINDOW DRAG
      if (gesture.isPinching) {
        // If neither window is currently dragged, try to grab the nearest window
        if (!this.windows.mech.isDragged && !this.windows.terminal.isDragged) {
          if (this.isPointInsideWindow(pinch.x, pinch.y, this.windows.mech, 100)) {
            this.windows.mech.isDragged = true;
            this.windows.mech.draggedByHand = handIdx;
            this.windows.mech.dragOffset.x = pinch.x - this.windows.mech.x;
            this.windows.mech.dragOffset.y = pinch.y - this.windows.mech.y;
            this.windows.mech.el.classList.add('is-dragged');
            this.mechStatus.textContent = 'STATUS: HEAVY LIFTING';
            this.mechStatus.classList.add('pulsing');
            audioEngine.playPinchGrab();
          } else if (this.isPointInsideWindow(pinch.x, pinch.y, this.windows.terminal, 100)) {
            this.windows.terminal.isDragged = true;
            this.windows.terminal.draggedByHand = handIdx;
            this.windows.terminal.dragOffset.x = pinch.x - this.windows.terminal.x;
            this.windows.terminal.dragOffset.y = pinch.y - this.windows.terminal.y;
            this.windows.terminal.el.classList.add('is-dragged');
            audioEngine.playPinchGrab();
          }
        }

        // Active drag update while pinching
        ['mech', 'terminal'].forEach(key => {
          const win = this.windows[key];
          if (win.isDragged && win.draggedByHand === handIdx) {
            win.targetX = pinch.x - win.dragOffset.x;
            win.targetY = pinch.y - win.dragOffset.y;
          }
        });
      } else {
        // Automatically release if not pinching
        ['mech', 'terminal'].forEach(key => {
          const win = this.windows[key];
          if (win.isDragged && win.draggedByHand === handIdx) {
            win.isDragged = false;
            win.draggedByHand = -1;
            win.el.classList.remove('is-dragged');
            if (key === 'mech') {
              this.mechStatus.textContent = 'STATUS: COMPLIANT';
              this.mechStatus.classList.remove('pulsing');
            }
            audioEngine.playPinchRelease();
          }
        });
      }

      // 2. POINTING GESTURE / SWIPE TO ROTATE MECH
      if (gesture.isPointing && trackingPayload.hands && trackingPayload.hands[handIdx]) {
        const indexTip = trackingPayload.hands[handIdx][8];
        const screenX = indexTip.x * window.innerWidth;
        const screenY = indexTip.y * window.innerHeight;

        // If pointing near the Mech Window, allow horizontal swiping to spin 3D mech
        if (this.isPointInsideWindow(screenX, screenY, this.windows.mech)) {
          if (this.lastPointX !== undefined) {
            const deltaX = (screenX - this.lastPointX) * 0.015;
            this.hologramScene.rotateMech(deltaX);
          }
          this.lastPointX = screenX;
        } else {
          this.lastPointX = undefined;
        }
      } else {
        this.lastPointX = undefined;
      }

      // 3. OPEN PALM PULSE
      if (gesture.isOpenPalm && !this.wasOpenPalm) {
        audioEngine.playFilamentPulse();
        this.wasOpenPalm = true;
      } else if (!gesture.isOpenPalm) {
        this.wasOpenPalm = false;
      }
    });
  }

  isPointInsideWindow(px, py, win, padding = 75) {
    return px >= win.x - padding && px <= win.x + win.width + padding && 
           py >= win.y - padding && py <= win.y + win.height + padding;
  }

  /**
   * Smooth Spring Physics for Window Positioning
   */
  updateWindowPositions(immediate = false) {
    const spring = 0.22;
    ['mech', 'terminal'].forEach(key => {
      const win = this.windows[key];
      // Keep inside screen boundaries
      win.targetX = Math.max(10, Math.min(window.innerWidth - win.width - 10, win.targetX));
      win.targetY = Math.max(50, Math.min(window.innerHeight - win.height - 20, win.targetY));

      if (immediate) {
        win.x = win.targetX;
        win.y = win.targetY;
      } else {
        win.x += (win.targetX - win.x) * spring;
        win.y += (win.targetY - win.y) * spring;
      }

      win.el.style.left = `${win.x}px`;
      win.el.style.top = `${win.y}px`;
      win.el.style.right = 'auto';
    });
  }

  getWindowCenter(key) {
    const win = this.windows[key];
    return {
      x: win.x + win.width * 0.5,
      y: win.y + win.height * 0.5
    };
  }

  getWindowAnchors() {
    return {
      mech: this.getWindowCenter('mech'),
      terminal: this.getWindowCenter('terminal')
    };
  }

  /**
   * Resets windows back to default cinematic positions
   */
  resetWindowPositions() {
    this.windows.mech.targetX = window.innerWidth * 0.06;
    this.windows.mech.targetY = window.innerHeight * 0.16;
    this.windows.terminal.targetX = window.innerWidth - 440 - window.innerWidth * 0.06;
    this.windows.terminal.targetY = window.innerHeight * 0.14;
    audioEngine.playPinchRelease();
  }

  /**
   * Streams rolling agentic pseudocode into the terminal feed
   */
  updateStreamingTerminal(timeMs) {
    if (timeMs - this.lastLogTime > 750) {
      this.lastLogTime = timeMs;

      const logItem = this.logScript[this.scriptIndex];
      this.scriptIndex = (this.scriptIndex + 1) % this.logScript.length;

      const lineEl = document.createElement('div');
      lineEl.className = 'code-line';
      lineEl.innerHTML = `<span class="${logItem.class}">${this.escapeHtml(logItem.text)}</span>`;

      this.codeFeed.appendChild(lineEl);

      // Keep max 15 lines in feed
      while (this.codeFeed.children.length > 15) {
        this.codeFeed.removeChild(this.codeFeed.firstChild);
      }

      // Progress bar loop
      this.progressPct = (this.progressPct + 4) % 100;
      if (this.progressFill) {
        this.progressFill.style.width = `${this.progressPct}%`;
      }
    }
  }

  updateTelemetryMetrics(payload) {
    if (this.valFps) this.valFps.textContent = payload.fps || 60;
    if (this.topFps) this.topFps.textContent = payload.fps || 60;
    if (this.valLatency) this.valLatency.textContent = `${payload.latency || 12}ms`;
    const conf = (typeof payload.confidence === 'number') ? payload.confidence : (payload.handCount ? 0.95 : 0);
    if (this.valConfidence) this.valConfidence.textContent = `${Math.round(conf * 100)}%`;
    if (this.valHands) this.valHands.textContent = payload.handCount ? `${payload.handCount} ACTIVE` : 'SEARCHING';
  }

  updateClock() {
    if (!this.topClock) return;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    this.topClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(Math.floor(now.getMilliseconds() / 100))}`;
  }

  escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }
}
