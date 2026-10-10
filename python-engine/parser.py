import pandas as pd
import re
from typing import Dict, List, Any

def parse_promo_file(file_path: str) -> List[Dict[str, Any]]:
    """
    JALUR 1: KHUSUS MEMBACA FILE PROMO
    Mengekstrak tipe diskon, tanggal, SKU, harga normal, harga promo.
    TIDAK membaca stok atau metrics penjualan.
    """
    print(f"\n[PARSER-PROMO] Mulai menganalisis file: {file_path}")
    
    try:
        all_sheets = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
    except Exception as e:
        print(f"[PARSER-PROMO ERROR] Gagal membaca file: {e}")
        return []
    
    combined_data = []
    file_name_upper = str(file_path).upper()
    
    # Ekstrak Nama Departemen dari NAMA FILE
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
            dept_name = parts[1].strip()
            
    for sheet_name, df in all_sheets.items():
        print(f"-> Membedah sheet PROMO: '{sheet_name}' dengan {len(df)} baris")
        if df.empty: continue
            
        df.columns = [str(col).strip().upper() for col in df.columns]
        
        sku_col = None
        for col in df.columns:
            if 'SKU' in col or 'BARCODE' in col or 'KODE' in col or 'ARTICLE' in col:
                sku_col = col; break
                
        if not sku_col:
            for i in range(min(15, len(df))):
                row_vals = [str(val).strip().upper() for val in df.iloc[i]]
                if any('SKU' in val or 'BARCODE' in val or 'KODE' in val or 'ARTICLE' in val for val in row_vals):
                    df.columns = row_vals
                    df = df.iloc[i+1:].reset_index(drop=True)
                    for col in df.columns:
                        if 'SKU' in col or 'BARCODE' in col or 'KODE' in col or 'ARTICLE' in col:
                            sku_col = col; break
                    break
                    
        if not sku_col:
            print(f"   [SKIP] Melewati sheet '{sheet_name}' karena tidak ada kolom SKU.")
            continue
            
        sheet_upper = str(sheet_name).upper()
        tipe_diskon = None
        harga_promo = 0
        is_promo = False
        
        if "B1G1" in sheet_upper or "B2G1" in sheet_upper or "B3G1" in sheet_upper:
            match = re.search(r'B(\d+)G(\d+)', sheet_upper)
            if match:
                tipe_diskon = f"BELI {match.group(1)} GRATIS {match.group(2)}"
                is_promo = True
        elif "B1D" in sheet_upper or "B2D" in sheet_upper:
            match = re.search(r'B(\d+)D(\d+)', sheet_upper)
            if match:
                tipe_diskon = f"BELI {match.group(1)} DISKON {match.group(2)}%"
                is_promo = True
        elif "SP" in sheet_upper:
            match = re.search(r'SP(\d+)', sheet_upper)
            if match:
                harga_promo = int(match.group(1)) * 1000
                tipe_diskon = f"HARGA SPESIAL {harga_promo}"
                is_promo = True
        elif "%" in sheet_upper or "DISC" in sheet_upper:
            match = re.search(r'(\d+)\s*%', sheet_upper) or re.search(r'DISC\s*(\d+)', sheet_upper)
            if match:
                tipe_diskon = f"DISKON {match.group(1)}%"
                is_promo = True
        elif "NORMAL" in sheet_upper:
            is_promo = False
            
        for index, row in df.iterrows():
            sku = str(row.get(sku_col, "")).strip()
            if not sku or sku.lower() == 'nan' or 'SKU' in sku.upper(): continue
                
            harga_normal = 0
            for col in df.columns:
                if 'NORMAL' in col or 'PRICE' in col or 'HARGA' in col:
                    try:
                        val = row[col]
                        if pd.notna(val):
                            harga_normal = int(float(val)); break
                    except: pass
                        
            tgl_mulai = None
            tgl_akhir = None
            for col in df.columns:
                if 'FROM' in col or 'MULAI' in col or 'START' in col:
                    val = row[col]
                    if pd.notna(val): tgl_mulai = str(val)[:10]
                elif 'TO DATE' in col or 'AKHIR' in col or 'END' in col:
                    val = row[col]
                    if pd.notna(val): tgl_akhir = str(val)[:10]

            description = ""
            for col in df.columns:
                col_upper_check = str(col).upper()
                if 'DESC' in col_upper_check or 'NAMA' in col_upper_check or 'ITEM' in col_upper_check:
                    val = row[col]
                    if pd.notna(val): description = str(val).strip(); break
            if not description:
                for col in df.columns:
                    col_upper_check = str(col).upper()
                    if 'ARTICLE' in col_upper_check:
                        val = row[col]
                        if pd.notna(val): description = str(val).strip(); break
            if not description:
                description = f"Produk {sku}"

            combined_data.append({
                "sku": sku,
                "description": description,
                "harga_normal": harga_normal,
                "is_promo": is_promo,
                "tipe_diskon": tipe_diskon,
                "harga_promo": harga_promo,
                "tgl_mulai": tgl_mulai,
                "tgl_akhir": tgl_akhir,
                "sumber_sheet": sheet_name,
                "dept": dept_name
            })
            
    print(f"\n[PARSER-PROMO SELESAI] Ekstrak {len(combined_data)} SKU.")
    return combined_data

