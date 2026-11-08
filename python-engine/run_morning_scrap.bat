@echo off
title MESIN BRUTAL SCRAPING MDS BISA - STORE 719
echo =======================================================================
echo MEMULAI BRUTAL SCRAPING MDS BISA (MUKU, ZES, SUKO, DAN SELURUH MERK)
echo =======================================================================
cd /d "c:\Max Display\price-checker\python-engine"
.\.venv\Scripts\python.exe brutal_scraper.py
echo =======================================================================
echo PROSES SELESAI! SELURUH PRODUK TELAH MASUK KE DATABASE SUPABASE.
echo =======================================================================
pause
