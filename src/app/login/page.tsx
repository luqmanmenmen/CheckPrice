"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";
import ShiftLoader from "@/components/ShiftLoader";
import { ShoppingCart, Shirt, Footprints, Package, Lock, LogOut, MapPin, ShieldCheck, Loader2, RefreshCw } from "lucide-react";
import { APP_VERSION, forceAppUpdate } from "@/lib/version";
import { verifyStoreGeofence } from "@/lib/storeGeofence";

export default function Login() {
  const [nik, setNik] = useState("");
  const [pin, setPin] = useState("");
  const [jobTitle, setJobTitle] = useState("Cashier");
  const [error, setError] = useState("");
  const [infoNotice, setInfoNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [fadeExit, setFadeExit] = useState(false);
  const pinRef = React.useRef<HTMLInputElement>(null);

  const performExit = (dest: string) => {
    setTimeout(() => {
      router.push(dest);
    }, 1200); // Give time for the animation to play a bit
  };
  const [toko, setToko] = useState("");
  const [userName, setUserName] = useState("");
  const [isBypassLocation, setIsBypassLocation] = useState(false);
  const [checkingNik, setCheckingNik] = useState(false);

  // GPS Geofencing State (SUKO 719 Pakuwon Mall & SUKO 720 Tunjungan Plaza — dikecualikan untuk SPV & Developer)
  const [geoStatus, setGeoStatus] = useState<"idle" | "checking" | "verified" | "outside" | "denied" | "timeout" | "unsupported">("idle");
  const [geoPermissionState, setGeoPermissionState] = useState<"granted" | "prompt" | "denied" | "unknown">("unknown");
  const [geoErrorDetail, setGeoErrorDetail] = useState("");
  const [geoDebugInfo, setGeoDebugInfo] = useState("");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [verifiedMall, setVerifiedMall] = useState("");
  const [notWorkingAlert, setNotWorkingAlert] = useState(false);
  const geoReqEpochRef = React.useRef(0);
  const geoWatchIdRef = React.useRef<number | null>(null);
  const geoPermRef = React.useRef<"granted" | "prompt" | "denied" | "unknown">("unknown");
  const assignedTokoRef = React.useRef<string>("");
  
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [loginRole, setLoginRole] = useState("");
  const [changingPin, setChangingPin] = useState(false);
  
  // Client-side only states for random positions
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; delay: string }[]>([]);

  const requestGpsLocation = React.useCallback((): Promise<{ lat: number; lng: number; accuracy: number | null } | null> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        setGeoStatus("unsupported");
        setGeoErrorDetail("Browser HP ini tidak mendukung fitur GPS.");
        setGeoDebugInfo("navigator.geolocation tidak tersedia");
        resolve(null);
        return;
      }

      // Batalkan watcher lama bila user menekan tombol Refresh Lokasi berkali-kali (anti macet / anti deadlock!)
      if (geoWatchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(geoWatchIdRef.current);
        } catch {}
        geoWatchIdRef.current = null;
      }

      const myEpoch = ++geoReqEpochRef.current;
      setGeoStatus("checking");
      setGeoErrorDetail("");
      setGeoDebugInfo("");

      let settled = false;
      const finish = (val: { lat: number; lng: number; accuracy: number | null } | null) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      const isStale = () => geoReqEpochRef.current !== myEpoch;

      const handleSuccess = (pos: GeolocationPosition) => {
        if (isStale()) return finish(null);
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        };
        setGeoPermissionState("granted");
        setGeoCoords(coords);
        setGeoErrorDetail("");
        setGeoDebugInfo(
          `GPS OK (±${Math.round(coords.accuracy || 0)}m)`
        );
        const check = verifyStoreGeofence(coords.lat, coords.lng, coords.accuracy, assignedTokoRef.current);
        if (check?.allowed) {
          setGeoStatus("verified");
          setVerifiedMall(check.nearestZone.shortName);
          setNotWorkingAlert(false);
        } else {
          setGeoStatus("outside");
          setVerifiedMall("");
        }
        finish(coords);
      };

      const handleFinalError = (code: number, msg: string) => {
        if (isStale()) return finish(null);
        setGeoCoords(null);
        setVerifiedMall("");
        setGeoDebugInfo(`Izin: ${geoPermRef.current} • Kode: ${code}${msg ? ` (${msg})` : ""}`);
        if (code === 1) {
          setGeoPermissionState("denied");
          setGeoStatus("denied");
          setGeoErrorDetail(
            "Izin lokasi diblokir browser / HP. Buka ikon gembok di kiri alamat situs → Izin → Lokasi → Izinkan (dan pastikan izin Lokasi untuk aplikasi Browser di Setelan HP sudah aktif)."
          );
        } else if (code === 2) {
          setGeoStatus("timeout");
          setGeoErrorDetail(
            "HP belum bisa mengambil koordinat GPS. Pastikan tombol Lokasi (GPS) & Google Location Accuracy di HP sudah aktif, lalu ketuk Cek Ulang."
          );
        } else {
          setGeoStatus("timeout");
          setGeoErrorDetail(
            "Permintaan lokasi habis waktu (sinyal dalam ruangan lemah). Coba buka Google Maps 1 detik lalu kembali & ketuk Cek Ulang."
          );
        }
        finish(null);
      };

      // Hard safety guard (maks 11 detik total, cegah bug browser Android yang hang tanpa callback!)
      const hardGuardTimer = setTimeout(() => {
        if (!settled && !isStale()) {
          if (geoWatchIdRef.current !== null) {
            try {
              navigator.geolocation.clearWatch(geoWatchIdRef.current);
            } catch {}
            geoWatchIdRef.current = null;
          }
          handleFinalError(3, "Browser tidak merespons (timeout)");
        }
      }, 11000);

      const safeSuccess = (pos: GeolocationPosition) => {
        clearTimeout(hardGuardTimer);
        if (geoWatchIdRef.current !== null) {
          try {
            navigator.geolocation.clearWatch(geoWatchIdRef.current);
          } catch {}
          geoWatchIdRef.current = null;
        }
        handleSuccess(pos);
      };

      // Tahap 2 (Fallback cepat): watchPosition High/Network maks 5 detik
      const tryFallbackHighAcc = () => {
        if (settled || isStale()) return;
        const wId = navigator.geolocation.watchPosition(
          safeSuccess,
          (err2) => {
            clearTimeout(hardGuardTimer);
            if (geoWatchIdRef.current !== null) {
              try {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
              } catch {}
              geoWatchIdRef.current = null;
            }
            handleFinalError(err2.code, err2.message || "");
          },
          { enableHighAccuracy: true, maximumAge: 120000, timeout: 5000 }
        );
        geoWatchIdRef.current = wId;
      };

      // Tahap 1: Instan via Wi-Fi/Jaringan (maks 4.5 detik, langsung munculkan dialog Izinkan di HP saat klik tombol)
      navigator.geolocation.getCurrentPosition(
        safeSuccess,
        (err1) => {
          if (settled || isStale()) return;
          if (err1.code === 1) {
            clearTimeout(hardGuardTimer);
            handleFinalError(err1.code, err1.message || "");
          } else {
            tryFallbackHighAcc();
          }
        },
        { enableHighAccuracy: false, timeout: 4500, maximumAge: 300000 }
      );
    });
  }, []);

  // Cek status izin lokasi browser secara pasif
  useEffect(() => {
    if (typeof window === "undefined" || !("permissions" in navigator)) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((perm) => {
        const st = perm.state as "granted" | "prompt" | "denied";
        geoPermRef.current = st;
        setGeoPermissionState(st);
        perm.onchange = () => {
          const nextSt = perm.state as "granted" | "prompt" | "denied";
          geoPermRef.current = nextSt;
          setGeoPermissionState(nextSt);
        };
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const checkNik = async () => {
      if (nik.length >= 4) { // Can be "S001" or 6 digits
        setCheckingNik(true);
        try {
          const res = await fetch(`/api/auth/check-nik?nik=${nik}`);
          const data = await res.json();
          if (res.ok) {
            const resolvedToko = data.toko || "Toko Belum Di-set";
            setToko(resolvedToko);
            assignedTokoRef.current = resolvedToko;
            setUserName(data.name || "");
            const bypass = Boolean(data.isBypassLocation);
            setIsBypassLocation(bypass);
            setNotWorkingAlert(false);
            // Jika koordinat sudah sempat terbaca, langsung evaluasi ulang terhadap toko penempatan NIK ini
            if (!bypass && geoCoords) {
              const recheck = verifyStoreGeofence(geoCoords.lat, geoCoords.lng, geoCoords.accuracy, resolvedToko);
              if (recheck?.allowed) {
                setGeoStatus("verified");
                setVerifiedMall(recheck.nearestZone.shortName);
              } else {
                setGeoStatus("outside");
                setVerifiedMall("");
              }
            } else if (!bypass && geoPermRef.current === "granted") {
              requestGpsLocation();
            }
            setTimeout(() => {
              if (pinRef.current) {
                pinRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                // Fokus tanpa merusak animasi scroll
                setTimeout(() => pinRef.current?.focus({ preventScroll: true }), 100);
              }
            }, 100); // Tunggu sampai DOM PIN input muncul
          } else {
            setToko("");
            setUserName("");
            setIsBypassLocation(false);
          }
        } catch (error) {
          setToko("");
          setUserName("");
          setIsBypassLocation(false);
        } finally {
          setCheckingNik(false);
        }
      } else {
        setToko("");
        setUserName("");
        setIsBypassLocation(false);
      }
    };
    
    const timeoutId = setTimeout(checkNik, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [nik, requestGpsLocation]);

  useEffect(() => {
    setMounted(true);
    setStars(Array.from({ length: 50 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: (Math.random() * 3).toFixed(2),
    })));

    // Deteksi jika dialihkan karena di luar jam operasional atau pindah tab/perangkat
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const reason = params.get("reason");
      if (reason === "shift_ended") {
        setError("Kamu sedang tidak bekerja. Akses aplikasi crew hanya aktif saat jam operasional toko.");
      } else if (reason === "device_switched") {
        setError("🔄 Tab/perangkat lama ini otomatis logout karena akun Anda baru saja login di tab/perangkat lain. (Tenang, daftar keranjang scan Anda tetap tersimpan aman!).");
      } else if (reason === "logged_out_all") {
        setError("🔒 Akun Anda telah dikeluarkan melalui fitur Logout All Device. Silakan login kembali di perangkat ini.");
      } else if (reason === "session_expired_cart_saved") {
        setError("🔒 Sesi login perlu disegarkan. Jangan khawatir, seluruh barang yang sudah Anda scan tetap tersimpan utuh di keranjang dan siap dikirim setelah login!");
      }
    }
  }, []);

  const router = useRouter();

  const [lockModal, setLockModal] = useState<{
    open: boolean;
    message: string;
    lastActive: string | null;
    canDeveloperLogoutAll: boolean;
    confirmRecovery: boolean;
    recovering: boolean;
  }>({
    open: false,
    message: "",
    lastActive: null,
    canDeveloperLogoutAll: false,
    confirmRecovery: false,
    recovering: false,
  });

  const handleDeveloperRecoveryLogoutAll = async () => {
    if (lockModal.recovering) return;
    setLockModal((prev) => ({ ...prev, recovering: true }));
    setError("");
    setInfoNotice("");

    try {
      const res = await fetch("/api/auth/logout-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "developer_recovery", nik, pin }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLockModal({
          open: false,
          message: "",
          lastActive: null,
          canDeveloperLogoutAll: false,
          confirmRecovery: false,
          recovering: false,
        });
        setInfoNotice("✅ Semua sesi akun Developer telah di-logout. Anda kini dapat menekan tombol Masuk Shift.");
      } else {
        setError(data.error || "Gagal memproses Logout All Device akun Developer.");
        setLockModal((prev) => ({ ...prev, recovering: false, confirmRecovery: false }));
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat memproses Logout All Device.");
      setLockModal((prev) => ({ ...prev, recovering: false, confirmRecovery: false }));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setLoading(true);
    setError("");
    setInfoNotice("");
    setNotWorkingAlert(false);

    try {
      // Untuk Crew Store (bukan SPV / Developer): wajib ambil & verifikasi lokasi GPS HP terlebih dahulu
      let activeCoords = geoCoords;
      if (!isBypassLocation) {
        if (!activeCoords) {
          activeCoords = await requestGpsLocation();
        }
        if (!activeCoords) {
          setError(
            geoStatus === "timeout"
              ? "Sinyal GPS belum terbaca di dalam ruangan. Pastikan Lokasi/GPS HP aktif lalu ketuk tombol 'Izinkan & Deteksi Lokasi' di bawah."
              : "Izin lokasi (GPS) belum terbaca. Ketuk tombol 'Izinkan & Deteksi Lokasi' di bawah untuk memunculkan izin lokasi."
          );
          setLoading(false);
          return;
        }
        const localGeo = verifyStoreGeofence(activeCoords.lat, activeCoords.lng, activeCoords.accuracy, toko);
        if (!localGeo || !localGeo.allowed) {
          setError("Kamu sedang tidak bekerja");
          setNotWorkingAlert(true);
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nik,
          pin,
          jobTitle,
          location: activeCoords,
        }),
      });

      const data = await res.json();
      
      if (res.status === 409 && data.isAlreadyLoggedIn) {
        setLockModal({
          open: true,
          message:
            data.error ||
            "Akun ini masih aktif (login) di perangkat lain. Silakan logout terlebih dahulu di perangkat sebelumnya agar bisa login di perangkat ini.",
          lastActive: data.lastActive || null,
          canDeveloperLogoutAll: Boolean(data.canDeveloperLogoutAll),
          confirmRecovery: false,
          recovering: false,
        });
        setLoading(false);
        return;
      }

      if (res.status === 403 && data.outsideWorkArea) {
        setError("Kamu sedang tidak bekerja");
        setNotWorkingAlert(true);
        setLoading(false);
        return;
      }
      
      if (res.ok) {
        if (data.redirectMds || data.redirectUrl) {
          setLoading(true);
          window.location.href = data.redirectUrl || "https://storehub.mdsretailing.id/login?next=%2F";
          return;
        }

        if (pin === "123456") {
          setLoginRole(data.role);
          setShowChangePin(true);
          setLoading(false);
        } else {
          if (data.role === "SUPERVISOR") {
            performExit("/spv-gateway");
          } else if (jobTitle === "Gudang Stock") {
            performExit("/warehouse");
          } else {
            performExit("/");
          }
        }
      } else {
        setError(data.error || "Gagal login");
        setLoading(false);
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan");
      setLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (newPin.length < 4) {
      setError("PIN baru minimal 4 angka");
      return;
    }
    
    setChangingPin(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin })
      });
      
      const data = await res.json();
      if (res.ok) {
        setLoading(true);
        if (loginRole === "SUPERVISOR") {
          performExit("/spv-gateway");
        } else if (jobTitle === "Gudang Stock") {
          performExit("/warehouse");
        } else {
          performExit("/");
        }
      } else {
        setError(data.error || "Gagal mengubah PIN");
        setChangingPin(false);
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan");
      setChangingPin(false);
    }
  };

  return (
    <div id="login-stage" className="login-stage relative min-h-screen flex flex-col p-4">
      {/* Background Stars (Optional extra effect) */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="page-stars" id="pageStars">
          {mounted && stars.map((s, i) => (
            <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }}></span>
          ))}
        </div>
      </div>

      <div className="flex-grow shrink-0 min-h-[2rem]"></div>

      {showChangePin ? (
        <div className="relative z-20 mx-auto bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-white/40 shrink-0 animate-in zoom-in-95 duration-300">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black text-slate-800">Ubah PIN Default</h2>
            <p className="text-sm text-slate-500 mt-2">Demi keamanan, silakan ganti PIN Anda sebelum melanjutkan.</p>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleChangePin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN Baru</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                maxLength={6}
                className="w-full border border-gray-300 rounded-lg p-3 text-lg tracking-widest text-center font-mono bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newPin.length >= 4 && !changingPin) {
                      (e.target as HTMLElement).blur();
                      handleChangePin(e);
                    }
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-2 text-center">Gunakan kombinasi angka yang mudah diingat.</p>
            </div>
            
            <button
              type="submit"
              disabled={changingPin || newPin.length < 4}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black py-4 rounded-xl mt-6 shadow-lg shadow-green-500/30 hover:shadow-green-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPin ? "MENYIMPAN..." : "SIMPAN & LANJUTKAN"}
            </button>
          </form>
        </div>
      ) : (
        <div className="relative z-20 mx-auto bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-white/40 shrink-0">
          <div className="text-center mb-8 flex flex-col items-center">
            <img src="/suko-logo.png" alt="SUKO Logo" className="h-20 mb-4 object-contain drop-shadow-md" />
            <p className="text-gray-500 text-sm font-medium">Masuk untuk memulai shift Anda</p>
          </div>

        {infoNotice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-lg text-sm mb-4 text-center whitespace-normal break-words font-medium">
            {infoNotice}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs sm:text-sm mb-4 text-center whitespace-normal break-words space-y-2">
            <p className="font-semibold">{error}</p>
            {!isBypassLocation && !geoCoords && (geoStatus === "denied" || geoStatus === "timeout" || geoStatus === "idle") && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  requestGpsLocation();
                }}
                className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Izinkan &amp; Deteksi Lokasi Sekarang</span>
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIK Karyawan</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-white text-gray-900"
              placeholder="Contoh: 123456"
              value={nik}
              onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (pinRef.current) {
                    pinRef.current.focus();
                  } else {
                    (e.target as HTMLElement).blur();
                  }
                }
              }}
            />
            {checkingNik && <p className="text-xs text-blue-600 mt-1 animate-pulse">Memeriksa NIK...</p>}
          </div>

          {toko && userName && (
            <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Karyawan</label>
                <div className="w-full border border-gray-300 rounded-lg p-3 bg-gray-50 text-gray-700 font-bold flex flex-col items-start gap-1">
                  <span className="text-lg leading-tight">{userName.replace(/\s*\(Developer\)/i, '').trim()}</span>
                  {userName.toLowerCase().includes('developer') && (
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100/70 border border-indigo-200 px-2.5 py-0.5 rounded-md tracking-wide">
                      Developer
                    </span>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Penempatan Toko</label>
                <div className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-gray-50 text-gray-500 font-bold">
                  {toko}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN (Keamanan)</label>
                <input
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  maxLength={6}
                  className="w-full border border-gray-300 rounded-lg p-3 text-lg tracking-widest text-center font-mono bg-white text-gray-900"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLElement).blur();
                      if (!loading && nik && pin.length >= 4) {
                        handleLogin(e);
                      }
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Posisi / Role</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "Cashier", icon: ShoppingCart },
                    { name: "Fitter", icon: Shirt },
                    { name: "Runner", icon: Footprints },
                    { name: "Gudang Stock", icon: Package },
                  ].map((role) => {
                    const Icon = role.icon;
                    const isSelected = jobTitle === role.name;
                    return (
                      <button
                        key={role.name}
                        type="button"
                        onClick={() => setJobTitle(role.name)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-500/20 ring-offset-1"
                            : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className={`w-6 h-6 mb-1 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                        <span className="text-[11px] font-bold tracking-wide uppercase">{role.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Verifikasi Lokasi Kerja Otomatis (menggantikan Shift Pagi/Siang manual) */}
              {isBypassLocation ? (
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div className="text-xs text-indigo-900 whitespace-normal break-words leading-snug">
                    <div className="font-extrabold">Akses SPV / Developer</div>
                    <div className="text-[11px] text-indigo-700/90">Bebas lokasi &amp; jam kerja (shift otomatis).</div>
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-xl border px-3.5 py-3 space-y-2.5 ${
                    geoStatus === "verified"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : geoStatus === "outside" || geoStatus === "denied" || geoStatus === "unsupported"
                      ? "bg-rose-50 border-rose-200 text-rose-900"
                      : geoStatus === "timeout"
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {geoStatus === "checking" ? (
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
                      ) : (
                        <MapPin
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            geoStatus === "verified"
                              ? "text-emerald-600"
                              : geoStatus === "outside" || geoStatus === "denied"
                              ? "text-rose-600"
                              : geoStatus === "timeout"
                              ? "text-amber-600"
                              : "text-slate-500"
                          }`}
                        />
                      )}
                      <div className="text-xs whitespace-normal break-words leading-snug">
                        <div className="font-extrabold">
                          {geoStatus === "checking"
                            ? "Mendeteksi lokasi HP Anda..."
                            : geoStatus === "verified"
                            ? `Lokasi Terverifikasi (${verifiedMall})`
                            : geoStatus === "outside"
                            ? "Kamu sedang tidak bekerja"
                            : geoStatus === "denied"
                            ? "Izin lokasi browser diblokir / belum diizinkan"
                            : geoStatus === "timeout"
                            ? "Sinyal GPS belum terbaca"
                            : geoStatus === "unsupported"
                            ? "Perangkat tidak mendukung GPS"
                            : geoPermissionState === "prompt"
                            ? "Perlu izin lokasi GPS untuk masuk"
                            : "Menunggu verifikasi lokasi kerja"}
                        </div>
                        <div className="text-[11px] opacity-85 mt-0.5 whitespace-normal break-words">
                          {geoStatus === "verified"
                            ? "Shift otomatis menyesuaikan jam aktif."
                            : geoStatus === "outside"
                            ? "Akses crew hanya tersedia di area toko."
                            : geoErrorDetail ||
                              "Ketuk tombol di bawah untuk mengizinkan & mendeteksi lokasi HP."}
                        </div>
                        {geoDebugInfo && geoStatus !== "verified" && (
                          <div className="text-[10px] font-mono opacity-70 mt-1 whitespace-normal break-words">
                            {geoDebugInfo}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => requestGpsLocation()}
                      className="p-2 rounded-lg bg-white/80 hover:bg-white border border-black/10 text-slate-700 cursor-pointer shrink-0 active:scale-95 transition-transform"
                      title="Cek ulang lokasi GPS"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${geoStatus === "checking" ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  {geoStatus !== "verified" && (
                    <button
                      type="button"
                      onClick={() => requestGpsLocation()}
                      className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
                    >
                      {geoStatus === "checking" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Mendeteksi... (Ketuk untuk Ulangi)</span>
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {geoStatus === "denied"
                              ? "Minta Izin Lokasi Sekarang"
                              : "Izinkan & Deteksi Lokasi Sekarang"}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || pin.length < 4 || !nik || !toko || (!isBypassLocation && geoStatus === "checking")}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 rounded-xl mt-6 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading
                  ? "MEMERIKSA..."
                  : !isBypassLocation && geoStatus === "checking"
                  ? "MEMERIKSA LOKASI..."
                  : "MULAI KERJA"}
              </button>
            </div>
          )}
        </form>
      </div>
      )}

      {/* Shortcut ke Kiosk Cek Harga Publik (Sementara di-hidden) */}
      {/* 
      <div className="relative z-20 mt-4 text-center">
        <Link 
          href="/cek-harga" 
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-full text-white text-xs font-bold border border-white/25 transition-all shadow-md active:scale-95"
        >
          <Search className="w-4 h-4 text-amber-300" />
          Hanya Mau Cek Harga? Buka Kiosk Publik &rarr;
        </Link>
      </div>
      */}

      <div className="flex-grow shrink-0 min-h-[2rem]"></div>

      <div className="text-center text-xs font-bold text-white/60 tracking-wide z-10 drop-shadow-sm pb-6 flex flex-col items-center gap-1.5">
        <div>Powered by Luqmen 😼🕶️</div>
        <div className="flex items-center gap-2 text-[10px] text-white/40 font-medium">
          <span>Max Display Pro v{APP_VERSION}</span>
          <span>•</span>
          <button 
            type="button"
            onClick={() => forceAppUpdate()}
            className="text-white/70 hover:text-white underline active:scale-95 transition-all cursor-pointer"
          >
            Perbarui Versi & Bersihkan Cache 🔄
          </button>
        </div>
      </div>

      {/* Alert Modal "Kamu sedang tidak bekerja" untuk Crew di luar area toko */}
      {notWorkingAlert && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-rose-100 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <MapPin className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-slate-900 whitespace-normal break-words">
                Kamu sedang tidak bekerja
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed whitespace-normal break-words">
                Login hanya dapat dilakukan saat berada di area lokasi kerja dan pada jam operasional toko.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotWorkingAlert(false);
                  requestGpsLocation();
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cek Ulang Lokasi
              </button>
              <button
                type="button"
                onClick={() => setNotWorkingAlert(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kunci Ketat 1 Akun = 1 Device */}
      {lockModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-[spring_.4s] border border-slate-100">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black text-slate-800 mb-2 whitespace-normal break-words leading-snug">
              Akun Aktif di Perangkat Lain (1 Akun = 1 Device)
            </h2>
            <p className="text-sm text-slate-600 mb-3 leading-relaxed whitespace-normal break-words">
              {lockModal.message}
            </p>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-900 leading-relaxed whitespace-normal break-words">
              Akun tidak dapat dipakai bersamaan di beberapa perangkat. Silakan tekan <strong>Logout</strong> pada perangkat yang sedang login terlebih dahulu (atau minta Supervisor / Developer untuk membuka kunci sesi).
              {lockModal.lastActive && (
                <div className="mt-1.5 font-mono text-[11px] text-amber-800">
                  Aktivitas terakhir:{" "}
                  {new Date(lockModal.lastActive).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  WIB
                </div>
              )}
            </div>

            {lockModal.canDeveloperLogoutAll && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-2.5">
                <div className="text-xs font-bold text-rose-800 whitespace-normal break-words">
                  Perangkat lama hilang atau cache terhapus?
                </div>
                {!lockModal.confirmRecovery ? (
                  <button
                    type="button"
                    disabled={lockModal.recovering}
                    onClick={() => setLockModal((prev) => ({ ...prev, confirmRecovery: true }))}
                    className="w-full py-2.5 px-3 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-normal break-words text-center"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Logout All Device (Khusus Developer)</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-[11px] text-rose-700 font-medium whitespace-normal break-words">
                      Konfirmasi keluarkan sesi akun Developer dari perangkat sebelumnya agar bisa login di sini?
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={lockModal.recovering}
                        onClick={() => setLockModal((prev) => ({ ...prev, confirmRecovery: false }))}
                        className="flex-1 py-2 px-2 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={lockModal.recovering}
                        onClick={handleDeveloperRecoveryLogoutAll}
                        className="flex-[2] py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-60 whitespace-normal break-words"
                      >
                        {lockModal.recovering ? "Memproses..." : "Ya, Logout Semua Sesi Developer Sekarang"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={lockModal.recovering}
              onClick={() => setLockModal((prev) => ({ ...prev, open: false, confirmRecovery: false }))}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all text-sm"
            >
              Mengerti / Tutup
            </button>
          </div>
        </div>
      )}

      {/* Full Screen Shift Loader */}
      <div 
        className={`fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center transition-all duration-700 ease-out ${loading ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"}`}
      >
        {loading && (
          <>
            <ShiftLoader />
            <p className="text-slate-800 font-bold mt-16 text-sm tracking-[0.3em] animate-pulse">MEMULAI SHIFT...</p>
          </>
        )}
      </div>
    </div>
  );
}
