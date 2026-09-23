import { isImageAttachment } from "./attachments.js";

export const NO_COVER = { type: "none" };

export const COVER_COLORS = [
  "#218057",
  "#ad8b00",
  "#c26800",
  "#c43a32",
  "#8f44ad",
  "#154481",
  "#155e75",
  "#456b17",
  "#7a2454",
  "#5d636b",
];

// Texto legivel sobre a cor da capa (luminancia relativa WCAG).
export function readableTextOn(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#f4f5f7";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.18 ? "#172b4d" : "#f4f5f7";
}

const clamp01 = (value, fallback = 0.5) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
};

export function coverFromRow(task) {
  if (task.cover_type === "color" && task.cover_color) {
    return { type: "color", color: task.cover_color };
  }
  if (task.cover_type === "image" && task.cover_attachment_id) {
    return {
      type: "image",
      attachmentId: task.cover_attachment_id,
      x: clamp01(task.cover_focus_x),
      y: clamp01(task.cover_focus_y),
    };
  }
  return NO_COVER;
}

// Capa efetiva: uma capa de imagem cujo anexo nao existe mais vira "sem capa".
export function resolveCover(cover, attachments = []) {
  if (cover?.type === "color" && cover.color) return cover;
  if (cover?.type === "image") {
    const attachment = attachments.find((att) => att.id === cover.attachmentId);
    if (attachment && isImageAttachment(attachment)) {
      return { ...cover, x: clamp01(cover.x), y: clamp01(cover.y), attachment };
    }
  }
  return NO_COVER;
}

export function coverToPayload(cover, attachments) {
  const resolved = resolveCover(cover, attachments);
  if (resolved.type === "color") return { type: "color", color: resolved.color };
  if (resolved.type === "image") {
    return {
      type: "image",
      attachment_id: resolved.attachmentId,
      focus_x: resolved.x,
      focus_y: resolved.y,
    };
  }
  return { type: "none" };
}

export { clamp01 };
