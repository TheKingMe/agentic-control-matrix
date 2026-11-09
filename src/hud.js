/**
 * HUDController - Manages the Agentic Control Matrix Sci-Fi HUD
 * 
 * Features:
 * - 4 Interactive Blueprint Cards:
 *   1. PATTERNS & DATA FEED (Top-Left)
 *   2. PINCH & GRAB / TARGET SELECT (Top-Right)
 *   3. ROTATE & DRAG INTERACTION (Bottom-Left)
 *   4. PEACE / LAUNCH BEAMS (Bottom-Right)
 * - Top Finger Curl Bars with Deadzone Markers:
 *   * THUMB: R-ARM
 *   * INDEX: L-ARM
 *   * MIDDLE: LEGS / WALK
 *   * RING: BODY ROT
 *   * PINKY: JUMP / CROUCH
 * - Live Status Badge & Telemetry
 * - Model Switcher (Procedural Mech <-> GLTF Android)
 * - Zoom & Reset controls
 */
export class HUDController {
  constructor({
    onToggleStrings,
    onToggleTerminal,
    onToggleCards,
    onToggleModel,
    onToggleTracking,
    onToggleZoom,
    onModeChange,
    onApiKeyChange,
    onToggleFeed,
    onResetRobot
  }) {
    this.callbacks = {
      onToggleStrings,
      onToggleTerminal,
      onToggleCards,
      onToggleModel,
      onToggleTracking,
      onToggleZoom,
      onModeChange,
      onApiKeyChange,
      onToggleFeed,
      onResetRobot
    };

    // DOM Elements
    this.statusBadge = document.getElementById('robot-status-badge');
    this.terminalPanel = document.getElementById('terminal-panel');
    this.debugPanel = document.getElementById('debug-curl-panel');
    this.settingsModal = document.getElementById('settings-modal');
    this.guideModal = document.getElementById('guide-modal');
    this.guideDetectedSign = document.getElementById('guide-detected-sign');
    this.startModal = document.getElementById('start-modal');
    this.fpsEl = document.getElementById('hud-fps');
    this.latencyEl = document.getElementById('hud-latency');
    this.clockEl = document.getElementById('hud-clock');
    this.trackerStatus = document.getElementById('hud-tracker-status');

    // 4 Blueprint Cards
    this.cardDataFeed = document.getElementById('card-data-feed');
    this.cardPinchGrab = document.getElementById('card-pinch-grab');
    this.cardRotateDrag = document.getElementById('card-rotate-drag');
    this.cardPeaceBeams = document.getElementById('card-peace-beams');

    // Blueprint Telemetry Labels
    this.telPinchDist = document.getElementById('tel-pinch-dist');
    this.telPinchLock = document.getElementById('tel-pinch-lock');
    this.telOrbitYaw = document.getElementById('tel-orbit-yaw');
    this.telDragDelta = document.getElementById('tel-drag-delta');
    this.telBeamStatus = document.getElementById('tel-beam-status');
    this.telDataStrands = document.getElementById('tel-data-strands');

    // Curl DOM Elements
    this.curlFills = {
      thumb: document.getElementById('curl-fill-thumb'),
      index: document.getElementById('curl-fill-index'),
      middle: document.getElementById('curl-fill-middle'),
      ring: document.getElementById('curl-fill-ring'),
      pinky: document.getElementById('curl-fill-pinky')
    };

    this.curlVals = {
      thumb: document.getElementById('curl-val-thumb'),
      index: document.getElementById('curl-val-index'),
      middle: document.getElementById('curl-val-middle'),
      ring: document.getElementById('curl-val-ring'),
      pinky: document.getElementById('curl-val-pinky')
    };

    this.initEventListeners();
    this.startClock();
  }

