import { createContext, useContext, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { ImageOff, Maximize2 } from "lucide-react";
import AttachmentImage from "./AttachmentImage.jsx";
import { attachmentIdFromSrc } from "./markdownExtensions.js";
import { ImageViewerContext } from "./ImageViewer.jsx";

export const CardAttachmentsContext = createContext([]);

function RemoteImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a className="md-img md-img--missing" href={src} target="_blank" rel="noopener noreferrer">
        <ImageOff size={16} strokeWidth={2} aria-hidden="true" />
        <span>{alt || "Imagem indisponível"}</span>
      </a>
    );
  }
  return (
    <img
      className="md-img"
      src={src}
      alt={alt || ""}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

// Tamanho da imagem na descricao. Guardado no "title" do Markdown
// (![alt](src "small")) — o tiptap e o react-markdown ja fazem ida e volta
// desse campo, entao descricoes antigas (sem title) abrem como "full".
export const IMAGE_SIZES = [
  { key: "small", label: "Pequena" },
  { key: "medium", label: "Média" },
  { key: "full", label: "Inteira" },
];
export const sizeFromTitle = (title) =>
  title === "small" || title === "medium" ? title : "full";

// Modo leitura (interactive): a imagem vira um botao que abre o visualizador,
// com o icone de ampliar no hover. No editor ela segue selecionavel.
function Zoomable({ label, size, onOpen, children }) {
  return (
    <button
      type="button"
      className="md-imgbox md-img-zoom"
      data-size={size}
      aria-label={`Ampliar imagem: ${label}`}
      onClick={(e) => {
        e.stopPropagation(); // nao abrir o editor da descricao
        onOpen();
      }}
    >
      {children}
      <span className="md-img-zoom__icon" aria-hidden="true">
        <Maximize2 size={14} strokeWidth={2.4} />
      </span>
    </button>
  );
}

function Box({ size, children }) {
  return (
    <span className="md-imgbox" data-size={size}>
      {children}
    </span>
  );
}

export function DescriptionImage({ src, alt, title, interactive = false }) {
  const attachments = useContext(CardAttachmentsContext);
  const openImage = useContext(ImageViewerContext);
  const attachmentId = attachmentIdFromSrc(src);
  const zoom = interactive && openImage;
  const size = sizeFromTitle(title);

  if (attachmentId) {
    const attachment = attachments.find((att) => att.id === attachmentId);
    if (!attachment) {
      return (
        <span className="md-img md-img--missing" role="img" aria-label="Imagem removida">
          <ImageOff size={16} strokeWidth={2} aria-hidden="true" />
          <span>Imagem removida dos anexos</span>
        </span>
      );
    }
    const image = (
      <AttachmentImage
        attachment={attachment}
        alt={alt || attachment.name}
        className="md-img"
      />
    );
    return zoom ? (
      <Zoomable label={attachment.name} size={size} onOpen={() => openImage({ attachment })}>
        {image}
      </Zoomable>
    ) : (
      <Box size={size}>{image}</Box>
    );
  }
  if (!src) return null;
  return zoom ? (
    <Zoomable label={alt || "imagem"} size={size} onOpen={() => openImage({ src, alt })}>
      <RemoteImage src={src} alt={alt} />
    </Zoomable>
  ) : (
    <Box size={size}>
      <RemoteImage src={src} alt={alt} />
    </Box>
  );
}

// Editor: barrinha de tamanho no hover/selecao (Pequena / Media / Inteira).
// Clique, sem arrastar bordas (simples e sem pecas frageis).
export function ImageNodeView({ node, selected, updateAttributes }) {
  const size = sizeFromTitle(node.attrs.title);
  return (
    <NodeViewWrapper className={`mde__image${selected ? " is-selected" : ""}`} data-drag-handle="">
      <DescriptionImage src={node.attrs.src} alt={node.attrs.alt} title={node.attrs.title} />
      <span className="mde__imgsize" contentEditable={false} role="group" aria-label="Tamanho da imagem">
        {IMAGE_SIZES.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`mde__imgsize-opt${size === opt.key ? " is-active" : ""}`}
            aria-pressed={size === opt.key}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => updateAttributes({ title: opt.key === "full" ? null : opt.key })}
          >
            {opt.label}
          </button>
        ))}
      </span>
    </NodeViewWrapper>
  );
}
