"""
api/py_live.py — Vercel Python Serverless Function (sin1 — Singapura)
100% Pure Python untuk:
- Auto-Scan produk baru tidak ada di DB (QR 2663005FS / Barcode / SKU)
- Turbo Matrix Live Stock per artikel (< 0,6 dtk)
- Studio Image Healer & StoreHub Cookie Auto-Refresh
Berbagi modul tunggal `python-engine/storehub_live_engine.py` dengan GitHub Actions!
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

from storehub_live_engine import handle_live_request  # noqa: E402


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
                res = handle_live_request({"action": "health"})
                _send_json(self, 200, res)
                return

            action = qs.get("action", ["scan"])[0]
            sku = qs.get("sku", qs.get("code", [""]))[0]
            pref = qs.get("preferredAccount", [None])[0]
            res = handle_live_request({"action": action, "sku": sku, "preferredAccount": pref})
            _send_json(self, 200, res)
        except Exception as e:
            _send_json(self, 500, {"success": False, "error": str(e), "source": "PYTHON_LIVE_ENGINE"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw.decode("utf-8", errors="ignore") or "{}")
            if not isinstance(payload, dict):
                payload = {}
            res = handle_live_request(payload)
            _send_json(self, 200, res)
        except Exception as e:
            _send_json(self, 500, {"success": False, "error": str(e), "source": "PYTHON_LIVE_ENGINE"})
