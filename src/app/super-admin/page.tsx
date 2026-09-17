"use client";

import { useState, useEffect } from "react";
import { UserCircle2, LogOut, Search, Activity, PauseCircle } from "lucide-react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";

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

      {/* Users List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 bg-slate-100 border-b border-slate-200">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daftar Karyawan</h2>
        </div>
        
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Tidak ada karyawan ditemukan.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredUsers.filter(u => u.role !== 'SUPER_ADMIN').map((user) => (
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
