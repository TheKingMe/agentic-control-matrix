# ⚡ AGENTIC CONTROL MATRIX // Holographic Cyber-Puppet Interface

[![Three.js](https://img.shields.io/badge/Three.js-r187-00f0ff?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Vision_AI-ffaa22?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebGL](https://img.shields.io/badge/WebGL-2.0_Shader-00ff88?style=for-the-badge&logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![License](https://img.shields.io/badge/License-MIT-9d4edd?style=for-the-badge)](LICENSE)

> A futuristic, sci-fi augmented-reality web interface where your fingers directly teleoperate an articulated 3D Cyber Android robot in real time. Features glowing Bezier puppet strings, dual laser launch beams, rotating concentric holographic floor rings, live telemetry cards, and multi-camera support (Webcam, DroidCam & OBS Virtual Camera).

---

## 🌟 Key Features

* **🖐️ Finger-to-Limb Direct Kinematics:** Every finger is mapped to an anatomical robot piece (Thumb $\to$ Right Arm, Index $\to$ Left Arm, Middle $\to$ Legs/Walk, Ring $\to$ Body Yaw, Pinky $\to$ Jump & Crouch).
* **🧵 Dynamic 10-Tether Bezier Loom:** Glowing Catmull-Rom Bezier filaments tether each fingertip to live 3D skeletal bones with travelling electrical spark pulses.
* **🤖 Fully Articulated 3D Android (`robot.glb`):** Real-time bone transformations for shoulders, upper arms, elbows, head, and torso with seamless blending into idle, walk, run, and wave animations.
* **⚡ Sci-Fi Holographic HUD & Blueprint Cards:** 4 live corner cards (Patterns & Feed, Pinch Lock, Orbit Yaw, Photonic Beams), live framerate counter, and real-time finger curl progress bars.
* **📱 DroidCam & OBS Virtual Camera Ready:** Built-in multi-camera selector modal with automatic conflict detection and one-click switching.
* **🎥 Interactive Staging & Smooth Zoom:** Mouse-wheel continuous zoom, preset framing buttons, and mirror/pivot tracking modes.
* **🧠 Pluggable AI Agent Brain:** Built-in sci-fi terminal with typewriter cadence, plus optional Anthropic Claude API streaming mode.

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have **Node.js** (v18 or higher) installed:
```bash
node -v
```

### 2. Clone & Install
```bash
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
cd <YOUR_REPO_NAME>
npm install
```

### 3. Run Development Server
```bash
npm run dev
```
Open **`http://localhost:5173`** in Google Chrome or any Chromium-based browser.

### 4. Build for Production
```bash
npm run build
npm run preview
```

---

## 🎮 Finger & Gesture Control Cheatsheet

| Finger / Gesture | Robot Joint / Action | Reaction & Kinematics |
| :--- | :--- | :--- |
| **👍 Thumb** | **Right Arm & Elbow** | **Stick Thumb Out:** Raises Right Arm up to 160° with elbow flex.<br>**Fold Thumb In:** Lowers arm smoothly to side. |
| **☝️ Index** | **Left Arm & Elbow** | **Point Index Up:** Raises Left Arm up to 160° with elbow flex.<br>**Curl Index Down:** Lowers arm smoothly to side. |
| **🖕 Middle** | **Legs (Walk / Run)** | **Curl / Pulse Middle:** Drives humanoid walking and running strides.<br>**Keep Straight:** Robot stands in grounded stance. |
| **💍 Ring** | **Body Yaw Rotation** | Torso rotates left and right smoothly with hand angle. |
| **🤙 Pinky** | **Elevation (Jump / Crouch)** | **Extend Pinky High:** Leaps robot high into the air.<br>**Curl Pinky Deep:** Crouches robot down to the floor. |
| **🖐️ Open Palm** | **Standby & Puppet Strings** | Connects 5 (or 10) glowing Bezier filaments from fingertips to robot joints. |
| **👌 Pinch (Thumb+Index)**| **Target Lock & Heavy Lift** | Locks amber targeting reticle. Rapid upward lift triggers **Heavy Lift**. |
| **✌️ Peace Sign (V)** | **Launch Laser Beams** | Emits concentrated dual photonic lasers from index and middle fingertips. |
| **✊ Closed Fist** | **Shield / Emergency Stop** | Freezes robot instantly into defensive crouch and clears task queue. |

---

## 📱 DroidCam & OBS Virtual Camera Setup

If you want to use your phone's camera instead of a built-in webcam:

### Method A: Stream via OBS Virtual Camera (Recommended)
1. Add your **DroidCam** as a Video Capture Device in **OBS Studio**.
2. In the bottom-right **Controls** panel of OBS Studio, click **"Start Virtual Camera"**.
3. In this web app, click the bottom dock button **`📷 CAM: SELECT`** and choose **`🎥 OBS Virtual Camera`**.

### Method B: Direct DroidCam in Chrome
1. **Close OBS Studio completely** (Windows DirectShow locks camera drivers to one program at a time).
2. In this web app, click **`📷 CAM: SELECT`** and select **`📱 DroidCam Video`**.

---

## 🛠️ Tech Stack & Architecture

```
├── assets/
│   ├── models/robot.glb         # 3D Cyber Android Skinned Mesh & Animations
│   ├── models/hand_landmarker   # MediaPipe Tasks-Vision Offline Model
│   ├── wasm/                    # Local WebAssembly vision binaries
├── src/
│   ├── main.js                  # Engine bootstrap, render loop & camera stream
│   ├── robot.js                 # Kinematics engine, bone solver & Three.js scene
│   ├── handTracker.js           # MediaPipe HandLandmarker & gesture classifier
│   ├── puppetStrings.js         # Catmull-Rom Bezier glowing string filaments
│   ├── hud.js                   # HUD controller, curl monitors & telemetry cards
│   ├── agentBrain.js            # Terminal agent typewriter & Claude API bridge
│   └── style.css                # Sci-Fi / Cyberpunk neon HUD stylesheet
├── index.html                   # Holographic AR interface markup
└── vite.config.js               # Vite build configuration
```

- **3D Graphics Engine:** [Three.js](https://threejs.org/) (Perspective Camera, Directional & Ambient Lighting, GLTF AnimationMixer, Bone Kinematics)
- **Computer Vision:** Google [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) HandLandmarker (21 landmarks, dual-hand 42-point tracker, GPU delegate)
- **Bundler & Dev Server:** [Vite](https://vitejs.dev/)

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
