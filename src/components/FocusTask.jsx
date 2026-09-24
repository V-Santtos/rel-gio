import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Check, Timer, X } from "lucide-react";

/**
 * Vinculo ciclo <-> tarefa (Modo Semana). O vinculo nasce no botao "Focar"
 * do cartao (aba Tarefas). Duas pecas:
 *  - FocusTaskBar: selo "Focando em · <cartao>" acima dos controles do Foco;
 *  - FocusFinishPrompt: ao fim da sessao, oferece concluir o cartao.
 * Animacoes em GSAP via useLayoutEffect, respeitando prefers-reduced-motion.
 */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function FocusTaskBar({ task, onUnlink }) {
  const chipRef = useRef(null);

  // Entrada do selo a cada tarefa nova vinculada.
  useLayoutEffect(() => {
    if (!task || !chipRef.current || reduceMotion()) return;
    gsap.fromTo(
      chipRef.current,
      { autoAlpha: 0, y: 8, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out", clearProps: "all" }
    );
  }, [task?.id]);

  // Sem vinculo nao mostra nada: vincular e feito pelo botao "Focar" do cartao.
  if (!task) return null;

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
