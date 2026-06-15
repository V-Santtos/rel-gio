/**
 * Motor de som do app (WebAudio + assets estaticos de audio).
 *
 * Decisao de projeto: usar sons sutis, mais proximos de respiracao/sopro do
 * que de bip, alarme ou notificacao. A estrutura ja esta pronta pra, no futuro,
 * tocar MP3 e receber controles de UI (on/off, volume) -- por isso
 * `setMuted`/`setVolume` ja existem mesmo sem UI ainda.
 *
 * Navegadores bloqueiam audio ate um gesto do usuario: chamar `primeAudio()`
 * no clique "Iniciar" destrava o AudioContext.
 */

let ctx = null;
let muted = false;
let volume = 0.6; // 0..1

// --- Tic-tac real (MP3 do relogio de quartzo) -------------------------------
// Arquivo em public/sounds/tic-tac.mp3: ~60s de relogio tic-tacando a 1 tic/s.
// Em vez de "recortar" um tic, tocamos a FATIA do arquivo correspondente a cada
// segundo (ancorada no FIM): faltando 7s tocamos [dur-7, dur-6], ...,
// faltando 1s tocamos [dur-1, dur] -- o relogio "real" rodando os ultimos 7s.
const TICK_URL = `${import.meta.env.BASE_URL}sounds/tic-tac.mp3`;
const BREAK_CUE_URL = `${import.meta.env.BASE_URL}sounds/break-cue.mp3`;
const ALARM_URL = `${import.meta.env.BASE_URL}sounds/alarm.mp3`;
let tickBuffer = null;
let tickLoading = null;
let breakCueBuffer = null;
let breakCueLoading = null;
let alarmBuffer = null;
let alarmLoading = null;

/** Carrega o MP3 do tic-tac uma vez (idempotente). Falha silenciosa -> fallback. */
function loadTickBuffer() {
  const c = getCtx();
  if (!c || tickBuffer || tickLoading) return tickLoading;
  tickLoading = fetch(TICK_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      tickBuffer = buf;
    })
    .catch(() => {
      tickBuffer = null; // sem arquivo -> playTick cai no tic sintetizado
    });
  return tickLoading;
}

/** Carrega o MP3 do cue de volta ao foco. Falha silenciosa -> fallback sintetizado. */
function loadBreakCueBuffer() {
  const c = getCtx();
  if (!c || breakCueBuffer || breakCueLoading) return breakCueLoading;
  breakCueLoading = fetch(BREAK_CUE_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      breakCueBuffer = buf;
    })
    .catch(() => {
      breakCueBuffer = null;
    });
  return breakCueLoading;
}

/** Carrega o MP3 do alarme das Tarefas (idempotente). Falha silenciosa. */
function loadAlarmBuffer() {
  const c = getCtx();
  if (!c || alarmBuffer || alarmLoading) return alarmLoading;
  alarmLoading = fetch(ALARM_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      alarmBuffer = buf;
    })
    .catch(() => {
      alarmBuffer = null;
    });
  return alarmLoading;
}

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

/** Destrava o audio num gesto do usuario (ex.: clique em "Iniciar"). */
export function primeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume();
  loadTickBuffer(); // pre-carrega o tic-tac ja no gesto que destrava o audio
  loadBreakCueBuffer(); // pre-carrega o cue de fim de break no mesmo gesto
}

/**
 * Destrava o audio do alarme das Tarefas num gesto do usuario (ex.: salvar um
 * alarme no popover do dia). Necessario porque a secao Tarefas pode nunca
 * passar pelo "Iniciar" do timer, que e onde o resto do audio destrava.
 */
export function primeAlarm() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume();
  loadAlarmBuffer();
}

/**
 * Toca o alarme das Tarefas DUAS vezes em sequencia. Usa o MP3 estatico
 * (public/sounds/alarm.mp3); se nao tiver carregado, dispara o load e cai num
 * bip duplo sintetizado de respeito (sem alarme estridente).
 */
