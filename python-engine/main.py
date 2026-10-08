from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
import os
import uvicorn
from dotenv import load_dotenv

# Load environment variables (contoh: SUPABASE_URL, SUPABASE_KEY)
load_dotenv()

app = FastAPI(title="Price Checker Data Engine")

SECRET_TOKEN = os.getenv("WEBHOOK_SECRET", "B4mb4ng123!Aman")

@app.get("/")
def read_root():
    return {"message": "Python Data Engine is running! 🚀"}

@app.post("/api/webhook/gmail")
async def gmail_webhook(
    file: UploadFile = File(...),
    token: str = Form(...),
    folder: str = Form("PQ"),
    fileName: str = Form(None)
):
    # 1. Validasi Token Keamanan dari Google Apps Script
    if token != SECRET_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Only .xlsx and .csv allowed.")

    final_file_name = fileName or file.filename or "uploaded_file"
    print(f"Menerima file: {final_file_name} untuk diproses sebagai {folder}")
    
    try:
        # 2. Simpan file sementara di memori/disk lokal untuk dibaca Pandas
        temp_file_path = f"temp_{final_file_name}"
        with open(temp_file_path, "wb") as buffer:
            buffer.write(await file.read())

        # 3. KUNYAH DATA DENGAN PANDAS
        # Deteksi format file
        if final_file_name.endswith('.csv'):
            df = pd.read_csv(temp_file_path)
        else:
            df = pd.read_excel(temp_file_path)
            
        print(f"Berhasil membaca {len(df)} baris data!")
        print(df.head(3)) # Print 3 baris pertama untuk debugging
        
        # TODO: Logika pembersihan (cleaning) data dan pengiriman ke Supabase 
        # akan kita bangun di langkah selanjutnya.

        # 4. Hapus file sementara agar server tidak kepenuhan
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

        return {
            "success": True, 
            "message": f"Successfully processed {final_file_name} with {len(df)} rows.",
            "type": folder
        }
        
    except Exception as e:
        print(f"Error processing file: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
