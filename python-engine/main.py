from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd
import os
import uvicorn
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from parser import parse_promo_file, parse_pq_file

load_dotenv()

SUPABASE_URL  = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
VERCEL_URL    = os.getenv("VERCEL_URL", "")          # contoh: https://max-display.vercel.app
SECRET_TOKEN  = os.getenv("WEBHOOK_SECRET", "B4mb4ng123!Aman")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Price Checker — Python Data Engine (Render.com)")

# ─────────────────────────────────────────────────────────────
#  Health check
# ─────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "Python Data Engine is running! 🚀"}

# ─────────────────────────────────────────────────────────────
#  ENDPOINT UTAMA — dipanggil oleh Google Apps Script
#  GAS upload file ke Supabase Storage, lalu kirim URL ke sini
#  Python: download dari Storage → parse Excel → upsert ke DB
#          → notif Vercel agar display data terbaru
# ─────────────────────────────────────────────────────────────
class ProcessFromStorageRequest(BaseModel):
    file_url:  str
    file_name: str
    folder:    str = "PQ"   # "PQ" atau "PROMO"

@app.post("/api/process-from-storage")
async def process_from_storage(req: ProcessFromStorageRequest, background_tasks: BackgroundTasks):
    """
    Dipanggil Google Apps Script setelah upload ke Supabase Storage.
    Tidak menerima file langsung — hanya URL file di Storage.
    """
    print(f"\n[ENGINE] Menerima request proses: {req.file_name} ({req.folder})")

    # Jalankan di background agar GAS tidak timeout menunggu
    background_tasks.add_task(
        _process_and_notify,
        file_url=req.file_url,
        file_name=req.file_name,
        folder=req.folder
    )

    return {"success": True, "message": f"Mulai memproses {req.file_name} di background..."}


