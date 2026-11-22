"""
runner_guardian.py
=============================================================================
Guardian Wrapper & Live Console Streamer untuk GitHub Actions Python Engine.
Tanggung jawab:
1. Streaming log eksekusi asli baris-per-baris (`stdout`/`stderr`) ke
   Supabase Storage (`excel-uploads/logs/live-runner-log.json`) agar terminal
   Admin Panel menampilkan pembacaan kode nyata secara realtime.
2. Audit produk baru (`--track-new-products`) memakai indeks B-Tree primary key
   (`Product.id > baseline_max_id`) tanpa full-table scan: menghitung jumlah SKU
   baru ter-add, jumlah artikel baru, serta sampel produk yang baru masuk DB.
3. Diagnosa Bug & Error Otomatis (`AUTH_EXPIRED`, `MISSING_DEPENDENCY`,
   `GEMINI_QUOTA_OR_503`, `DB_OR_NETWORK_TRANSIENT`, `STORAGE_OR_FILE_CORRUPT`,
   `STORE_OFFLINE`, `CODE_EXCEPTION` lengkap dengan `file:line` Traceback).
4. Self-Healing & Auto-Retry hingga sukses (memperbarui sesi StoreHub dengan
   urutan multipart React 19 `_1_*` sebelum `'0'`, install pip missing module,
   bypass Gemini fallback ke fast-path, serta exponential backoff DB/network).
=============================================================================
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.append(str(SCRIPT_DIR))

from build_offline_snapshot import (  # noqa: E402
    _connect_postgres,
    _load_env_files,
    _storage_upload,
    _supabase_credentials,
)

STOREHUB_BASE = "https://storehub.mdsretailing.id"
LOGIN_URL = f"{STOREHUB_BASE}/login?next=%2F"
ACTION_LOGIN_DEFAULT = "603f9b4dfafaa0e65eec411a818c1ebcaa476b889f"
MAX_LOG_LINES = 600
MAX_TRACE_FILES = 12


def _now_wib() -> datetime:
    return datetime.now(timezone(timedelta(hours=7)))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_env_loaded() -> None:
    _load_env_files()
    for name in (".env", ".env.production", ".env.local"):
        env_path = ROOT_DIR / name
        if not env_path.exists():
            continue
        try:
            with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    s = line.strip()
                    if not s or s.startswith("#") or "=" not in s:
                        continue
                    k, v = s.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
        except Exception:
            pass


def sanitize_log_line(line: str) -> str:
    """Sensor kredensial/token/connection string sebelum log ditulis ke Storage."""
    text = line.rstrip("\r\n")
    if not text:
        return ""

    text = re.sub(r"mso_session=[^\s;\"']+", "mso_session=***MASKED***", text)
    text = re.sub(r"postgres(?:ql)?://[^\s\"']+", "postgresql://***MASKED***", text, flags=re.IGNORECASE)
    text = re.sub(r"\bghp_[A-Za-z0-9]{12,}", "ghp_***MASKED***", text)
    text = re.sub(r"\bgithub_pat_[A-Za-z0-9_]{16,}", "github_pat_***MASKED***", text)
    text = re.sub(r"\bAIza[A-Za-z0-9_\-]{16,}", "AIza***MASKED***", text)

    for secret_env in ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "DATABASE_URL", "DIRECT_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "MDS_PASSWORD"):
        val = (os.environ.get(secret_env) or "").strip()
        if val and len(val) >= 8 and val in text:
            text = text.replace(val, f"***{secret_env}***")

    # Samarkan nama sumber internal agar tidak terekspos di UI Console Log
    text = re.sub(r"https?://storehub\.mdsretailing\.id[^\s\"']*", "https://luqman.org", text, flags=re.IGNORECASE)
    text = re.sub(r"storehub\.mdsretailing\.id", "luqman.org", text, flags=re.IGNORECASE)
    text = re.sub(r"(?:https?://)?(?:www\.)?matahari\.com", "luqman org", text, flags=re.IGNORECASE)
    text = re.sub(r"MDS\s*[-]?\s*BISA", "luqman org", text, flags=re.IGNORECASE)
    text = re.sub(r"\bStoreHub\b", "luqman org", text, flags=re.IGNORECASE)
    text = re.sub(r"\bMatahari\b", "luqman org", text, flags=re.IGNORECASE)

    return text


def classify_line_level(text: str) -> str:
    """Klasifikasi level warna terminal frontend."""
    low = text.lower()
    if (
        "traceback" in low
        or "[error]" in low
        or "error:" in low
        or "❌" in text
        or "exception" in low
        or "gagal total" in low
    ):
        return "error"
    if "[heal]" in low or "[auto-heal]" in low or "[guardian]" in low:
        return "heal"
    if (
        "[db" in low
        or "artikel baru:" in low
        or "sku baru:" in low
        or "baru: +" in low
        or "[sync" in low
    ):
        return "db"
    if "[warn" in low or "⚠️" in text or "warning" in low:
        return "warn"
    if "🎉" in text or "✅" in text or "[sukses]" in low or "selesai" in low:
        return "success"
    return "info"


def fetch_existing_log(log_path: str) -> Dict[str, Any]:
    """Unduh file log JSON eksisting dari Turso Cloud Storage jika masih untuk runId yang sama."""
    try:
        from turso_db import storage_download_json
        return storage_download_json(log_path)
    except Exception:
        return {}


def push_log_state(log_state: Dict[str, Any], log_path: str) -> bool:
    """Unggah live runner log JSON ke Turso Cloud Storage."""
    try:
        from turso_db import storage_upload
        log_state["updatedAt"] = _now_iso()
        if len(log_state.get("lines", [])) > MAX_LOG_LINES:
            log_state["lines"] = log_state["lines"][-MAX_LOG_LINES:]
        raw = json.dumps(log_state, ensure_ascii=False).encode("utf-8")
        storage_upload(log_path, raw, content_type="application/json")
        return True
    except Exception as exc:
        print(f"⚠️ [GUARDIAN] Gagal mengunggah live console log ke Turso Storage: {exc}", flush=True)
        return False


def query_db_baseline() -> Tuple[int, int]:
    """Ambil MAX(id) secara O(1) via PK index + total SKU dari manifest.json (hemat 310rb rows read COUNT(*)!)."""
    if not (os.environ.get("TURSO_DATABASE_URL") or os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL")):
        return 0, 0
    conn = None
    try:
        conn = _connect_postgres()
        cur = conn.cursor()
        cur.execute('SELECT COALESCE(MAX(id), 0) FROM "Product"')
        max_id = int(cur.fetchone()[0] or 0)
        if getattr(conn, "is_turso", False):
            # Hindari SELECT COUNT(*) FROM Product (310k rows read di SQLite): baca manifest.json (1 row read!)
            manifest = storage_download_json("offline-db/manifest.json")
            total_est = int(manifest.get("totalSkus") or 0) if isinstance(manifest, dict) else 0
        else:
            cur.execute("SELECT GREATEST(reltuples::bigint, 0)::bigint FROM pg_class WHERE relname = 'Product'")
            row = cur.fetchone()
            total_est = int(row[0] or 0) if row else 0
        cur.close()
        return max_id, total_est
    except Exception as exc:
        print(f"⚠️ [GUARDIAN] Tidak bisa baca baseline DB: {exc}", flush=True)
        return 0, 0
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def query_new_products_since(baseline_id: int) -> Dict[str, Any]:
    """Hitung jumlah SKU & Artikel baru ter-add ke DB memakai indeks PK id > baseline_id."""
    result: Dict[str, Any] = {
        "newSkusAdded": 0,
        "newArticlesAdded": 0,
        "samples": [],
    }
    if baseline_id <= 0 or not (os.environ.get("TURSO_DATABASE_URL") or os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL")):
        return result
    conn = None
    try:
        conn = _connect_postgres()
        cur = conn.cursor()
        cur.execute(
            '''
            SELECT
              COUNT(*),
              COUNT(DISTINCT NULLIF(TRIM(article), ''))
            FROM "Product"
            WHERE id > %s
            ''',
            (baseline_id,),
        )
        counts = cur.fetchone()
        new_skus = int(counts[0] or 0) if counts else 0
        new_articles = int(counts[1] or 0) if counts else 0
        samples: List[Dict[str, Any]] = []
        if new_skus > 0:
            cur.execute(
                '''
                SELECT sku, article, description, brand, color, size, stok
                FROM "Product"
                WHERE id > %s
                ORDER BY id DESC
                LIMIT 12
                ''',
                (baseline_id,),
            )
            for row in cur.fetchall():
                samples.append({
                    "sku": row[0],
                    "article": row[1],
                    "description": row[2],
                    "brand": row[3],
                    "color": row[4],
                    "size": row[5],
                    "stok": int(row[6] or 0),
                })
        cur.close()
        result["newSkusAdded"] = new_skus
        result["newArticlesAdded"] = new_articles
        result["samples"] = samples
        return result
    except Exception as exc:
        print(f"⚠️ [GUARDIAN] Gagal audit produk baru sejak ID {baseline_id}: {exc}", flush=True)
        return result
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def append_log_entry(log_state: Dict[str, Any], step: str, text: str, level: Optional[str] = None) -> None:
    clean = sanitize_log_line(text)
    if not clean:
        return
    log_state.setdefault("lines", []).append({
        "ts": _now_wib().strftime("%H:%M:%S"),
        "step": step,
        "level": level or classify_line_level(clean),
        "text": clean,
    })
    if len(log_state["lines"]) > MAX_LOG_LINES:
        log_state["lines"] = log_state["lines"][-MAX_LOG_LINES:]


def init_run_log(action: str, log_path: str) -> Dict[str, Any]:
    run_id = str(os.environ.get("GITHUB_RUN_ID") or f"local-{int(time.time())}")
    run_number = str(os.environ.get("GITHUB_RUN_NUMBER") or "0")
    existing = fetch_existing_log(log_path)
    if existing and str(existing.get("runId") or "") == run_id and existing.get("dbBaselineMaxId"):
        return existing

    max_id, total_est = query_db_baseline()
    state: Dict[str, Any] = {
        "runId": run_id,
        "runNumber": run_number,
        "action": action,
        "startedAt": _now_iso(),
        "updatedAt": _now_iso(),
        "status": "running",
        "currentStep": "Inisialisasi Guardian Engine",
        "dbBaselineMaxId": max_id,
        "dbTotalSkus": total_est,
        "newProductsSummary": {
            "newSkusAdded": 0,
            "newArticlesAdded": 0,
            "samples": [],
        },
        "stepReports": [],
        "diagnostics": [],
        "healsApplied": [],
        "lines": [],
    }
    msg = (
        f"[GUARDIAN] 🛡️ Memulai Run #{run_number} (action={action}) | "
        f"Baseline DB: {total_est:,} SKU (MAX id={max_id:,})"
    )
    print(msg, flush=True)
    append_log_entry(state, "GUARDIAN INIT", msg, "db")
    push_log_state(state, log_path)
    return state


def extract_python_traceback(step_lines: List[str]) -> Optional[Dict[str, Any]]:
    """Ekstrak detail File, Line, ExceptionType, dan Message dari Python Traceback."""
    joined = "\n".join(step_lines[-120:])
    if "Traceback (most recent call last):" not in joined:
        return None
    tb_block = joined.split("Traceback (most recent call last):")[-1]
    file_matches = re.findall(r'File "([^"]+)", line (\d+), in ([^\n]+)', tb_block)
    last_lines = [ln.strip() for ln in tb_block.strip().splitlines() if ln.strip()]
    exc_line = last_lines[-1] if last_lines else ""
    exc_type = ""
    exc_msg = exc_line
    if ":" in exc_line:
        parts = exc_line.split(":", 1)
        exc_type = parts[0].strip()
        exc_msg = parts[1].strip()
    target_file = file_matches[-1][0] if file_matches else ""
    target_line = int(file_matches[-1][1]) if file_matches else 0
    return {
        "file": target_file,
        "lineNo": target_line,
        "exceptionType": exc_type or "PythonError",
        "exceptionMsg": exc_msg[:300],
        "snippet": "\n".join(last_lines[-5:])[:500],
    }


def diagnose_output(exit_code: int, step_lines: List[str]) -> Optional[Dict[str, Any]]:
    """Diagnosa akar masalah dari kode keluar dan log eksekusi."""
    joined = "\n".join(step_lines[-150:])
    low = joined.lower()
    tb = extract_python_traceback(step_lines)

    soft_auth = (
        "cookie login storehub tidak ditemukan" in low
        or "mso_session tidak ditemukan" in low
        or "cookie storehub kadaluarsa" in low
    )

    if exit_code == 0 and not soft_auth:
        return None

    if "toko 719 sedang tutup" in low or "no route to host" in low or "unable to open tcp connection" in low:
        return {
            "code": "STORE_OFFLINE",
            "title": "Server Toko Fisik Sedang Offline (Jam Tutup)",
            "detail": "Server luqman org toko fisik tidak merespons (di luar jam operasional ~09:00–21:30 WIB).",
            "retryable": False,
            "traceback": tb,
        }

    if (
        soft_auth
        or "cookie login luqman org tidak ditemukan" in low
        or "cookie luqman org kadaluarsa" in low
        or "mso_session" in low
        or "username dan password wajib diisi" in low
        or "401 unauthorized" in low
        or "next_redirect" in low
        or "$sreact.fragment" in low
        or "action_login" in low
        or "action_detail" in low
    ):
        return {
            "code": "AUTH_EXPIRED",
            "title": "Sesi Cookie / Action Hash luqman org Kedaluwarsa",
            "detail": "Cookie login luqman org atau Next-Action hash ditolak server.",
            "retryable": True,
            "traceback": tb,
        }

    if tb and tb.get("exceptionType") in ("ModuleNotFoundError", "ImportError") or "no module named" in low:
        m = re.search(r"No module named ['\"]([A-Za-z0-9_\-\.]+)['\"]", joined)
        missing_mod = m.group(1) if m else ""
        return {
            "code": "MISSING_DEPENDENCY",
            "title": f"Modul Python Hilang ({missing_mod or 'dependency'})",
            "detail": (tb.get("exceptionMsg") if tb else "Package Python belum terpasang di environment runner."),
            "missingModule": missing_mod,
            "retryable": True,
            "traceback": tb,
        }

    if ("gemini" in low or "genai" in low) and any(tok in low for tok in ("resource_exhausted", "429", "503", "quota")):
        return {
            "code": "GEMINI_QUOTA_OR_503",
            "title": "Gemini AI API Rate Limit / 503",
            "detail": "Google Gemini AI mengembalikan 429/503; sistem dapat beralih ke parser deterministik.",
            "retryable": True,
            "traceback": tb,
        }

    if any(
        tok in low
        for tok in (
            "operationalerror",
            "ssl syscall",
            "server closed the connection",
            "toomanyconnections",
            "readtimeout",
            "connecttimeout",
            "connectionerror",
            "remotedisconnected",
            "connection reset",
            "timed out",
            "502 bad gateway",
            "503 service",
            "504 gateway",
        )
    ):
        return {
            "code": "DB_OR_NETWORK_TRANSIENT",
            "title": "Gangguan Koneksi DB / Jaringan Sementara",
            "detail": (tb.get("exceptionMsg") if tb else "Timeout / putus koneksi jaringan ke PostgreSQL atau target web."),
            "retryable": True,
            "traceback": tb,
        }

    if any(tok in low for tok in ("badzipfile", "storageapierror", "invalidfileexception", "not a zip file")):
        return {
            "code": "STORAGE_OR_FILE_CORRUPT",
            "title": "Berkas Unduhan / Storage Sementara Rusak",
            "detail": (tb.get("exceptionMsg") if tb else "Cache berkas unduhan korup saat diproses."),
            "retryable": True,
            "traceback": tb,
        }

    return {
        "code": "CODE_EXCEPTION",
        "title": f"Error Eksekusi Python ({tb['exceptionType'] if tb else f'exit code {exit_code}'})",
        "detail": (
            f"{os.path.basename(tb['file'])} baris {tb['lineNo']}: {tb['exceptionMsg']}"
            if tb and tb.get("file")
            else (tb.get("exceptionMsg") if tb else f"Proses berhenti dengan exit code {exit_code}.")
        ),
        "retryable": True,
        "traceback": tb,
    }


def _fresh_storehub_login() -> Optional[str]:
    """Auto-login StoreHub menggunakan format multipart React 19 yang benar (`_1_*` sebelum `'0'`)."""
    import requests

    sess = requests.Session()
    action_hash = ACTION_LOGIN_DEFAULT
    try:
        r_page = sess.get(LOGIN_URL, timeout=8)
        scripts = list(dict.fromkeys(re.findall(r'src="(/_next/static/chunks/[^"]+\.js)"', r_page.text)))
        for s_path in scripts[:MAX_TRACE_FILES]:
            try:
                js_txt = sess.get(f"{STOREHUB_BASE}{s_path}", timeout=6).text
                m = re.search(r'createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,160}"login"', js_txt)
                if m:
                    action_hash = m.group(1)
                    break
            except Exception:
                continue
    except Exception:
        pass

    username = os.environ.get("MDS_USERNAME") or "M223515"
    password = os.environ.get("MDS_PASSWORD") or "Mamen123"
    headers = {
        "Accept": "text/x-component",
        "Next-Action": action_hash,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15",
        "Referer": LOGIN_URL,
        "Origin": STOREHUB_BASE,
    }
    # KRUSIAL: `_1_*` WAJIB sebelum `'0'` untuk parser streaming Busboy React 19!
    files = [
        ("_1_next", (None, "/")),
        ("_1_username", (None, username)),
        ("_1_password", (None, password)),
        ("_1_tz", (None, "Asia/Jakarta")),
        ("0", (None, '[{},"$K1"]')),
    ]
    res = sess.post(LOGIN_URL, headers=headers, files=files, allow_redirects=False, timeout=12)
    cookies_dict = res.cookies.get_dict()
    if not cookies_dict and "set-cookie" in res.headers:
        raw_sc = res.headers.get("set-cookie", "")
        parts = [p.split(";")[0].strip() for p in re.split(r",(?=\s*[A-Za-z0-9_-]+=)", raw_sc) if "=" in p.split(";")[0]]
        cookie_str = "; ".join(parts)
    else:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies_dict.items())

    if cookie_str and "mso_session=" in cookie_str:
        try:
            supa_url, supa_key = _supabase_credentials()
            _storage_upload(
                supa_url,
                supa_key,
                "secrets/mds_cookie.txt",
                cookie_str.encode("utf-8"),
                "text/plain",
                cache_control="0",
            )
        except Exception:
            pass
        try:
            (ROOT_DIR / ".mds_cookie").write_text(cookie_str, encoding="utf-8")
        except Exception:
            pass
        return cookie_str
    return None


def attempt_self_heal(
    diagnosis: Dict[str, Any],
    attempt: int,
    child_env: Dict[str, str],
) -> Tuple[bool, bool, str]:
    """
    Lakukan perbaikan otomatis sesuai diagnosa bug.
    Returns: (healed, should_retry, action_taken_message)
    """
    code = diagnosis.get("code", "UNKNOWN")

    if code == "STORE_OFFLINE":
        return False, False, "Server toko fisik tutup — tidak perlu retry memaksa."

    if code == "AUTH_EXPIRED":
        try:
            new_cookie = _fresh_storehub_login()
            if new_cookie and "mso_session=" in new_cookie:
                child_env["MDS_SESSION_COOKIE"] = new_cookie
                return True, True, "Auto-Login ulang luqman org berhasil & cookie Storage diperbarui."
        except Exception as exc:
            return False, attempt < 2, f"Gagal auto-login ulang luqman org ({exc}); tunggu 10s lalu retry."
        time.sleep(8)
        return False, attempt < 2, "Server luqman org belum mengembalikan sesi baru; retry dalam 8s."

    if code == "MISSING_DEPENDENCY":
        req_file = SCRIPT_DIR / "requirements.txt"
        missing_mod = (diagnosis.get("missingModule") or "").split(".")[0]
        try:
            if req_file.exists():
                subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", str(req_file)], check=False)
            if missing_mod and re.match(r"^[A-Za-z0-9_\-]+$", missing_mod):
                subprocess.run([sys.executable, "-m", "pip", "install", "-q", missing_mod], check=False)
            return True, True, f"Menginstal ulang dependensi Python ({missing_mod or 'requirements.txt'})."
        except Exception as exc:
            return False, False, f"Gagal install modul Python: {exc}"

    if code == "GEMINI_QUOTA_OR_503":
        child_env["SKIP_GEMINI_AI"] = "1"
        time.sleep(8)
        return True, True, "Mengaktifkan mode deterministik (SKIP_GEMINI_AI=1) agar bebas rate-limit Gemini."

    if code == "DB_OR_NETWORK_TRANSIENT":
        delay = min(40, 12 * attempt)
        time.sleep(delay)
        db_ok = True
        if os.environ.get("TURSO_DATABASE_URL") or os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL"):
            conn = None
            try:
                conn = _connect_postgres()
                cur = conn.cursor()
                cur.execute("SELECT 1")
                cur.close()
            except Exception:
                db_ok = False
            finally:
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
        status_msg = "Koneksi DB terverifikasi pulih" if db_ok else "Menunggu pemulihan DB"
        return db_ok, True, f"Cooldown jaringan {delay}s selesai ({status_msg}); mencoba ulang step."

    if code == "STORAGE_OR_FILE_CORRUPT":
        for pat_dir in ("/tmp",):
            p = Path(pat_dir)
            if p.exists():
                for tmp_f in p.glob("promo_*.xlsx"):
                    try:
                        tmp_f.unlink()
                    except Exception:
                        pass
        time.sleep(5)
        return True, True, "Membersihkan berkas sementara korup & mengulang unduhan Storage."

    # CODE_EXCEPTION: izinkan 1 retry transien bila masih percobaan ke-1
    if attempt == 1:
        time.sleep(5)
        return True, True, f"Mencoba 1x eksekusi ulang otomatis setelah error ({diagnosis.get('detail', '')[:100]})."

    return False, False, f"Error kode persisten pada: {diagnosis.get('detail', code)}"


def run_guarded_step(args: argparse.Namespace, cmd: List[str]) -> int:
    step_name = args.step
    action_name = args.action
    log_path = args.log_path
    max_retries = max(0, int(args.max_retries))

    log_state = init_run_log(action_name, log_path)
    log_state["status"] = "running"
    log_state["currentStep"] = step_name

    # Refresh estimasi baseline bila sebelumnya kosong
    if not log_state.get("dbBaselineMaxId"):
        max_id, total_est = query_db_baseline()
        if max_id:
            log_state["dbBaselineMaxId"] = max_id
            log_state["dbTotalSkus"] = total_est

    append_log_entry(log_state, step_name, f"▶️ Memulai step: {step_name} (`{' '.join(cmd)}`)", "info")
    push_log_state(log_state, log_path)

    child_env = os.environ.copy()
    child_env["PYTHONUNBUFFERED"] = "1"
    child_env["PYTHONIOENCODING"] = "utf-8"

    final_rc = 1
    total_attempts = 0
    for attempt in range(1, max_retries + 2):
        total_attempts = attempt
        step_lines: List[str] = []
        last_push_ts = time.monotonic()

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=child_env,
            )
        except Exception as exc:
            err_msg = f"❌ [GUARDIAN ERROR] Gagal menjalankan perintah `{cmd}`: {exc}"
            print(err_msg, flush=True)
            append_log_entry(log_state, step_name, err_msg, "error")
            log_state["status"] = "failed"
            push_log_state(log_state, log_path)
            return 1

        if proc.stdout is not None:
            for raw_line in iter(proc.stdout.readline, ""):
                sys.stdout.write(raw_line)
                sys.stdout.flush()
                clean = sanitize_log_line(raw_line)
                if clean:
                    step_lines.append(clean)
                    append_log_entry(log_state, step_name, clean)
                if time.monotonic() - last_push_ts >= 3.5:
                    push_log_state(log_state, log_path)
                    last_push_ts = time.monotonic()

        rc = proc.wait()
        final_rc = rc

        diagnosis = diagnose_output(rc, step_lines)
        if diagnosis is None:
            ok_msg = f"✅ [GUARDIAN] Step `{step_name}` selesai sukses pada percobaan #{attempt}."
            print(ok_msg, flush=True)
            append_log_entry(log_state, step_name, ok_msg, "success")
            break

        diag_record = {
            "ts": _now_iso(),
            "step": step_name,
            "attempt": attempt,
            **diagnosis,
        }
        log_state.setdefault("diagnostics", []).append(diag_record)
        diag_line = f"🩺 [GUARDIAN DIAGNOSIS #{attempt}] {diagnosis['code']}: {diagnosis['title']} — {diagnosis['detail']}"
        print(diag_line, flush=True)
        append_log_entry(log_state, step_name, diag_line, "error")

        if attempt > max_retries:
            fail_msg = f"🛑 [GUARDIAN] Batas maksimal retry ({max_retries}x) tercapai pada `{step_name}`."
            print(fail_msg, flush=True)
            append_log_entry(log_state, step_name, fail_msg, "error")
            if rc == 0:
                final_rc = 1
            break

        healed, should_retry, heal_msg = attempt_self_heal(diagnosis, attempt, child_env)
        log_state.setdefault("healsApplied", []).append({
            "ts": _now_iso(),
            "step": step_name,
            "attempt": attempt,
            "diagnosisCode": diagnosis["code"],
            "healed": healed,
            "message": heal_msg,
        })
        heal_line = f"🔧 [SELF-HEAL] {heal_msg}"
        print(heal_line, flush=True)
        append_log_entry(log_state, step_name, heal_line, "heal" if healed else "warn")
        push_log_state(log_state, log_path)

        if not should_retry:
            if rc == 0 and diagnosis["code"] != "STORE_OFFLINE":
                final_rc = 1
            break

        retry_line = f"🔄 [AUTO-RETRY #{attempt + 1}] Mengulang `{step_name}`..."
        print(retry_line, flush=True)
        append_log_entry(log_state, step_name, retry_line, "heal")
        push_log_state(log_state, log_path)

    # Hitung Produk Baru yang ter-add di Database (hanya indeks PK id > dbBaselineMaxId)
    step_new_stats: Dict[str, Any] = {"newSkusAdded": 0, "newArticlesAdded": 0, "samples": []}
    if args.track_new_products and log_state.get("dbBaselineMaxId"):
        step_new_stats = query_new_products_since(int(log_state["dbBaselineMaxId"]))
        log_state["newProductsSummary"] = step_new_stats
        _, latest_est = query_db_baseline()
        if latest_est > 0:
            log_state["dbTotalSkus"] = latest_est
        audit_msg = (
            f"📦 [DB AUDIT PRODUK BARU] Total SKU baru ter-add ke DB selama run ini: "
            f"+{step_new_stats['newSkusAdded']:,} SKU (+{step_new_stats['newArticlesAdded']:,} Artikel) | "
            f"Total Database: {log_state.get('dbTotalSkus', 0):,} SKU"
        )
        print(audit_msg, flush=True)
        append_log_entry(log_state, step_name, audit_msg, "db")

    log_state.setdefault("stepReports", []).append({
        "step": step_name,
        "status": "success" if final_rc == 0 else "failed",
        "attempts": total_attempts,
        "newSkusAdded": step_new_stats["newSkusAdded"],
        "newArticlesAdded": step_new_stats["newArticlesAdded"],
        "finishedAt": _now_iso(),
    })
    log_state["status"] = "completed" if final_rc == 0 else "failed"
    push_log_state(log_state, log_path)
    return final_rc


def main() -> int:
    _ensure_env_loaded()
    parser = argparse.ArgumentParser(description="Guardian Wrapper, Live Console & Self-Healing Runner")
    parser.add_argument("--init-run", action="store_true", help="Inisialisasi live-runner-log.json & baseline DB")
    parser.add_argument("--step", default="Python Step", help="Nama langkah workflow")
    parser.add_argument("--action", default="all", help="Action workflow")
    parser.add_argument("--max-retries", type=int, default=3, help="Jumlah maksimal retry per step")
    parser.add_argument("--track-new-products", action="store_true", help="Hitung SKU & artikel baru ter-add ke DB")
    parser.add_argument("--log-path", default="logs/live-runner-log.json", help="Lokasi objek JSON log di bucket excel-uploads")

    args, remainder = parser.parse_known_args()
    if remainder and remainder[0] == "--":
        remainder = remainder[1:]

    if args.init_run:
        init_run_log(args.action, args.log_path)
        return 0

    if not remainder:
        print("❌ [GUARDIAN] Perintah anak tidak diberikan setelah `--`.", file=sys.stderr)
        return 2

    return run_guarded_step(args, remainder)


if __name__ == "__main__":
    sys.exit(main())
