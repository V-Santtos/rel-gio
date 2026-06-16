import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);
import {
  Target,
  Timer,
  ListChecks,
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
import DayLane from "./components/Kanban/DayLane.jsx";
import {
  DEFAULT_LABELS,
  setLabels as setRuntimeLabels,
} from "./components/Kanban/labels.js";
import SettingsModal from "./components/SettingsModal.jsx";
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
import { syncPushSubscription } from "./lib/pushSubscription.js";
import {
  loadAllAlarms,
  nowHHMM,
  minuteKey,
  showAlarmNotification,
} from "./components/Kanban/alarms.js";
import { AlarmToast } from "./components/Kanban/DayLane.jsx";
import { makeClientId } from "./lib/id.js";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient.js";

const STORAGE_KEY = "rel-gio:config";
const AUTH_FLOW_ENABLED = true;

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
  { id: "foco", label: "Foco", Icon: Target },
  { id: "cronometro", label: "Cronômetro", Icon: Timer },
  { id: "tarefas", label: "Tarefas", Icon: ListChecks },
];

// Bottom nav (mobile): Foco no meio (vira o circulo elevado quando ativo, que
// e o estado inicial do app), Cronometro a esquerda e Tarefas a direita.
const MOBILE_NAV_ITEMS = [
  SIDEBAR_ITEMS[1], // Cronometro
  SIDEBAR_ITEMS[0], // Foco
  SIDEBAR_ITEMS[2], // Tarefas
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

function TarefasSection({ userId }) {
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

  const dragFrom = useRef(null);
  const lastOver = useRef(null);
  const flipState = useRef(null);
  const lanesAnimated = useRef(false);
  const pendingLaneAnimation = useRef(null);
  const remoteEnabled = Boolean(supabase && userId);

  const reportSyncError = (message, error) => {
    console.error(message, error);
    setSyncError(message);
  };

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
          .select("id, lane_id, title, description, done, period, status, sort_order")
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
      ]);

      const firstError = [
        lanesResult,
        labelsResult,
        tasksResult,
        assignmentsResult,
        checklistsResult,
        itemsResult,
        alarmsResult,
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

      setLabels(nextLabels);
      setRuntimeLabels(nextLabels);
      setLanes(finalLanes);
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
    setLanes((list) => list.map((lane) => ({ ...lane, mode: nextMode })));
    if (!remoteEnabled) return;
    supabase
      .from("task_lanes")
      .update({ mode: nextMode })
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui salvar o modo do quadro.", error);
      });
  };

  const syncCard = async (laneId, card) => {
    if (!remoteEnabled) return;
    const { error: taskError } = await supabase
      .from("tasks")
      .upsert(
        {
          id: card.id,
          user_id: userId,
          lane_id: laneId,
          title: card.title || "",
          description: card.description || "",
          done: !!card.done,
          status: card.done ? "done" : "todo",
          period: card.period || null,
          sort_order: card.order ?? 0,
        },
        { onConflict: "id" }
      );
    if (taskError) {
      reportSyncError("Nao consegui salvar o cartao.", taskError);
      return;
    }

    const { error: labelDeleteError } = await supabase
      .from("task_label_assignments")
      .delete()
      .eq("task_id", card.id);
    if (labelDeleteError) {
      reportSyncError("Nao consegui atualizar as etiquetas do cartao.", labelDeleteError);
      return;
    }

    const labelRows = (card.labels || []).map((labelId, index) => ({
      task_id: card.id,
      label_id: labelId,
      sort_order: index,
    }));
    if (labelRows.length) {
      const { error } = await supabase.from("task_label_assignments").insert(labelRows);
      if (error) {
        reportSyncError("Nao consegui salvar as etiquetas do cartao.", error);
        return;
      }
    }

    const { error: checklistDeleteError } = await supabase
      .from("task_checklists")
      .delete()
      .eq("task_id", card.id);
    if (checklistDeleteError) {
      reportSyncError("Nao consegui atualizar o checklist.", checklistDeleteError);
      return;
    }

    const cleanLists = (card.checklists || []).map(cleanChecklist);
    if (!cleanLists.length) return;

    const { error: checklistError } = await supabase.from("task_checklists").insert(
      cleanLists.map((list, index) => ({
        id: list.id,
        task_id: card.id,
        title: list.title || "Checklist",
        sort_order: list.sortOrder ?? index,
      }))
    );
    if (checklistError) {
      reportSyncError("Nao consegui salvar o checklist.", checklistError);
      return;
    }

    const itemRows = cleanLists.flatMap((list) =>
      (list.items || []).map((item, index) => ({
        id: item.id,
        checklist_id: list.id,
        text: item.text || "",
        done: !!item.done,
        due_date: item.dueDate || null,
        sort_order: item.sortOrder ?? index,
      }))
    );
    if (!itemRows.length) return;

    const { error: itemError } = await supabase
      .from("task_checklist_items")
      .insert(itemRows);
    if (itemError) {
      reportSyncError("Nao consegui salvar os itens do checklist.", itemError);
    }
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

  const deleteCard = (laneId, cardId) => {
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
      .delete()
      .eq("id", cardId)
      .then(({ error }) => {
        if (error) reportSyncError("Nao consegui excluir o cartao.", error);
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

  // Reordenacao das colunas pelo grip (HTML5 drag). A ordem vive aqui; as keys
  // sao estaveis, entao o estado interno de cada lane acompanha a coluna.
  const handleDragStart = (id) => {
    dragFrom.current = id;
    lastOver.current = id;
  };
  const handleDragEnter = (id) => {
    const from = dragFrom.current;
    if (from == null || from === id) return;
    // Anti-flick: o dragenter borbulha dos filhos e dispara varias vezes para
    // o mesmo alvo. So reage quando o alvo MUDA de fato.
    if (lastOver.current === id) return;
    lastOver.current = id;
    // Captura as posicoes ATUAIS das colunas antes do DOM reordenar; o Flip
    // anima do estado antigo para o novo (deslize real, nao "salto").
    if (boardRef.current) {
      flipState.current = Flip.getState(boardRef.current.querySelectorAll(".lane"));
    }
    setLanes((prev) => {
      const fromIdx = prev.findIndex((lane) => lane.id === from);
      const toIdx = prev.findIndex((lane) => lane.id === id);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      next.splice(toIdx, 0, next.splice(fromIdx, 1)[0]);
      const ordered = next.map((lane, index) => ({ ...lane, sortOrder: index }));
      persistLaneOrder(ordered);
      return ordered;
    });
  };
  const handleDragEnd = () => {
    dragFrom.current = null;
    lastOver.current = null;
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

  // Anima o deslize das colunas apos a ordem mudar (GSAP Flip).
  useLayoutEffect(() => {
    if (!flipState.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    Flip.from(flipState.current, {
      duration: reduce ? 0 : 0.42,
      ease: "power3.out",
      absolute: true,
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
      <div className="tarefas__lanes" ref={boardRef}>
      {syncError ? <p className="sync-status sync-status--error">{syncError}</p> : null}
      {boardReady ? visibleLanes.map((lane) => (
        <DayLane
          key={lane.id}
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
          onLanePatch={(patch) => persistLanePatch(lane.id, patch)}
          onCreateCard={(card) => persistCard(lane.id, card)}
          onUpdateCard={(card) => persistCard(lane.id, card)}
          onDeleteCard={(cardId) => deleteCard(lane.id, cardId)}
          onArchiveCards={(cards) => archiveCards(lane.id, cards)}
          onDeleteLane={() => deleteLane(lane.id)}
          canDeleteLane={!isWeekDayKey(lane.dayKey)}
          onCreateAlarm={(alarm) => persistAlarm(lane.id, alarm)}
          onUpdateAlarm={(alarm) => persistAlarm(lane.id, alarm)}
          onDeleteAlarm={(alarmId) => deleteAlarm(lane.id, alarmId)}
          onCreateLabel={createLabel}
          onUpdateLabel={updateLabel}
          onLaneDragStart={handleDragStart}
          onLaneDragEnter={handleDragEnter}
          onLaneDragEnd={handleDragEnd}
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
      if (!active.length) return;
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
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

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
        break: Math.max(1, c.breakMinutes * 60 + c.breakSeconds),
      })),
    [config.cycleTimes]
  );

  const timer = useTimer({ plan, onPhaseEnd: playPhaseEnd });

  // Tic-tac sutil nos ultimos 7s de cada bloco (foco e break). So quando rodando;
  // dispara a cada mudanca de segundo (7..1), e o chime fecha no 0.
  useEffect(() => {
    if (!timer.running) return;
    if (timer.remaining >= 1 && timer.remaining <= 7) playTick(timer.remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.remaining]);

  const stopwatch = useStopwatch();

  // Mostra HH:MM:SS se QUALQUER ciclo usar horas (evita pulo de layout na troca).
  const showHours = plan.some((c) => c.focus >= 3600 || c.break >= 3600);
  const isRunning = section === "foco" && timer.running;

  // No modo foco some tudo; o movimento do mouse revela os controles por alguns
  // segundos e depois eles voltam a desaparecer (padrao de player de video).
  const [revealed, setRevealed] = useState(false);

  // Modo tela cheia do relogio (estilo Fliqlo): o claquete cresce e enche a
  // viewport, escondendo o resto. So existe na secao Foco. A transicao
  // (expandir/recolher) e so escala + fade no lugar (sem deslocar).
  const [expanded, setExpanded] = useState(false);
  const focoExpanded = section === "foco" && expanded;
  const clockElRef = useRef(null); // raiz do .flip-clock (alvo da transicao)
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const expandMountedRef = useRef(false);
  const autoExpandSuppressed = useRef(false);

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Alterna pelo icone / Esc. Minimizar na mao suprime o auto-expand ate o
  // proximo "Iniciar".
  const toggleExpanded = () => {
    if (expandedRef.current) autoExpandSuppressed.current = true;
    setExpanded((v) => !v);
  };

  // Esc fecha a tela cheia (conta como minimizar manual).
  useEffect(() => {
    if (!focoExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        autoExpandSuppressed.current = true;
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focoExpanded]);
  // Sair do Foco fecha o modo expandido.
  useEffect(() => {
    if (section !== "foco") setExpanded(false);
  }, [section]);

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

  // F3 - Auto-expandir ao iniciar o Pomodoro, sequenciado: espera os controles
  // sairem e entao cresce pra tela cheia. Minimizar na mao suprime ate reiniciar.
  useEffect(() => {
    if (section !== "foco" || !isRunning) return undefined;
    autoExpandSuppressed.current = false;
    const t = setTimeout(() => {
      if (!autoExpandSuppressed.current && !expandedRef.current) {
        setExpanded(true);
      }
    }, 2800);
    return () => clearTimeout(t);
  }, [isRunning, section]);

  // Vale no modo foco (timer rodando) E no modo tela cheia: o movimento do
  // mouse revela os controles/icones por alguns segundos; parado, eles somem.
  const revealActive = isRunning || focoExpanded;
  useEffect(() => {
    if (!revealActive) {
      setRevealed(false);
      return undefined;
    }
    setRevealed(true);
    let hideTimer = setTimeout(() => setRevealed(false), 2500);
    const onMove = () => {
      setRevealed(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setRevealed(false), 2500);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("mousemove", onMove);
    };
  }, [revealActive]);

  return (
    <>
    <div
      className={`app${isRunning ? " is-running" : ""}${
        revealActive && revealed ? " is-revealed" : ""
      }${focoExpanded ? " is-expanded" : ""}`}
    >
      <Sidebar items={SIDEBAR_ITEMS} active={section} onChange={setSection} />
      <MobileNav items={MOBILE_NAV_ITEMS} active={section} onChange={setSection} />

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
            />
          ) : null
        ) : section === "cronometro" ? (
          <CronometroSection stopwatch={stopwatch} />
        ) : (
          <TarefasSection userId={userId} />
        )}
      </div>

    </div>

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
