"""Throwaway browser comparison of the native Progress/Home screens.

Run: python3 src/features/progress/prototypes/mileage-placement.prototype.py
All navigation and sample data stay in browser memory. Never serves app data.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import os

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PORT = 8787
FONTS = {
    "/regular.ttf": "Inter_400Regular.ttf",
    "/medium.ttf": "Inter_500Medium.ttf",
    "/bold.ttf": "Inter_700Bold.ttf",
}


class PrototypeHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/progress"):
            data = (HERE / "mileage-placement.prototype.html").read_bytes()
            content_type = "text/html; charset=utf-8"
        elif path in FONTS:
            data = (ROOT / "node_modules/@expo-google-fonts/inter" / FONTS[path]).read_bytes()
            content_type = "font/ttf"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    if os.environ.get("NODE_ENV") == "production":
        raise SystemExit("This throwaway prototype only runs in development.")
    print(f"Mileage placement prototype: http://localhost:{PORT}/progress?variant=A", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), PrototypeHandler).serve_forever()
