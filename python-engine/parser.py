import pandas as pd
import re
import os
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

MONTH_MAP = {
    'JAN': '01', 'JANUARI': '01', 'JANUARY': '01',
    'FEB': '02', 'FEBRUARI': '02', 'FEBRUARY': '02',
    'MAR': '03', 'MARET': '03', 'MARCH': '03',
    'APR': '04', 'APRIL': '04',
    'MEI': '05', 'MAY': '05',
    'JUN': '06', 'JUNI': '06', 'JUNE': '06',
    'JUL': '07', 'JULI': '07', 'JULY': '07',
    'AGU': '08', 'AGUSTUS': '08', 'AUGUST': '08',
    'SEP': '09', 'SEPTEMBER': '09',
    'OKT': '10', 'OKTOBER': '10', 'OCTOBER': '10',
    'NOV': '11', 'NOVEMBER': '11',
    'DES': '12', 'DESEMBER': '12', 'DECEMBER': '12'
}

# Cache saran AI terakhir untuk keperluan log & SyncHistory
last_ai_advice: str = ""

def get_last_ai_advice() -> str:
    """Ambil saran/keputusan terakhir yang diberikan oleh Gemini AI."""
    global last_ai_advice
    return last_ai_advice

def clean_sku(val: Any) -> str:
    """Membersihkan SKU: hapus trailing .0 jika terbaca sebagai float, strip whitespace."""
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    if s.endswith('.0') and s[:-2].isdigit():
        return s[:-2]
    return s

def clean_number(val: Any, is_float: bool = False) -> Any:
    """
    Membersihkan angka ritel (mendukung format POS / ERP ritel Indonesia):
    - ' - ' -> 0
    - '7 -' -> -7 (trailing minus format SAP/ERP)
    - '1.270.400' -> 1270400 (titik pemisah ribuan Rupiah)
    - '71.902' -> 71902
    - '215,730' -> 215730
    """
    if pd.isna(val) or val is None:
        return 0.0 if is_float else 0
    try:
        s = str(val).strip()
        if s in ['-', ' - ', '-   ', ' -', '- ', '']:
            return 0.0 if is_float else 0

        # Tangani trailing minus seperti "7 -" atau "7-" -> "-7"
        is_negative = False
        if s.endswith('-'):
            is_negative = True
            s = s[:-1].strip()
        elif s.startswith('-'):
            is_negative = True
            s = s[1:].strip()

        # Hilangkan koma ribuan
        s = s.replace(',', '')

        # Tangani format titik ribuan Rupiah Indonesia (contoh: 1.270.400 atau 71.902)
        if s.count('.') > 1:
            s = s.replace('.', '')
        elif s.count('.') == 1:
            parts = s.split('.')
            # Jika setelah titik ada 3 digit (format ribuan Rupiah e.g. 71.902)
            if len(parts[1]) == 3 and not is_float:
                s = parts[0] + parts[1]

        if s.lower() in ['nan', 'null', 'none', '']:
            return 0.0 if is_float else 0

        num = float(s)
        if is_negative:
            num = -num

        if pd.isna(num):
            return 0.0 if is_float else 0

        return float(num) if is_float else int(round(num))
    except Exception:
        return 0.0 if is_float else 0

def clean_barcode(val: Any) -> Optional[str]:
    """Validasi barcode agar aman untuk Postgres unique constraint."""
    if pd.isna(val) or val is None:
        return None
    s = str(val).strip()
    if s.endswith('.0') and s[:-2].isdigit():
        s = s[:-2]
    if len(s) >= 6 and s.lower() not in ['nan', 'null', 'none', '-', '']:
        return s
    return None

def parse_date_value(val: Any) -> Optional[str]:
    """Mengubah berbagai format tanggal ke format standar YYYY-MM-DD."""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if not s or s.lower() in ['nan', 'null', 'none', '-']:
        return None
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s[:10]
    m = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})', s)
    if m:
        month_or_day_1, month_or_day_2, year = m.groups()
        # Jika hari/bulan format 9/29/2026 (US) atau 29/9/2026 (ID)
        p1 = int(month_or_day_1)
        p2 = int(month_or_day_2)
        if p1 > 12: # p1 adalah hari
            day, month = p1, p2
        else: # p1 adalah bulan (format umum US POS seperti 9/29/2026)
            month, day = p1, p2
        return f"{year}-{str(month).zfill(2)}-{str(day).zfill(2)}"
    return s[:10] if len(s) >= 10 else s

