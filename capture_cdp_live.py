import subprocess
import time
import os
import json
import urllib.request
import base64
import socket

def make_ws_handshake(host, port, path):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    key = base64.b64encode(os.urandom(16)).decode('ascii')
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode('ascii'))
    resp = s.recv(4096)
    if b"101" not in resp:
        raise Exception("WebSocket handshake failed: " + resp.decode('utf-8', errors='ignore'))
    return s

def send_ws_frame(s, text):
    data = text.encode('utf-8')
    length = len(data)
    frame = bytearray()
    frame.append(0x81) # fin, text frame
    mask_key = os.urandom(4)
    if length <= 125:
        frame.append(0x80 | length)
    elif length <= 65535:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, 'big'))
    else:
        frame.append(0x80 | 127)
        frame.extend(length.to_bytes(8, 'big'))
    frame.extend(mask_key)
    masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data))
    frame.extend(masked)
    s.sendall(frame)

def recv_ws_frame(s):
    header = s.recv(2)
    if not header:
        return None
    b1, b2 = header[0], header[1]
    masked = bool(b2 & 0x80)
    length = b2 & 0x7f
    if length == 126:
        length = int.from_bytes(s.recv(2), 'big')
    elif length == 127:
        length = int.from_bytes(s.recv(8), 'big')
    
    if masked:
        mask_key = s.recv(4)
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(length - len(data))
        if not chunk: break
        data.extend(chunk)
    if masked:
        data = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data))
    return data.decode('utf-8', errors='ignore')

def main():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data = os.path.abspath("./tmp_cdp_profile")
    os.makedirs(user_data, exist_ok=True)
    screenshot_dest = os.path.abspath(r"C:\Users\MSI\.gemini\antigravity\brain\8f80e9dd-ab58-44b9-8819-9ea3c3022411\matrix_live_demo.png")

    proc = subprocess.Popen([
        chrome_path,
        "--headless=new",
        "--remote-debugging-port=9222",
        f"--user-data-dir={user_data}",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1280,720",
        "http://localhost:5173/"
    ])

    time.sleep(2.5)
    try:
        req = urllib.request.urlopen("http://localhost:9222/json")
        tabs = json.loads(req.read().decode())
        ws_url = tabs[0]["webSocketDebuggerUrl"]
        path = ws_url.split("localhost:9222")[1]
        ws = make_ws_handshake("localhost", 9222, path)
        print("Connected to Chrome CDP WebSocket!")

        # Click demo button
        click_cmd = json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": "document.getElementById('btn-start-demo')?.click();"}
        })
        send_ws_frame(ws, click_cmd)
        resp1 = recv_ws_frame(ws)
        print("Clicked DEMO stream button, resp:", resp1[:100] if resp1 else "None")

        # Wait 4 seconds for video to play and MediaPipe + Three.js to render
        time.sleep(4.0)

        # Capture screenshot
        snap_cmd = json.dumps({
            "id": 2,
            "method": "Page.captureScreenshot",
            "params": {"format": "png"}
        })
        send_ws_frame(ws, snap_cmd)
        
        while True:
            resp_str = recv_ws_frame(ws)
            if not resp_str: break
            msg = json.loads(resp_str)
            if msg.get("id") == 2:
                data_b64 = msg["result"]["data"]
                img_data = base64.b64decode(data_b64)
                with open(screenshot_dest, "wb") as f:
                    f.write(img_data)
                print("Successfully captured screenshot:", screenshot_dest, "Bytes:", len(img_data))
                break

    except Exception as e:
        print("Error during CDP execution:", e)
    finally:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    main()
