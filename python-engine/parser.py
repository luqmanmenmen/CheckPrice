import pandas as pd
import re
from typing import Dict, List, Any

def parse_excel_file(file_path: str) -> List[Dict[str, Any]]:
    """
    Membaca semua sheet dalam file Excel dan merapikan datanya menjadi satu format baku
    yang siap diunggah ke Supabase.
    """
    print(f"\n[PARSER] Mulai menganalisis file: {file_path}")
    
    try:
        # Baca seluruh sheet menjadi dictionary { 'nama_sheet': DataFrame }
        all_sheets = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
    except Exception as e:
        print(f"[PARSER ERROR] Gagal membaca Excel: {e}")
        return []
    
    combined_data = []
    
    for sheet_name, df in all_sheets.items():
        print(f"-> Membedah sheet: '{sheet_name}' dengan {len(df)} baris")
        
        if df.empty:
            continue
            
        # 1. Bersihkan Nama Kolom (Hilangkan spasi, jadi huruf besar semua)
        df.columns = [str(col).strip().upper() for col in df.columns]
        
        # 2. Cari Kolom Utama (SKU)
        sku_col = None
        for col in df.columns:
            if 'SKU' in col or 'BARCODE' in col or 'KODE' in col or 'ARTICLE' in col:
                sku_col = col
                break
                
        if not sku_col:
            print(f"   [SKIP] Melewati sheet '{sheet_name}' karena tidak ditemukan kolom SKU.")
            continue
            
        # 3. Tentukan Tipe Promo & Harga Promo dari NAMA SHEET
        sheet_upper = str(sheet_name).upper()
        
        tipe_diskon = None
        harga_promo = 0
        is_promo = False
        
        # Deteksi BOGO (Beli x Gratis y)
        if "B1G1" in sheet_upper or "B2G1" in sheet_upper or "B3G1" in sheet_upper:
            match = re.search(r'(B\dG\d)', sheet_upper)
            if match:
                tipe_diskon = match.group(1) # B2G1, dll
                is_promo = True
            
        # Deteksi Special Price (SP) misal SP79, SP49
        elif "SP" in sheet_upper:
            match = re.search(r'SP(\d+)', sheet_upper)
            if match:
                angka = int(match.group(1))
                harga_promo = angka * 1000  # SP79 jadi 79000
                tipe_diskon = f"HARGA SPESIAL {harga_promo}"
                is_promo = True
                
        # Deteksi Diskon Persentase misal 50% atau DISC 50
        elif "%" in sheet_upper or "DISC" in sheet_upper:
            match = re.search(r'(\d+)\s*%', sheet_upper) or re.search(r'DISC\s*(\d+)', sheet_upper)
            if match:
                persen = match.group(1)
                tipe_diskon = f"{persen}%"
                is_promo = True
            
        # Deteksi Normal Price
        elif "NORMAL" in sheet_upper:
            is_promo = False
            
        else:
            # Fallback jika nama sheet acak
            pass

        # 4. Ekstrak Data Baris per Baris
        for index, row in df.iterrows():
            sku = str(row.get(sku_col, "")).strip()
            
            # Abaikan jika SKU kosong atau header tidak valid
            if not sku or sku.lower() == 'nan' or 'SKU' in sku.upper():
                continue
                
            # Coba ambil Harga Normal dari kolom yang relevan
            harga_normal = 0
            for col in df.columns:
                if 'NORMAL' in col or 'PRICE' in col or 'HARGA' in col:
                    try:
                        val = row[col]
                        if pd.notna(val):
                            harga_normal = int(float(val))
                            break
                    except:
                        pass
                        
            # Ambil Tanggal Mulai dan Berakhir (Dari kolom FROM DATE / TO DATE)
            tgl_mulai = None
            tgl_akhir = None
            
            for col in df.columns:
                if 'FROM' in col or 'MULAI' in col or 'START' in col:
                    val = row[col]
                    if pd.notna(val):
                        tgl_mulai = str(val)[:10]  # Format jadi YYYY-MM-DD
                elif 'TO DATE' in col or 'AKHIR' in col or 'END' in col:
                    val = row[col]
                    if pd.notna(val):
                        tgl_akhir = str(val)[:10]

            # Ambil Description (Nama Barang)
            description = ""
            for col in df.columns:
                col_upper_check = str(col).upper()
                if 'DESC' in col_upper_check or 'NAMA' in col_upper_check or 'ARTICLE' in col_upper_check or 'ITEM' in col_upper_check:
                    val = row[col]
                    if pd.notna(val):
                        description = str(val).strip()
                        break
            
            if not description:
                description = f"Produk {sku}"

            # --- AMBIL DATA STOK & SALES (KHUSUS UNTUK FILE PQ) ---
            stok = 0
            eoh_retail = 0
            sales_mtd = 0
            sales_mtd_retail = 0
            sales_wtd = 0
            sales_wtd_retail = 0
            sales_ytd = 0
            sales_ytd_retail = 0
            boy_unit = 0
            boy_retail = 0
            bom_unit = 0
            day_sales_unit = 0
            day_sales_retail = 0

            # Bantu membersihkan angka dari koma atau teks
            def clean_number(val, is_float=False):
                if pd.isna(val):
                    return 0.0 if is_float else 0
                try:
                    num_str = str(val).replace(',', '').strip()
                    if is_float:
                        return float(num_str)
                    return int(float(num_str))
                except:
                    return 0.0 if is_float else 0

            for col in df.columns:
                col_upper = str(col).upper()
                
                # EOH (Stok)
                if 'EOH' in col_upper and 'UNIT' in col_upper:
                    stok = clean_number(row[col])
                elif 'EOH' in col_upper and 'RETAIL' in col_upper:
                    eoh_retail = clean_number(row[col], True)
                elif 'STOK' in col_upper or 'STOCK' in col_upper:
                    # Fallback jika tidak ada 'EOH UNIT' tapi ada 'STOK'
                    if stok == 0:
                        stok = clean_number(row[col])
                
                # MTD (Month to Date)
                elif 'MTD' in col_upper and 'UNIT' in col_upper:
                    sales_mtd = clean_number(row[col])
                elif 'MTD' in col_upper and 'RETAIL' in col_upper:
                    sales_mtd_retail = clean_number(row[col], True)
                    
                # WTD (Week to Date)
                elif 'WTD' in col_upper and 'UNIT' in col_upper:
                    sales_wtd = clean_number(row[col])
                elif 'WTD' in col_upper and 'RETAIL' in col_upper:
                    sales_wtd_retail = clean_number(row[col], True)
                    
                # YTD (Year to Date)
                elif 'YTD' in col_upper and 'UNIT' in col_upper:
                    sales_ytd = clean_number(row[col])
                elif 'YTD' in col_upper and 'RETAIL' in col_upper:
                    sales_ytd_retail = clean_number(row[col], True)
                    
                # BOY (Beginning of Year)
                elif 'BOY' in col_upper and 'UNIT' in col_upper:
                    boy_unit = clean_number(row[col])
                elif 'BOY' in col_upper and 'RETAIL' in col_upper:
                    boy_retail = clean_number(row[col], True)
                    
                # BOM (Beginning of Month)
                elif 'BOM' in col_upper and 'UNIT' in col_upper:
                    bom_unit = clean_number(row[col])
                    
                # DAY SALES (Sales harian)
                elif 'DAY' in col_upper and 'SALES' in col_upper and 'UNIT' in col_upper:
                    day_sales_unit = clean_number(row[col])
                elif 'DAY' in col_upper and 'SALES' in col_upper and 'RETAIL' in col_upper:
                    day_sales_retail = clean_number(row[col], True)

            item_data = {
                "sku": sku,
                "description": description,
                "harga_normal": harga_normal,
                "is_promo": is_promo,
                "tipe_diskon": tipe_diskon,
                "harga_promo": harga_promo,
                "tgl_mulai": tgl_mulai,
                "tgl_akhir": tgl_akhir,
                "sumber_sheet": sheet_name,
                
                # Data Stok & Sales
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
            }
            
            combined_data.append(item_data)
            
    print(f"\n[PARSER SELESAI] Berhasil mengekstrak {len(combined_data)} SKU valid dari seluruh sheet.")
    return combined_data

if __name__ == "__main__":
    print("Mesin Parser siap!")
