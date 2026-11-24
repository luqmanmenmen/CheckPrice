"use client";

import React, { useEffect, useState } from "react";
import "@/styles/shift-toggle.css";

export type SkyPhase = "pagi" | "siang" | "sore" | "malam";

interface ShiftToggleProps {
  isNight: boolean;
  skyPhase?: SkyPhase;
}

export default function ShiftToggle({ isNight, skyPhase }: ShiftToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; delay: string }[]>([]);

  const dayText = skyPhase === "siang" ? "Shift Siang" : "Shift Pagi";
  const nightText = skyPhase === "sore" ? "Shift Sore" : "Shift Malam";

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
    setStars(
      Array.from({ length: 12 }).map(() => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: (Math.random() * 3).toFixed(2),
      }))
    );
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center mt-5 mb-1 select-none">
      {/* LABEL OTOMATIS SESUAI JAM */}
      <div className="label mb-2">
        <span id="labelDay" className={`text-slate-700 font-bold ${!isNight ? "visible" : ""}`}>
          {dayText}
        </span>
        <span id="labelNight" className={`text-slate-700 font-bold ${isNight ? "visible" : ""}`}>
          {nightText}
        </span>
      </div>

      {/* KAPSUL PEMANDANGAN LANGIT OTOMATIS (GPU-LIGHT UNTUK SAFARI & CHROME) */}
      <div
        role="img"
        className={`switch ${isNight ? "night on" : ""}`}
        id="switchBtn"
        aria-label={`Suasana langit otomatis: ${!isNight ? dayText : nightText}`}
        style={{ width: "100%", cursor: "default", pointerEvents: "none", opacity: 1 }}
      >
        <div
          className="track"
          style={
            skyPhase === "sore"
              ? { background: "linear-gradient(135deg, #f97316 0%, #c084fc 55%, #312e81 100%)" }
              : skyPhase === "pagi"
              ? { background: "linear-gradient(135deg, #fbbf24 0%, #60a5fa 48%, #2563eb 100%)" }
              : undefined
          }
        >
          {isNight ? (
            <>
              <div className="stars" id="trackStars">
                {mounted &&
                  stars.map((s, i) => (
                    <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }}></span>
                  ))}
              </div>
              <div className="toggle-shooting-stars">
                <span className="toggle-shooting s1"></span>
                <span className="toggle-shooting s2"></span>
              </div>
              <div className="moon">
                <div className="moon">🌙</div>
              </div>
            </>
          ) : (
            <>
              <div className="sun"></div>
              <div className="birds">
                <svg className="bird b1" viewBox="0 0 14 8" aria-hidden="true">
                  <path className="wing" d="M0 6 Q7 -2 14 6 Q7 3 0 6Z" fill="#eef6ff" />
                </svg>
                <svg className="bird b2" viewBox="0 0 14 8" aria-hidden="true">
                  <path className="wing" d="M0 6 Q7 -2 14 6 Q7 3 0 6Z" fill="#eef6ff" />
                </svg>
              </div>
              <div className="clouds">
                <div className="cloud-track">
                  <img src="/assets/cloud2.png" alt="" aria-hidden="true" decoding="async" draggable={false} />
                  <img src="/assets/cloud2.png" alt="" aria-hidden="true" decoding="async" draggable={false} />
                  <img src="/assets/cloud2.png" alt="" aria-hidden="true" decoding="async" draggable={false} />
                  <img src="/assets/cloud2.png" alt="" aria-hidden="true" decoding="async" draggable={false} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
