import { createContext, useContext, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { ImageOff } from "lucide-react";
import AttachmentImage from "./AttachmentImage.jsx";
import { attachmentIdFromSrc } from "./markdownExtensions.js";

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

export function DescriptionImage({ src, alt }) {
  const attachments = useContext(CardAttachmentsContext);
  const attachmentId = attachmentIdFromSrc(src);

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
    return (
      <AttachmentImage
        attachment={attachment}
        alt={alt || attachment.name}
        className="md-img"
      />
    );
  }
  if (!src) return null;
  return <RemoteImage src={src} alt={alt} />;
}

export function ImageNodeView({ node, selected }) {
  return (
    <NodeViewWrapper className={`mde__image${selected ? " is-selected" : ""}`} data-drag-handle="">
      <DescriptionImage src={node.attrs.src} alt={node.attrs.alt} />
    </NodeViewWrapper>
  );
}
