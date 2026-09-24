import { createContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { ChevronLeft, ChevronRight, ExternalLink, ImageIcon, X } from "lucide-react";
import AttachmentImage from "./AttachmentImage.jsx";
import { formatBytes, getSignedUrl } from "./attachments.js";

/**
 * Visualizador de imagens do cartao (lightbox). Abre por cima de tudo com a
 * imagem inteira na tela; setas / ← → navegam entre as imagens do cartao;
 * Esc, X ou clique fora fecham. Foco preso aqui dentro e o resto da pagina
 * fica `inert` enquanto aberto (Web Interface Guidelines).
 *
 * item: { key, attachment?, src?, name, size? } — anexo privado (URL
 * assinada) ou imagem externa colada na descricao.
 */

// Quem renderiza imagens clicaveis (descricao em modo leitura) chama
// openImage({ attachment } | { src, alt }).
export const ImageViewerContext = createContext(null);

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ImageViewer({ items, index, onIndex, onClose, coverId, onToggleCover }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const closeBtnRef = useRef(null);
  const closingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const item = items[index];
  const many = items.length > 1;

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reduceMotion() || !rootRef.current) {
      onClose();
      return;
    }
    gsap.to(rootRef.current, { autoAlpha: 0, duration: 0.18, ease: "power2.in", onComplete: onClose });
  };
  const go = (delta) => {
    if (!many) return;
    onIndex((index + delta + items.length) % items.length);
  };

  // Entrada: fundo aparece e a imagem cresce levemente.
  useLayoutEffect(() => {
    closeBtnRef.current?.focus({ preventScroll: true });
    if (reduceMotion()) return;
    gsap.fromTo(rootRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.22, ease: "power2.out" });
    gsap.fromTo(
      stageRef.current,
      { scale: 0.96, y: 8 },
      { scale: 1, y: 0, duration: 0.32, ease: "power3.out", clearProps: "transform" }
    );
  }, []);

  // Troca de imagem: crossfade curto.
  useLayoutEffect(() => {
    if (reduceMotion() || !stageRef.current) return;
    gsap.fromTo(stageRef.current, { autoAlpha: 0.2 }, { autoAlpha: 1, duration: 0.22, ease: "power2.out" });
  }, [index]);

  // Resto da pagina inert enquanto o visualizador esta aberto.
  useEffect(() => {
    const root = rootRef.current;
    const others = [...document.body.children].filter((el) => el !== root && !el.inert);
    others.forEach((el) => {
      el.inert = true;
    });
    return () =>
      others.forEach((el) => {
        el.inert = false;
      });
  }, []);

  // Teclado na fase de CAPTURA: Esc/setas/Tab sao do visualizador, nao do
  // modal do cartao que esta por baixo.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        go(e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "Tab") {
        e.stopPropagation();
        const focusables = rootRef.current?.querySelectorAll("button:not([disabled])");
        if (!focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const openOriginal = async () => {
    if (!item || opening) return;
    if (item.src) {
      window.open(item.src, "_blank", "noopener,noreferrer");
      return;
    }
    // URL assinada gerada no clique (a aba abre ja no gesto do usuario).
    setOpening(true);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const url = await getSignedUrl(item.attachment.path, { force: true });
    if (url && tab) tab.location.href = url;
    else tab?.close();
    setOpening(false);
  };

  if (!item) return null;
  const isCover = Boolean(item.attachment && coverId === item.attachment.id);

  return createPortal(
    <div
      className="imgview"
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem: ${item.name}`}
      onClick={(e) => {
        // Clique no fundo (fora da imagem e dos controles) fecha.
        if (e.target === e.currentTarget || e.target.classList.contains("imgview__stage")) close();
      }}
    >
      <div className="imgview__bar">
        <div className="imgview__info">
          <span className="imgview__name" title={item.name}>
            {item.name}
          </span>
          {item.size ? <span className="imgview__meta">{formatBytes(item.size)}</span> : null}
        </div>
        <div className="imgview__actions">
          {item.attachment && onToggleCover ? (
            <button
              type="button"
              className="imgview__btn"
              aria-label={isCover ? "Remover capa" : "Usar como capa"}
              onClick={() => onToggleCover(item.attachment)}
            >
              <ImageIcon size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>{isCover ? "Remover capa" : "Usar como capa"}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="imgview__btn"
            aria-label="Abrir original em nova aba"
            onClick={openOriginal}
            disabled={opening}
          >
            <ExternalLink size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>Abrir original</span>
          </button>
          <button
            type="button"
            ref={closeBtnRef}
            className="imgview__icon"
            onClick={close}
            aria-label="Fechar visualizador"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className="imgview__stage" ref={stageRef}>
        {item.attachment ? (
          <AttachmentImage
            key={item.key}
            attachment={item.attachment}
            alt={item.name}
            className="imgview__img"
            draggable={false}
          />
        ) : (
          <img
            key={item.key}
            className="imgview__img"
            src={item.src}
            alt={item.name}
            referrerPolicy="no-referrer"
            draggable={false}
          />
        )}
      </div>

      {many ? (
        <>
          <button
            type="button"
            className="imgview__nav imgview__nav--prev"
            onClick={() => go(-1)}
            aria-label="Imagem anterior"
          >
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="imgview__nav imgview__nav--next"
            onClick={() => go(1)}
            aria-label="Próxima imagem"
          >
            <ChevronRight size={22} strokeWidth={2.2} />
          </button>
          <p className="imgview__count" aria-live="polite">
            {index + 1} / {items.length}
          </p>
        </>
      ) : null}
    </div>,
    document.body
  );
}
