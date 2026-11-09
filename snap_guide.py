import subprocess, os

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out_guide = os.path.abspath(r"C:\Users\MSI\.gemini\antigravity\brain\8f80e9dd-ab58-44b9-8819-9ea3c3022411\hand_signs_guide_verified.png")

# Open guide modal automatically via JS query or URL
cmd = [
    chrome,
    "--headless=new",
    "--disable-gpu",
    "--window-size=1280,720",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=3000",
    f"--screenshot={out_guide}",
    "http://localhost:5173/?autostart=demo&guide=1"
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Guide screenshot return code:", res.returncode)
if os.path.exists(out_guide):
    print("SUCCESS: hand_signs_guide_verified.png exists, size:", os.path.getsize(out_guide))
