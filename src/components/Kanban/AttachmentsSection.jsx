import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus } from "lucide-react";
import AttachmentImage from "./AttachmentImage.jsx";
import {
  ACCEPTED_TYPES,
  formatBytes,
  getSignedUrl,
  isImageAttachment,
  validateAttachmentFile,
} from "./attachments.js";

function AttachmentRow({ attachment, isCover, onToggleCover, onDelete, onPreview }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const image = isImageAttachment(attachment);

  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  // Imagem abre no visualizador do app; outros arquivos (PDF) em nova aba,
  // com a URL assinada gerada no clique (um link salvo nunca expira na tela).
  const open = async () => {
    if (image && onPreview) {
      onPreview(attachment);
      return;
    }
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const url = await getSignedUrl(attachment.path, { force: true });
    if (url && tab) tab.location.href = url;
    else tab?.close();
  };

  const remove = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete(attachment);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="attrow">
      <button
        type="button"
        className="attrow__thumb"
        onClick={open}
        aria-label={`Abrir ${attachment.name}`}
      >
        {image ? (
          <AttachmentImage attachment={attachment} alt="" />
        ) : (
          <FileText size={22} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
      <div className="attrow__info">
        <button type="button" className="attrow__name" onClick={open} title={attachment.name}>
          {attachment.name}
        </button>
        <span className="attrow__meta">
          {formatBytes(attachment.size)}
          {isCover ? " · Capa" : ""}
        </span>
        <div className="attrow__actions">
          {image ? (
            <button type="button" onClick={() => onToggleCover(attachment)}>
              {isCover ? "Remover capa" : "Usar como capa"}
            </button>
          ) : null}
          <button
            type="button"
            className={confirming ? "is-danger" : ""}
            disabled={busy}
            onClick={remove}
          >
            {busy ? "Excluindo…" : confirming ? "Confirmar exclusão" : "Excluir"}
          </button>
        </div>
      </div>
    </li>
  );
}

export default function AttachmentsSection({
  attachments,
  cover,
  canUpload,
  onUpload,
  onDelete,
  onToggleCover,
  onPreview,
  fileInputRef,
}) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const localInput = useRef(null);
  const inputRef = fileInputRef || localInput;

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setError("");
    for (const file of list) {
      const invalid = validateAttachmentFile(file);
      if (invalid) {
        setError(`${file.name}: ${invalid}`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        await onUpload(file);
      } catch (err) {
        setError(err.message || "Não consegui enviar o arquivo.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remove = async (attachment) => {
    setError("");
    try {
      await onDelete(attachment);
    } catch (err) {
      setError(err.message || "Não consegui excluir o anexo.");
    }
  };

  if (!attachments.length && !uploading && !error) {
    return (
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = "";
        }}
      />
    );
  }

  return (
    <div className="cardmodal__section attachments">
      <div className="cardmodal__section-head">
        <span className="cardmodal__section-icon" aria-hidden="true">
          <Paperclip size={18} strokeWidth={2.2} />
        </span>
        <h3 className="cardmodal__section-title">Anexos</h3>
        <button
          type="button"
          className="cardmodal__section-edit"
          disabled={!canUpload || uploading > 0}
          onClick={() => inputRef.current?.click()}
        >
          <Plus size={14} strokeWidth={2.4} />
          <span>{uploading ? "Enviando…" : "Adicionar"}</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = "";
        }}
      />
      {attachments.length ? (
        <ul className="attachments__list">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id}
              attachment={att}
              isCover={cover.type === "image" && cover.attachmentId === att.id}
              onToggleCover={onToggleCover}
              onPreview={onPreview}
              onDelete={remove}
            />
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="coverpop__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
