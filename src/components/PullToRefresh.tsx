"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  const MAX_PULL = 100; // max px to pull down
  const THRESHOLD = 60; // px required to trigger refresh

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        setStartY(e.touches[0].clientY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (window.scrollY === 0 && startY > 0 && !isRefreshing) {
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0) {
          // Check if the scroll container is at the top. If yes, prevent default and pull down
          if (document.documentElement.scrollTop === 0) {
            if (e.cancelable) e.preventDefault();
            setIsPulling(true);
            setPullDistance(Math.min(diff * 0.4, MAX_PULL)); // apply resistance
          }
        }
      }
    };

    const handleTouchEnd = async () => {
      if (isPulling && pullDistance >= THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(THRESHOLD); // lock at threshold while refreshing
        
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
      
      setIsPulling(false);
      setStartY(0);
    };

    const element = containerRef.current;
    if (element) {
      // Use passive: false to allow preventDefault
      element.addEventListener("touchstart", handleTouchStart, { passive: true });
      element.addEventListener("touchmove", handleTouchMove, { passive: false });
      element.addEventListener("touchend", handleTouchEnd, { passive: true });
      
      return () => {
        element.removeEventListener("touchstart", handleTouchStart);
        element.removeEventListener("touchmove", handleTouchMove);
        element.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [startY, isPulling, pullDistance, isRefreshing, onRefresh]);

  return (
    <div ref={containerRef} className="relative w-full min-h-screen">
      {/* Loading Indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden transition-all duration-200 z-[60] pointer-events-none"
        style={{ 
          height: `${pullDistance}px`,
          opacity: pullDistance > 0 ? 1 : 0
        }}
      >
        <div 
          className="bg-white rounded-full shadow-lg p-2 flex items-center justify-center transition-transform"
          style={{ transform: `rotate(${pullDistance * 3}deg)` }}
        >
          <Loader2 
            className={`w-6 h-6 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} 
            style={{ opacity: Math.min(pullDistance / THRESHOLD, 1) }}
          />
        </div>
      </div>

      {/* Content wrapper */}
      <div 
        style={{ 
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out'
        }}
        className="w-full min-h-screen"
      >
        {children}
      </div>
    </div>
  );
}
