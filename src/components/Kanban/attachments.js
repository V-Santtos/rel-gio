import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import { makeClientId } from "../../lib/id.js";

export const ATTACHMENT_BUCKET = "task-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
export const ACCEPTED_TYPES = [...IMAGE_TYPES, "application/pdf"];
export const ATTACHMENT_COLUMNS =
  "id, task_id, storage_bucket, storage_path, name, mime_type, size_bytes, width, height, sort_order, created_at";

const SIGN_TTL_SECONDS = 60 * 60;
const signedCache = new Map();
let pendingSign = null;

export const isImageAttachment = (att) => IMAGE_TYPES.includes(att?.mimeType);

export const attachmentFromRow = (row) => ({
  id: row.id,
  bucket: row.storage_bucket || ATTACHMENT_BUCKET,
  path: row.storage_path,
  name: row.name || "arquivo",
  mimeType: row.mime_type || "application/octet-stream",
  size: Number(row.size_bytes) || 0,
  width: row.width || null,
  height: row.height || null,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at || null,
});

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

async function flushSignQueue() {
  const batch = pendingSign;
  pendingSign = null;
  const paths = [...batch.keys()];
  const urls = new Map();
  try {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(paths, SIGN_TTL_SECONDS);
    if (!error) {
      (data || []).forEach((entry) => {
        if (entry?.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
      });
    }
  } catch (error) {
    console.warn("[anexos] falha ao assinar URLs", error);
  }
  batch.forEach((resolvers, path) => {
    const url = urls.get(path) || null;
    if (url) {
      signedCache.set(path, { url, expiresAt: Date.now() + SIGN_TTL_SECONDS * 1000 });
    }
    resolvers.forEach((resolve) => resolve(url));
  });
}

// URLs assinadas saem em lote (um request por "tick") e ficam em cache ate
// perto de expirar. `force` ignora o cache (URL expirada no <img>).
export function getSignedUrl(path, { force = false } = {}) {
  if (!supabase || !path) return Promise.resolve(null);
  const hit = signedCache.get(path);
  if (!force && hit && hit.expiresAt - 60_000 > Date.now()) {
    return Promise.resolve(hit.url);
  }
  return new Promise((resolve) => {
    if (!pendingSign) {
      pendingSign = new Map();
      queueMicrotask(flushSignQueue);
    }
    const list = pendingSign.get(path) || [];
    list.push(resolve);
    pendingSign.set(path, list);
  });
}

export function useSignedUrl(path) {
  const [state, setState] = useState({ path: null, url: null, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    getSignedUrl(path, { force: attempt > 0 }).then((url) => {
      if (active) setState({ path, url, failed: !url });
    });
    return () => {
      active = false;
    };
  }, [path, attempt]);

  // Uma unica nova tentativa quando o <img> falha (ex.: URL assinada expirou).
  const retry = useCallback(() => {
    setAttempt((n) => (n < 1 ? n + 1 : n));
    if (attempt >= 1) setState((s) => ({ ...s, failed: true }));
  }, [attempt]);

  const current = state.path === path ? state : { url: null, failed: false };
  return { url: current.url, failed: current.failed, retry };
}

function extensionFor(file) {
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(file.name || "")?.[1];
  if (fromName) return fromName.toLowerCase();
  return (file.type.split("/")[1] || "bin").replace("jpeg", "jpg");
}

async function readImageSize(file) {
  if (!IMAGE_TYPES.includes(file.type) || typeof createImageBitmap !== "function") {
    return { width: null, height: null };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width || null, height: bitmap.height || null };
    bitmap.close?.();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

export function validateAttachmentFile(file, { imagesOnly = false } = {}) {
  const allowed = imagesOnly ? IMAGE_TYPES : ACCEPTED_TYPES;
  if (!allowed.includes(file.type)) {
    return imagesOnly
      ? "Use uma imagem PNG, JPG, WEBP, GIF ou AVIF."
      : "Formato não suportado. Envie uma imagem ou um PDF.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return "O arquivo passa do limite de 10 MB.";
  return "";
}

export async function uploadAttachment({ userId, taskId, file, sortOrder = 0 }) {
  if (!supabase || !userId) throw new Error("Entre na sua conta para enviar arquivos.");
  const invalid = validateAttachmentFile(file);
  if (invalid) throw new Error(invalid);

  const id = makeClientId();
  const path = `${userId}/${taskId}/${id}.${extensionFor(file)}`;
  const { width, height } = await readImageSize(file);

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (uploadError) {
    console.error("[anexos] upload", uploadError);
    throw new Error("Não consegui enviar o arquivo. Tente de novo.");
  }

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      id,
      task_id: taskId,
      user_id: userId,
      storage_bucket: ATTACHMENT_BUCKET,
      storage_path: path,
      name: file.name || `arquivo.${extensionFor(file)}`,
      mime_type: file.type,
      size_bytes: file.size,
      width,
      height,
      sort_order: sortOrder,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();

  if (error) {
    console.error("[anexos] registro", error);
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new Error("Não consegui registrar o anexo. Tente de novo.");
  }
  return attachmentFromRow(data);
}

// Apaga a linha primeiro (o banco limpa a capa que apontava para ela) e so
// depois o arquivo; uma falha no Storage deixa no maximo um arquivo orfao.
export async function deleteAttachment(att) {
  if (!supabase) return;
  const { error } = await supabase.from("task_attachments").delete().eq("id", att.id);
  if (error) {
    console.error("[anexos] excluir", error);
    throw new Error("Não consegui excluir o anexo.");
  }
  signedCache.delete(att.path);
  const { error: storageError } = await supabase.storage
    .from(att.bucket || ATTACHMENT_BUCKET)
    .remove([att.path]);
  if (storageError) console.warn("[anexos] arquivo nao removido", storageError);
}

export async function removeAttachmentFiles(attachments) {
  if (!supabase || !attachments?.length) return;
  const paths = attachments.map((att) => att.path).filter(Boolean);
  paths.forEach((path) => signedCache.delete(path));
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);
  if (error) console.warn("[anexos] arquivos nao removidos", error);
}