def extract_brand_dept(file_path: str) -> Tuple[str, str]:
    """Ekstrak Brand dan Departemen dari nama file / path."""
    file_name_upper = os.path.basename(str(file_path)).upper()
    dept_name = "DEPARTEMEN LAINNYA"

    if "3357" in file_name_upper: dept_name = "SUKO HOME LIVING"
    elif "3356" in file_name_upper: dept_name = "SUKO ACCS"
    elif "3358" in file_name_upper: dept_name = "SUKO FOOTWEAR"
    elif "3369" in file_name_upper: dept_name = "SUKO UNDERWEAR"
    elif "3367" in file_name_upper: dept_name = "SUKO APPAREL"
    elif "3343" in file_name_upper: dept_name = "SUKO WORKWEAR"
    elif "3348" in file_name_upper: dept_name = "SUKO SPORTS LADIES"
    elif "3349" in file_name_upper: dept_name = "SUKO SPORTS MEN"
    elif "3327" in file_name_upper: dept_name = "SUKO MEN"
    elif "3328" in file_name_upper: dept_name = "SUKO LADIES"
    elif "3366" in file_name_upper: dept_name = "SUKO CHILDREN BOYS"
    elif "3368" in file_name_upper: dept_name = "SUKO SLEEPWEAR"
    elif "3373" in file_name_upper: dept_name = "SUKO SHOES LADIES"
    elif "3389" in file_name_upper: dept_name = "BYRCH & CO LADIES FOOTWEAR"
    elif "3391" in file_name_upper: dept_name = "BYRCH & CO MEN FOOTWEAR"
    elif "3393" in file_name_upper: dept_name = "BYRCH & CO KIDS FOOTWEAR"
    elif "-" in file_name_upper:
        parts = file_name_upper.split("-")
        if len(parts) > 1:
            clean_part = parts[1].replace(".XLSX", "").replace(".CSV", "").strip()
            if clean_part:
                dept_name = clean_part

    brand = "SUKO"
    if "BYRCH" in file_name_upper or "BYRCH" in dept_name:
        brand = "BYRCH & CO"
    elif "NEVADA" in file_name_upper:
        brand = "NEVADA"
    elif "CONNEXION" in file_name_upper:
        brand = "CONNEXION"

    return brand, dept_name

def extract_variants_and_article(description: str, row_dict: Dict[str, Any], brand_default: str = "SUKO") -> Dict[str, Any]:
    """Ekstrak article, brand, color, size dari kolom spesifik atau dari pola deskripsi."""
    brand = brand_default
    color = ""
    size = ""
    article = ""
    clean_desc = description.strip()

    for k, v in row_dict.items():
        if pd.isna(v) or v is None:
            continue
        val_str = str(v).strip()
        k_upper = str(k).upper()

        if ('BRAND' in k_upper or 'MERK' in k_upper) and not brand:
            brand = val_str
        elif ('WARNA' in k_upper or 'COLOR' in k_upper or 'COLOUR' in k_upper) and not color:
            color = val_str
        elif ('SIZE' in k_upper or 'UKURAN' in k_upper) and not size:
            size = val_str
        elif ('ARTICLE' in k_upper or 'ARTIKEL' in k_upper or 'ART_NO' in k_upper or 'MODEL' in k_upper) and not article:
            article = val_str

    if ":" in clean_desc:
        parts = [p.strip() for p in clean_desc.split(":") if p.strip()]
        if len(parts) >= 1:
            clean_desc = parts[0]
            if not article:
                article = parts[0]
        if len(parts) >= 2 and not color:
            color = parts[1]
        if len(parts) >= 3 and not size:
            size = parts[2]
    elif not article:
        article = clean_desc

    if color.upper() in ["F", "M", "SOLID", "ALL SIZE"]:
        color = ""
    if size.upper() in ["SOLID"]:
        size = ""

    return {
        "article": article if article else None,
        "brand": brand if brand else "SUKO",
        "color": color if color else None,
        "size": size if size else None,
        "clean_desc": clean_desc if clean_desc else description
    }