async def _process_and_notify(file_url: str, file_name: str, folder: str):
    """Proses file dari Supabase Storage dan notify Vercel setelah selesai."""
    temp_path = f"temp_{file_name}"

    try:
        # 1. Download file dari Supabase Storage
        print(f"[ENGINE] Downloading dari Storage: {file_url}")
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(file_url)
            response.raise_for_status()

        with open(temp_path, "wb") as f:
            f.write(response.content)
        print(f"[ENGINE] File berhasil didownload ({len(response.content)} bytes)")

        # 2. Parse Excel dengan Pandas berdasarkan jalur (2 JALUR TERPISAH)
        if folder == "PQ":
            parsed_data = parse_pq_file(temp_path)
        else:
            parsed_data = parse_promo_file(temp_path)
            
        print(f"[ENGINE] Berhasil parse {len(parsed_data)} baris dari {file_name}")

        if not parsed_data:
            print("[ENGINE] Tidak ada data valid. Proses berhenti.")
            return

        # 3. Upsert ke Supabase DB
        if supabase:
            CHUNK_SIZE = 500
            total_upserted = 0
            
            for i in range(0, len(parsed_data), CHUNK_SIZE):
                chunk_data = parsed_data[i:i + CHUNK_SIZE]
                chunk_skus = [str(item["sku"]) for item in chunk_data]
                
                try:
                    existing_res = supabase.table("Product").select("*").in_("sku", chunk_skus).execute()
                    existing_map = {str(item["sku"]): item for item in existing_res.data}
                except Exception as ex:
                    print(f"[ENGINE] Error fetching existing data: {ex}")
                    existing_map = {}

                supabase_payload = []
                
                if folder == "PROMO":
                    # --- JALUR PROMO ---
                    for item in chunk_data:
                        sku_str = str(item["sku"])
                        ex = existing_map.get(sku_str, {})
                        
                        payload = {
                            "sku":               item["sku"],
                            "description":       item.get("description", "") or ex.get("description", f"Produk {item['sku']}"),
                            "hargaNormal":       item.get("harga_normal", 0) if item.get("harga_normal", 0) != 0 else ex.get("hargaNormal", 0),
                            "hargaNormalSource": "PROMO" if item.get("harga_normal", 0) != 0 else ex.get("hargaNormalSource", "PROMO"),
                            
                            # PROMO DATA (Overwrites)
                            "hargaPromo":        item["harga_promo"] if item.get("is_promo") else None,
                            "discountType":      item["tipe_diskon"] if item.get("is_promo") else None,
                            "fromDate":          item.get("tgl_mulai"),
                            "toDate":            item.get("tgl_akhir"),
                            "promoFileName":     file_name,
                            "dept":              item.get("dept", None) or ex.get("dept", None),
                            
                            # PROTEKSI STOK & SALES (JANGAN DIUBAH/DIBIKIN 0)
                            "stok":             ex.get("stok", 0),
                            "eoh_retail":       ex.get("eoh_retail", 0),
                            "sales_mtd":        ex.get("sales_mtd", 0),
                            "sales_mtd_retail": ex.get("sales_mtd_retail", 0),
                            "sales_wtd":        ex.get("sales_wtd", 0),
                            "sales_wtd_retail": ex.get("sales_wtd_retail", 0),
                            "sales_ytd":        ex.get("sales_ytd", 0),
                            "sales_ytd_retail": ex.get("sales_ytd_retail", 0),
                            "boy_unit":         ex.get("boy_unit", 0),
                            "boy_retail":       ex.get("boy_retail", 0),
                            "bom_unit":         ex.get("bom_unit", 0),
                            "day_sales_unit":   ex.get("day_sales_unit", 0),
                            "day_sales_retail": ex.get("day_sales_retail", 0),
                            
                            "updatedAt": datetime.now(timezone.utc).isoformat(),
                        }
                        supabase_payload.append(payload)
                        
                else:
                    # --- JALUR PQ ---
                    for item in chunk_data:
                        sku_str = str(item["sku"])
                        ex = existing_map.get(sku_str, {})
                        
                        # PQ tidak boleh menimpa harga PROMO, KECUALI jika harga promo di DB kosong (0)
                        new_harga = item.get("harga_normal", 0)
                        if ex.get("hargaNormalSource") == "PROMO" and ex.get("hargaNormal", 0) != 0:
                            final_harga = ex.get("hargaNormal", 0)
                            final_source = "PROMO"
                        else:
                            final_harga = new_harga if new_harga != 0 else ex.get("hargaNormal", 0)
                            final_source = "PQ" if new_harga != 0 else ex.get("hargaNormalSource", "PQ")
                            
                        payload = {
                            "sku":               item["sku"],
                            "description":       item.get("description", "") or ex.get("description", f"Produk {item['sku']}"),
                            "hargaNormal":       final_harga,
                            "hargaNormalSource": final_source,
                            
                            # PROTEKSI PROMO DATA (JANGAN DIUBAH/DIBIKIN NONE OLEH PQ)
                            "hargaPromo":        ex.get("hargaPromo"),
                            "discountType":      ex.get("discountType"),
                            "fromDate":          ex.get("fromDate"),
                            "toDate":            ex.get("toDate"),
                            "promoFileName":     ex.get("promoFileName"),
                            "dept":              ex.get("dept", None),
                            
                            # STOK & SALES (Overwrites)
                            "stok":             item.get("stok", 0),
                            "eoh_retail":       item.get("eoh_retail", 0),
                            "sales_mtd":        item.get("sales_mtd", 0),
                            "sales_mtd_retail": item.get("sales_mtd_retail", 0),
                            "sales_wtd":        item.get("sales_wtd", 0),
                            "sales_wtd_retail": item.get("sales_wtd_retail", 0),
                            "sales_ytd":        item.get("sales_ytd", 0),
                            "sales_ytd_retail": item.get("sales_ytd_retail", 0),
                            "boy_unit":         item.get("boy_unit", 0),
                            "boy_retail":       item.get("boy_retail", 0),
                            "bom_unit":         item.get("bom_unit", 0),
                            "day_sales_unit":   item.get("day_sales_unit", 0),
                            "day_sales_retail": item.get("day_sales_retail", 0),
                            
                            "updatedAt": datetime.now(timezone.utc).isoformat(),
                        }
                        supabase_payload.append(payload)

                try:
                    supabase.table("Product").upsert(supabase_payload, on_conflict="sku").execute()
                    total_upserted += len(supabase_payload)
                    print(f"[ENGINE] Upserted chunk {i // CHUNK_SIZE + 1}: {len(supabase_payload)} baris")
                except Exception as ex:
                    print(f"[ENGINE] Error upsert chunk: {ex}")

            print(f"[ENGINE] ✅ Selesai upsert {total_upserted} produk ke Supabase DB")

        # 4. Notifikasi Vercel — revalidate halaman agar tampilan update
        await _notify_vercel(folder)

    except Exception as e:
        print(f"[ENGINE] ❌ Error saat proses file: {e}")
    finally:
        # Bersihkan file temp
        if os.path.exists(temp_path):
            os.remove(temp_path)
            print(f"[ENGINE] File temp dihapus: {temp_path}")


