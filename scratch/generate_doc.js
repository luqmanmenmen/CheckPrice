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

async function createExecutiveDoc() {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  const targetFile = path.join(desktopDir, 'Proposal_dan_Ringkasan_Eksekutif_Max_Display.docx');

  const NAVY = '1E3A8A';
  const BLUE = '2563EB';
  const LIGHT_BLUE = 'EFF6FF';
  const SLATE = '475569';
  const DARK = '0F172A';
  const GRAY_BG = 'F8FAFC';
  const BORDER_COLOR = 'CBD5E1';

  // Helper untuk Cell Tabel
  const createCell = (text, isHeader = false, widthPercent = 25, align = AlignmentType.LEFT) => {
    return new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      shading: {
        fill: isHeader ? NAVY : GRAY_BG,
        type: ShadingType.CLEAR,
      },
      margins: {
        top: convertInchesToTwip(0.1),
        bottom: convertInchesToTwip(0.1),
        left: convertInchesToTwip(0.15),
        right: convertInchesToTwip(0.15),
      },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
        left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
        right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
      },
      children: [
        new Paragraph({
          alignment: align,
          children: [
            new TextRun({
              text,
              bold: isHeader,
              color: isHeader ? 'FFFFFF' : DARK,
              size: isHeader ? 21 : 19,
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
            color: DARK,
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
          // Header Badge
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'DOKUMEN EKSEKUTIF & ARSITEKTUR SISTEM',
                bold: true,
                size: 18,
                color: BLUE,
                font: 'Calibri',
              }),
            ],
          }),

          // Judul Utama
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({
                text: 'MAX DISPLAY PRO',
                bold: true,
                size: 40,
                color: NAVY,
                font: 'Calibri',
              }),
            ],
          }),

          // Subjudul
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 280 },
            children: [
              new TextRun({
                text: 'Platform Retail Intelligence, Dual-Access Kiosk & Real-time Store Operations',
                italics: true,
                size: 22,
                color: SLATE,
              }),
            ],
          }),

          // Box Catatan Kerahasiaan (Callout Box)
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
                    borders: {
                      left: { style: BorderStyle.SINGLE, size: 24, color: BLUE },
                      top: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                    },
                    margins: {
                      top: convertInchesToTwip(0.12),
                      bottom: convertInchesToTwip(0.12),
                      left: convertInchesToTwip(0.2),
                      right: convertInchesToTwip(0.2),
                    },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: 'Pemberitahuan Kerahasiaan (Semi-Sensored Presentation):',
                            bold: true,
                            size: 20,
                            color: NAVY,
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 60 },
                        children: [
                          new TextRun({
                            text: 'Dokumen ini disusun untuk kebutuhan presentasi ke manajemen, investor, atau stakeholder ritel. Seluruh konsep bisnis dan keunggulan operasional dipaparkan secara detail dan transparan, dengan tetap memproteksi algoritma inti (secret sauce), skema database mentah, dan kredensial internal sistem.',
                            size: 19,
                            color: DARK,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 240 } }),

          // 1. Executive Summary
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: '1. Executive Summary (Latar Belakang & Solusi)',
                bold: true,
                size: 26,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'Di era ritel modern yang dinamis (multi-department & fast fashion), kendala terbesar toko fisik adalah selisih antara label harga pakaian (hangtag) dengan data promosi terkini di sistem kasir. Hal ini kerap memicu antrean panjang, keluhan pelanggan, dan waktu pramuniaga yang habis hanya untuk mengecek harga secara manual.',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Max Display Pro menghadirkan terobosan dengan memisahkan alur sistem menjadi ',
              }),
              new TextRun({
                text: 'Dua Pintu Akses Terpisah (Dual-Access Architecture):',
                bold: true,
              }),
              new TextRun({
                text: ' Pintu Publik Kiosk untuk pelanggan mandiri tanpa login, dan Pintu Internal Khusus Staf untuk pengelolaan stok, gudang, serta analitik manajerial supervisor.',
              }),
            ],
          }),

          // 2. Arsitektur Dual-Access
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: '2. Arsitektur Dual-Access (Dua Pintu Akses)',
                bold: true,
                size: 26,
                color: NAVY,
              }),
            ],
          }),

          // Tabel Perbandingan
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell('Parameter', true, 25),
                  createCell('Akses Publik (Customer Kiosk)', true, 37),
                  createCell('Akses Internal (Staff Suite)', true, 38),
                ],
              }),
              new TableRow({
                children: [
                  createCell('Target Pengguna', false, 25),
                  createCell('Pelanggan toko & pengunjung umum', false, 37),
                  createCell('Pramuniaga (SA), Kasir, Gudang, SPV', false, 38),
                ],
              }),
              new TableRow({
                children: [
                  createCell('Akses / Login', false, 25),
                  createCell('100% Bebas Tanpa Login (Open Public)', false, 37),
                  createCell('Wajib NIK & PIN Terenkripsi (RBAC)', false, 38),
                ],
              }),
              new TableRow({
                children: [
                  createCell('Cara Penggunaan', false, 25),
                  createCell('Scan QR di rak/cermin -> Kamera aktif otomatis', false, 37),
                  createCell('Aplikasi Toko HP staf / tablet operasional', false, 38),
                ],
              }),
              new TableRow({
                children: [
                  createCell('Informasi Ditampilkan', false, 25),
                  createCell('Hanya Nama Artikel, Harga Real & Promo Diskon', false, 37),
                  createCell('Stok toko, stok gudang, varian lengkap, tiket order', false, 38),
                ],
              }),
              new TableRow({
                children: [
                  createCell('Status Kerahasiaan Stok', false, 25),
                  createCell('100% DISEMBUNYIKAN (Zero Data Exposure)', false, 37),
                  createCell('Akurat real-time sesuai fisik toko', false, 38),
                ],
              }),
              new TableRow({
                children: [
                  createCell('Ketahanan Offline', false, 25),
                  createCell('Pencarian cepat serverless', false, 37),
                  createCell('Database lokal offline (IndexedDB Sync)', false, 38),
                ],
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 240 } }),

          // 3. Keunggulan Teknologi Platform
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: '3. Pilar Keunggulan Teknologi (High-Performance Engine)',
                bold: true,
                size: 26,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: BLUE }),
              new TextRun({ text: 'Customer Auto-Scanner: ', bold: true }),
              new TextRun({ text: 'Membuka link langsung mengaktifkan kamera belakang HP secara instan dengan laser guide merah dan audio beep feedback saat barcode terdeteksi.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: BLUE }),
              new TextRun({ text: 'Offline-First Architecture: ', bold: true }),
              new TextRun({ text: 'Pramuniaga tetap bisa melayani pelanggan dan memeriksa harga tanpa putus, meskipun toko berada di area basement atau mengalami pemadaman sinyal.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: BLUE }),
              new TextRun({ text: 'High-Volume Data Processing: ', bold: true }),
              new TextRun({ text: 'Mesin sinkronisasi data mampu memproses puluhan ribu baris file inventori dan matriks promosi multi-tier dalam hitungan detik.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '• ', bold: true, color: BLUE }),
              new TextRun({ text: 'Executive Retail Analytics: ', bold: true }),
              new TextRun({ text: 'Dashboard manajerial menghitung otomatis KPI ritel harian (SPD, WTD, MTD, Day-over-Day Growth) dan deteksi dini barang slow-moving serta stok kritis.' }),
            ],
          }),

          new Paragraph({ spacing: { before: 200 } }),

          // 4. Dampak Bisnis (ROI)
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: '4. Dampak Bisnis & Return on Investment (ROI)',
                bold: true,
                size: 26,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '1. Memangkas Waktu Antrean Kasir hingga 40%: ', bold: true }),
              new TextRun({ text: 'Pelanggan sudah mengetahui harga pasti sebelum sampai ke meja kasir, mengeliminasi pembatalan transaksi (void) akibat ketidaktahuan diskon.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '2. Zero Operational Downtime: ', bold: true }),
              new TextRun({ text: 'Teknologi offline-first menjamin operasional toko tidak pernah lumpuh walau koneksi internet gedung mengalami kendala.' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: '3. Kepuasan Pelanggan & Citra Modern: ', bold: true }),
              new TextRun({ text: 'Toko dipandang modern, transparan, dan berteknologi tinggi dengan menghadirkan pengalaman belanja mandiri yang interaktif.' }),
            ],
          }),

          new Paragraph({ spacing: { before: 240 } }),

          // 5. Contekkan Presentasi Lisan
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: '5. Contekkan Presentasi Lisan (Script Pitching)',
                bold: true,
                size: 26,
                color: NAVY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: '"Bapak/Ibu sekalian, platform Max Display Pro ini dibangun dengan konsep Dual-Access Architecture (Dua Pintu Akses):',
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'Pintu pertama untuk Pelanggan: Cukup scan QR code di rak toko, kamera langsung menyala, barcode baju discan, dan harga resmi seketika muncul di HP pelanggan. Data rahasia internal seperti jumlah stok di gudang 100% diproteksi dan tidak bisa dilihat publik.',
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'Pintu kedua untuk Kru Toko & Manajemen: Dilindungi autentikasi NIK dan PIN, staf dapat mengecek stok fisik, request barang ke tim gudang, serta melihat rekapan omzet real-time. Bahkan jika internet mati, aplikasi tetap bisa dipakai berkat teknologi offline database.',
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Hasilnya: kasir bebas antrean, tidak ada komplain selisih harga, dan perputaran barang gudang menjadi jauh lebih cepat."',
                italics: true,
                bold: true,
              }),
            ],
          }),

          // Footer info
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300 },
            children: [
              new TextRun({
                text: 'Disusun secara khusus oleh Tim Max Display Pro • 2026',
                size: 18,
                color: SLATE,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(targetFile, buffer);
  console.log('SUCCESS: Word document created at:', targetFile);
}

createExecutiveDoc().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
