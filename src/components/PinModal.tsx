import { useState } from "react";
import { Lock, X } from "lucide-react";

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  title?: string;
  description?: string;
}

export function PinModal({ isOpen, onClose, onSubmit, title = "Otorisasi Diperlukan", description = "Masukkan PIN Keamanan untuk melanjutkan." }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === "220117") {
      setError(false);
      setPin("");
      onSubmit(pin);
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800">
            <Lock className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-slate-600 mb-4">{description}</p>
          
          <div className="mb-4">
            <input
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
              className={`w-full text-center tracking-[0.5em] font-mono text-2xl p-3 border rounded-xl outline-none transition-colors ${
                error ? "border-red-500 bg-red-50 text-red-700 focus:border-red-600" : "border-slate-300 focus:border-emerald-500 bg-slate-50"
              }`}
              placeholder="••••••"
              maxLength={6}
            />
            {error && <p className="text-xs text-red-500 mt-2 text-center font-medium">PIN Salah! Silakan coba lagi.</p>}
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-emerald-200"
          >
            Konfirmasi
          </button>
        </form>
      </div>
    </div>
  );
}