async def _notify_vercel(folder: str):
    """
    Ping Vercel setelah data di DB diperbarui.
    Vercel tinggal ambil data fresh dari Supabase DB dan display.
    """
    if not VERCEL_URL:
        print("[ENGINE] VERCEL_URL tidak diset, skip notifikasi Vercel.")
        return

    try:
        notify_url = f"{VERCEL_URL}/api/revalidate"
        payload    = {
            "secret": SECRET_TOKEN,
            "type":   "UPDATE_PROMO" if folder == "PROMO" else "PQ_HARIAN",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(notify_url, json=payload)
        print(f"[ENGINE] Notif Vercel [{res.status_code}]: {res.text[:200]}")
    except Exception as e:
        print(f"[ENGINE] Gagal notif Vercel (tidak kritis, DB sudah update): {e}")


# ─────────────────────────────────────────────────────────────
#  ENDPOINT LAMA — terima file langsung via multipart (opsional)
# ─────────────────────────────────────────────────────────────
@app.post("/api/webhook/gmail")
async def gmail_webhook(
    file: UploadFile = File(...),
    token: str       = Form(...),
    folder: str      = Form("PQ"),
    fileName: str    = Form(None)
):
    if token != SECRET_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Only .xlsx and .csv allowed.")

    final_file_name = fileName or file.filename or "uploaded_file"
    print(f"[WEBHOOK] Menerima file langsung: {final_file_name}")

    try:
        temp_file_path = f"temp_{final_file_name}"
        with open(temp_file_path, "wb") as buffer:
            buffer.write(await file.read())

        parsed_data = []
        if final_file_name.endswith('.csv'):
            df = pd.read_csv(temp_file_path)
            print(f"[WEBHOOK] Membaca {len(df)} baris data CSV!")
        else:
            parsed_data = parse_excel_file(temp_file_path)

            if parsed_data and supabase:
                supabase_payload = [
                    {
                        "sku":               item["sku"],
                        "description":       item.get("description", f"Produk {item['sku']}"),
                        "hargaNormal":       item["harga_normal"],
                        "hargaNormalSource": "PROMO",
                        "hargaPromo":        item["harga_promo"] if item["is_promo"] else None,
                        "discountType":      item["tipe_diskon"] if item["is_promo"] else None,
                        "fromDate":          item["tgl_mulai"],
                        "toDate":            item["tgl_akhir"],
                        "promoFileName":     item["sumber_sheet"],
                        "updatedAt":         datetime.now(timezone.utc).isoformat()
                    }
                    for item in parsed_data
                ]

                CHUNK_SIZE = 1000
                for i in range(0, len(supabase_payload), CHUNK_SIZE):
                    chunk = supabase_payload[i:i + CHUNK_SIZE]
                    try:
                        supabase.table("Product").upsert(chunk, on_conflict="sku").execute()
                        print(f"[WEBHOOK] Upserted {len(chunk)} baris ke tabel Product")
                    except Exception as ex:
                        print(f"[WEBHOOK] Error saat upsert chunk: {ex}")

        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

        count_rows = len(df) if final_file_name.endswith('.csv') else len(parsed_data)
        return {
            "success": True,
            "message": f"Successfully processed {final_file_name} with {count_rows} rows.",
            "type": folder
        }

    except Exception as e:
        print(f"[WEBHOOK] Error processing file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
