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
  Sunrise,
  Sun,
  Moon,
  SunMoon,
  Bell,
  Check,
  Paperclip,
  Image as ImageIcon,
  ChevronDown,
  MoreHorizontal,
  Archive,
} from "lucide-react";
import AttachmentImage from "./AttachmentImage.jsx";
import AttachmentsSection from "./AttachmentsSection.jsx";
import CoverPopover from "./CoverPopover.jsx";
import { NO_COVER, clamp01, readableTextOn, resolveCover } from "./cover.js";
import { CardAttachmentsContext, DescriptionImage } from "./DescriptionImage.jsx";
import { markdownUrlTransform } from "./markdownExtensions.js";
import { socialNetworkOf } from "./socialLinks.js";
import ChecklistItemText from "./ChecklistItemText.jsx";
import DatesPopover from "./DatesPopover.jsx";
import ReminderPopover from "./ReminderPopover.jsx";
import { MenuItem, MenuList } from "../MenuList.jsx";
import { DUE_STATUS_LABEL, dueStatus, formatCardDates } from "./cardDates.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Checkbox from "./Checkbox.jsx";
import LabelsPopover from "./LabelsPopover.jsx";
import MarkdownEditor from "./MarkdownEditor.jsx";
import Popover from "./Popover.jsx";
import { getLabels, labelById, setLabels as persistLabels } from "./labels.js";
import { makeClientId } from "../../lib/id.js";

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
 * prefers-reduced-motion. A descrição alterna entre leitura e edição explícita.
 */
const PERIOD_OPTS = [
  { key: "morning", label: "Manhã", Icon: Sunrise },
  { key: "afternoon", label: "Tarde", Icon: Sun },
  { key: "night", label: "Noite", Icon: Moon },
];

