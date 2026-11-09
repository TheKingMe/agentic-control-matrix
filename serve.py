#!/usr/bin/env python3
"""
Cyberpunk Holographic AR Server
Serves the web application on http://localhost:8080 with proper MIME types and auto-opens browser.
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS and cross-origin headers for WebAssembly / SharedArrayBuffer if needed
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        # Ensure correct MIME type for ES modules and MP4 video
        if path.endswith('.js') or path.endswith('.mjs'):
            return 'application/javascript'
        if path.endswith('.wasm'):
            return 'application/wasm'
        if path.endswith('.task'):
            return 'application/octet-stream'
        if path.endswith('.glb'):
            return 'model/gltf-binary'
        if path.endswith('.gltf'):
            return 'model/gltf+json'
        if path.endswith('.mp4'):
            return 'video/mp4'
        if path.endswith('.css'):
            return 'text/css'
        return super().guess_type(path)

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    handler = CustomHTTPRequestHandler
    
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 65)
        print("  ✦ HOLOGRAPHIC AR INTERFACE SERVER ONLINE ✦")
        print(f"  URL: {url}")
        print("  Press Ctrl+C to terminate server.")
        print("=" * 65)
        
        # Auto-open browser
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)

if __name__ == "__main__":
    main()