def extract_date_from_filename(filename: str) -> Optional[datetime]:
    """Mencari tanggal dari nama file seperti 'PQ 28 OKTOBER 2026.xlsx'."""
    upper = os.path.basename(filename).upper()
    match = re.search(r'(\d{1,2})\s+([A-Z]+)\s+(\d{4})', upper)
    if match:
        day_str, month_str, year_str = match.groups()
        month_num = MONTH_MAP.get(month_str)
        if month_num:
            try:
                return datetime(int(year_str), int(month_num), int(day_str))
            except Exception:
                pass

    match2 = re.search(r'(\d{4})[-_](\d{2})[-_](\d{2})', upper)
    if match2:
        year_str, month_str, day_str = match2.groups()
        try:
            return datetime(int(year_str), int(month_num), int(day_str))
        except Exception:
            pass

    return None


# ─────────────────────────────────────────────────────────────
#  JALUR 1: KHUSUS MEMBACA FILE PROMO DENGAN ASISTEN AI
# ─────────────────────────────────────────────────────────────
def parse_promo_file(file_path: str) -> List[Dict[str, Any]]:
    """Membaca file Promo Excel dengan konsultasi kritis ke Gemini AI."""
    global last_ai_advice
    print(f"\n[PARSER-PROMO] Mulai membaca file Promo: {file_path}")

    try:
        all_sheets = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
    except Exception as e:
        print(f"[PARSER-PROMO ERROR] Gagal membaca Excel: {e}")
        return []

    combined_data = []
    brand_from_file, dept_name = extract_brand_dept(file_path)

    for sheet_name, df in all_sheets.items():
        print(f"-> Membedah sheet PROMO: '{sheet_name}' ({len(df)} baris)")
        if df.empty:
            continue

        df.columns = [str(col).strip().upper() for col in df.columns]

        # 🎓 KONSULTASI KRITIS KE GEMINI AI
        ai_bp = None
        from ai_helper import consult_gemini_inquisitive, audit_ai_recommendations, is_gemini_available
        if is_gemini_available():
            ai_raw_bp = consult_gemini_inquisitive(
                file_name=os.path.basename(file_path),
                folder="PROMO",
                sample_df=df.head(10),
                detected_columns=[str(c) for c in df.columns]
            )
            if ai_raw_bp:
                ai_bp, readiness_score, audit_logs = audit_ai_recommendations(df, ai_raw_bp)
                last_ai_advice = ai_bp.get("dialogue", {}).get("advisor_advice", "")

        sku_col = None
        barcode_col = None
        col_harga_normal = None
        col_harga_promo = None
        col_tgl_mulai = None
        col_tgl_akhir = None
        col_desc = None
        tipe_diskon = None
        harga_promo = 0
        is_promo = False

        if ai_bp:
            h_idx = ai_bp.get("header_row_index", 0)
            if h_idx > 0 and h_idx < len(df):
                df.columns = [str(val).strip().upper() for val in df.iloc[h_idx]]
                df = df.iloc[h_idx+1:].reset_index(drop=True)

            ai_cols = ai_bp.get("columns", {})
            sku_col = ai_cols.get("sku")
            barcode_col = ai_cols.get("barcode")
            col_desc = ai_cols.get("product_name")
            col_harga_normal = ai_cols.get("harga_normal")
            col_harga_promo = ai_cols.get("harga_promo")

            p_info = ai_bp.get("promo_info", {})
            if p_info.get("tipe_diskon"):
                tipe_diskon = p_info["tipe_diskon"]
                is_promo = True
            if p_info.get("harga_promo"):
                harga_promo = clean_number(p_info["harga_promo"])
                is_promo = True

        # Fallback Heuristik jika AI tidak mengembalikan kolom
        if not sku_col:
            for col in df.columns:
                if 'SKU' in col or 'KODE PRODUK' in col or 'ARTICLE' in col:
                    if not sku_col: sku_col = col
                if 'BARCODE' in col or 'EAN' in col or 'UPC' in col:
                    barcode_col = col

        if not sku_col:
            for i in range(min(20, len(df))):
                row_vals = [str(val).strip().upper() for val in df.iloc[i]]
                if any('SKU' in val or 'BARCODE' in val or 'KODE' in val or 'ARTICLE' in val for val in row_vals):
                    df.columns = row_vals
                    df = df.iloc[i+1:].reset_index(drop=True)
                    for col in df.columns:
                        if ('SKU' in col or 'KODE' in col or 'ARTICLE' in col) and not sku_col:
                            sku_col = col
                        if ('BARCODE' in col or 'EAN' in col) and not barcode_col:
                            barcode_col = col
                    break

        if not sku_col and barcode_col:
            sku_col = barcode_col

        if not sku_col:
            print(f"   [SKIP] Melewati sheet '{sheet_name}' karena tidak ada kolom SKU.")
            continue

        sheet_upper = str(sheet_name).upper()

        if not is_promo:
            if "B1G1" in sheet_upper or "B2G1" in sheet_upper or "B3G1" in sheet_upper or "BOGO" in sheet_upper:
                match = re.search(r'B(\d+)G(\d+)', sheet_upper)
                tipe_diskon = f"BELI {match.group(1)} GRATIS {match.group(2)}" if match else "BELI 1 GRATIS 1"
                is_promo = True
            elif "B1D" in sheet_upper or "B2D" in sheet_upper:
                match = re.search(r'B(\d+)D(\d+)', sheet_upper)
                tipe_diskon = f"BELI {match.group(1)} DISKON {match.group(2)}%" if match else "DISKON TAMBAHAN"
                is_promo = True
            elif "SP" in sheet_upper or "SPECIAL" in sheet_upper:
                match = re.search(r'SP\s*(\d+)', sheet_upper)
                if match:
                    harga_promo = int(match.group(1)) * 1000
                    tipe_diskon = f"HARGA SPESIAL {harga_promo}"
                else:
                    tipe_diskon = "HARGA SPESIAL"
                is_promo = True
            elif "%" in sheet_upper or "DISC" in sheet_upper:
                match = re.search(r'(\d+)\s*%', sheet_upper) or re.search(r'DISC\s*(\d+)', sheet_upper)
                tipe_diskon = f"DISKON {match.group(1)}%" if match else "DISKON SPESIAL"
                is_promo = True

        for col in df.columns:
            if any(k in col for k in ['FROM', 'MULAI', 'START']) and not col_tgl_mulai:
                col_tgl_mulai = col
            elif any(k in col for k in ['TO DATE', 'AKHIR', 'END']) and not col_tgl_akhir:
                col_tgl_akhir = col
            elif any(k in col for k in ['NORMAL', 'HARGA NORMAL', 'RETAIL PRICE', 'PRICE']) and not col_harga_normal:
                col_harga_normal = col
            elif any(k in col for k in ['PROMO', 'HARGA PROMO', 'SPECIAL PRICE']) and not col_harga_promo:
                col_harga_promo = col
            elif any(k in col for k in ['DESC', 'NAMA', 'ITEM', 'DESCRIPTION']) and not col_desc:
                col_desc = col

        for _, row in df.iterrows():
            sku = clean_sku(row.get(sku_col, ""))
            if not sku or sku.lower() == 'nan' or 'SKU' in sku.upper():
                continue

            harga_normal = clean_number(row.get(col_harga_normal, 0)) if col_harga_normal else 0
            baris_harga_promo = harga_promo
            if col_harga_promo:
                hp_val = clean_number(row.get(col_harga_promo, 0))
                if hp_val > 0:
                    baris_harga_promo = hp_val
                    is_promo = True

            tgl_mulai = parse_date_value(row.get(col_tgl_mulai)) if col_tgl_mulai else None
            tgl_akhir = parse_date_value(row.get(col_tgl_akhir)) if col_tgl_akhir else None

            raw_desc = str(row.get(col_desc, "")).strip() if col_desc and pd.notna(row.get(col_desc)) else f"Produk {sku}"
            raw_barcode = clean_barcode(row.get(barcode_col)) if barcode_col else None
            if not raw_barcode and len(sku) >= 12 and sku.isdigit():
                raw_barcode = sku

            variants = extract_variants_and_article(raw_desc, row.to_dict(), brand_default=brand_from_file)

            combined_data.append({
                "sku": sku,
                "barcode": raw_barcode,
                "article": variants["article"],
                "brand": variants["brand"],
                "dept": dept_name,
                "color": variants["color"],
                "size": variants["size"],
                "description": variants["clean_desc"],
                "harga_normal": harga_normal,
                "is_promo": is_promo,
                "tipe_diskon": tipe_diskon,
                "harga_promo": baris_harga_promo if is_promo and baris_harga_promo > 0 else None,
                "tgl_mulai": tgl_mulai,
                "tgl_akhir": tgl_akhir,
                "sumber_sheet": sheet_name,
            })

    print(f"[PARSER-PROMO SELESAI] Sukses memproses {len(combined_data)} SKU.")
    return combined_data


