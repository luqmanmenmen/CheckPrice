import React from 'react';

export default function ShiftLoader({ progress }: { progress?: number }) {
  const isProgressMode = typeof progress === 'number';
  // stroke-dasharray is 400. 0% means 400 offset, 100% means 0 offset.
  const dashOffset = isProgressMode ? 400 - (400 * Math.min(100, Math.max(0, progress)) / 100) : 400;

  return (
    <div className="relative flex items-center justify-center">
      <style>{`
        .animate-border-trace {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
          animation: border-trace 1.5s linear infinite;
        }
        .progress-border-trace {
          stroke-dasharray: 400;
          transition: stroke-dashoffset 0.3s ease-out;
        }
        @keyframes border-trace {
          0% {
            stroke-dashoffset: 400;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 3D Shadow under the logo */}
      <div className="absolute -bottom-6 w-24 h-4 bg-black/15 blur-md rounded-[100%]"></div>
      
      {/* Container Kotak untuk Logo */}
      <div className="relative w-32 h-32 md:w-40 md:h-40 bg-white flex items-center justify-center z-10 p-6 shadow-sm">
        <img src="/suko-logo.png" alt="SUKO" className="w-full h-full object-contain" />
        
        {/* SVG Border Trace Tipis Merah */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none" 
          viewBox="0 0 100 100" 
          preserveAspectRatio="none"
        >
          {/* Garis background opsional (transparan/abu sangat muda) */}
          <rect x="0" y="0" width="100" height="100" fill="none" stroke="#f8fafc" strokeWidth="2" />
          
          {/* Garis Merah yang melaju */}
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="none"
            stroke="#ef4444" 
            strokeWidth="4"
            className={isProgressMode ? "progress-border-trace" : "animate-border-trace"}
            style={isProgressMode ? { strokeDashoffset: dashOffset } : {}}
          />
        </svg>
      </div>
    </div>
  );
}