def parse_pq_file(file_path: str) -> List[Dict[str, Any]]:
    """
    JALUR 2: KHUSUS MEMBACA FILE PQ (POWER QUERY)
    Mengekstrak stok, metrics penjualan (MTD, WTD, YTD, dll), dan mencoba menebak
    Harga Normal dari EOH Retail / Stok jika memungkinkan.
    TIDAK MENGANDUNG LOGIKA PROMO SAMA SEKALI.
    """
    print(f"\n[PARSER-PQ] Mulai menganalisis file PQ: {file_path}")
    
    try:
        if file_path.lower().endswith('.csv'):
            try:
                df = pd.read_csv(file_path, on_bad_lines='skip', encoding='utf-8', low_memory=False)
                if len(df.columns) <= 1:
                    df = pd.read_csv(file_path, sep=';', on_bad_lines='skip', encoding='utf-8', low_memory=False)
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, sep=None, engine='python', on_bad_lines='skip', encoding='latin1')
            all_sheets = {'CSV_DATA': df}
        else:
            all_sheets = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
    except Exception as e:
        print(f"[PARSER-PQ ERROR] Gagal membaca file: {e}")
        return []
    
    combined_data = []
    
    for sheet_name, df in all_sheets.items():
        print(f"-> Membedah sheet PQ: '{sheet_name}' dengan {len(df)} baris")
        if df.empty: continue
            
        df.columns = [str(col).strip().upper() for col in df.columns]
        
        sku_col = None
        for col in df.columns:
            if 'SKU' in col or 'BARCODE' in col or 'KODE' in col or 'ARTICLE' in col:
                sku_col = col; break
                
        if not sku_col:
            for i in range(min(15, len(df))):
                row_vals = [str(val).strip().upper() for val in df.iloc[i]]
                if any('SKU' in val or 'BARCODE' in val or 'KODE' in val or 'ARTICLE' in val for val in row_vals):
                    df.columns = row_vals
                    df = df.iloc[i+1:].reset_index(drop=True)
                    for col in df.columns:
                        if 'SKU' in col or 'BARCODE' in col or 'KODE' in col or 'ARTICLE' in col:
                            sku_col = col; break
                    break
                    
        if not sku_col:
            print(f"   [SKIP] Melewati sheet '{sheet_name}' karena tidak ada kolom SKU.")
            continue
            
        for index, row in df.iterrows():
            sku = str(row.get(sku_col, "")).strip()
            if not sku or sku.lower() == 'nan' or 'SKU' in sku.upper(): continue

            description = ""
            for col in df.columns:
                col_upper_check = str(col).upper()
                if 'DESC' in col_upper_check or 'NAMA' in col_upper_check or 'ITEM' in col_upper_check:
                    val = row[col]
                    if pd.notna(val): description = str(val).strip(); break
            if not description:
                for col in df.columns:
                    col_upper_check = str(col).upper()
                    if 'ARTICLE' in col_upper_check:
                        val = row[col]
                        if pd.notna(val): description = str(val).strip(); break
            if not description: description = f"Produk {sku}"

            def clean_number(val, is_float=False):
                if pd.isna(val): return 0.0 if is_float else 0
                try:
                    num_str = str(val).replace(',', '').strip()
                    if num_str.lower() in ['nan', 'null', 'none', '']: return 0.0 if is_float else 0
                    res = float(num_str)
                    if pd.isna(res): return 0.0 if is_float else 0
                    return float(res) if is_float else int(res)
                except: return 0.0 if is_float else 0

            stok, eoh_retail, sales_mtd, sales_mtd_retail = 0, 0, 0, 0
            sales_wtd, sales_wtd_retail, sales_ytd, sales_ytd_retail = 0, 0, 0, 0
            boy_unit, boy_retail, bom_unit, bom_retail = 0, 0, 0, 0
            day_sales_unit, day_sales_retail = 0, 0
            harga_normal = 0
            
            for col in df.columns:
                col_upper = str(col).upper()
                if 'NORMAL' in col_upper or 'PRICE' in col_upper or 'HARGA' in col_upper:
                    try:
                        val = row[col]
                        if pd.notna(val): harga_normal = int(float(val))
                    except: pass
                elif 'EOH' in col_upper and 'UNIT' in col_upper: stok = clean_number(row[col])
                elif 'EOH' in col_upper and 'RETAIL' in col_upper: eoh_retail = clean_number(row[col], True)
                elif 'STOK' in col_upper or 'STOCK' in col_upper:
                    if stok == 0: stok = clean_number(row[col])
                elif 'MTD' in col_upper and 'UNIT' in col_upper: sales_mtd = clean_number(row[col])
                elif 'MTD' in col_upper and 'RETAIL' in col_upper: sales_mtd_retail = clean_number(row[col], True)
                elif 'WTD' in col_upper and 'UNIT' in col_upper: sales_wtd = clean_number(row[col])
                elif 'WTD' in col_upper and 'RETAIL' in col_upper: sales_wtd_retail = clean_number(row[col], True)
                elif 'YTD' in col_upper and 'UNIT' in col_upper: sales_ytd = clean_number(row[col])
                elif 'YTD' in col_upper and 'RETAIL' in col_upper: sales_ytd_retail = clean_number(row[col], True)
                elif 'BOY' in col_upper and 'UNIT' in col_upper: boy_unit = clean_number(row[col])
                elif 'BOY' in col_upper and 'RETAIL' in col_upper: boy_retail = clean_number(row[col], True)
                elif 'BOM' in col_upper and 'UNIT' in col_upper: bom_unit = clean_number(row[col])
                elif 'BOM' in col_upper and 'RETAIL' in col_upper: bom_retail = clean_number(row[col], True)
                elif 'DAY' in col_upper and 'SALES' in col_upper and 'UNIT' in col_upper: day_sales_unit = clean_number(row[col])
                elif 'DAY' in col_upper and 'SALES' in col_upper and 'RETAIL' in col_upper: day_sales_retail = clean_number(row[col], True)

            if harga_normal == 0:
                if stok > 0 and eoh_retail > 0: harga_normal = int(eoh_retail / stok)
                elif bom_unit > 0 and bom_retail > 0: harga_normal = int(bom_retail / bom_unit)
                elif boy_unit > 0 and boy_retail > 0: harga_normal = int(boy_retail / boy_unit)
                elif sales_mtd > 0 and sales_mtd_retail > 0: harga_normal = int(sales_mtd_retail / sales_mtd)

            combined_data.append({
                "sku": sku,
                "description": description,
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
            
    print(f"\n[PARSER-PQ SELESAI] Ekstrak {len(combined_data)} SKU.")
    return combined_data
