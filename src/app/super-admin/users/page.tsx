"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { Trash2, Plus, UserPlus, Store } from "lucide-react";
import { AlertModal } from "@/components/AlertModal";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function UsersManagement() {
  const { data, error, mutate } = useSWR("/api/admin/users", fetcher);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [nik, setNik] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("123456");
  const [toko, setToko] = useState("");
  const [role, setRole] = useState("SA");
  const [showAddForm, setShowAddForm] = useState(false);

  // Modal State
  const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "warning"; onConfirm?: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "warning", onConfirm?: () => void) => {
    setAlert({ isOpen: true, title, message, type, onConfirm });
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

  if (error) return <div className="p-8 text-red-500">Gagal memuat data pengguna.</div>;
  if (!data) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  const users = data.users || [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Manajemen Karyawan</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola akses, PIN default, dan penempatan toko karyawan.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm flex items-center gap-2 text-sm transition-colors"
        >
          {showAddForm ? "Batal Tambah" : <><UserPlus className="w-4 h-4" /> Tambah Karyawan</>}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border animate-in slide-in-from-top-4 duration-300">
          <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><Plus className="w-5 h-5 text-blue-600"/> Tambah Karyawan Baru</h2>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">NIK (Nomor Induk)</label>
              <input type="text" required value={nik} onChange={e => setNik(e.target.value)} className="w-full p-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Contoh: 123456" />
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
                <option value="SA">Karyawan Biasa (SPG/Gudang)</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Catatan: Posisi spesifik (Cashier/Fitter/Gudang) akan dipilih karyawan saat Login.</p>
            </div>
            
            <div className="md:col-span-2 mt-2">
              <button disabled={loading} type="submit" className="bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors w-full md:w-auto disabled:opacity-50">
                {loading ? "Menyimpan..." : "Simpan Karyawan"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b text-slate-500 text-xs uppercase font-bold">
              <tr>
                <th className="p-4">NIK</th>
                <th className="p-4">Nama</th>
                <th className="p-4">Toko</th>
                <th className="p-4">Hak Akses</th>
                <th className="p-4">Terdaftar</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user: any) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-700">{user.nik}</td>
                  <td className="p-4 font-bold text-slate-800">{user.name}</td>
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
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${user.role === 'SUPER_ADMIN' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => confirmDelete(user.id, user.name)}
                      className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Hapus Pengguna"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">Belum ada karyawan terdaftar</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
