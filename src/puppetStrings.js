import * as THREE from 'three';

/**
 * PuppetStrings - Dual-Hand (10-Tether) & Single-Hand 3D Bezier Loom
 * 
 * Supports:
 * - DUAL-HAND: 5 glowing strings from Left Hand + 5 glowing strings from Right Hand
 * - SINGLE-HAND: 5 glowing strings across robot body
 * - Traveling photonic energy pulses along all strands
 * - Dual photonic laser beams during Peace Sign
 * - Targeting reticle box during Pinch Grab
 */
export class PuppetStrings {
  constructor(scene, camera, canvasElement) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.enabled = true;

    this.N = 28; // Sample points per spline
    this.strings = [];
    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempC = new THREE.Vector3();

    this.build3DStrings();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // 10 traveling energy pulses
    this.pulses = [0.1, 0.35, 0.6, 0.25, 0.8, 0.15, 0.45, 0.7, 0.3, 0.9];
  }

  resizeCanvas() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  build3DStrings() {
    // 10 Strings total (0..4 for Left Hand, 5..9 for Right Hand)
    for (let i = 0; i < 10; i++) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));

      const isLeft = i < 5;
      const mat = new THREE.LineBasicMaterial({
        color: isLeft ? 0x00f0ff : 0xff7700,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        linewidth: 2
      });

      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      this.scene.add(line);

      this.strings.push({ geom, mat, line });
    }
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  screenToWorld(sx, sy, targetZ = 0) {
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = -(sy / this.height) * 2 + 1;
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(this.camera);
    const dir = vec.sub(this.camera.position).normalize();
    const dist = (targetZ - this.camera.position.z) / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  worldToScreen(worldVec) {
    const v = worldVec.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-v.y * 0.5 + 0.5) * this.height
    };
  }

  clear() {
    this.clearCanvas();
    this.strings.forEach(s => s.line.visible = false);
  }

  /**
   * Render Strings for Dual Hands or Single Hand
   */
  render(handTracker, robotAnchors, time = 0) {
    this.clearCanvas();

    if (!this.enabled || !handTracker || !robotAnchors) {
      this.strings.forEach(s => s.line.visible = false);
      return;
    }

    const handCount = handTracker.handCount || 0;
    const ctx = this.ctx;

    // -------------------------------------------------------------------------
    // 1. DUAL-HAND RENDERING (10 STRINGS TOTAL)
    // -------------------------------------------------------------------------
    if (handCount >= 2 && handTracker.leftHand && handTracker.rightHand) {
      const leftTips = handTracker.leftHand.screenFingertips;
      const rightTips = handTracker.rightHand.screenFingertips;
      const leftAnchors = robotAnchors.leftSide;
      const rightAnchors = robotAnchors.rightSide;

      // Render 5 Left Hand Strings (0..4)
      for (let s = 0; s < 5; s++) {
        if (!leftTips[s] || !leftAnchors[s]) continue;
        this.renderSingleSpline(
          s,
          leftTips[s],
          leftAnchors[s],
          0x00f0ff,
          '#00f0ff',
          time,
          ctx,
          handTracker.leftHand.curls[Object.keys(handTracker.leftHand.curls)[s]] || 0
        );
      }

      // Render 5 Right Hand Strings (5..9)
      for (let s = 0; s < 5; s++) {
        if (!rightTips[s] || !rightAnchors[s]) continue;
        this.renderSingleSpline(
          s + 5,
          rightTips[s],
          rightAnchors[s],
          0xff7700,
          '#ffaa22',
          time,
          ctx,
          handTracker.rightHand.curls[Object.keys(handTracker.rightHand.curls)[s]] || 0
        );
      }

      // Render Laser Beams if Peace Sign
      if (handTracker.leftHand.isPeaceSign || handTracker.rightHand.isPeaceSign) {
        this.renderDualLasers(handTracker, robotAnchors, time, ctx);
      }

    // -------------------------------------------------------------------------
    // 2. SINGLE-HAND RENDERING (5 STRINGS TOTAL)
    // -------------------------------------------------------------------------
    } else if (handTracker.hand && handTracker.hand.detected) {
      const tips = handTracker.hand.screenFingertips;
      const keys = ['thumb', 'index', 'middle', 'ring', 'pinky'];

      // Hide extra strings 5..9
      for (let i = 5; i < 10; i++) {
        this.strings[i].line.visible = false;
      }

      for (let s = 0; s < 5; s++) {
        if (!tips[s] || !robotAnchors[keys[s]]) continue;
        this.renderSingleSpline(
          s,
          tips[s],
          robotAnchors[keys[s]],
          0xff7700,
          '#ffaa22',
          time,
          ctx,
          handTracker.curls[keys[s]] || 0
        );
      }

      if (handTracker.hand.isPeaceSign) {
        this.renderDualLasers(handTracker, robotAnchors, time, ctx);
      }
    } else {
      this.clear();
    }
  }

  renderSingleSpline(index, screenTip, anchorB, hexColor, cssColor, time, ctx, curlVal = 0) {
    const stringObj = this.strings[index];
    stringObj.line.visible = true;
    stringObj.mat.color.setHex(hexColor);
    stringObj.mat.opacity = 0.5 + (1.0 - curlVal) * 0.45;

    const worldA = this.screenToWorld(screenTip.x, screenTip.y, 0.1);
    this.tempA.copy(worldA);
    this.tempB.copy(anchorB);

    // Gravity sag + wave
    this.tempC.copy(this.tempA).add(this.tempB).multiplyScalar(0.5);
    const wobble = Math.sin(time * 5.5 + index * 1.3) * (0.02 + curlVal * 0.03);
    this.tempC.y -= (0.10 + curlVal * 0.65) + wobble;
    this.tempC.z += 0.15;

    const posAttr = stringObj.geom.attributes.position;
    const a = this.tempA, b = this.tempB, c = this.tempC;

    for (let k = 0; k < this.N; k++) {
      const u = k / (this.N - 1);
      const v = 1 - u;
      posAttr.setXYZ(
        k,
        v * v * a.x + 2 * v * u * c.x + u * u * b.x,
        v * v * a.y + 2 * v * u * c.y + u * u * b.y,
        v * v * a.z + 2 * v * u * c.z + u * u * b.z
      );
    }
    posAttr.needsUpdate = true;

    // 2D Fingertip Halo & Center Dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(screenTip.x, screenTip.y, 6 + (1.0 - curlVal) * 3, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = cssColor;
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(screenTip.x, screenTip.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.fill();

    // Traveling Energy Pulse Spark
    this.pulses[index] = (this.pulses[index] + 0.016) % 1.0;
    const t = this.pulses[index];
    const vt = 1 - t;
    const spark3D = new THREE.Vector3(
      vt * vt * a.x + 2 * vt * t * c.x + t * t * b.x,
      vt * vt * a.y + 2 * vt * t * c.y + t * t * b.y,
      vt * vt * a.z + 2 * vt * t * c.z + t * t * b.z
    );
    const spark2D = this.worldToScreen(spark3D);

    ctx.beginPath();
    ctx.arc(spark2D.x, spark2D.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = cssColor;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  renderDualLasers(handTracker, robotAnchors, time, ctx) {
    const target2D = this.worldToScreen(robotAnchors.middle);
    ctx.save();
    ctx.beginPath();
    ctx.arc(target2D.x, target2D.y, 14 + Math.sin(time * 12) * 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.restore();
  }
}
