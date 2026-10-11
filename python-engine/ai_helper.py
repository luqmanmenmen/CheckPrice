import os
import json
import httpx
import pandas as pd
from typing import Dict, Any, Optional, List, Tuple
from dotenv import load_dotenv

# Muat environment dari .env lokal dan root
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

def is_gemini_available() -> bool:
    """Periksa apakah GEMINI_API_KEY sudah disetel."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return bool(key)

def call_gemini(prompt: str, model: str = "gemini-flash-latest") -> Optional[str]:
    """
    Panggil Google Gemini REST API secara langsung.
    Menggunakan response_mime_type='application/json' agar output terjamin JSON valid.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    # URL endpoint Google Gemini Generative Language API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1
        }
    }

    try:
        with httpx.Client(timeout=35.0) as client:
            response = client.post(url, json=payload)
            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "")
            else:
                print(f"[GEMINI-AI ERROR] Status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"[GEMINI-AI ERROR] Gagal menghubungi Gemini API: {e}")

    return None


def consult_gemini_inquisitive(
    file_name: str,
    folder: str,
    sample_df: pd.DataFrame,
    detected_columns: List[str]
) -> Optional[Dict[str, Any]]:
    """
    Paradigma 'Mahasiswa Kritis & Dosen Ahli' Berorientasi Frontend Web Vercel:
    Pandas Engine (mahasiswa kritis) mengajukan pertanyaan spesifik seputar apa yang akan ditampilkan
    di layar web Vercel (Price Checker, Promo Unik, Barang Baru, Laporan Sales SPD/MTD, Rekap Stok).
    """
    if not is_gemini_available():
        return None

    try:
        sample_records = sample_df.head(8).fillna("").to_dict(orient="records")
        sample_str = json.dumps(sample_records, ensure_ascii=False)
    except Exception:
        sample_str = str(sample_df.head(8))

    prompt = f"""
Kamu adalah Senior Retail Data Architect & Lead Auditor.
Seorang mahasiswa data engineer (Pandas Engine) datang kepadamu dengan pertanyaan kritis.
Data ini akan diproses dan LANGSUNG DITAMPILKAN DI WEB VERCEL / FRONTEND PRICE CHECKER pada halaman-halaman berikut:
1. Layar Scanner / Cari Produk: butuh SKU, Barcode, Nama Produk rapi, Pil Varian Warna, Pil Ukuran, Harga Normal, Harga Promo, dan Stok Fisik (EOH Unit).
2. Layar Promo Unik: butuh Departemen, Tipe Promo (Beli 1 Gratis 1 / Diskon %), Tanggal Periode.
3. Layar Barang Baru: butuh Nama Model (Parent Name), Merk (Brand), dan tanggal masuk.
4. Layar Laporan Penjualan & Omzet: butuh Omzet Harian (SPD / Day Sales Retail & Unit), Omzet Bulan Berjalan (MTD Retail & Unit), Omzet Minggu Ini (WTD).
5. Layar Rekap Stok & Saran PO: butuh Stok Fisik (EOH Unit) dan Valuasi Inventori (EOH Retail).

Informasi File Mentah:
Nama File: "{file_name}"
Folder / Kategori: "{folder}"
Daftar Kolom (A s/d Z): {json.dumps(detected_columns, ensure_ascii=False)}
Cuplikan 8 Baris Sampel Data:
{sample_str}

Pertanyaan Kritis Pandas Engine:
Q1 [Frontend Search & Kartu Produk]: Kolom mana untuk nama barang agar di kartu pencarian web tampil rapi, lengkap, dan tidak berisi kode acak? Bagaimana memisahkan pil Warna dan Ukuran?
Q2 [Frontend Laporan Sales]: Di kartu web Omzet Harian (SPD) dan Omzet MTD, kolom mana yang memuat angka rupiah aktual dan unit terjual?
Q3 [Frontend Stok Toko]: Di badge stok web, kolom mana yang menjadi Single Source of Truth stok fisik toko (EOH Unit) dan nilai rupiah inventori (EOH Retail)?
Q4 [Frontend Promo Unik]: Jika ini file promo, apa teks mekanisme promonya agar badge diskon di web tampil tepat?
Q5 [Sanitasi & Format ERP]: Bagaimana cara membersihkan format seperti sel strip ' - ', angka dengan trailing minus '7 -', dan titik pemisah ribuan '1.270.400' atau '71.902'?
Q6 [Desain Pivot Table Sempurna]: Bagaimana resep Pivot Table terbaik (GroupBy SKU, SUM sales/stok, FIRST atribut) agar 50.000+ baris mentah terkonsolidasi 100% presisi tanpa duplikasi?

Berikan Rencana Keputusan Eksekusi (Blueprint JSON) persis:
{{
  "dialogue": {{
    "student_question_summary": "Bagaimana strategi akurasi sales, stok toko, penamaan produk web, dan Pivot Table sempurna dari file ini?",
    "advisor_advice": "<jawaban dan rekomendasi mendalam dari AI Dosen untuk kebutuhan web Vercel>"
  }},
  "header_row_index": <nomor baris header 0-indexed jika perlu digeser, atau 0>,
  "columns": {{
    "sku": "<nama persis kolom SKU>",
    "barcode": "<nama persis kolom barcode jika ada, atau null>",
    "product_name": "<nama kolom terbaik untuk deskripsi produk: misal ITEM_DESCRIPTION atau PARENT_NAME>",
    "dept": "<nama kolom department jika ada, atau null>",
    "group": "<nama kolom group jika ada, atau null>",
    "color": "<nama kolom color/warna jika ada, atau null>",
    "size": "<nama kolom size/ukuran jika ada, atau null>",
    "last_purchase_date": "<nama kolom last_purchase_date jika ada, atau null>",
    "harga_normal": "<nama kolom harga normal jika ada, atau null>",
    "stok_unit": "<nama kolom stok/EOH unit jika ada, atau null>",
    "stok_retail": "<nama kolom nilai retail stok/EOH retail jika ada, atau null>",
    "day_sales_unit": "<nama kolom day sales unit jika ada, atau null>",
    "day_sales_retail": "<nama kolom day sales retail jika ada, atau null>",
    "wtd_sales_unit": "<nama kolom wtd sales unit jika ada, atau null>",
    "wtd_sales_retail": "<nama kolom wtd sales retail jika ada, atau null>",
    "mtd_sales_unit": "<nama kolom mtd sales unit jika ada, atau null>",
    "mtd_sales_retail": "<nama kolom mtd sales retail jika ada, atau null>",
    "ytd_sales_unit": "<nama kolom ytd sales unit jika ada, atau null>",
    "ytd_sales_retail": "<nama kolom ytd sales retail jika ada, atau null>",
    "boy_unit": "<nama kolom boy unit jika ada, atau null>",
    "boy_retail": "<nama kolom boy retail jika ada, atau null>",
    "bom_unit": "<nama kolom bom unit jika ada, atau null>"
  }},
  "pivot_strategy": {{
    "enable_pivot": true,
    "group_by": "<nama kolom SKU>",
    "sum_columns": ["<kolom day_sales_unit>", "<kolom day_sales_retail>", "<kolom mtd_sales_unit>", "<kolom mtd_sales_retail>", "<kolom stok_unit>", "<kolom stok_retail>"],
    "first_columns": ["<kolom product_name>", "<kolom dept>", "<kolom color>", "<kolom size>", "<kolom barcode>", "<kolom last_purchase_date>"]
  }},
  "price_formula": "EOH_RETAIL_DIV_EOH_UNIT" | "MTD_RETAIL_DIV_MTD_UNIT" | "EXPLICIT_PRICE",
  "promo_info": {{
    "is_promo": <boolean>,
    "tipe_diskon": "<tipe diskon standar jika ada promo, atau null>",
    "harga_promo": <angka jika ada special price, atau null>
  }}
}}
PENTING:
- Pastikan semua nilai nama kolom di objek 'columns' persis ada di daftar kolom yang diberikan.
- Kembalikan HANYA format JSON valid tanpa teks pengantar.
"""

    raw_response = call_gemini(prompt)
    if not raw_response:
        return None

    try:
        result = json.loads(raw_response)
        advice = result.get("dialogue", {}).get("advisor_advice", "")

        # Cetak Dialog Konsultasi ke Terminal Console dengan Format Estetis
        print("\n" + "="*70)
        print(f"🎓 [PANDAS ENGINE BERKONSULTASI SECARA KRITIS KE GEMINI AI]")
        print(f"📁 File: {file_name} ({folder}) | Kolom Terdeteksi: {len(detected_columns)}")
        print(f"🎯 Fokus Target UI: Price Checker, Promo Unik, Laporan Penjualan (SPD/MTD), Rekap Stok")
        print(f"❓ Pertanyaan Pandas: 'Dosen AI, bagaimana strategi paling akurat untuk mengelola data agar tampilan web Vercel 100% presisi dan tidak glitch?'")
        print("-" * 70)
        print(f"🤖 [JAWABAN & INSTRUKSI DOSEN GEMINI AI]:")
        print(f"\"{advice}\"")
        print("="*70)

        return result
    except Exception as e:
        print(f"[GEMINI-AI ERROR] Gagal parse JSON hasil konsultasi: {e}")
        return None


def audit_ai_recommendations(
    df: pd.DataFrame,
    ai_bp: Dict[str, Any]
) -> Tuple[Dict[str, Any], int, List[str]]:
    """
    SISTEM AUDIT INDEPENDEN PANDAS ENGINE:
    Memverifikasi rekomendasi dari Gemini AI secara kritis:
    1. Memastikan kolom yang dipilih AI benar-benar ada di DataFrame.
       Jika halusinasi / salah ketik -> otomatis fuzzy match & koreksi ke kolom riil.
    2. Mengaudit integritas kolom SKU, Sales, dan Stok.
    3. Menghitung Skor Kesiapan Frontend Web Vercel (0 s/d 100%).
    4. Memberikan peringatan audit transparan jika ada jawaban AI yang tidak valid.
    """
    audit_logs: List[str] = []
    corrected_columns: Dict[str, Any] = {}
    readiness_score = 100

    raw_cols = ai_bp.get("columns", {})
    df_cols_upper = [str(c).strip().upper() for c in df.columns]
    df_cols_map = {str(c).strip().upper(): c for c in df.columns}

    # Helper pencari kolom alternatif jika AI salah sebut
    def find_best_matching_column(target: str, keywords: List[str]) -> Optional[str]:
        target_clean = str(target).strip().upper()
        # 1. Cek exact match case-insensitive
        if target_clean in df_cols_map:
            return df_cols_map[target_clean]
        # 2. Cek substring match
        for col_upper, orig_col in df_cols_map.items():
            if target_clean in col_upper or col_upper in target_clean:
                return orig_col
        # 3. Cek keyword fallback
        for col_upper, orig_col in df_cols_map.items():
            if any(k in col_upper for k in keywords):
                return orig_col
        return None

    # Daftar kata kunci fallback per kategori frontend
    KEYWORD_MAPPING = {
        "sku": ["SKU", "KODE PRODUK", "ARTICLE", "ART"],
        "barcode": ["BARCODE", "EAN", "UPC"],
        "product_name": ["ITEM_DESCRIPTION", "PARENT_NAME", "DESC", "NAMA", "ITEM"],
        "dept": ["DEPARTMENT", "DEPT", "BAGIAN"],
        "color": ["COLOR", "WARNA", "COLOUR"],
        "size": ["SIZE", "UKURAN"],
        "stok_unit": ["EOH UNIT", "STOK", "STOCK"],
        "stok_retail": ["EOH RETAIL", "NILAI STOK"],
        "day_sales_unit": ["DAY SALES UNIT", "DAY_SALES_UNIT"],
        "day_sales_retail": ["DAY SALES RETAIL", "DAY_SALES_RETAIL"],
        "mtd_sales_unit": ["MTD SALES UNIT", "MTD_SALES_UNIT"],
        "mtd_sales_retail": ["MTD SALES RETAIL", "MTD_SALES_RETAIL"],
        "wtd_sales_unit": ["WTD SALES UNIT", "WTD_SALES_UNIT"],
        "wtd_sales_retail": ["WTD SALES RETAIL", "WTD_SALES_RETAIL"],
        "harga_normal": ["NORMAL", "RETAIL PRICE", "HARGA"],
        "last_purchase_date": ["LAST_PURCHASE", "TGL_BELI"]
    }

    # 1. AUDIT & KOREKSI KOLOM
    for field_key, suggested_col in raw_cols.items():
        if not suggested_col or str(suggested_col).lower() in ["null", "none", ""]:
            # Coba cari fallback jika kolom kritis
            fallback_col = find_best_matching_column("", KEYWORD_MAPPING.get(field_key, []))
            corrected_columns[field_key] = fallback_col
            if fallback_col and field_key in ["sku", "product_name", "stok_unit"]:
                audit_logs.append(f"🔧 [AUTO-DETECT]: AI tidak mengisi '{field_key}', otomatis dipetakan ke '{fallback_col}'.")
            continue

        suggested_str = str(suggested_col).strip()
        matched = find_best_matching_column(suggested_str, KEYWORD_MAPPING.get(field_key, []))

        if matched:
            if matched != suggested_str:
                audit_logs.append(f"⚠️ [AUDIT CORRECTION]: Rekomendasi AI '{suggested_str}' dikoreksi otomatis ke kolom riil '{matched}'.")
            corrected_columns[field_key] = matched
        else:
            audit_logs.append(f"❌ [AUDIT REJECT]: Kolom '{suggested_str}' untuk '{field_key}' TIDAK DITEMUKAN di file mentah!")
            corrected_columns[field_key] = None
            if field_key in ["sku", "stok_unit", "day_sales_retail"]:
                readiness_score -= 15

    # 2. AUDIT INTEGRITAS SKU (Single Source of Truth)
    sku_col = corrected_columns.get("sku")
    if not sku_col or sku_col not in df.columns:
        audit_logs.append("🚨 [CRITICAL AUDIT]: Kolom SKU gagal terverifikasi! Engine beralih ke mode heuristik darurat.")
        readiness_score -= 30
    else:
        sample_skus = df[sku_col].dropna().astype(str).str.strip()
        valid_skus = [s for s in sample_skus if s and not any(k in s.upper() for k in ["TOTAL", "VALUES", "DATA_AS_OF"])]
        if len(valid_skus) == 0:
            audit_logs.append("⚠️ [AUDIT WARNING]: Sampel kolom SKU tampak kosong atau hanya memuat baris metadata.")
            readiness_score -= 20
        else:
            audit_logs.append(f"✅ [AUDIT SKU]: Kolom SKU '{sku_col}' terverifikasi dengan data valid.")

    # 3. AUDIT KESIAPAN KOMPONEN FRONTEND
    # Nama Produk
    if corrected_columns.get("product_name"):
        audit_logs.append(f"✅ [UI DISPLAY]: Nama produk terverifikasi pada '{corrected_columns.get('product_name')}'.")
    else:
        audit_logs.append("⚠️ [UI DISPLAY WARNING]: Kolom nama produk tidak terdeteksi langsung, akan menggunakan nomor SKU.")
        readiness_score -= 10

    # Varian Warna & Ukuran
    if corrected_columns.get("color") or corrected_columns.get("size"):
        audit_logs.append(f"✅ [UI VARIANT]: Pil Varian Warna ({corrected_columns.get('color')}) & Ukuran ({corrected_columns.get('size')}) siap.")
    else:
        audit_logs.append("ℹ️ [UI VARIANT]: Varian warna/ukuran akan di-ekstrak cerdas dari pola teks deskripsi.")

    # Laporan Sales & Omzet Harian (SPD)
    if corrected_columns.get("day_sales_retail"):
        audit_logs.append(f"✅ [UI SALES]: Omzet Harian (SPD) terverifikasi pada '{corrected_columns.get('day_sales_retail')}'.")
    else:
        readiness_score -= 10

    # Stok Fisik (EOH Unit)
    if corrected_columns.get("stok_unit"):
        audit_logs.append(f"✅ [UI STOCK]: Stok Toko terverifikasi pada '{corrected_columns.get('stok_unit')}'.")
    else:
        readiness_score -= 10

    readiness_score = max(0, min(100, readiness_score))

    # CETAK LAPORAN AUDIT KE TERMINAL
    print("\n" + "="*70)
    print("🛡️ [HASIL AUDIT INDEPENDEN PANDAS ENGINE TERHADAP SARAN AI]")
    status_str = "LULUS VERIFIKASI (PASSED)" if readiness_score >= 80 else "PERBAIKAN OTOMATIS (CORRECTED)"
    print(f"📋 Status Audit: {status_str} | Skor Kesiapan Web Vercel: {readiness_score}/100")
    print("-" * 70)
    for log in audit_logs:
        print(f" {log}")
    print("="*70 + "\n")

    # Update objek ai_bp dengan kolom yang telah diaudit & dikoreksi
    audited_bp = dict(ai_bp)
    audited_bp["columns"] = corrected_columns
    audited_bp["readiness_score"] = readiness_score
    audited_bp["audit_logs"] = audit_logs

    return audited_bp, readiness_score, audit_logs
