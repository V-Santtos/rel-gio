/**
 * Motor de MUSICA de fundo do modo Foco.
 *
 * Diferente do `sound.js` (efeitos curtos via AudioBuffer), aqui a faixa e
 * LONGA: usamos dois elementos <audio> em STREAMING roteados por WebAudio. O
 * WebAudio entra so pelos GainNodes -- o que da fade/crossfade/duck nativos e
 * suaves, sem mexer em `audio.volume` na unha.
 *
 * Cadeia de ganho (cada no faz UMA coisa, rampas independentes):
 *   audioA -> gainA \                                   (crossfade entre faixas)
 *   audioB -> gainB  >-> sessionGain -> duckGain -> volGain -> destino
 *                       (fade in/out)   (duck 7s)   (volume)
 *
 * Regras (combinadas com o usuario):
 * - Toggle define a ROTACAO: 1 faixa -> loop nela mesma (crossfade no fim);
 *   2+ -> toca uma apos a outra e repete o conjunto, sempre com crossfade.
 * - A musica toca o CICLO inteiro (foco + break) e ZERA a cada novo ciclo.
 * - DUCK: nos ultimos 7s de cada fase a musica cai pra ~30% (pra ouvir o
 *   tic-tac e o respiro) e volta a 100% ao entrar na proxima fase.
 */

const BASE = import.meta.env.BASE_URL;

export const MUSIC_TRACKS = [
  { id: "slow-jazz-1", title: "Slow Jazz I", src: `${BASE}sounds/music/slow-jazz-1.mp3` },
  { id: "slow-jazz-2", title: "Slow Jazz II", src: `${BASE}sounds/music/slow-jazz-2.mp3` },
  { id: "gamma-40hz", title: "Gamma 40 Hz", src: `${BASE}sounds/music/gamma-40hz.mp3` },
  { id: "432-528hz", title: "432 / 528 Hz", src: `${BASE}sounds/music/432-528hz.mp3` },
  { id: "memory-music", title: "Memory Music", src: `${BASE}sounds/music/memory-music.mp3` },
  { id: "energy-sync", title: "Energy Sync", src: `${BASE}sounds/music/energy-sync.mp3` },
];

// Tempos (segundos)
const CROSSFADE = 8; // sobreposicao no loop/troca de faixa
const PRELOAD_LEAD = 6; // carrega a proxima faixa X s ANTES do crossfade (anti-hitch)
const FADE_IN = 3; // entrada ao iniciar / virar ciclo
const FADE_OUT = 1; // saida ao pausar / desativar (corte rapido, sem clique)
const DUCK_LEVEL = 0.3; // volume relativo durante os ultimos 7s
const DUCK_DOWN = 1.0; // tempo pra abaixar (duck on)
const DUCK_UP = 4.0; // tempo pra voltar (duck off)

let ctx = null;
let built = false;
let elA = null;
let elB = null;
let gainA = null;
let gainB = null;
let sessionGain = null;
let duckGain = null;
let volGain = null;

let volume = 0.5;
let playlist = []; // array de srcs habilitados, na ordem
let currentSrc = null;
let preparedSrc = null; // proxima faixa ja carregada no elemento inativo
let active = null; // elemento <audio> ativo no momento
let playing = false;
let crossfading = false;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) {
    try {
      ctx = new Ctx();
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

/** Rampa linear previsivel ate `target` em `dur` segundos. */
function ramp(param, target, dur) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + Math.max(0.01, dur));
}

/** Proxima faixa da rotacao a partir de `src` (1 faixa -> loop nela mesma). */
function nextSrcOf(src) {
  if (!playlist.length) return null;
  if (playlist.length === 1) return playlist[0];
  const idx = playlist.indexOf(src);
  return playlist[(Math.max(0, idx) + 1) % playlist.length];
}

/** Carrega a proxima faixa no elemento INATIVO (sem tocar) -> troca sem hitch. */
function preloadNext() {
  const ns = nextSrcOf(currentSrc);
  if (!ns || preparedSrc === ns) return;
  const to = active === elA ? elB : elA;
  to.src = ns;
  try {
    to.load();
  } catch {
    /* ignore */
  }
  preparedSrc = ns;
}

function onTimeUpdate(e) {
  if (!playing || crossfading) return;
  const el = e.target;
  if (el !== active || !el.duration || Number.isNaN(el.duration)) return;
  const left = el.duration - el.currentTime;
  if (left <= CROSSFADE) {
    startCrossfade();
  } else if (left <= CROSSFADE + PRELOAD_LEAD) {
    preloadNext();
  }
}

