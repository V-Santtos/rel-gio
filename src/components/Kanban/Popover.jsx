import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";

/**
 * Popover flutuante ancorado a um gatilho. Portado para o body (nao e cortado
 * pelo overflow do modal) e posicionado por UMA medicao do rect do gatilho
 * (sem scroll-lock / handoff fragil — Principio de Simplicidade). Reposiciona
 * em resize/scroll. Fecha por clique fora; o Escape e tratado por quem o abre.
 */
export default function Popover({
  anchorRef,
  onClose,
  children,
  width = 280,
  className = "",
  role = "dialog",
  ariaLabel,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const place = () => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    let left = r.left;
    if (left + width + margin > window.innerWidth) {
      left = window.innerWidth - width - margin;
    }
    if (left < margin) left = margin;

    // Abre pra baixo por padrao; SO vira pra cima se faltar espaco embaixo E
    // sobrar mais espaco em cima -- senao o popover nasce ultrapassando a
    // borda da janela (position:fixed nao tem pagina pra rolar ate ele).
    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, openUp ? spaceAbove : spaceBelow);

    if (openUp) {
      setPos({ bottom: window.innerHeight - r.top + gap, left, maxHeight, openUp: true });
    } else {
      setPos({ top: r.bottom + gap, left, maxHeight, openUp: false });
    }
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

  // Conteudo mais alto que o espaco abaixo: sobe o popover o necessario para
  // caber INTEIRO na janela (em vez de cortar e rolar por dentro).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pos || pos.openUp || pos.fitted) return;
    const margin = 8;
    // scrollHeight nao inclui a borda: soma-la evita a barra de rolagem.
    const natural = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    const available = window.innerHeight - pos.top - margin;
    if (natural <= available) {
      setPos({ ...pos, maxHeight: undefined, fitted: true });
      return;
    }
    const top = Math.max(margin, window.innerHeight - margin - natural);
    setPos({ ...pos, top, maxHeight: undefined, fitted: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Entrada (GSAP) quando ja posicionado. Desliza a partir do gatilho: de
  // cima pra baixo no caso normal, de baixo pra cima quando `openUp`.
  useLayoutEffect(() => {
    if (!ref.current || !pos) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: pos.openUp ? 6 : -6, scale: 0.98 },
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

  // Esc fecha (beneficia todo consumidor deste componente compartilhado).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      className={`kpop ${className}`}
      style={{
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? pos.bottom : undefined,
        left: pos.left,
        width,
        maxHeight: pos.maxHeight,
      }}
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body
  );
}
