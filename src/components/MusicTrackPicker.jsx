import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { AudioLines, Check, X } from "lucide-react";

/**
 * Modal de selecao unica das faixas. Centralizado para nao depender do espaco
 * disponivel ao redor do mini player. Segue o mesmo contrato de acessibilidade
 * do SettingsModal: Escape, foco preso, fundo inert e retorno de foco.
 */
export default function MusicTrackPicker({ tracks, selectedId, onSelect, onClose }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  const closingRef = useRef(false);
  const returnFocusRef = useRef(
    typeof document !== "undefined" ? document.activeElement : null
  );

  const reduce = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useLayoutEffect(() => {
    const r = reduce();
    gsap.set(backdropRef.current, { opacity: 0 });
    gsap.set(panelRef.current, { opacity: 0, y: 14, scale: 0.97 });
    gsap.to(backdropRef.current, {
      opacity: 1,
      duration: r ? 0 : 0.22,
      ease: "power2.out",
    });
    gsap.to(panelRef.current, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: r ? 0 : 0.32,
      ease: "power3.out",
    });
    const selected = panelRef.current?.querySelector('[aria-selected="true"]');
    (selected ?? panelRef.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) {
      root.setAttribute("inert", "");
      root.setAttribute("aria-hidden", "true");
    }
    return () => {
      if (root) {
        root.removeAttribute("inert");
        root.removeAttribute("aria-hidden");
      }
      returnFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const r = reduce();
    gsap.killTweensOf([backdropRef.current, panelRef.current]);
    gsap.to(panelRef.current, {
      opacity: 0,
      y: 10,
      scale: 0.97,
      duration: r ? 0 : 0.18,
      ease: "power2.in",
    });
    gsap.to(backdropRef.current, {
      opacity: 0,
      duration: r ? 0 : 0.2,
      ease: "power2.in",
      onComplete: onClose,
    });
  };

  const choose = (id) => {
    onSelect(id);
    close();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll(
          'button, [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className="musicmodal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="musicmodal-title"
      aria-describedby="musicmodal-description"
    >
      <div className="musicmodal__backdrop" ref={backdropRef} onClick={close} />
      <div className="musicmodal__panel" ref={panelRef} tabIndex={-1}>
        <div className="musicmodal__top">
          <div>
            <span className="musicmodal__eyebrow">Biblioteca</span>
            <h2 id="musicmodal-title" className="musicmodal__title">Escolha a faixa</h2>
          </div>
          <button type="button" className="musicmodal__close" onClick={close} aria-label="Fechar">
            <X size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <p id="musicmodal-description" className="musicmodal__description">
          Selecione uma música para acompanhar sua sessão de foco.
        </p>

        <div className="musicmodal__list" role="listbox" aria-label="Faixas de música">
          {tracks.map((track) => {
            const active = track.id === selectedId;
            return (
              <button
                key={track.id}
                type="button"
                role="option"
                aria-selected={active}
                className="music-track-item"
                data-active={active}
                onClick={() => choose(track.id)}
              >
                <span className="music-track-item__art" aria-hidden="true">
                  <AudioLines size={19} strokeWidth={2.15} />
                </span>
                <span className="music-track-item__copy">
                  <span className="music-track-item__name">{track.title}</span>
                  <span className="music-track-item__hint">{track.hint}</span>
                </span>
                <span className="music-track-item__check" data-visible={active} aria-hidden="true">
                  <Check size={15} strokeWidth={2.7} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
