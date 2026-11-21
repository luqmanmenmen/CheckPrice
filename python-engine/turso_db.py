"""
turso_db.py
=============================================================================
Universal Turso (LibSQL / SQLite Cloud) HTTP Pipeline Adapter untuk Python Engine
- Menggunakan HTTP Pipeline API v2 (`https://<db>.turso.io/v2/pipeline`)
  memakai `requests` standar (0 native Rust/C build issue di Windows & Ubuntu).
- Kompatibel tinggi dengan:
  1. Gaya DB-API (`cursor.execute(sql, params)`, `executemany`, `execute_batch`).
  2. Gaya Supabase PostgREST (`turso.table("Product").select(...).in_(...).upsert(...).execute()`).
- Otomatis memformat `datetime` ke ISO-8601 UTC millisecond (`YYYY-MM-DDTHH:MM:SS.fffZ`)
  agar 100% sinkron dengan Prisma `@prisma/adapter-libsql`.
=============================================================================
"""

import base64
import json
import os
import time
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

JSON_ARRAY_COLS = {"images", "articleColors", "articleSizes"}
BOOL_COLS = {"redirectMds", "articleHasPromo"}


def _ensure_turso_env() -> None:
    if os.environ.get("TURSO_DATABASE_URL") and os.environ.get("TURSO_AUTH_TOKEN"):
        return
    try:
        from dotenv import load_dotenv
        script_dir = Path(__file__).resolve().parent
        root_dir = script_dir.parent
        for env_path in (root_dir / ".env", root_dir / ".env.local", script_dir / ".env"):
            if env_path.exists():
                load_dotenv(env_path, override=False)
    except Exception:
        pass


def is_turso_configured() -> bool:
    _ensure_turso_env()
    return bool(
        (os.environ.get("TURSO_DATABASE_URL") or "").strip()
        and (os.environ.get("TURSO_AUTH_TOKEN") or "").strip()
    )


def get_turso_credentials() -> Tuple[str, str]:
    _ensure_turso_env()
    url = (os.environ.get("TURSO_DATABASE_URL") or "").strip()
    token = (os.environ.get("TURSO_AUTH_TOKEN") or "").strip()
    if not url or not token:
        raise RuntimeError("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN belum tersedia di environment.")
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    url = url.rstrip("/")
    return url, token


def _build_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=4,
        backoff_factor=0.6,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"],
    )
    adapter = HTTPAdapter(pool_connections=16, pool_maxsize=32, max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


_SHARED_SESSION = _build_session()


def format_prisma_iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"
    if isinstance(dt, date):
        return dt.strftime("%Y-%m-%dT00:00:00.000Z")
    s = str(dt).strip()
    if not s:
        return None
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return f"{s}T00:00:00.000Z"
    return s


def parse_json_array(val: Any) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x) for x in val if x is not None]
    s = str(val).strip()
    if not s or s == "[]" or s == "{}":
        return []
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed if x is not None]
        except Exception:
            pass
    return [s]


def _to_hrana_arg(val: Any) -> Dict[str, Any]:
    if val is None:
        return {"type": "null"}
    if isinstance(val, bool):
        return {"type": "integer", "value": "1" if val else "0"}
    if isinstance(val, int):
        return {"type": "integer", "value": str(val)}
    if isinstance(val, float):
        return {"type": "float", "value": val}
    if isinstance(val, (datetime, date)):
        return {"type": "text", "value": format_prisma_iso(val) or ""}
    if isinstance(val, (list, dict)):
        return {"type": "text", "value": json.dumps(val, ensure_ascii=False)}
    return {"type": "text", "value": str(val)}


def _from_hrana_cell(cell: Dict[str, Any]) -> Any:
    t = cell.get("type")
    if t == "null" or "value" not in cell:
        return None
    v = cell["value"]
    if t == "integer":
        try:
            return int(v)
        except Exception:
            return v
    if t == "float":
        try:
            return float(v)
        except Exception:
            return v
    return v


def _convert_pg_placeholders(sql: str) -> str:
    if "%s" not in sql:
        return sql
    return sql.replace("%s", "?")


def _quote_ident(name: str) -> str:
    clean = name.strip().strip('"')
    return f'"{clean}"'


