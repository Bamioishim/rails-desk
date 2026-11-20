"use client";

import {useEffect, useRef} from "react";

/**
 * Orange "net" spotlight: a grid of lines and knots that lights up around the cursor
 * (or finger) and fades out with distance, over a soft orange glow.
 * Fixed layers, positioned from CSS variables: follows 1:1, no lag, no trail, never
 * intercepts clicks. Fades out when the pointer leaves or the touch ends.
 * Hidden entirely when the user prefers reduced motion.
 */
const R = 260; // spotlight radius in px
const CELL = 26; // net cell size in px
const at = `circle ${R}px at var(--mx, -999px) var(--my, -999px)`;
const spot = `radial-gradient(${at}, #000 0%, rgba(0,0,0,.85) 35%, rgba(0,0,0,.35) 65%, transparent 100%)`;
export function CursorGlow() {
 const ref = useRef<HTMLDivElement>(null);
 useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce.matches) return;
  const move = (x: number, y: number) => {
   el.style.setProperty("--mx", `${x}px`);
   el.style.setProperty("--my", `${y}px`);
   el.style.opacity = "1";
  };
  const hide = () => { el.style.opacity = "0"; };
  const onPointer = (e: PointerEvent) => move(e.clientX, e.clientY);
  const onTouch = (e: TouchEvent) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); };
  const onOut = (e: MouseEvent) => { if (!e.relatedTarget) hide(); };
  window.addEventListener("pointermove", onPointer, {passive: true});
  window.addEventListener("pointerdown", onPointer, {passive: true});
  window.addEventListener("touchstart", onTouch, {passive: true});
  window.addEventListener("touchmove", onTouch, {passive: true});
  window.addEventListener("touchend", hide, {passive: true});
  window.addEventListener("touchcancel", hide, {passive: true});
  document.addEventListener("mouseout", onOut);
  window.addEventListener("blur", hide);
  return () => {
   window.removeEventListener("pointermove", onPointer);
   window.removeEventListener("pointerdown", onPointer);
   window.removeEventListener("touchstart", onTouch);
   window.removeEventListener("touchmove", onTouch);
   window.removeEventListener("touchend", hide);
   window.removeEventListener("touchcancel", hide);
   document.removeEventListener("mouseout", onOut);
   window.removeEventListener("blur", hide);
  };
 }, []);
 const layer: React.CSSProperties = {position: "absolute", inset: 0};
 return <div ref={ref} aria-hidden="true" data-cursor-glow="" style={{
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000, opacity: 0, transition: "opacity .3s ease",
 }}>
  <div style={{...layer, mixBlendMode: "multiply", background: `radial-gradient(${at}, rgba(255,150,90,0.30), rgba(255,150,90,0.10) 55%, transparent 80%)`}}/>
  <div data-cursor-net="" style={{...layer,
   backgroundImage: `radial-gradient(circle, rgba(255,112,40,.95) 0 1.6px, transparent 2.2px), linear-gradient(rgba(255,128,60,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,128,60,.55) 1px, transparent 1px)`,
   backgroundSize: `${CELL}px ${CELL}px`,
   backgroundPosition: `${-CELL / 2}px ${-CELL / 2}px, 0 0, 0 0`,
   WebkitMaskImage: spot, maskImage: spot,
  }}/>
 </div>;
}
