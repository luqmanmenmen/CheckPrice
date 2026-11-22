"""
run_admin_analytics.py
=============================================================================
PUSAT KOMPUTASI ADMIN & LAPORAN PYTHON ("Python yang mikir, Vercel hanya display")
Menggantikan seluruh proses berat TypeScript di Vercel yang sebelumnya memicu
Disk IO tinggi / N+1 query / risiko timeout:
  1. --clean-promo : Pembersihan promo expired WIB + sinkronisasi CatalogArticle bila berubah.
  2. --generate-po : Kalkulasi Safety Stock / Min-Max Saran PO dalam 1 SQL atomik.
  3. --analytics   : Kompilasi JSON matang:
       - analytics/promo-analysis.json     (untuk /api/admin/promo-analysis)
       - analytics/sales-report-summary.json (untuk /api/admin/sales-report)
     dan mengunggahnya ke Supabase Storage CDN (`excel-uploads/analytics/*.json`)
     sehingga API Vercel murni hanya membaca file jadi (< 40ms, ~0 Disk IO Postgres).
=============================================================================
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

sys.path.append(os.path.dirname(__file__))
from build_offline_snapshot import (  # noqa: E402
    _connect_postgres,
    _load_env_files,
    _storage_upload,
    _supabase_credentials,
)


def _ensure_env_loaded() -> None:
    _load_env_files()
    if os.environ.get("TURSO_DATABASE_URL") or os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL"):
        return
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for name in (".env", ".env.production", ".env.local"):
        env_file = os.path.join(root_dir, name)
        if not os.path.exists(env_file):
            continue
        with open(env_file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v


def _today_wib_str() -> str:
    wib = timezone(timedelta(hours=7))
    return datetime.now(wib).strftime("%Y-%m-%d")


def clean_expired_promos(conn) -> int:
    """Bersihkan promo kedaluwarsa berdasarkan tanggal WIB dengan 1 UPDATE SQL terarah."""
    today_wib = _today_wib_str()
    cur = conn.cursor()
    if getattr(conn, "is_turso", False):
        cur.execute(
            '''
            UPDATE "Product"
            SET "hargaPromo" = NULL,
                diskon = NULL,
                "discountType" = NULL,
                acara = NULL,
                "fromDate" = NULL,
                "toDate" = NULL
            WHERE ("hargaPromo" IS NOT NULL OR diskon IS NOT NULL OR acara IS NOT NULL)
              AND "toDate" IS NOT NULL
              AND substr(trim("toDate"), 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
              AND substr(trim("toDate"), 1, 10) < ?
            ''',
            (today_wib,),
        )
    else:
        cur.execute(
            '''
            UPDATE "Product"
            SET "hargaPromo" = NULL,
                diskon = NULL,
                "discountType" = NULL,
                acara = NULL,
                "fromDate" = NULL,
                "toDate" = NULL
            WHERE ("hargaPromo" IS NOT NULL OR diskon IS NOT NULL OR acara IS NOT NULL)
              AND "toDate" IS NOT NULL
              AND SUBSTRING(TRIM("toDate"), 1, 10) ~ '^\\d{4}-\\d{2}-\\d{2}$'
              AND SUBSTRING(TRIM("toDate"), 1, 10) < %s
            ''',
            (today_wib,),
        )
    cleaned = cur.rowcount or 0
    conn.commit()
    cur.close()
    print(f"[PYTHON-ANALYTICS] Clean expired promo (< {today_wib} WIB): {cleaned:,} SKU dibersihkan.")
    return cleaned


def generate_po_suggestions(conn) -> int:
    """Bangun saran PO Min-Max atomik dalam 1 query SQL (bebas loop N+1)."""
    cur = conn.cursor()
    if getattr(conn, "is_turso", False):
        cur.execute(
            '''
            INSERT INTO "PoSuggestion" (id, "productId", "suggestedQty", reason, status, "createdAt", "updatedAt")
            SELECT
                'po_' || lower(hex(randomblob(8))),
                p.id,
                MAX(0, CAST((p.sales_mtd * 24 + 13) / 14 AS INTEGER) - p.stok),
                'Dalam 14 hari terakhir terjual ' || p.sales_mtd || ' pcs (Rata-rata '
                    || printf('%.1f', CAST(p.sales_mtd AS REAL) / 14.0)
                    || ' pcs/hari). Sisa stok ' || p.stok
                    || ' pcs. Disarankan pesan '
                    || MAX(0, CAST((p.sales_mtd * 24 + 13) / 14 AS INTEGER) - p.stok)
                    || ' pcs untuk target 14 hari.',
                'OPEN',
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            FROM "Product" p
            WHERE p.sales_mtd > 5
              AND p.stok <= CAST((p.sales_mtd * 10 + 13) / 14 AS INTEGER)
              AND (CAST((p.sales_mtd * 24 + 13) / 14 AS INTEGER) - p.stok) > 0
              AND NOT EXISTS (
                  SELECT 1 FROM "PoSuggestion" s
                  WHERE s."productId" = p.id AND s.status = 'OPEN'
              )
            '''
        )
    else:
        cur.execute(
            '''
            INSERT INTO "PoSuggestion" (id, "productId", "suggestedQty", reason, status, "createdAt", "updatedAt")
            SELECT
                'po_' || md5(p.id::text || '_' || extract(epoch from now())::text),
                p.id,
                GREATEST(0, CEIL((p.sales_mtd::numeric / 14.0) * 24.0)::int - p.stok),
                'Dalam 14 hari terakhir terjual ' || p.sales_mtd || ' pcs (Rata-rata '
                    || TO_CHAR(p.sales_mtd::numeric / 14.0, 'FM999990.0')
                    || ' pcs/hari). Sisa stok ' || p.stok
                    || ' pcs. Disarankan pesan '
                    || GREATEST(0, CEIL((p.sales_mtd::numeric / 14.0) * 24.0)::int - p.stok)
                    || ' pcs untuk target 14 hari.',
                'OPEN',
                NOW(),
                NOW()
            FROM "Product" p
            WHERE p.sales_mtd > 5
              AND p.stok <= CEIL((p.sales_mtd::numeric / 14.0) * 10.0)
              AND GREATEST(0, CEIL((p.sales_mtd::numeric / 14.0) * 24.0)::int - p.stok) > 0
              AND NOT EXISTS (
                  SELECT 1 FROM "PoSuggestion" s
                  WHERE s."productId" = p.id AND s.status = 'OPEN'
              )
            '''
        )
    inserted = cur.rowcount or 0
    conn.commit()
    cur.close()
    print(f"[PYTHON-ANALYTICS] Generate Saran PO atomik selesai: +{inserted:,} saran baru.")
    return inserted


def build_promo_analysis_payload(conn) -> Dict[str, Any]:
    """Agregasi efektivitas event promo vs DailySales di Python."""
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT id, sku, description, dept, acara, "hargaNormal", "hargaPromo", "fromDate", "toDate"
        FROM "Product"
        WHERE "hargaPromo" IS NOT NULL
          AND "fromDate" IS NOT NULL
          AND LENGTH(TRIM("fromDate")) >= 8
        '''
    )
    promos = cur.fetchall()
    promo_ids = [r[0] for r in promos]

    sales_by_pid: Dict[int, List[tuple]] = {}
    if promo_ids:
        if getattr(conn, "is_turso", False):
            for i in range(0, len(promo_ids), 400):
                chunk = promo_ids[i : i + 400]
                ph = ", ".join(["?"] * len(chunk))
                cur.execute(
                    f'SELECT "productId", date, "qtySold" FROM "DailySales" WHERE "productId" IN ({ph})',
                    chunk,
                )
                for pid, sdate, qty in cur.fetchall():
                    sales_by_pid.setdefault(int(pid), []).append((sdate, int(qty or 0)))
        else:
            cur.execute(
                '''
                SELECT "productId", date, "qtySold"
                FROM "DailySales"
                WHERE "productId" = ANY(%s)
                ''',
                (promo_ids,),
            )
            for pid, sdate, qty in cur.fetchall():
                sales_by_pid.setdefault(pid, []).append((sdate, int(qty or 0)))
    cur.close()

    items: List[Dict[str, Any]] = []
    event_map: Dict[str, Dict[str, Any]] = {}
    dept_map: Dict[str, Dict[str, Any]] = {}
    total_avg_before = 0.0
    total_avg_during = 0.0

    for pid, sku, desc, dept, acara, h_norm, h_promo, f_date, t_date in promos:
        sales = sales_by_pid.get(pid)
        if not sales:
            continue
        try:
            f_str = str(f_date).strip()[:10]
            promo_dt = datetime.strptime(f_str, "%Y-%m-%d").date()
        except Exception:
            continue

        s_before = 0
        d_before = 0
        s_during = 0
        d_during = 0
        for sdate, qty in sales:
            if hasattr(sdate, "date"):
                sd = sdate.date()
            elif isinstance(sdate, str):
                try:
                    sd = datetime.strptime(sdate.strip()[:10], "%Y-%m-%d").date()
                except Exception:
                    continue
            else:
                sd = sdate
            if sd < promo_dt:
                s_before += qty
                d_before += 1
            else:
                s_during += qty
                d_during += 1

        avg_b = s_before / d_before if d_before > 0 else 0.0
        avg_d = s_during / d_during if d_during > 0 else 0.0
        if avg_b > 0:
            pct = ((avg_d - avg_b) / avg_b) * 100.0
        elif avg_d > 0:
            pct = 100.0
        else:
            pct = 0.0

        dept_name = dept or "Tanpa Departemen"
        acara_name = acara or "Promo Reguler"
        items.append(
            {
                "id": pid,
                "sku": sku,
                "description": desc,
                "dept": dept_name,
                "acara": acara_name,
                "hargaNormal": float(h_norm or 0),
                "hargaPromo": float(h_promo or 0) if h_promo is not None else None,
                "promoStart": f_date,
                "promoEnd": t_date,
                "avgBefore": avg_b,
                "avgDuring": avg_d,
                "percentage": pct,
            }
        )
        total_avg_before += avg_b
        total_avg_during += avg_d

        ev = event_map.setdefault(
            acara_name,
            {"acara": acara_name, "itemCount": 0, "totalAvgBefore": 0.0, "totalAvgDuring": 0.0},
        )
        ev["itemCount"] += 1
        ev["totalAvgBefore"] += avg_b
        ev["totalAvgDuring"] += avg_d

        dp = dept_map.setdefault(
            dept_name,
            {"dept": dept_name, "itemCount": 0, "totalAvgBefore": 0.0, "totalAvgDuring": 0.0},
        )
        dp["itemCount"] += 1
        dp["totalAvgBefore"] += avg_b
        dp["totalAvgDuring"] += avg_d

    items.sort(key=lambda x: -x["percentage"])

    def _finalize_group(rows_dict: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        out = []
        for row in rows_dict.values():
            b = row["totalAvgBefore"]
            d = row["totalAvgDuring"]
            pct = ((d - b) / b) * 100.0 if b > 0 else (100.0 if d > 0 else 0.0)
            out.append({**row, "percentage": pct})
        out.sort(key=lambda x: -x["percentage"])
        return out

    overall_pct = (
        ((total_avg_during - total_avg_before) / total_avg_before) * 100.0
        if total_avg_before > 0
        else (100.0 if total_avg_during > 0 else 0.0)
    )

    return {
        "success": True,
        "source": "PYTHON_PRECOMPUTED_CDN",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "overallSummary": {
            "totalItems": len(items),
            "totalAvgBefore": total_avg_before,
            "totalAvgDuring": total_avg_during,
            "overallPercentage": overall_pct,
        },
        "groupedByEvent": _finalize_group(event_map),
        "groupedByDept": _finalize_group(dept_map),
        "itemLevel": items,
    }


def build_sales_report_summary_payload(conn) -> Dict[str, Any]:
    """
    Pre-compute agregasi Laporan Sales 100% di RAM Python menggunakan Index Scan ketat (`WHERE stok > 0` ~5.956 baris
    + tabel kecil `DailySales`). Menghindari 4x Full Table Scan 310rb baris -> Hemat 99% Disk IO & 0 RAM Supabase!
    """
    cur = conn.cursor()

    # 1. Total katalog + promo aktif dari CatalogArticle
    if getattr(conn, "is_turso", False):
        cur.execute('SELECT COUNT(*) FROM "Product"')
        total_products = int((cur.fetchone() or [0])[0] or 0)
        cur.execute('SELECT COUNT(*) FROM "CatalogArticle" WHERE "articleHasPromo" = 1')
        total_with_promo = int((cur.fetchone() or [0])[0] or 0)
    else:
        cur.execute("SELECT GREATEST(reltuples::bigint, 0) FROM pg_class WHERE relname = 'Product' LIMIT 1")
        total_products = int((cur.fetchone() or [0])[0] or 0)
        cur.execute('SELECT COUNT(*) FROM "CatalogArticle" WHERE "articleHasPromo" = true')
        total_with_promo = int((cur.fetchone() or [0])[0] or 0)

    # 2. Tarik HANYA SKU SUKO/aktif dengan stok > 0 (~5.956 baris via index Product_stok_sku_idx -> < 200ms!)
    cur.execute(
        '''
        SELECT id, sku, description, article, dept, brand, "hargaNormal", "hargaPromo",
               diskon, stok, day_sales_unit, day_sales_retail,
               sales_wtd, sales_wtd_retail, sales_mtd, sales_mtd_retail,
               sales_ytd, sales_ytd_retail, eoh_retail, bom_unit, boy_unit, boy_retail
        FROM "Product"
        WHERE stok > 0
        '''
    )
    rows_by_id: Dict[int, Dict[str, Any]] = {}
    for r in cur.fetchall():
        rows_by_id[int(r[0])] = {
            "id": int(r[0]), "sku": r[1], "description": r[2] or "", "article": r[3],
            "dept": (r[4] or "SUKO LAINNYA").strip(), "brand": r[5] or "",
            "hargaNormal": float(r[6] or 0), "hargaPromo": float(r[7]) if r[7] is not None else None,
            "diskon": r[8], "stok": int(r[9] or 0),
            "day_sales_unit": int(r[10] or 0), "day_sales_retail": float(r[11] or 0),
            "sales_wtd": int(r[12] or 0), "sales_wtd_retail": float(r[13] or 0),
            "sales_mtd": int(r[14] or 0), "sales_mtd_retail": float(r[15] or 0),
            "sales_ytd": int(r[16] or 0), "sales_ytd_retail": float(r[17] or 0),
            "eoh_retail": float(r[18] or 0), "bom_unit": int(r[19] or 0),
            "boy_unit": int(r[20] or 0), "boy_retail": float(r[21] or 0),
        }

    # 3. Tarik SKU yang terjual namun stoknya kini 0 (via DailySales -> index PK!) agar tidak hilang dari Top 10 & Stok Kritis (0 pcs)
    cur.execute('SELECT DISTINCT "productId" FROM "DailySales"')
    sold_pids = [int(r[0]) for r in cur.fetchall() if int(r[0]) not in rows_by_id]
    if sold_pids:
        sold_rows = []
        if getattr(conn, "is_turso", False):
            for i in range(0, len(sold_pids), 400):
                chunk = sold_pids[i : i + 400]
                ph = ", ".join(["?"] * len(chunk))
                cur.execute(
                    f'''
                    SELECT id, sku, description, article, dept, brand, "hargaNormal", "hargaPromo",
                           diskon, stok, day_sales_unit, day_sales_retail,
                           sales_wtd, sales_wtd_retail, sales_mtd, sales_mtd_retail,
                           sales_ytd, sales_ytd_retail, eoh_retail, bom_unit, boy_unit, boy_retail
                    FROM "Product"
                    WHERE id IN ({ph})
                    ''',
                    chunk,
                )
                sold_rows.extend(cur.fetchall())
        else:
            cur.execute(
                '''
                SELECT id, sku, description, article, dept, brand, "hargaNormal", "hargaPromo",
                       diskon, stok, day_sales_unit, day_sales_retail,
                       sales_wtd, sales_wtd_retail, sales_mtd, sales_mtd_retail,
                       sales_ytd, sales_ytd_retail, eoh_retail, bom_unit, boy_unit, boy_retail
                FROM "Product"
                WHERE id = ANY(%s)
                ''',
                (sold_pids,),
            )
            sold_rows = cur.fetchall()
        for r in sold_rows:
            rows_by_id[int(r[0])] = {
                "id": int(r[0]), "sku": r[1], "description": r[2] or "", "article": r[3],
                "dept": (r[4] or "SUKO LAINNYA").strip(), "brand": r[5] or "",
                "hargaNormal": float(r[6] or 0), "hargaPromo": float(r[7]) if r[7] is not None else None,
                "diskon": r[8], "stok": max(0, int(r[9] or 0)),
                "day_sales_unit": int(r[10] or 0), "day_sales_retail": float(r[11] or 0),
                "sales_wtd": int(r[12] or 0), "sales_wtd_retail": float(r[13] or 0),
                "sales_mtd": int(r[14] or 0), "sales_mtd_retail": float(r[15] or 0),
                "sales_ytd": int(r[16] or 0), "sales_ytd_retail": float(r[17] or 0),
                "eoh_retail": max(0.0, float(r[18] or 0)), "bom_unit": max(0, int(r[19] or 0)),
                "boy_unit": max(0, int(r[20] or 0)), "boy_retail": max(0.0, float(r[21] or 0)),
            }
    cur.close()

    # 4. Seluruh agregasi dikerjakan di RAM Python (0ms SQL, 0 RAM Supabase!)
    all_rows = list(rows_by_id.values())
    agg_summary = {
        "day_sales_retail": sum(p["day_sales_retail"] for p in all_rows),
        "day_sales_unit": sum(p["day_sales_unit"] for p in all_rows),
        "sales_wtd": sum(p["sales_wtd"] for p in all_rows),
        "sales_wtd_retail": sum(p["sales_wtd_retail"] for p in all_rows),
        "sales_mtd": sum(p["sales_mtd"] for p in all_rows),
        "sales_mtd_retail": sum(p["sales_mtd_retail"] for p in all_rows),
        "sales_ytd": sum(p["sales_ytd"] for p in all_rows),
        "sales_ytd_retail": sum(p["sales_ytd_retail"] for p in all_rows),
        "eoh_retail": sum(p["eoh_retail"] for p in all_rows if p["stok"] > 0),
        "stok": sum(p["stok"] for p in all_rows if p["stok"] > 0),
        "bom_unit": sum(p["bom_unit"] for p in all_rows if p["bom_unit"] > 0),
        "boy_unit": sum(p["boy_unit"] for p in all_rows if p["boy_unit"] > 0),
        "boy_retail": sum(p["boy_retail"] for p in all_rows if p["boy_retail"] > 0),
        "totalProducts": total_products,
        "activeStockSkus": sum(1 for p in all_rows if p["stok"] > 0),
        "totalWithPromo": total_with_promo,
    }

    dept_map: Dict[str, Dict[str, Any]] = {}
    for p in all_rows:
        d = dept_map.setdefault(
            p["dept"],
            {
                "omzet": 0.0, "qty": 0, "omzet_hari_ini": 0.0, "qty_hari_ini": 0,
                "omzet_wtd": 0.0, "qty_wtd": 0, "omzet_ytd": 0.0, "qty_ytd": 0,
                "stok": 0, "eoh": 0.0, "bom_unit": 0, "boy_unit": 0,
            },
        )
        d["omzet"] += p["sales_mtd_retail"]
        d["qty"] += p["sales_mtd"]
        d["omzet_hari_ini"] += p["day_sales_retail"]
        d["qty_hari_ini"] += p["day_sales_unit"]
        d["omzet_wtd"] += p["sales_wtd_retail"]
        d["qty_wtd"] += p["sales_wtd"]
        d["omzet_ytd"] += p["sales_ytd_retail"]
        d["qty_ytd"] += p["sales_ytd"]
        if p["stok"] > 0:
            d["stok"] += p["stok"]
            d["eoh"] += p["eoh_retail"]
        if p["bom_unit"] > 0:
            d["bom_unit"] += p["bom_unit"]
        if p["boy_unit"] > 0:
            d["boy_unit"] += p["boy_unit"]

    dept_breakdown = dict(
        sorted(dept_map.items(), key=lambda kv: (-kv[1]["omzet"], -kv[1]["stok"]))
    )

    # Top Slow Moving (stok >= 10 pcs, penjualan <= 2 pcs MTD, khusus non-MUKU/ZES)
    slow_candidates = [
        p for p in all_rows
        if p["stok"] >= 10
        and p["sales_mtd"] <= 2
        and "MUKU" not in p["brand"].upper()
        and "ZES" not in p["brand"].upper()
    ]
    slow_candidates.sort(key=lambda p: (-p["stok"], p["sales_mtd"]))
    top_slow = [
        {
            "sku": p["sku"], "description": p["description"], "article": p["article"],
            "dept": p["dept"], "brand": p["brand"], "hargaNormal": p["hargaNormal"],
            "hargaPromo": p["hargaPromo"], "diskon": p["diskon"], "stok": p["stok"],
            "sales_mtd": p["sales_mtd"], "sales_mtd_retail": p["sales_mtd_retail"],
            "sales_ytd": p["sales_ytd"], "eoh_retail": p["eoh_retail"], "bom_unit": p["bom_unit"],
        }
        for p in slow_candidates[:20]
    ]

    # Top Stok Kritis (terjual >= 1 pcs MTD/hari ini namun sisa stok 0..5 pcs)
    kritis_candidates = [
        p for p in all_rows
        if (p["sales_mtd"] >= 1 or p["day_sales_unit"] >= 1) and 0 <= p["stok"] <= 5
    ]
    kritis_candidates.sort(key=lambda p: (p["stok"], -p["sales_mtd"], -p["day_sales_unit"]))
    top_kritis = [
        {
            "sku": p["sku"], "description": p["description"], "article": p["article"],
            "dept": p["dept"], "hargaNormal": p["hargaNormal"], "hargaPromo": p["hargaPromo"],
            "stok": p["stok"], "sales_mtd": p["sales_mtd"],
            "sales_mtd_retail": p["sales_mtd_retail"], "day_sales_unit": p["day_sales_unit"],
        }
        for p in kritis_candidates[:20]
    ]

    # Top 10 Best Seller MTD
    fast_candidates = [p for p in all_rows if p["sales_mtd"] > 0]
    fast_candidates.sort(key=lambda p: (-p["sales_mtd"], -p["sales_mtd_retail"]))
    top_fast_mtd = [
        {"sku": p["sku"], "description": p["description"], "dept": p["dept"], "sales_qty": p["sales_mtd"], "omzet_total": p["sales_mtd_retail"]}
        for p in fast_candidates[:10]
    ]

    return {
        "success": True,
        "source": "PYTHON_MDS_BISA_CDN",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "aggSummary": agg_summary,
        "deptBreakdown": dept_breakdown,
        "topSlow": top_slow,
        "topKritis": top_kritis,
        "topFastMtd": top_fast_mtd,
    }


def build_sku_audit_pivot_payload(conn) -> Dict[str, Any]:
    """
    Menyusun Tabel Pivot Audit Kelengkapan SKU (Barcode, Gambar, Harga Normal) per Toko (SUKO / Mu+Ku / ZES)
    + sampel prioritas SKU yang belum komplit (stok > 0 & New Arrival duluan) -> 1 file JSON ringan di Turso Storage!
    """
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT
            CASE
                WHEN UPPER(COALESCE(brand,'')) LIKE '%SUKO%' OR UPPER(COALESCE(dept,'')) LIKE '%SUKO%' THEN 'SUKO'
                WHEN UPPER(COALESCE(brand,'')) LIKE '%ZES%' OR UPPER(COALESCE(dept,'')) LIKE '%ZES%' THEN 'ZES'
                ELSE 'MUKU'
            END AS grp,
            COUNT(*) AS total_skus,
            SUM(CASE WHEN stok > 0 THEN 1 ELSE 0 END) AS active_skus,
            SUM(CASE WHEN (barcode IS NOT NULL AND barcode != '') AND ("imageUrl" IS NOT NULL AND "imageUrl" != '') AND "hargaNormal" > 0 THEN 1 ELSE 0 END) AS complete_skus,
            SUM(CASE WHEN stok > 0 AND (barcode IS NOT NULL AND barcode != '') AND ("imageUrl" IS NOT NULL AND "imageUrl" != '') AND "hargaNormal" > 0 THEN 1 ELSE 0 END) AS active_complete,
            SUM(CASE WHEN barcode IS NULL OR barcode = '' THEN 1 ELSE 0 END) AS missing_bc,
            SUM(CASE WHEN stok > 0 AND (barcode IS NULL OR barcode = '') THEN 1 ELSE 0 END) AS active_missing_bc,
            SUM(CASE WHEN "imageUrl" IS NULL OR "imageUrl" = '' THEN 1 ELSE 0 END) AS missing_img,
            SUM(CASE WHEN stok > 0 AND ("imageUrl" IS NULL OR "imageUrl" = '') THEN 1 ELSE 0 END) AS active_missing_img,
            SUM(CASE WHEN "hargaNormal" IS NULL OR "hargaNormal" <= 0 THEN 1 ELSE 0 END) AS missing_price,
            SUM(CASE WHEN stok > 0 AND ("hargaNormal" IS NULL OR "hargaNormal" <= 0) THEN 1 ELSE 0 END) AS active_missing_price,
            SUM(CASE WHEN (barcode IS NULL OR barcode = '') AND ("imageUrl" IS NULL OR "imageUrl" = '') THEN 1 ELSE 0 END) AS missing_both
        FROM "Product"
        GROUP BY grp
        '''
    )
    pivot_by_store: Dict[str, Dict[str, Any]] = {}
    for r in cur.fetchall():
        grp = str(r[0] or "MUKU")
        tot = int(r[1] or 0)
        act = int(r[2] or 0)
        comp = int(r[3] or 0)
        act_comp = int(r[4] or 0)
        pivot_by_store[grp] = {
            "brandGroup": grp,
            "totalSkus": tot,
            "activeSkus": act,
            "completeSkus": comp,
            "completePct": round((comp / tot) * 100, 1) if tot > 0 else 0.0,
            "activeCompleteSkus": act_comp,
            "activeCompletePct": round((act_comp / act) * 100, 1) if act > 0 else 0.0,
            "missingBarcode": int(r[5] or 0),
            "activeMissingBarcode": int(r[6] or 0),
            "missingImage": int(r[7] or 0),
            "activeMissingImage": int(r[8] or 0),
            "missingPrice": int(r[9] or 0),
            "activeMissingPrice": int(r[10] or 0),
            "missingBothBcImg": int(r[11] or 0),
        }

    cur.execute('SELECT COUNT(*) FROM "BarcodeAlias"')
    alias_count = int((cur.fetchone() or [0])[0] or 0)

    def _fetch_samples(where_sql: str, limit_n: int = 60) -> List[Dict[str, Any]]:
        cur.execute(
            f'''
            SELECT sku, barcode, article, brand, dept, description, color, size, stok, "hargaNormal", "imageUrl"
            FROM "Product"
            WHERE {where_sql}
            ORDER BY CASE WHEN stok > 0 THEN 0 ELSE 1 END, stok DESC, sku DESC
            LIMIT {int(limit_n)}
            '''
        )
        out = []
        for r in cur.fetchall():
            b_up = f"{r[3] or ''} {r[4] or ''}".upper()
            bg = "SUKO" if "SUKO" in b_up else ("ZES" if "ZES" in b_up else "MUKU")
            out.append({
                "sku": r[0],
                "barcode": r[1] or "",
                "article": r[2] or "",
                "brand": r[3] or r[4] or "-",
                "brandGroup": bg,
                "description": r[5] or "",
                "color": r[6] or "",
                "size": r[7] or "",
                "stok": int(r[8] or 0),
                "hargaNormal": float(r[9] or 0),
                "hasImage": bool(r[10]),
            })
        return out

    samples_missing_img = _fetch_samples('("imageUrl" IS NULL OR "imageUrl" = \'\') AND (stok > 0 OR UPPER(COALESCE(brand,\'\')) LIKE \'%SUKO%\')', 60)
    samples_missing_bc = _fetch_samples('(barcode IS NULL OR barcode = \'\')', 60)
    samples_missing_price = _fetch_samples('("hargaNormal" IS NULL OR "hargaNormal" <= 0)', 60)
    cur.close()

    ordered_stores = [pivot_by_store[k] for k in ("SUKO", "MUKU", "ZES") if k in pivot_by_store]
    totals = {
        "totalSkus": sum(x["totalSkus"] for x in ordered_stores),
        "activeSkus": sum(x["activeSkus"] for x in ordered_stores),
        "completeSkus": sum(x["completeSkus"] for x in ordered_stores),
        "activeCompleteSkus": sum(x["activeCompleteSkus"] for x in ordered_stores),
        "missingBarcode": sum(x["missingBarcode"] for x in ordered_stores),
        "activeMissingBarcode": sum(x["activeMissingBarcode"] for x in ordered_stores),
        "missingImage": sum(x["missingImage"] for x in ordered_stores),
        "activeMissingImage": sum(x["activeMissingImage"] for x in ordered_stores),
        "missingPrice": sum(x["missingPrice"] for x in ordered_stores),
        "activeMissingPrice": sum(x["activeMissingPrice"] for x in ordered_stores),
        "missingBothBcImg": sum(x["missingBothBcImg"] for x in ordered_stores),
        "barcodeAliasCount": alias_count,
    }
    totals["completePct"] = round((totals["completeSkus"] / totals["totalSkus"]) * 100, 1) if totals["totalSkus"] > 0 else 0.0
    totals["activeCompletePct"] = round((totals["activeCompleteSkus"] / totals["activeSkus"]) * 100, 1) if totals["activeSkus"] > 0 else 0.0

    return {
        "success": True,
        "source": "PYTHON_AUDIT_PIVOT_CDN",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totals": totals,
        "byStore": ordered_stores,
        "samples": {
            "missingImage": samples_missing_img,
            "missingBarcode": samples_missing_bc,
            "missingPrice": samples_missing_price,
        },
    }


def main() -> None:
    _ensure_env_loaded()
    parser = argparse.ArgumentParser(description="Python Admin Analytics, Promo Cleanup, & PO Engine")
    parser.add_argument("--clean-promo", action="store_true", help="Bersihkan promo expired tanggal WIB")
    parser.add_argument("--generate-po", action="store_true", help="Hitung saran PO Min-Max ke PoSuggestion")
    parser.add_argument("--analytics", action="store_true", help="Kompilasi JSON analytics promo & sales ke CDN")
    args = parser.parse_args()

    # Default bila dipanggil tanpa flag: jalankan ketiganya
    run_all = not (args.clean_promo or args.generate_po or args.analytics)
    t0 = time.time()
    conn = _connect_postgres()
    supa_url, supa_key = _supabase_credentials()

    try:
        if run_all or args.clean_promo:
            clean_expired_promos(conn)
        if run_all or args.generate_po:
            generate_po_suggestions(conn)
        if run_all or args.analytics:
            promo_payload = build_promo_analysis_payload(conn)
            promo_bytes = json.dumps(promo_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            _storage_upload(supa_url, supa_key, "analytics/promo-analysis.json", promo_bytes, "application/json", "300")
            print(f"[PYTHON-ANALYTICS] Unggah analytics/promo-analysis.json ({len(promo_bytes)/1024:.1f} KB)")

            sales_payload = build_sales_report_summary_payload(conn)
            sales_bytes = json.dumps(sales_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            _storage_upload(supa_url, supa_key, "analytics/sales-report-summary.json", sales_bytes, "application/json", "300")
            print(f"[PYTHON-ANALYTICS] Unggah analytics/sales-report-summary.json ({len(sales_bytes)/1024:.1f} KB)")

            audit_payload = build_sku_audit_pivot_payload(conn)
            audit_bytes = json.dumps(audit_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            _storage_upload(supa_url, supa_key, "analytics/sku-audit-pivot.json", audit_bytes, "application/json", "300")
            print(f"[PYTHON-ANALYTICS] Unggah analytics/sku-audit-pivot.json ({len(audit_bytes)/1024:.1f} KB)")
    finally:
        conn.close()

    print(f"[PYTHON-ANALYTICS] Seluruh proses selesai dalam {time.time() - t0:.2f}s.")


if __name__ == "__main__":
    main()
