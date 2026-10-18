"""
Audit & Image Quality Engine for Price Checker
Mendeteksi ketidakcocokan antara SKU produk dan foto yang tersemat di database.
"""

import os
import re
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

def get_supabase_client() -> Optional[Client]:
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            return create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as e:
            print(f"[AUDIT] Gagal membuat client Supabase: {e}")
    return None

def analyze_sku_images(limit: int = 10000) -> Dict[str, Any]:
    """
    Analisis seluruh gambar produk:
    1. EXACT_MATCH: Foto memiliki kode SKU asli di nama file gambar (contoh: 13472861-1_...jpg untuk SKU 13472861)
    2. MISMATCHED_MODEL: Foto berasal dari SKU lain (contoh: SKU 68155753 tapi fotonya 69003647-1_...jpg)
    3. NO_IMAGE: Produk belum memiliki foto.
    """
    client = get_supabase_client()
    if not client:
        return {"error": "Supabase client tidak tersedia"}

    # Ambil produk yang memiliki imageUrl
    response = client.table("Product").select("sku, description, article, dept, brand, color, size, imageUrl, images").not_.is_("imageUrl", "null").limit(limit).execute()
    records = response.data or []

    exact_matches: List[Dict[str, Any]] = []
    mismatched_bags: List[Dict[str, Any]] = []
    mismatched_accessories: List[Dict[str, Any]] = []
    mismatched_apparel: List[Dict[str, Any]] = []

    for p in records:
        sku = str(p.get("sku", "")).strip()
        img_url = p.get("imageUrl") or ""
        fn = img_url.split("?")[0].split("/")[-1]

        desc = str(p.get("description", "")).upper()
        dept = str(p.get("dept", "")).upper()

        # Cek apakah nama file foto mengandung SKU produk ini
        if sku and sku in fn:
            exact_matches.append({
                "sku": sku,
                "desc": p.get("description"),
                "imageUrl": img_url
            })
        else:
            # Cari nomor SKU pemilik foto sebenarnya
            match = re.search(r'(\d{6,10})', fn)
            borrowed_from_sku = match.group(1) if match else "UNKNOWN"

            item_info = {
                "sku": sku,
                "desc": p.get("description"),
                "dept": p.get("dept"),
                "color": p.get("color"),
                "currentImageUrl": img_url,
                "imageBelongsToSku": borrowed_from_sku,
                "reason": f"Model foto berasal dari SKU {borrowed_from_sku}, bukan model asli SKU {sku}"
            }

            is_bag = (
                any(k in dept for k in ["BAG", "HANDBAG"]) or
                any(k in desc for k in ["BACKPACK", "TOTEBAG", "CROSS BODY", "SHOULDER BAG", "SLING BAG", "TAS WANITA", "TAS PRIA"])
            ) and ("BAGGY" not in desc) and ("TASLAN" not in desc) and ("SLINGBACK" not in desc)

            is_acc = (
                dept in ["ACCESSORIES", "SUKO ACCS", "SUKO ACC", "BELT", "SUNGLASSES", "HAIR ACC"] or
                any(k in desc for k in ["KACAMATA", "SUNGLASS", "DOMPET", "WALLET", "KEY CHAIN", "KEYCHAIN", "HAIRPIN", "HAIRBAND", "HAIR BAND", "HAIR CLIPS"])
            ) and ("BELTED" not in desc or dept in ["BELT", "ACCESSORIES", "SUKO ACCS"])

            if is_bag:
                mismatched_bags.append(item_info)
            elif is_acc:
                mismatched_accessories.append(item_info)
            else:
                mismatched_apparel.append(item_info)

    return {
        "totalWithImages": len(records),
        "exactMatchCount": len(exact_matches),
        "totalMismatched": len(mismatched_bags) + len(mismatched_accessories) + len(mismatched_apparel),
        "mismatchedBagsCount": len(mismatched_bags),
        "mismatchedAccessoriesCount": len(mismatched_accessories),
        "mismatchedApparelCount": len(mismatched_apparel),
        "samples": {
            "bags": mismatched_bags[:10],
            "accessories": mismatched_accessories[:10],
            "apparel": mismatched_apparel[:5]
        }
    }

