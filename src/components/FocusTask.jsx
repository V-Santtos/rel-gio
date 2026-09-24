import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, Link2, Timer, X } from "lucide-react";
import Popover from "./Kanban/Popover.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { weekDayKey } from "./Kanban/alarms.js";

/**
 * Vinculo ciclo <-> tarefa (Modo Semana). Tres pecas:
 *  - FocusTaskBar: selo "Focando em · <cartao>" acima dos controles do Foco
 *    (ou o atalho "Vincular tarefa" quando nada esta vinculado);
 *  - TaskPicker: popover com os cartoes abertos da semana, hoje primeiro;
 *  - FocusFinishPrompt: ao fim da sessao, oferece concluir o cartao.
 * Animacoes em GSAP via useLayoutEffect, respeitando prefers-reduced-motion.
 */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const WEEK = [
  ["monday", "Segunda"],
  ["tuesday", "Terça"],
  ["wednesday", "Quarta"],
  ["thursday", "Quinta"],
  ["friday", "Sexta"],
  ["saturday", "Sábado"],
  ["sunday", "Domingo"],
];

export function FocusTaskBar({ task, running, onUnlink, onPick, userId }) {
  const chipRef = useRef(null);
  const linkRef = useRef(null);
  const [picking, setPicking] = useState(false);

  // Entrada do selo a cada tarefa nova vinculada.
  useLayoutEffect(() => {
    if (!task || !chipRef.current || reduceMotion()) return;
    gsap.fromTo(
      chipRef.current,
      { autoAlpha: 0, y: 8, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out", clearProps: "all" }
    );
  }, [task?.id]);

  if (!task) {
    // Sem vinculo: atalho discreto, so com o ciclo parado (nao polui o foco).
    if (running) return null;
    return (
      <div className="focus-task">
        <button
          type="button"
          ref={linkRef}
          className="focus-task__link"
          aria-haspopup="dialog"
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
        >
          <Link2 size={15} strokeWidth={2.2} />
          <span>Vincular tarefa</span>
        </button>
        {picking ? (
          <TaskPicker
            anchorRef={linkRef}
            userId={userId}
            onPick={(picked) => {
              setPicking(false);
              onPick(picked);
            }}
            onClose={() => setPicking(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="focus-task">
      <div className="focus-task__chip" ref={chipRef} role="status">
        <span className="focus-task__dot" aria-hidden="true" />
        <span className="focus-task__label">Focando em</span>
        <span className="focus-task__title" title={task.title}>
          {task.title || "Tarefa sem título"}
        </span>
        <button
          type="button"
          className="focus-task__remove"
          onClick={onUnlink}
          aria-label="Desvincular tarefa"
          title="Desvincular tarefa"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function TaskPicker({ anchorRef, userId, onPick, onClose }) {
  const [state, setState] = useState({ loading: true, groups: [], error: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase || !userId) {
        setState({ loading: false, groups: [], error: "Entre na sua conta para vincular tarefas." });
        return;
      }
      const lanesRes = await supabase
        .from("task_lanes")
        .select("id, day_key")
        .eq("user_id", userId)
        .in("day_key", WEEK.map(([key]) => key));
      const lanes = lanesRes.data || [];
      const tasksRes = lanes.length
        ? await supabase
            .from("tasks")
            .select("id, title, lane_id, sort_order")
            .eq("user_id", userId)
            .in("lane_id", lanes.map((l) => l.id))
            .eq("done", false)
            .neq("status", "archived")
            .order("sort_order", { ascending: true })
        : { data: [] };
      if (!active) return;
      if (lanesRes.error || tasksRes.error) {
        setState({ loading: false, groups: [], error: "Não consegui carregar suas tarefas." });
        return;
      }
      const dayOf = new Map(lanes.map((l) => [l.id, l.day_key]));
      // Hoje primeiro, depois os proximos dias da semana em ordem.
      const today = WEEK.findIndex(([key]) => key === weekDayKey());
      const ordered = [...WEEK.slice(today), ...WEEK.slice(0, today)];
      const groups = ordered
        .map(([key, label], i) => ({
          key,
          label: i === 0 ? `Hoje · ${label}` : label,
          items: (tasksRes.data || []).filter((t) => dayOf.get(t.lane_id) === key),
        }))
        .filter((g) => g.items.length);
      setState({ loading: false, groups, error: "" });
    }
    load();
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <Popover anchorRef={anchorRef} width={300} className="kpop--taskpick" onClose={onClose} ariaLabel="Vincular tarefa">
      <div
        className="taskpick"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="kpop__head">
          <p className="kpop__title">Vincular tarefa</p>
          <button type="button" className="kpop__close" aria-label="Fechar" onClick={onClose}>
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        {state.loading ? (
          <p className="taskpick__empty">Carregando…</p>
        ) : state.error ? (
          <p className="taskpick__empty">{state.error}</p>
        ) : !state.groups.length ? (
          <p className="taskpick__empty">Nenhuma tarefa aberta no modo Semana.</p>
        ) : (
          <div className="taskpick__list">
            {state.groups.map((group) => (
              <div key={group.key} className="taskpick__group">
                <p className="taskpick__day">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="taskpick__item"
                    onClick={() => onPick({ id: item.id, title: item.title || "" })}
                  >
                    {item.title || "Tarefa sem título"}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}

/**
 * Fim da sessao com tarefa vinculada: cartao flutuante (nao bloqueia a tela)
 * perguntando se a tarefa foi concluida.
 */
export function FocusFinishPrompt({ task, cycles, onComplete, onDismiss }) {
  const ref = useRef(null);
  const doneRef = useRef(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    doneRef.current?.focus({ preventScroll: true });
    if (reduceMotion()) return;
    gsap.fromTo(
      ref.current,
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" }
    );
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="focus-finish" ref={ref} role="dialog" aria-labelledby="focus-finish-title">
      <span className="focus-finish__icon" aria-hidden="true">
        <Timer size={18} strokeWidth={2.3} />
      </span>
      <div className="focus-finish__body">
        <p className="focus-finish__title" id="focus-finish-title">
          Sessão concluída
          {cycles ? ` · ${cycles} ${cycles === 1 ? "ciclo" : "ciclos"}` : ""}
        </p>
        <p className="focus-finish__text">
          Marcar <strong>{task.title || "a tarefa"}</strong> como concluída?
        </p>
        <div className="focus-finish__actions">
          <button type="button" ref={doneRef} className="focus-finish__done" onClick={onComplete}>
            <Check size={15} strokeWidth={2.6} />
            <span>Concluir</span>
          </button>
          <button type="button" className="focus-finish__later" onClick={onDismiss}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
