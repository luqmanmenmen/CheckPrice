const fs = require('fs');
const path = require('path');
const os = require('os');
const { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  BorderStyle, 
  AlignmentType, 
  ShadingType,
  convertInchesToTwip
} = require('docx');

async function createFormalProposalDoc() {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  const targetFile1 = path.join(desktopDir, 'Proposal_Resmi_Max_Display_Head_Office.docx');
  const targetFile2 = path.join(desktopDir, 'Proposal_dan_Ringkasan_Eksekutif_Max_Display.docx');

  const NAVY = '1B365D';      // Corporate Navy
  const DARK_SLATE = '1E293B'; // Text Main
  const MUTED_GRAY = '64748B'; // Subtitle
  const LIGHT_BG = 'F8FAFC';   // Table row
  const BORDER_CLR = 'CBD5E1'; // Thin clean border
  const ACCENT_BLUE = '0284C7';

  // Helper Pembuat Cell Tabel Formal
  const makeCell = (text, isHeader = false, widthPct = 25, align = AlignmentType.LEFT) => {
    return new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      shading: {
        fill: isHeader ? NAVY : LIGHT_BG,
        type: ShadingType.CLEAR,
      },
      margins: {
        top: convertInchesToTwip(0.12),
        bottom: convertInchesToTwip(0.12),
        left: convertInchesToTwip(0.15),
        right: convertInchesToTwip(0.15),
      },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
        left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
        right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      },
      children: [
        new Paragraph({
          alignment: align,
          children: [
            new TextRun({
              text,
              bold: isHeader,
              color: isHeader ? 'FFFFFF' : DARK_SLATE,
              size: isHeader ? 20 : 19,
              font: 'Calibri',
            }),
          ],
        }),
      ],
    });
  };

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
            color: DARK_SLATE,
          },
          paragraph: {
            spacing: { line: 276 }, // 1.15 line spacing
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: [
          // KOP / Header Dokumen Resmi
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'PROPOSAL INOVASI SISTEM OPERASIONAL TOKO',
                bold: true,
                size: 20,
                color: ACCENT_BLUE,
                font: 'Calibri',
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 80 },
            children: [
              new TextRun({
                text: 'IMPLEMENTASI SISTEM DIGITALISASI RITEL TERPADU (MAX DISPLAY PRO)',
                bold: true,
                size: 30,
                color: NAVY,
                font: 'Calibri',
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: 'Peningkatan Efisiensi Pelayanan Pelanggan Mandiri & Optimalisasi Inventori Toko',
                italics: true,
                size: 20,
                color: MUTED_GRAY,
              }),
            ],
          }),

          // Tabel Metadata Dokumen Resmi HO
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  makeCell('Nomor Dokumen', true, 25),
                  makeCell('PROP-RET/SUKO/2026/X-01', false, 75),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Ditujukan Kepada', true, 25),
                  makeCell('Head Office Management / Retail Operations & IT Directorate', false, 75),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Inisiator / Penyusun', true, 25),
                  makeCell('Tim Operasional & Pengembangan Sistem Toko SUKO', false, 75),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Klasifikasi', true, 25),
                  makeCell('Proposal Implementasi & Standarisasi Teknologi Toko (Internal Ritel)', false, 75),
                ],
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 240 } }),

          // BAB I
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: 'BAB I. LATAR BELAKANG & PERMASALAHAN LAPANGAN',
                bold: true,
                size: 24,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'Dalam ekosistem ritel multi-department dan perputaran promosi yang dinamis, toko fisik sering kali menghadapi kendala teknis dan operasional yang berdampak langsung pada kepuasan pelanggan serta beban kerja pramuniaga:',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '1. ', bold: true }),
              new TextRun({ text: 'Disparitas Harga Fisik vs Sistem Kasir (POS): ', bold: true }),
              new TextRun({ text: 'Perubahan harga promosi (Special Price, BOGO, Diskon %) yang sering berganti membutuhkan pembaruan hangtag manual ribuan SKU. Keterlambatan penggantian hangtag sering memicu komplain selisih harga di kasir.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '2. ', bold: true }),
              new TextRun({ text: 'Penumpukan Antrean Kasir & Pembatalan Transaksi (Void): ', bold: true }),
              new TextRun({ text: 'Pelanggan sering membawa pakaian ke kasir hanya untuk menanyakan harga promo. Jika harga tidak sesuai ekspektasi, transaksi dibatalkan di kasir sehingga antrean memanjang.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '3. ', bold: true }),
              new TextRun({ text: 'Kendala Konektivitas Toko (Offline Dead-Zone): ', bold: true }),
              new TextRun({ text: 'Area ritel di basement mall kerap mengalami gangguan sinyal seluler atau Wi-Fi, menyebabkan sistem berbasis web biasa lumpuh total saat melayani transaksi.' }),
            ],
          }),

          new Paragraph({ spacing: { before: 200 } }),

          // BAB II
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: 'BAB II. KONSEP SOLUSI: ARSITEKTUR DUAL-ACCESS',
                bold: true,
                size: 24,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'Untuk menjawab tantangan di atas tanpa mengorbankan kerahasiaan data internal toko, sistem ',
              }),
              new TextRun({
                text: 'Max Display Pro ',
                bold: true,
              }),
              new TextRun({
                text: 'dirancang dengan arsitektur dua gerbang akses terisolasi:',
              }),
            ],
          }),

          // Tabel Dual Access
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  makeCell('Kriteria Komparasi', true, 26),
                  makeCell('Pintu 1: Akses Publik (Customer Kiosk)', true, 37),
                  makeCell('Pintu 2: Akses Internal (Staff Operations)', true, 37),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Sasaran Pengguna', false, 26),
                  makeCell('Konsumen toko & pengunjung umum', false, 37),
                  makeCell('Sales Area (SA), Kasir, Gudang, Supervisor', false, 37),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Otentikasi Akses', false, 26),
                  makeCell('Terbuka Bebas (Tanpa Login / NIK / PIN)', false, 37),
                  makeCell('Terenkripsi Multi-Tier (NIK & PIN per Shift)', false, 37),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Aktivasi Scanner', false, 26),
                  makeCell('Kamera aktif otomatis saat link / QR dibuka', false, 37),
                  makeCell('Scanner Terpadu + Pengenalan Teks SKU', false, 37),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Ruang Lingkup Data', false, 26),
                  makeCell('Nama Artikel, Harga Real, Status Promo, Hemat', false, 37),
                  makeCell('Stok Fisik Toko, Stok Gudang, Varian S–XL, Rekap Omzet', false, 37),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Kerahasiaan Stok', false, 26),
                  makeCell('100% DISEMBUNYIKAN (Proteksi Kerahasiaan)', false, 37),
                  makeCell('Transparan Real-Time untuk Operasional', false, 37),
                ],
              }),
              new TableRow({
                children: [
                  makeCell('Ketahanan Sinyal', false, 26),
                  makeCell('Direct Real-Time Caching', false, 37),
                  makeCell('Offline-First Database (Tetap jalan tanpa sinyal)', false, 37),
                ],
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 240 } }),

          // BAB III
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: 'BAB III. SPESIFIKASI TEKNIS & KEUNGGULAN OPERASIONAL',
                bold: true,
                size: 24,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: '1. Self-Service Kiosk Pelanggan (Zero-Friction Customer Experience)', bold: true }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Pelanggan memindai QR Code yang ditempatkan di rak atau hanger pakaian. Browser pelanggan langsung membuka scanner kamera aktif. Begitu barcode pakaian terbaca, sistem mengeluarkan konfirmasi suara (audio beep) dan menyajikan informasi harga resmi, harga promo aktif, serta kalkulasi penghematan. Tampilan otomatis me-reset kembali ke mode scanner setelah 25 detik tanpa interaksi.' }),
            ],
          }),

          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [
              new TextRun({ text: '2. Ketahanan Luring Tanpa Internet (Offline-First Store Resilience)', bold: true }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Sistem operasional staf mengintegrasikan sinkronisasi database lokal di memori perangkat browser klien. Seluruh daftar harga dan stok disinkronkan berkala saat sinyal aktif, sehingga jika koneksi internet toko putus sewaktu-waktu, pramuniaga tetap dapat mengecek harga dan melayani pelanggan dengan akurat 100%.' }),
            ],
          }),

          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [
              new TextRun({ text: '3. Mesin Pemrosesan Data Cepat (High-Volume Retail Data Pipeline)', bold: true }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Mampu memproses file rekonsiliasi data inventori harian dan matriks promosi ritel berskala besar (50.000+ baris data) secara asinkron di latar belakang dalam hitungan detik tanpa membebani performa kasir toko.' }),
            ],
          }),

          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [
              new TextRun({ text: '4. Executive Retail Dashboard & Pengawasan Supervisor', bold: true }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'Menyediakan metrik ritel otomatis: Sales Per Day (SPD), Week-to-Date (WTD), Month-to-Date (MTD), valuasi End-of-Hand (EOH), serta deteksi dini produk kritis (stok <= 5 pcs) dan produk slow-moving untuk percepatan strategi rotasi barang.' }),
            ],
          }),

          new Paragraph({ spacing: { before: 200 } }),

          // BAB IV
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: 'BAB IV. ANALISIS DAMPAK BISNIS & RETURN ON INVESTMENT (ROI)',
                bold: true,
                size: 24,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: ACCENT_BLUE }),
              new TextRun({ text: 'Penurunan Waktu Tunggu Antrean Kasir (-40%): ', bold: true }),
              new TextRun({ text: 'Meniadakan aktivitas "hanya tanya harga promo" di meja kasir sehingga proses transaksi pembayaran menjadi jauh lebih cepat dan antrean terurai.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: ACCENT_BLUE }),
              new TextRun({ text: 'Peniadaan Komplain Selisih Harga (Zero Pricing Dispute): ', bold: true }),
              new TextRun({ text: 'Harga yang dilihat pelanggan di rak terjamin sama persis dengan sistem kasir pusat secara real-time.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: ACCENT_BLUE }),
              new TextRun({ text: 'Efisiensi Jam Kerja Staf Toko: ', bold: true }),
              new TextRun({ text: 'Pramuniaga tidak lagi terbebani pertanyaan berulang mengenai harga, dan dapat lebih fokus pada aktivitas pelayanan aktif, kerapihan display, dan peningkatan basket size transaksi.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: ACCENT_BLUE }),
              new TextRun({ text: 'Percepatan Pemenuhan Barang Gudang: ', bold: true }),
              new TextRun({ text: 'Fitur One-Tap Request mempercepat koordinasi antara pramuniaga di area sales dan tim gudang secara digital tanpa perlu saling memanggil secara manual.' }),
            ],
          }),

          new Paragraph({ spacing: { before: 240 } }),

          // BAB V
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: 'BAB V. KESIMPULAN & REKOMENDASI IMPLEMENTASI',
                bold: true,
                size: 24,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'Implementasi platform Max Display Pro terbukti memberikan nilai tambah nyata bagi kepuasan pelanggan dan efisiensi operasional harian toko. Arsitektur Dual-Access menjamin bahwa kemudahan akses publik bagi konsumen tetap menjaga kerahasiaan data inventori perusahaan secara mutlak.',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: 'Berdasarkan pengujian lapangan dan kesiapan infrastruktur cloud yang ada, kami merekomendasikan standardisasi sistem ini sebagai pedoman operasional terpadu di seluruh gerai toko fisik.',
              }),
            ],
          }),

          // Blok Pengesahan Resmi
          new Paragraph({ spacing: { before: 200 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'Diajukan Oleh,', bold: true, size: 20 })] }),
                      new Paragraph({ children: [new TextRun({ text: 'Tim Operasional & Retail Development Toko', size: 19, color: MUTED_GRAY })] }),
                      new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 20 })] }),
                      new Paragraph({ children: [new TextRun({ text: 'Perwakilan Store Development', size: 18, color: MUTED_GRAY })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'Mengetahui & Menyetujui,', bold: true, size: 20 })] }),
                      new Paragraph({ children: [new TextRun({ text: 'Head Office Management / Retail Division', size: 19, color: MUTED_GRAY })] }),
                      new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 20 })] }),
                      new Paragraph({ children: [new TextRun({ text: 'Head of Retail Operations', size: 18, color: MUTED_GRAY })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(targetFile1, buffer);
  fs.writeFileSync(targetFile2, buffer);
  console.log('SUCCESS: Dokumen resmi Head Office berhasil dibuat!');
  console.log('1. ', targetFile1);
  console.log('2. ', targetFile2);
}

createFormalProposalDoc().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