def clean_mismatched_images(category: str = "BAGS_AND_ACCESSORIES") -> Dict[str, Any]:
    """
    Membersihkan foto-foto yang tidak sesuai model aslinya agar aplikasi tidak menampilkan
    model tas/aksesoris yang salah kepada pelanggan.
    category options:
      - 'BAGS_AND_ACCESSORIES': Hanya bersihkan Tas, Dompet, Kacamata, Aksesoris
      - 'ALL_MISMATCHED': Bersihkan seluruh 5.400+ foto pinjaman dan pertahankan hanya foto SKU asli
    """
    client = get_supabase_client()
    if not client:
        return {"error": "Supabase client tidak tersedia"}

    analysis = analyze_sku_images()
    target_skus = []

    if category == "BAGS_AND_ACCESSORIES":
        response = client.table("Product").select("sku, description, dept, imageUrl").not_.is_("imageUrl", "null").limit(10000).execute()
        for p in response.data or []:
            sku = str(p.get("sku", "")).strip()
            fn = (p.get("imageUrl") or "").split("?")[0].split("/")[-1]
            if sku not in fn:
                desc = str(p.get("description", "")).upper()
                dept = str(p.get("dept", "")).upper()

                is_bag = (
                    any(k in dept for k in ["BAG", "HANDBAG"]) or
                    any(k in desc for k in ["BACKPACK", "TOTEBAG", "CROSS BODY", "SHOULDER BAG", "SLING BAG", "TAS WANITA", "TAS PRIA"])
                ) and ("BAGGY" not in desc) and ("TASLAN" not in desc) and ("SLINGBACK" not in desc)

                is_acc = (
                    dept in ["ACCESSORIES", "SUKO ACCS", "SUKO ACC", "BELT", "SUNGLASSES", "HAIR ACC"] or
                    any(k in desc for k in ["KACAMATA", "SUNGLASS", "DOMPET", "WALLET", "KEY CHAIN", "KEYCHAIN", "HAIRPIN", "HAIRBAND", "HAIR BAND", "HAIR CLIPS"])
                ) and ("BELTED" not in desc or dept in ["BELT", "ACCESSORIES", "SUKO ACCS"])

                if is_bag or is_acc:
                    target_skus.append(sku)
    elif category == "ALL_MISMATCHED":
        response = client.table("Product").select("sku, imageUrl").not_.is_("imageUrl", "null").limit(10000).execute()
        for p in response.data or []:
            sku = str(p.get("sku", "")).strip()
            fn = (p.get("imageUrl") or "").split("?")[0].split("/")[-1]
            if sku not in fn:
                target_skus.append(sku)

    target_skus = list(set(target_skus))
    cleaned_count = 0

    # Reset imageUrl dan images ke null/empty array
    for i in range(0, len(target_skus), 100):
        batch = target_skus[i:i+100]
        try:
            client.table("Product").update({
                "imageUrl": None,
                "images": []
            }).in_("sku", batch).execute()
            cleaned_count += len(batch)
        except Exception as e:
            print(f"[AUDIT] Gagal membersihkan batch: {e}")

    return {
        "success": True,
        "category": category,
        "totalCleaned": cleaned_count,
        "cleanedSkus": target_skus[:20]
    }

if __name__ == "__main__":
    result = analyze_sku_images()
    print("=== HASIL AUDIT GAMBAR PYTHON ENGINE ===")
    print(f"Total Produk Bergambar: {result['totalWithImages']}")
    print(f"Foto Asli Sesuai SKU: {result['exactMatchCount']}")
    print(f"Foto Model Pinjaman / Salah: {result['totalMismatched']}")
    print(f"  - Tas / Bag Salah Model: {result['mismatchedBagsCount']}")
    print(f"  - Aksesoris Salah Model: {result['mismatchedAccessoriesCount']}")
    print(f"  - Pakaian Salah Model: {result['mismatchedApparelCount']}")