export default function CardModal({
  card,
  day,
  dayKey = null,
  weekMode = false,
  labelCatalog = null,
  attachmentsApi = null,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  onChange,
  onDelete,
  onArchive,
  onClose,
}) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const labelsBtnRef = useRef(null);
  const periodBtnRef = useRef(null);
  const coverBtnRef = useRef(null);
  const datesBtnRef = useRef(null);
  const reminderBtnRef = useRef(null);
  const bodyRef = useRef(null);
  const titleRowRef = useRef(null);
  const stickyBarRef = useRef(null);
  const addBtnRef = useRef(null);
  const moreBtnRef = useRef(null);
  const [compact, setCompact] = useState(false);
  // Popover aberto a partir do "+ Adicionar" da barra compacta ancora nele.
  const [menuFromBar, setMenuFromBar] = useState(false);
  const attachInputRef = useRef(null);
  const closingRef = useRef(false);
  const coverDragRef = useRef(null);

  // Modelo rascunho->commit: tudo edita um draft local; X/Esc/clique-fora
  // descartam, so o botao Salvar comita (onChange) o card de volta na coluna.
  // Excecao: anexos sao gravados na hora (como no Trello) e entram no draft.
  const [draft, setDraft] = useState(() => ({
    ...card,
    cover: card.cover || NO_COVER,
    attachments: card.attachments || [],
  }));
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const [menu, setMenu] = useState(null); // null | "labels" | "period" | "cover"
  const [descEditing, setDescEditing] = useState(false);
  // Rascunho da descricao: Salvar grava no cartao, Cancelar descarta.
  const [descDraft, setDescDraft] = useState("");
  const startDescEdit = () => {
    setDescDraft(draft.description || "");
    setDescEditing(true);
  };
  const saveDesc = () => {
    patch({ description: descDraft.trim() });
    setDescEditing(false);
  };
  const cancelDesc = () => setDescEditing(false);
  const [periodError, setPeriodError] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const descReadRef = useRef(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descOverflows, setDescOverflows] = useState(false);
  const [availableLabels, setAvailableLabels] = useState(() => labelCatalog || getLabels());
  const [dragLabelId, setDragLabelId] = useState(null);

  useEffect(() => {
    if (!labelCatalog) return;
    setAvailableLabels(labelCatalog);
    persistLabels(labelCatalog);
  }, [labelCatalog]);

  const labels = draft.labels || [];
  const checklists = draft.checklists || [];
  const attachments = draft.attachments || [];
  const cover = resolveCover(draft.cover, attachments);
  const canUpload = Boolean(attachmentsApi?.enabled);
  const hasDates = Boolean(draft.startDate || draft.dueAt);
  // Editando a descricao, quem gruda no topo e a barra do editor.
  const showBar = compact && !descEditing;
  const status = dueStatus(draft);

  const setCover = (next) => {
    patch({ cover: next });
    if (next.type !== "image") setRepositioning(false);
  };

  const repositionStart = useRef(null);
  const startReposition = () => {
    repositionStart.current = { x: cover.x, y: cover.y };
    setMenu(null);
    setRepositioning(true);
  };
  const cancelReposition = () => {
    const start = repositionStart.current;
    if (start) patch({ cover: { ...draft.cover, ...start } });
    setRepositioning(false);
  };

  const uploadAttachment = async (file) => {
    const att = await attachmentsApi.upload(draft, file);
    setDraft((d) => ({ ...d, attachments: [...(d.attachments || []), att] }));
    return att;
  };

  const removeAttachment = async (att) => {
    await attachmentsApi.remove(draft, att);
    setDraft((d) => ({
      ...d,
      attachments: (d.attachments || []).filter((item) => item.id !== att.id),
      cover:
        d.cover?.type === "image" && d.cover.attachmentId === att.id ? NO_COVER : d.cover,
    }));
  };

  const toggleCoverAttachment = (att) => {
    if (cover.type === "image" && cover.attachmentId === att.id) setCover(NO_COVER);
    else setCover({ type: "image", attachmentId: att.id, x: 0.5, y: 0.5 });
  };

  // Reposicionar: arrastar a imagem move o ponto focal (object-position) em
  // coordenadas normalizadas 0..1; setas do teclado fazem o mesmo em passos.
  const onCoverPointerDown = (event) => {
    if (!repositioning || cover.type !== "image") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    coverDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: cover.x,
      y: cover.y,
      width: rect.width,
      height: rect.height,
    };
  };
  const onCoverPointerMove = (event) => {
    const drag = coverDragRef.current;
    if (!drag) return;
    const x = clamp01(drag.x - (event.clientX - drag.startX) / drag.width);
    const y = clamp01(drag.y - (event.clientY - drag.startY) / drag.height);
    patch({ cover: { ...draft.cover, x, y } });
  };
  const onCoverPointerUp = () => {
    coverDragRef.current = null;
  };
  const onCoverKeyDown = (event) => {
    const step = 0.05;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    patch({
      cover: {
        ...draft.cover,
        x: clamp01(cover.x + delta[0]),
        y: clamp01(cover.y + delta[1]),
      },
    });
  };
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

  const deleteLabel = (labelId) => {
    setAvailableLabels((current) => {
      const next = current.filter((item) => item.id !== labelId);
      persistLabels(next);
      return next;
    });
    patch({ labels: labels.filter((id) => id !== labelId) });
    onDeleteLabel?.(labelId);
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

  // Pedido de "levar ate a checklist": o efeito abaixo rola ate o campo
  // "Adicionar um item" e poe o cursor nele, depois que o composer renderiza.
  const checklistRef = useRef(null);
  const [checklistFocus, setChecklistFocus] = useState(0);

  useLayoutEffect(() => {
    if (!checklistFocus) return;
    const input = checklistRef.current?.querySelector(".checklist__input");
    if (!input) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    input.focus({ preventScroll: true });
  }, [checklistFocus]);

  // Uma checklist por cartao: se ja existe, o botao leva ate ela e abre o campo.
  const addChecklist = () => {
    setChecklistFocus((n) => n + 1);
    if (checklists.length) {
      if (!checklists[0].composing) patchChecklist(checklists[0].id, { composing: true });
      return;
    }
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
        },
      ],
    });
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

  const reduce = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // No mobile o painel vira bottom sheet (sobe de baixo); no desktop continua
  // o pop centralizado. A geometria (posicao/cantos) fica no CSS; aqui so o
  // movimento GSAP muda de eixo.
  const isSheet = () =>
    window.matchMedia("(max-width: 768px)").matches;

  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Descricao longa nasce recolhida (limite no CSS) com "Mostrar mais".
  useLayoutEffect(() => {
    const el = descReadRef.current;
    if (descEditing || !el) {
      setDescOverflows(false);
      return undefined;
    }
    const measure = () => setDescOverflows(el.scrollHeight > el.clientHeight + 4);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [descEditing, draft.description, descExpanded]);

  // Barra compacta: aparece quando a linha do titulo sai do topo do corpo.
  useEffect(() => {
    const root = bodyRef.current;
    const target = titleRowRef.current;
    if (!root || !target) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        const above = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        setCompact(!entry.isIntersecting && above);
      },
      { root, threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    const bar = stickyBarRef.current;
    if (!bar) return;
    if (showBar) bar.removeAttribute("inert");
    else bar.setAttribute("inert", "");
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Desliza de baixo da capa (o wrapper recorta), sem fade no meio do caminho.
    if (showBar) {
      gsap.set(bar, { autoAlpha: 1 });
      gsap.fromTo(
        bar,
        { yPercent: -100 },
        { yPercent: 0, duration: r ? 0 : 0.26, ease: "power3.out", overwrite: true }
      );
    } else {
      gsap.to(bar, {
        yPercent: -100,
        duration: r ? 0 : 0.2,
        ease: "power2.in",
        overwrite: true,
        onComplete: () => gsap.set(bar, { autoAlpha: 0 }),
      });
    }
  }, [showBar]);

  useEffect(() => {
    if (menu === null) setMenuFromBar(false);
  }, [menu]);

  const openFromBar = (next) => {
    setMenuFromBar(true);
    setMenu(next);
  };

  // Entrada (GSAP) + foco inicial no painel.
  useLayoutEffect(() => {
    const r = reduce();
    const sheet = isSheet();
    gsap.set(backdropRef.current, { opacity: 0 });
    gsap.set(
      panelRef.current,
      sheet
        ? { opacity: 1, yPercent: 100, scale: 1 }
        : { opacity: 0, y: 16, scale: 0.97 }
    );
    gsap.to(backdropRef.current, {
      opacity: 1,
      duration: r ? 0 : 0.25,
      ease: "power2.out",
    });
    gsap.to(
      panelRef.current,
      sheet
        ? { yPercent: 0, duration: r ? 0 : 0.42, ease: "power3.out" }
        : { opacity: 1, y: 0, scale: 1, duration: r ? 0 : 0.34, ease: "power3.out" }
    );
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
    const sheet = isSheet();
    gsap.killTweensOf([backdropRef.current, panelRef.current]);
    gsap.to(
      panelRef.current,
      sheet
        ? { yPercent: 100, duration: r ? 0 : 0.3, ease: "power3.in" }
        : { opacity: 0, y: 12, scale: 0.97, duration: r ? 0 : 0.2, ease: "power2.in" }
    );
    gsap.to(backdropRef.current, {
      opacity: 0,
      duration: r ? 0 : sheet ? 0.3 : 0.22,
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
        if (menu) {
          setMenu(null);
        } else if (repositioning) {
          cancelReposition();
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
  }, [menu, descEditing, repositioning]);

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
          className={`cardmodal__header${
            cover.type !== "none" ? ` has-cover has-cover-${cover.type}` : ""
          }`}
          style={
            cover.type === "color" ? { "--cover-fg": readableTextOn(cover.color) } : undefined
          }
        >
          {cover.type === "color" ? (
            <div
              className="cardmodal__cover cardmodal__cover--color"
              style={{ background: cover.color }}
              aria-hidden="true"
            />
          ) : null}
          {cover.type === "image" ? (
            <div className="cardmodal__cover cardmodal__cover--image">
              <AttachmentImage
                attachment={cover.attachment}
                alt={`Capa: ${cover.attachment.name}`}
                style={{ objectPosition: `${cover.x * 100}% ${cover.y * 100}%` }}
                draggable={false}
              />
              {repositioning ? (
                <div
                  className="cardmodal__cover-drag"
                  role="application"
                  tabIndex={0}
                  aria-label="Reposicionar capa: arraste a imagem ou use as setas"
                  onPointerDown={onCoverPointerDown}
                  onPointerMove={onCoverPointerMove}
                  onPointerUp={onCoverPointerUp}
                  onPointerCancel={onCoverPointerUp}
                  onKeyDown={onCoverKeyDown}
                />
              ) : null}
            </div>
          ) : null}

          {repositioning ? (
            <div className="cardmodal__reposbar">
              <span>Arraste para reposicionar</span>
              <button type="button" onClick={cancelReposition}>
                Cancelar
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => setRepositioning(false)}
              >
                Aplicar
              </button>
            </div>
          ) : (
            <div className="cardmodal__top">
              {day ? <span className="cardmodal__daypill">{day}</span> : <span />}
              <div className="cardmodal__top-tools">
                <button
                  type="button"
                  ref={coverBtnRef}
                  className={`cardmodal__close${menu === "cover" ? " is-open" : ""}`}
                  aria-label="Capa"
                  title="Capa"
                  aria-haspopup="dialog"
                  aria-expanded={menu === "cover"}
                  onClick={() => setMenu(menu === "cover" ? null : "cover")}
                >
                  <ImageIcon size={17} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  ref={moreBtnRef}
                  className={`cardmodal__close${menu === "more" ? " is-open" : ""}`}
                  aria-label="Mais ações"
                  title="Mais ações"
                  aria-haspopup="menu"
                  aria-expanded={menu === "more"}
                  onClick={() => setMenu(menu === "more" ? null : "more")}
                >
                  <MoreHorizontal size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className="cardmodal__close"
                  onClick={close}
                  aria-label="Fechar"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          )}

          {cover.type !== "none" && !repositioning ? (
            <div className="cardmodal__cover-actions">
              {cover.type === "image" ? (
                <button type="button" onClick={startReposition}>
                  Reposicionar
                </button>
              ) : null}
              <button type="button" onClick={() => setCover(NO_COVER)}>
                Remover capa
              </button>
            </div>
          ) : null}
        </div>

        {/* Cabecalho (capa + ferramentas) fica fixo; so o corpo rola. Ao rolar
            e o titulo sair de vista, a barra compacta aparece por cima. */}
        <div className="cardmodal__bodywrap">
        <div
          ref={stickyBarRef}
          className={`cardmodal__stickybar${showBar ? " is-visible" : ""}`}
          aria-hidden={!showBar}
        >
          <Checkbox
            checked={!!draft.done}
            onChange={(v) => patch({ done: v })}
            size={18}
            label={draft.done ? "Marcar como não feito" : "Marcar como feito"}
          />
          <span className="cardmodal__stickybar-title">{draft.title || "Sem título"}</span>
          <button
            type="button"
            ref={addBtnRef}
            className={`cardmodal__action${menu === "add" ? " is-open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={menu === "add"}
            onClick={() => setMenu(menu === "add" ? null : "add")}
          >
            <Plus size={16} strokeWidth={2.2} />
            <span>Adicionar</span>
          </button>
        </div>
        <div className="cardmodal__body" ref={bodyRef}>
        <div className="cardmodal__hero">
        <div className="cardmodal__title-row" ref={titleRowRef}>
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
        </div>

        <div className="cardmodal__actions">
          {/* Sem etiquetas: so o botao de cima. Com etiquetas: o bloco abaixo
              (lista + "+") assume e este botao some. */}
          {labels.length === 0 ? (
            <button
              type="button"
              ref={labelsBtnRef}
              className={`cardmodal__action${menu === "labels" ? " is-open" : ""}`}
              onClick={() => setMenu(menu === "labels" ? null : "labels")}
            >
              <Tag size={16} strokeWidth={2.2} />
              <span>Etiquetas</span>
            </button>
          ) : null}
          {!hasDates ? (
            <button
              type="button"
              ref={datesBtnRef}
              className={`cardmodal__action${menu === "dates" ? " is-open" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={menu === "dates"}
              onClick={() => setMenu(menu === "dates" ? null : "dates")}
            >
              <Clock size={16} strokeWidth={2.2} />
              <span>Datas</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`cardmodal__action${checklists.length ? " is-active" : ""}`}
            onClick={addChecklist}
          >
            <CheckSquare size={16} strokeWidth={2.2} />
            <span>Checklist</span>
          </button>
          <button
            type="button"
            className="cardmodal__action"
            disabled={!canUpload}
            title={canUpload ? undefined : "Entre na sua conta para anexar arquivos"}
            onClick={() => attachInputRef.current?.click()}
          >
            <Paperclip size={16} strokeWidth={2.2} />
            <span>Anexo</span>
          </button>
          {weekMode ? (
            (() => {
              const opt = PERIOD_OPTS.find((o) => o.key === draft.period);
              const PeriodIcon = opt?.Icon || SunMoon;
              return (
                <button
                  type="button"
                  ref={periodBtnRef}
                  className={`cardmodal__action${draft.period ? " has-value" : ""}${
                    menu === "period" ? " is-open" : ""
                  }${
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
          {weekMode ? (
            <button
              type="button"
              ref={reminderBtnRef}
              className={`cardmodal__action${draft.reminderTime ? " has-value" : ""}${
                menu === "reminder" ? " is-open" : ""
              }`}
              aria-haspopup="dialog"
              aria-expanded={menu === "reminder"}
              onClick={() => setMenu(menu === "reminder" ? null : "reminder")}
            >
              <Bell size={16} strokeWidth={2.2} />
              <span>{draft.reminderTime ? `Lembrete · ${draft.reminderTime}` : "Lembrete"}</span>
            </button>
          ) : null}
        </div>
        {weekMode && periodError && !draft.period ? (
          <p className="cardmodal__period-error" role="alert">
            Escolha um período para salvar sua nota.
          </p>
        ) : null}

        {labels.length > 0 || hasDates ? (
        <div className="cardmodal__meta-row">
        {labels.length > 0 ? (
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
                  style={{ "--label-color": l.color, "--label-fg": readableTextOn(l.color) }}
                  title={l.name || "Sem nome"}
                  aria-label={l.name ? `Etiqueta ${l.name}` : "Etiqueta sem nome"}
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
        ) : null}
        {hasDates ? (
          <div className="cardmodal__label-block" aria-label="Datas">
            <span className="cardmodal__label-title">Datas</span>
            <button
              type="button"
              ref={datesBtnRef}
              className="cardmodal__dates-chip"
              aria-haspopup="dialog"
              aria-expanded={menu === "dates"}
              onClick={() => setMenu(menu === "dates" ? null : "dates")}
            >
              <span>{formatCardDates(draft)}</span>
              {status ? (
                <span className={`duebadge__tag is-${status}`}>{DUE_STATUS_LABEL[status]}</span>
              ) : null}
              <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        </div>
        ) : null}

        <div className="cardmodal__section">
          <div className="cardmodal__section-head">
            <span className="cardmodal__section-icon" aria-hidden="true">
              <AlignLeft size={18} strokeWidth={2.2} />
            </span>
            <h3 className="cardmodal__section-title">Descrição</h3>
            {!descEditing && draft.description ? (
              <button
                type="button"
                className="cardmodal__section-edit cardmodal__section-edit--outline"
                onClick={startDescEdit}
              >
                <span>Editar</span>
              </button>
            ) : null}
          </div>
          <CardAttachmentsContext.Provider value={attachments}>
          {descEditing ? (
            <>
              <MarkdownEditor
                value={descDraft}
                onChange={setDescDraft}
                canUpload={canUpload}
                onUploadImage={uploadAttachment}
              />
              <div className="cardmodal__desc-actions">
                <button type="button" className="mdedlg__submit" onClick={saveDesc}>
                  Salvar
                </button>
                <button type="button" className="cardmodal__desc-cancel" onClick={cancelDesc}>
                  Cancelar
                </button>
              </div>
            </>
          ) : draft.description ? (
            <div className="cardmodal__desc-wrap">
            <div
              ref={descReadRef}
              className={`cardmodal__desc-read md-rendered${
                descExpanded ? " is-expanded" : ""
              }${descOverflows ? " is-clipped" : ""}`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                // Previa em cartao (rehypeLinkPreview + LinkPreviewCard) fica
                // desligada ate definirmos onde ela entra.
                rehypePlugins={[rehypeHighlightSyntax]}
                urlTransform={markdownUrlTransform}
                components={{
                  img: ({ node: _node, src, alt }) => <DescriptionImage src={src} alt={alt} />,
                  // Link abre em nova aba e NAO borbulha pro container
                  // "clique pra editar" (senao navegava E abria o editor).
                  // Link de rede social ganha o logo da rede na frente.
                  a: ({ node: _node, children, ...props }) => {
                    const network = socialNetworkOf(props.href);
                    return (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {network ? (
                          <img
                            className="mdlink__icon"
                            src={network.icon}
                            alt=""
                            title={network.label}
                            draggable={false}
                          />
                        ) : null}
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {draft.description}
              </ReactMarkdown>
            </div>
            {descOverflows || descExpanded ? (
              <button
                type="button"
                className="cardmodal__desc-more"
                aria-expanded={descExpanded}
                onClick={() => setDescExpanded((v) => !v)}
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={descExpanded ? { transform: "rotate(180deg)" } : undefined}
                />
                <span>{descExpanded ? "Mostrar menos" : "Mostrar mais"}</span>
              </button>
            ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="cardmodal__desc-empty"
              onClick={startDescEdit}
            >
              Adicione uma descrição mais detalhada…
            </button>
          )}
          </CardAttachmentsContext.Provider>
        </div>

        <AttachmentsSection
          attachments={attachments}
          cover={cover}
          canUpload={canUpload}
          fileInputRef={attachInputRef}
          onUpload={uploadAttachment}
          onDelete={removeAttachment}
          onToggleCover={toggleCoverAttachment}
        />

        {checklists.map((list) => {
          const items = list.items || [];
          const done = items.filter((item) => item.done).length;
          const percent = items.length ? Math.round((done / items.length) * 100) : 0;

          return (
            <div className="checklist" key={list.id} ref={checklistRef}>
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
                      <ChecklistItemText
                        text={item.text}
                        onChange={(text) => patchChecklistItem(list.id, item.id, { text })}
                      />
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
                        });
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
                        });
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
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
            <span>Salvar</span>
          </button>
        </div>
        </div>
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

      {menu === "more" ? (
        <Popover anchorRef={moreBtnRef} width={220} className="kpop--mlist" onClose={() => setMenu(null)}>
          <MenuList label="Mais ações" onClose={() => setMenu(null)}>
            <MenuItem
              icon={<Archive size={16} strokeWidth={2.2} />}
              label="Arquivar"
              onSelect={() => {
                setMenu(null);
                onArchive?.();
              }}
            />
          </MenuList>
        </Popover>
      ) : null}

      {menu === "add" ? (
        <Popover anchorRef={addBtnRef} width={264} className="kpop--mlist" onClose={() => setMenu(null)}>
          <MenuList label="Adicionar ao cartão" onClose={() => setMenu(null)}>
            <MenuItem
              icon={<Tag size={16} strokeWidth={2.2} />}
              label="Etiquetas"
              onSelect={() => openFromBar("labels")}
            />
            <MenuItem
              icon={<Clock size={16} strokeWidth={2.2} />}
              label="Datas"
              onSelect={() => openFromBar("dates")}
            />
            <MenuItem
              icon={<CheckSquare size={16} strokeWidth={2.2} />}
              label="Checklist"
              onSelect={() => {
                addChecklist();
                setMenu(null);
              }}
            />
            <MenuItem
              icon={<Paperclip size={16} strokeWidth={2.2} />}
              label="Anexo"
              onSelect={() => {
                setMenu(null);
                if (canUpload) attachInputRef.current?.click();
              }}
            />
            {weekMode ? (
              <MenuItem
                icon={<Bell size={16} strokeWidth={2.2} />}
                label="Lembrete"
                onSelect={() => openFromBar("reminder")}
              />
            ) : null}
          </MenuList>
        </Popover>
      ) : null}

      {menu === "reminder" ? (
        <ReminderPopover
          anchorRef={menuFromBar ? addBtnRef : reminderBtnRef}
          day={day}
          dayKey={dayKey}
          time={draft.reminderTime || null}
          repeat={draft.reminderRepeat || null}
          days={draft.reminderDays || []}
          onSave={(reminder) =>
            patch(
              reminder
                ? {
                    reminderTime: reminder.time,
                    reminderRepeat: reminder.repeat,
                    reminderDays: reminder.days,
                  }
                : { reminderTime: null, reminderRepeat: null, reminderDays: [] }
            )
          }
          onClose={() => setMenu(null)}
        />
      ) : null}

      {menu === "dates" ? (
        <DatesPopover
          anchorRef={menuFromBar ? addBtnRef : datesBtnRef}
          startDate={draft.startDate || null}
          dueAt={draft.dueAt || null}
          onSave={({ startDate, dueAt }) => patch({ startDate, dueAt })}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {menu === "cover" ? (
        <CoverPopover
          anchorRef={coverBtnRef}
          cover={cover}
          attachments={attachments}
          canUpload={canUpload}
          onChange={setCover}
          onUpload={uploadAttachment}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {menu === "labels" ? (
        <LabelsPopover
          anchorRef={menuFromBar ? addBtnRef : labelsBtnRef}
          selected={labels}
          labels={availableLabels}
          onToggle={toggleLabel}
          onCreate={createLabel}
          onUpdate={updateLabel}
          onDelete={deleteLabel}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}