class TursoCursor:
    def __init__(self, conn: "TursoConnection"):
        self._conn = conn
        self._rows: List[Tuple[Any, ...]] = []
        self._idx = 0
        self.description: Optional[List[Tuple[str, ...]]] = None
        self.rowcount: int = 0
        self.lastrowid: Optional[int] = None

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None) -> "TursoCursor":
        sql_clean = _convert_pg_placeholders(sql)
        res = self._conn._exec_single(sql_clean, params)
        self._load_result(res)
        return self

    def executemany(self, sql: str, seq_of_params: Iterable[Sequence[Any]], batch_size: int = 250) -> "TursoCursor":
        sql_clean = _convert_pg_placeholders(sql)
        batch: List[Tuple[str, Sequence[Any]]] = []
        total_affected = 0
        for p in seq_of_params:
            batch.append((sql_clean, p))
            if len(batch) >= batch_size:
                total_affected += self._conn.execute_batch(batch)
                batch = []
        if batch:
            total_affected += self._conn.execute_batch(batch)
        self.rowcount = total_affected
        self._rows = []
        self._idx = 0
        return self

    def _load_result(self, result: Dict[str, Any]):
        cols = result.get("cols") or []
        self.description = [(c.get("name") or f"col_{i}",) for i, c in enumerate(cols)]
        raw_rows = result.get("rows") or []
        self._rows = [tuple(_from_hrana_cell(c) for c in row) for row in raw_rows]
        self._idx = 0
        self.rowcount = int(result.get("affected_row_count") or len(self._rows))
        lrid = result.get("last_insert_rowid")
        self.lastrowid = int(lrid) if lrid is not None else None

    def fetchone(self) -> Optional[Tuple[Any, ...]]:
        if self._idx >= len(self._rows):
            return None
        row = self._rows[self._idx]
        self._idx += 1
        return row

    def fetchmany(self, size: int = 1000) -> List[Tuple[Any, ...]]:
        if self._idx >= len(self._rows):
            return []
        end = min(len(self._rows), self._idx + size)
        out = self._rows[self._idx:end]
        self._idx = end
        return out

    def fetchall(self) -> List[Tuple[Any, ...]]:
        if self._idx >= len(self._rows):
            return []
        out = self._rows[self._idx:]
        self._idx = len(self._rows)
        return out

    def close(self):
        self._rows = []
        self._idx = 0


