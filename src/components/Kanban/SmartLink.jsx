import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Globe, Link2, Maximize2 } from "lucide-react";
import Popover from "./Popover.jsx";
import LinkPreviewModal from "./LinkPreviewModal.jsx";
import { MenuItem, MenuList } from "../MenuList.jsx";
import { cachedLinkPreview, fetchLinkPreview } from "./linkPreview.js";
import { socialNetworkOf } from "./socialLinks.js";
import { embedOf } from "./linkEmbed.js";

const HOVER_OPEN_MS = 400;
const HOVER_CLOSE_MS = 220;

const hostOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

// Eventos React atravessam o portal do popover: nao deixar o clique chegar
// ao item do checklist (que entraria em modo de edicao).
const stop = (event) => event.stopPropagation();

function LinkIcon({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Globe className={className} size={16} strokeWidth={2} aria-hidden="true" />;
  return (
    <img
      className={className}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Link inteligente do checklist (estilo Trello): icone da rede/site + titulo
 * da pagina. Mouse parado em cima abre um cartao com titulo, descricao e as
 * acoes (Abrir previa / Abrir link, Copiar link); no toque, o toque abre o
 * cartao em vez de navegar.
 */
export default function SmartLink({ href }) {
  const network = socialNetworkOf(href);
  const embed = embedOf(href);
  const [data, setData] = useState(() => cachedLinkPreview(href));
  const [card, setCard] = useState(null); // null | "hover" | "pinned"
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef(null);
  const pointerType = useRef("mouse");
  const timers = useRef({});

  useEffect(() => {
    if (data) return undefined;
    let alive = true;
    fetchLinkPreview(href).then((result) => {
      if (alive && result) setData(result);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  const clearTimers = () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
  };
  useEffect(() => clearTimers, []);

  const openSoon = () => {
    clearTimers();
    timers.current.open = setTimeout(() => setCard((c) => c || "hover"), HOVER_OPEN_MS);
  };
  const closeSoon = () => {
    clearTimers();
    timers.current.close = setTimeout(
      () => setCard((c) => (c === "hover" ? null : c)),
      HOVER_CLOSE_MS,
    );
  };
  const closeCard = () => {
    clearTimers();
    setCard(null);
  };

  // Esc com o cartao aberto fecha SO o cartao (nao o modal do cartao Kanban).
  useEffect(() => {
    if (!card) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeCard();
      anchorRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [card]);

  // Copiar: mostra o check por um instante e fecha o cartao sozinho.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => {
      setCopied(false);
      closeCard();
    }, 900);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const icon = network?.icon || data?.favicon || null;
  const title = data?.title || href;
  const site = network?.label || data?.siteName || hostOf(href);

  return (
    <>
      <a
        ref={anchorRef}
        className="smartlink"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-haspopup="dialog"
        aria-expanded={!!card}
        onPointerDown={(event) => {
          pointerType.current = event.pointerType || "mouse";
        }}
        onMouseEnter={() => {
          if (pointerType.current !== "touch") openSoon();
        }}
        onMouseLeave={() => {
          if (pointerType.current !== "touch") closeSoon();
        }}
        onKeyDown={(event) => {
          // Teclado: Shift+Enter abre o cartao de acoes (Enter segue o link).
          if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            stop(event);
            setCard("pinned");
          }
        }}
        onClick={(event) => {
          stop(event);
          if (pointerType.current === "touch") {
            event.preventDefault();
            setCard((c) => (c ? null : "pinned"));
          } else {
            closeCard();
          }
          pointerType.current = "mouse";
        }}
      >
        <LinkIcon src={icon} className="smartlink__icon" />
        <span className="smartlink__text">{title}</span>
      </a>

      {card ? (
        <Popover
          anchorRef={anchorRef}
          width={340}
          className="kpop--linkcard"
          ariaLabel="Prévia do link"
          onClose={closeCard}
        >
          <div
            className="linkhover"
            onClick={stop}
            onMouseDown={stop}
            onMouseEnter={clearTimers}
            onMouseLeave={() => {
              if (card === "hover") closeSoon();
            }}
          >
            <div className="linkhover__head">
              <LinkIcon src={icon} className="linkhover__icon" />
              <a className="linkhover__title" href={href} target="_blank" rel="noopener noreferrer">
                {title}
              </a>
            </div>
            {data?.description ? <p className="linkhover__desc">{data.description}</p> : null}
            <MenuList label="Ações do link" autoFocus={card === "pinned"} onClose={closeCard}>
              {embed ? (
                <MenuItem
                  icon={<Maximize2 size={16} strokeWidth={2.2} />}
                  label="Abrir prévia"
                  onSelect={() => {
                    closeCard();
                    setPreview(true);
                  }}
                />
              ) : (
                <MenuItem
                  icon={<ExternalLink size={16} strokeWidth={2.2} />}
                  label="Abrir link"
                  onSelect={() => {
                    window.open(href, "_blank", "noopener,noreferrer");
                    closeCard();
                  }}
                />
              )}
              <MenuItem
                icon={
                  copied ? (
                    <Check size={16} strokeWidth={2.4} />
                  ) : (
                    <Link2 size={16} strokeWidth={2.2} />
                  )
                }
                label={copied ? "Copiado!" : "Copiar link"}
                onSelect={copyLink}
              />
            </MenuList>
            <div className="linkhover__foot">
              <LinkIcon src={icon} className="linkhover__foot-icon" />
              <span>{site}</span>
            </div>
          </div>
        </Popover>
      ) : null}

      {preview && embed ? (
        <LinkPreviewModal
          href={href}
          title={title}
          icon={icon}
          embed={embed}
          onClose={() => setPreview(false)}
        />
      ) : null}
    </>
  );
}
