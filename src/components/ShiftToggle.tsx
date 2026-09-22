"use client";

import React, { useEffect, useState } from "react";
import "@/styles/shift-toggle.css";

interface ShiftToggleProps {
  isNight: boolean;
  onToggle: (isNight: boolean) => void;
}

export default function ShiftToggle({ isNight, onToggle }: ShiftToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; delay: string }[]>([]);

  // Apply the .night class to the parent wrapper in page.tsx
  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
    setStars(Array.from({ length: 14 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: (Math.random() * 3).toFixed(2),
    })));
    const stage = document.getElementById("login-stage");
    if (stage) {
      if (isNight) {
        stage.classList.add("night");
      } else {
        stage.classList.remove("night");
      }
    }
  }, [isNight]);

  return (
    <div className="w-full flex flex-col items-center justify-center my-6">
      
      {/* LABEL */}
      <div className="label mb-2">
        <span id="labelDay" className={`text-slate-700 font-bold ${!isNight ? "visible" : ""}`}>Shift Pagi</span>
        <span id="labelNight" className={`text-slate-700 font-bold ${isNight ? "visible" : ""}`}>Shift Siang</span>
      </div>

      {/* MAIN TOGGLE */}
      <button
        type="button"
        className={`switch ${isNight ? "night on" : ""}`}
        id="switchBtn"
        aria-pressed={isNight}
        disabled
        aria-label="Toggle day and night mode (Automatic)"
        style={{ width: '100%', cursor: 'default', opacity: 1 }}
      >
        <div className="track">
          {/* TRACK STARS */}
          <div className="stars" id="trackStars">
            {mounted && stars.map((s, i) => (
              <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }}></span>
            ))}
          </div>

          <div className="toggle-shooting-stars">
            <span className="toggle-shooting s1"></span>
            <span className="toggle-shooting s2"></span>
            <span className="toggle-shooting s3"></span>
          </div>

          {/* MOON */}
          <div className="moon">
            <div className="moon">🌙</div>
          </div>

          {/* SUN */}
          <div className="sun"></div>

          {/* FLYING BIRDS */}
          <div className="birds">
            <svg className="bird b1" viewBox="0 0 14 8" aria-hidden="true"><path className="wing" d="M0 6 Q7 -2 14 6 Q7 3 0 6Z" fill="#eef6ff" /></svg>
            <svg className="bird b2" viewBox="0 0 14 8" aria-hidden="true"><path className="wing" d="M0 6 Q7 -2 14 6 Q7 3 0 6Z" fill="#eef6ff" /></svg>
            <svg className="bird b3" viewBox="0 0 14 8" aria-hidden="true"><path className="wing" d="M0 6 Q7 -2 14 6 Q7 3 0 6Z" fill="#eef6ff" /></svg>
          </div>

          {/* MOVING CLOUD */}
          <div className="clouds">
            <div className="cloud-track">
              <img src="/assets/cloud2.png" alt="" aria-hidden="true" draggable="false" />
              <img src="/assets/cloud2.png" alt="" aria-hidden="true" draggable="false" />
              <img src="/assets/cloud2.png" alt="" aria-hidden="true" draggable="false" />
              <img src="/assets/cloud2.png" alt="" aria-hidden="true" draggable="false" />
            </div>
          </div>
        </div>
        <div className="knob"></div>
      </button>

    </div>
  );
}
