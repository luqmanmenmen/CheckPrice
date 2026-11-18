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
    if os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL"):
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
            sd = sdate.date() if hasattr(sdate, "date") else sdate
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
    """Pre-compute agregasi penuh tabel Product (310k+ SKU) sekali di Python untuk CDN."""
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT
            COALESCE(SUM(day_sales_retail), 0)::float8,
            COALESCE(SUM(day_sales_unit), 0)::bigint,
            COALESCE(SUM(sales_wtd), 0)::bigint,
            COALESCE(SUM(sales_wtd_retail), 0)::float8,
            COALESCE(SUM(sales_mtd), 0)::bigint,
            COALESCE(SUM(sales_mtd_retail), 0)::float8,
            COALESCE(SUM(sales_ytd), 0)::bigint,
            COALESCE(SUM(sales_ytd_retail), 0)::float8,
            COALESCE(SUM(eoh_retail), 0)::float8,
            COALESCE(SUM(stok), 0)::bigint,
            COALESCE(SUM(boy_unit), 0)::bigint,
            COALESCE(SUM(boy_retail), 0)::float8,
            COALESCE(SUM(bom_unit), 0)::bigint,
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE "hargaPromo" IS NOT NULL OR diskon IS NOT NULL)::bigint
        FROM "Product"
        '''
    )
    row = cur.fetchone()
    agg_summary = {
        "day_sales_retail": float(row[0] or 0),
        "day_sales_unit": int(row[1] or 0),
        "sales_wtd": int(row[2] or 0),
        "sales_wtd_retail": float(row[3] or 0),
        "sales_mtd": int(row[4] or 0),
        "sales_mtd_retail": float(row[5] or 0),
        "sales_ytd": int(row[6] or 0),
        "sales_ytd_retail": float(row[7] or 0),
        "eoh_retail": float(row[8] or 0),
        "stok": int(row[9] or 0),
        "boy_unit": int(row[10] or 0),
        "boy_retail": float(row[11] or 0),
        "bom_unit": int(row[12] or 0),
        "totalProducts": int(row[13] or 0),
        "totalWithPromo": int(row[14] or 0),
    }

    cur.execute(
        '''
        SELECT sku, description, article, dept, brand, "hargaNormal", "hargaPromo",
               diskon, stok, sales_mtd, sales_mtd_retail, sales_ytd, eoh_retail, bom_unit
        FROM "Product"
        WHERE stok > 5 AND sales_mtd <= 2
        ORDER BY stok DESC, sales_mtd ASC
        LIMIT 20
        '''
    )
    top_slow = [
        {
            "sku": r[0], "description": r[1], "article": r[2], "dept": r[3], "brand": r[4],
            "hargaNormal": float(r[5] or 0), "hargaPromo": float(r[6]) if r[6] is not None else None,
            "diskon": r[7], "stok": int(r[8] or 0), "sales_mtd": int(r[9] or 0),
            "sales_mtd_retail": float(r[10] or 0), "sales_ytd": int(r[11] or 0),
            "eoh_retail": float(r[12] or 0), "bom_unit": int(r[13] or 0),
        }
        for r in cur.fetchall()
    ]

    cur.execute(
        '''
        SELECT sku, description, article, dept, "hargaNormal", "hargaPromo",
               stok, sales_mtd, sales_mtd_retail, day_sales_unit
        FROM "Product"
        WHERE sales_mtd >= 3 AND stok BETWEEN 0 AND 5
        ORDER BY stok ASC, sales_mtd DESC
        LIMIT 20
        '''
    )
    top_kritis = [
        {
            "sku": r[0], "description": r[1], "article": r[2], "dept": r[3],
            "hargaNormal": float(r[4] or 0), "hargaPromo": float(r[5]) if r[5] is not None else None,
            "stok": int(r[6] or 0), "sales_mtd": int(r[7] or 0),
            "sales_mtd_retail": float(r[8] or 0), "day_sales_unit": int(r[9] or 0),
        }
        for r in cur.fetchall()
    ]

    cur.execute(
        '''
        SELECT sku, description, sales_mtd, sales_mtd_retail
        FROM "Product"
        WHERE sales_mtd > 0
        ORDER BY sales_mtd DESC, sales_mtd_retail DESC
        LIMIT 10
        '''
    )
    top_fast_mtd = [
        {"sku": r[0], "description": r[1], "sales_qty": int(r[2] or 0), "omzet_total": float(r[3] or 0)}
        for r in cur.fetchall()
    ]

    cur.close()
    return {
        "success": True,
        "source": "PYTHON_PRECOMPUTED_CDN",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "aggSummary": agg_summary,
        "topSlow": top_slow,
        "topKritis": top_kritis,
        "topFastMtd": top_fast_mtd,
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
    finally:
        conn.close()

    print(f"[PYTHON-ANALYTICS] Seluruh proses selesai dalam {time.time() - t0:.2f}s.")


if __name__ == "__main__":
    main()
