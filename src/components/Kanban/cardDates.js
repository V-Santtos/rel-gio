// Datas do cartao: startDate = "AAAA-MM-DD" (so dia), dueAt = ISO (dia + hora).

export const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const MONTHS_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];
export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const pad = (n) => String(n).padStart(2, "0");

export const dayKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const keyToDate = (key) => {
  const [y, m, d] = (key || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

// "5/9/2026" ou "05/09/2026" -> "2026-09-05" (valida dia real do mes).
export function parseDMY(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text || "").trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return dayKey(date);
}

export const formatDMY = (key) => {
  const date = keyToDate(key);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "";
};

// Mascara de digitacao: so digitos, barras automaticas.
export function maskDMY(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function maskHM(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function parseHM(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((text || "").trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h <= 23 && min <= 59 ? { h, min } : null;
}

export const formatHM = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const shortDay = (date) => `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;

// "22 set – 23 set, 23:20" | "23 set, 23:20" | "A partir de 22 set"
export function formatCardDates({ startDate, dueAt }, { withTime = true } = {}) {
  const start = keyToDate(startDate);
  const due = dueAt ? new Date(dueAt) : null;
  if (start && due) {
    return `${shortDay(start)} – ${shortDay(due)}${withTime ? `, ${formatHM(due)}` : ""}`;
  }
  if (due) return `${shortDay(due)}${withTime ? `, ${formatHM(due)}` : ""}`;
  if (start) return `A partir de ${shortDay(start)}`;
  return "";
}

// done | overdue | soon (vence em < 24h) | null
export function dueStatus({ dueAt, done }, now = Date.now()) {
  if (!dueAt) return null;
  if (done) return "done";
  const due = new Date(dueAt).getTime();
  if (due < now) return "overdue";
  if (due - now < 24 * 60 * 60 * 1000) return "soon";
  return null;
}

export const DUE_STATUS_LABEL = {
  done: "Concluída",
  overdue: "Atrasada",
  soon: "Em breve",
};
