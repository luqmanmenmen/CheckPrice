"use client";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { 
  Trash2, Plus, UserPlus, Store, Edit, X, LogIn, Activity, 
  History, Users, UserCheck, PauseCircle, Search, RefreshCw,
  Calendar, Clock, ShieldCheck, ArrowUpDown
} from "lucide-react";
import { AlertModal } from "@/components/AlertModal";

function formatRelativeTime(dateString: string | null | undefined): { text: string; isRecent: boolean; fullDate: string } {
  if (!dateString) return { text: "Belum pernah", isRecent: false, fullDate: "-" };
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return { text: "-", isRecent: false, fullDate: "-" };

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const fullDate = d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  if (diffSec < 60) {
    return { text: "Baru saja", isRecent: true, fullDate };
  }
  if (diffMin < 60) {
    return { text: `${diffMin} mnt lalu`, isRecent: diffMin <= 5, fullDate };
  }
  if (diffHour < 24) {
    return { text: `${diffHour} jam lalu`, isRecent: false, fullDate };
  }
  if (diffDay === 1) {
    return { text: `Kemarin, ${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`, isRecent: false, fullDate };
  }
  if (diffDay < 7) {
    return { text: `${diffDay} hari lalu`, isRecent: false, fullDate };
  }
  return { 
    text: d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }), 
    isRecent: false, 
    fullDate 
  };
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function UsersManagement() {
  const { data, error, mutate, isValidating } = useSWR("/api/admin/users", fetcher, {
    refreshInterval: 15000 // Otomatis refresh status setiap 15 detik
  });
  const { data: meData } = useSWR("/api/auth/me", fetcher);
  const isTopBoss = meData?.user?.nik === "22054178";

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "BREAK" | "OFFLINE">("ALL");

  // Form State
  const [nik, setNik] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("123456");
  const [toko, setToko] = useState("");
  const [role, setRole] = useState("CREW_STORE");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Modal Riwayat Login State
  const [logModalUser, setLogModalUser] = useState<any>(null); // null = modal tutup, "ALL" = semua riwayat, object = per user
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);

  // Modal Alert State
  const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "warning"; onConfirm?: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "warning", onConfirm?: () => void) => {
    setAlert({ isOpen: true, title, message, type, onConfirm });
  };

  const openLoginLogs = async (user: any | "ALL") => {
    setLogModalUser(user);
    setLogsLoading(true);
    try {
      const url = user === "ALL" 
        ? "/api/admin/users/login-logs?limit=100" 
        : `/api/admin/users/login-logs?userId=${user.id}&limit=100`;
      const res = await fetch(url);
      const resData = await res.json();
      if (resData.success) {
        setLoginLogs(resData.logs || []);
        setLogsTotal(resData.total || 0);
      } else {
        setLoginLogs([]);
        setLogsTotal(0);
      }
    } catch (err) {
      console.error("Gagal load login logs:", err);
      setLoginLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, name, pin, toko, role })
      });
      
      const resData = await res.json();
      if (res.ok) {
        showAlert("Berhasil", `Karyawan ${name} berhasil ditambahkan!`, "success");
        setNik("");
        setName("");
        setToko("");
        setShowAddForm(false);
        mutate();
      } else {
        showAlert("Gagal", resData.error || "Gagal menambahkan karyawan", "error");
      }
    } catch (err) {
      showAlert("Error", "Terjadi kesalahan jaringan", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingUser.id, name: editingUser.name, pin: editingUser.pin, toko: editingUser.toko, role: editingUser.role })
      });
      
      const resData = await res.json();
      if (res.ok) {
        showAlert("Berhasil", `Data Karyawan ${editingUser.name} berhasil diperbarui!`, "success");
        setEditingUser(null);
        mutate();
      } else {
        showAlert("Gagal", resData.error || "Gagal memperbarui karyawan", "error");
      }
    } catch (err) {
      showAlert("Error", "Terjadi kesalahan jaringan", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: string, userName: string) => {
    showAlert(
      "Hapus Karyawan?", 
      `Apakah Anda yakin ingin menghapus akun ${userName}? Data yang sudah dihapus tidak dapat dikembalikan.`, 
      "warning",
      () => handleDeleteUser(id)
    );
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, {
        method: "DELETE"
      });
      
      const resData = await res.json();
      if (res.ok) {
        showAlert("Berhasil", "Akun karyawan berhasil dihapus.", "success");
        mutate();
      } else {
        showAlert("Gagal", resData.error || "Gagal menghapus karyawan", "error");
      }
    } catch (err) {
      showAlert("Error", "Terjadi kesalahan jaringan", "error");
    }
  };

  const rawUsers = (data?.users || []).filter((u: any) => u.nik !== "22054178");

  // Summary Metrics
  const onlineCount = rawUsers.filter((u: any) => u.status === "ACTIVE").length;
  const breakCount = rawUsers.filter((u: any) => u.status === "BREAK").length;
  const offlineCount = rawUsers.filter((u: any) => u.status === "OFFLINE").length;
  const totalLoginsCount = rawUsers.reduce((sum: number, u: any) => sum + (u.loginCount || 0), 0);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return rawUsers.filter((u: any) => {
      const matchSearch = 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.nik.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.toko && u.toko.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (statusFilter === "ONLINE") return u.status === "ACTIVE";
      if (statusFilter === "BREAK") return u.status === "BREAK";
      if (statusFilter === "OFFLINE") return u.status === "OFFLINE";
      return true;
    });
  }, [rawUsers, searchQuery, statusFilter]);

  if (error) return <div className="p-8 text-red-500 font-bold">Gagal memuat data pengguna. Silakan segarkan halaman.</div>;
  if (!data) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Header Title & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Manajemen Karyawan</h1>
            <button 
              onClick={() => mutate()} 
              disabled={isValidating}
              className={`p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ${isValidating ? 'animate-spin' : ''}`}
              title="Segarkan Data Real-Time"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Monitoring kehadiran real-time, rekap frekuensi login, dan kelola penempatan toko karyawan.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={() => openLoginLogs("ALL")}
            className="flex-1 md:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-sm transition-colors shadow-xs"
          >
            <History className="w-4 h-4 text-slate-500" />
            Rekap Semua Login
          </button>

          {isTopBoss && (
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-xs flex items-center justify-center gap-2 text-sm transition-colors"
            >
              {showAddForm ? "Batal Tambah" : <><UserPlus className="w-4 h-4" /> Tambah Karyawan</>}
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards: Monitoring Real-Time & Rekap Login */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{rawUsers.length}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Karyawan</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-xs border border-emerald-100 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700">{onlineCount}</div>
            <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Online Sekarang</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-xs border border-amber-100 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <PauseCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700">{breakCount}</div>
            <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Sedang Rehat</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-xs border border-blue-100 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-blue-700">{totalLoginsCount}x</div>
            <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Total Rekap Login</div>
          </div>
        </div>
      </div>

      {/* Form Tambah Karyawan */}
      {showAddForm && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-blue-100 animate-in slide-in-from-top-4 duration-300">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600"/> Tambah Karyawan Baru
          </h2>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">NIK (Nomor Induk)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" required value={nik} onChange={e => setNik(e.target.value.replace(/\D/g, ''))} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Contoh: 123456" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nama Lengkap</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nama Karyawan" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">PIN Default</label>
              <input type="text" required value={pin} onChange={e => setPin(e.target.value)} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-slate-600 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Penempatan Toko</label>
              <div className="relative">
                <Store className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" required value={toko} onChange={e => setToko(e.target.value)} className="w-full pl-9 p-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Contoh: TOKO MANGGA DUA" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Hak Akses Tetap</label>
              <select value={role} onChange={e => setRole(e.target.value)} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="CREW_STORE">CREW STORE (Karyawan Toko/Gudang)</option>
                <option value="SUPERVISOR">SUPERVISOR (Spv / Leader)</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Catatan: Posisi spesifik akan dipilih karyawan saat Login.</p>
            </div>
            
            <div className="md:col-span-2 mt-2">
              <button disabled={loading} type="submit" className="bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors w-full md:w-auto disabled:opacity-50">
                {loading ? "Menyimpan..." : "Simpan Karyawan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Form Edit Karyawan */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2"><Edit className="w-5 h-5 text-indigo-600"/> Edit Karyawan ({editingUser.nik})</h2>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleEditUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nama Lengkap</label>
                <input type="text" required value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">PIN (Password)</label>
                <input type="text" required value={editingUser.pin} onChange={e => setEditingUser({...editingUser, pin: e.target.value})} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Penempatan Toko</label>
                <div className="relative">
                  <Store className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" required value={editingUser.toko || ""} onChange={e => setEditingUser({...editingUser, toko: e.target.value})} className="w-full pl-9 p-2.5 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Hak Akses Tetap</label>
                <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="CREW_STORE">CREW STORE</option>
                  <option value="SUPERVISOR">SUPERVISOR</option>
                </select>
              </div>
              <div className="md:col-span-2 mt-4 flex gap-3">
                <button disabled={loading} type="submit" className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-indigo-700 transition-colors flex-1 disabled:opacity-50">
                  {loading ? "Menyimpan..." : "Update Data"}
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="bg-slate-100 text-slate-700 font-bold py-3 px-6 rounded-xl hover:bg-slate-200 transition-colors">
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama, NIK, atau penempatan toko..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600 self-start sm:self-auto">
          <button 
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'ALL' ? 'bg-white text-slate-800 shadow-xs' : 'hover:text-slate-900'}`}
          >
            Semua ({rawUsers.length})
          </button>
          <button 
            onClick={() => setStatusFilter("ONLINE")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${statusFilter === 'ONLINE' ? 'bg-emerald-600 text-white shadow-xs' : 'hover:text-emerald-700'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Online ({onlineCount})
          </button>
          <button 
            onClick={() => setStatusFilter("BREAK")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${statusFilter === 'BREAK' ? 'bg-amber-600 text-white shadow-xs' : 'hover:text-amber-700'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Rehat ({breakCount})
          </button>
          <button 
            onClick={() => setStatusFilter("OFFLINE")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'OFFLINE' ? 'bg-slate-700 text-white shadow-xs' : 'hover:text-slate-800'}`}
          >
            Offline ({offlineCount})
          </button>
        </div>
      </div>

      {/* Tabel Karyawan */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase font-bold">
              <tr>
                <th className="p-4">NIK</th>
                <th className="p-4">Nama</th>
                <th className="p-4">PIN</th>
                <th className="p-4">Toko</th>
                <th className="p-4">Hak Akses</th>
                <th className="p-4">Kehadiran (Real-Time)</th>
                <th className="p-4">Frekuensi Login</th>
                <th className="p-4">Terakhir Login</th>
                <th className="p-4">Aktivitas Terakhir</th>
                <th className="p-4">Terdaftar</th>
                {isTopBoss && <th className="p-4 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user: any) => {
                const loginTime = formatRelativeTime(user.lastLogin);
                const activeTime = formatRelativeTime(user.lastActive);
                return (
                <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-700">{user.nik}</td>
                  <td className="p-4 font-bold text-slate-800">{user.name}</td>
                  <td className="p-4 font-mono text-slate-500 bg-slate-50 rounded-lg px-2 text-xs">{user.pin}</td>
                  <td className="p-4">
                    {user.toko ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-xs border border-indigo-100">
                        <Store className="w-3 h-3" />
                        {user.toko}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Belum di-set</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${user.role === 'SUPERVISOR' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {user.role === 'SUPERVISOR' ? 'SUPERVISOR' : user.role === 'CREW_STORE' ? 'CREW STORE' : user.role}
                    </span>
                  </td>
                  
                  {/* Status Kehadiran Terverifikasi Real-Time */}
                  <td className="p-4">
                    {user.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Online (Aktif)
                      </span>
                    ) : user.status === 'BREAK' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Sedang Rehat
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        Offline
                      </span>
                    )}
                  </td>

                  {/* Frekuensi & Rekap Login */}
                  <td className="p-4">
                    <button
                      onClick={() => openLoginLogs(user)}
                      className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200/80 transition-all active:scale-95 shadow-2xs"
                      title="Klik untuk melihat catatan riwayat login lengkap"
                    >
                      <History className="w-3.5 h-3.5 text-blue-500 group-hover:rotate-[-45deg] transition-transform" />
                      <span className="font-mono">{user.loginCount || 0}x Login</span>
                    </button>
                  </td>

                  {/* Terakhir Login (Masuk Akun) */}
                  <td className="p-4">
                    <div className="flex flex-col" title={`Login: ${loginTime.fullDate}`}>
                      <span className="font-semibold text-slate-700 text-xs flex items-center gap-1">
                        <LogIn className="w-3.5 h-3.5 text-blue-500" />
                        {loginTime.text}
                      </span>
                      {user.lastLogin && (
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {new Date(user.lastLogin).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Terakhir Aktif (Menggunakan Sistem) */}
                  <td className="p-4">
                    <div className="flex flex-col" title={`Aktivitas Terakhir: ${activeTime.fullDate}`}>
                      {user.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Sedang Buka App
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-600 text-xs flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-slate-400" />
                          {activeTime.text}
                        </span>
                      )}
                      {user.lastActive && user.status !== 'ACTIVE' && (
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {new Date(user.lastActive).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 text-xs text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}
                  </td>

                  {isTopBoss && (
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => setEditingUser(user)}
                        className="text-indigo-500 hover:text-indigo-700 p-2 hover:bg-indigo-50 rounded-lg transition-colors mr-1"
                        title="Edit Pengguna"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => confirmDelete(user.id, user.name)}
                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus Pengguna"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                    {searchQuery ? "Tidak ditemukan karyawan yang sesuai pencarian" : "Belum ada karyawan terdaftar"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Riwayat & Catatan Rekap Login */}
      {logModalUser !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    {logModalUser === "ALL" ? "Rekap Seluruh Riwayat Login" : `Catatan Login: ${logModalUser.name}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {logModalUser === "ALL" 
                      ? "Daftar seluruh sesi login karyawan di toko" 
                      : `NIK: ${logModalUser.nik} • Toko: ${logModalUser.toko || "Belum di-set"} • Total: ${logModalUser.loginCount || 0}x Login`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setLogModalUser(null)}
                className="text-slate-400 hover:text-slate-600 bg-white border border-slate-200 p-2 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content / Table */}
            <div className="p-5 overflow-y-auto flex-1">
              {logsLoading ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="text-xs font-semibold">Memuat rekapan login...</span>
                </div>
              ) : loginLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                  <History className="w-8 h-8 text-slate-300" />
                  <p className="text-sm font-semibold">Belum ada catatan riwayat login yang terekam.</p>
                  <p className="text-xs text-slate-400">Setiap login baru akan otomatis dicatat dan direkap di sini.</p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100">
                      <tr>
                        <th className="p-3">Waktu Login</th>
                        {logModalUser === "ALL" && <th className="p-3">Karyawan</th>}
                        <th className="p-3">Shift</th>
                        <th className="p-3">Posisi Kerja</th>
                        <th className="p-3">Penempatan</th>
                        <th className="p-3">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loginLogs.map((log: any) => {
                        const rel = formatRelativeTime(log.createdAt);
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-slate-800">{rel.fullDate}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{rel.text}</div>
                            </td>
                            {logModalUser === "ALL" && (
                              <td className="p-3">
                                <div className="font-bold text-slate-800">{log.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{log.nik}</div>
                              </td>
                            )}
                            <td className="p-3">
                              {log.shift ? (
                                <span className={`inline-flex px-2 py-0.5 rounded-md font-bold text-[11px] border ${log.shift === 1 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                  Shift {log.shift}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Non-Shift</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="font-semibold text-slate-700">
                                {log.jobTitle || (log.role === 'SUPERVISOR' ? 'Supervisor' : 'Sales Area')}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600">
                              {log.toko || "-"}
                            </td>
                            <td className="p-3 text-slate-400 font-mono text-[10px]">
                              {log.ipAddress ? `IP: ${log.ipAddress}` : "App Login"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
              <span>Menampilkan {loginLogs.length} dari total {logsTotal} catatan login</span>
              <button
                onClick={() => setLogModalUser(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal 
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onClose={() => setAlert(prev => ({ ...prev, isOpen: false }))}
        onConfirm={alert.onConfirm}
      />
    </div>
  );
}