export function playAlarm() {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();

  const now = c.currentTime;
  const gainValue = Math.min(1, volume + 0.25);

  if (alarmBuffer) {
    const gap = 0.06;
    for (let i = 0; i < 2; i += 1) {
      const node = c.createBufferSource();
      const gain = c.createGain();
      node.buffer = alarmBuffer;
      gain.gain.value = gainValue;
      node.connect(gain);
      gain.connect(c.destination);
      const at = now + i * (alarmBuffer.duration + gap);
      node.start(at);
      node.onended = () => {
        node.disconnect();
        gain.disconnect();
      };
    }
    return;
  }

  loadAlarmBuffer();

  // Fallback: dois toques curtos e claros (senoidal), sem estridencia.
  for (let i = 0; i < 2; i += 1) {
    const start = now + i * 0.42;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, start);
    osc.frequency.exponentialRampToValueAtTime(660, start + 0.18);
    osc.connect(gain);
    gain.connect(c.destination);
    const peak = Math.min(0.3, gainValue * 0.5);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.start(start);
    osc.stop(start + 0.34);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export function setMuted(value) {
  muted = !!value;
}
export function setVolume(value) {
  volume = Math.min(1, Math.max(0, value));
}
export function isMuted() {
  return muted;
}
export function getVolume() {
  return volume;
}

function createAirBuffer(c, duration) {
  const frameCount = Math.ceil(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frameCount, c.sampleRate);
  const data = buffer.getChannelData(0);
  let drift = 0;

  for (let i = 0; i < frameCount; i += 1) {
    // Ruido suavizado: mais "ar passando" do que hiss digital.
    drift = drift * 0.92 + (Math.random() * 2 - 1) * 0.08;
    data[i] = drift;
  }

  return buffer;
}

function makeBreathCurve(points, size = 96) {
  const curve = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    const pos = i / (size - 1);
    let left = points[0];
    let right = points[points.length - 1];

    for (let j = 0; j < points.length - 1; j += 1) {
      if (pos >= points[j].at && pos <= points[j + 1].at) {
        left = points[j];
        right = points[j + 1];
        break;
      }
    }

    const span = Math.max(0.0001, right.at - left.at);
    const local = Math.min(1, Math.max(0, (pos - left.at) / span));
    const eased = 0.5 - Math.cos(local * Math.PI) / 2;
    curve[i] = left.value + (right.value - left.value) * eased;
  }

  return curve;
}

/**
 * Transicao respirada: entra suave, abre no meio sem ficar brilhante demais e
 * volta pelo mesmo caminho, evitando o fim "caindo" de um ponto alto.
 */
function playAirTransition({
  duration,
  peak,
  lowpassStart,
  lowpassMid,
  lowpassEnd,
  highpass = 120,
  attackAt = 0.42,
  releaseAt = 0.64,
}) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();

  const now = c.currentTime;
  const source = c.createBufferSource();
  const high = c.createBiquadFilter();
  const low = c.createBiquadFilter();
  const gain = c.createGain();
  const master = c.createGain();

  source.buffer = createAirBuffer(c, duration + 0.08);
  high.type = "highpass";
  high.frequency.setValueAtTime(highpass, now);
  high.Q.value = 0.35;

  low.type = "lowpass";
  low.Q.value = 0.55;
  low.frequency.setValueCurveAtTime(
    makeBreathCurve([
      { at: 0, value: lowpassStart },
      { at: 0.24, value: lowpassStart * 1.08 },
      { at: 0.5, value: lowpassMid },
      { at: 0.76, value: lowpassEnd * 1.08 },
      { at: 1, value: lowpassEnd },
    ]),
    now,
    duration,
  );

  master.gain.value = volume;

  source.connect(high);
  high.connect(low);
  low.connect(gain);
  gain.connect(master);
  master.connect(c.destination);

  gain.gain.setValueCurveAtTime(
    makeBreathCurve([
      { at: 0, value: 0.0001 },
      { at: 0.18, value: peak * 0.42 },
      { at: attackAt, value: peak },
      { at: releaseAt, value: peak * 0.52 },
      { at: 0.86, value: peak * 0.2 },
      { at: 1, value: 0.0001 },
    ]),
    now,
    duration,
  );

  source.start(now);
  source.stop(now + duration + 0.04);
  source.onended = () => {
    source.disconnect();
    high.disconnect();
    low.disconnect();
    gain.disconnect();
    master.disconnect();
  };
}

