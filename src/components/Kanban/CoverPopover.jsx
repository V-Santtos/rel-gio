import { useRef, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import Popover from "./Popover.jsx";
import AttachmentImage from "./AttachmentImage.jsx";
import { COVER_COLORS } from "./cover.js";
import { IMAGE_TYPES, isImageAttachment, validateAttachmentFile } from "./attachments.js";

export default function CoverPopover({
  anchorRef,
  cover,
  attachments,
  canUpload,
  onChange,
  onUpload,
  onClose,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const images = attachments.filter(isImageAttachment);

  const pickFile = async (file) => {
    if (!file) return;
    const invalid = validateAttachmentFile(file, { imagesOnly: true });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setUploading(true);
    try {
      const att = await onUpload(file);
      onChange({ type: "image", attachmentId: att.id, x: 0.5, y: 0.5 });
    } catch (err) {
      setError(err.message || "Não consegui enviar a imagem.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Popover anchorRef={anchorRef} width={304} className="kpop--cover" onClose={onClose}>
      <div className="kpop__head">
        <p className="kpop__title">Capa</p>
        <button type="button" className="kpop__close" aria-label="Fechar" onClick={onClose}>
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <p className="kpop__section-label">Cores</p>
      <div className="coverpop__colors" role="group" aria-label="Cor da capa">
        {COVER_COLORS.map((color) => {
          const selected = cover.type === "color" && cover.color === color;
          return (
            <button
              key={color}
              type="button"
              className={`coverpop__color${selected ? " is-selected" : ""}`}
              style={{ background: color }}
              aria-label={`Cor ${color}`}
              aria-pressed={selected}
              onClick={() => onChange({ type: "color", color })}
            >
              {selected ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <p className="kpop__section-label">Imagens do cartão</p>
      {images.length ? (
        <div className="coverpop__images" role="group" aria-label="Imagem da capa">
          {images.map((att) => {
            const selected = cover.type === "image" && cover.attachmentId === att.id;
            return (
              <button
                key={att.id}
                type="button"
                className={`coverpop__image${selected ? " is-selected" : ""}`}
                aria-label={`Usar ${att.name} como capa`}
                aria-pressed={selected}
                onClick={() => onChange({ type: "image", attachmentId: att.id, x: 0.5, y: 0.5 })}
              >
                <AttachmentImage attachment={att} alt="" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="kpop__empty">Nenhuma imagem anexada ainda.</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        hidden
        onChange={(event) => {
          pickFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="coverpop__upload"
        disabled={!canUpload || uploading}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={15} strokeWidth={2.3} aria-hidden="true" />
        <span>{uploading ? "Enviando…" : "Enviar imagem"}</span>
      </button>
      {!canUpload ? (
        <p className="kpop__empty">Entre na sua conta para enviar imagens.</p>
      ) : null}
      {error ? (
        <p className="coverpop__error" role="alert">
          {error}
        </p>
      ) : null}

      {cover.type !== "none" ? (
        <button
          type="button"
          className="coverpop__remove"
          onClick={() => onChange({ type: "none" })}
        >
          Remover capa
        </button>
      ) : null}
    </Popover>
  );
}