# ─────────────────────────────────────────────────────────────
#  JALUR 2: KHUSUS MEMBACA FILE PQ DENGAN ASISTEN AI
# ─────────────────────────────────────────────────────────────
def parse_pq_file(file_path: str) -> List[Dict[str, Any]]:
    """Membaca file PQ (Power Query) dengan konsultasi kritis ke Gemini AI."""
    global last_ai_advice
    print(f"\n[PARSER-PQ] Mulai membaca file PQ: {file_path}")
    all_sheets: Dict[str, pd.DataFrame] = {}

    try:
        if file_path.lower().endswith('.csv'):
            df = None
            encodings = ['utf-8', 'utf-8-sig', 'latin1', 'cp1252']
            separators = [None, ',', ';', '\t']

            for enc in encodings:
                for sep in separators:
                    try:
                        if sep is None:
                            temp_df = pd.read_csv(file_path, sep=None, engine='python', on_bad_lines='skip', encoding=enc)
                        else:
                            temp_df = pd.read_csv(file_path, sep=sep, on_bad_lines='skip', encoding=enc, low_memory=False)
                        if len(temp_df.columns) > 1:
                            df = temp_df
                            break
                    except Exception:
                        continue
                if df is not None:
                    break

            if df is None:
                df = pd.read_csv(file_path, on_bad_lines='skip', encoding='latin1', low_memory=False)
            all_sheets = {'CSV_DATA': df}
        else:
            all_sheets = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
    except Exception as e:
        print(f"[PARSER-PQ ERROR] Gagal membaca file: {e}")
        return []

    combined_data = []
    brand_from_file, dept_from_file = extract_brand_dept(file_path)

    for sheet_name, df in all_sheets.items():
        print(f"-> Membedah sheet PQ: '{sheet_name}' ({len(df)} baris)")
        if df.empty:
            continue

        df.columns = [str(col).strip().upper() for col in df.columns]

        # 🎓 KONSULTASI KRITIS KE GEMINI AI
        ai_bp = None
        from ai_helper import consult_gemini_inquisitive, audit_ai_recommendations, is_gemini_available
        if is_gemini_available():
            ai_raw_bp = consult_gemini_inquisitive(
                file_name=os.path.basename(file_path),
                folder="PQ",
                sample_df=df.head(10),
                detected_columns=[str(c) for c in df.columns]
            )
            if ai_raw_bp:
                ai_bp, readiness_score, audit_logs = audit_ai_recommendations(df, ai_raw_bp)
                last_ai_advice = ai_bp.get("dialogue", {}).get("advisor_advice", "")

        sku_col = None
        barcode_col = None
        col_desc = None
        col_parent = None
        col_dept = None
        col_color = None
        col_size = None
        col_last_purchase = None
        col_harga_normal = None
        col_stok = None
        col_eoh_retail = None
        col_sales_mtd = None
        col_sales_mtd_retail = None
        col_sales_wtd = None
        col_sales_wtd_retail = None
        col_sales_ytd = None
        col_sales_ytd_retail = None
        col_boy_unit = None
        col_boy_retail = None
        col_bom_unit = None
        col_bom_retail = None
        col_day_sales_unit = None
        col_day_sales_retail = None

        if ai_bp:
            h_idx = ai_bp.get("header_row_index", 0)
            if h_idx > 0 and h_idx < len(df):
                df.columns = [str(val).strip().upper() for val in df.iloc[h_idx]]
                df = df.iloc[h_idx+1:].reset_index(drop=True)

            ai_cols = ai_bp.get("columns", {})
            sku_col = ai_cols.get("sku")
            barcode_col = ai_cols.get("barcode")
            col_desc = ai_cols.get("product_name")
            col_dept = ai_cols.get("dept")
            col_color = ai_cols.get("color")
            col_size = ai_cols.get("size")
            col_last_purchase = ai_cols.get("last_purchase_date")
            col_stok = ai_cols.get("stok_unit")
            col_eoh_retail = ai_cols.get("stok_retail")
            col_day_sales_unit = ai_cols.get("day_sales_unit")
            col_day_sales_retail = ai_cols.get("day_sales_retail")
            col_wtd_sales_unit = ai_cols.get("wtd_sales_unit")
            col_wtd_sales_retail = ai_cols.get("wtd_sales_retail")
            col_mtd_sales_unit = ai_cols.get("mtd_sales_unit")
            col_mtd_sales_retail = ai_cols.get("mtd_sales_retail")
            col_ytd_sales_unit = ai_cols.get("ytd_sales_unit")
            col_ytd_sales_retail = ai_cols.get("ytd_sales_retail")
            col_boy_unit = ai_cols.get("boy_unit")
            col_boy_retail = ai_cols.get("boy_retail")
            col_bom_unit = ai_cols.get("bom_unit")
            col_harga_normal = ai_cols.get("harga_normal")

        # Fallback Heuristik jika AI offline atau tidak menemukan SKU
        if not sku_col:
            for col in df.columns:
                if 'SKU' in col or 'KODE PRODUK' in col or 'ARTICLE' in col:
                    if not sku_col: sku_col = col
                if 'BARCODE' in col or 'EAN' in col:
                    barcode_col = col

        if not sku_col:
            for i in range(min(20, len(df))):
                row_vals = [str(val).strip().upper() for val in df.iloc[i]]
                if any('SKU' in val or 'BARCODE' in val or 'KODE' in val or 'ARTICLE' in val for val in row_vals):
                    df.columns = row_vals
                    df = df.iloc[i+1:].reset_index(drop=True)
                    for col in df.columns:
                        if ('SKU' in col or 'KODE' in col or 'ARTICLE' in col) and not sku_col:
                            sku_col = col
                        if ('BARCODE' in col or 'EAN' in col) and not barcode_col:
                            barcode_col = col
                    break

        if not sku_col and barcode_col:
            sku_col = barcode_col

        if not sku_col:
            print(f"   [SKIP] Melewati sheet '{sheet_name}' karena kolom SKU tidak ditemukan.")
            continue

        # Heuristic mapping jika ada kolom yang belum terisi
        for col in df.columns:
            if 'PARENT_NAME' in col and not col_parent: col_parent = col
            elif any(k in col for k in ['DESC', 'NAMA', 'ITEM', 'DESCRIPTION']) and not col_desc: col_desc = col
            elif any(k in col for k in ['NORMAL', 'RETAIL PRICE', 'HARGA']) and not col_harga_normal: col_harga_normal = col
            elif 'EOH' in col and 'UNIT' in col and not col_stok: col_stok = col
            elif 'EOH' in col and 'RETAIL' in col and not col_eoh_retail: col_eoh_retail = col
            elif ('STOK' in col or 'STOCK' in col) and not col_stok: col_stok = col
            elif 'MTD' in col and 'UNIT' in col and not col_sales_mtd: col_sales_mtd = col
            elif 'MTD' in col and 'RETAIL' in col and not col_sales_mtd_retail: col_sales_mtd_retail = col
            elif 'WTD' in col and 'UNIT' in col and not col_sales_wtd: col_sales_wtd = col
            elif 'WTD' in col and 'RETAIL' in col and not col_sales_wtd_retail: col_sales_wtd_retail = col
            elif 'YTD' in col and 'UNIT' in col and not col_sales_ytd: col_sales_ytd = col
            elif 'YTD' in col and 'RETAIL' in col and not col_sales_ytd_retail: col_sales_ytd_retail = col
            elif 'BOY' in col and 'UNIT' in col and not col_boy_unit: col_boy_unit = col
            elif 'BOY' in col and 'RETAIL' in col and not col_boy_retail: col_boy_retail = col
            elif 'BOM' in col and 'UNIT' in col and not col_bom_unit: col_bom_unit = col
            elif 'DAY' in col and 'SALES' in col and 'UNIT' in col and not col_day_sales_unit: col_day_sales_unit = col
            elif 'DAY' in col and 'SALES' in col and 'RETAIL' in col and not col_day_sales_retail: col_day_sales_retail = col
            elif ('LAST_PURCHASE' in col or 'TGL_BELI' in col) and not col_last_purchase: col_last_purchase = col
            elif 'COLOR' in col and not col_color: col_color = col
            elif 'SIZE' in col and not col_size: col_size = col
            elif 'DEPARTMENT' in col and not col_dept: col_dept = col

        # ─────────────────────────────────────────────────────────────
        #  GEMINI GUIDED PERFECT PIVOT TABLE ENGINE
        #  Mengonsolidasi puluhan ribu baris mentah menjadi Pivot Table
        #  1 SKU = 1 Baris unik teragregasi presisi (SUM sales & stok)
        # ─────────────────────────────────────────────────────────────
        # 1. Filter baris sampah (Grand Total, Values, Header duplikat, dll.)
        df[sku_col] = df[sku_col].astype(str).str.strip()
        sku_clean_series = df[sku_col].str.upper()
        valid_mask = (
            df[sku_col].notna() & 
            (df[sku_col] != '') & 
            (df[sku_col] != '0') &
            (df[sku_col] != 'NAN') &
            (~sku_clean_series.str.contains('TOTAL|GRAND|VALUES|DATA_AS_OF|SKU|KODE|HEADER|^-+$', regex=True))
        )
        df = df[valid_mask].copy()

        if df.empty:
            print(f"   [SKIP] Tidak ada baris SKU valid di sheet '{sheet_name}'.")
            continue

        # 2. Vektorisasi Pembersihan Kolom Numerik
        num_candidates = [
            col_stok, col_eoh_retail, col_sales_mtd, col_sales_mtd_retail,
            col_sales_wtd, col_sales_wtd_retail, col_sales_ytd, col_sales_ytd_retail,
            col_boy_unit, col_boy_retail, col_bom_unit, col_day_sales_unit,
            col_day_sales_retail, col_harga_normal
        ]
        active_num_cols = list(set([c for c in num_candidates if c and c in df.columns and c != sku_col]))

        for c in active_num_cols:
            is_flt = ('RETAIL' in c or 'OMZET' in c or 'HARGA' in c or 'PRICE' in c)
            df[c] = df[c].apply(lambda v: clean_number(v, is_float=is_flt))

        # 3. PIVOT & AGREGASI CERDAS (GroupBy SKU)
        # Kolom numerik di-SUM, kolom teks diambil nilai FIRST
        agg_rules = {c: 'sum' for c in active_num_cols}

        text_candidates = [col_desc, col_parent, barcode_col, col_color, col_size, col_dept, col_last_purchase]
        active_text_cols = list(set([c for c in text_candidates if c and c in df.columns and c != sku_col]))
        for c in active_text_cols:
            agg_rules[c] = 'first'

        pivot_df = df.groupby(sku_col, as_index=False).agg(agg_rules)
        print(f"📊 [PIVOT ENGINE]: Mengonsolidasi {len(df)} baris mentah menjadi {len(pivot_df)} produk SKU unik teragregasi presisi!")

        # 4. Bentuk payload hasil Pivot yang bersih
        for row in pivot_df.to_dict(orient='records'):
            sku = clean_sku(row.get(sku_col, ""))
            if not sku:
                continue

            # Penamaan Produk: Prioritaskan PARENT_NAME atau ITEM_DESCRIPTION
            desc_val = str(row.get(col_desc, "")).strip() if col_desc and pd.notna(row.get(col_desc)) else ""
            parent_val = str(row.get(col_parent, "")).strip() if col_parent and pd.notna(row.get(col_parent)) else ""
            final_desc = parent_val or desc_val or f"Produk {sku}"

            raw_barcode = clean_barcode(row.get(barcode_col)) if barcode_col else None
            if not raw_barcode and len(sku) >= 12 and sku.isdigit():
                raw_barcode = sku

            stok = clean_number(row.get(col_stok, 0)) if col_stok else 0
            eoh_retail = clean_number(row.get(col_eoh_retail, 0), is_float=True) if col_eoh_retail else 0.0

            sales_mtd = clean_number(row.get(col_sales_mtd, 0)) if col_sales_mtd else 0
            sales_mtd_retail = clean_number(row.get(col_sales_mtd_retail, 0), is_float=True) if col_sales_mtd_retail else 0.0

            sales_wtd = clean_number(row.get(col_sales_wtd, 0)) if col_sales_wtd else 0
            sales_wtd_retail = clean_number(row.get(col_sales_wtd_retail, 0), is_float=True) if col_sales_wtd_retail else 0.0

            sales_ytd = clean_number(row.get(col_sales_ytd, 0)) if col_sales_ytd else 0
            sales_ytd_retail = clean_number(row.get(col_sales_ytd_retail, 0), is_float=True) if col_sales_ytd_retail else 0.0

            boy_unit = clean_number(row.get(col_boy_unit, 0)) if col_boy_unit else 0
            boy_retail = clean_number(row.get(col_boy_retail, 0), is_float=True) if col_boy_retail else 0.0

            bom_unit = clean_number(row.get(col_bom_unit, 0)) if col_bom_unit else 0

            day_sales_unit = clean_number(row.get(col_day_sales_unit, 0)) if col_day_sales_unit else 0
            day_sales_retail = clean_number(row.get(col_day_sales_retail, 0), is_float=True) if col_day_sales_retail else 0.0

            # Formula Estimasi Harga Normal dari Pivot
            harga_normal = clean_number(row.get(col_harga_normal, 0)) if col_harga_normal else 0
            if harga_normal == 0:
                if stok > 0 and eoh_retail > 0:
                    harga_normal = int(eoh_retail / stok)
                elif bom_unit > 0 and boy_retail > 0:
                    harga_normal = int(boy_retail / bom_unit) if bom_unit else 0
                elif boy_unit > 0 and boy_retail > 0:
                    harga_normal = int(boy_retail / boy_unit)
                elif sales_mtd > 0 and sales_mtd_retail > 0:
                    harga_normal = int(sales_mtd_retail / sales_mtd)

            # Atribut varian
            row_dict = {}
            if col_color and pd.notna(row.get(col_color)):
                row_dict['COLOR'] = row.get(col_color)
            if col_size and pd.notna(row.get(col_size)):
                row_dict['SIZE'] = row.get(col_size)

            variants = extract_variants_and_article(final_desc, row_dict, brand_default=brand_from_file)
            dept_final = str(row.get(col_dept, "")).strip() if col_dept and pd.notna(row.get(col_dept)) else dept_from_file
            last_purch = parse_date_value(row.get(col_last_purchase)) if col_last_purchase else None

            combined_data.append({
                "sku": sku,
                "barcode": raw_barcode,
                "article": variants["article"],
                "brand": variants["brand"],
                "dept": dept_final if dept_final else dept_from_file,
                "color": variants["color"],
                "size": variants["size"],
                "last_purchase_date": last_purch,
                "description": variants["clean_desc"],
                "harga_normal": harga_normal,
                "stok": stok,
                "eoh_retail": eoh_retail,
                "sales_mtd": sales_mtd,
                "sales_mtd_retail": sales_mtd_retail,
                "sales_wtd": sales_wtd,
                "sales_wtd_retail": sales_wtd_retail,
                "sales_ytd": sales_ytd,
                "sales_ytd_retail": sales_ytd_retail,
                "boy_unit": boy_unit,
                "boy_retail": boy_retail,
                "bom_unit": bom_unit,
                "day_sales_unit": day_sales_unit,
                "day_sales_retail": day_sales_retail
            })

    print(f"[PARSER-PQ SELESAI] Sukses memproses {len(combined_data)} SKU.")
    return combined_data
