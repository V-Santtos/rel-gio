import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { ExternalLink, X } from "lucide-react";

// Eventos React atravessam portais: o modal nao pode "vazar" cliques para o
// item do checklist (que entraria em edicao) nem para o modal do cartao.
const stop = (event) => event.stopPropagation();

/**
 * Previa de Instagram/YouTube com o player oficial. Cabecalho enxuto: icone +
 * titulo em no maximo 2 linhas (a legenda longa nao aparece), Abrir na rede e
 * fechar. Esc, clique fora e X fecham; foco preso (fundo inert) e devolvido.
 */
export default function LinkPreviewModal({ href, title, icon, embed, onClose }) {
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    gsap.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
    gsap.fromTo(
      panelRef.current,
      { opacity: 0, scale: 0.96, y: 8 },
      { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: "power2.out" },
    );
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    const others = Array.from(document.body.children).filter(
      (el) => el !== rootRef.current && !el.inert,
    );
    others.forEach((el) => {
      el.inert = true;
    });
    closeRef.current?.focus({ preventScroll: true });

    // Captura na janela: o Esc fecha SO a previa (nao o modal do cartao).
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      others.forEach((el) => {
        el.inert = false;
      });
      previous?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      className="lpmodal"
      onClick={stop}
      onMouseDown={(event) => {
        stop(event);
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`lpmodal__panel${embed.vertical ? " is-vertical" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="lpmodal__head">
          {icon ? <img className="lpmodal__icon" src={icon} alt="" /> : null}
          <h2 className="lpmodal__title" title={title}>
            {title}
          </h2>
          <a
            className="lpmodal__open"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir no ${embed.label}`}
          >
            <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
            <span>Abrir no {embed.label}</span>
          </a>
          <button
            ref={closeRef}
            type="button"
            className="lpmodal__close"
            aria-label="Fechar prévia"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </header>
        <div className="lpmodal__frame">
          <iframe
            src={embed.src}
            title={`Prévia: ${title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
