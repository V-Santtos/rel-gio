// Modelo e utilitarios da sessao de ciclos do Pomodoro.
// config = { cycles: N, cycleTimes: [ {Foco/Break} x N ] } (indice 0 = Ciclo 1)

export const MAX_CYCLES = 6;

export const DEFAULT_CYCLE = {
  focusHours: 0,
  focusMinutes: 25,
  focusSeconds: 0,
  breakMinutes: 5,
  breakSeconds: 0,
};

export const clampCycles = (n) =>
  Math.min(MAX_CYCLES, Math.max(1, Math.round(Number(n) || 1)));

export function normalizeCycle(c = {}) {
  return {
    focusHours: c.focusHours ?? DEFAULT_CYCLE.focusHours,
    focusMinutes: c.focusMinutes ?? DEFAULT_CYCLE.focusMinutes,
    focusSeconds: c.focusSeconds ?? DEFAULT_CYCLE.focusSeconds,
    breakMinutes: c.breakMinutes ?? DEFAULT_CYCLE.breakMinutes,
    breakSeconds: c.breakSeconds ?? DEFAULT_CYCLE.breakSeconds,
  };
}

// Garante que o array tenha exatamente `count` itens (copia o ultimo ao crescer).
export function fitCycleTimes(list, count) {
  const next = list.slice(0, count).map(normalizeCycle);
  while (next.length < count) {
    next.push({ ...(next[next.length - 1] || DEFAULT_CYCLE) });
  }
  return next;
}

export function defaultConfig() {
  return { cycles: 1, cycleTimes: [{ ...DEFAULT_CYCLE }] };
}

// Aceita o formato antigo (campos flat = Ciclo 1) e o novo (cycleTimes).
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();
  const base =
    Array.isArray(raw.cycleTimes) && raw.cycleTimes.length
      ? raw.cycleTimes
      : [raw];
  const cycles = clampCycles(raw.cycles ?? base.length);
  return { cycles, cycleTimes: fitCycleTimes(base, cycles) };
}
