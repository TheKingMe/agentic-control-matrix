/**
 * FilamentEngine - Neural Energy Beams & Spline Filaments Subsystem
 * Replicates the glowing golden optical fiber / neural thread loom between
 * fingertips and bridges interactive data beams into floating holographic windows.
 */

export class FilamentEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Palette configurations
    this.palettes = {
      gold: {
        core: '#ffffff',
        primary: '#ffaa22',
        glow: 'rgba(255, 170, 34, 0.55)',
        halo: 'rgba(255, 200, 50, 0.15)',
        sparks: '#ffe082'
      },
      cyan: {
        core: '#ffffff',
        primary: '#00f0ff',
        glow: 'rgba(0, 240, 255, 0.55)',
        halo: 'rgba(0, 240, 255, 0.15)',
        sparks: '#80f7ff'
      },
      emerald: {
        core: '#ffffff',
        primary: '#00ffaa',
        glow: 'rgba(0, 255, 170, 0.55)',
        halo: 'rgba(0, 255, 170, 0.15)',
        sparks: '#a7ffeb'
      }
    };
    this.currentPalette = 'gold';

    // Particle sparks traveling along filaments
    this.sparks = [];
    this.maxSparks = 36;
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparks.push({
        progress: Math.random(),
        speed: 0.008 + Math.random() * 0.014,
        strandIdx: Math.floor(Math.random() * 10),
        size: 1.5 + Math.random() * 2.5
      });
    }

    this.initResizeListener();
  }

  setPalette(name) {
    if (this.palettes[name]) {
      this.currentPalette = name;
    }
  }

  initResizeListener() {
    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    });
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Main Render method called every frame
   */
  render(timeMs, trackingPayload, windowAnchors = {}) {
    this.clear();

    if (!trackingPayload || !trackingPayload.hands || trackingPayload.hands.length === 0) {
      return;
    }

    const t = timeMs * 0.001;
    const p = this.palettes[this.currentPalette];

    trackingPayload.hands.forEach((landmarks, handIdx) => {
      const gesture = trackingPayload.gestures[handIdx] || {};

      // 1. Draw glowing anchor nodes & HUD reticles on knuckles & fingertips
      this.drawHandReticles(landmarks, gesture, t, p);

      // 2. Draw Golden Neural Filament Fan between thumb and fingers
      this.drawFilamentFan(landmarks, gesture, t, p);

      // 3. Draw Data Bridging Beams to floating windows
      this.drawWindowBridgingBeams(landmarks, gesture, windowAnchors, t, p);
    });
  }

  /**
   * Draws precision holographic reticles and anchor points on hand landmarks
   */
  drawHandReticles(landmarks, gesture, t, palette) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Fingertip indices in MediaPipe: 4 (Thumb), 8 (Index), 12 (Middle), 16 (Ring), 20 (Pinky)
    const tipIndices = [4, 8, 12, 16, 20];
    const knuckleIndices = [0, 2, 5, 9, 13, 17]; // Wrist and MCP joints

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 1. Knuckle subtle glow dots
    knuckleIndices.forEach(idx => {
      const lm = landmarks[idx];
      const px = lm.x * w;
      const py = lm.y * h;

      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Fingertips: High-tech rotating reticles & anchor nodes
    tipIndices.forEach((idx, i) => {
      const lm = landmarks[idx];
      const px = lm.x * w;
      const py = lm.y * h;

      const isIndex = idx === 8;
      const isThumb = idx === 4;
      const isPinching = gesture.isPinching && (isIndex || isThumb);

      // Outer animated dashed halo
      ctx.strokeStyle = isPinching ? '#ffffff' : palette.primary;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const radius = isPinching ? 8 : (11 + Math.sin(t * 3 + i) * 1.5);
      const startAngle = t * 2 + i * 1.2;
      ctx.arc(px, py, radius, startAngle, startAngle + Math.PI * 1.4);
      ctx.stroke();

      // Soft radiant glow
      const grad = ctx.createRadialGradient(px, py, 1, px, py, isPinching ? 22 : 16);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, palette.primary);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, isPinching ? 22 : 16, 0, Math.PI * 2);
      ctx.fill();

      // Core white pip
      ctx.fillStyle = palette.core;
      ctx.beginPath();
      ctx.arc(px, py, isPinching ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Coordinate micro-label on Index fingertip
      if (isIndex) {
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.fillStyle = palette.primary;
        const tag = gesture.isPinching ? 'LOCK: PINCH' : `IDX: [${Math.round(px)}, ${Math.round(py)}]`;
        ctx.fillText(tag, px + 16, py - 8);

        // Sub-tick line
        ctx.strokeStyle = palette.glow;
        ctx.beginPath();
        ctx.moveTo(px + 8, py - 4);
        ctx.lineTo(px + 14, py - 8);
        ctx.lineTo(px + 90, py - 8);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  /**
   * Draws the fan of curved, golden Bézier spline filaments
   * connecting thumb to index and other fingers (exact replicate of CodeCrafters video)
   */
  drawFilamentFan(landmarks, gesture, t, palette) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const thumb = landmarks[4];
    const index = landmarks[8];
    const middle = landmarks[12];
    const ring = landmarks[16];
    const pinky = landmarks[20];

    const pThumb = { x: thumb.x * w, y: thumb.y * h };
    const pIndex = { x: index.x * w, y: index.y * h };
    const pMiddle = { x: middle.x * w, y: middle.y * h };
    const pRing = { x: ring.x * w, y: ring.y * h };
    const pPinky = { x: pinky.x * w, y: pinky.y * h };

    const numStrands = 11;
    const isPinching = gesture.isPinching;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Precalculate filament paths for spark positioning
    const currentCurves = [];

    for (let i = 0; i < numStrands; i++) {
      const ratio = i / (numStrands - 1); // 0.0 (near index) to 1.0 (towards pinky)

      // Start point: slightly clustered around thumb tip
      const startX = pThumb.x + (ratio - 0.5) * 6;
      const startY = pThumb.y + (ratio - 0.5) * 6;

      // End point: interpolated along the fingertips arc
      let endX, endY;
      if (ratio < 0.35) {
        const sub = ratio / 0.35;
        endX = pIndex.x + (pMiddle.x - pIndex.x) * sub * 0.4;
        endY = pIndex.y + (pMiddle.y - pIndex.y) * sub * 0.4;
      } else if (ratio < 0.7) {
        const sub = (ratio - 0.35) / 0.35;
        endX = pMiddle.x + (pRing.x - pMiddle.x) * sub;
        endY = pMiddle.y + (pRing.y - pMiddle.y) * sub;
      } else {
        const sub = (ratio - 0.7) / 0.3;
        endX = pRing.x + (pPinky.x - pRing.x) * sub;
        endY = pPinky.y + (pPinky.y - pRing.y) * sub;
      }

      // Calculate organic curved Bézier control point
      // Midpoint
      const midX = (startX + endX) * 0.5;
      const midY = (startY + endY) * 0.5;

      // Normal vector (perpendicular to chord)
      const chordDx = endX - startX;
      const chordDy = endY - startY;
      const chordLen = Math.hypot(chordDx, chordDy) || 1;
      const nx = -chordDy / chordLen;
      const ny = chordDx / chordLen;

      // Curve bowing amplitude (flattens during pinch, bills out during open palm)
      let bowAmount = (1.0 - ratio * 0.4) * (chordLen * 0.38);
      if (isPinching) {
        bowAmount *= 0.25; // Tighten filament bundle on pinch
      } else if (gesture.isOpenPalm) {
        bowAmount *= 1.35; // Expand on open palm
      }

      // Harmonic sine wave flutter
      const wave = Math.sin(t * 5.0 + i * 0.7) * (isPinching ? 2 : 7);
      const ctrlX = midX + nx * bowAmount + ny * wave;
      const ctrlY = midY + ny * bowAmount - nx * wave;

      currentCurves.push({ startX, startY, ctrlX, ctrlY, endX, endY });

      // Render 3-pass glowing stroke for each filament
      // Pass 1: Wide soft outer halo
      ctx.strokeStyle = palette.halo;
      ctx.lineWidth = isPinching ? 5.0 : 4.0;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.stroke();

      // Pass 2: Vibrant primary glow
      ctx.strokeStyle = isPinching ? '#ffffff' : palette.glow;
      ctx.lineWidth = isPinching ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.stroke();

      // Pass 3: Ultra-sharp white/hot center thread
      ctx.strokeStyle = isPinching ? '#ffffff' : palette.core;
      ctx.lineWidth = isPinching ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.stroke();
    }

    // Render traveling energy sparks gliding along the filament splines
    this.renderTravelingSparks(currentCurves, palette);

    ctx.restore();
  }

  /**
   * Draws dynamic data bridging beams linking index finger to floating holographic windows
   */
  drawWindowBridgingBeams(landmarks, gesture, windowAnchors, t, palette) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Connect from all 5 fingertips as puppet marionette strings (like reference video!)
    const tipAnchors = [
      { idx: 4, offX: -45, offY: -20 }, // Thumb -> Right shoulder
      { idx: 8, offX: -20, offY: -65 }, // Index -> Head / Visor
      { idx: 12, offX: 0, offY: 0 },    // Middle -> Glowing Core
      { idx: 16, offX: 25, offY: -20 }, // Ring -> Left shoulder
      { idx: 20, offX: 45, offY: 40 }   // Pinky -> Pelvis / Base
    ];

    const targets = [];
    if (windowAnchors.mech) {
      targets.push({ name: 'mech', ...windowAnchors.mech });
    }
    if (windowAnchors.terminal) {
      targets.push({ name: 'terminal', ...windowAnchors.terminal });
    }

    targets.forEach(tgt => {
      const wrist = landmarks[0];
      const pWrist = { x: wrist.x * w, y: wrist.y * h };
      const dist = Math.hypot(pWrist.x - tgt.x, pWrist.y - tgt.y);

      // Generous reaching distance so puppet strings stay connected as you gesture
      const maxReach = 900;
      if (dist < maxReach) {
        const proximityAlpha = Math.max(0.2, 1 - dist / maxReach);

        tipAnchors.forEach((tip, strandI) => {
          const lm = landmarks[tip.idx];
          const px = lm.x * w;
          const py = lm.y * h;

          const destX = tgt.name === 'mech' ? (tgt.x + tip.offX) : tgt.x;
          const destY = tgt.name === 'mech' ? (tgt.y + tip.offY) : (tgt.y + (strandI - 2) * 24);

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';

          // Fluid organic marionette curve
          const wave = Math.sin(t * 6 + strandI * 1.3) * 16;
          const cp1x = px + (destX - px) * 0.35;
          const cp1y = py - 40 + wave;
          const cp2x = destX - (destX - px) * 0.35;
          const cp2y = destY + 30 - wave;

          // Glowing puppet filament line
          ctx.strokeStyle = palette.primary;
          ctx.lineWidth = 1.8;
          ctx.globalAlpha = proximityAlpha * 0.8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, destX, destY);
          ctx.stroke();

          // White core filament thread
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.9;
          ctx.globalAlpha = proximityAlpha * 0.95;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, destX, destY);
          ctx.stroke();

          // Traveling Spark Packet along puppet string
          const sparkT = (t * 2.2 + strandI * 0.2) % 1.0;
          const u = 1 - sparkT;
          const sparkX = u*u*u*px + 3*u*u*sparkT*cp1x + 3*u*sparkT*sparkT*cp2x + sparkT*sparkT*sparkT*destX;
          const sparkY = u*u*u*py + 3*u*u*sparkT*cp1y + 3*u*sparkT*sparkT*cp2y + sparkT*sparkT*sparkT*destY;

          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = palette.glow;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Docking pip on target window
          ctx.fillStyle = palette.primary;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(destX, destY, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        });
      }
    });
  }

  /**
   * Animates glowing spark packets along the active filament splines
   */
  renderTravelingSparks(curves, palette) {
    if (!curves || curves.length === 0) return;
    const ctx = this.ctx;

    this.sparks.forEach(spark => {
      spark.progress += spark.speed;
      if (spark.progress > 1.0) {
        spark.progress = 0;
        spark.strandIdx = Math.floor(Math.random() * curves.length);
      }

      const curve = curves[spark.strandIdx % curves.length];
      if (!curve) return;

      const t = spark.progress;
      // Quadratic Bézier formula: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const invT = 1.0 - t;
      const x = invT * invT * curve.startX + 2 * invT * t * curve.ctrlX + t * t * curve.endX;
      const y = invT * invT * curve.startY + 2 * invT * t * curve.ctrlY + t * t * curve.endY;

      // Draw spark
      ctx.fillStyle = palette.sparks;
      ctx.beginPath();
      ctx.arc(x, y, spark.size, 0, Math.PI * 2);
      ctx.fill();

      // Spark halo
      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.arc(x, y, spark.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
