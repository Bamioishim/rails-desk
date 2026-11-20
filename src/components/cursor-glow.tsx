"use client";

import {useEffect, useRef} from "react";

/**
 * Soft orange spotlight that follows the cursor (or finger) 1:1.
 * A single fixed layer: no lag, no trail, never intercepts clicks.
 * It blends with `multiply`, so on light surfaces it tints like a light behind the page
 * while dark text stays dark. Fades out when the pointer leaves or the touch ends.
 * Hidden entirely when the user prefers reduced motion.
 */
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
 return <div ref={ref} aria-hidden="true" data-cursor-glow="" style={{
  position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000, opacity: 0,
  transition: "opacity .35s ease", mixBlendMode: "multiply",
  background: "radial-gradient(circle 380px at var(--mx, -999px) var(--my, -999px), rgba(255,150,90,0.16), transparent 70%)",
 }}/>;
}
