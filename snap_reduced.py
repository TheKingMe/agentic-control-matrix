import subprocess, os

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out_zoom = os.path.abspath(r"C:\Users\MSI\.gemini\antigravity\brain\8f80e9dd-ab58-44b9-8819-9ea3c3022411\reduced_zoom_verified.png")

cmd = [
    chrome,
    "--headless=new",
    "--disable-gpu",
    "--window-size=1280,720",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=4000",
    f"--screenshot={out_zoom}",
    "http://localhost:5173/?autostart=demo"
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Zoom screenshot return code:", res.returncode)
if os.path.exists(out_zoom):
    print("SUCCESS: reduced_zoom_verified.png exists, size:", os.path.getsize(out_zoom))
