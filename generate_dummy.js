const xlsx = require("xlsx");
const fs = require("fs");

const dummyData = [
  {
    "SKU": "10001",
    "Barcode": "8991234567890",
    "Nama Barang": "Minyak Goreng 2L",
    "Harga Normal": 35000,
    "Harga Diskon": 32500,
    "Stok": 50
  },
  {
    "SKU": "10002",
    "Barcode": "8990987654321",
    "Nama Barang": "Beras Premium 5Kg",
    "Harga Normal": 75000,
    "Harga Diskon": "",
    "Stok": 20
  },
  {
    "SKU": "10003",
    "Barcode": "8991122334455",
    "Nama Barang": "Gula Pasir 1Kg",
    "Harga Normal": 16000,
    "Harga Diskon": 15000,
    "Stok": 100
  },
  {
    "SKU": "10004",
    "Barcode": "8995544332211",
    "Nama Barang": "Kopi Saset 10x20g",
    "Harga Normal": 12000,
    "Harga Diskon": 10000,
    "Stok": 5
  }
];

const worksheet = xlsx.utils.json_to_sheet(dummyData);
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");

const filePath = "dummy_harga.xlsx";
xlsx.writeFile(workbook, filePath);

console.log("File dummy berhasil dibuat di:", filePath);
