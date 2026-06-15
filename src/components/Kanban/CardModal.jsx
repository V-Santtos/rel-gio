import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import {
  X,
  Trash2,
  AlignLeft,
  Tag,
  Plus,
  CheckSquare,
  Clock,
  ChevronDown,
  Sunrise,
  Sun,
  Moon,
  Check,
  Save,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Checkbox from "./Checkbox.jsx";
import LabelsPopover from "./LabelsPopover.jsx";
import MarkdownEditor from "./MarkdownEditor.jsx";
import Popover from "./Popover.jsx";
import { getLabels, labelById, setLabels as persistLabels } from "./labels.js";
import { makeClientId } from "../../lib/id.js";

const formatDueDate = (value) => {
  if (!value) return "Data de Entrega";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "Data de Entrega";
  const monthLabel = MONTHS.find((item) => item.value === month)?.label?.toLowerCase();
  if (!monthLabel) return "Data de Entrega";
  return `${Number(day)} de ${monthLabel}`;
};

const dueDateParts = (value) => {
  if (!value) return { day: "", month: "" };
  const [, month, day] = value.split("-");
  return { day: day || "", month: month || "" };
};

const cleanDuePart = (value) => value.replace(/\D/g, "").slice(0, 2);

const buildDueDate = ({ day, month }) => {
  const year = new Date().getFullYear();
  const dayNumber = Number(day);
  const monthNumber = Number(month);
  if (!dayNumber || !monthNumber) return "";
  const date = new Date(year, monthNumber - 1, dayNumber);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === monthNumber - 1 &&
    date.getDate() === dayNumber;
  if (!isValid) return "";
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
};

const MONTHS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

function splitHighlightSyntax(value) {
  const parts = [];
  const pattern = /==([^=\n]+)==/g;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) {
      parts.push({ type: "text", value: value.slice(cursor, match.index) });
    }

    parts.push({
      type: "element",
      tagName: "mark",
      properties: {},
      children: [{ type: "text", value: match[1] }],
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    parts.push({ type: "text", value: value.slice(cursor) });
  }

  return parts.length ? parts : [{ type: "text", value }];
}

function rehypeHighlightSyntax() {
  const walk = (node) => {
    if (!node || node.tagName === "code" || node.tagName === "pre") return;
    if (!Array.isArray(node.children)) return;

    node.children = node.children.flatMap((child) => {
      if (child.type === "text" && child.value.includes("==")) {
        return splitHighlightSyntax(child.value);
      }

      walk(child);
      return child;
    });
  };

  return walk;
}

/**
 * Modal de detalhe do card. Layout inspirado na card-back do Trello (pill do
 * dia, circulo + titulo, secao Descricao), na identidade do projeto (superficie
 * com profundidade, accent vermelho) e seguindo as Web Interface Guidelines:
 * Escape, foco preso, inert no fundo, retorno de foco, overscroll contido e
 * prefers-reduced-motion. Markdown na descricao e fase posterior (Camada 3).
 */
const PERIOD_OPTS = [
  { key: "morning", label: "Manhã", Icon: Sunrise },
  { key: "afternoon", label: "Tarde", Icon: Sun },
  { key: "night", label: "Noite", Icon: Moon },
];

export default function CardModal({
  card,
  day,
  weekMode = false,
  labelCatalog = null,
  onCreateLabel,
  onUpdateLabel,
  onChange,
  onDelete,
  onClose,
}) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const labelsBtnRef = useRef(null);
  const periodBtnRef = useRef(null);
  const monthBtnRef = useRef(null);
  const closingRef = useRef(false);

  // Modelo rascunho->commit: tudo edita um draft local; X/Esc/clique-fora
  // descartam, so o botao Salvar comita (onChange) o card de volta na coluna.
  const [draft, setDraft] = useState(card);
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const [menu, setMenu] = useState(null); // null | "labels" | "period"
  const [descEditing, setDescEditing] = useState(false);
  const [periodError, setPeriodError] = useState(false);
  const [availableLabels, setAvailableLabels] = useState(() => labelCatalog || getLabels());
  const [duePickerListId, setDuePickerListId] = useState(null);
  const [dueTextByList, setDueTextByList] = useState({});
  const [monthOpen, setMonthOpen] = useState(false);
  const [dragLabelId, setDragLabelId] = useState(null);

  useEffect(() => {
    if (!labelCatalog) return;
    setAvailableLabels(labelCatalog);
    persistLabels(labelCatalog);
  }, [labelCatalog]);

  const labels = draft.labels || [];
  const headerLabels = labels
    .map((id) => availableLabels.find((item) => item.id === id) || labelById(id))
    .filter((label) => label?.color && label.color !== "transparent")
    .slice(0, 4);
  const headerLabel = headerLabels[0] || null;
  const checklists = draft.checklists || [];
  const toggleLabel = (id) => {
    const isSelected = labels.includes(id);
    if (!isSelected && labels.length >= 4) return;
    patch({
      labels: isSelected ? labels.filter((x) => x !== id) : [...labels, id],
    });
  };

  const createLabel = (label) => {
    setAvailableLabels((current) => {
      const next = [...current, label];
      persistLabels(next);
      return next;
    });
    onCreateLabel?.(label);
    patch({ labels: [...new Set([...labels, label.id])].slice(0, 4) });
  };

  const updateLabel = (label) => {
    setAvailableLabels((current) => {
      const next = current.map((item) => (item.id === label.id ? label : item));
      persistLabels(next);
      return next;
    });
    onUpdateLabel?.(label);
  };

  const reorderLabels = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const from = labels.indexOf(fromId);
    const to = labels.indexOf(toId);
    if (from < 0 || to < 0) return;

    const next = [...labels];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    patch({ labels: next });
  };

  const updateChecklists = (next) => patch({ checklists: next });

  const addChecklist = () => {
    if (checklists.length) return;
    updateChecklists([
      {
        id: makeClientId(),
        title: "Checklist",
        items: [],
        composing: true,
        draft: "",
      },
    ]);
  };

  const deleteChecklist = (id) => {
    updateChecklists(checklists.filter((list) => list.id !== id));
  };

  const patchChecklist = (id, patch) => {
    updateChecklists(
      checklists.map((list) => (list.id === id ? { ...list, ...patch } : list))
    );
  };

  const addChecklistItem = (list) => {
    const text = (list.draft || "").trim();
    if (!text) return;
    patchChecklist(list.id, {
      draft: "",
      composing: true,
      items: [
        ...(list.items || []),
        {
          id: makeClientId(),
          text,
          done: false,
          dueDate: list.draftDueDate || "",
        },
      ],
      draftDueDate: "",
    });
    setDuePickerListId(null);
    setDueTextByList((current) => ({
      ...current,
      [list.id]: { day: "", month: "" },
    }));
  };

  const patchChecklistItem = (listId, itemId, patch) => {
    updateChecklists(
      checklists.map((list) =>
        list.id === listId
          ? {
              ...list,
              items: (list.items || []).map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : list
      )
    );
  };

  const deleteChecklistItem = (listId, itemId) => {
    updateChecklists(
      checklists.map((list) =>
        list.id === listId
          ? { ...list, items: (list.items || []).filter((item) => item.id !== itemId) }
          : list
      )
    );
  };

  const toggleDuePicker = (list) => {
    setMonthOpen(false);
    setDuePickerListId((current) => (current === list.id ? null : list.id));
    setDueTextByList((current) => ({
      ...current,
      [list.id]: dueDateParts(list.draftDueDate),
    }));
  };

  const updateDueDraft = (list, patch) => {
    const current = dueTextByList[list.id] || dueDateParts(list.draftDueDate);
    const next = {
      ...current,
      ...Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [key, cleanDuePart(value)])
      ),
    };
    setDueTextByList((state) => ({ ...state, [list.id]: next }));
  };

  const saveDraftDueDate = (list) => {
    const nextDate = buildDueDate(dueTextByList[list.id] || dueDateParts(list.draftDueDate));
    if (!nextDate) return;
    patchChecklist(list.id, { draftDueDate: nextDate });
    setMonthOpen(false);
    setDuePickerListId(null);
  };

  const reduce = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Entrada (GSAP) + foco inicial no painel.
  useLayoutEffect(() => {
    const r = reduce();
    gsap.set(backdropRef.current, { opacity: 0 });
    gsap.set(panelRef.current, { opacity: 0, y: 16, scale: 0.97 });
    gsap.to(backdropRef.current, {
      opacity: 1,
      duration: r ? 0 : 0.25,
      ease: "power2.out",
    });
    gsap.to(panelRef.current, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: r ? 0 : 0.34,
      ease: "power3.out",
    });
    autoGrow(titleRef.current);
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // inert + aria-hidden no fundo enquanto aberto; restaura o foco ao fechar.
  useEffect(() => {
    const root = document.getElementById("root");
    const prevFocus = document.activeElement;
    if (root) {
      root.setAttribute("inert", "");
      root.setAttribute("aria-hidden", "true");
    }
    return () => {
      if (root) {
        root.removeAttribute("inert");
        root.removeAttribute("aria-hidden");
      }
      if (prevFocus && typeof prevFocus.focus === "function") {
        prevFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const r = reduce();
    gsap.killTweensOf([backdropRef.current, panelRef.current]);
    gsap.to(panelRef.current, {
      opacity: 0,
      y: 12,
      scale: 0.97,
      duration: r ? 0 : 0.2,
      ease: "power2.in",
    });
    gsap.to(backdropRef.current, {
      opacity: 0,
      duration: r ? 0 : 0.22,
      ease: "power2.in",
      onComplete: onClose,
    });
  };

  // Salvar comita o draft. Em Modo Semana o periodo e obrigatorio: sem ele,
  // marca erro e abre o seletor de periodo (sem travar o fechar/Esc).
  const handleSave = () => {
    if (weekMode && !draft.period) {
      setPeriodError(true);
      setMenu("period");
      periodBtnRef.current?.focus({ preventScroll: true });
      return;
    }
    onChange(draft);
    close();
  };

  // Escape fecha; Tab fica preso dentro do painel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (monthOpen) {
          setMonthOpen(false);
        } else if (menu) {
          setMenu(null);
        } else if (descEditing) {
          setDescEditing(false);
        } else {
          close();
        }
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = Array.from(
        panelRef.current.querySelectorAll(
          'button, textarea, input, [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, descEditing, monthOpen]);

  return createPortal(
    <div
      className="cardmodal"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe do cartão"
    >
      <div className="cardmodal__backdrop" ref={backdropRef} onClick={close} />

      <div
        className="cardmodal__panel"
        ref={panelRef}
        tabIndex={-1}
      >
        <div
          className={`cardmodal__hero${headerLabel ? " has-label" : ""}${
            headerLabels.length > 1 ? " has-multiple-labels" : ""
          }`}
          style={headerLabel ? { "--cardmodal-label-color": headerLabel.color } : undefined}
        >
        <div className="cardmodal__top">
          {day ? <span className="cardmodal__daypill">{day}</span> : <span />}
          <button
            type="button"
            className="cardmodal__close"
            onClick={close}
            aria-label="Fechar"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="cardmodal__title-row">
          <Checkbox
            checked={!!draft.done}
            onChange={(v) => patch({ done: v })}
            size={22}
            label={draft.done ? "Marcar como não feito" : "Marcar como feito"}
          />
          <textarea
            ref={titleRef}
            className="cardmodal__title"
            value={draft.title}
            rows={1}
            spellCheck={false}
            aria-label="Título do cartão"
            placeholder="Título do cartão"
            onChange={(e) => {
              patch({ title: e.target.value });
              autoGrow(e.target);
            }}
          />
        </div>
        {headerLabels.length > 1 ? (
          <div className="cardmodal__hero-labels" aria-label="Cores das etiquetas">
            {headerLabels.map((label) => (
              <span
                key={label.id}
                className="cardmodal__hero-label"
                style={{ background: label.color, color: label.color }}
                title={label.name || "Etiqueta"}
              />
            ))}
          </div>
        ) : null}
        </div>

        <div className="cardmodal__actions">
          <button
            type="button"
            ref={labelsBtnRef}
            className={`cardmodal__action${menu === "labels" ? " is-open" : ""}`}
            onClick={() => setMenu(menu === "labels" ? null : "labels")}
          >
            <Tag size={16} strokeWidth={2.2} />
            <span>Etiquetas</span>
          </button>
          <button
            type="button"
            className="cardmodal__action"
            onClick={addChecklist}
          >
            <CheckSquare size={16} strokeWidth={2.2} />
            <span>Checklist</span>
          </button>
          {weekMode ? (
            (() => {
              const opt = PERIOD_OPTS.find((o) => o.key === draft.period);
              const PeriodIcon = opt?.Icon || Clock;
              return (
                <button
                  type="button"
                  ref={periodBtnRef}
                  className={`cardmodal__action${menu === "period" ? " is-open" : ""}${
                    periodError && !draft.period ? " is-error" : ""
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={menu === "period"}
                  aria-invalid={periodError && !draft.period}
                  onClick={() => setMenu(menu === "period" ? null : "period")}
                >
                  <PeriodIcon size={16} strokeWidth={2.2} />
                  <span>{opt ? opt.label : "Período"}</span>
                </button>
              );
            })()
          ) : null}
        </div>
        {weekMode && periodError && !draft.period ? (
          <p className="cardmodal__period-error" role="alert">
            Escolha um período para salvar sua nota.
          </p>
        ) : null}

        <div className="cardmodal__label-block" aria-label="Etiquetas">
          <span className="cardmodal__label-title">Etiquetas</span>
          <div className="cardmodal__label-list">
            {labels.map((id) => {
              const l = availableLabels.find((item) => item.id === id) || labelById(id);
              if (!l) return null;
              return (
                <button
                  type="button"
                  key={id}
                  className={`cardmodal__label${dragLabelId === id ? " is-dragging" : ""}`}
                  style={{ background: l.color }}
                  title={l.name || "Etiqueta"}
                  draggable={labels.length > 1}
                  onDragStart={(e) => {
                    setDragLabelId(id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    reorderLabels(dragLabelId || e.dataTransfer.getData("text/plain"), id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorderLabels(dragLabelId || e.dataTransfer.getData("text/plain"), id);
                    setDragLabelId(null);
                  }}
                  onDragEnd={() => setDragLabelId(null)}
                  onClick={() => setMenu(menu === "labels" ? null : "labels")}
                >
                  {l.name ? <span>{l.name}</span> : null}
                </button>
              );
            })}
            <button
              type="button"
              ref={labelsBtnRef}
              className="cardmodal__label-add"
              aria-label="Adicionar etiqueta"
              onClick={() => setMenu(menu === "labels" ? null : "labels")}
            >
              <Plus size={18} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="cardmodal__section">
          <div className="cardmodal__section-head">
            <span className="cardmodal__section-icon" aria-hidden="true">
              <AlignLeft size={18} strokeWidth={2.2} />
            </span>
            <h3 className="cardmodal__section-title">Descrição</h3>
          </div>
          {descEditing ? (
            <MarkdownEditor
              value={draft.description || ""}
              onSave={(v) => {
                patch({ description: v });
                setDescEditing(false);
              }}
              onCancel={() => setDescEditing(false)}
            />
          ) : draft.description ? (
            <div
              className="cardmodal__desc-read md-rendered"
              role="button"
              tabIndex={0}
              aria-label="Editar descrição"
              onClick={() => setDescEditing(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setDescEditing(true);
                }
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlightSyntax]}
              >
                {draft.description}
              </ReactMarkdown>
            </div>
          ) : (
            <button
              type="button"
              className="cardmodal__desc-empty"
              onClick={() => setDescEditing(true)}
            >
              Adicione uma descrição mais detalhada…
            </button>
          )}
        </div>

        {checklists.map((list) => {
          const items = list.items || [];
          const done = items.filter((item) => item.done).length;
          const percent = items.length ? Math.round((done / items.length) * 100) : 0;
          const dueDraftParts = dueTextByList[list.id] || dueDateParts(list.draftDueDate);

          return (
            <div className="checklist" key={list.id}>
              <div className="checklist__head">
                <div className="checklist__title-wrap">
                  <CheckSquare size={18} strokeWidth={2.2} />
                  <h3 className="checklist__title">{list.title || "Checklist"}</h3>
                </div>
                <button
                  type="button"
                  className="checklist__delete"
                  onClick={() => deleteChecklist(list.id)}
                >
                  Excluir
                </button>
              </div>

              <div className="checklist__progress">
                <span>{percent}%</span>
                <div className="checklist__bar" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>

              {items.length ? (
                <div className="checklist__items">
                  {items.map((item) => (
                    <div className="checkitem" key={item.id}>
                      <Checkbox
                        checked={item.done}
                        onChange={(value) =>
                          patchChecklistItem(list.id, item.id, { done: value })
                        }
                        size={18}
                        label={`Marcar ${item.text}`}
                      />
                      <input
                        className="checkitem__text"
                        value={item.text}
                        onChange={(event) =>
                          patchChecklistItem(list.id, item.id, {
                            text: event.target.value,
                          })
                        }
                      />
                      {item.dueDate ? (
                        <span className="checkitem__due">
                          <Clock size={13} strokeWidth={2.2} />
                          {formatDueDate(item.dueDate)}
                        </span>
                      ) : (
                        <span
                          className="checkitem__due checkitem__due--empty"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        type="button"
                        className="checkitem__remove"
                        aria-label="Excluir item"
                        onClick={() => deleteChecklistItem(list.id, item.id)}
                      >
                        <X size={14} strokeWidth={2.3} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {list.composing ? (
                <div className="checklist__composer">
                  <input
                    className="checklist__input"
                    value={list.draft || ""}
                    placeholder="Adicionar um item"
                    onChange={(event) =>
                      patchChecklist(list.id, { draft: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addChecklistItem(list);
                      } else if (event.key === "Escape") {
                        patchChecklist(list.id, {
                          composing: false,
                          draft: "",
                          draftDueDate: "",
                        });
                        setMonthOpen(false);
                        setDuePickerListId(null);
                      }
                    }}
                    autoFocus
                  />
                  <div className="checklist__composer-actions">
                    <button
                      type="button"
                      className="checklist__add"
                      onClick={() => addChecklistItem(list)}
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      className="checklist__cancel"
                      onClick={() => {
                        patchChecklist(list.id, {
                          composing: false,
                          draft: "",
                          draftDueDate: "",
                        });
                        setMonthOpen(false);
                        setDuePickerListId(null);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={`checklist__meta checklist__date${
                        duePickerListId === list.id ? " is-open" : ""
                      }`}
                      onClick={() => toggleDuePicker(list)}
                    >
                      <Clock size={15} strokeWidth={2.2} />
                      <span>{formatDueDate(list.draftDueDate)}</span>
                    </button>
                  </div>
                  {duePickerListId === list.id ? (
                    <div className="checklist__date-panel">
                      <label className="checklist__date-field">
                        <span>Dia</span>
                        <input
                          className="checklist__date-input"
                          value={dueDraftParts.day}
                          placeholder="00"
                          inputMode="numeric"
                          maxLength={2}
                          aria-label="Dia da entrega"
                          onChange={(event) =>
                            updateDueDraft(list, { day: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              saveDraftDueDate(list);
                            } else if (event.key === "Escape") {
                              setDuePickerListId(null);
                            }
                          }}
                          autoFocus
                        />
                      </label>
                      <div className="checklist__date-field">
                        <span>Mês</span>
                        <button
                          type="button"
                          ref={monthBtnRef}
                          className={`checklist__month-trigger${
                            dueDraftParts.month ? "" : " is-placeholder"
                          }`}
                          aria-haspopup="listbox"
                          aria-expanded={monthOpen}
                          aria-label="Mês da entrega"
                          onClick={() => setMonthOpen((open) => !open)}
                        >
                          <span>
                            {MONTHS.find((m) => m.value === dueDraftParts.month)
                              ?.label || "Mês"}
                          </span>
                          <ChevronDown size={14} strokeWidth={2.4} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="checklist__date-save"
                        onClick={() => saveDraftDueDate(list)}
                        disabled={!buildDueDate(dueDraftParts)}
                      >
                        Salvar
                      </button>
                      {monthOpen ? (
                        <Popover
                          anchorRef={monthBtnRef}
                          width={150}
                          className="kpop--menu"
                          onClose={() => setMonthOpen(false)}
                        >
                          <ul className="month-list" role="listbox">
                            <li>
                              <button
                                type="button"
                                role="option"
                                aria-selected={!dueDraftParts.month}
                                className={`month-opt${
                                  dueDraftParts.month ? "" : " is-active"
                                }`}
                                onClick={() => {
                                  updateDueDraft(list, { month: "" });
                                  setMonthOpen(false);
                                }}
                              >
                                Mês
                              </button>
                            </li>
                            {MONTHS.map((month) => (
                              <li key={month.value}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={dueDraftParts.month === month.value}
                                  className={`month-opt${
                                    dueDraftParts.month === month.value
                                      ? " is-active"
                                      : ""
                                  }`}
                                  onClick={() => {
                                    updateDueDraft(list, { month: month.value });
                                    setMonthOpen(false);
                                  }}
                                >
                                  {month.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </Popover>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  className="checklist__add-placeholder"
                  onClick={() => patchChecklist(list.id, { composing: true })}
                >
                  Adicionar um item
                </button>
              )}
            </div>
          );
        })}

        <div className="cardmodal__foot">
          <button type="button" className="cardmodal__delete" onClick={onDelete}>
            <Trash2 size={16} strokeWidth={2.2} />
            <span>Excluir cartão</span>
          </button>
          <button
            type="button"
            className={`cardmodal__save${
              weekMode && !draft.period ? " is-disabled" : ""
            }`}
            aria-disabled={weekMode && !draft.period}
            onClick={handleSave}
          >
            <Save size={16} strokeWidth={2.2} />
            <span>Salvar</span>
          </button>
        </div>
      </div>

      {menu === "period" ? (
        <Popover
          anchorRef={periodBtnRef}
          width={180}
          className="kpop--menu"
          onClose={() => setMenu(null)}
        >
          <div className="kmenu" role="menu">
            <p className="kmenu__label" role="presentation">
              Período
            </p>
            {PERIOD_OPTS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                className="kmenu__item"
                role="menuitemradio"
                aria-checked={draft.period === key}
                onClick={() => {
                  patch({ period: key });
                  setPeriodError(false);
                  setMenu(null);
                }}
              >
                <Icon size={15} strokeWidth={2.2} />
                <span>{label}</span>
                {draft.period === key ? (
                  <Check className="kmenu__check" size={15} strokeWidth={2.6} />
                ) : null}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}

      {menu === "labels" ? (
        <LabelsPopover
          anchorRef={labelsBtnRef}
          selected={labels}
          labels={availableLabels}
          onToggle={toggleLabel}
          onCreate={createLabel}
          onUpdate={updateLabel}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}
