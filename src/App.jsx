import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);
import {
  Play,
  Pause,
  RotateCcw,
  Settings,
  List,
  CalendarDays,
  Plus,
  Maximize,
  Minimize,
} from "lucide-react";
import FlipClock from "./components/FlipClock/FlipClock.jsx";
import AccountMenu from "./components/AccountMenu.jsx";
import Sidebar from "./components/Sidebar.jsx";
import MobileNav from "./components/MobileNav.jsx";
import {
  NavChronometerIcon,
  NavClockIcon,
  NavTargetIcon,
  NavTaskIcon,
} from "./components/NavIcons.jsx";
import DayLane from "./components/Kanban/DayLane.jsx";
import { FocusTaskBar } from "./components/FocusTask.jsx";
import { quietArrivals } from "./components/Kanban/cardDrag.js";
import {
  DEFAULT_LABELS,
  setLabels as setRuntimeLabels,
} from "./components/Kanban/labels.js";
import SettingsModal from "./components/SettingsModal.jsx";
import CyclePill from "./components/CyclePill.jsx";
import ClockSection from "./components/ClockSection.jsx";
import MusicPanel from "./components/MusicPanel.jsx";
import EntryExperience from "./components/EntryExperience.jsx";
import {
  DEFAULT_CYCLE,
  defaultConfig,
  normalizeCycle,
  normalizeConfig,
} from "./lib/cycles.js";
import AuthPanel from "./components/AuthPanel.jsx";
import { useTimer } from "./hooks/useTimer.js";
import { useStopwatch } from "./hooks/useStopwatch.js";
import { playPhaseEnd, playTick, primeAudio, playAlarm } from "./lib/sound.js";
import {
  MUSIC_TRACKS,
  primeMusic,
  startMusic,
  stopMusic,
  duckMusic,
  switchTrackNow,
  setMusicVolume,
} from "./lib/music.js";
import { syncPushSubscription } from "./lib/pushSubscription.js";
import {
  loadAllAlarms,
  nowHHMM,
  minuteKey,
  showAlarmNotification,
  loadCardReminders,
  periodForTime,
  saveCardReminders,
  reminderDueToday,
  weekDayKey,
} from "./components/Kanban/alarms.js";
import { AlarmToast } from "./components/Kanban/DayLane.jsx";
import {
  ATTACHMENT_COLUMNS,
  attachmentFromRow,
  deleteAttachment,
  removeAttachmentFiles,
  uploadAttachment,
} from "./components/Kanban/attachments.js";
import { NO_COVER, coverFromRow, coverToPayload } from "./components/Kanban/cover.js";
import { makeClientId } from "./lib/id.js";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient.js";

const STORAGE_KEY = "rel-gio:config";
const AUTH_FLOW_ENABLED = true;
// Ociosidade no Foco: apaga os controles E entra em tela cheia no mesmo instante.
const IDLE_MS = 2500;

function pad(n) {
  return String(n).padStart(2, "0");
}

// Cada caractere numa celula de largura fixa: a contagem nao "treme" quando os
// digitos mudam (independe de a fonte ter algarismos tabulares).
function Digits({ value }) {
  return value.split("").map((ch, i) => (
    <span className="sw-d" key={i}>
      {ch}
    </span>
  ));
}

