import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";

/**
 * Popover flutuante ancorado a um gatilho. Portado para o body (nao e cortado
 * pelo overflow do modal) e posicionado por UMA medicao do rect do gatilho
 * (sem scroll-lock / handoff fragil — Principio de Simplicidade). Reposiciona
 * em resize/scroll. Fecha por clique fora; o Escape e tratado por quem o abre.
 */
export default function Popover({ anchorRef, onClose, children, width = 280, className = "" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const place = () => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const margin = 8;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + width + margin > window.innerWidth) {
      left = window.innerWidth - width - margin;
    }
    if (left < margin) left = margin;
    const maxHeight = Math.max(240, window.innerHeight - top - margin);
    setPos({ top, left, maxHeight });
  };

  useLayoutEffect(() => {
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => place();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entrada (GSAP) quando ja posicionado.
  useLayoutEffect(() => {
    if (!ref.current || !pos) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: -6, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: reduce ? 0 : 0.18, ease: "power2.out" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null]);

  // Fecha ao clicar fora (mantem aberto ao clicar no gatilho ou dentro).
  useEffect(() => {
    const onDown = (e) => {
      if (
        ref.current &&
        !ref.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      className={`kpop ${className}`}
      style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxHeight }}
      role="dialog"
    >
      {children}
    </div>,
    document.body
  );
}
