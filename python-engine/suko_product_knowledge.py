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
        "label": "SUKO Workwear (Smart Casual Kantoran — 16/16 Ready)",
        "focus": "Tampilan rapi tapi tetap santai & breathable untuk kerja di iklim tropis.",
        "items": [
            "Jaket Comfort 2 Kancing (Blazer/Jas smart-casual)",
            "Kemeja Oxford Klasik & Oxford Stripe, Kemeja Fine Katun Extra Broadcloth & Print, Kemeja Polo Full Button",
            "Celana Panjang Chinos Kerja / Slim Fit / Stretch Chinos, Celana Ankle Smart & Relax Smart Pants",
        ],
    },
    "SUKO ESSENTIAL, UNDERWEAR & SLEEPWEAR": {
        "label": "SUKO Essential, Underwear, Sleepwear & Kaos Kaki",
        "focus": "Kenyamanan dasar harian dari dalam hingga jam istirahat.",
        "items": [
            "SUKO Sleepwear (22 artikel Ready): Pajamas / Piyama Set Lengan Pendek & Panjang (Polos, Motif, lisensi resmi Sanrio, Disney, Simpsons), Celana Tidur Flannel & Rib Rajut, T-Shirt Set Disney",
            "SUKO Underwear & Innerwear Wanita: Inner Hijab Ciput, Inner Tank Top Kamisol, Inner T-Shirt Anti-Bakteri / Turtleneck",
            "SUKO Essential Pria: Celana Dalam Boxer (Pinggang Reguler, Elastis, & Tenun Woven Solid), Brief Reguler, Inner T-Shirt",
            "Kaos Kaki SUKO Essential: Reguler Bertekstur, Semata Kaki (Ankle Socks), & Potongan Rendah (Low-Cut Socks)",
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
    (r"\bEXTRA\s*BROADC(?:LOTH)?\b|\bBROADCLOTH\b", "Extra Broadcloth Cotton", "tenunan katun rapat, halus & rapi khas kemeja kantoran"),
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


# ─────────────────────────────────────────────────────────────────────────────
#  3. OCCASION & NEED-TO-DEPARTMENT SMART ROUTER (BAHASA SEHARI-HARI CUSTOMER!)
#     Customer tidak pernah mengetik "SUKO WORKWEAR" / "SLEEPWEAR" / "ESSENTIAL".
#     Customer mengetik "ada kemeja formal?", "baju buat tidur", "daleman hijab",
#     "jaket buat motoran", "baju ruangan AC", "males nyetrika", dll!
# ─────────────────────────────────────────────────────────────────────────────

def detect_occasion_profile(low: str) -> Dict[str, Any]:
    """
    Menerjemahkan bahasa kebutuhan/momen sehari-hari customer menjadi strategi query DB SUKO
    (preferDepts, boostTerms, penalizeTerms, extraKeywords, & pembuka gaya SPV veteran!).
    """
    txt = str(low or "").lower()

    # 1. RUANGAN AC / DINGIN / MOTORAN / ANGIN MALAM -> cek DULUAN sebelum WORKWEAR agar "ruangan AC kantor dingin" masuk OUTER HANGAT!
    if re.search(
        r"\b(ruangan\s+ac|kantor\s+dingin|baju\s+hangat|biar\s+hangat|motoran|naik\s+motor|angin\s+malam|"
        r"tahan\s+angin|gampang\s+dilipat|masuk\s+tas|musim\s+hujan|gerimis)\b",
        txt,
    ):
        is_motor = bool(re.search(r"\b(motoran|naik\s+motor|angin|dilipat|hujan|gerimis)\b", txt))
        return {
            "id": "COLD_AC_WIND",
            "preferDepts": ["SUKO CASUAL", "SUKO SPORTS MEN", "SUKO SPORTS LADIES"],
            "boostTerms": ["WINDBREAKER", "PARASUT", "PARKA", "POCKETABLE", "REVERSIBLE", "TASLAN"] if is_motor else ["SOUFFLE", "CARDIGAN", "BABY TERRY", "FLEECE", "SWEATER", "WAFFLE", "KNIT", "JAKET"],
            "penalizeTerms": ["SLEEVELESS", "TANK TOP", "SHORT", "PENDEK", "BOXER", "SANDAL", "KEMEJA"],
            "fallbackKeywords": ["windbreaker", "parka", "parasut", "jaket"] if is_motor else ["cardigan", "souffle", "sweater", "jaket"],
            "veteranOpening": (
                "Pas banget {sapaan}! Untuk motoran/angin malam atau traveling, *SUKO* punya lini jaket *Windbreaker, Parasut Taslan, Parka Reversible,* dan *Pocketable* yang super ringan, tahan angin & praktis dibawa 🧥✨\nIni pilihan yang sedang *ready*:"
                if is_motor
                else "Pas banget {sapaan}! Untuk ruangan ber-AC / udara dingin tanpa bikin gerah, andalan *SUKO* ada di *Cardigan Souffle Yarn* (rajut empuk & gak gatal), *Sweater Baby Terry*, hingga *Polar Fleece* & *Waffle* 🧥✨\nIni pilihan yang sedang *ready*:"
            ),
        }

    # 2. FORMAL / KERJA / KANTOR / INTERVIEW / MEETING / ACARA RESMI -> SUKO WORKWEAR!
    if re.search(
        r"\b(formal|resmi|kantoran|kantor|ngantor|kerja|interview|wawancara|meeting|rapat|presentasi|"
        r"semi[\-\s]?formal|workwear|jas|blazer|kondangan\s+rapi)\b",
        txt,
    ):
        return {
            "id": "WORKWEAR_FORMAL",
            "preferDepts": ["SUKO WORKWEAR"],
            "boostTerms": ["OXFORD", "FINE KATUN", "EXTRA BROADC", "CHINOS KERJA", "CHINOS SLIM", "ANKLE SMART", "COMFORT 2 KANCING", "BLOUSE", "SATIN", "PEPLUM", "WOVEN"],
            "penalizeTerms": ["GRAPHIC", "OVERSIZED", "CROP", "SPORT", "PAJAMAS", "SANRIO", "DISNEY", "SIMPSONS", "BOXER", "SLEEP", "RESORT", "HOODIE"],
            "fallbackKeywords": ["kemeja", "oxford", "chinos", "workwear"],
            "veteranOpening": (
                "Ada dong {sapaan}! Untuk kebutuhan formal/kerja, koleksi *SUKO Workwear* kami memang dirancang khusus dengan potongan rapi tapi tetap adem di iklim tropis "
                "(mulai dari kemeja *Classic Oxford* & *Fine Katun Extra Broadcloth* yang halus, celana *Chino Kerja / Ankle Smart*, hingga blazer smart-casual) ✨\n"
                "Ini pilihan yang sedang *ready* saat ini:"
            ),
        }

    # 3. TIDUR / BAJU RUMAH / SANTAI MALAM -> SUKO SLEEPWEAR!
    if re.search(
        r"\b(buat\s+tidur|baju\s+tidur|pakaian\s+tidur|celana\s+tidur|piyama|pajama|pajamas|sleepwear|"
        r"buat\s+di\s+rumah|baju\s+rumah|santai\s+malam|nginep|sanrio|simpsons|disney)\b",
        txt,
    ):
        return {
            "id": "SLEEPWEAR_HOME",
            "preferDepts": ["SUKO SLEEPWEAR"],
            "boostTerms": ["PAJAMAS", "FLANNEL", "RIB RAJUT", "SANRIO", "DISNEY", "SIMPSONS", "SLEEP"],
            "penalizeTerms": ["WORKWEAR", "OXFORD", "JEANS", "CHINOS", "SPORT", "PARASUT", "WINDBREAKER", "PILLOW", "POCKET TEE"],
            "fallbackKeywords": ["pajamas", "flannel", "sleepwear"],
            "veteranOpening": (
                "Ada banget {sapaan}! Di lini *SUKO Sleepwear*, kami punya pilihan piyama set & celana tidur berbahan lembut adem "
                "(termasuk motif polos elegan, bahan flannel/rib lembut, sampai koleksi karakter resmi *Disney, Sanrio, & Simpsons*) 🌙✨\n"
                "Ini pilihan yang sedang *ready*:"
            ),
        }

    # 4. DALEMAN / INNER HIJAB CIPUT / ANTI-NERAWANG / UNDERWEAR / KAOS KAKI -> SUKO ESSENTIAL & UNDERWEAR!
    if re.search(
        r"\b(daleman|dalaman|inner|innerwear|ciput|kerudung|hijab|kamisol|camisole|tank\s*top|"
        r"celana\s+dalam|pakaian\s+dalam|underwear|boxer|singlet|kaos\s+kaki|kaus\s+kaki|biar\s+gak\s+nerawang)\b",
        txt,
    ):
        is_hijab = bool(re.search(r"\b(ciput|kerudung|hijab)\b", txt))
        is_socks = bool(re.search(r"\b(kaos\s+kaki|kaus\s+kaki|sock)\b", txt))
        is_boxer = bool(re.search(r"\b(boxer|celana\s+dalam)\b", txt))
        fb_kws = (
            ["ciput", "hijab", "inner"] if is_hijab
            else ["kaoskaki", "sock"] if is_socks
            else ["boxer", "pakaian dalam"] if is_boxer
            else ["inner", "kamisol", "innerwear", "tank top"]
        )
        return {
            "id": "INNER_ESSENTIAL",
            "subType": "HIJAB" if is_hijab else ("SOCKS" if is_socks else ("BOXER" if is_boxer else "INNER_TOP")),
            "preferDepts": ["SUKO UNDERWEAR"] if is_hijab else ["SUKO ESSENTIAL", "SUKO UNDERWEAR"],
            "boostTerms": ["CIPUT", "HIJAB", "INNER", "KAMISOL"] if is_hijab else (["KAOS KAKI", "SOCK"] if is_socks else (["BOXER", "PAKAIAN DALAM"] if is_boxer else ["INNER", "KAMISOL", "INNERWEAR", "ANTI BAKTERI", "TANK TOP"])),
            "penalizeTerms": ["BOXER", "JEANS", "PARKA", "WINDBREAKER", "TUMBLER", "TOWEL", "CUSHION"] if not is_boxer else ["JEANS", "PARKA", "WINDBREAKER", "TUMBLER", "TOWEL", "CUSHION"],
            "fallbackKeywords": fb_kws,
            "veteranOpening": (
                "Ada dong {sapaan}! Di lini *SUKO Essential & Underwear* kami menyediakan kebutuhan dalaman harian yang super nyaman & breathable "
                "(mulai dari *Inner Hijab Ciput*, *Kamisol/Tank Top*, *Inner T-Shirt Anti-Bakteri*, *Boxer* katun/tenun, hingga *Kaos Kaki* berbagai potongan) ✨\n"
                "Ini pilihan yang sedang *ready*:"
            ),
        }

    # 5. OLAHRAGA / KERINGATAN / GYM / LARI / PADEL / TENIS / ZUMBA / TRAINING -> SUKO SPORTS (SUKO GO)!
    if re.search(
        r"\b(sport|sports|olahraga|training|gym|fitness|lari|jogging|padel|tenis|badminton|yoga|zumba|"
        r"sepedaan|gowes|activewear|keringatan|cepat\s+kering|anti\s+keringat)\b",
        txt,
    ):
        return {
            "id": "SPORT_ACTIVE",
            "preferDepts": ["SUKO SPORTS MEN", "SUKO SPORTS LADIES"],
            "boostTerms": ["ACTIVE", "4-WAY", "QUICK DRY", "ULTRA STR", "HIGH REC", "ANTI BAKTERI", "SPORTS", "JOGGER", "LEGGING", "NILON PARASUT", "WINDBREAKER"],
            "penalizeTerms": ["KNIT SHORT", "JEANS", "CHINOS", "OXFORD", "FLANNEL", "PAJAMAS", "CORDUROY"],
            "fallbackKeywords": ["sports", "active", "quick dry", "jogger"],
            "veteranOpening": (
                "Ada banget {sapaan}! Di *SUKO* kami punya lini khusus *SUKO Sports (SUKO GO)* yang memang dirancang untuk olahraga & gerak aktif "
                "(teknologi *4-Way / Ultra Stretch* melar 4 arah, *Quick Dry* 2× lebih cepat kering, *Anti-Bakteri*, & *High Recovery*) ✨\n"
                "Ini pilihan *SUKO Sports* yang sedang *ready*:"
            ),
        }

    # 6. CUACA PANAS / SIANG TERIK / MALES NYETRIKA / PANTAI / LIBURAN -> SEERSUCKER / LINEN / RAYON / CLIMA / SUPIMA!
    if re.search(
        r"\b(siang\s+terik|cuaca\s+panas|super\s+adem|adem\s+banget|males\s+nyetrika|malas\s+setrika|"
        r"anti\s+kusut|gak\s+gampang\s+kusut|ke\s+pantai|liburan|resort)\b",
        txt,
    ):
        return {
            "id": "HOT_WEATHER_TRAVEL",
            "preferDepts": ["SUKO CASUAL"],
            "boostTerms": ["SEERSUCKER", "LINEN", "RAYON", "BAMBOO", "QUICK DRY", "CLIMA", "SUPIMA", "SOFT TOUCH", "RESORT"],
            "penalizeTerms": ["FLEECE", "FLANNEL", "CORDUROY", "WINTER", "PARKA", "SWEATER"],
            "fallbackKeywords": ["seersucker", "linen", "rayon", "supima"],
            "veteranOpening": (
                "Pilihan tepat {sapaan}! Untuk cuaca panas / liburan atau cari yang minim setrika, andalan *SUKO* ada di bahan *Seersucker* (bertekstur adem, tidak nempel kulit & gak perlu setrika ketat), *Linen Blend*, *Rayon*, *Bamboo*, hingga *Supima & Clima Tech* ☀️✨\n"
                "Ini rekomendasi yang sedang *ready*:"
            ),
        }

    # 7. BOTOL MINUM / TUMBLER / HANDUK / KADO RUMAH -> SUKO HOME LIVING!
    if re.search(r"\b(botol\s+minum|tumbler|thermos|termos|tahan\s+panas|handuk|towel|bantal\s+tidur|kado\s+lucu)\b", txt):
        return {
            "id": "GIFT_HOME_LIVING",
            "preferDepts": ["SUKO HOME LIVING", "SUKO TOYS"],
            "boostTerms": ["TUMBLER", "THERMAL", "VACUUM", "TOWEL", "500GSM", "360GSM", "CUSHION"],
            "penalizeTerms": ["T-SHIRT", "CELANA", "KEMEJA", "JEANS"],
            "fallbackKeywords": ["tumbler", "towel", "handuk"],
            "veteranOpening": (
                "Ada dong {sapaan}! Di lini *SUKO Home Living*, kami punya *Thermal Tumbler Scandic Vacuum* (tahan panas/dingin) serta *Handuk 360–500 GSM Dobby* bergaya minimalis ✨\n"
                "Ini pilihan yang sedang *ready*:"
            ),
        }

    return {}


def get_compact_pk_prompt_block() -> str:
    """
    Blok pengetahuan ringkas padat (~220 kata) untuk disuntikkan ke AI Planner & Copywriter
    agar berbicara layaknya Senior Product Specialist SUKO / Matahari berpengalaman 20 tahun.
    """
    return (
        "PRODUCT KNOWLEDGE RESMI SUKO BY MATAHARI (WAJIB DIKUASAI ALA VETERAN RITEL 20 TAHUN):\n"
        "- Identitas Brand: SUKO (dari kata 'Suka', konsep Japanese-inspired minimalist everyday wear: clean look, warna earth tone, nyaman untuk iklim tropis Indonesia, 1.200+ artikel lintas Pria, Wanita, Anak, & Lifestyle).\n"
        "- Lini & Jenis Produk Riil di Store SUKO PTC:\n"
        "  1) SUKO Casual & Workwear (16/16 Ready): Blazer/Jaket Comfort 2 Kancing, Kemeja (Oxford Klasik/Stripe, Fine Katun Extra Broadcloth, Flannel, Linen Blend, Resort Seersucker kerah tegak/koko, Rayon), Kaos (Oversized, Supima, Soft Touch, Clima Tech, Waffle, Mini Rib, Interlock, Ripstop, Henley, Crop), Polo (Knit/Rib/Pique), Blouse (Satin, Peplum, Rayon, Linen), Celana (Chino Kerja/Slim/Stretch, Ankle Smart, Jeans Straight/Slim/Wide/Pleated/Bermuda, Twill, Linen Lipit, Bamboo Relax, Corduroy, Barrel/Balon, Cargo, Kulot Nilon), Rok & Dress Wanita (25 sub-jenis: Midi/Maxi/Satin/Balon/Nilon/Ultra Stretch, Skort Rok Celana, Knit/Denim/Flare Dress), Outer (Cardigan Souffle Yarn, Sweater Baby Terry, Polar Fleece, Jaket Twill Pocketable, Parka Reversible, Light Hoodie Parasut Taslan, Rompi Parasut/Denim).\n"
        "  2) SUKO Sports / SUKO GO (Activewear): Active Pants 4-Way Stretch, 4-Way Stretch Jogger, Celana Nilon Parasut Sports, Jogger Sports/Sweat, Celana Pendek Ultra Stretch, Legging & Crop Bra High Recovery, Rok Celana Anti-Bakteri Quick Dry & Gaun Polo Sports (padel/tenis/golf), Kaos & Polo Quick Dry, Jaket Parka Windbreaker.\n"
        "  3) SUKO Sleepwear (Pajamas Set polos/motif & lisensi resmi Sanrio, Disney, Simpsons, Celana Flannel & Rib), SUKO Essential & Underwear (Boxer Reguler/Woven, Inner Hijab Ciput, Inner Tank Top Kamisol, Inner T-Shirt Anti-Bakteri, Kaos Kaki Reguler/Ankle/Low-Cut), SUKO Kids (Boys & Girls), Footwear Santai (Casual Sneakers harian bukan sepatu lari performa, Slip-On, Ballerina, Mule, Flip Flops), Bags/Accs, & Home Living (Sport Towel 360GSM, Bath Towel 500GSM, Thermal Tumbler Scandic).\n"
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
            f"Dengan senang hati saya jelaskan {sapaan}! 😊 Sebagai brand *minimalist everyday wear* modern, "
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
