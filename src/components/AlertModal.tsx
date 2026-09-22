import { AlertTriangle, CheckCircle2, X } from "lucide-react";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "error" | "success" | "warning";
  onConfirm?: () => void;
}

export function AlertModal({ isOpen, onClose, title, message, type = "error", onConfirm }: AlertModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 flex flex-col items-center text-center">
          {type === "error" && (
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4 text-rose-600">
              <X className="w-8 h-8" />
            </div>
          )}
          {type === "success" && (
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4 text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          )}
          {type === "warning" && (
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4 text-amber-600">
              <AlertTriangle className="w-8 h-8" />
            </div>
          )}
          
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed whitespace-pre-wrap">{message}</p>
          
          <div className="flex gap-3 w-full mt-2">
            {onConfirm && (
              <button
                onClick={onClose}
                className="flex-1 font-bold py-3 rounded-xl transition-all shadow-md bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Batal
              </button>
            )}
            <button
              onClick={onConfirm ? () => { onConfirm(); onClose(); } : onClose}
              className={`flex-1 font-bold py-3 rounded-xl transition-all shadow-md ${
                type === "error" ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200" :
                type === "success" ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200" :
                "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200"
              }`}
            >
              {onConfirm ? "Ya, Yakin" : "Mengerti"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
