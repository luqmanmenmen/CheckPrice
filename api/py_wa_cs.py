"""
api/py_wa_cs.py — Vercel Python Serverless Function (sin1 — Singapura)
100% Pure Python AI Customer Service Engine untuk WhatsApp Grup Eksklusif & Dummy:
- Master ON/OFF Switch + Auto-Schedule Jam Toko WIB
- 100% Blokir Chat Pribadi + Whitelist Grup Ketat + Auto-Detect Grup Baru
- Pencarian Produk Turso DB + Foto HD Resmi (Anti-Logo Abu-Abu)
- Hard Privacy Sanitizer: NOL angka qty stok, hanya READY / SOLD OUT!
"""

import json
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY_ENGINE_DIR = os.path.join(ROOT_DIR, "python-engine")
if PY_ENGINE_DIR not in sys.path:
    sys.path.insert(0, PY_ENGINE_DIR)

from wa_cs_engine import handle_wa_cs_request  # noqa: E402


def _send_json(handler_obj: BaseHTTPRequestHandler, status: int, data: dict) -> None:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler_obj.send_response(status)
    handler_obj.send_header("Content-Type", "application/json; charset=utf-8")
    handler_obj.send_header("Cache-Control", "no-store")
    handler_obj.send_header("Content-Length", str(len(body)))
    handler_obj.end_headers()
    handler_obj.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            if qs.get("health", [""])[0] in ("1", "true", "yes") or not qs:
                res = handle_wa_cs_request({"action": "health"})
                _send_json(self, 200, res)
                return

            secret = self.headers.get("X-WA-CS-Secret") or qs.get("secret", [""])[0]
            action = qs.get("action", ["health"])[0]
            res = handle_wa_cs_request({"action": action}, header_secret=secret)
            status = int(res.get("status") or 200)
            _send_json(self, status, res)
        except Exception as e:
            _send_json(self, 500, {"success": False, "error": str(e), "source": "PYTHON_WA_CS_ENGINE"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw.decode("utf-8", errors="ignore") or "{}")
            if not isinstance(payload, dict):
                payload = {}
            secret = self.headers.get("X-WA-CS-Secret") or self.headers.get("Authorization", "").replace("Bearer ", "")
            res = handle_wa_cs_request(payload, header_secret=secret)
            status = int(res.get("status") or 200)
            _send_json(self, status, res)
        except Exception as e:
            _send_json(self, 500, {"success": False, "error": str(e), "source": "PYTHON_WA_CS_ENGINE"})
