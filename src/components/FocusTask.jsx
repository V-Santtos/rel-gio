import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Check, Target, X } from "lucide-react";

/**
 * Selo da tarefa vinculada ao ciclo (Modo Semana), acima dos controles do
 * Foco. O vinculo nasce no botao "Focar" do cartao (aba Tarefas).
 *  - Vinculada: "◎ TAREFA | <cartao> ×", borda levemente terracota com um
 *    pulso bem suave (GSAP, yoyo infinito).
 *  - Sessao terminou: a tarefa e concluida sozinha e o mesmo lugar mostra
 *    "✓ Tarefa concluída | <cartao>" por alguns segundos, depois some.
 * Animacoes em GSAP via useLayoutEffect, respeitando prefers-reduced-motion.
 */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Brilho do pulso: luz terracota difusa (blur grande, alfa baixo) que
// "respira" em volta do selo, sem anel marcado.
const GLOW_OFF = "0 0 14px 0px rgba(231, 111, 81, 0.04)";
const GLOW_ON = "0 0 26px 2px rgba(231, 111, 81, 0.14)";

export function FocusTaskBar({ task, completed, onUnlink, onCompletedShown }) {
  const chipRef = useRef(null);
  const doneRef = useRef(null);
  const checkRef = useRef(null);
  const shownRef = useRef(onCompletedShown);
  shownRef.current = onCompletedShown;

  // Entrada + pulso leve enquanto houver tarefa vinculada.
  useLayoutEffect(() => {
    const el = chipRef.current;
    if (!task || !el || reduceMotion()) return undefined;
    const tl = gsap.timeline();
    tl.fromTo(
      el,
      { autoAlpha: 0, y: 8, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out", clearProps: "transform" }
    );
    const pulse = gsap.fromTo(
      el,
      { boxShadow: GLOW_OFF },
      { boxShadow: GLOW_ON, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 0.45 }
    );
    return () => {
      tl.kill();
      pulse.kill();
      gsap.set(el, { clearProps: "boxShadow,opacity,visibility,transform" });
    };
  }, [task?.id]);

  // Feedback de conclusao: entra, o check "estala", segura e sai sozinho.
  useLayoutEffect(() => {
    const el = doneRef.current;
    if (!completed || !el) return undefined;
    const finish = () => shownRef.current?.();
    if (reduceMotion()) {
      const t = setTimeout(finish, 3200);
      return () => clearTimeout(t);
    }
    const tl = gsap.timeline({ onComplete: finish });
    tl.fromTo(
      el,
      { autoAlpha: 0, y: 8, scale: 0.94 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }
    )
      .fromTo(
        checkRef.current,
        { scale: 0, rotation: -30 },
        { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.4)" },
        "-=0.2"
      )
      .to(el, { autoAlpha: 0, y: -6, duration: 0.4, ease: "power2.in" }, "+=2.6");
    return () => tl.kill();
  }, [completed?.key]);

  if (task) {
    return (
      <div className="focus-task">
        <div
          className="focus-task__chip is-linked"
          ref={chipRef}
          role="status"
          aria-label={`Focando na tarefa ${task.title || "sem título"}`}
        >
          <Target className="focus-task__icon" size={15} strokeWidth={2.2} aria-hidden="true" />
          <span className="focus-task__label">Tarefa</span>
          <span className="focus-task__sep" aria-hidden="true" />
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

  if (completed) {
    return (
      <div className="focus-task">
        <div className="focus-task__chip is-done" ref={doneRef} role="status" aria-live="polite">
          <span className="focus-task__check" ref={checkRef} aria-hidden="true">
            <Check size={12} strokeWidth={3} />
          </span>
          <span className="focus-task__label">Tarefa concluída</span>
          <span className="focus-task__sep" aria-hidden="true" />
          <span className="focus-task__title" title={completed.title}>
            {completed.title || "Tarefa sem título"}
          </span>
        </div>
      </div>
    );
  }

  // Sem vinculo nao mostra nada: vincular e feito pelo botao "Focar" do cartao.
  return null;
}
