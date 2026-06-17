import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import {
  GripVertical,
  ChevronDown,
  MoreVertical,
  Plus,
  X,
  Archive,
  CheckSquare,
  Bell,
  Sunrise,
  Sun,
  Moon,
} from "lucide-react";
import CardModal from "./CardModal.jsx";
import Checkbox from "./Checkbox.jsx";
import Popover from "./Popover.jsx";
import AlarmsPopover from "./AlarmsPopover.jsx";
import { labelById } from "./labels.js";
import {
  loadAlarms,
  saveAlarms,
  periodForTime,
  PERIOD_LABELS,
  ensureNotificationPermission,
} from "./alarms.js";
import { primeAlarm } from "../../lib/sound.js";
import { makeClientId } from "../../lib/id.js";

gsap.registerPlugin(Flip);

// Contador global de ordem: cards e alarmes compartilham a mesma sequencia
// monotonica para `order`. A ordem so e comparada DENTRO de uma mesma faixa
// (filtramos por periodo antes de ordenar), entao basta ser crescente.
let orderSeq = 0;
const nextOrder = () => ++orderSeq;

/**
 * Notificacao em glass morphism disparada quando um alarme toca com a aba em
 * foco. Slide-in da direita (GSAP); fecha sozinho em 6,5s ou pelo botao X.
 * Com a aba em segundo plano usamos a Notification nativa do SO.
 */
export function AlarmToast({ day, time, description, period, onDone }) {
  const ref = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    const el = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el && !reduce) {
      gsap.to(el, {
        opacity: 0,
        x: 52,
        duration: 0.28,
        ease: "power2.in",
        onComplete: () => onDoneRef.current(),
      });
    } else {
      onDoneRef.current();
    }
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el && !reduce) {
      gsap.fromTo(
        el,
        { opacity: 0, x: 52 },
        { opacity: 1, x: 0, duration: 0.42, ease: "power3.out" }
      );
    }
    timerRef.current = setTimeout(dismiss, 6500);
    return () => clearTimeout(timerRef.current);
  }, [dismiss]);

  return createPortal(
    <div className="alarm-toast" ref={ref} role="alert" aria-live="assertive">
      <div className="alarm-toast__icon" aria-hidden="true">
        <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="at-grad" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#f0726a"/>
              <stop offset="1" stopColor="#8c2f33"/>
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#at-grad)"/>
          <g transform="translate(146 146) scale(2.65)" fill="#ffffff">
            <path d="M34 61C34 52.4 34.9 46.3 36.9 41.8C40.4 34.2 46.3 31 53.3 31H111C110.1 39.7 105.4 45.9 97.6 48.3C97 48.5 96.1 48.6 95.1 48.6H50.8C43.8 48.6 37.5 53.2 34 61Z" transform="translate(-34 -31)"/>
            <path d="M34 82.6C34 72.8 36.5 64.3 42.8 58.3C46.2 55.1 50.3 54 55 54H82C80.8 62.3 75.1 68.9 66.4 71.1C65.3 71.4 64.3 71.5 63.1 71.5H47.2C41.1 71.5 36.4 76.1 34 82.6Z" transform="translate(-34 -31)"/>
            <path d="M34 108V92.4C34 84.8 40.9 77.7 49.2 76.2C50.1 76.1 50.8 76 52 76V91.5C52 99.6 44.9 106.5 36.7 107.8C35.8 107.9 34.9 108 34 108Z" transform="translate(-34 -31)"/>
          </g>
        </svg>
      </div>

      <div className="alarm-toast__content">
        <div className="alarm-toast__header">
          <span className="alarm-toast__app">Flux Time</span>
          {time && (
            <span className="alarm-toast__time">
              <Bell size={12} strokeWidth={2.4} aria-hidden="true" />
              {time}
            </span>
          )}
        </div>
        {description && <span className="alarm-toast__desc">{description}</span>}
      </div>

      <button
        type="button"
        className="alarm-toast__close"
        onClick={dismiss}
        aria-label="Fechar notificação"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>,
    document.body
  );
}