  initEventListeners() {
    // Dock Buttons
    document.getElementById('btn-toggle-strings')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isActive = btn.classList.toggle('active');
      btn.textContent = isActive ? 'STRINGS: ON' : 'STRINGS: OFF';
      this.callbacks.onToggleStrings?.(isActive);
    });

    document.getElementById('btn-toggle-terminal')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isActive = btn.classList.toggle('active');
      btn.textContent = isActive ? 'TERMINAL: ON' : 'TERMINAL: OFF';
      this.terminalPanel?.classList.toggle('hidden', !isActive);
      this.callbacks.onToggleTerminal?.(isActive);
    });

    document.getElementById('btn-toggle-cards')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isActive = btn.classList.toggle('active');
      btn.textContent = isActive ? 'HUD CARDS: ON' : 'HUD CARDS: OFF';
      document.querySelectorAll('.blueprint-card').forEach(card => {
        card.classList.toggle('hidden', !isActive);
      });
      this.callbacks.onToggleCards?.(isActive);
    });

    document.getElementById('btn-toggle-model')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.textContent = 'ROBOT: ANDROID ONLINE';
      btn.classList.add('active');
      this.callbacks.onToggleModel?.('gltf');
    });

    document.getElementById('btn-toggle-tracking')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isMirror = btn.textContent.includes('1:1');
      const nextMode = isMirror ? 'pivot' : 'mirror';
      btn.textContent = isMirror ? 'MIRROR: CENTERED' : 'MIRROR: 1:1 MOTION';
      btn.classList.toggle('active', !isMirror);
      this.callbacks.onToggleTracking?.(nextMode);
    });

    document.getElementById('btn-toggle-zoom')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      this.callbacks.onToggleZoom?.(btn);
    });

    document.getElementById('btn-reset-robot')?.addEventListener('click', () => {
      this.callbacks.onResetRobot?.();
    });

    document.getElementById('btn-toggle-feed')?.addEventListener('click', () => {
      this.callbacks.onToggleFeed?.();
    });

    document.getElementById('btn-open-guide')?.addEventListener('click', () => {
      this.guideModal?.classList.remove('hidden');
    });

    document.getElementById('btn-close-guide')?.addEventListener('click', () => {
      this.guideModal?.classList.add('hidden');
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.settingsModal?.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.settingsModal?.classList.add('hidden');
    });

    // Settings Modal Toggles
    const toggleStringsOpt = document.getElementById('opt-toggle-strings');
    toggleStringsOpt?.addEventListener('click', () => {
      const active = toggleStringsOpt.classList.toggle('active');
      toggleStringsOpt.textContent = active ? 'ENABLED' : 'DISABLED';
      this.callbacks.onToggleStrings?.(active);
    });

    const toggleTerminalOpt = document.getElementById('opt-toggle-terminal');
    toggleTerminalOpt?.addEventListener('click', () => {
      const active = toggleTerminalOpt.classList.toggle('active');
      toggleTerminalOpt.textContent = active ? 'ENABLED' : 'DISABLED';
      this.terminalPanel?.classList.toggle('hidden', !active);
      this.callbacks.onToggleTerminal?.(active);
    });

    const toggleDebugOpt = document.getElementById('opt-toggle-debug');
    toggleDebugOpt?.addEventListener('click', () => {
      const active = toggleDebugOpt.classList.toggle('active');
      toggleDebugOpt.textContent = active ? 'ENABLED' : 'DISABLED';
      this.debugPanel?.classList.toggle('hidden', !active);
    });

    const optAgentMode = document.getElementById('opt-agent-mode');
    const claudeKeyGroup = document.getElementById('claude-key-group');
    optAgentMode?.addEventListener('click', () => {
      const isMock = optAgentMode.textContent.includes('MOCK');
      if (isMock) {
        optAgentMode.textContent = 'REAL (CLAUDE API)';
        optAgentMode.classList.add('active');
        claudeKeyGroup?.classList.remove('hidden');
        this.callbacks.onModeChange?.('real');
      } else {
        optAgentMode.textContent = 'MOCK AGENT';
        optAgentMode.classList.remove('active');
        claudeKeyGroup?.classList.add('hidden');
        this.callbacks.onModeChange?.('mock');
      }
    });

    const inputKey = document.getElementById('input-claude-key');
    inputKey?.addEventListener('input', (e) => {
      this.callbacks.onApiKeyChange?.(e.target.value.trim());
    });
  }

  startClock() {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const ms = String(Math.floor(now.getMilliseconds() / 100));
      if (this.clockEl) this.clockEl.textContent = `${h}:${m}:${s}.${ms}`;
      requestAnimationFrame(updateTime);
    };
    requestAnimationFrame(updateTime);
  }

  updateFPS(fps) {
    if (this.fpsEl) this.fpsEl.textContent = fps;
    if (this.latencyEl) {
      const latency = fps > 0 ? Math.round(1000 / fps) : 16;
      this.latencyEl.textContent = `${latency}ms`;
    }
  }

  setTrackerOnline(isOnline, handCount = 0) {
    if (this.trackerStatus) {
      if (handCount >= 2) {
        this.trackerStatus.textContent = 'DUAL HANDS: 2 ONLINE';
        this.trackerStatus.style.color = 'var(--neon-green)';
      } else if (isOnline) {
        this.trackerStatus.textContent = 'SINGLE HAND: 1 ONLINE';
        this.trackerStatus.style.color = 'var(--neon-cyan)';
      } else {
        this.trackerStatus.textContent = 'STANDBY (NO HAND)';
        this.trackerStatus.style.color = 'var(--neon-amber)';
      }
    }
  }

  setStatus(statusText) {
    if (!this.statusBadge) return;
    this.statusBadge.textContent = `STATUS: ${statusText}`;
    this.statusBadge.className = 'status-badge';

    const s = statusText.toLowerCase();
    if (s.includes('idle') || s.includes('ready')) {
      this.statusBadge.classList.add('idle');
    } else if (s.includes('working') || s.includes('target') || s.includes('lock')) {
      this.statusBadge.classList.add('working');
    } else if (s.includes('heavy') || s.includes('lifting')) {
      this.statusBadge.classList.add('heavy-lifting');
    } else if (s.includes('stop')) {
      this.statusBadge.classList.add('stopped');
    } else {
      this.statusBadge.classList.add('idle');
    }
  }

  updateCurls(curls) {
    for (const [f, val] of Object.entries(curls)) {
      const fillEl = this.curlFills[f];
      const valEl = this.curlVals[f];
      if (fillEl && valEl) {
        const pct = Math.round(val * 100);
        fillEl.style.width = `${pct}%`;
        valEl.textContent = val.toFixed(2);

        // Highlight color if active
        if (val > 0.45) {
          fillEl.style.background = 'linear-gradient(90deg, var(--neon-cyan), var(--neon-amber))';
        } else {
          fillEl.style.background = 'var(--neon-cyan)';
        }
      }
    }
  }

  /**
   * Update the 4 Blueprint Holographic Cards with Live Telemetry
   */
  updateBlueprintCards(handState, robot, handTracker = null) {
    if (!handState || !handState.detected) {
      this.cardDataFeed?.classList.remove('active');
      this.cardPinchGrab?.classList.remove('active');
      this.cardRotateDrag?.classList.remove('active');
      this.cardPeaceBeams?.classList.remove('active');
      if (this.guideDetectedSign) this.guideDetectedSign.textContent = 'NO HAND DETECTED';
      return;
    }

    const handCount = handTracker ? (handTracker.handCount || 1) : 1;

    if (this.guideDetectedSign) {
      if (handCount >= 2) {
        this.guideDetectedSign.textContent = 'DUAL HANDS // 2-HAND CONTROL';
      } else {
        this.guideDetectedSign.textContent = handState.activeStateName.replace('_', ' ');
      }
    }

    // 1. Top-Left: Patterns & Data Feed
    const isOpen = handState.isOpenPalm || (handTracker && handTracker.dual && handTracker.dual.isBothOpen);
    this.cardDataFeed?.classList.toggle('active', isOpen);
    if (this.telDataStrands) {
      this.telDataStrands.textContent = handCount >= 2 ? '10 TETHERS (DUAL HANDS)' : (isOpen ? '5 TETHERS SYNCED' : '5 STANDBY');
    }

    // 2. Top-Right: Pinch & Grab / Target Select
    const isPinch = handState.isPinching;
    this.cardPinchGrab?.classList.toggle('active', isPinch);
    if (this.telPinchDist) {
      this.telPinchDist.textContent = handState.pinchDist ? handState.pinchDist.toFixed(3) : '0.000';
    }
    if (this.telPinchLock) {
      this.telPinchLock.textContent = isPinch ? (handState.isHeavyLifting ? 'HEAVY LIFT' : 'LOCKED') : 'SEARCHING';
      this.telPinchLock.style.color = isPinch ? 'var(--neon-amber)' : 'var(--neon-cyan)';
    }

    // 3. Bottom-Left: Rotate & Drag Interaction
    const isDragging = Math.abs(handState.deltaX) > 0.012 || Math.abs(handState.deltaY) > 0.012;
    this.cardRotateDrag?.classList.toggle('active', isDragging);
    if (this.telOrbitYaw && robot) {
      const yawDeg = Math.round((robot.targetRotY * 180) / Math.PI);
      this.telOrbitYaw.textContent = `${yawDeg >= 0 ? '+' : ''}${yawDeg}°`;
    }
    if (this.telDragDelta) {
      this.telDragDelta.textContent = `ΔX: ${handState.deltaX.toFixed(3)}`;
    }

    // 4. Bottom-Right: Peace / Launch Beams
    const isPeace = handState.isPeaceSign;
    this.cardPeaceBeams?.classList.toggle('active', isPeace);
    if (this.telBeamStatus) {
      this.telBeamStatus.textContent = isPeace ? 'DUAL LASER LOCK' : 'INACTIVE';
      this.telBeamStatus.style.color = isPeace ? 'var(--neon-cyan)' : 'inherit';
    }
  }
}
