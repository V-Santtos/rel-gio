import { useCallback, useEffect, useState } from "react";

/**
 * Nucleo do timer Pomodoro com SESSAO de ciclos (Etapa 2).
 *
 * Recebe um `plan`: array com a duracao (em segundos) de cada ciclo:
 *   [{ focus, break }, ...]   (indice 0 = Ciclo 1)
 *
 * - mode: "focus" | "break"; cycle: ciclo atual (1..plan.length)
 * - Sessao = roda cada ciclo [Foco -> Break], encadeando automaticamente.
 *   O Break do ULTIMO ciclo e PULADO (termina no fim do ultimo Foco).
 *   Excecao: com 1 ciclo, mantem Foco -> Break (rodada unica classica).
 * - Reiniciar (reset) volta a sessao inteira para o Foco do ciclo 1.
 */
export function useTimer({ plan, onPhaseEnd, onSessionEnd }) {
  const totalCycles = Math.max(1, plan.length);

  const durationFor = useCallback(
    (m, idx) => {
      const c = plan[Math.min(Math.max(idx, 0), plan.length - 1)] || {
        focus: 1,
        break: 1,
      };
      return Math.max(1, m === "focus" ? c.focus : c.break);
    },
    [plan]
  );

  const [mode, setMode] = useState("focus");
  const [cycle, setCycle] = useState(1); // 1-based
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(() => durationFor("focus", 0));

  const endSession = useCallback(() => {
    onSessionEnd?.();
    setRunning(false);
    setMode("focus");
    setCycle(1);
    setRemaining(durationFor("focus", 0));
  }, [durationFor, onSessionEnd]);

  // Mantem o tempo restante alinhado com a config enquanto nao esta rodando;
  // clampa o ciclo se a quantidade total diminuir.
  useEffect(() => {
    if (running) return;
    const safeCycle = cycle > totalCycles ? 1 : cycle;
    if (safeCycle !== cycle) setCycle(safeCycle);
    setRemaining(durationFor(mode, safeCycle - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, mode, cycle, totalCycles]);

  // Tick de 1s.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Fim de um bloco (remaining chegou a 0 rodando) -> proxima fase da sessao.
  useEffect(() => {
    if (!running || remaining !== 0) return;

    if (mode === "focus") {
      // Faz o Break, exceto no ultimo ciclo de uma sessao multi-ciclo.
      const needBreak = cycle < totalCycles || totalCycles === 1;
      onPhaseEnd?.(mode, {
        cycle,
        cycles: totalCycles,
        nextMode: needBreak ? "break" : "focus",
        nextCycle: cycle,
        willContinue: needBreak,
      });
      if (needBreak) {
        setMode("break");
        setRemaining(durationFor("break", cycle - 1));
        return; // encadeia rodando
      }
      endSession();
      return;
    }

    // mode === "break": vai para o Foco do proximo ciclo (se houver).
    if (cycle < totalCycles) {
      const next = cycle + 1;
      onPhaseEnd?.(mode, {
        cycle,
        cycles: totalCycles,
        nextMode: "focus",
        nextCycle: next,
        willContinue: true,
      });
      setCycle(next);
      setMode("focus");
      setRemaining(durationFor("focus", next - 1));
      return; // encadeia rodando
    }
    onPhaseEnd?.(mode, {
      cycle,
      cycles: totalCycles,
      nextMode: "focus",
      nextCycle: 1,
      willContinue: false,
    });
    endSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  // Reiniciar sempre volta para o Foco do ciclo 1 e zera a sessao.
  const reset = useCallback(() => {
    setRunning(false);
    setMode("focus");
    setCycle(1);
    setRemaining(durationFor("focus", 0));
  }, [durationFor]);
  const switchMode = useCallback(
    (m) => {
      setRunning(false);
      setMode(m);
      setRemaining(durationFor(m, cycle - 1));
    },
    [durationFor, cycle]
  );

  return {
    mode,
    cycle,
    cycles: totalCycles,
    running,
    remaining,
    start,
    pause,
    reset,
    switchMode,
  };
}
