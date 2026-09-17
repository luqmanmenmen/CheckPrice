"use client";

import { useState, useEffect, useRef } from "react";
import { UserCircle2, CheckCircle2, XCircle, Clock } from "lucide-react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Ticket = {
  id: string;
  sku: string;
  size: string | null;
  qty: number | null;
  type: "REQUEST" | "STOCK_CHECK";
  status: "PENDING" | "READY" | "OOS" | "COMPLETED";
  createdAt: string;
  requester: { name: string; nik: string };
};

export default function WarehouseDashboard() {
  const [user, setUser] = useState<any>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const previousTicketIds = useRef<Set<string>>(new Set());

  // Fetch tickets every 5 seconds
  const { data, mutate } = useSWR("/api/tickets", fetcher, { refreshInterval: 5000 });
  const tickets: Ticket[] = data?.tickets || [];

  // Fetch current user details
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      });
  }, []);

  // Check for new tickets and play notification sound
  useEffect(() => {
    if (!tickets.length || !user || user.status === "BREAK") return;

    const currentTicketIds = new Set(tickets.map(t => t.id));
    
    let hasNewTicket = false;
    for (const id of currentTicketIds) {
      if (!previousTicketIds.current.has(id)) {
        hasNewTicket = true;
        break;
      }
    }

    if (hasNewTicket && previousTicketIds.current.size > 0) {
      playTingTong();
    }

    previousTicketIds.current = currentTicketIds;
  }, [tickets, user]);

  const playTingTong = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(659.25, now, 0.5); // Ting (E5)
      playTone(523.25, now + 0.4, 0.7); // Tong (C5)
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  };

  const handleLogoutClick = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const toggleStatus = async () => {
    if (!user || togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = user.status === "ACTIVE" ? "BREAK" : "ACTIVE";
    try {
      const res = await fetch("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setUser({ ...user, status: data.status });
      }
    } catch (error) {
      console.error("Failed to toggle status:", error);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleTicketAction = async (ticketId: string, status: "READY" | "OOS", reason?: string) => {
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status, reason }),
      });
      mutate(); // Optimistic refresh
    } catch (error) {
      console.error("Failed to update ticket:", error);
    }
  };

  if (!user) {
    return <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-4 text-white flex justify-between items-start shadow-lg">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-sm">
            <UserCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs text-blue-200 font-medium tracking-wide uppercase">{user.jobTitle || 'Gudang Stock'}</p>
            <h1 className="font-bold text-lg leading-tight">{user.name} <span className="text-blue-200 font-normal">({user.nik})</span></h1>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="scale-75 origin-right">
            <AnimatedLogoutButton onLogout={handleLogoutClick} />
          </div>
          <div 
            className={`relative flex p-0.5 rounded-full shadow-inner w-32 h-7 cursor-pointer border transition-colors ${togglingStatus ? 'opacity-50 pointer-events-none' : ''} ${user.status === 'ACTIVE' ? 'bg-slate-800/20 border-slate-700/30' : 'bg-slate-800/40 border-slate-700/50'}`} 
            onClick={toggleStatus}
          >
            {/* Animated Pill Background */}
            <div 
              className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full shadow-sm transition-all duration-300 ease-in-out ${user.status === 'ACTIVE' ? 'bg-green-500 left-0.5' : 'bg-amber-500 left-[50%]'}`}
            />
            <div className={`relative flex-1 flex items-center justify-center text-[10px] font-bold z-10 transition-colors duration-300 ${user.status === 'ACTIVE' ? 'text-white' : 'text-slate-200'}`}>
              AKTIF
            </div>
            <div className={`relative flex-1 flex items-center justify-center text-[10px] font-bold z-10 transition-colors duration-300 ${user.status === 'BREAK' ? 'text-white' : 'text-slate-200'}`}>
              REHAT
            </div>
          </div>
        </div>
      </div>

      {/* Ticket List */}
      <div>
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
          Tiket Masuk 
          {tickets.filter(t => t.status === "PENDING").length > 0 && (
            <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">
              {tickets.filter(t => t.status === "PENDING").length} Baru
            </span>
          )}
        </h2>

        {tickets.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>Tidak ada tiket pending.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tickets.map((ticket) => (
              <div 
                key={ticket.id} 
                className={`bg-white p-4 rounded-xl shadow-sm border-l-4 transition-all ${
                  ticket.status === "PENDING" ? "border-l-blue-500" : "border-l-green-500 opacity-60"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                      ticket.type === "REQUEST" ? "bg-indigo-100 text-indigo-700" : "bg-sky-100 text-sky-700"
                    }`}>
                      {ticket.type === "REQUEST" ? "Request Barang" : "Cek Stok"}
                    </span>
                    <h3 className="font-black text-xl text-slate-800 mt-2">{ticket.sku}</h3>
                    <p className="text-sm text-slate-500">
                      SA: <span className="font-semibold text-slate-700">{ticket.requester.name}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                      <Clock className="w-3 h-3" />
                      {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {ticket.qty && (
                      <div className="mt-2 text-sm font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                        Qty: {ticket.qty}
                      </div>
                    )}
                  </div>
                </div>

                {ticket.status === "PENDING" ? (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button 
                      onClick={() => handleTicketAction(ticket.id, "READY")}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Ready
                    </button>
                    <button 
                      onClick={() => {
                        const reason = prompt("Masukkan alasan kosong (opsional):", "");
                        if (reason !== null) {
                          handleTicketAction(ticket.id, "OOS", reason);
                        }
                      }}
                      className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors border border-red-200"
                    >
                      <XCircle className="w-4 h-4" /> Kosong (OOS)
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase tracking-wider">
                      Menunggu diambil oleh SA
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
