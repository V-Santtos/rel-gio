import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Check, Target, X } from "lucide-react";

/**
 * Selo da tarefa vinculada ao ciclo (Modo Semana), acima dos controles do
 * Foco. O vinculo nasce no botao "Focar" do cartao (aba Tarefas).
 *  - Vinculada: "◎ TAREFA | <cartao> ×", borda levemente terracota com um
 *    brilho difuso que pulsa bem fraco (GSAP, yoyo infinito).
 *  - Sessao terminou: a tarefa e concluida sozinha e o mesmo lugar mostra
 *    "✓ Tarefa concluída | <cartao>" (so texto, sem pilula), depois some.
 * O espaco do selo (.focus-task) abre e fecha animado em altura, para o
 * relogio e os controles deslizarem em vez de pularem.
 * Animacoes em GSAP via useLayoutEffect, respeitando prefers-reduced-motion.
 */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Brilho do pulso: luz terracota difusa (blur grande, alfa baixo) que
// "respira" em volta do selo, sem anel marcado.
const GLOW_OFF = "0 0 14px 0px rgba(231, 111, 81, 0.04)";
const GLOW_ON = "0 0 26px 2px rgba(231, 111, 81, 0.14)";

// Abre/fecha o espaco do selo (altura + margens) de forma suave.
const COLLAPSED = { height: 0, marginTop: 0, marginBottom: 0 };
const openBox = (box) =>
  gsap.from(box, { ...COLLAPSED, duration: 0.45, ease: "power2.out", clearProps: "height,marginTop,marginBottom" });
const closeBox = (box, onComplete) =>
  gsap.to(box, { ...COLLAPSED, duration: 0.45, ease: "power2.inOut", onComplete });

export function FocusTaskBar({ task, completed, onUnlink, onCompletedShown }) {
  const boxRef = useRef(null);
  const chipRef = useRef(null);
  const doneRef = useRef(null);
  const checkRef = useRef(null);
  const rippleRef = useRef(null);
  const shownRef = useRef(onCompletedShown);
  shownRef.current = onCompletedShown;
  // O selo "concluida" reaproveita o espaco do selo vinculado quando vem
  // direto dele; so abre o espaco do zero se nada estava na tela.
  const hadTaskRef = useRef(false);

  // Entrada + pulso leve enquanto houver tarefa vinculada.
  useLayoutEffect(() => {
    const el = chipRef.current;
    if (!task || !el) return undefined;
    hadTaskRef.current = true;
    if (reduceMotion()) return undefined;
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

  // Feedback de conclusao: texto entra, o check "estala" com uma onda, segura,
  // sai, e o espaco fecha deslizando o layout de volta.
  useLayoutEffect(() => {
    const el = doneRef.current;
    const box = boxRef.current;
    if (!completed || !el || !box) return undefined;
    const cameFromTask = hadTaskRef.current;
    hadTaskRef.current = false;
    const finish = () => shownRef.current?.();
    if (reduceMotion()) {
      const t = setTimeout(finish, 3200);
      return () => clearTimeout(t);
    }
    const tl = gsap.timeline({ onComplete: finish });
    if (!cameFromTask) tl.add(openBox(box));
    tl.fromTo(
      el,
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" },
      cameFromTask ? 0 : 0.15
    )
      .fromTo(
        checkRef.current,
        { scale: 0, rotation: -45 },
        { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.6)" },
        "-=0.25"
      )
      .fromTo(
        rippleRef.current,
        { scale: 1, autoAlpha: 0.55 },
        { scale: 2.6, autoAlpha: 0, duration: 0.9, ease: "power2.out" },
        "-=0.3"
      )
      .to(el, { autoAlpha: 0, y: -4, duration: 0.35, ease: "power2.in" }, "+=2.4")
      .to(box, { ...COLLAPSED, duration: 0.45, ease: "power2.inOut" });
    return () => tl.kill();
  }, [completed?.key]);

  // Desvincular: o selo some e o espaco fecha antes de sair da arvore.
  const handleUnlink = () => {
    const box = boxRef.current;
    if (!box || reduceMotion()) {
      onUnlink();
      return;
    }
    hadTaskRef.current = false;
    gsap.to(chipRef.current, { autoAlpha: 0, scale: 0.96, duration: 0.2, ease: "power2.in" });
    closeBox(box, onUnlink);
  };

  if (task) {
    return (
      <div className="focus-task" ref={boxRef}>
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
            onClick={handleUnlink}
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
      <div className="focus-task" ref={boxRef}>
        <div className="focus-task__chip is-done" ref={doneRef} role="status" aria-live="polite">
          <span className="focus-task__check-wrap" aria-hidden="true">
            <span className="focus-task__ripple" ref={rippleRef} />
            <span className="focus-task__check" ref={checkRef}>
              <Check size={12} strokeWidth={3} />
            </span>
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
