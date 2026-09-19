"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { UserCircle2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, PackageOpen } from "lucide-react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";
import PullToRefresh from "@/components/PullToRefresh";
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
  productName?: string;
  hargaNormal?: number;
};

export default function WarehouseDashboard() {
  const [user, setUser] = useState<any>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const previousTicketIds = useRef<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [batchSelections, setBatchSelections] = useState<Record<string, "READY" | "OOS">>({});

  // Fetch tickets every 10 seconds to reduce DB load
  const { data, mutate } = useSWR("/api/tickets", fetcher, { refreshInterval: 10000 });
  const tickets: Ticket[] = data?.tickets || [];

  // Fetch current user details
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      });
  }, []);

  // Group tickets by createdAt + requester.nik
  const ticketGroups = useMemo(() => {
    const groups = new Map<string, {
      id: string;
      createdAt: string;
      requester: { name: string; nik: string };
      tickets: Ticket[];
      hasPending: boolean;
    }>();

    tickets.forEach(ticket => {
      // Create a key using timestamp (down to seconds to catch slight ms differences) and NIK
      const timeKey = new Date(ticket.createdAt).setMilliseconds(0);
      const key = `${timeKey}_${ticket.requester.nik}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          createdAt: ticket.createdAt,
          requester: ticket.requester,
          tickets: [],
          hasPending: false
        });
      }
      
      const group = groups.get(key)!;
      group.tickets.push(ticket);
      if (ticket.status === "PENDING") {
        group.hasPending = true;
      }
    });

    return Array.from(groups.values());
  }, [tickets]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Check for new tickets and play notification sound
  function playTingTong() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }

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

  const handleLogoutClick = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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

  const handleBatchSubmit = async (groupId: string, tickets: Ticket[]) => {
    const updates = tickets
      .filter(t => t.status === "PENDING" && batchSelections[t.id])
      .map(t => ({
        ticketId: t.id,
        status: batchSelections[t.id],
        reason: batchSelections[t.id] === "OOS" ? "Kosong (Batch)" : undefined
      }));

    if (updates.length === 0) {
      alert("Pilih status (Ready / Kosong) untuk minimal satu barang sebelum memproses.");
      return;
    }

    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      mutate();
      
      setBatchSelections(prev => {
        const next = { ...prev };
        updates.forEach(u => delete next[u.ticketId]);
        return next;
      });
    } catch (error) {
      console.error("Failed to batch update tickets:", error);
    }
  };

  if (!user) {
    return <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">Memuat...</div>;
  }

  return (
    <PullToRefresh onRefresh={() => mutate()}>
      <div className="flex flex-col w-full pb-6 max-w-7xl mx-auto">
        {/* User Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 lg:rounded-2xl p-5 pt-8 lg:pt-5 pb-6 shadow-md rounded-b-3xl flex justify-between items-start text-white mb-5">
          <div className="flex items-start gap-3">
              <div className="w-10 h-10 mt-1 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30 shrink-0">
                <UserCircle2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col items-start gap-2.5">
                <div>
                  <p className="text-xs text-blue-200 font-medium tracking-wide uppercase">{user.jobTitle || 'Gudang Stock'}</p>
                  <h1 className="font-bold text-lg leading-tight">{user.name} <span className="text-blue-200 font-normal">({user.nik})</span></h1>
                </div>
                <div 
                  className={`relative flex p-0.5 rounded-full shadow-inner w-32 h-7 cursor-pointer border transition-colors ${togglingStatus ? 'opacity-50 pointer-events-none' : ''} ${user.status === 'ACTIVE' ? 'bg-slate-800/20 border-slate-700/30' : 'bg-slate-800/40 border-slate-700/50'}`} 
                  onClick={toggleStatus}
                >
                  {/* Animated Pill Background */}
                  <div 
                    className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full shadow-sm transition-all duration-300 ease-in-out ${user.status === 'ACTIVE' ? 'bg-green-500 left-0.5' : 'bg-amber-500 left-[50%]'}`}
                  />
                  <div className={`relative flex-1 flex items-center justify-center text-[10px] font-bold z-10 transition-colors duration-300 ${user.status === 'ACTIVE' ? 'text-white' : 'text-slate-500'}`}>
                    AKTIF
                  </div>
                  <div className={`relative flex-1 flex items-center justify-center text-[10px] font-bold z-10 transition-colors duration-300 ${user.status === 'BREAK' ? 'text-white' : 'text-slate-500'}`}>
                    REHAT
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="scale-80 origin-top-right">
                <AnimatedLogoutButton onLogout={handleLogoutClick} />
              </div>
            </div>
          </div>

      {/* Ticket List */}
      <div className="px-4 lg:px-0 flex flex-col gap-5">
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
          Tiket Masuk 
          {tickets.filter(t => t.status === "PENDING").length > 0 && (
            <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">
              {tickets.filter(t => t.status === "PENDING").length} Baru
            </span>
          )}
        </h2>

        {ticketGroups.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>Tidak ada tiket pending.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {ticketGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.id);
              const pendingCount = group.tickets.filter(t => t.status === "PENDING").length;

              return (
                <div 
                  key={group.id} 
                  className={`bg-white rounded-xl shadow-sm border-l-4 transition-all ${
                    group.hasPending ? "border-l-blue-500" : "border-l-green-500 opacity-60"
                  }`}
                >
                  {/* Group Header (Clickable) */}
                  <div 
                    className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div>
                      <h3 className="font-bold text-lg text-slate-800">
                        Pesanan {group.requester.name} 
                        <span className="text-sm font-normal text-slate-500 ml-2">({group.requester.nik})</span>
                      </h3>
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 font-medium">
                        <PackageOpen className="w-4 h-4 text-blue-500" />
                        <span className="text-blue-700 font-bold">{group.tickets.length} Barang</span> 
                        <span className="text-slate-400 mx-1">•</span> 
                        <span className={pendingCount > 0 ? "text-amber-600 font-bold" : "text-green-600"}>
                          {pendingCount} Menunggu
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="bg-slate-100 p-1 rounded-md">
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Items */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-3 rounded-b-xl">
                      {group.tickets.map(ticket => (
                        <div key={ticket.id} className={`bg-white p-3.5 rounded-lg border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 transition-colors ${
                          batchSelections[ticket.id] === 'READY' ? 'border-green-300 bg-green-50/30' : 
                          batchSelections[ticket.id] === 'OOS' ? 'border-red-300 bg-red-50/30' : ''
                        }`}>
                          <div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                              ticket.type === "REQUEST" ? "bg-indigo-100 text-indigo-700" : "bg-sky-100 text-sky-700"
                            }`}>
                              {ticket.type === "REQUEST" ? "Request Barang" : "Cek Stok"}
                            </span>
                            <h4 className="font-black text-lg text-slate-800 mt-1.5">{ticket.sku}</h4>
                            <p className="text-sm font-bold text-slate-600 max-w-full leading-tight">{ticket.productName}</p>
                            {ticket.hargaNormal && ticket.hargaNormal > 0 ? (
                                <p className="text-xs font-semibold text-blue-600 mt-0.5">Rp {ticket.hargaNormal.toLocaleString('id-ID')}</p>
                            ) : null}
                            {ticket.qty && <p className="text-sm font-semibold text-slate-500 mt-1">Qty: {ticket.qty}</p>}
                          </div>

                          {ticket.status === "PENDING" ? (
                            <div className="flex gap-3 w-full md:w-auto mt-2 md:mt-0 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                              <label className={`flex-1 md:flex-none cursor-pointer px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all font-bold text-sm ${
                                batchSelections[ticket.id] === 'READY' 
                                  ? 'bg-green-500 text-white shadow-md' 
                                  : 'text-slate-500 hover:bg-slate-200'
                              }`}>
                                <input 
                                  type="radio" 
                                  name={`status-${ticket.id}`} 
                                  className="hidden"
                                  checked={batchSelections[ticket.id] === 'READY'}
                                  onChange={() => setBatchSelections(prev => ({ ...prev, [ticket.id]: "READY" }))}
                                />
                                <CheckCircle2 className="w-4 h-4" /> Ready
                              </label>
                              <label className={`flex-1 md:flex-none cursor-pointer px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all font-bold text-sm ${
                                batchSelections[ticket.id] === 'OOS' 
                                  ? 'bg-red-500 text-white shadow-md' 
                                  : 'text-slate-500 hover:bg-slate-200'
                              }`}>
                                <input 
                                  type="radio" 
                                  name={`status-${ticket.id}`} 
                                  className="hidden"
                                  checked={batchSelections[ticket.id] === 'OOS'}
                                  onChange={() => setBatchSelections(prev => ({ ...prev, [ticket.id]: "OOS" }))}
                                />
                                <XCircle className="w-4 h-4" /> Kosong
                              </label>
                            </div>
                          ) : (
                            <div className="w-full md:w-auto text-right mt-2 md:mt-0">
                              <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider border inline-flex items-center gap-1 ${
                                ticket.status === 'READY' ? 'text-green-600 bg-green-50 border-green-100' : 
                                ticket.status === 'OOS' ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-200'
                              }`}>
                                {ticket.status === 'READY' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {ticket.status === 'READY' ? 'Selesai (Ada)' : ticket.status === 'OOS' ? 'Kosong' : 'Selesai'}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {group.hasPending && (
                        <div className="mt-3">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleBatchSubmit(group.id, group.tickets); }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
                          >
                            <PackageOpen className="w-5 h-5" /> Selesaikan Pesanan
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </PullToRefresh>
  );
}