function playButtonCue() {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();

  const now = c.currentTime;

  if (breakCueBuffer) {
    const node = c.createBufferSource();
    const gain = c.createGain();
    node.buffer = breakCueBuffer;
    gain.gain.value = volume;
    node.connect(gain);
    gain.connect(c.destination);
    node.start(now);
    node.onended = () => {
      node.disconnect();
      gain.disconnect();
    };
    return;
  }

  loadBreakCueBuffer();

  const osc = c.createOscillator();
  const body = c.createGain();
  const click = c.createBufferSource();
  const clickFilter = c.createBiquadFilter();
  const clickGain = c.createGain();
  const master = c.createGain();

  master.gain.value = volume;
  master.connect(c.destination);

  // Pulso grave e curto: mais "botao fisico/interface" do que notificacao.
  osc.type = "triangle";
  osc.frequency.setValueAtTime(260, now);
  osc.frequency.exponentialRampToValueAtTime(145, now + 0.12);
  osc.connect(body);
  body.connect(master);

  body.gain.setValueAtTime(0.0001, now);
  body.gain.exponentialRampToValueAtTime(0.024, now + 0.01);
  body.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  // Ataque textural escuro para dar tato, sem brilho infantil.
  click.buffer = createAirBuffer(c, 0.06);
  clickFilter.type = "lowpass";
  clickFilter.frequency.setValueAtTime(420, now);
  clickFilter.Q.value = 0.45;
  click.connect(clickFilter);
  clickFilter.connect(clickGain);
  clickGain.connect(master);

  clickGain.gain.setValueAtTime(0.0001, now);
  clickGain.gain.exponentialRampToValueAtTime(0.012, now + 0.005);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  osc.start(now);
  osc.stop(now + 0.16);
  click.start(now);
  click.stop(now + 0.065);

  osc.onended = () => {
    osc.disconnect();
    body.disconnect();
    click.disconnect();
    clickFilter.disconnect();
    clickGain.disconnect();
    master.disconnect();
  };
}

export function playFocusEnd() {
  playAirTransition({
    duration: 5.2,
    peak: 0.029,
    lowpassStart: 430,
    lowpassMid: 820,
    lowpassEnd: 430,
    highpass: 80,
    attackAt: 0.48,
    releaseAt: 0.64,
  });
}
export function playBreakEnd() {
  playButtonCue();
}

/** `mode` = a fase que ACABOU de terminar ("focus" | "break"). */
export function playPhaseEnd(mode, transition = {}) {
  if (mode === "break") {
    // O cue de break marca virada de ciclo. Se o break encerra a sessao
    // (ex.: usuario configurou 1 ciclo), deixa so o tic-tac final.
    if (!transition.willContinue) return;
    playBreakEnd();
    return;
  }
  playFocusEnd();
}

/**
 * Tic-tac do relogio na contagem regressiva final.
 * `seconds` = quanto falta (chamado 1x por segundo, de 7 ate 1). Toca a fatia
 * do MP3 correspondente aquele segundo (relogio "real" rodando os ultimos 7s);
 * se o arquivo nao carregou, cai no tic sintetizado abaixo.
 */
export function playTick(seconds) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();

  if (tickBuffer) {
    const node = c.createBufferSource();
    node.buffer = tickBuffer;
    const gain = c.createGain();
    gain.gain.value = volume;
    node.connect(gain);
    gain.connect(c.destination);
    // Ancora no fim: faltando `seconds`, toca a fatia [dur-seconds, dur-seconds+1].
    const dur = tickBuffer.duration;
    const offset = Math.max(0, dur - seconds);
    node.start(c.currentTime, offset, 1.0);
    return;
  }

  // Fallback sintetizado (sem arquivo): tic/tac curtissimo e bem baixo.
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  // tic (mais agudo) nos impares, tac (mais grave) nos pares.
  osc.frequency.value = seconds % 2 === 1 ? 2000 : 1500;
  osc.connect(gain);
  gain.connect(c.destination);

  const peak = 0.05 * volume; // bem sutil
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  osc.start(now);
  osc.stop(now + 0.06);
}
