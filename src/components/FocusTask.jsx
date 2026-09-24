import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { Check, Target, X } from "lucide-react";

gsap.registerPlugin(Flip);

/**
 * Selo da tarefa vinculada ao ciclo (Modo Semana), acima dos controles do
 * Foco. O vinculo nasce no botao "Focar" do cartao (aba Tarefas).
 *  - Vinculada: "◎ TAREFA | <cartao> ×", borda levemente terracota com um
 *    brilho difuso que pulsa bem fraco.
 *  - Sessao terminou: a tarefa e concluida sozinha e o mesmo lugar mostra
 *    "✓ Tarefa concluída | <cartao>" (so texto, sem pilula), depois some.
 *
 * Performance (evita a animacao "travada"):
 *  - O pulso anima so a OPACIDADE de uma camada de brilho fixa (compositor),
 *    nunca o box-shadow (que repinta a cada frame).
 *  - Abrir/fechar o espaco do selo NAO anima altura (reflow do Foco inteiro,
 *    com o flip clock 3D, a cada frame): o layout muda de uma vez e o GSAP
 *    Flip desliza os vizinhos so com transform.
 *  - O .content usa `gap`: um item de altura 0 ainda soma um gap. Fechado,
 *    o selo compensa com margem negativa = gap, entao sair da arvore depois
 *    nao da o "pulinho" final.
 * Animacoes em GSAP via useLayoutEffect, respeitando prefers-reduced-motion.
 */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const collapsedFor = (box) => {
  const gap = parseFloat(getComputedStyle(box.parentElement).rowGap) || 0;
  return { height: 0, marginTop: -gap, marginBottom: 0, overflow: "hidden" };
};
const OPEN_PROPS = "height,marginTop,marginBottom,overflow";

// Muda o layout do selo de uma vez e desliza os vizinhos via Flip (transform).
function slideLayout(box, change, vars = {}) {
  const siblings = [...box.parentElement.children].filter(
    (n) => n !== box && getComputedStyle(n).position !== "fixed"
  );
  const state = Flip.getState(siblings);
  change();
  return Flip.from(state, { duration: 0.5, ease: "power2.inOut", force3D: true, ...vars });
}

export function FocusTaskBar({ task, completed, onUnlink, onCompletedShown }) {
  const boxRef = useRef(null);
  const chipRef = useRef(null);
  const glowRef = useRef(null);
  const doneRef = useRef(null);
  const checkRef = useRef(null);
  const rippleRef = useRef(null);
  const shownRef = useRef(onCompletedShown);
  shownRef.current = onCompletedShown;
  // O selo "concluida" reaproveita o espaco do selo vinculado quando vem
  // direto dele; so abre o espaco do zero se nada estava na tela.
  const hadTaskRef = useRef(false);

  // Entrada + pulso leve (opacidade da camada de brilho) com tarefa vinculada.
  useLayoutEffect(() => {
    const el = chipRef.current;
    if (!task || !el) return undefined;
    hadTaskRef.current = true;
    if (reduceMotion()) return undefined;
    const intro = gsap.fromTo(
      el,
      { autoAlpha: 0, y: 8, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out", clearProps: "transform" }
    );
    const pulse = gsap.fromTo(
      glowRef.current,
      { opacity: 0.25 },
      { opacity: 1, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 0.45 }
    );
    return () => {
      intro.kill();
      pulse.kill();
      gsap.set(el, { clearProps: "opacity,visibility,transform" });
    };
  }, [task?.id]);

  // Feedback de conclusao: espera o Foco sair da tela cheia, o texto entra, o
  // check "estala" com uma onda, segura, sai, e o espaco fecha deslizando.
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
    let slide = null;
    if (!cameFromTask) {
      // Nada estava na tela: abre o espaco deslizando (medido fechado -> aberto).
      gsap.set(box, collapsedFor(box));
      slide = slideLayout(box, () => gsap.set(box, { clearProps: OPEN_PROPS }));
    }
    gsap.set(el, { autoAlpha: 0 });
    const tl = gsap.timeline({ delay: 0.35 });
    tl.fromTo(el, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" })
      .fromTo(
        checkRef.current,
        { scale: 0, rotation: -45 },
        { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.6)", force3D: true },
        "-=0.25"
      )
      .fromTo(
        rippleRef.current,
        { scale: 1, autoAlpha: 0.55 },
        { scale: 2.6, autoAlpha: 0, duration: 0.9, ease: "power2.out", force3D: true },
        "-=0.3"
      )
      .to(el, { autoAlpha: 0, y: -4, duration: 0.35, ease: "power2.in" }, "+=2.4")
      .add(() => {
        slide = slideLayout(box, () => gsap.set(box, collapsedFor(box)), { onComplete: finish });
      });
    return () => {
      tl.kill();
      slide?.kill();
    };
  }, [completed?.key]);

  // Desvincular: o selo some e o espaco fecha deslizando antes de sair.
  const handleUnlink = () => {
    const box = boxRef.current;
    if (!box || reduceMotion()) {
      onUnlink();
      return;
    }
    hadTaskRef.current = false;
    gsap.to(chipRef.current, {
      autoAlpha: 0,
      scale: 0.96,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => slideLayout(box, () => gsap.set(box, collapsedFor(box)), { onComplete: onUnlink }),
    });
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
          <span className="focus-task__glow" ref={glowRef} aria-hidden="true" />
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
