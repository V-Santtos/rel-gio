/**
 * Modelo + persistencia dos alarmes das Tarefas.
 *
 * Cada coluna-dia (laneId) tem sua propria lista de alarmes. O alarme fica na
 * coluna onde foi criado e dispara TODO DIA no horario configurado (HH:MM),
 * enquanto o app estiver aberto (inclusive em aba de fundo). Persistido em
 * localStorage; a chave usa o laneId (nome do dia), estavel na reordenacao.
 *
 * Limite tecnico assumido (decisao do usuario): o alarme so toca com o site
 * ABERTO. Site fechado = sem alarme (nao usamos Service Worker / push).
 */

const KEY_PREFIX = "fluxtime.alarms.";

/**
 * Alarme: { id, time: "HH:MM", description, enabled, order }.
 * `order` define a posicao manual do alarme dentro da sua faixa (Etapa 2). Pode
 * vir ausente em dados antigos; nesse caso quem carrega atribui um (ver DayLane).
 */
export function loadAlarms(laneId) {
  if (typeof window === "undefined" || !laneId) return [];
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + laneId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a.time === "string")
      .map((a) => ({
        id: a.id || `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: a.time,
        description: typeof a.description === "string" ? a.description : "",
        enabled: a.enabled !== false,
        order: typeof a.order === "number" ? a.order : null,
      }));
  } catch {
    return [];
  }
}

export function saveAlarms(laneId, alarms) {
  if (typeof window === "undefined" || !laneId) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + laneId, JSON.stringify(alarms));
  } catch {
    /* storage cheio/indisponivel: ignora (alarmes seguem em memoria nesta sessao). */
  }
}

// Faixas de periodo por hora (Modo Semana). Limite assumido (ajustavel):
// Manha 00:00-11:59 | Tarde 12:00-17:59 | Noite 18:00-23:59.
export const PERIOD_LABELS = {
  morning: "Manhã",
  afternoon: "Tarde",
  night: "Noite",
};

/** Periodo (morning|afternoon|night) ao qual a hora do alarme pertence. */
export function periodForTime(time) {
  const h = Number((time || "").split(":")[0]);
  if (Number.isNaN(h)) return null;
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "night";
}

/** "HH:MM" do horario atual, p/ comparar com o alarme. */
export function nowHHMM(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

/** Chave de minuto (anti-disparo-duplo no mesmo minuto). */
export function minuteKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${nowHHMM(
    date
  )}`;
}

// --- Notification API (preparado p/ alarme com a aba em segundo plano) -------
// Site fechado NAO notifica (sem Service Worker). Com a aba aberta mas sem foco
// (outra aba), a Notification do SO ajuda o usuario a perceber o disparo.

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Pede permissao de notificacao (idempotente). Chamar num gesto do usuario. */
export function ensureNotificationPermission() {
  if (!notificationsSupported()) return Promise.resolve("unsupported");
  if (Notification.permission !== "default") {
    return Promise.resolve(Notification.permission);
  }
  try {
    return Notification.requestPermission();
  } catch {
    return Promise.resolve(Notification.permission);
  }
}

/** Dispara uma notificacao do SO se houver permissao. Falha silenciosa. */
export function showAlarmNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== "granted") {
    return false;
  }
  try {
    const n = new Notification(title, { body, tag: "fluxtime-alarm" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
