# -*- coding: utf-8 -*-
"""
SUKO Product Knowledge Bible (100% Grounded pada 1.205 Artikel Riil Store SUKO PTC + Spek Resmi Matahari)
=========================================================================================================
Modul pengetahuan produk tingkat Senior Product Trainer / Veteran Ritel 20 Tahun Matahari & SUKO.
Digunakan oleh `wa_cs_engine.py` untuk:
1. Membekali AI Planner & Copywriter dengan pemahaman mendalam tentang lini produk, jenis pakaian,
   teknologi bahan asli SUKO, potongan/siluet, dan panduan perawatan.
2. Menghasilkan badge `🧵 Bahan & Teknologi:` secara deterministik & 100% akurat per produk (0% halusinasi!).
3. Menjawab pertanyaan edukatif pelanggan soal teknologi bahan & koleksi SUKO.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

# ─────────────────────────────────────────────────────────────────────────────
#  1. TAKSONOMI LENGKAP JENIS PAKAIAN & LINI SUKO (1.205 ARTIKEL RIIL)
# ─────────────────────────────────────────────────────────────────────────────

SUKO_LINES_OVERVIEW: Dict[str, Dict[str, Any]] = {
    "SUKO CASUAL": {
        "label": "SUKO Casual (Japanese-Inspired Minimalist Everyday Wear)",
        "focus": "Pakaian harian bergaya clean look, warna earth tone & netral, mudah di-mix & match.",
        "items": [
            "Kaos Oversized, Basic Crewneck, Pocket Tee, Heavy/Interlock, Ripstop Tee",
            "Kaos Premium: Supima Cotton, Soft Touch, Clima Tech, Waffle, Mini Rib, Henley, Turtleneck",
            "Kaos Polo: Polo Knit Rajut, Polo Pique Tipping, Polo Full Button",
            "Kemeja: Oxford Klasik, Fine Katun, Flannel, Linen Blend, Resort Seersucker (kerah tegak/koko & resort), Rayon",
            "Blouse Wanita: Satin Polkadot, Peplum, Rayon Motif, Linen Blend",
            "Celana: Chino (Stretch/Slim/Relax), Jeans (Straight/Slim/Wide Leg/Pleated/Cuffed), Twill, Corduroy, Linen Lipit, Bamboo Relax, Barrel/Balon, Cargo, Ankle Flannel, Kulot Nilon, Bermuda/Pendek",
            "Rok & Gaun: Midi Woven Skirt, Satin Midi, Rok Panjang Ultra Stretch, Rok Balon, Skort (Rok Celana), Jersey Knit Dress, Denim Midi Dress, Flare Dress",
            "Outerwear: Cardigan Souffle Yarn, Sweater Baby Terry, Sweatshirt Hoodie, Polar Fleece, Jaket Katun Twill (Pocketable), Jaket Denim, Bomber Varsity, Parka Reversible (2 sisi), Light Hoodie Parasut Taslan, Rompi/Vest Parasut & Denim",
        ],
    },
    "SUKO SPORTS (SUKO GO)": {
        "label": "SUKO Sports / SUKO GO (Activewear & Olahraga Urban)",
        "focus": "Dirancang untuk lari, jogging, gym, padel, tenis, badminton, yoga, & gaya hidup aktif tropis.",
        "items": [
            "Celana Olahraga: Active Pants 4-Way Stretch, Celana Panjang Nilon Parasut Sports, Celana Jogger Sports & Jogger Sweat, Celana Pendek Ultra Stretch, Legging Sports High Recovery (Panjang & Pendek)",
            "Atasan Olahraga: T-Shirt Sports Quick Dry (SS/LS/Sleeveless/Oversized), Kaos Polo Sports Quick Dry (SS/LS/Sleeveless), Crop Bra Sports High Recovery",
            "Rok & Gaun Olahraga: Rok Celana (Skort) Anti-Bakteri Quick Dry & Gaun Polo Sports (favorit padel, tenis, golf)",
            "Outer Olahraga: Jaket Parka Saku Windbreaker Sports (Pria & Wanita), Jaket Bomber Sports",
        ],
    },
    "SUKO WORKWEAR": {
        "label": "SUKO Workwear (Smart Casual Kantoran)",
        "focus": "Tampilan rapi tapi tetap santai & breathable untuk kerja di iklim tropis.",
        "items": ["Kemeja Oxford & Fine Katun", "Blouse Rapi Wanita", "Celana Chino Kerja & Ankle Pants", "Outer/Cardigan Rapi untuk ruangan AC"],
    },
    "SUKO ESSENTIAL, UNDERWEAR & SLEEPWEAR": {
        "label": "SUKO Essential, Innerwear & Sleepwear",
        "focus": "Kenyamanan dasar harian dari dalam hingga jam istirahat.",
        "items": [
            "Pakaian Dalam Boxer (Pinggang Reguler & Elastis), Inner Tank Top Anti-Bakteri",
            "Pajamas / Piyama Set Lengan Pendek & Loungewear",
            "Kaos Kaki (Reguler Bertekstur, Semata Kaki/Ankle Socks, Potongan Rendah/Low-Cut)",
        ],
    },
    "SUKO KIDS": {
        "label": "SUKO Kids (Boys & Girls)",
        "focus": "Versi nyaman & tahan aktif untuk anak-anak (T-Shirt Quick Dry, Chino Relax, Jogger Cargo, Jaket Denim, Gaun Flare, Rok Balon).",
        "items": ["SUKO Boys (atasan, quick dry, chino, jogger cargo, jaket)", "SUKO Girls (blouse, dress flare, rok balon, knit, celana santai)"],
    },
    "SUKO FOOTWEAR, BAGS, ACCS & HOME LIVING": {
        "label": "SUKO Footwear, Tas, Aksesori & Home Living",
        "focus": "Pelengkap gaya hidup minimalis harian.",
        "items": [
            "Alas Kaki Santai: Casual Sneakers (harian, bukan sepatu lari performa), Slip-On, Ballerina Flats, Mule Sandals, Slipper & Flip Flops",
            "Tas & Aksesori: Tote Bag, Sling Bag, Backpack, Topi/Cap, Belt/Sabuk, Aksesori Rambut",
            "Home Living & Toys: Handuk Sport Towel 360 GSM & Bath Towel 500 GSM Dobby, Thermal Tumbler Scandic Vacuum, Cushion/Placemat, Keychain & Plush",
        ],
    },
}

# ─────────────────────────────────────────────────────────────────────────────
#  2. ENSIKLOPEDIA TEKNOLOGI BAHAN & FABRIC DNA ASLI SUKO (DETEKSI PER ARTIKEL!)
# ─────────────────────────────────────────────────────────────────────────────

# Urutan prioritas: teknologi spesifik dulu, baru karakter kain!
FABRIC_TECH_RULES: List[Tuple[str, str, str]] = [
    # (regex_pattern, short_badge_title, concise_customer_benefit)
    (r"\b4[\-\s]?WAY\b|ACTIVE\s+PANTS\s+4", "4-Way Stretch (SUKO Sports)", "elastis meregang 4 arah, ringan & super bebas gerak"),
    (r"\bCLIMA\s*TECH\b|\bCLIMA\s*FLEX\b", "Clima Tech", "adaptif suhu tropis, breathable & fleksibel dipakai seharian"),
    (r"ANTI\s*BAKTERI.*QUICK|QUICK.*ANTI\s*BAKTERI", "Anti-Bakteri & Quick Dry", "cepat kering & bantu tahan bau keringat saat aktif/olahraga"),
    (r"\bQUICK\s*DRY\b", "Quick Dry", "menyerap & menguapkan keringat lebih cepat, anti-lengket"),
    (r"\bANTI\s*BAKTERI\b", "Anti-Bakteri (Odor-Control)", "bantu menjaga kesegaran & kurangi bau keringat seharian"),
    (r"\bHIGH\s*REC(?:OVERY)?\b", "High Recovery (SUKO Sports)", "elastis kencang & cepat balik ke bentuk semula, anti-melar"),
    (r"\bULTRA\s*STR(?:ETCH)?\b", "Ultra Stretch", "super elastis & nyaman mengikuti setiap gerakan tubuh"),
    (r"\bSUPIMA\b", "Supima Cotton (Katun Premium USA)", "serat panjang ekstra halus, adem, warna awet & minim berbulu"),
    (r"\bSOFT\s*TOU(?:CH)?\b", "Soft Touch", "tekstur super lembut di kulit, adem & nyaman buat harian"),
    (r"\bBAMBOO\b", "Relax Bamboo Blend", "serat bambu alami ekstra sejuk, breathable & lembut di kulit"),
    (r"\bSOUFFLE\b", "Souffle Yarn", "rajutan ringan, empuk seperti awan, hangat buat ruangan AC & tidak gatal"),
    (r"\bSEERSUCKER\b", "Seersucker", "kain bertekstur sejuk, tidak menempel ke kulit saat panas & minim setrika"),
    (r"\bREVERSIBLE\b", "Reversible (2-in-1)", "bisa dipakai bolak-balik dua gaya dalam satu jaket"),
    (r"\bPOCKETABLE\b", "Pocketable", "ringan & praktis dilipat kecil untuk dibawa traveling/motoran"),
    (r"\bWINDBREAKER\b", "Windbreaker (SUKO Sports)", "ringan, tahan angin & nyaman untuk outdoor/lari pagi/motoran"),
    (r"\bPARASUT\b|\bTASLAN\b", "Parasut / Taslan Ringan", "bobot sangat ringan, adem, cepat kering & praktis untuk outdoor"),
    (r"\bPOLAR\s*FLEECE\b|\bFLEECE\b", "Polar Fleece", "hangat, lembut & nyaman untuk udara dingin / ruangan ber-AC"),
    (r"\bINTERLOCK\b", "Cotton Interlock", "rajutan padat dua sisi, halus, jatuh rapi & tidak gampang menerawang"),
    (r"\bRIPSTOP\b", "Ripstop", "anyaman kotak kuat, tahan sobek & punya tekstur clean modern"),
    (r"\bPIQUE\b", "Cotton Pique", "rajutan berpori khas polo, sirkulasi udara bagus & tetap rapi"),
    (r"\bWAFFLE\b", "Waffle Knit", "tekstur wafel breathable, empuk & kasual minimalis"),
    (r"\bBABY\s*TERRY\b", "Baby Terry", "lembut di dalam, menyerap keringat & hangat pas untuk iklim Indonesia"),
    (r"\bOXFORD\b", "Classic Oxford", "katun tenun rapi & kokoh, andalan gaya smart-casual / kerja"),
    (r"\bFINE\s*KATUN\b", "Fine Cotton", "katun halus, ringan & adem dipakai kerja maupun santai"),
    (r"\bLINEN\b", "Linen Blend", "serat alami super breathable & sejuk untuk cuaca siang hari"),
    (r"\bCORDUROY\b", "Corduroy", "tekstur garis halus yang kokoh & berkarakter hangat"),
    (r"\bFLANNEL\b|\bFLANEL\b", "Flannel", "katun lembut bertekstur hangat, cocok dijadikan outer/layering"),
    (r"\bCHAMBRAY\b", "Chambray", "tampilan mirip denim tapi jauh lebih tipis, ringan & adem"),
    (r"\bRAYON\b", "Rayon Adem", "kain jatuh lembut (flowy) & langsung terasa sejuk di kulit"),
    (r"\bSATIN\b", "Satin Elegan", "permukaan halus berkilau lembut untuk kesan rapi / semi-formal"),
    (r"\bMINI\s*RIB\b|\bRIB\b", "Rib Knit Elastis", "rajutan bergaris lentur yang mengikuti bentuk tubuh dengan rapi"),
    (r"\bSTRETCH\b", "Stretch Nyaman", "lentur mengikuti gerak, nyaman dipakai duduk lama maupun aktif"),
    (r"\bNILON\b|\bNYLON\b", "Nilon Ringan", "ringan, cepat kering & praktis untuk aktivitas dinamis"),
    (r"\bCHINO\b|\bTWILL\b", "Katun Twill / Chino", "rapi, awet & fleksibel dipakai kerja hingga hangout"),
]


def detect_fabric_tech_badge(description: str, dept: str = "") -> str:
    """
    Mendeteksi keunggulan bahan/teknologi 100% AKURAT berdasarkan deskripsi & departemen riil produk.
    Tidak pernah mengarang teknologi yang tidak ada di nama/departemen artikel!
    """
    desc_up = str(description or "").upper()
    dept_up = str(dept or "").upper()
    for pattern, title, benefit in FABRIC_TECH_RULES:
        if re.search(pattern, desc_up):
            return f"*{title}* — {benefit}"
    if "SPORTS" in dept_up or "SPORT" in desc_up:
        return "*SUKO Sports (Activewear)* — ringan, breathable & nyaman untuk olahraga"
    if "WORKWEAR" in dept_up:
        return "*SUKO Workwear* — potongan rapi & breathable untuk aktivitas kantor"
    return ""


def get_compact_pk_prompt_block() -> str:
    """
    Blok pengetahuan ringkas padat (~220 kata) untuk disuntikkan ke AI Planner & Copywriter
    agar berbicara layaknya Senior Product Specialist SUKO / Matahari berpengalaman 20 tahun.
    """
    return (
        "PRODUCT KNOWLEDGE RESMI SUKO BY MATAHARI (WAJIB DIKUASAI ALA VETERAN RITEL 20 TAHUN):\n"
        "- Identitas Brand: SUKO (dari kata 'Suka', konsep Japanese-inspired minimalist everyday wear: clean look, warna earth tone, nyaman untuk iklim tropis Indonesia, 1.200+ artikel lintas Pria, Wanita, Anak, & Lifestyle).\n"
        "- Lini & Jenis Produk Riil di Store SUKO PTC:\n"
        "  1) SUKO Casual & Workwear: Kaos (Oversized, Supima, Soft Touch, Clima Tech, Waffle, Mini Rib, Interlock, Ripstop, Henley), Polo (Knit Rajut, Pique), Kemeja (Oxford, Fine Katun, Flannel, Linen Blend, Resort Seersucker kerah tegak/koko, Rayon), Blouse (Satin, Peplum), Celana (Chino Stretch/Slim/Relax, Jeans Straight/Slim/Wide/Pleated, Twill, Linen Lipit, Bamboo Relax, Corduroy, Barrel/Balon, Cargo, Ankle, Kulot Nilon), Rok & Dress (Midi Woven, Ultra Stretch, Satin, Skort), Outer (Cardigan Souffle Yarn, Sweater Baby Terry, Polar Fleece, Jaket Twill Pocketable, Parka Reversible, Light Hoodie Parasut Taslan, Jaket/Rompi Denim).\n"
        "  2) SUKO Sports / SUKO GO (Activewear): Active Pants 4-Way Stretch, Celana Nilon Parasut Sports, Jogger Sports/Sweat, Celana Pendek Ultra Stretch, Legging & Crop Bra High Recovery, Rok Celana Anti-Bakteri Quick Dry & Gaun Polo Sports (padel/tenis/golf), Kaos & Polo Quick Dry, Jaket Parka Windbreaker.\n"
        "  3) SUKO Kids (Boys & Girls), Essential/Underwear (Boxer, Inner Anti-Bakteri, Kaos Kaki), Sleepwear (Piyama), Footwear Santai (Casual Sneakers harian bukan sepatu lari performa, Slip-On, Ballerina, Mule, Flip Flops), Bags/Accs, & Home Living (Sport Towel 360GSM, Bath Towel 500GSM, Thermal Tumbler Scandic).\n"
        "- Teknologi Bahan Andalan SUKO: 4-Way Stretch & Ultra Stretch (bebas gerak), Quick Dry (cepat kering), Anti-Bakteri / Odor-Control (bebas bau), High Recovery (anti-melar), Clima Tech (adaptif tropis), Supima Cotton USA (ekstra halus & awet warna), Soft Touch, Bamboo Blend (ekstra sejuk), Souffle Yarn (rajut empuk ringan anti-gatal), Seersucker (adem minim setrika), Windbreaker / Parasut Taslan / Pocketable / Reversible.\n"
        "- Cara Bicara Veteran: Saat merekomendasikan produk, JELASKAN SINGKAT KENAPA bahan/teknologinya cocok untuk kebutuhan customer (misal celana sport -> sebutkan lini SUKO Sports & 4-Way Stretch/Parasut; kerja -> Oxford/Fine Katun; panas -> Linen/Seersucker/Quick Dry/Supima). Jangan pernah mengarang teknologi yang tidak dimiliki produk tersebut!"
    )


def build_product_knowledge_answer(message: str, sapaan: str = "Kak") -> str:
    """
    Jawaban edukatif mendalam (fallback deterministik berkualitas tinggi) saat customer bertanya
    secara umum tentang brand SUKO, daftar jenis produknya, atau teknologi bahannya.
    """
    low = str(message or "").lower()
    asks_tech = bool(re.search(r"\b(teknologi|bahan|supima|clima|quick\s*dry|4[\-\s]?way|souffle|bamboo|seersucker|anti\s*bakteri|keunggulan)\b", low))
    asks_types = bool(re.search(r"\b(jual\s+apa|produk(?:nya)?\s+apa\s+aja|jenis\s+pakaian|koleksi\s+apa\s+aja|lini|kategori)\b", low))

    if asks_tech and not asks_types:
        return (
            f"Dengan senang hati saya jelaskan {sapaan}! 😊 Sebagai private brand *minimalist everyday wear* dari Matahari, "
            f"*SUKO* punya beberapa teknologi & material andalan yang dirancang khusus untuk iklim tropis Indonesia:\n\n"
            f"1️⃣ *Lini SUKO Sports (SUKO GO):*\n"
            f"   • *4-Way Stretch & Ultra Stretch* — melar 4 arah, super fleksibel buat lari, gym, maupun duduk lama.\n"
            f"   • *Quick Dry & Anti-Bakteri* — cepat menguapkan keringat & bantu cegah bau (favorit untuk padel, tenis, jogging).\n"
            f"   • *High Recovery* — elastis kencang pada legging/sport bra, tidak gampang melar meski sering dicuci.\n"
            f"   • *Windbreaker & Parasut Taslan* — bobot super ringan & tahan angin.\n\n"
            f"2️⃣ *Lini SUKO Casual & Essentials:*\n"
            f"   • *Supima Cotton & Soft Touch* — katun serat panjang premium yang ekstra halus, adem & warna lebih awet.\n"
            f"   • *Clima Tech* — adaptif suhu tropis & breathable untuk dipakai seharian.\n"
            f"   • *Seersucker, Linen Blend & Bamboo* — serat super sejuk yang tidak menempel di kulit saat terik.\n"
            f"   • *Souffle Yarn, Waffle & Baby Terry* — rajut empuk ringan & tidak gatal, pas buat ruangan ber-AC.\n\n"
            f"Kakak lagi incar teknologi atau kebutuhan aktivitas yang mana nih (*harian adem, kerja, atau olahraga*)? Biar langsung saya carikan yang *ready* di Store SUKO PTC! ✨"
        )

    return (
        f"Dengan senang hati saya kenalkan koleksi lengkap *SUKO Official* {sapaan}! 😊 "
        f"*SUKO* mengusung konsep *Japanese-inspired minimalist everyday wear* (gaya clean, earth tone, nyaman untuk cuaca tropis) yang lengkap untuk seluruh keluarga:\n\n"
        f"👕 *1. Atasan Casual & Workwear:* Kaos Oversized, Supima Cotton, Soft Touch, Clima Tech, Waffle, Mini Rib, Polo Knit/Pique, Kemeja Oxford, Fine Katun, Flannel, Linen, Seersucker, & Blouse.\n"
        f"👖 *2. Bawahan / Celana:* Chino Stretch/Slim/Relax, Jeans (Straight/Slim/Wide/Pleated), Twill, Linen Lipit, Corduroy, Cargo, Barrel/Balon, Ankle, & Kulot.\n"
        f"🧥 *3. Outerwear & Jaket:* Cardigan Souffle Yarn, Sweater Baby Terry, Polar Fleece, Parka Windbreaker, Parka Reversible, Hoodie Parasut Taslan, & Jaket Denim.\n"
        f"👗 *4. Rok & Dress:* Midi Woven, Satin, Ultra Stretch, Skort (Rok Celana), & Knit/Denim Dress.\n"
        f"🏃 *5. SUKO Sports (Activewear):* Active Pants 4-Way Stretch, Celana Nilon Parasut, Jogger Sports, Legging High Recovery, Kaos/Polo Quick Dry, & Rok Celana Anti-Bakteri.\n"
        f"🧸 *6. Lini Lengkap Lainnya:* *SUKO Kids* (Boys & Girls), *Essential/Underwear & Sleepwear* (Boxer, Piyama, Kaos Kaki), *Footwear Santai* (Casual Sneakers, Slip-On, Sandals), *Tas/Aksesori*, hingga *Home Living* (Handuk 360–500 GSM & Thermal Tumbler).\n\n"
        f"Dari koleksi di atas, Kakak lagi pengen cari untuk *pria, wanita, atau anak-anak* dan untuk aktivitas apa nih? Biar saya pilihkan yang paling pas! 🙏"
    )
