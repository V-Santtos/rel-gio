import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatRemaining(total) {
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Pilula de ciclo em segundo plano.
 *
 * Aparece quando o Pomodoro esta rodando e o usuario NAO esta na secao Foco --
 * dentro do Foco o proprio relogio ja e o feedback. Clicar volta pro Foco.
 *
 * Renderizada FORA do `.app` (irma do MobileNav): `position: fixed` dentro do
 * container sofria com os recalculos de layout no launch do PWA iOS.
 */
export default function CyclePill({
  mode,
  remaining,
  duration,
  cycle,
  cycles,
  onClick,
}) {
  const ref = useRef(null);
  const isFocus = mode === "focus";
  const phase = isFocus ? "Foco" : "Pausa";
  const time = formatRemaining(remaining);
  // Progresso da fase atual (0 -> 1). `duration` vem do useTimer ja derivado do
  // plano de ciclos, entao nao ha estado duplicado aqui.
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, 1 - remaining / duration)) : 0;

  // Entrada deslizando da esquerda. So no mount: a cada segundo o texto troca,
  // mas nada re-anima.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      el,
      { x: -18, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.45,
        ease: "power2.out",
        clearProps: "x,opacity",
      }
    );
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className={`cycle-pill cycle-pill--${isFocus ? "focus" : "break"}`}
      onClick={onClick}
      // Sem aria-live: uma regiao viva atualizando a cada segundo viraria ruido
      // em leitor de tela. O rotulo tambem nao carrega os segundos, pra nao
      // ficar sendo reanunciado enquanto o botao esta focado.
      aria-label={`Ciclo ${cycle} de ${cycles}, ${phase}. Voltar para o Foco.`}
    >
      <span className="cycle-pill__dot" aria-hidden="true" />
      <span className="cycle-pill__phase">{phase}</span>
      <span className="cycle-pill__time">{time}</span>
      <span className="cycle-pill__cycle">{`Ciclo ${cycle}/${cycles}`}</span>
      <span className="cycle-pill__track" aria-hidden="true">
        <span
          className="cycle-pill__fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </span>
    </button>
  );
}