class TursoConnection:
    is_turso = True

    def __init__(self, base_url: str, auth_token: str, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.pipeline_url = f"{self.base_url}/v2/pipeline"
        self.auth_token = auth_token
        self.timeout = timeout
        self.autocommit = True

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json",
        }

    def _post_pipeline(self, requests_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        payload = {"requests": requests_list + [{"type": "close"}]}
        last_err: Optional[Exception] = None
        for attempt in range(4):
            try:
                resp = _SHARED_SESSION.post(
                    self.pipeline_url,
                    headers=self._headers(),
                    json=payload,
                    timeout=self.timeout,
                )
                if resp.status_code != 200:
                    if resp.status_code >= 500 or resp.status_code == 429:
                        raise RuntimeError(f"Turso HTTP {resp.status_code}: {resp.text[:300]}")
                    raise ValueError(f"Turso HTTP {resp.status_code}: {resp.text[:400]}")
                data = resp.json()
                results = data.get("results") or []
                out = []
                for idx, r in enumerate(results):
                    if r.get("type") == "error":
                        err = r.get("error") or {}
                        msg = str(err.get("message") or err)
                        if "SQLITE_BUSY" in msg or "locked" in msg.lower():
                            raise RuntimeError(f"Turso Busy (stmt #{idx}): {msg}")
                        raise ValueError(f"Turso SQL Error (stmt #{idx}): {msg}")
                    res_obj = (r.get("response") or {}).get("result")
                    if res_obj is not None:
                        out.append(res_obj)
                return out
            except ValueError:
                raise
            except Exception as e:
                last_err = e
                if attempt == 3:
                    raise
                time.sleep(0.8 * (attempt + 1))
        raise last_err or RuntimeError("Turso pipeline error")

    def _exec_single(self, sql: str, params: Optional[Sequence[Any]] = None) -> Dict[str, Any]:
        stmt: Dict[str, Any] = {"sql": sql}
        if params:
            stmt["args"] = [_to_hrana_arg(v) for v in params]
        results = self._post_pipeline([{"type": "execute", "stmt": stmt}])
        return results[0] if results else {}

    def execute_batch(self, statements: List[Tuple[str, Optional[Sequence[Any]]]], transactional: bool = True) -> int:
        if not statements:
            return 0
        reqs: List[Dict[str, Any]] = []
        if transactional:
            reqs.append({"type": "execute", "stmt": {"sql": "BEGIN"}})
        for sql, params in statements:
            stmt: Dict[str, Any] = {"sql": _convert_pg_placeholders(sql)}
            if params:
                stmt["args"] = [_to_hrana_arg(v) for v in params]
            reqs.append({"type": "execute", "stmt": stmt})
        if transactional:
            reqs.append({"type": "execute", "stmt": {"sql": "COMMIT"}})
        results = self._post_pipeline(reqs)
        affected = 0
        for r in results:
            affected += int(r.get("affected_row_count") or 0)
        return affected

    def bulk_insert_rows(
        self,
        table: str,
        columns: Sequence[str],
        rows: Sequence[Sequence[Any]],
        on_conflict: Optional[str] = None,
        do_nothing: bool = False,
        rows_per_stmt: int = 150,
        stmts_per_http: int = 4,
    ) -> int:
        """Multi-row INSERT / UPSERT ultra-cepat melalui Turso HTTP Pipeline."""
        if not rows:
            return 0
        cols = list(columns)
        col_sql = ", ".join(_quote_ident(c) for c in cols)
        row_ph = "(" + ", ".join(["?"] * len(cols)) + ")"

        conflict_suffix = ""
        if on_conflict:
            conflict_cols = [c.strip() for c in on_conflict.split(",") if c.strip()]
            conflict_target = ", ".join(_quote_ident(c) for c in conflict_cols)
            if do_nothing:
                conflict_suffix = f" ON CONFLICT ({conflict_target}) DO NOTHING"
            else:
                upd_cols = [c for c in cols if c not in conflict_cols and c != "id"]
                if upd_cols:
                    set_sql = ", ".join(f"{_quote_ident(c)} = excluded.{_quote_ident(c)}" for c in upd_cols)
                    conflict_suffix = f" ON CONFLICT ({conflict_target}) DO UPDATE SET {set_sql}"
                else:
                    conflict_suffix = f" ON CONFLICT ({conflict_target}) DO NOTHING"

        total_rows = 0
        http_chunk = rows_per_stmt * stmts_per_http
        for i in range(0, len(rows), http_chunk):
            batch_rows = rows[i : i + http_chunk]
            stmts: List[Tuple[str, List[Any]]] = []
            for j in range(0, len(batch_rows), rows_per_stmt):
                sub = batch_rows[j : j + rows_per_stmt]
                sql = f'INSERT INTO {_quote_ident(table)} ({col_sql}) VALUES ' + ", ".join([row_ph] * len(sub)) + conflict_suffix
                flat_args: List[Any] = []
                for r in sub:
                    flat_args.extend(r)
                stmts.append((sql, flat_args))
            self.execute_batch(stmts, transactional=True)
            total_rows += len(batch_rows)
        return total_rows

    def get_db_size_mb(self) -> float:
        cur = self.cursor()
        cur.execute("PRAGMA page_count")
        pc = int((cur.fetchone() or [0])[0] or 0)
        cur.execute("PRAGMA page_size")
        ps = int((cur.fetchone() or [4096])[0] or 4096)
        cur.close()
        return (pc * ps) / (1024.0 * 1024.0)

    def cursor(self, *args, **kwargs) -> TursoCursor:
        return TursoCursor(self)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


# =============================================================================
# Supabase-style `.table(name)` adapter untuk migrasi mulus skrip REST Python
# =============================================================================
class _NotFilterProxy:
    def __init__(self, builder: "TursoTableQuery"):
        self._b = builder

    def is_(self, col: str, val: str) -> "TursoTableQuery":
        if str(val).lower() == "null":
            self._b._wheres.append((f"{_quote_ident(col)} IS NOT NULL", []))
        return self._b


class TursoTableQuery:
    def __init__(self, conn: TursoConnection, table: str):
        self._conn = conn
        self._table = table
        self._op = "select"
        self._select_cols = "*"
        self._payload: Any = None
        self._on_conflict: Optional[str] = None
        self._wheres: List[Tuple[str, List[Any]]] = []
        self._in_filter: Optional[Tuple[str, List[Any]]] = None
        self._order_col: Optional[str] = None
        self._order_desc: bool = False
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None
        self.not_ = _NotFilterProxy(self)

    def select(self, cols: str = "*") -> "TursoTableQuery":
        self._op = "select"
        self._select_cols = cols
        return self

    def insert(self, data: Any) -> "TursoTableQuery":
        self._op = "insert"
        self._payload = data if isinstance(data, list) else [data]
        return self

    def upsert(self, data: Any, on_conflict: str = "sku") -> "TursoTableQuery":
        self._op = "upsert"
        self._payload = data if isinstance(data, list) else [data]
        self._on_conflict = on_conflict
        return self

    def update(self, data: Dict[str, Any]) -> "TursoTableQuery":
        self._op = "update"
        self._payload = data
        return self

    def eq(self, col: str, val: Any) -> "TursoTableQuery":
        self._wheres.append((f"{_quote_ident(col)} = ?", [val]))
        return self

    def lt(self, col: str, val: Any) -> "TursoTableQuery":
        self._wheres.append((f"{_quote_ident(col)} < ?", [val]))
        return self

    def gt(self, col: str, val: Any) -> "TursoTableQuery":
        self._wheres.append((f"{_quote_ident(col)} > ?", [val]))
        return self

    def is_(self, col: str, val: str) -> "TursoTableQuery":
        if str(val).lower() == "null":
            self._wheres.append((f"{_quote_ident(col)} IS NULL", []))
        return self

    def in_(self, col: str, vals: Sequence[Any]) -> "TursoTableQuery":
        self._in_filter = (col, list(vals))
        return self

    def order(self, col: str, desc: bool = False) -> "TursoTableQuery":
        self._order_col = col
        self._order_desc = desc
        return self

    def limit(self, n: int) -> "TursoTableQuery":
        self._limit = int(n)
        return self

    def range(self, start: int, end: int) -> "TursoTableQuery":
        self._offset = int(start)
        self._limit = max(1, int(end) - int(start) + 1)
        return self

    def _hydrate_row(self, cols: List[str], row: Tuple[Any, ...]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for k, v in zip(cols, row):
            if k in JSON_ARRAY_COLS:
                out[k] = parse_json_array(v)
            elif k in BOOL_COLS and v is not None:
                out[k] = bool(v)
            else:
                out[k] = v
        return out

    def _normalize_record_for_write(self, rec: Dict[str, Any]) -> Dict[str, Any]:
        clean = dict(rec)
        # Pastikan createdAt / updatedAt selalu terisi jika dibutuhkan Prisma SQLite NOT NULL
        now_iso = format_prisma_iso(datetime.now(timezone.utc))
        if self._table == "Product":
            clean.setdefault("updatedAt", now_iso)
        elif self._table == "BarcodeAlias":
            clean.setdefault("updatedAt", now_iso)
        elif self._table == "SyncHistory":
            clean.setdefault("createdAt", now_iso)
        return clean

    def execute(self) -> SimpleNamespace:
        cur = self._conn.cursor()
        try:
            if self._op == "select":
                if self._select_cols.strip() == "*":
                    sel_sql = "*"
                else:
                    sel_sql = ", ".join(_quote_ident(c) for c in self._select_cols.split(",") if c.strip())

                # Jika ada IN (...) besar, chunk otomatis agar selalu di bawah batas SQLite
                if self._in_filter is not None:
                    in_col, in_vals = self._in_filter
                    if not in_vals:
                        return SimpleNamespace(data=[])
                    rows_out: List[Dict[str, Any]] = []
                    for i in range(0, len(in_vals), 350):
                        chunk = in_vals[i : i + 350]
                        where_parts = [w[0] for w in self._wheres]
                        params: List[Any] = []
                        for _, wp in self._wheres:
                            params.extend(wp)
                        ph = ", ".join(["?"] * len(chunk))
                        where_parts.append(f"{_quote_ident(in_col)} IN ({ph})")
                        params.extend(chunk)
                        sql = f'SELECT {sel_sql} FROM {_quote_ident(self._table)} WHERE ' + " AND ".join(where_parts)
                        if self._order_col:
                            sql += f' ORDER BY {_quote_ident(self._order_col)} {"DESC" if self._order_desc else "ASC"}'
                        cur.execute(sql, params)
                        col_names = [d[0] for d in (cur.description or [])]
                        for r in cur.fetchall():
                            rows_out.append(self._hydrate_row(col_names, r))
                    return SimpleNamespace(data=rows_out)

                where_parts = [w[0] for w in self._wheres]
                params = []
                for _, wp in self._wheres:
                    params.extend(wp)
                sql = f'SELECT {sel_sql} FROM {_quote_ident(self._table)}'
                if where_parts:
                    sql += " WHERE " + " AND ".join(where_parts)
                if self._order_col:
                    sql += f' ORDER BY {_quote_ident(self._order_col)} {"DESC" if self._order_desc else "ASC"}'
                if self._limit is not None:
                    sql += f" LIMIT {int(self._limit)}"
                if self._offset is not None:
                    sql += f" OFFSET {int(self._offset)}"
                cur.execute(sql, params)
                col_names = [d[0] for d in (cur.description or [])]
                data = [self._hydrate_row(col_names, r) for r in cur.fetchall()]
                return SimpleNamespace(data=data)

            if self._op in ("insert", "upsert"):
                recs = [self._normalize_record_for_write(r) for r in (self._payload or []) if isinstance(r, dict)]
                if not recs:
                    return SimpleNamespace(data=[])
                # Kumpulkan union kolom agar semua baris seragam
                all_cols: List[str] = []
                seen = set()
                for r in recs:
                    for k in r.keys():
                        if k not in seen:
                            seen.add(k)
                            all_cols.append(k)
                rows_tuples = [[r.get(c) for c in all_cols] for r in recs]
                self._conn.bulk_insert_rows(
                    self._table,
                    all_cols,
                    rows_tuples,
                    on_conflict=self._on_conflict if self._op == "upsert" else None,
                    do_nothing=False,
                    rows_per_stmt=120,
                    stmts_per_http=4,
                )
                return SimpleNamespace(data=recs)

            if self._op == "update":
                upd_dict = dict(self._payload or {})
                if not upd_dict:
                    return SimpleNamespace(data=[])
                set_parts = [f"{_quote_ident(k)} = ?" for k in upd_dict.keys()]
                params = list(upd_dict.values())
                where_parts = [w[0] for w in self._wheres]
                for _, wp in self._wheres:
                    params.extend(wp)
                sql = f'UPDATE {_quote_ident(self._table)} SET ' + ", ".join(set_parts)
                if where_parts:
                    sql += " WHERE " + " AND ".join(where_parts)
                cur.execute(sql, params)
                # Kembalikan dummy list sejumlah rowcount agar `len(res.data)` tetap akurat
                return SimpleNamespace(data=[{"affected": True}] * max(0, cur.rowcount))

            return SimpleNamespace(data=[])
        finally:
            cur.close()


class TursoTableClient:
    def __init__(self, conn: TursoConnection):
        self._conn = conn

    def table(self, name: str) -> TursoTableQuery:
        return TursoTableQuery(self._conn, name)


def connect_turso(timeout: int = 60) -> TursoConnection:
    url, token = get_turso_credentials()
    return TursoConnection(url, token, timeout=timeout)


def get_turso_table_client(timeout: int = 60) -> TursoTableClient:
    return TursoTableClient(connect_turso(timeout=timeout))


# =============================================================================
# 100% Turso Cloud Object Storage (`StorageObject` + `StorageChunk`)
# Pengganti penuh Supabase Storage (0% koneksi ke supabase.co)
# =============================================================================
STORAGE_CHUNK_RAW_BYTES = 1_500_000  # 1.5 MB raw (~2.0 MB base64)


def _clean_storage_path(path: str) -> str:
    return str(path or "").strip().lstrip("/").replace("//", "/")


def _ensure_storage_tables(conn: TursoConnection) -> None:
    conn.execute_batch(
        [
            (
                '''
                CREATE TABLE IF NOT EXISTS "StorageObject" (
                    "path" TEXT NOT NULL PRIMARY KEY,
                    "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
                    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
                    "chunkCount" INTEGER NOT NULL DEFAULT 1,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                ''',
                None,
            ),
            (
                '''
                CREATE TABLE IF NOT EXISTS "StorageChunk" (
                    "path" TEXT NOT NULL,
                    "chunkIndex" INTEGER NOT NULL,
                    "dataBase64" TEXT NOT NULL,
                    PRIMARY KEY ("path", "chunkIndex")
                )
                ''',
                None,
            ),
            ('CREATE INDEX IF NOT EXISTS "StorageChunk_path_idx" ON "StorageChunk"("path")', None),
        ],
        transactional=True,
    )


def storage_upload(
    object_path: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    timeout: int = 90,
) -> Tuple[str, int]:
    """Simpan file (kecil atau besar multi-chunk 1.5 MB) langsung ke Turso Cloud."""
    clean_path = _clean_storage_path(object_path)
    if isinstance(data, str):
        data = data.encode("utf-8")
    conn = connect_turso(timeout=timeout)
    chunks = [data[i : i + STORAGE_CHUNK_RAW_BYTES] for i in range(0, len(data), STORAGE_CHUNK_RAW_BYTES)] or [b""]
    now_iso = format_prisma_iso(datetime.now(timezone.utc))
    cur = conn.cursor()
    try:
        cur.execute('DELETE FROM "StorageChunk" WHERE path = ?', (clean_path,))
    except Exception:
        _ensure_storage_tables(conn)
        cur.execute('DELETE FROM "StorageChunk" WHERE path = ?', (clean_path,))
    for idx, ch in enumerate(chunks):
        b64 = base64.b64encode(ch).decode("ascii")
        cur.execute(
            'INSERT INTO "StorageChunk" (path, "chunkIndex", "dataBase64") VALUES (?, ?, ?)',
            (clean_path, idx, b64),
        )
    cur.execute(
        '''
        INSERT INTO "StorageObject" (path, "contentType", "sizeBytes", "chunkCount", "updatedAt")
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (path) DO UPDATE SET
            "contentType" = excluded."contentType",
            "sizeBytes" = excluded."sizeBytes",
            "chunkCount" = excluded."chunkCount",
            "updatedAt" = excluded."updatedAt"
        ''',
        (clean_path, content_type, len(data), len(chunks), now_iso),
    )
    cur.close()
    encoded = "/".join(urllib.parse.quote(seg, safe="") for seg in clean_path.split("/"))
    return f"/api/storage/{encoded}", len(chunks)


def storage_download(object_path: str, timeout: int = 60) -> Optional[bytes]:
    """Unduh raw bytes sebuah file dari Turso StorageObject/StorageChunk."""
    clean_path = _clean_storage_path(object_path)
    conn = connect_turso(timeout=timeout)
    cur = conn.cursor()
    cur.execute(
        'SELECT "dataBase64" FROM "StorageChunk" WHERE path = ? ORDER BY "chunkIndex" ASC',
        (clean_path,),
    )
    rows = cur.fetchall()
    cur.close()
    if not rows:
        return None
    parts = [base64.b64decode(r[0]) for r in rows if r and r[0] is not None]
    return b"".join(parts)


def storage_download_json(object_path: str, timeout: int = 45) -> Dict[str, Any]:
    raw = storage_download(object_path, timeout=timeout)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def storage_list(prefix: str = "", timeout: int = 45) -> List[Dict[str, Any]]:
    """Daftar file & subfolder langsung di bawah prefix (kompatibel gaya Storage.list)."""
    clean_prefix = _clean_storage_path(prefix).rstrip("/")
    like_prefix = f"{clean_prefix}/" if clean_prefix else ""
    conn = connect_turso(timeout=timeout)
    cur = conn.cursor()
    if like_prefix:
        cur.execute(
            'SELECT path, "sizeBytes", "contentType", "updatedAt" FROM "StorageObject" WHERE path LIKE ? ORDER BY "updatedAt" DESC',
            (f"{like_prefix}%",),
        )
    else:
        cur.execute('SELECT path, "sizeBytes", "contentType", "updatedAt" FROM "StorageObject" ORDER BY "updatedAt" DESC')
    rows = cur.fetchall()
    cur.close()

    direct: Dict[str, Dict[str, Any]] = {}
    for p, sz, ct, upd in rows:
        rel = p[len(like_prefix):] if like_prefix else p
        if not rel:
            continue
        if "/" in rel:
            folder = rel.split("/", 1)[0]
            if folder not in direct:
                direct[folder] = {"name": folder, "id": None, "updated_at": upd, "metadata": None}
        else:
            direct[rel] = {
                "name": rel,
                "id": p,
                "updated_at": upd,
                "metadata": {"size": int(sz or 0), "mimetype": ct},
            }
    return list(direct.values())


def storage_delete(paths: Sequence[str], timeout: int = 45) -> int:
    clean_paths = [_clean_storage_path(p) for p in paths if _clean_storage_path(p)]
    if not clean_paths:
        return 0
    conn = connect_turso(timeout=timeout)
    ph = ", ".join(["?"] * len(clean_paths))
    cur = conn.cursor()
    cur.execute(f'DELETE FROM "StorageChunk" WHERE path IN ({ph})', clean_paths)
    cur.execute(f'DELETE FROM "StorageObject" WHERE path IN ({ph})', clean_paths)
    deleted = cur.rowcount or 0
    cur.close()
    return deleted