function BreakCountdown({ totalSeconds, showHours }) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const groups = showHours
    ? [String(hours), pad(minutes), pad(seconds)]
    : [pad(Math.floor(safe / 60)), pad(seconds)];

  return (
    <div className="break-countdown" aria-label="Break">
      <span className="break-countdown__title">Break</span>
      <div className="break-countdown__time" aria-label={groups.join(":")}>
        {groups.map((group, index) => (
          <span className="break-countdown__group" key={`${group}-${index}`}>
            {index > 0 ? <span className="break-countdown__sep">:</span> : null}
            <span className="break-countdown__digits">
              <Digits value={group} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function configFromRow(row) {
  if (!row) return defaultConfig();
  if (Array.isArray(row.cycle_times) && row.cycle_times.length) {
    return normalizeConfig({
      cycles: row.cycles_count ?? row.cycle_times.length,
      cycleTimes: row.cycle_times,
    });
  }
  return {
    cycles: 1,
    cycleTimes: [
      normalizeCycle({
        focusHours: row.focus_hours,
        focusMinutes: row.focus_minutes,
        focusSeconds: row.focus_seconds,
        breakMinutes: row.break_minutes,
        breakSeconds: row.break_seconds,
      }),
    ],
  };
}

function rowFromConfig(userId, config) {
  const c0 = config.cycleTimes[0] || DEFAULT_CYCLE;
  return {
    user_id: userId,
    cycles_count: config.cycles,
    cycle_times: config.cycleTimes,
    focus_hours: c0.focusHours,
    focus_minutes: c0.focusMinutes,
    focus_seconds: c0.focusSeconds,
    break_minutes: c0.breakMinutes,
    break_seconds: c0.breakSeconds,
  };
}

const SIDEBAR_ITEMS = [
  { id: "horario", label: "Horário", Icon: NavClockIcon },
  { id: "foco", label: "Foco", Icon: NavTargetIcon },
  { id: "tarefas", label: "Tarefas", Icon: NavTaskIcon },
  { id: "cronometro", label: "Cronômetro", Icon: NavChronometerIcon },
];

// Bottom nav (mobile): barra reta compacta com itens iguais (icone + label +
// dot de ativo) — Horario, Foco, Tarefas e Cronometro.
const MOBILE_NAV_ITEMS = [
  SIDEBAR_ITEMS[0], // Horario
  SIDEBAR_ITEMS[1], // Foco
  SIDEBAR_ITEMS[2], // Tarefas
  SIDEBAR_ITEMS[3], // Cronometro
];

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeConfig(JSON.parse(raw));
  } catch {
    /* ignora */
  }
  return defaultConfig();
}


function PhaseTimerDisplay({ timer, showHours, expanded, onToggleExpand, clockRef }) {
  const focusLayerRef = useRef(null);
  const breakLayerRef = useRef(null);
  const [lastFocusSeconds, setLastFocusSeconds] = useState(timer.remaining);
  const [lastBreakSeconds, setLastBreakSeconds] = useState(timer.remaining);

  useEffect(() => {
    if (timer.mode === "focus") {
      setLastFocusSeconds(timer.remaining);
    } else {
      setLastBreakSeconds(timer.remaining);
    }
  }, [timer.mode, timer.remaining]);

  useLayoutEffect(() => {
    const focusLayer = focusLayerRef.current;
    const breakLayer = breakLayerRef.current;
    if (!focusLayer || !breakLayer) return undefined;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const enteringBreak = timer.mode === "break";
    const activeLayer = enteringBreak ? breakLayer : focusLayer;
    const inactiveLayer = enteringBreak ? focusLayer : breakLayer;

    if (reduce) {
      gsap.set(activeLayer, { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)" });
      gsap.set(inactiveLayer, { autoAlpha: 0, y: 0, scale: 1, filter: "blur(0px)" });
      return undefined;
    }

    gsap.killTweensOf([focusLayer, breakLayer]);
    const timeline = gsap.timeline();

    timeline
      .to(inactiveLayer, {
        autoAlpha: 0,
        y: enteringBreak ? -16 : 16,
        scale: enteringBreak ? 0.96 : 0.98,
        filter: "blur(9px)",
        duration: 0.42,
        ease: "power2.inOut",
      })
      .fromTo(
        activeLayer,
        {
          autoAlpha: 0,
          y: enteringBreak ? 20 : -12,
          scale: enteringBreak ? 0.985 : 1.015,
          filter: "blur(10px)",
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.62,
          ease: "power3.out",
        },
        0
      );

    return () => timeline.kill();
  }, [timer.mode]);

  return (
    <main className="stage stage--phase">
      <div className="phase-stack">
        <div className="phase-layer phase-layer--focus" ref={focusLayerRef}>
          <FlipClock
            totalSeconds={timer.mode === "focus" ? timer.remaining : lastFocusSeconds}
            showHours={showHours}
            expanded={expanded}
            onExpand={onToggleExpand}
            rootRef={clockRef}
          />
        </div>
        <div className="phase-layer phase-layer--break" ref={breakLayerRef}>
          <BreakCountdown
            totalSeconds={timer.mode === "break" ? timer.remaining : lastBreakSeconds}
            showHours={showHours}
          />
        </div>
      </div>
    </main>
  );
}

function FocoSection({
  timer,
  showHours,
  config,
  setConfig,
  expanded,
  onToggleExpand,
  clockRef,
  musicTracks,
  musicTrackId,
  onPickTrack,
  musicOn,
  onToggleMusicOn,
  musicVolume,
  onMusicVolume,
  focusTask,
  completedTask,
  onUnlinkTask,
  onCompletedShown,
}) {
  const { running, start, pause, reset } = timer;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stageRef = useRef(null);
  const actionsRef = useRef(null);
  const cycleIndicatorRef = useRef(null);

  // Fecha as configuracoes ao entrar no modo foco (timer rodando).
  useEffect(() => {
    if (running) setSettingsOpen(false);
  }, [running]);

  // F1 - Entrada da secao: cascata SO nos botoes (os claquetes sao 3D/complexos
  // e flicavam -> ficam sem animacao; o fade do claquete vem do PhaseTimerDisplay
  // no mount). Cada botao fica oculto ate a sua vez e entao APARECE de vez (via
  // visibility, nao opacidade -- pra nao estragar o glow) com um leve deslize.
  // Roda no MOUNT da secao: como o Foco so monta depois da logo (entered), o F5/
  // primeiro load usa o mesmo caminho da troca de secao -> mesma animacao.
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const actions = actionsRef.current;
    if (!actions) return;
    const buttons = actions.querySelectorAll(".btn");
    // Cascata: destino EXPLICITO (visible) via fromTo -- com `from` o gsap
    // capturaria o estado ja escondido como destino e nada apareceria.
    gsap.fromTo(
      buttons,
      { visibility: "hidden", y: 10 },
      {
        visibility: "visible",
        y: 0,
        duration: 0.65,
        // Atraso na largada: deixa o claquete entrar primeiro e so depois a
        // cascata comeca, em vez do Iniciar surgir junto com a troca de secao.
        delay: 0.35,
        ease: "power3.out",
        stagger: 0.18,
        clearProps: "transform,visibility",
      }
    );
  }, []);

  // F4 - Indicador "Ciclo X/Y": fade + leve subida ao aparecer e a cada troca
  // de ciclo, em vez de piscar seco.
  useLayoutEffect(() => {
    const el = cycleIndicatorRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: -6 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" }
    );
  }, [timer.cycle, timer.cycles]);

  return (
    <>
      <div
        ref={stageRef}
        className={`focus-stage${timer.cycles > 1 ? " has-cycles" : ""}`}
      >
        {timer.cycles > 1 ? (
          <span
            className="cycle-indicator"
            aria-live="polite"
            ref={cycleIndicatorRef}
          >
            Ciclo {timer.cycle}/{timer.cycles}
          </span>
        ) : null}
        {/* Botao de tela cheia no nivel do palco — so aparece no mobile (canto
            superior direito, junto do indicador de ciclo). No desktop quem
            cuida disso e o botao dentro do ultimo claquete (flip-unit__action). */}
        <button
          type="button"
          className="focus-expand"
          onClick={onToggleExpand}
          aria-label={expanded ? "Recolher relógio" : "Expandir relógio em tela cheia"}
        >
          {expanded ? (
            <Minimize strokeWidth={2.2} />
          ) : (
            <Maximize strokeWidth={2.2} />
          )}
        </button>
        <PhaseTimerDisplay
          timer={timer}
          showHours={showHours}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          clockRef={clockRef}
        />
      </div>

      <FocusTaskBar
        task={focusTask}
        completed={completedTask}
        onUnlink={onUnlinkTask}
        onCompletedShown={onCompletedShown}
      />

      <div id="notif-guide-anchor" className="focus-actions" ref={actionsRef}>
        <div className="controls">
          {running ? (
            <button type="button" className="btn btn--cta" onClick={pause}>
              <span className="btn__label">Pausar</span>
              <span className="btn__icon">
                <Pause size={16} strokeWidth={2.6} />
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => {
                primeAudio(); // destrava o audio no gesto do usuario
                primeMusic(); // destrava tambem o motor de musica
                start();
              }}
            >
              <span className="btn__label">Iniciar</span>
              <span className="btn__icon">
                <Play size={16} strokeWidth={2.6} />
              </span>
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={reset}>
            <RotateCcw size={16} strokeWidth={2.4} />
            <span>Reiniciar</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn--ghost focus-config"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={16} strokeWidth={2.2} />
          <span>Configurações</span>
        </button>
      </div>

      <MusicPanel
        tracks={musicTracks}
        trackId={musicTrackId}
        onPickTrack={onPickTrack}
        on={musicOn}
        promptMusic={running && !musicOn}
        onToggleOn={onToggleMusicOn}
        volume={musicVolume}
        onVolume={onMusicVolume}
      />

      {settingsOpen ? (
        <SettingsModal
          config={config}
          setConfig={setConfig}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}

function CronometroSection({ stopwatch }) {
  const { elapsed, running, start, pause, reset } = stopwatch;
  const totalSec = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const centis = Math.floor((elapsed % 1000) / 10);

  return (
    <>
      <main className="stage">
        <div className="stopwatch">
          <div className="stopwatch__display">
            <span className="sw-group">
              <span className="sw-num">
                <Digits value={pad(hours)} />
              </span>
              <span className="sw-label">h</span>
            </span>
            <span className="sw-sep">:</span>
            <span className="sw-group">
              <span className="sw-num">
                <Digits value={pad(minutes)} />
              </span>
              <span className="sw-label">min</span>
            </span>
            <span className="sw-sep">:</span>
            <span className="sw-group">
              <span className="sw-num">
                <Digits value={pad(seconds)} />
                <span className="sw-frac">
                  <span className="sw-d sw-d--comma">,</span>
                  <Digits value={pad(centis)} />
                </span>
              </span>
              <span className="sw-label">seg</span>
            </span>
          </div>
        </div>
      </main>

      <div className="controls">
        {running ? (
          <button
            type="button"
            className="btn btn--cta btn--icon"
            onClick={pause}
            aria-label="Pausar"
          >
            <Pause size={20} strokeWidth={2.6} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--cta btn--icon"
            onClick={start}
            aria-label="Iniciar"
          >
            <Play size={20} strokeWidth={2.6} />
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reset}
          aria-label="Reiniciar"
        >
          <RotateCcw size={20} strokeWidth={2.4} />
        </button>
      </div>
    </>
  );
}

// Kanban semanal: 7 colunas-dia padrao (Segunda -> Domingo), ancoradas no
// topo-esquerda em fileira horizontal. Cada lane gerencia seu proprio estado.
const DIAS_SEMANA = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];
const WEEK_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DEFAULT_LANE_LIMIT = 10;
const isWeekDayKey = (key) => WEEK_DAY_KEYS.includes(key);

const bySort = (a, b) =>
  (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0);

const fallbackLanes = () => [
  {
    id: "default-init",
    dayKey: "default-init",
    title: "Lista 1",
    mode: "default",
    collapsed: false,
    sortOrder: -1,
    cards: [],
    alarms: [],
  },
  ...DIAS_SEMANA.map((title, index) => ({
    id: String(index),
    dayKey: WEEK_DAY_KEYS[index],
    title,
    mode: "default",
    collapsed: false,
    sortOrder: index,
    cards: [],
    alarms: [],
  })),
];

const cleanChecklist = (list, index = 0) => ({
  id: list.id,
  title: list.title || "Checklist",
  sortOrder: list.sortOrder ?? list.sort_order ?? index,
  items: (list.items || []).map((item, itemIndex) => ({
    id: item.id,
    text: item.text || "",
    done: !!item.done,
    dueDate: item.dueDate || item.due_date || "",
    sortOrder: item.sortOrder ?? item.sort_order ?? itemIndex,
  })),
});

function TarefasSection({ userId, onFocusTask }) {
  const boardRef = useRef(null);
  const [lanes, setLanes] = useState(fallbackLanes);
  const [labels, setLabels] = useState([]);
  const [boardMode, setBoardMode] = useState("default");
  const [boardReady, setBoardReady] = useState(!supabase || !userId);
  const [syncError, setSyncError] = useState("");
  const [weekGuideVisible, setWeekGuideVisible] = useState(false);

  useEffect(() => {
    if (boardMode !== "week" || !boardReady) return;
    if (localStorage.getItem("fluxtime.week-guide-dismissed")) return;
    const t = setTimeout(() => setWeekGuideVisible(true), 500);
    return () => clearTimeout(t);
  }, [boardMode, boardReady]);

  const dismissWeekGuide = () => {
    localStorage.setItem("fluxtime.week-guide-dismissed", "1");
    setWeekGuideVisible(false);
  };

  // Espelha os lembretes ativos (Modo Semana) no localStorage para o
  // verificador global de alarmes do TimerApp.
  useEffect(() => {
    if (!boardReady) return;
    saveCardReminders(
      userId,
      lanes
        .filter((lane) => isWeekDayKey(lane.dayKey))
        .flatMap((lane) =>
          lane.cards
            .filter((card) => card.reminderTime && !card.done)
            .map((card) => ({
              id: card.id,
              title: card.title || "",
              time: card.reminderTime,
              repeat: card.reminderRepeat || "once",
              days: card.reminderDays || [],
              dayKey: lane.dayKey,
            }))
        )
    );
  }, [lanes, boardReady, userId]);

  // Atualizacoes vindas de fora do board (o banco ja foi gravado por quem
  // disparou): lembrete "uma vez" que tocou e tarefa vinculada concluida
  // pelo fim da sessao de foco.
  useEffect(() => {
    const patchCard = (cardId, patch) =>
      setLanes((list) =>
        list.map((lane) =>
          lane.cards.some((card) => card.id === cardId)
            ? {
                ...lane,
                cards: lane.cards.map((card) =>
                  card.id === cardId ? { ...card, ...patch } : card
                ),
              }
            : lane
        )
      );
    const onReminderDone = (e) =>
      e.detail?.cardId &&
      patchCard(e.detail.cardId, { reminderTime: null, reminderRepeat: null, reminderDays: [] });
    const onTaskDone = (e) => e.detail?.cardId && patchCard(e.detail.cardId, { done: true });
    window.addEventListener("fluxtime:reminder-done", onReminderDone);
    window.addEventListener("fluxtime:task-done", onTaskDone);
    return () => {
      window.removeEventListener("fluxtime:reminder-done", onReminderDone);
      window.removeEventListener("fluxtime:task-done", onTaskDone);
    };
  }, []);

  const laneDrag = useRef(null);
  const cardDrag = useRef(null);
  // Arraste do Modo Semana: faixas vazias (Manha/Tarde/Noite) aparecem em todas
  // as colunas enquanto um CARD e arrastado, para poder soltar num periodo novo.
  const [weekDropBands, setWeekDropBands] = useState(false);
  const [boardNotice, setBoardNotice] = useState("");
  const noticeTimer = useRef(null);
  const showBoardNotice = (message) => {
    clearTimeout(noticeTimer.current);
    setBoardNotice(message);
    noticeTimer.current = setTimeout(() => setBoardNotice(""), 3800);
  };
  const [liftedLaneId, setLiftedLaneId] = useState(null);
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const flipState = useRef(null);
  const lanesAnimated = useRef(false);
  const pendingLaneAnimation = useRef(null);
  // Uma alteração de cartão salva a tarefa e recria suas relações de etiqueta.
  // Sem fila, duas ações rápidas podiam apagar/inserir essas relações ao mesmo
  // tempo e disputar a chave composta (task_id, label_id) no Supabase.
  const cardSyncQueue = useRef(new Map());
  const syncErrorTimer = useRef(null);
  const remoteEnabled = Boolean(supabase && userId);

  const reportSyncError = (message, error) => {
    console.error(message, error);
    setSyncError(message);
    window.clearTimeout(syncErrorTimer.current);
    syncErrorTimer.current = window.setTimeout(() => setSyncError(""), 6000);
  };

  useEffect(
    () => () => window.clearTimeout(syncErrorTimer.current),
    []
  );

  useEffect(() => {
    if (!remoteEnabled) {
      const next = fallbackLanes();
      setLanes(next);
      setLabels(DEFAULT_LABELS);
      setRuntimeLabels(DEFAULT_LABELS);
      setBoardMode("default");
      setBoardReady(true);
      return undefined;
    }

    let active = true;
    setBoardReady(false);
    setSyncError("");

    async function loadBoard() {
      await supabase.rpc("ensure_default_task_board", { profile_id: userId });

      const [
        lanesResult,
        labelsResult,
        tasksResult,
        assignmentsResult,
        checklistsResult,
        itemsResult,
        alarmsResult,
        attachmentsResult,
      ] = await Promise.all([
        supabase
          .from("task_lanes")
          .select("id, day_key, title, mode, collapsed, sort_order")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_labels")
          .select("id, client_key, name, color, sort_order")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tasks")
          .select(
            "id, lane_id, title, description, done, period, status, sort_order, cover_type, cover_color, cover_attachment_id, cover_focus_x, cover_focus_y, start_date, due_at, reminder_time, reminder_repeat, reminder_days"
          )
          .eq("user_id", userId)
          .neq("status", "archived")
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_label_assignments")
          .select("task_id, label_id, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_checklists")
          .select("id, task_id, title, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_checklist_items")
          .select("id, checklist_id, text, done, due_date, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_alarms")
          .select("id, lane_id, time_of_day, description, enabled, sort_order")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("task_attachments")
          .select(ATTACHMENT_COLUMNS)
          .eq("user_id", userId)
          .order("sort_order", { ascending: true }),
      ]);

      const firstError = [
        lanesResult,
        labelsResult,
        tasksResult,
        assignmentsResult,
        checklistsResult,
        itemsResult,
        alarmsResult,
        attachmentsResult,
      ].find((result) => result.error)?.error;

      if (!active) return;
      if (firstError) {
        reportSyncError("Nao consegui carregar suas tarefas salvas.", firstError);
        setBoardReady(true);
        return;
      }

      const assignmentsByTask = new Map();
      (assignmentsResult.data || []).sort(bySort).forEach((assignment) => {
        const list = assignmentsByTask.get(assignment.task_id) || [];
        list.push(assignment.label_id);
        assignmentsByTask.set(assignment.task_id, list);
      });

      const itemsByChecklist = new Map();
      (itemsResult.data || []).sort(bySort).forEach((item) => {
        const list = itemsByChecklist.get(item.checklist_id) || [];
        list.push({
          id: item.id,
          text: item.text || "",
          done: !!item.done,
          dueDate: item.due_date || "",
          sortOrder: item.sort_order,
        });
        itemsByChecklist.set(item.checklist_id, list);
      });

      const checklistsByTask = new Map();
      (checklistsResult.data || []).sort(bySort).forEach((checklist, index) => {
        const list = checklistsByTask.get(checklist.task_id) || [];
        list.push(
          cleanChecklist(
            {
              id: checklist.id,
              title: checklist.title,
              sort_order: checklist.sort_order,
              items: itemsByChecklist.get(checklist.id) || [],
            },
            index
          )
        );
        checklistsByTask.set(checklist.task_id, list);
      });

      const attachmentsByTask = new Map();
      (attachmentsResult.data || []).sort(bySort).forEach((row) => {
        const list = attachmentsByTask.get(row.task_id) || [];
        list.push(attachmentFromRow(row));
        attachmentsByTask.set(row.task_id, list);
      });

      const cardsByLane = new Map();
      (tasksResult.data || []).sort(bySort).forEach((task) => {
        if (!task.lane_id) return;
        const list = cardsByLane.get(task.lane_id) || [];
        list.push({
          id: task.id,
          title: task.title || "",
          description: task.description || "",
          done: !!task.done,
          labels: assignmentsByTask.get(task.id) || [],
          checklists: checklistsByTask.get(task.id) || [],
          attachments: attachmentsByTask.get(task.id) || [],
          cover: coverFromRow(task),
          startDate: task.start_date || null,
          dueAt: task.due_at || null,
          reminderTime: task.reminder_time ? String(task.reminder_time).slice(0, 5) : null,
          reminderRepeat: task.reminder_time ? task.reminder_repeat || "once" : null,
          reminderDays: task.reminder_days || [],
          period: task.period || null,
          order: task.sort_order ?? list.length,
        });
        cardsByLane.set(task.lane_id, list);
      });

      const alarmsByLane = new Map();
      (alarmsResult.data || []).sort(bySort).forEach((alarm) => {
        const list = alarmsByLane.get(alarm.lane_id) || [];
        list.push({
          id: alarm.id,
          time: String(alarm.time_of_day || "").slice(0, 5),
          description: alarm.description || "",
          enabled: alarm.enabled !== false,
          order: alarm.sort_order ?? list.length,
        });
        alarmsByLane.set(alarm.lane_id, list);
      });

      const nextLabels = (labelsResult.data || []).map((label, index) => ({
        id: label.id,
        clientKey: label.client_key,
        name: label.name || "",
        color: label.color || "transparent",
        sortOrder: label.sort_order ?? index,
      }));

      const nextLanes = (lanesResult.data || []).sort(bySort).map((lane, index) => ({
        id: lane.id,
        dayKey: lane.day_key,
        title: lane.title,
        mode: lane.mode || "default",
        collapsed: !!lane.collapsed,
        sortOrder: lane.sort_order ?? index,
        cards: cardsByLane.get(lane.id) || [],
        alarms: alarmsByLane.get(lane.id) || [],
      }));

      const hasCustomLane = nextLanes.some((l) => !isWeekDayKey(l.dayKey));
      let finalLanes = nextLanes.length ? nextLanes : fallbackLanes();
      if (nextLanes.length && !hasCustomLane) {
        const id = makeClientId();
        const initLane = {
          id,
          dayKey: `default-${id}`,
          title: "Lista 1",
          mode: "default",
          collapsed: false,
          sortOrder: -1,
          cards: [],
          alarms: [],
        };
        supabase.from("task_lanes").insert({
          id: initLane.id,
          user_id: userId,
          day_key: initLane.dayKey,
          title: initLane.title,
          mode: initLane.mode,
          collapsed: false,
          sort_order: initLane.sortOrder,
        }).then(({ error }) => {
          if (error) console.warn("[board] erro ao criar lista padrão:", error);
        });
        finalLanes = [initLane, ...nextLanes];
      }

      // Primeiro acesso ao modo Padrao: abre com as colunas recolhidas (uma vez
      // so; depois respeita o manual). Feito antes do setLanes, pras colunas ja
      // nascerem recolhidas (sem flash). Espelha o comportamento da Semana.
      let lanesToSet = finalLanes;
      if (!localStorage.getItem("fluxtime.default-collapsed-init")) {
        localStorage.setItem("fluxtime.default-collapsed-init", "1");
        lanesToSet = finalLanes.map((lane) =>
          isWeekDayKey(lane.dayKey) ? lane : { ...lane, collapsed: true }
        );
        if (remoteEnabled) {
          const ids = lanesToSet
            .filter((lane) => !isWeekDayKey(lane.dayKey))
            .map((lane) => lane.id);
          if (ids.length) {
            supabase
              .from("task_lanes")
              .update({ collapsed: true })
              .eq("user_id", userId)
              .in("id", ids)
              .then(({ error }) => {
                if (error) console.warn("[board] erro ao recolher padrao:", error);
              });
          }
        }
      }

      setLabels(nextLabels);
      setRuntimeLabels(nextLabels);
      setLanes(lanesToSet);
      setBoardMode("default");
      setBoardReady(true);
    }

    loadBoard();

    return () => {
      active = false;
    };
  }, [remoteEnabled, userId]);

  // Roda vertical do mouse rola o board na horizontal (a barra fica embaixo).
  // Listener nao-passivo para poder previnir o scroll vertical da pagina.
  // Tambem ameniza o corte das bordas: liga o fade so na ponta que pode rolar.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      // Se ja estiver rolando na horizontal (trackpad), deixa nativo.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const updateFades = () => {
      const max = el.scrollWidth - el.clientWidth;
      const canLeft = el.scrollLeft > 4;
      const canRight = el.scrollLeft < max - 4;
      el.style.setProperty("--fade-l", canLeft ? "44px" : "0px");
      el.style.setProperty("--fade-r", canRight ? "64px" : "0px");
    };
    updateFades();
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, []);

  const persistLanePatch = (laneId, patch) => {
    setLanes((list) =>
      list.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane))
    );
    if (!remoteEnabled) return;
    const row = {};
    if ("title" in patch) row.title = patch.title;
    if ("mode" in patch) row.mode = patch.mode;
    if ("collapsed" in patch) row.collapsed = patch.collapsed;
    if (!Object.keys(row).length) return;
    supabase
      .from("task_lanes")
      .update(row)
      .eq("id", laneId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui salvar a lista.", error);
      });
  };

  const changeBoardMode = (nextMode) => {
    if (nextMode === boardMode) return;
    lanesAnimated.current = false;
    setBoardMode(nextMode);
    // No primeiro acesso ao Modo Semana, abre tudo recolhido (uma vez so;
    // depois respeita o que o usuario expandir/recolher). Feito aqui, junto da
    // troca de modo, pra as colunas ja nascerem recolhidas (sem flash).
    const collapseWeekInit =
      nextMode === "week" &&
      boardReady &&
      !localStorage.getItem("fluxtime.week-collapsed-init");
    if (collapseWeekInit) {
      localStorage.setItem("fluxtime.week-collapsed-init", "1");
    }
    setLanes((list) =>
      list.map((lane) => ({
        ...lane,
        mode: nextMode,
        collapsed:
          collapseWeekInit && isWeekDayKey(lane.dayKey) ? true : lane.collapsed,
      }))
    );
    if (!remoteEnabled) return;
    supabase
      .from("task_lanes")
      .update({ mode: nextMode })
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui salvar o modo do quadro.", error);
      });
    if (collapseWeekInit) {
      supabase
        .from("task_lanes")
        .update({ collapsed: true })
        .eq("user_id", userId)
        .in("day_key", WEEK_DAY_KEYS)
        .then(({ error }) => {
          if (error) console.warn("[board] erro ao recolher semana:", error);
        });
    }
  };

  // Uma unica chamada transacional (RPC save_task_card): o cartao nunca fica
  // salvo pela metade. due_date dos itens nao e enviado — o banco o preserva.
  const syncCardNow = async (laneId, card) => {
    if (!remoteEnabled) return;
    const { error } = await supabase.rpc("save_task_card", {
      p_card: {
        id: card.id,
        lane_id: laneId,
        title: card.title || "",
        description: card.description || "",
        done: !!card.done,
        period: card.period || null,
        sort_order: card.order ?? 0,
        labels: card.labels || [],
        cover: coverToPayload(card.cover, card.attachments),
        start_date: card.startDate || null,
        due_at: card.dueAt || null,
        reminder_time: card.reminderTime || null,
        reminder_repeat: card.reminderTime ? card.reminderRepeat || "once" : null,
        reminder_days: card.reminderTime && card.reminderRepeat === "days" ? card.reminderDays || [] : null,
        checklists: (card.checklists || []).map(cleanChecklist).map((list, index) => ({
          id: list.id,
          title: list.title || "Checklist",
          sort_order: list.sortOrder ?? index,
          items: (list.items || []).map((item, itemIndex) => ({
            id: item.id,
            text: item.text || "",
            done: !!item.done,
            sort_order: item.sortOrder ?? itemIndex,
          })),
        })),
      },
    });
    if (error) reportSyncError("Nao consegui salvar o cartao.", error);
  };

  const patchCardLocal = (cardId, fn) => {
    setLanes((list) =>
      list.map((lane) =>
        lane.cards.some((card) => card.id === cardId)
          ? { ...lane, cards: lane.cards.map((card) => (card.id === cardId ? fn(card) : card)) }
          : lane
      )
    );
  };

  // Anexos sao gravados na hora (fora do rascunho do modal) e so atualizam o
  // estado local do cartao; a capa que apontava para um anexo apagado o banco
  // ja limpou sozinho.
  const attachmentsApi = {
    enabled: remoteEnabled,
    upload: async (card, file) => {
      await cardSyncQueue.current.get(card.id);
      const att = await uploadAttachment({
        userId,
        taskId: card.id,
        file,
        sortOrder: (card.attachments || []).length,
      });
      patchCardLocal(card.id, (current) => ({
        ...current,
        attachments: [...(current.attachments || []), att],
      }));
      return att;
    },
    remove: async (card, att) => {
      await deleteAttachment(att);
      patchCardLocal(card.id, (current) => ({
        ...current,
        attachments: (current.attachments || []).filter((item) => item.id !== att.id),
        cover:
          current.cover?.type === "image" && current.cover.attachmentId === att.id
            ? NO_COVER
            : current.cover,
      }));
    },
  };

  // Mantém as gravações de CADA cartão em sequência. Cartões diferentes ainda
  // sincronizam em paralelo, mas um mesmo cartão jamais recria etiquetas duas
  // vezes ao mesmo tempo.
  const syncCard = (laneId, card) => {
    if (!remoteEnabled) return Promise.resolve();
    const previous = cardSyncQueue.current.get(card.id) || Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(() => syncCardNow(laneId, card));

    cardSyncQueue.current.set(card.id, queued);
    queued.finally(() => {
      if (cardSyncQueue.current.get(card.id) === queued) {
        cardSyncQueue.current.delete(card.id);
      }
    });
    return queued;
  };

  const persistCard = (laneId, nextCard) => {
    setLanes((list) =>
      list.map((lane) =>
        lane.id === laneId
          ? {
              ...lane,
              cards: lane.cards.some((card) => card.id === nextCard.id)
                ? lane.cards.map((card) => (card.id === nextCard.id ? nextCard : card))
                : [...lane.cards, nextCard],
            }
          : lane
      )
    );
    syncCard(laneId, nextCard);
  };

  // Move um card entre colunas/dias (drop cross-lane). Mantem o `period` do
  // card (sem perguntar nada no drop) e o insere no fim da faixa equivalente
  // no dia de destino. NAO usa `deleteCard` (apaga a linha no Supabase) — o
  // `syncCard` ja faz upsert pelo mesmo id com o `lane_id` novo, o que move a
  // linha sozinho.
  const moveCardAcrossLanes = (fromLaneId, toLaneId, cardId) => {
    setLanes((list) => {
      const fromLane = list.find((lane) => lane.id === fromLaneId);
      const card = fromLane?.cards.find((c) => c.id === cardId);
      if (!card) return list;
      const period = card.period ?? null;
      const toLane = list.find((lane) => lane.id === toLaneId);
      const band = (toLane?.cards || []).filter((c) => (c.period ?? null) === period);
      const order = band.length ? Math.max(...band.map((c) => c.order ?? 0)) + 1 : 0;
      const movedCard = { ...card, order };
      syncCard(toLaneId, movedCard);
      return list.map((lane) => {
        if (lane.id === fromLaneId) {
          return { ...lane, cards: lane.cards.filter((c) => c.id !== cardId) };
        }
        if (lane.id === toLaneId) {
          return { ...lane, cards: [...lane.cards, movedCard] };
        }
        return lane;
      });
    });
  };

  const deleteCard = (laneId, cardId) => {
    const attachments =
      lanes.find((lane) => lane.id === laneId)?.cards.find((card) => card.id === cardId)
        ?.attachments || [];
    setLanes((list) =>
      list.map((lane) =>
        lane.id === laneId
          ? { ...lane, cards: lane.cards.filter((card) => card.id !== cardId) }
          : lane
      )
    );
    if (!remoteEnabled) return;
    // A linha some em cascada com os anexos; os arquivos saem do Storage depois.
    supabase
      .from("tasks")
      .delete()
      .eq("id", cardId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui excluir o cartao.", error);
        else removeAttachmentFiles(attachments);
      });
  };

  const archiveCards = (laneId, cards) => {
    setLanes((list) =>
      list.map((lane) => (lane.id === laneId ? { ...lane, cards: [] } : lane))
    );
    if (!remoteEnabled || !cards.length) return;
    supabase
      .from("tasks")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .in(
        "id",
        cards.map((card) => card.id)
      )
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui arquivar os cartoes.", error);
      });
  };

  // Arquiva UM cartao (menu "…" do modal): sai do quadro, fica no banco.
  const archiveCard = (laneId, cardId) => {
    setLanes((list) =>
      list.map((lane) =>
        lane.id === laneId
          ? { ...lane, cards: lane.cards.filter((card) => card.id !== cardId) }
          : lane
      )
    );
    if (!remoteEnabled) return;
    supabase
      .from("tasks")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", cardId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui arquivar o cartao.", error);
      });
  };

  const persistAlarm = (laneId, alarm) => {
    setLanes((list) =>
      list.map((lane) =>
        lane.id === laneId
          ? {
              ...lane,
              alarms: lane.alarms.some((item) => item.id === alarm.id)
                ? lane.alarms.map((item) => (item.id === alarm.id ? alarm : item))
                : [...lane.alarms, alarm],
            }
          : lane
      )
    );
    if (!remoteEnabled) return;
    supabase
      .from("task_alarms")
      .upsert(
        {
          id: alarm.id,
          user_id: userId,
          lane_id: laneId,
          time_of_day: `${alarm.time}:00`,
          description: alarm.description || "",
          enabled: alarm.enabled !== false,
          sort_order: alarm.order ?? 0,
        },
        { onConflict: "id" }
      )
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui salvar o alarme.", error);
      });
  };

  const deleteAlarm = (laneId, alarmId) => {
    setLanes((list) =>
      list.map((lane) =>
        lane.id === laneId
          ? { ...lane, alarms: lane.alarms.filter((alarm) => alarm.id !== alarmId) }
          : lane
      )
    );
    if (!remoteEnabled) return;
    supabase
      .from("task_alarms")
      .delete()
      .eq("id", alarmId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui excluir o alarme.", error);
      });
  };

  const deleteLane = (laneId) => {
    const lane = lanes.find((item) => item.id === laneId);
    if (!lane || isWeekDayKey(lane.dayKey)) return;
    setLanes((list) => list.filter((item) => item.id !== laneId));
    if (!remoteEnabled) return;
    supabase
      .from("task_lanes")
      .delete()
      .eq("id", laneId)
      .then(({ error }) => {
        if (!error) return;
        setLanes((list) => [...list, lane].sort(bySort));
        reportSyncError("Nao consegui excluir a coluna.", error);
      });
  };

  const createLabel = (label) => {
    const nextLabel = { ...label, sortOrder: labels.length };
    setLabels((current) => {
      const next = current.some((item) => item.id === label.id)
        ? current
        : [...current, nextLabel];
      setRuntimeLabels(next);
      return next;
    });
    if (!remoteEnabled) return;
    supabase
      .from("task_labels")
      .insert({
        id: nextLabel.id,
        user_id: userId,
        client_key: null,
        name: nextLabel.name || "",
        color: nextLabel.color || "transparent",
        sort_order: nextLabel.sortOrder,
      })
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui criar a etiqueta.", error);
      });
  };

  const updateLabel = (label) => {
    setLabels((current) => {
      const next = current.map((item) => (item.id === label.id ? { ...item, ...label } : item));
      setRuntimeLabels(next);
      return next;
    });
    if (!remoteEnabled) return;
    supabase
      .from("task_labels")
      .update({ name: label.name || "", color: label.color || "transparent" })
      .eq("id", label.id)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui salvar a etiqueta.", error);
      });
  };

  // Excluir etiqueta: sai do catalogo e de todos os cartoes. No banco, as
  // ligacoes com cartoes caem em cascata (task_label_assignments).
  const deleteLabel = (labelId) => {
    setLabels((current) => {
      const next = current.filter((item) => item.id !== labelId);
      setRuntimeLabels(next);
      return next;
    });
    setLanes((list) =>
      list.map((lane) => ({
        ...lane,
        cards: lane.cards.map((card) =>
          (card.labels || []).includes(labelId)
            ? { ...card, labels: card.labels.filter((id) => id !== labelId) }
            : card
        ),
      }))
    );
    if (!remoteEnabled) return;
    supabase
      .from("task_labels")
      .delete()
      .eq("id", labelId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui excluir a etiqueta.", error);
      });
  };

  const persistLaneOrder = (nextLanes) => {
    if (!remoteEnabled) return;
    Promise.all(
      nextLanes.map((lane, index) =>
        supabase
          .from("task_lanes")
          .update({ sort_order: index })
          .eq("id", lane.id)
      )
    ).then((results) => {
      const error = results.find((result) => result.error)?.error;
      if (error) reportSyncError("Nao consegui salvar a ordem das listas.", error);
    });
  };

  // Reordenacao das colunas pelo grip (ponteiro + GSAP). A coluna "descola" e
  // segue o cursor no eixo X; as vizinhas deslizam (Flip) para abrir espaco em
  // tempo real, entao da para ir e voltar livremente. A ordem vive aqui; as
  // keys sao estaveis, entao o estado interno de cada lane acompanha a coluna.
  // So desktop: no touch o grip nem aparece (mobile/kanban.css).
  const moveLane = (fromId, toId) => {
    setLanes((prev) => {
      const next = [...prev].sort(bySort);
      const fromIdx = next.findIndex((lane) => lane.id === fromId);
      const toIdx = next.findIndex((lane) => lane.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      next.splice(toIdx, 0, next.splice(fromIdx, 1)[0]);
      return next.map((lane, index) => ({ ...lane, sortOrder: index }));
    });
  };

  const handleLaneGripDown = (e, laneId) => {
    if (e.button !== 0 || e.pointerType === "touch" || laneDrag.current || cardDrag.current) return;
    const board = boardRef.current;
    const el = e.currentTarget.closest(".lane");
    if (!board || !el) return;
    e.preventDefault();
    const laneEls = () => [...board.querySelectorAll(".lane")];
    const drag = {
      pointerX: e.clientX,
      startX: e.clientX,
      grabX: e.clientX - el.getBoundingClientRect().left,
      started: false,
      moved: false,
      slots: [],
      raf: 0,
    };
    laneDrag.current = drag;

    // Cola a coluna no cursor: x = onde o cursor quer - posicao de layout.
    const follow = () => {
      const layoutLeft = el.getBoundingClientRect().left - gsap.getProperty(el, "x");
      gsap.set(el, { x: drag.pointerX - drag.grabX - layoutLeft, force3D: true });
    };

    // Slot mais proximo da borda esquerda da coluna arrastada = nova posicao.
    const reorder = () => {
      const left =
        drag.pointerX - drag.grabX - board.getBoundingClientRect().left + board.scrollLeft;
      let target = 0;
      drag.slots.forEach((slot, i) => {
        if (Math.abs(left - slot) < Math.abs(left - drag.slots[target])) target = i;
      });
      const els = laneEls();
      const toId = els[target]?.dataset.laneId;
      if (!toId || toId === laneId) return;
      flipState.current = Flip.getState(els.filter((node) => node !== el));
      drag.moved = true;
      flushSync(() => moveLane(laneId, toId));
      follow();
    };

    // Auto-scroll horizontal quando o cursor encosta nas bordas do quadro.
    const tick = () => {
      const r = board.getBoundingClientRect();
      const edge = 70;
      let dx = 0;
      if (drag.pointerX < r.left + edge) dx = -(r.left + edge - drag.pointerX);
      else if (drag.pointerX > r.right - edge) dx = drag.pointerX - (r.right - edge);
      if (dx) {
        board.scrollLeft += Math.max(-14, Math.min(14, dx / 5));
        follow();
        reorder();
      }
      drag.raf = requestAnimationFrame(tick);
    };

    const onMove = (ev) => {
      drag.pointerX = ev.clientX;
      if (!drag.started) {
        if (Math.abs(ev.clientX - drag.startX) < 4) return;
        drag.started = true;
        const br = board.getBoundingClientRect();
        drag.slots = laneEls().map(
          (node) => node.getBoundingClientRect().left - br.left + board.scrollLeft
        );
        document.documentElement.classList.add("is-lane-dragging");
        setLiftedLaneId(laneId);
        drag.raf = requestAnimationFrame(tick);
      }
      follow();
      reorder();
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(drag.raf);
      laneDrag.current = null;
      if (!drag.started) return;
      document.documentElement.classList.remove("is-lane-dragging");
      if (drag.moved) persistLaneOrder([...lanesRef.current].sort(bySort));
      // Encaixe suave no slot final.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.to(el, {
        x: 0,
        duration: reduce ? 0 : 0.34,
        ease: "power3.out",
        overwrite: true,
        onComplete: () => {
          gsap.set(el, { clearProps: "transform" });
          setLiftedLaneId((id) => (id === laneId ? null : id));
        },
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Move um card para (toLaneId, index) no modo Padrao e renumera `order` das
  // colunas afetadas. Sincroniza so os cards que mudaram (ordem ou coluna); o
  // upsert pelo mesmo id com `lane_id` novo move a linha no Supabase.
  const placeCard = (fromLaneId, toLaneId, cardId, index) => {
    const current = lanesRef.current;
    const card = current
      .find((lane) => lane.id === fromLaneId)
      ?.cards.find((c) => c.id === cardId);
    if (!card) return;
    const changed = [];
    const next = current.map((lane) => {
      if (lane.id !== fromLaneId && lane.id !== toLaneId) return lane;
      const cards = lane.cards.filter((c) => c.id !== cardId);
      if (lane.id === toLaneId) cards.splice(index, 0, card);
      return {
        ...lane,
        cards: cards.map((c, i) => {
          const moved = c.id === cardId && fromLaneId !== toLaneId;
          if (c.order === i && !moved) return c;
          const nextCard = { ...c, order: i };
          changed.push([lane.id, nextCard]);
          return nextCard;
        }),
      };
    });
    setLanes(next);
    changed.forEach(([id, c]) => syncCard(id, c));
  };

  // Arraste de cards no modo Padrao (ponteiro + GSAP). Um "fantasma" (clone do
  // card, position fixed) segue o cursor livre; o card original fica
  // invisivel no lugar. As colunas abrem/fecham o espaco so com transform
  // (nada de setState durante o arraste). Ao soltar, o fantasma encaixa no
  // slot e a ordem e aplicada de uma vez. So desktop.
  const handleCardPointerDown = (e, laneId, cardId) => {
    if (e.button !== 0 || e.pointerType === "touch" || cardDrag.current || laneDrag.current) {
      return;
    }
    const board = boardRef.current;
    const el = e.currentTarget;
    const srcList = el.parentElement;
    if (!board || !srcList) return;
    const GAP = 8; // gap de .lane__cards
    const drag = {
      px: e.clientX,
      py: e.clientY,
      started: false,
      target: null,
      raf: 0,
      shiftY: new WeakMap(),
      touched: new Set(),
    };
    cardDrag.current = drag;

    const lists = () => [...board.querySelectorAll(".lane:not(.is-collapsed) .lane__cards")];
    const cardsIn = (list) =>
      [...list.querySelectorAll(":scope > .kcard[data-card-id]")].filter((n) => n !== el);
    // Posicao "virtual" de layout: sem o transform do arraste e, na coluna de
    // origem, ja sem o buraco do card arrastado.
    const layoutTop = (n) =>
      n.getBoundingClientRect().top -
      gsap.getProperty(n, "y") -
      (drag.after.has(n) ? drag.H : 0);

    const findTarget = () => {
      const cx = drag.px - drag.grabX + drag.w / 2;
      const cy = drag.py - drag.grabY + drag.h / 2;
      let list = null;
      let best = Infinity;
      lists().forEach((l) => {
        const r = l.getBoundingClientRect();
        const d = cx < r.left ? r.left - cx : cx > r.right ? cx - r.right : 0;
        if (d < best) {
          best = d;
          list = l;
        }
      });
      if (!list) return null;
      const index = cardsIn(list).filter(
        (n) => layoutTop(n) + n.offsetHeight / 2 < cy
      ).length;
      return { list, index, laneId: list.closest(".lane")?.dataset.laneId };
    };

    const setY = (n, y) => {
      if ((drag.shiftY.get(n) ?? 0) === y) return;
      drag.shiftY.set(n, y);
      drag.touched.add(n);
      gsap.to(n, { y, duration: 0.22, ease: "power3.out", overwrite: true, force3D: true });
    };
    const applyShifts = () => {
      const t = drag.target;
      lists().forEach((list) => {
        cardsIn(list).forEach((n, j) => {
          let y = drag.after.has(n) ? -drag.H : 0;
          if (t && list === t.list && j >= t.index) y += drag.H;
          setY(n, y);
        });
        // Espaco extra na coluna de destino / coluna de origem encolhe.
        const foreign = t && list === t.list && list !== srcList;
        const left = t && t.list !== srcList && list === srcList;
        drag.touched.add(list);
        gsap.to(list, {
          paddingBottom: drag.padBottom + (foreign ? drag.H : 0),
          marginBottom: left ? -drag.H : 0,
          duration: 0.22,
          ease: "power3.out",
          overwrite: true,
        });
      });
    };

    const update = () => {
      gsap.set(drag.ghost, {
        x: drag.px - drag.grabX - drag.originLeft,
        y: drag.py - drag.grabY - drag.originTop,
      });
      const t = findTarget();
      if (!t) return;
      if (drag.target && t.list === drag.target.list && t.index === drag.target.index) return;
      drag.target = t;
      applyShifts();
    };

    // Auto-scroll horizontal do quadro quando o cursor encosta nas bordas.
    const tick = () => {
      const r = board.getBoundingClientRect();
      const edge = 70;
      let dx = 0;
      if (drag.px < r.left + edge) dx = -(r.left + edge - drag.px);
      else if (drag.px > r.right - edge) dx = drag.px - (r.right - edge);
      if (dx) {
        board.scrollLeft += Math.max(-14, Math.min(14, dx / 5));
        update();
      }
      drag.raf = requestAnimationFrame(tick);
    };

    const begin = () => {
      drag.started = true;
      const rect = el.getBoundingClientRect();
      drag.w = rect.width;
      drag.h = rect.height;
      drag.H = rect.height + GAP;
      drag.grabX = drag.startX - rect.left;
      drag.grabY = drag.startY - rect.top;
      drag.originLeft = rect.left;
      drag.originTop = rect.top;
      drag.insetX = rect.left - srcList.getBoundingClientRect().left;
      drag.padTop = parseFloat(getComputedStyle(srcList).paddingTop) || 0;
      drag.padBottom = parseFloat(getComputedStyle(srcList).paddingBottom) || 0;
      const srcCards = [...srcList.querySelectorAll(":scope > .kcard[data-card-id]")];
      drag.origIndex = srcCards.indexOf(el);
      drag.after = new Set(srcCards.slice(drag.origIndex + 1));

      const ghost = el.cloneNode(true);
      ghost.classList.add("kcard--ghost");
      ghost.removeAttribute("data-card-id");
      ghost.removeAttribute("tabindex");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      el.style.visibility = "hidden";
      window.getSelection()?.removeAllRanges();
      document.documentElement.classList.add("is-card-dragging");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) gsap.to(ghost, { rotation: 2, scale: 1.02, duration: 0.18, ease: "power2.out" });
      drag.target = { list: srcList, index: drag.origIndex, laneId };
      drag.raf = requestAnimationFrame(tick);
    };
    drag.startX = e.clientX;
    drag.startY = e.clientY;

    const onMove = (ev) => {
      drag.px = ev.clientX;
      drag.py = ev.clientY;
      if (!drag.started) {
        if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 5) return;
        begin();
      }
      update();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(drag.raf);
    };

    const finish = (cancelled) => {
      cleanup();
      if (!drag.started) {
        cardDrag.current = null;
        return;
      }
      // O pointerup de um arraste ainda gera um click: nao abrir o card.
      const block = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", block, true);
      setTimeout(() => window.removeEventListener("click", block, true), 0);

      if (cancelled || !drag.target) {
        drag.target = { list: srcList, index: drag.origIndex, laneId };
        applyShifts();
      }
      const t = drag.target;
      const same = t.laneId === laneId && t.index === drag.origIndex;

      // Slot final do card (coordenadas de viewport).
      let top;
      if (same) {
        top = el.getBoundingClientRect().top;
      } else {
        const others = cardsIn(t.list);
        if (t.index < others.length) {
          top = layoutTop(others[t.index]);
        } else if (others.length) {
          const last = others[others.length - 1];
          top = layoutTop(last) + last.offsetHeight + GAP;
        } else {
          top = t.list.getBoundingClientRect().top + drag.padTop;
        }
      }
      const left = t.list.getBoundingClientRect().left + drag.insetX;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      gsap.to(drag.ghost, {
        x: left - drag.originLeft,
        y: top - drag.originTop,
        rotation: 0,
        scale: 1,
        duration: reduce ? 0 : 0.26,
        ease: "power3.out",
        overwrite: true,
        onComplete: () => {
          if (!same) {
            if (t.laneId !== laneId) quietArrivals.add(cardId);
            flushSync(() => placeCard(laneId, t.laneId, cardId, t.index));
          }
          drag.touched.forEach((n) => {
            gsap.killTweensOf(n);
            gsap.set(n, { clearProps: "transform,paddingBottom,marginBottom" });
          });
          el.style.visibility = "";
          drag.ghost.remove();
          // Forca o recalculo de estilo AINDA sem transicao, para o clearProps
          // nao animar o card de volta (o "quique") quando a classe sair.
          void board.offsetHeight;
          document.documentElement.classList.remove("is-card-dragging");
          cardDrag.current = null;
        },
      });
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    const onKey = (ev) => {
      if (ev.key === "Escape" && drag.started) finish(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  };

  // ===== Modo Semana: mover card (dia/faixa/posicao) ou alarme (so na faixa) =====
  // Itens de uma faixa (cards + alarmes do periodo) na ordem manual `order`.
  const bandItemsOf = (lane, period, skip) =>
    [
      ...lane.cards
        .filter((c) => (c.period ?? null) === period && !(skip?.type === "card" && skip.id === c.id))
        .map((c) => ({ type: "card", id: c.id, order: c.order ?? 0 })),
      ...(lane.alarms || [])
        .filter((a) => periodForTime(a.time) === period && !(skip?.type === "alarm" && skip.id === a.id))
        .map((a) => ({ type: "alarm", id: a.id, order: a.order ?? 0 })),
    ].sort((x, y) => x.order - y.order);

  // Insere o item na faixa de destino e renumera a faixa inteira. Regras do
  // lembrete do card: mesma faixa em outro dia -> segue (dias fixos trocam o dia
  // antigo pelo novo); faixa diferente -> sai, com aviso.
  const placeWeekItem = ({ type, id, fromLaneId, toLaneId, toPeriod, index }) => {
    const current = lanesRef.current;
    const fromLane = current.find((l) => l.id === fromLaneId);
    const toLane = current.find((l) => l.id === toLaneId);
    if (!fromLane || !toLane) return;
    const moving =
      type === "card"
        ? fromLane.cards.find((c) => c.id === id)
        : (fromLane.alarms || []).find((a) => a.id === id);
    if (!moving) return;

    const band = bandItemsOf(toLane, toPeriod, { type, id });
    band.splice(Math.min(index, band.length), 0, { type, id });
    const orderOf = new Map(band.map((it, i) => [`${it.type}:${it.id}`, i]));

    let movedCard = null;
    if (type === "card") {
      movedCard = { ...moving, period: toPeriod, order: orderOf.get(`card:${id}`) };
      const periodChanged = (moving.period ?? null) !== toPeriod;
      if (moving.reminderTime && periodChanged) {
        movedCard = { ...movedCard, reminderTime: null, reminderRepeat: null, reminderDays: [] };
        showBoardNotice("Lembrete removido: a tarefa mudou de período.");
      } else if (
        moving.reminderTime &&
        fromLaneId !== toLaneId &&
        moving.reminderRepeat === "days"
      ) {
        const days = (moving.reminderDays || []).map((d) =>
          d === fromLane.dayKey ? toLane.dayKey : d
        );
        movedCard = { ...movedCard, reminderDays: [...new Set(days)] };
      }
    }

    const changedCards = [];
    const changedAlarms = [];
    const next = current.map((lane) => {
      if (lane.id !== fromLaneId && lane.id !== toLaneId) return lane;
      let cards = lane.cards;
      if (type === "card" && lane.id === fromLaneId) cards = cards.filter((c) => c.id !== id);
      if (lane.id === toLaneId) {
        cards = cards.map((c) => {
          const o = orderOf.get(`card:${c.id}`);
          if (o == null || o === c.order) return c;
          const nc = { ...c, order: o };
          changedCards.push([lane.id, nc]);
          return nc;
        });
        if (movedCard) {
          cards = [...cards, movedCard];
          changedCards.push([lane.id, movedCard]);
        }
      }
      let alarms = lane.alarms || [];
      if (lane.id === toLaneId) {
        alarms = alarms.map((a) => {
          const o = orderOf.get(`alarm:${a.id}`);
          if (o == null || o === a.order) return a;
          const na = { ...a, order: o };
          changedAlarms.push([lane.id, na]);
          return na;
        });
      }
      return { ...lane, cards, alarms };
    });
    setLanes(next);
    changedCards.forEach(([laneId, c]) => syncCard(laneId, c));
    changedAlarms.forEach(([laneId, a]) => persistAlarm(laneId, a));
  };

  // Arraste no Modo Semana (ponteiro + GSAP), mesma mecanica do Padrao:
  //  - CARD: reordena na faixa, troca de faixa (muda o periodo) e de dia; faixas
  //    vazias aparecem como alvo durante o arraste. "A definir" so e origem.
  //  - ALARME: so reordena dentro da propria faixa (a faixa vem do horario).
  // Ao soltar, a mudanca e aplicada de uma vez e o GSAP Flip desliza o resto;
  // o fantasma voa ate o lugar final do item.
  const handleWeekPointerDown = (e, laneId, type, itemId) => {
    if (e.button !== 0 || e.pointerType === "touch" || cardDrag.current || laneDrag.current) {
      return;
    }
    const board = boardRef.current;
    const el = e.currentTarget;
    const srcBand = el.parentElement;
    if (!board || !srcBand?.dataset.period) return;
    const GAP = 8;
    const ITEM_SEL = ":scope > .kcard[data-card-id], :scope > .lane__alarm-item[data-alarm-id]";
    const drag = {
      px: e.clientX,
      py: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      target: null,
      raf: 0,
      shiftY: new WeakMap(),
      touched: new Set(),
      after: new Set(),
    };
    cardDrag.current = drag;

    const bandsAll = () => [...board.querySelectorAll(".lane:not(.is-collapsed) .lane__period")];
    const allowed = (band) =>
      type === "alarm" ? band === srcBand : band.dataset.period !== "pending";
    const itemsIn = (band) => [...band.querySelectorAll(ITEM_SEL)].filter((n) => n !== el);
    const layoutTop = (n) =>
      n.getBoundingClientRect().top - gsap.getProperty(n, "y") - (drag.after.has(n) ? drag.H : 0);

    const findTarget = () => {
      const cx = drag.px - drag.grabX + drag.w / 2;
      const cy = drag.py - drag.grabY + drag.h / 2;
      const bands = bandsAll().filter(allowed);
      if (!bands.length) return null;
      // Coluna mais proxima no eixo X; dentro dela, a faixa mais proxima no Y.
      let lane = null;
      let bestX = Infinity;
      bands.forEach((b) => {
        const r = b.closest(".lane").getBoundingClientRect();
        const d = cx < r.left ? r.left - cx : cx > r.right ? cx - r.right : 0;
        if (d < bestX) {
          bestX = d;
          lane = b.closest(".lane");
        }
      });
      const inLane = bands.filter((b) => b.closest(".lane") === lane);
      const distY = (b) => {
        const r = b.getBoundingClientRect();
        return cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      };
      let band = inLane[0];
      inLane.forEach((b) => {
        if (distY(b) < distY(band)) band = b;
      });
      // Histerese: a faixa atual segura o alvo perto da borda (sem tremer).
      const cur = drag.target?.band;
      if (cur && inLane.includes(cur) && distY(cur) <= 14) band = cur;
      const index = itemsIn(band).filter((n) => layoutTop(n) + n.offsetHeight / 2 < cy).length;
      return { band, index, laneId: lane.dataset.laneId, period: band.dataset.period };
    };

    const setY = (n, y) => {
      if ((drag.shiftY.get(n) ?? 0) === y) return;
      drag.shiftY.set(n, y);
      drag.touched.add(n);
      gsap.to(n, { y, duration: 0.22, ease: "power3.out", overwrite: true, force3D: true });
    };
    const applyShifts = () => {
      const t = drag.target;
      bandsAll().forEach((band) => {
        itemsIn(band).forEach((n, j) => {
          let y = drag.after.has(n) ? -drag.H : 0;
          if (t && band === t.band && j >= t.index) y += drag.H;
          setY(n, y);
        });
        const foreign = t && band === t.band && band !== srcBand;
        const left = t && t.band !== srcBand && band === srcBand;
        band.classList.toggle("is-drop-target", Boolean(foreign || (t && band === t.band)));
        drag.touched.add(band);
        gsap.to(band, {
          paddingBottom: (drag.padOf.get(band) ?? 0) + (foreign ? drag.H : 0),
          marginBottom: left ? -drag.H : 0,
          duration: 0.22,
          ease: "power3.out",
          overwrite: true,
        });
      });
    };

    const update = () => {
      gsap.set(drag.ghost, {
        x: drag.px - drag.grabX - drag.originLeft,
        y: drag.py - drag.grabY - drag.originTop,
      });
      const t = findTarget();
      if (!t) return;
      if (drag.target && t.band === drag.target.band && t.index === drag.target.index) return;
      drag.target = t;
      applyShifts();
    };

    const tick = () => {
      const r = board.getBoundingClientRect();
      const edge = 70;
      let dx = 0;
      if (drag.px < r.left + edge) dx = -(r.left + edge - drag.px);
      else if (drag.px > r.right - edge) dx = drag.px - (r.right - edge);
      if (dx) {
        board.scrollLeft += Math.max(-14, Math.min(14, dx / 5));
        update();
      }
      drag.raf = requestAnimationFrame(tick);
    };

    const begin = () => {
      drag.started = true;
      const pre = el.getBoundingClientRect();
      drag.grabX = drag.startX - pre.left;
      drag.grabY = drag.startY - pre.top;
      // Card: mostra as faixas vazias ANTES de medir (o layout muda).
      if (type === "card") flushSync(() => setWeekDropBands(true));
      const rect = el.getBoundingClientRect();
      drag.w = rect.width;
      drag.h = rect.height;
      drag.H = rect.height + GAP;
      drag.originLeft = rect.left;
      drag.originTop = rect.top;
      drag.padOf = new Map(
        bandsAll().map((b) => [b, parseFloat(getComputedStyle(b).paddingBottom) || 0])
      );
      const srcItems = [...srcBand.querySelectorAll(ITEM_SEL)];
      drag.origIndex = srcItems.indexOf(el);
      drag.after = new Set(srcItems.slice(drag.origIndex + 1));

      const ghost = el.cloneNode(true);
      ghost.classList.add("drag-ghost");
      if (type === "card") ghost.classList.add("kcard--ghost");
      ghost.removeAttribute("data-card-id");
      ghost.removeAttribute("data-alarm-id");
      ghost.removeAttribute("tabindex");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      el.style.visibility = "hidden";
      window.getSelection()?.removeAllRanges();
      document.documentElement.classList.add("is-card-dragging");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) gsap.to(ghost, { rotation: 1.5, scale: 1.02, duration: 0.18, ease: "power2.out" });
      drag.target = {
        band: srcBand,
        index: drag.origIndex,
        laneId,
        period: srcBand.dataset.period,
      };
      drag.raf = requestAnimationFrame(tick);
      update();
    };

    const onMove = (ev) => {
      drag.px = ev.clientX;
      drag.py = ev.clientY;
      if (!drag.started) {
        if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 5) return;
        begin();
      }
      update();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(drag.raf);
    };

    const finish = (cancelled) => {
      cleanup();
      if (!drag.started) {
        cardDrag.current = null;
        return;
      }
      // O pointerup de um arraste ainda gera um click: nao abrir card/alarme.
      const block = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", block, true);
      setTimeout(() => window.removeEventListener("click", block, true), 0);

      const origin = { band: srcBand, index: drag.origIndex, laneId, period: srcBand.dataset.period };
      const t = cancelled || !drag.target ? origin : drag.target;
      const same = t.band === srcBand && t.index === drag.origIndex;

      // Aplica tudo de uma vez: limpa os deslocamentos, grava a mudanca, tira
      // as faixas vazias e desliza o resto do quadro (Flip) ate o layout novo.
      const flipTargets = [
        ...board.querySelectorAll(
          ".lane:not(.is-collapsed) .lane__period > *, .lane:not(.is-collapsed) .lane__foot"
        ),
      ].filter((n) => n !== el);
      const state = Flip.getState(flipTargets);
      drag.touched.forEach((n) => {
        gsap.killTweensOf(n);
        gsap.set(n, { clearProps: "transform,paddingBottom,marginBottom" });
        n.classList?.remove("is-drop-target");
      });
      el.style.visibility = "";
      flushSync(() => {
        if (!same) {
          placeWeekItem({
            type,
            id: itemId,
            fromLaneId: laneId,
            toLaneId: t.laneId,
            toPeriod: t.period === "pending" ? null : t.period,
            index: t.index,
          });
        }
        setWeekDropBands(false);
      });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // A transicao CSS do .kcard (hover) so volta DEPOIS do Flip, senao ela
      // brigaria com o transform do GSAP (o "quique").
      Flip.from(state, {
        duration: reduce ? 0 : 0.3,
        ease: "power3.out",
        force3D: true,
        onComplete: () => {
          void board.offsetHeight;
          document.documentElement.classList.remove("is-card-dragging");
        },
      });

      // Fantasma voa ate a posicao final do item (elemento novo se mudou de dia).
      const attr = type === "card" ? "data-card-id" : "data-alarm-id";
      const finalEl = board.querySelector(`[${attr}="${itemId}"]`);
      const endRect = finalEl?.getBoundingClientRect();
      if (finalEl) finalEl.style.visibility = "hidden";
      const done = () => {
        if (finalEl) finalEl.style.visibility = "";
        drag.ghost.remove();
        cardDrag.current = null;
        // Rede de seguranca caso o Flip nao tenha alvos (onComplete imediato).
        setTimeout(() => document.documentElement.classList.remove("is-card-dragging"), 400);
      };
      if (!endRect || reduce) {
        done();
        return;
      }
      gsap.to(drag.ghost, {
        x: endRect.left - drag.originLeft,
        y: endRect.top - drag.originTop,
        rotation: 0,
        scale: 1,
        duration: 0.28,
        ease: "power3.out",
        overwrite: true,
        onComplete: done,
      });
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    const onKey = (ev) => {
      if (ev.key === "Escape" && drag.started) finish(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  };

  const orderedLanes = [...lanes].sort(bySort);
  const weekLanes = orderedLanes.filter((lane) => isWeekDayKey(lane.dayKey)).slice(0, 7);
  const defaultLanes = orderedLanes.filter((lane) => !isWeekDayKey(lane.dayKey));
  const visibleLanes = boardMode === "default" ? defaultLanes : weekLanes;
  const canCreateDefaultLane =
    boardMode === "default" && defaultLanes.length < DEFAULT_LANE_LIMIT;

  const createDefaultLane = () => {
    if (!canCreateDefaultLane) return;
    const id = makeClientId();
    const nextIndex = defaultLanes.length + 1;
    const nextSortOrder =
      lanes.reduce((max, lane) => Math.max(max, lane.sortOrder ?? 0), -1) + 1;
    const nextLane = {
      id,
      dayKey: `default-${id}`,
      title: `Lista ${nextIndex}`,
      mode: boardMode,
      collapsed: false,
      sortOrder: nextSortOrder,
      cards: [],
      alarms: [],
    };

    pendingLaneAnimation.current = id;
    setLanes((list) => [...list, nextLane]);

    if (!remoteEnabled) return;
    supabase
      .from("task_lanes")
      .insert({
        id: nextLane.id,
        user_id: userId,
        day_key: nextLane.dayKey,
        title: nextLane.title,
        mode: nextLane.mode,
        collapsed: false,
        sort_order: nextLane.sortOrder,
        metadata: { board_mode: "default" },
      })
      .then(({ error }) => {
        if (!error) return;
        setLanes((list) => list.filter((lane) => lane.id !== id));
        reportSyncError("Nao consegui criar a nova lista.", error);
      });
  };

  // Anima o deslize das colunas vizinhas apos a ordem mudar (GSAP Flip). Sem
  // `absolute`: tirar as vizinhas do fluxo empurraria a coluna arrastada.
  useLayoutEffect(() => {
    if (!flipState.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    Flip.from(flipState.current, {
      duration: reduce ? 0 : 0.32,
      ease: "power3.out",
      force3D: true,
      overwrite: true,
    });
    flipState.current = null;
  }, [lanes]);

  // Entrada da secao Tarefas: as colunas reais so aparecem depois do sync, em cascata.
  useLayoutEffect(() => {
    if (!boardReady) {
      lanesAnimated.current = false;
      return undefined;
    }

    const board = boardRef.current;
    if (!board) return undefined;

    const pendingId = pendingLaneAnimation.current;
    if (pendingId) {
      const lane = board.querySelector(`[data-lane-id="${pendingId}"]`);
      pendingLaneAnimation.current = null;
      if (!lane) return undefined;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        gsap.set(lane, { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)" });
        return undefined;
      }
      const tween = gsap.fromTo(
        lane,
        { autoAlpha: 0, y: 12, scale: 0.985, filter: "blur(6px)" },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.36,
          ease: "power3.out",
          clearProps: "opacity,visibility,transform,filter",
        }
      );
      return () => tween.kill();
    }

    if (lanesAnimated.current) return undefined;

    const laneNodes = Array.from(board.children).filter((node) =>
      node.classList?.contains("lane")
    );
    if (!laneNodes.length) return undefined;

    lanesAnimated.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      gsap.set(laneNodes, { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)" });
      return undefined;
    }

    const tween = gsap.fromTo(
      laneNodes,
      { autoAlpha: 0, y: 18, scale: 0.985, filter: "blur(8px)" },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.48,
        ease: "power3.out",
        stagger: 0.075,
        clearProps: "opacity,visibility,transform,filter",
      }
    );

    return () => tween.kill();
  }, [boardReady, boardMode, visibleLanes.length]);

  return (
    <main className="tarefas">
      <div className="tarefas-toolbar" aria-label="Modo de visualizacao das tarefas">
        <h1 className="tarefas-title">Tarefas</h1>
        <div className="tarefas-mode" role="tablist" aria-label="Modo do quadro">
          <button
            type="button"
            role="tab"
            aria-selected={boardMode === "default"}
            className={`tarefas-mode__item${boardMode === "default" ? " is-active" : ""}`}
            onClick={() => changeBoardMode("default")}
          >
            <List size={14} strokeWidth={2.3} />
            <span>Padrão</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={boardMode === "week"}
            className={`tarefas-mode__item${boardMode === "week" ? " is-active" : ""}`}
            onClick={() => changeBoardMode("week")}
          >
            <CalendarDays size={14} strokeWidth={2.3} />
            <span>Semana</span>
          </button>
        </div>
      </div>
      {boardNotice ? (
        <div className="sync-status sync-status--info" role="status">
          <span>{boardNotice}</span>
        </div>
      ) : null}
      <div className="tarefas__lanes" ref={boardRef}>
      {syncError ? (
        <div className="sync-status sync-status--error" role="status">
          <span>{syncError}</span>
          <button type="button" onClick={() => setSyncError("")} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      ) : null}
      {boardReady ? visibleLanes.map((lane) => (
        <DayLane
          key={lane.id}
          dayKey={lane.dayKey}
          day={isWeekDayKey(lane.dayKey)
            ? DIAS_SEMANA[WEEK_DAY_KEYS.indexOf(lane.dayKey)]
            : lane.title}
          laneId={lane.id}
          initialName={lane.title}
          initialCards={lane.cards}
          initialCollapsed={lane.collapsed}
          initialMode={lane.mode}
          mode={boardMode}
          initialAlarms={remoteEnabled ? lane.alarms : null}
          labelCatalog={labels}
          attachmentsApi={attachmentsApi}
          onLanePatch={(patch) => persistLanePatch(lane.id, patch)}
          onCreateCard={(card) => persistCard(lane.id, card)}
          onUpdateCard={(card) => persistCard(lane.id, card)}
          onDeleteCard={(cardId) => deleteCard(lane.id, cardId)}
          onArchiveCards={(cards) => archiveCards(lane.id, cards)}
          onArchiveCard={(cardId) => archiveCard(lane.id, cardId)}
          onCrossLaneDrop={({ cardId, fromLaneId }) =>
            moveCardAcrossLanes(fromLaneId, lane.id, cardId)
          }
          onDeleteLane={() => deleteLane(lane.id)}
          canDeleteLane={!isWeekDayKey(lane.dayKey)}
          onCreateAlarm={(alarm) => persistAlarm(lane.id, alarm)}
          onUpdateAlarm={(alarm) => persistAlarm(lane.id, alarm)}
          onDeleteAlarm={(alarmId) => deleteAlarm(lane.id, alarmId)}
          onCreateLabel={createLabel}
          onUpdateLabel={updateLabel}
          onDeleteLabel={deleteLabel}
          lifted={liftedLaneId === lane.id}
          onLaneGripDown={(e) => handleLaneGripDown(e, lane.id)}
          onCardPointerDown={(e, cardId) => handleCardPointerDown(e, lane.id, cardId)}
          onWeekItemPointerDown={(e, type, id) => handleWeekPointerDown(e, lane.id, type, id)}
          showDropBands={weekDropBands && isWeekDayKey(lane.dayKey)}
          onFocusCard={onFocusTask}
        />
      )) : null}
      {boardReady && canCreateDefaultLane ? (
        <button
          type="button"
          className="tarefas-add-lane"
          onClick={createDefaultLane}
          aria-label="Criar nova coluna"
          title="Criar nova coluna"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      ) : null}
      </div>
      {weekGuideVisible && <WeekAlarmGuide onDismiss={dismissWeekGuide} />}
    </main>
  );
}

function NotifGuide({ onDismiss }) {
  const [anchorRect, setAnchorRect] = useState(null);

  useLayoutEffect(() => {
    const el = document.getElementById("notif-guide-anchor");
    if (!el) return;
    setAnchorRect(el.getBoundingClientRect());
  }, []);

  if (!anchorRect) return null;

  const TOOLTIP_W = 280;
  const cx = anchorRect.left + anchorRect.width / 2;
  const cy = anchorRect.top + anchorRect.height / 2;
  const tooltipLeft = Math.max(8, Math.min(cx - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 8));
  const tooltipTop = anchorRect.bottom + 16;
  const arrowLeft = cx - tooltipLeft - 7;

  return createPortal(
    <>
      <div
        className="week-guide-overlay"
        style={{
          background: `radial-gradient(ellipse ${anchorRect.width * 0.7}px ${anchorRect.height * 0.8}px at ${cx}px ${cy}px, transparent 55%, rgba(0,0,0,0.6) 80%)`,
        }}
        onClick={() => onDismiss(false)}
      />
      <div className="week-guide" style={{ top: tooltipTop, left: tooltipLeft, width: TOOLTIP_W }}>
        <div className="week-guide__arrow" style={{ left: Math.max(10, arrowLeft) }} />
        <p className="week-guide__title">Notificações</p>
        <p className="week-guide__body">
          Receba avisos de fim de sessão e alertas de alarme das tarefas mesmo
          com a aba fechada.
        </p>
        <button
          type="button"
          className="week-guide__btn"
          onClick={() => onDismiss(true)}
        >
          Ativar notificações
        </button>
        <button
          type="button"
          className="week-guide__btn week-guide__btn--ghost"
          onClick={() => onDismiss(false)}
        >
          Agora não
        </button>
      </div>
    </>,
    document.body
  );
}

function WeekAlarmGuide({ onDismiss }) {
  const [bellRect, setBellRect] = useState(null);

  useLayoutEffect(() => {
    const bell = document.querySelector(".lane__alarm");
    if (!bell) return;
    setBellRect(bell.getBoundingClientRect());
  }, []);

  if (!bellRect) return null;

  const TOOLTIP_W = 264;
  const cx = bellRect.left + bellRect.width / 2;
  const cy = bellRect.top + bellRect.height / 2;
  const tooltipLeft = Math.max(8, Math.min(cx - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 8));
  const tooltipTop = bellRect.bottom + 14;
  const arrowLeft = cx - tooltipLeft - 7;

  return createPortal(
    <>
      <div
        className="week-guide-overlay"
        style={{
          background: `radial-gradient(circle 30px at ${cx}px ${cy}px, transparent 24px, rgba(0,0,0,0.6) 36px)`,
        }}
        onClick={onDismiss}
      />
      <div
        className="week-guide"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="week-guide__arrow" style={{ left: Math.max(10, arrowLeft) }} />
        <p className="week-guide__title">Alarmes por dia</p>
        <p className="week-guide__body">
          Toque no sino de qualquer coluna para configurar um alarme para aquele
          dia. Ele dispara mesmo com a aba em segundo plano.
        </p>
        <button type="button" className="week-guide__btn" onClick={onDismiss}>
          Entendi
        </button>
      </div>
    </>,
    document.body
  );
}

function TimerApp({ session, onLogout, entered }) {
  const [config, setConfig] = useState(loadConfig);
  const [section, setSection] = useState("foco");
  const [settingsReady, setSettingsReady] = useState(!session?.user);
  const [settingsError, setSettingsError] = useState("");
  const userId = session?.user?.id;

  const [notifGuideVisible, setNotifGuideVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("fluxtime.notif-guide-dismissed")) return;
    const t = setTimeout(() => setNotifGuideVisible(true), 900);
    return () => clearTimeout(t);
  }, [userId]);

  const dismissNotifGuide = async (activate) => {
    localStorage.setItem("fluxtime.notif-guide-dismissed", "1");
    setNotifGuideVisible(false);
    if (activate) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") syncPushSubscription(userId);
    }
  };

  // Subscrição Web Push: dispara ao logar, silencioso se permissão negada.
  useEffect(() => {
    if (userId) syncPushSubscription(userId);
  }, [userId]);

  // Verificador global de alarmes: roda independente da secao ativa.
  const globalFiredRef = useRef(new Set());
  const [alarmToast, setAlarmToast] = useState(null);

  useEffect(() => {
    const check = () => {
      const all = loadAllAlarms();
      const active = all.filter((e) => e.alarm.enabled);
      const hhmm = nowHHMM();
      const mk = minuteKey();
      active.forEach(({ alarm }) => {
        if (alarm.time !== hhmm) return;
        const id = `${alarm.id}@${mk}`;
        if (globalFiredRef.current.has(id)) return;
        globalFiredRef.current.add(id);
        playAlarm();
        const text = alarm.description || "Hora do seu alarme.";
        const shownAsSystem = document.hidden && showAlarmNotification("🔔 Flux Time", text);
        if (!shownAsSystem) {
          setAlarmToast({ key: `${alarm.id}-${Date.now()}`, time: alarm.time, description: text });
        }
      });

      // Lembretes de cartao (Modo Semana): uma vez / todo dia / dias marcados.
      const today = weekDayKey();
      const reminders = loadCardReminders(userId);
      reminders.forEach((reminder) => {
        if (reminder.time !== hhmm || !reminderDueToday(reminder, today)) return;
        const id = `reminder:${reminder.id}@${mk}`;
        if (globalFiredRef.current.has(id)) return;
        globalFiredRef.current.add(id);
        if (reminder.repeat === "once") {
          // Uma vez: tocou, desliga (espelho local, board aberto e banco).
          saveCardReminders(userId, reminders.filter((r) => r.id !== reminder.id));
          window.dispatchEvent(
            new CustomEvent("fluxtime:reminder-done", { detail: { cardId: reminder.id } })
          );
          if (supabase && userId) {
            supabase
              .from("tasks")
              .update({ reminder_time: null, reminder_repeat: null, reminder_days: null })
              .eq("id", reminder.id)
              .then(({ error }) => {
                if (error) console.warn("[reminder] erro ao desligar lembrete:", error);
              });
          }
        }
        playAlarm();
        const text = reminder.title ? `Lembrete: ${reminder.title}` : "Lembrete do seu cartão.";
        const shownAsSystem = document.hidden && showAlarmNotification("🔔 Flux Time", text);
        if (!shownAsSystem) {
          setAlarmToast({ key: `${id}-${Date.now()}`, time: reminder.time, description: text });
        }
      });
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!supabase || !userId) {
      setSettingsReady(true);
      return undefined;
    }

    let active = true;
    setSettingsReady(false);
    setSettingsError("");

    async function loadRemoteSettings() {
      const { data, error } = await supabase
        .from("timer_settings")
        .select(
          "cycles_count, cycle_times, focus_hours, focus_minutes, focus_seconds, break_minutes, break_seconds"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setSettingsError("Nao consegui carregar suas configuracoes salvas.");
        setSettingsReady(true);
        return;
      }

      const nextConfig = configFromRow(data);
      setConfig(nextConfig);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
      setSettingsReady(true);
    }

    loadRemoteSettings();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId || !settingsReady) return undefined;

    const saveTimer = setTimeout(async () => {
      const { error } = await supabase
        .from("timer_settings")
        .upsert(rowFromConfig(userId, config), { onConflict: "user_id" });

      if (error) {
        setSettingsError("Nao consegui salvar suas configuracoes agora.");
        return;
      }

      setSettingsError("");
    }, 450);

    return () => clearTimeout(saveTimer);
  }, [config, settingsReady, userId]);

  // Plano de duracoes (segundos) por ciclo, derivado da config.
  const plan = useMemo(
    () =>
      config.cycleTimes.map((c) => ({
        focus: Math.max(
          1,
          c.focusHours * 3600 + c.focusMinutes * 60 + c.focusSeconds
        ),
        // 0 = sem break (o useTimer pula a pausa); nao forcar 1s aqui.
        break: Math.max(0, c.breakMinutes * 60 + c.breakSeconds),
      })),
    [config.cycleTimes]
  );

  // ===== Musica de fundo do modo Foco =====
  const [musicTrackId, setMusicTrackId] = useState(() => {
    const raw = localStorage.getItem("fluxtime.music.track");
    return MUSIC_TRACKS.some((t) => t.id === raw) ? raw : MUSIC_TRACKS[0]?.id;
  });
  const [musicOn, setMusicOn] = useState(() => {
    return localStorage.getItem("fluxtime.music.on") === "1";
  });
  const [musicVolume, setMusicVol] = useState(() => {
    const raw = Number(localStorage.getItem("fluxtime.music.volume"));
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
  });

  const musicSrc = useMemo(
    () => MUSIC_TRACKS.find((t) => t.id === musicTrackId)?.src ?? null,
    [musicTrackId]
  );

  // ===== Tarefa vinculada ao ciclo (Modo Semana) =====
  // Persistida por usuario: recarregar a pagina mantem o vinculo.
  const focusTaskKey = `fluxtime.focus-task.${userId || "local"}`;
  const [focusTask, setFocusTask] = useState(null);
  const focusTaskRef = useRef(null);
  focusTaskRef.current = focusTask;
  // Tarefa recem-concluida pelo fim da sessao: o selo do Foco mostra a
  // animacao "Tarefa concluida" e depois limpa.
  const [completedTask, setCompletedTask] = useState(null);

  useEffect(() => {
    try {
      setFocusTask(JSON.parse(localStorage.getItem(focusTaskKey) || "null"));
    } catch {
      setFocusTask(null);
    }
  }, [focusTaskKey]);

  const linkFocusTask = useCallback(
    (task) => {
      setFocusTask(task);
      try {
        if (task) localStorage.setItem(focusTaskKey, JSON.stringify(task));
        else localStorage.removeItem(focusTaskKey);
      } catch {
        /* ignore */
      }
    },
    [focusTaskKey]
  );

  // Fim da sessao com tarefa vinculada: o ciclo ja fazia parte da tarefa,
  // entao ela e concluida automaticamente (banco + board) e o vinculo sai.
  const completeFocusTask = (task) => {
    linkFocusTask(null);
    setCompletedTask({ ...task, key: Date.now() });
    window.dispatchEvent(new CustomEvent("fluxtime:task-done", { detail: { cardId: task.id } }));
    if (supabase && userId) {
      supabase
        .from("tasks")
        .update({ done: true, status: "done" })
        .eq("id", task.id)
        .then(({ error }) => {
          if (error) console.warn("[focus] erro ao concluir tarefa:", error);
        });
    }
  };
  const completeFocusTaskRef = useRef(completeFocusTask);
  completeFocusTaskRef.current = completeFocusTask;

  // Encerrar a sessao tambem desliga a intencao de tocar musica. So parar o
  // audio nao basta: ao voltar para o ciclo 1, o efeito de virada o iniciaria
  // de novo porque `musicOn` ainda estaria ligado.
  const handleSessionEnd = useCallback(() => {
    // Fim da sessao: sai da tela cheia e volta ao estado padrao do Foco (e la
    // que aparece o feedback de "Tarefa concluida").
    setExpanded(false);
    if (focusTaskRef.current) completeFocusTaskRef.current(focusTaskRef.current);
    stopMusic();
    setMusicOn(false);
    try {
      localStorage.setItem("fluxtime.music.on", "0");
    } catch {
      /* ignore */
    }
  }, []);

  const timer = useTimer({
    plan,
    onPhaseEnd: playPhaseEnd,
    onSessionEnd: handleSessionEnd,
  });

  // Tic-tac sutil nos ultimos 7s de cada bloco (foco e break). So quando rodando;
  // dispara a cada mudanca de segundo (7..1), e o chime fecha no 0.
  useEffect(() => {
    if (!timer.running) return;
    if (timer.remaining >= 1 && timer.remaining <= 7) playTick(timer.remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.remaining]);

  // Escolher faixa: com a musica ja ligada, crossfade pra ela na hora; senao
  // so guarda a escolha (aplica no proximo play).
  const pickTrack = useCallback((id) => {
    setMusicTrackId(id);
    try {
      localStorage.setItem("fluxtime.music.track", id);
    } catch {
      /* ignore */
    }
    const src = MUSIC_TRACKS.find((t) => t.id === id)?.src;
    if (src) switchTrackNow(src);
  }, []);

  // Liga/desliga: play/pause explicito, na hora, com o ciclo rodando ou nao.
  const toggleMusicOn = useCallback(() => {
    // Precisa acontecer diretamente no gesto do botao. Se deixarmos apenas o
    // useEffect chamar startMusic(), navegadores podem manter o AudioContext
    // suspenso quando o Pomodoro ainda nao foi iniciado.
    if (!musicOn) primeMusic();
    const next = !musicOn;
    setMusicOn(next);
    try {
      localStorage.setItem("fluxtime.music.on", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [musicOn]);

  const changeMusicVolume = useCallback((v) => {
    setMusicVol(v);
    setMusicVolume(v);
    try {
      localStorage.setItem("fluxtime.music.volume", String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const prevCycleRef = useRef(timer.cycle);

  // Volume inicial no motor (1x).
  useEffect(() => {
    setMusicVolume(musicVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Com o play/pause ligado, toca na secao Foco e, FORA dela, enquanto o ciclo
  // estiver rodando (a pilula de fundo aparece junto). Trocar de aba com o
  // ciclo rodando nao muda a condicao -> a musica segue sem reiniciar. Pausar
  // o ciclo fora do Foco para a musica. Ao entrar na condicao, reinicia do
  // zero (o motor nao guarda posicao). NAO reage a troca de faixa (`musicSrc`
  // fora das deps de proposito): isso e tratado ao vivo por `pickTrack`, via
  // crossfade, pra nao colidir reiniciando por cima.
  const musicShouldPlay = musicOn && (section === "foco" || timer.running);
  useEffect(() => {
    if (musicShouldPlay) {
      startMusic(musicSrc);
    } else {
      stopMusic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicShouldPlay]);

  // Virada de ciclo: a musica ZERA do inicio (nunca comeca o ciclo no meio).
  // So quando a musica deve estar tocando (Foco, ou fora dele com o ciclo
  // rodando) -- senao reativaria o audio com o usuario parado nas Tarefas.
  useEffect(() => {
    if (timer.cycle !== prevCycleRef.current) {
      prevCycleRef.current = timer.cycle;
      if (musicShouldPlay && musicSrc) startMusic(musicSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.cycle]);

  // Duck: ultimos 7s de qualquer fase -> ~30% (pra ouvir tic-tac + respiro);
  // volta a 100% ao entrar na proxima fase.
  useEffect(() => {
    if (!musicOn) return;
    const ducking =
      timer.running &&
      timer.remaining >= 1 &&
      timer.remaining <= 7;
    duckMusic(ducking);
  }, [timer.remaining, timer.running, section, musicOn]);

  const stopwatch = useStopwatch();

  // Mostra HH:MM:SS se QUALQUER ciclo usar horas (evita pulo de layout na troca).
  const showHours = plan.some((c) => c.focus >= 3600 || c.break >= 3600);
  const isRunning = section === "foco" && timer.running;

  // No modo foco some tudo; o movimento do mouse revela os controles por alguns
  // segundos e depois eles voltam a desaparecer (padrao de player de video).
  const [revealed, setRevealed] = useState(false);

  // Modo tela cheia dos relogios (estilo Fliqlo): o claquete cresce e enche a
  // viewport, escondendo o resto. Foco e Horario mantem estados separados,
  // pois o primeiro depende do timer e o segundo e sempre o horario atual.
  const [expanded, setExpanded] = useState(false);
  const focoExpanded = section === "foco" && expanded;
  const clockElRef = useRef(null); // raiz do .flip-clock (alvo da transicao)
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const expandMountedRef = useRef(false);
  const [clockExpanded, setClockExpanded] = useState(false);
  const horarioExpanded = section === "horario" && clockExpanded;
  const currentTimeClockRef = useRef(null);
  const clockExpandedRef = useRef(clockExpanded);
  clockExpandedRef.current = clockExpanded;
  const clockExpandMountedRef = useRef(false);
  const isHorarioRef = useRef(section === "horario");
  isHorarioRef.current = section === "horario";
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Auto-expand so onde existe ponteiro fino. No toque nao ha hover, logo nao
  // existe sinal passivo de "ainda estou aqui": um gatilho por ociosidade que
  // repete viraria armadilha (minimizou -> volta sozinho, sem como segurar).
  // No mobile a tela cheia segue manual, pelo icone.
  const canAutoExpand = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Contagem de ociosidade: apaga os controles e, no MESMO instante, entra em
  // tela cheia. Reiniciada por qualquer interacao e ao minimizar na mao.
  const idleTimerRef = useRef(null);
  const scheduleIdle = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setRevealed(false);
      if (!canAutoExpand()) return;
      if (isRunningRef.current && !expandedRef.current) setExpanded(true);
      if (isHorarioRef.current && !clockExpandedRef.current) setClockExpanded(true);
    }, IDLE_MS);
  }, []);

  // Alterna pelo icone / Esc. Minimizar devolve a folga cheia: a ociosidade
  // recomeca do zero, entao nao volta pra tela cheia quase na hora.
  const toggleExpanded = () => {
    setExpanded((v) => !v);
    setRevealed(true);
    scheduleIdle();
  };
  const toggleClockExpanded = () => {
    setClockExpanded((v) => !v);
    setRevealed(true);
    scheduleIdle();
  };

  // Esc fecha a tela cheia (mesmo caminho do icone).
  useEffect(() => {
    if (!focoExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setExpanded(false);
        setRevealed(true);
        scheduleIdle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focoExpanded, scheduleIdle]);
  // Sair do Foco fecha o modo expandido.
  useEffect(() => {
    if (section !== "foco") setExpanded(false);
  }, [section]);
  // Sair de Horario tambem devolve o relogio ao seu tamanho normal.
  useEffect(() => {
    if (section !== "horario") setClockExpanded(false);
  }, [section]);

  useEffect(() => {
    if (!horarioExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setClockExpanded(false);
        setRevealed(true);
        scheduleIdle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [horarioExpanded, scheduleIdle]);

  // F2/F3 - Transicao de expandir/recolher: so escala + fade, no lugar (sem
  // deslocamento). Nao roda no primeiro render -- so nas trocas.
  useLayoutEffect(() => {
    const el = clockElRef.current;
    if (!el) return;
    if (!expandMountedRef.current) {
      expandMountedRef.current = true;
      return;
    }
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { scale: expanded ? 0.9 : 1.08, opacity: 0.25 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.45,
        ease: "power2.out",
        clearProps: "scale,opacity",
      }
    );
  }, [expanded]);

  useLayoutEffect(() => {
    const el = currentTimeClockRef.current;
    if (!el) return;
    if (!clockExpandMountedRef.current) {
      clockExpandMountedRef.current = true;
      return;
    }
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { scale: clockExpanded ? 0.9 : 1.08, opacity: 0.25 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.45,
        ease: "power2.out",
        clearProps: "scale,opacity",
      }
    );
  }, [clockExpanded]);

  // Girar o celular em tela cheia: o layout dos claquetes muda via CSS
  // (empilhado <-> lado a lado); aqui so um "pop" GSAP minimo pra suavizar a
  // troca de orientacao. Listener so ativo enquanto o fullscreen do Foco esta on.
  useEffect(() => {
    if (!focoExpanded) return undefined;
    const mq = window.matchMedia("(orientation: landscape)");
    const onChange = () => {
      const el = clockElRef.current;
      if (!el || prefersReducedMotion()) return;
      gsap.fromTo(
        el,
        { scale: 0.92, opacity: 0.4 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.4,
          ease: "power2.out",
          clearProps: "scale,opacity",
        }
      );
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [focoExpanded]);

  // Vale no Foco rodando e no Horario: parado por IDLE_MS os controles somem e,
  // no desktop, o respectivo relogio ocupa a tela. Dentro dela a interacao so
  // revela o icone de minimizar; nunca recolhe automaticamente.
  const revealActive = isRunning || focoExpanded || section === "horario";
  useEffect(() => {
    if (!revealActive) {
      setRevealed(false);
      clearTimeout(idleTimerRef.current);
      return undefined;
    }
    setRevealed(true);
    scheduleIdle();
    // pointermove/pointerdown cobrem mouse e toque; keydown cobre quem navega
    // so pelo teclado (senao a tela cheia entraria por cima de quem esta ativo).
    const onActivity = () => {
      setRevealed(true);
      scheduleIdle();
    };
    window.addEventListener("pointermove", onActivity);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      clearTimeout(idleTimerRef.current);
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [revealActive, scheduleIdle]);

  return (
    <>
    <div
      className={`app${isRunning ? " is-running" : ""}${
        revealActive && revealed ? " is-revealed" : ""
      }${focoExpanded ? " is-expanded" : ""}${
        horarioExpanded ? " is-clock-expanded" : ""
      }`}
    >
      <Sidebar items={SIDEBAR_ITEMS} active={section} onChange={setSection} />

      <AccountMenu session={session} onLogout={onLogout} />

      <div className={`content${section === "tarefas" ? " content--board" : ""}`}>
        {!settingsReady ? <p className="sync-status">Sincronizando</p> : null}
        {settingsError ? <p className="sync-status sync-status--error">{settingsError}</p> : null}
        {section === "foco" ? (
          entered ? (
            <FocoSection
              timer={timer}
              showHours={showHours}
              config={config}
              setConfig={setConfig}
              expanded={expanded}
              onToggleExpand={toggleExpanded}
              clockRef={clockElRef}
              musicTracks={MUSIC_TRACKS}
              musicTrackId={musicTrackId}
              onPickTrack={pickTrack}
              musicOn={musicOn}
              onToggleMusicOn={toggleMusicOn}
              musicVolume={musicVolume}
              onMusicVolume={changeMusicVolume}
              focusTask={focusTask}
              completedTask={completedTask}
              onUnlinkTask={() => linkFocusTask(null)}
              onCompletedShown={() => setCompletedTask(null)}
            />
          ) : null
        ) : section === "cronometro" ? (
          <CronometroSection stopwatch={stopwatch} />
        ) : section === "horario" ? (
          <ClockSection
            expanded={horarioExpanded}
            onToggleExpand={toggleClockExpanded}
            clockRef={currentTimeClockRef}
          />
        ) : (
          <TarefasSection
            userId={userId}
            onFocusTask={(task) => {
              linkFocusTask(task);
              setSection("foco");
            }}
          />
        )}
      </div>

    </div>

    {/* Fora do .app de proposito: isolada dos recalculos de layout do container
        (overflow/flex/min-height), que no iOS PWA faziam o position:fixed
        "andar junto" e flutuar no launch. Visibilidade no modo Foco vem por
        prop, nao por seletor de ancestral. */}
    <MobileNav
      items={MOBILE_NAV_ITEMS}
      active={section}
      onChange={setSection}
      hidden={focoExpanded || horarioExpanded}
    />

    {/* Ciclo rodando fora do Foco: pilula de feedback no canto inferior
        esquerdo. Fora do `.app` pelo mesmo motivo da MobileNav. */}
    {timer.running && section !== "foco" && !horarioExpanded ? (
      <CyclePill
        mode={timer.mode}
        remaining={timer.remaining}
        duration={timer.duration}
        cycle={timer.cycle}
        cycles={timer.cycles}
        onClick={() => setSection("foco")}
      />
    ) : null}

    {alarmToast && (
      <AlarmToast
        key={alarmToast.key}
        time={alarmToast.time}
        description={alarmToast.description}
        onDone={() => setAlarmToast(null)}
      />
    )}
    {notifGuideVisible && (
      <NotifGuide onDismiss={dismissNotifGuide} />
    )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [entered, setEntered] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [authReady, setAuthReady] = useState(
    !AUTH_FLOW_ENABLED || !isSupabaseConfigured
  );

  useEffect(() => {
    if (!AUTH_FLOW_ENABLED) {
      setAuthReady(true);
      return undefined;
    }

    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;

    async function loadSession() {
      const url = new URL(window.location.href);
      const authCode = url.searchParams.get("code");
      const authType = url.searchParams.get("type");

      if (authCode) {
        await supabase.auth.exchangeCodeForSession(authCode);
        url.searchParams.delete("code");
        url.searchParams.delete("type");
        window.history.replaceState({}, document.title, url.toString());
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setRecoveryMode(authType === "recovery");
      setAuthReady(true);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setEntered(false);
    setRecoveryMode(false);
  }

  function handleAuthComplete(nextSession) {
    setEntered(false);
    setRecoveryMode(false);
    setSession(nextSession);
  }

  return (
    !AUTH_FLOW_ENABLED ? (
      <EntryExperience onComplete={() => setEntered(true)}>
        <TimerApp entered={entered} />
      </EntryExperience>
    ) : !authReady ? (
      <main className="auth-screen auth-screen--boot" aria-label="Carregando Flux Time">
        <p className="sync-status">Carregando</p>
      </main>
    ) : recoveryMode ? (
      <AuthPanel
        recoveryMode
        onPasswordUpdated={() => {
          setEntered(false);
          setRecoveryMode(false);
        }}
      />
    ) : session ? (
      <EntryExperience
        key={session?.user?.id || "authenticated"}
        onComplete={() => setEntered(true)}
      >
        <TimerApp entered={entered} session={session} onLogout={handleLogout} />
      </EntryExperience>
    ) : (
      <AuthPanel onComplete={handleAuthComplete} />
    )
  );
}