function build() {
  const c = getCtx();
  if (!c || built) return;

  elA = new Audio();
  elB = new Audio();
  [elA, elB].forEach((el) => {
    el.preload = "auto";
    el.loop = false;
    el.addEventListener("timeupdate", onTimeUpdate);
  });

  const srcA = c.createMediaElementSource(elA);
  const srcB = c.createMediaElementSource(elB);
  gainA = c.createGain();
  gainB = c.createGain();
  sessionGain = c.createGain();
  duckGain = c.createGain();
  volGain = c.createGain();

  gainA.gain.value = 1;
  gainB.gain.value = 0;
  sessionGain.gain.value = 0;
  duckGain.gain.value = 1;
  volGain.gain.value = volume;

  srcA.connect(gainA).connect(sessionGain);
  srcB.connect(gainB).connect(sessionGain);
  sessionGain.connect(duckGain).connect(volGain).connect(c.destination);

  built = true;
}

/** Destrava o audio num gesto do usuario (clique em Iniciar). */
export function primeMusic() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume();
  build();
}

/** Volume mestre da musica (0..1). */
export function setMusicVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (volGain) ramp(volGain.gain, volume, 0.2);
}

export function getMusicVolume() {
  return volume;
}

/**
 * Atualiza a rotacao ao vivo (toggles mudados durante a sessao). A faixa atual
 * continua ate o proximo crossfade, que ja usa a lista nova. Lista vazia para.
 */
export function setMusicPlaylist(srcs) {
  playlist = Array.isArray(srcs) ? srcs.slice() : [];
  if (playing && playlist.length === 0) stopMusic();
}

/**
 * (Re)inicia do ZERO: carrega a 1a faixa habilitada e entra com fade-in. Usado
 * no start do timer e a cada virada de ciclo.
 */
export function startMusic(srcs) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  build();

  playlist = Array.isArray(srcs) ? srcs.slice() : [];
  if (playlist.length === 0) return;

  const now = c.currentTime;
  // Corta seco em silencio (sessionGain=0) pra reiniciar sem clique.
  sessionGain.gain.cancelScheduledValues(now);
  sessionGain.gain.setValueAtTime(0, now);
  duckGain.gain.cancelScheduledValues(now);
  duckGain.gain.setValueAtTime(1, now);
  gainA.gain.cancelScheduledValues(now);
  gainA.gain.setValueAtTime(1, now);
  gainB.gain.cancelScheduledValues(now);
  gainB.gain.setValueAtTime(0, now);

  elB.pause();
  active = elA;
  preparedSrc = null;
  currentSrc = playlist[0];
  elA.src = currentSrc;
  try {
    elA.currentTime = 0;
  } catch {
    /* src recem-setado ja zera */
  }
  const p = elA.play();
  if (p && p.catch) p.catch(() => {});

  ramp(sessionGain.gain, 1, FADE_IN);
  playing = true;
  crossfading = false;
}

function startCrossfade() {
  if (!playlist.length) return;
  crossfading = true;

  const nextSrc = nextSrcOf(currentSrc);

  const from = active;
  const to = active === elA ? elB : elA;
  const fromGain = active === elA ? gainA : gainB;
  const toGain = active === elA ? gainB : gainA;

  // Se o preload ja carregou essa faixa nesse elemento, nao recarrega (sem hitch).
  if (preparedSrc !== nextSrc) {
    to.src = nextSrc;
  }
  preparedSrc = null;
  try {
    to.currentTime = 0;
  } catch {
    /* ignore */
  }
  const p = to.play();
  if (p && p.catch) p.catch(() => {});

  const dur = Math.min(CROSSFADE, Math.max(1, from.duration - from.currentTime));
  ramp(toGain.gain, 1, dur);
  ramp(fromGain.gain, 0, dur);

  active = to;
  currentSrc = nextSrc;

  window.setTimeout(() => {
    if (active !== from) from.pause();
    crossfading = false;
  }, dur * 1000 + 50);
}

/** Abaixa (on) pra ~30% nos ultimos 7s; volta a 100% (off) na fase seguinte. */
export function duckMusic(on) {
  if (!playing || !duckGain) return;
  ramp(duckGain.gain, on ? DUCK_LEVEL : 1, on ? DUCK_DOWN : DUCK_UP);
}

/** Fade-out e para (pausa/reset/fim de sessao). */
export function stopMusic() {
  playing = false;
  if (!sessionGain) return;
  ramp(sessionGain.gain, 0, FADE_OUT);
  window.setTimeout(() => {
    if (!playing) {
      if (elA) elA.pause();
      if (elB) elB.pause();
    }
  }, FADE_OUT * 1000 + 100);
}

export function isMusicPlaying() {
  return playing;
}
