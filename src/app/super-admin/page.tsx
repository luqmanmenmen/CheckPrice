"use client";

import { useState, useEffect } from "react";
import { UserCircle2, LogOut, Search, Activity, PauseCircle, Database, PackagePlus, DollarSign, FileSpreadsheet, ChevronRight, Boxes, TrendingUp, Tag, PackageSearch, Sparkles } from "lucide-react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";
import Link from "next/link";

type User = {
  id: number;
  nik: string;
  name: string;
  role: string;
  status: string;
  lastActive: string | null;
};

export default function SuperAdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // Poll every 10 seconds
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogoutClick = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nik.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 text-white flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
            <UserCircle2 className="w-6 h-6 text-slate-300" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">Super Admin</p>
            <h1 className="font-bold text-lg leading-tight">Master Control</h1>
          </div>
        </div>
        <div className="scale-75 origin-right">
          <AnimatedLogoutButton onLogout={handleLogoutClick} />
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mb-1">
            <Activity className="w-4 h-4 text-green-600" />
          </div>
          <span className="text-2xl font-black text-slate-800">
            {users.filter(u => u.status === 'ACTIVE' && u.role !== 'SUPER_ADMIN').length}
          </span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Staf Aktif</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mb-1">
            <PauseCircle className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-2xl font-black text-slate-800">
            {users.filter(u => u.status === 'BREAK' && u.role !== 'SUPER_ADMIN').length}
          </span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sedang Rehat</span>
        </div>
      </div>

      {/* Manajemen Data Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800">Manajemen Data</h2>
        </div>
        <div className="flex flex-col gap-3">
          {/* Menu Karyawan */}
          <Link href="/super-admin/users" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-purple-50 hover:border-purple-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <UserCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Manajemen Karyawan</p>
                <p className="text-[10px] text-slate-500">Daftarkan akun, PIN, dan Toko Karyawan</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-colors" />
          </Link>

          {/* Menu Harian */}
          <Link href="/super-admin/sinkronisasi-harian" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Sinkronisasi Harian (PQ)</p>
                <p className="text-[10px] text-slate-500">Update Produk Baru, Stok Sisa (EOH), dan Status Fast/Slow Move</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </Link>

          {/* Menu Mingguan */}
          <Link href="/super-admin/update-promo" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Update Harga & Promo</p>
                <p className="text-[10px] text-slate-500">Sinkronisasi harga mingguan (Rabu Malam)</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </Link>
        </div>
      </div>

      {/* Laporan & Analitik Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-rose-600" />
          <h2 className="font-bold text-slate-800">Laporan & Analitik</h2>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/super-admin/laporan-penjualan" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Laporan Penjualan (Sales)</p>
                <p className="text-[10px] text-slate-500">Omzet dan daftar barang terjual dari upload PQ terakhir</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-cyan-600 transition-colors" />
          </Link>

          <Link href="/super-admin/saran-po" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Inbox Saran PO</p>
                <p className="text-[10px] text-slate-500">Rekomendasi pesanan AI (Syarat: 14 Hari Data)</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </Link>

          <Link href="/super-admin/rekap-pergerakan" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-rose-50 hover:border-rose-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Rekap Pergerakan</p>
                <p className="text-[10px] text-slate-500">Analisis Fast Move & Slow Move</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-rose-600 transition-colors" />
          </Link>

          <Link href="/super-admin/rekap-promo" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-fuchsia-50 hover:border-fuchsia-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Rekap Promo Aktif</p>
                <p className="text-[10px] text-slate-500">Daftar semua barang yang sedang diskon</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-fuchsia-600 transition-colors" />
          </Link>

          <Link href="/super-admin/rekap-stok" className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-amber-50 hover:border-amber-100 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <PackageSearch className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Rekap Stok</p>
                <p className="text-[10px] text-slate-500">Lihat sisa stok seluruh barang</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-600 transition-colors" />
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Cari nama atau NIK..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-shadow shadow-sm"
        />
      </div>

      {/* Staff On Duty List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 bg-slate-100 border-b border-slate-200">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Staff On Duty</h2>
        </div>
        
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredUsers.filter(u => u.role !== 'SUPER_ADMIN' && u.status !== 'INACTIVE').length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Tidak ada staff yang sedang bertugas.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredUsers.filter(u => u.role !== 'SUPER_ADMIN' && u.status !== 'INACTIVE').map((user) => (
              <div key={user.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 text-sm">{user.name}</span>
                  <span className="text-xs text-slate-500 font-medium">{user.nik} &bull; {user.role === 'SA' ? 'Sales Area' : 'Gudang'}</span>
                </div>
                <div>
                  <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
                    user.status === 'ACTIVE' 
                      ? 'bg-green-50 text-green-600 border-green-200' 
                      : 'bg-amber-50 text-amber-600 border-amber-200'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    {user.status === 'ACTIVE' ? 'Aktif' : 'Rehat'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
