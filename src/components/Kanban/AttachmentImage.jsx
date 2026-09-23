import { ImageOff } from "lucide-react";
import { useSignedUrl } from "./attachments.js";

// <img> de anexo privado: resolve a URL assinada e tenta de novo uma vez se ela
// expirar. Enquanto carrega (ou se falhar) mostra um placeholder neutro.
export default function AttachmentImage({ attachment, alt, className = "", style, draggable }) {
  const { url, failed, retry } = useSignedUrl(attachment?.path);

  if (!url || failed) {
    return (
      <span
        className={`attimg attimg--placeholder${failed ? " is-failed" : ""} ${className}`}
        style={style}
        role="img"
        aria-label={failed ? `Imagem indisponível: ${alt || ""}` : alt}
      >
        {failed ? <ImageOff size={18} strokeWidth={2} aria-hidden="true" /> : null}
      </span>
    );
  }

  return (
    <img
      className={`attimg ${className}`}
      src={url}
      alt={alt}
      style={style}
      loading="lazy"
      decoding="async"
      draggable={draggable}
      onError={retry}
    />
  );
}