/**
 * Coluna-dia do Kanban semanal (Camada 1). Visual baseado na lane do Obsidian
 * Kanban, recriado em CSS puro + GSAP no padrao do projeto:
 * - header: handle (drag e fase futura), chevron de recolher, titulo, contador, menu;
 * - corpo: cards simples (so titulo) — em memoria;
 * - rodape: "+ Adicione um cartao" (acende no accent vermelho) -> compositor inline.
 * O detalhe do card e o Markdown sao das proximas camadas.
 */
// Faixas do Modo Semana, em ordem fixa (Manha -> Tarde -> Noite). So aparecem
// sob demanda: a faixa nasce quando ha pelo menos um card com aquele periodo.
export const PERIODS = [
  { key: "morning", label: "Manhã", Icon: Sunrise },
  { key: "afternoon", label: "Tarde", Icon: Sun },
  { key: "night", label: "Noite", Icon: Moon },
];

export default function DayLane({
  day = "Segunda",
  laneId,
  initialName = day,
  initialCards = [],
  initialCollapsed = false,
  initialMode = "default",
  mode: controlledMode = null,
  initialAlarms = null,
  labelCatalog = null,
  onLanePatch,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
  onArchiveCards,
  onDeleteLane,
  onCreateAlarm,
  onUpdateAlarm,
  onDeleteAlarm,
  onCreateLabel,
  onUpdateLabel,
  onLaneDragStart,
  onLaneDragEnter,
  onLaneDragEnd,
  canDeleteLane = false,
}) {
  const [cards, setCards] = useState(initialCards);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [grabbed, setGrabbed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState(initialName);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [mode, setMode] = useState(initialMode);
  const [alarms, setAlarms] = useState(() =>
    (initialAlarms || loadAlarms(laneId))
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((a) => ({
        ...a,
        order: typeof a.order === "number" ? a.order : nextOrder(),
      }))
  );
  const [alarmsOpen, setAlarmsOpen] = useState(false);
  const [alarmEditId, setAlarmEditId] = useState(null);
  const bodyRef = useRef(null);
  const chevronRef = useRef(null);
  const inputRef = useRef(null);
  const cardRefs = useRef({});
  const pendingPop = useRef(null);
  const firstRender = useRef(true);
  const menuBtnRef = useRef(null);
  const nameInputRef = useRef(null);
  const bellRef = useRef(null);
  // Arraste de itens dentro da coluna (Etapa 2): item arrastado + ultimo alvo
  // sob o cursor (anti-flick) + estado Flip capturado antes do rearranjo.
  const dragItem = useRef(null);
  const lastOverItem = useRef(null);
  const itemFlip = useRef(null);
  const [dragId, setDragId] = useState(null);

  const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  useEffect(() => {
    setCollapsed(initialCollapsed);
  }, [initialCollapsed]);

  useEffect(() => {
    setName(initialName);
    setNameDraft(initialName);
  }, [initialName]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (controlledMode) setMode(controlledMode);
  }, [controlledMode]);

  useEffect(() => {
    if (!initialAlarms) return;
    setAlarms(
      initialAlarms.map((a) => ({
        ...a,
        order: typeof a.order === "number" ? a.order : nextOrder(),
      }))
    );
  }, [initialAlarms]);

  // Recolher/expandir o corpo via GSAP (anima a altura) + girar o chevron.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const chev = chevronRef.current;
    if (!el) return;
    const reduce = prefersReduced();

    if (firstRender.current) {
      firstRender.current = false;
      gsap.set(el, { height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 });
      if (chev) gsap.set(chev, { rotate: collapsed ? -90 : 0 });
      return;
    }

    gsap.killTweensOf(el);
    if (chev) {
      gsap.to(chev, {
        rotate: collapsed ? -90 : 0,
        duration: reduce ? 0 : 0.3,
        ease: "power3.out",
      });
    }

    if (collapsed) {
      gsap.to(el, {
        height: 0,
        opacity: 0,
        duration: reduce ? 0 : 0.32,
        ease: "power3.inOut",
      });
    } else {
      gsap.set(el, { height: "auto" });
      const target = el.offsetHeight;
      gsap.fromTo(
        el,
        { height: 0, opacity: 0 },
        {
          height: target,
          opacity: 1,
          duration: reduce ? 0 : 0.32,
          ease: "power3.inOut",
          onComplete: () => gsap.set(el, { height: "auto" }),
        }
      );
    }
  }, [collapsed]);

  // "Pop" no card recem-criado.
  useLayoutEffect(() => {
    const id = pendingPop.current;
    if (id == null) return;
    const el = cardRefs.current[id];
    if (el && !prefersReduced()) {
      gsap.from(el, {
        scale: 0.92,
        opacity: 0,
        y: -8,
        duration: 0.3,
        ease: "back.out(1.6)",
      });
    }
    pendingPop.current = null;
  }, [cards]);

  // Anima o rearranjo de cards/alarmes apos um arraste (GSAP Flip). Roda em
  // qualquer mudanca de cards/alarms, mas so age se um arraste capturou o
  // estado antes do setState (itemFlip). Criar card usa o "pop" acima.
  useLayoutEffect(() => {
    if (!itemFlip.current) return;
    const reduce = prefersReduced();
    // SEM `absolute: true` de proposito: numa lista vertical, tornar os itens
    // absolutos durante a animacao colapsa a altura da faixa (tudo empilha no
    // mesmo ponto) e o "Adicione um cartao" pula. Sem absolute, cada item
    // mantem seu espaco no fluxo e so o transform desliza.
    Flip.from(itemFlip.current, {
      duration: reduce ? 0 : 0.32,
      ease: "power3.out",
      force3D: true,
      overwrite: true,
    });
    itemFlip.current = null;
  }, [cards, alarms]);

  // Foca o input ao abrir o compositor.
  useLayoutEffect(() => {
    if (composing) inputRef.current?.focus();
  }, [composing]);

  // Foca/seleciona o nome ao entrar em edicao.
  useLayoutEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  // Esc fecha o menu da lista.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Esc fecha o popover de alarmes.
  useEffect(() => {
    if (!alarmsOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setAlarmsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alarmsOpen]);

  // Persiste os alarmes do dia (localStorage), chaveado pelo laneId.
  // Espelha alarmes no localStorage para que o verificador global (App.jsx) possa
  // ler o estado atual independente da secao ativa (Foco, Cronometro, Tarefas).
  useEffect(() => {
    saveAlarms(laneId, alarms);
  }, [alarms, laneId]);

  // Sair do Modo Semana fecha o popover de alarmes (so existe nesse modo).
  useEffect(() => {
    if (mode !== "week") setAlarmsOpen(false);
  }, [mode]);

  const createAlarm = (alarm) => {
    primeAlarm(); // destrava o audio no gesto do usuario
    ensureNotificationPermission();
    // Novo alarme entra no fim da sua faixa (order alto); o usuario reordena
    // arrastando. A ordem visual e sempre derivada de `order`, nao do horario.
    const nextAlarm = { ...alarm, id: alarm.id || makeClientId(), order: nextOrder() };
    setAlarms((list) => [...list, nextAlarm]);
    onCreateAlarm?.(nextAlarm);
  };
  const updateAlarm = (alarm) =>
    setAlarms((list) => {
      const next = list.map((a) => (a.id === alarm.id ? { ...a, ...alarm } : a));
      const changed = next.find((a) => a.id === alarm.id);
      if (changed) onUpdateAlarm?.(changed);
      return next;
    });
  const toggleAlarm = (id) =>
    setAlarms((list) => {
      const next = list.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
      const changed = next.find((a) => a.id === id);
      if (changed) onUpdateAlarm?.(changed);
      return next;
    });
  const deleteAlarm = (id) => {
    setAlarms((list) => list.filter((a) => a.id !== id));
    onDeleteAlarm?.(id);
  };

  const startRename = () => {
    setNameDraft(name);
    setEditingName(true);
  };
  const commitRename = () => {
    const v = nameDraft.trim();
    if (v) {
      setName(v);
      onLanePatch?.({ title: v });
    }
    setEditingName(false);
  };
  const archiveCards = () => {
    const archived = cards;
    setCards([]);
    onArchiveCards?.(archived);
  };

  const addCard = () => {
    const title = draft.trim();
    if (!title) return;
    const nextCard = {
      id: makeClientId(),
      title,
      description: "",
      done: false,
      labels: [],
      checklists: [],
      period: null,
      order: nextOrder(),
    };
    setCards((c) => [...c, nextCard]);
    onCreateCard?.(nextCard);
    setDraft("");
    pendingPop.current = nextCard.id;
    // Mantem o compositor aberto p/ adicionar varios em sequencia (estilo Obsidian).
    inputRef.current?.focus();
  };

  const closeComposer = () => {
    setComposing(false);
    setDraft("");
  };

  const updateCard = (id, patch) =>
    setCards((list) => {
      const next = list.map((c) => (c.id === id ? { ...c, ...patch } : c));
      const changed = next.find((c) => c.id === id);
      if (changed) onUpdateCard?.(changed);
      return next;
    });

  const deleteCard = (id) => {
    setCards((list) => list.filter((c) => c.id !== id));
    setSelectedId(null);
    onDeleteCard?.(id);
  };

  const checklistStats = (card) => {
    const items = (card.checklists || []).flatMap((list) => list.items || []);
    return {
      done: items.filter((item) => item.done).length,
      total: items.length,
    };
  };

  const labelsForCard = (card) =>
    (card.labels || [])
      .map((id) => labelCatalog?.find((label) => label.id === id) || labelById(id))
      .filter((label) => label?.color && label.color !== "transparent")
      .slice(0, 4);

  const selectedCard = cards.find((c) => c.id === selectedId) || null;
  const weekMode = mode === "week";
  const activeAlarms = alarms.filter((a) => a.enabled).length;
  // Periodos que ja tem ao menos um card (pre-requisito p/ criar alarme neles).
  const periodsWithCards = [...new Set(cards.map((c) => c.period).filter(Boolean))];

  const openAlarmEditor = (id) => {
    setAlarmEditId(id);
    setAlarmsOpen(true);
  };

  // --- Arraste dentro da coluna (Etapa 2, so Modo Semana) -------------------
  // Modelo de ordem: cards e alarmes carregam `order`; a faixa e renderizada
  // juntando seus cards + alarmes e ordenando por `order`. O alarme so reordena
  // DENTRO da propria faixa (periodo = horario, decisao fechada); o card pode
  // trocar de faixa (muda `period`). Reordenar = renumerar a faixa de destino.
  const periodOf = (type, id) =>
    type === "card"
      ? cards.find((c) => c.id === id)?.period ?? null
      : periodForTime(alarms.find((a) => a.id === id)?.time);

  // Itens de uma faixa (period; null = "A definir") ja ordenados por `order`.
  const bandItems = (period) =>
    [
      ...cards
        .filter((c) => (c.period ?? null) === period)
        .map((c) => ({ type: "card", id: c.id, order: c.order ?? 0 })),
      ...(period == null
        ? []
        : alarms
            .filter((a) => periodForTime(a.time) === period)
            .map((a) => ({ type: "alarm", id: a.id, order: a.order ?? 0 }))),
    ].sort((x, y) => x.order - y.order);

  // Insere o item arrastado na faixa de destino e renumera a faixa toda.
  // Direcao: se o arrastado estava ANTES do alvo (arrastando p/ baixo), insere
  // DEPOIS do alvo; caso contrario (arrastando p/ cima), insere ANTES. O segredo
  // e usar o indice do alvo no band ORIGINAL (antes de filtrar o arrastado):
  // apos filtrar, esse indice aponta exatamente para o lugar certo em ambos os
  // casos sem precisar de ajuste extra.
  const applyMove = (drag, targetPeriod, targetType, targetId) => {
    if (bodyRef.current) {
      itemFlip.current = Flip.getState(
        bodyRef.current.querySelectorAll(".kcard, .lane__alarm-item")
      );
    }
    const bandFull = bandItems(targetPeriod);
    const targetIdx = bandFull.findIndex(
      (it) => it.type === targetType && it.id === targetId
    );
    const band = bandFull.filter(
      (it) => !(it.type === drag.type && it.id === drag.id)
    );
    const idx = targetIdx === -1 ? band.length : targetIdx;
    const newBand = [
      ...band.slice(0, idx),
      { type: drag.type, id: drag.id },
      ...band.slice(idx),
    ];
    const orderMap = new Map();
    newBand.forEach((it, i) => orderMap.set(`${it.type}:${it.id}`, i));

    if (newBand.some((it) => it.type === "card")) {
      setCards((list) =>
        list.map((c) => {
          const o = orderMap.get(`card:${c.id}`);
          if (o == null) return c;
          const patch = { order: o };
          if (drag.type === "card" && drag.id === c.id) patch.period = targetPeriod;
          const nextCard = { ...c, ...patch };
          onUpdateCard?.(nextCard);
          return nextCard;
        })
      );
    }
    if (newBand.some((it) => it.type === "alarm")) {
      setAlarms((list) =>
        list.map((a) => {
          const o = orderMap.get(`alarm:${a.id}`);
          if (o == null) return a;
          const nextAlarm = { ...a, order: o };
          onUpdateAlarm?.(nextAlarm);
          return nextAlarm;
        })
      );
    }
  };

  // Hover sobre um item-alvo durante o arraste: valida e reposiciona (anti-flick
  // pela chave do alvo, como na reordenacao das colunas).
  const moveOver = (targetType, targetId) => {
    const drag = dragItem.current;
    if (!drag) return;
    if (drag.type === targetType && drag.id === targetId) return;
    const targetPeriod = periodOf(targetType, targetId);
    if (drag.type === "alarm" && periodOf("alarm", drag.id) !== targetPeriod) return;
    const overKey = `${targetType}:${targetId}`;
    if (lastOverItem.current === overKey) return;
    lastOverItem.current = overKey;
    applyMove(drag, targetPeriod, targetType, targetId);
  };

  const onItemDragStart = (e, type, id) => {
    e.stopPropagation(); // nao acionar o arraste de COLUNA (section)
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", `${type}:${id}`);
    } catch {
      /* alguns navegadores nao deixam setData aqui; ok */
    }
    dragItem.current = { type, id };
    lastOverItem.current = `${type}:${id}`;
    setDragId(`${type}:${id}`);
  };
  const onItemDragEnter = (e, type, id) => {
    if (!dragItem.current) return;
    e.stopPropagation();
    moveOver(type, id);
  };
  const onItemDragEnd = (e) => {
    e.stopPropagation();
    dragItem.current = null;
    lastOverItem.current = null;
    setDragId(null);
  };

  const renderCard = (card) => {
    const cardLabels = labelsForCard(card);
    const primaryLabel = cardLabels.length === 1 ? cardLabels[0] : null;
    const hasLabelBars = cardLabels.length > 1;
    const stats = checklistStats(card);
    const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

    return (
      <article
        key={card.id}
        className={`kcard${card.done ? " is-done" : ""}${
          primaryLabel ? " has-label-color" : ""
        }${hasLabelBars ? " has-label-bars" : ""}${
          weekMode ? " is-draggable" : ""
        }${dragId === `card:${card.id}` ? " is-dragging" : ""}`}
        style={
          primaryLabel ? { "--kcard-label-color": primaryLabel.color } : undefined
        }
        ref={(el) => (cardRefs.current[card.id] = el)}
        role="button"
        tabIndex={0}
        draggable={weekMode}
        onDragStart={(e) => onItemDragStart(e, "card", card.id)}
        onDragEnter={(e) => onItemDragEnter(e, "card", card.id)}
        onDragEnd={onItemDragEnd}
        onClick={() => setSelectedId(card.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedId(card.id);
          }
        }}
      >
        <div className="kcard__main">
          <Checkbox
            checked={card.done}
            onChange={(v) => updateCard(card.id, { done: v })}
            label={`Marcar "${card.title}" como ${card.done ? "não feito" : "feito"}`}
          />
          <p className="kcard__title">{card.title}</p>
        </div>
        {stats.total ? (
          <div className="kcard__meta">
            <CheckSquare className="kcard__meta-icon" size={14} strokeWidth={2.2} />
            <span className="kcard__meta-count">
              {stats.done}/{stats.total}
            </span>
            <span className="kcard__progress" aria-hidden="true">
              <span className="kcard__progress-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="kcard__pct">{pct}%</span>
          </div>
        ) : null}
        {hasLabelBars ? (
          <div
            className={`kcard__label-bars is-count-${cardLabels.length}`}
            aria-hidden="true"
          >
            {cardLabels.map((label) => (
              <span
                key={label.id}
                className="kcard__label-bar"
                style={{ background: label.color }}
              />
            ))}
          </div>
        ) : null}
      </article>
    );
  };

  // Alarme inline "solto" (sem caixa de card): sininho + horario + descricao.
  // Clicar abre o editor daquele alarme. Vive na faixa do periodo do seu horario.
  const renderAlarm = (alarm) => (
    <button
      type="button"
      key={alarm.id}
      className={`lane__alarm-item is-draggable${alarm.enabled ? "" : " is-off"}${
        dragId === `alarm:${alarm.id}` ? " is-dragging" : ""
      }`}
      draggable
      onDragStart={(e) => onItemDragStart(e, "alarm", alarm.id)}
      onDragEnter={(e) => onItemDragEnter(e, "alarm", alarm.id)}
      onDragEnd={onItemDragEnd}
      onClick={() => openAlarmEditor(alarm.id)}
      title="Editar alarme"
    >
      <Bell className="lane__alarm-item-icon" size={15} strokeWidth={2.4} />
      <span className="lane__alarm-item-time">{alarm.time}</span>
      {alarm.description ? (
        <span className="lane__alarm-item-desc">{alarm.description}</span>
      ) : null}
    </button>
  );

  // Modo Semana: card sem periodo cai em "A definir"; os demais agrupam nas
  // faixas Manha/Tarde/Noite (ordem fixa). A faixa aparece se tiver card OU
  // alarme. Alarmes do periodo entram no topo da faixa (Etapa 1: sem arraste).
  const renderItem = (it) =>
    it.type === "card" ? renderCard(it.card) : renderAlarm(it.alarm);

  const renderWeekGroups = () => {
    const pending = cards
      .filter((c) => !c.period)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const groups = PERIODS.map((p) => ({
      ...p,
      items: [
        ...cards
          .filter((c) => c.period === p.key)
          .map((c) => ({ type: "card", id: c.id, order: c.order ?? 0, card: c })),
        ...alarms
          .filter((a) => periodForTime(a.time) === p.key)
          .map((a) => ({ type: "alarm", id: a.id, order: a.order ?? 0, alarm: a })),
      ].sort((x, y) => x.order - y.order),
    })).filter((g) => g.items.length);

    return (
      <>
        {pending.length ? (
          <div className="lane__period is-pending">
            <div className="lane__period-head">A definir</div>
            {pending.map(renderCard)}
          </div>
        ) : null}
        {groups.map((g) => (
          <div className="lane__period" key={g.key}>
            <div className="lane__period-head">
              {g.Icon ? <g.Icon size={13} strokeWidth={2.2} /> : null}
              <span>{g.label}</span>
            </div>
            {g.items.map(renderItem)}
          </div>
        ))}
      </>
    );
  };

  return (
    <section
      className={`lane${collapsed ? " is-collapsed" : ""}${
        dragging ? " is-dragging" : ""
      }`}
      data-lane-id={laneId}
      draggable={grabbed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
        onLaneDragStart?.(laneId);
      }}
      onDragEnter={() => onLaneDragEnter?.(laneId)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => {
        setGrabbed(false);
        setDragging(false);
        onLaneDragEnd?.();
      }}
    >
      <header className="lane__head">
        <button
          type="button"
          className="lane__grip"
          aria-label="Mover coluna"
          tabIndex={-1}
          onPointerDown={() => setGrabbed(true)}
          onPointerUp={() => setGrabbed(false)}
        >
          <GripVertical size={16} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="lane__collapse"
          onClick={() =>
            setCollapsed((v) => {
              const next = !v;
              onLanePatch?.({ collapsed: next });
              return next;
            })
          }
          aria-label={collapsed ? "Expandir coluna" : "Recolher coluna"}
          aria-expanded={!collapsed}
        >
          <span ref={chevronRef} className="lane__chevron">
            <ChevronDown size={18} strokeWidth={2.4} />
          </span>
        </button>
        {editingName ? (
          <input
            ref={nameInputRef}
            className="lane__title-input"
            value={nameDraft}
            aria-label="Nome da lista"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                setEditingName(false);
              }
            }}
          />
        ) : mode === "week" ? (
          <h2 className="lane__title is-locked" title="Nome fixo no Modo Semana">
            {day}
          </h2>
        ) : (
          <h2
            className="lane__title"
            role="button"
            tabIndex={0}
            title="Renomear lista"
            onClick={startRename}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startRename();
              }
            }}
          >
            {name}
          </h2>
        )}
        {collapsed ? (
          <span className="lane__count">
            {cards.length} {cards.length === 1 ? "item" : "itens"}
          </span>
        ) : null}
        {weekMode ? (
          <button
            type="button"
            ref={bellRef}
            className={`lane__alarm${activeAlarms ? " has-alarms" : ""}${
              alarmsOpen ? " is-open" : ""
            }`}
            aria-label={
              activeAlarms
                ? `Alarmes do dia (${activeAlarms} ativo${activeAlarms > 1 ? "s" : ""})`
                : "Adicionar alarme ao dia"
            }
            aria-haspopup="dialog"
            aria-expanded={alarmsOpen}
            onClick={() => {
              setAlarmEditId(null);
              setAlarmsOpen((o) => !o);
            }}
          >
            <Bell size={15} strokeWidth={2.2} />
            {activeAlarms ? (
              <span className="lane__alarm-badge">{activeAlarms}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          ref={menuBtnRef}
          className="lane__menu"
          aria-label="Opções da lista"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreVertical size={16} strokeWidth={2.2} />
        </button>
      </header>

      {menuOpen ? (
        <Popover
          anchorRef={menuBtnRef}
          onClose={() => setMenuOpen(false)}
          width={196}
          className="kpop--menu"
        >
          <div className="kmenu" role="menu">
            <button
              type="button"
              className="kmenu__item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                archiveCards();
              }}
            >
              <Archive size={15} strokeWidth={2.2} />
              <span>Arquivar cartões</span>
            </button>
            {canDeleteLane ? (
              <button
                type="button"
                className="kmenu__item kmenu__item--danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteLane?.();
                }}
              >
                <X size={15} strokeWidth={2.2} />
                <span>Excluir coluna</span>
              </button>
            ) : null}
          </div>
        </Popover>
      ) : null}

      {weekMode && alarmsOpen ? (
        <AlarmsPopover
          anchorRef={bellRef}
          alarms={alarms}
          periodsWithCards={periodsWithCards}
          initialEditId={alarmEditId}
          onCreate={createAlarm}
          onUpdate={updateAlarm}
          onToggle={toggleAlarm}
          onDelete={deleteAlarm}
          onClose={() => {
            setAlarmsOpen(false);
            setAlarmEditId(null);
          }}
        />
      ) : null}

      <div className="lane__collapsible" ref={bodyRef}>
        <div className={`lane__cards${weekMode ? " is-week" : ""}`}>
          {weekMode ? renderWeekGroups() : cards.map(renderCard)}
        </div>

        <footer className="lane__foot">
          {composing ? (
            <div className="lane__composer">
              <input
                ref={inputRef}
                className="lane__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCard();
                  } else if (e.key === "Escape") {
                    closeComposer();
                  }
                }}
                placeholder="Título do cartão…"
              />
              <div className="lane__composer-actions">
                <button type="button" className="lane__add" onClick={addCard}>
                  Adicionar
                </button>
                <button
                  type="button"
                  className="lane__close"
                  onClick={closeComposer}
                  aria-label="Cancelar"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="lane__addcard"
              onClick={() => setComposing(true)}
            >
              <Plus size={16} strokeWidth={2.6} />
              <span>Adicione um cartão</span>
            </button>
          )}
        </footer>
      </div>

      {selectedCard ? (
        <CardModal
          card={selectedCard}
          day={name}
          weekMode={weekMode}
          labelCatalog={labelCatalog}
          onCreateLabel={onCreateLabel}
          onUpdateLabel={onUpdateLabel}
          onChange={(patch) => updateCard(selectedCard.id, patch)}
          onDelete={() => deleteCard(selectedCard.id)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

    </section>
  );
}
