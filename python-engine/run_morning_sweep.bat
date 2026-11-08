@echo off
title SINKRONISASI TOTAL & BRUTAL SCRAPING PAGI MDS BISA
echo =======================================================================
echo MEMULAI SINKRONISASI TOTAL & BRUTAL SCRAPING MDS BISA TOKO 719
echo =======================================================================
cd /d "c:\Max Display\price-checker\python-engine"
.\.venv\Scripts\python.exe morning_full_sweep.py
echo =======================================================================
echo LAPORAN TELAH DIBUAT DI: LAPORAN_SCRAP_PAGI.md
echo =======================================================================
pause
