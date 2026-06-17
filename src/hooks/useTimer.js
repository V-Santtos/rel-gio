import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "fluxtime.timer";

function restoreTimerState(plan) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);

    const planKey = plan.map((c) => `${c.focus}:${c.break}`).join(",");
    if (s.planKey !== planKey) return null;

    const safeMode = s.mode === "break" ? "break" : "focus";
    const safeCycle = Math.min(
      Math.max(parseInt(s.cycle, 10) || 1, 1),
      plan.length
    );

    if (s.running && typeof s.anchorTime === "number") {
      const elapsed = Math.floor((Date.now() - s.anchorTime) / 1000);
      const rem = (s.anchorRemaining || 0) - elapsed;
      if (rem <= 0) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return { mode: safeMode, cycle: safeCycle, remaining: rem };
    }

    const rem = parseInt(s.remaining, 10);
    if (!rem || rem <= 0) return null;
    return { mode: safeMode, cycle: safeCycle, remaining: rem };
  } catch {
    return null;
  }
}

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
 * - Tick usa Date.now() como ancora: imune a throttling de background.
 * - Estado persiste em localStorage; restaura na proxima abertura.
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

  // Restaura estado persistido uma unica vez no mount
  const initRef = useRef(null);
  if (initRef.current === null) {
    initRef.current = restoreTimerState(plan) ?? {
      mode: "focus",
      cycle: 1,
      remaining: Math.max(1, plan[0]?.focus ?? 1),
    };
  }

  const [mode, setMode] = useState(initRef.current.mode);
  const [cycle, setCycle] = useState(initRef.current.cycle);
  const [running, setRunning] = useState(false); // sempre inicia pausado
  const [remaining, setRemaining] = useState(initRef.current.remaining);

  // Ancora: { time, rem } — base para calcular tempo real decorrido
  const anchorRef = useRef({ time: 0, rem: 0 });

  const resetAnchor = (rem) => {
    anchorRef.current = { time: Date.now(), rem };
  };

  const endSession = useCallback(() => {
    onSessionEnd?.();
    setRunning(false);
    setMode("focus");
    setCycle(1);
    setRemaining(durationFor("focus", 0));
  }, [durationFor, onSessionEnd]);

  // Sincroniza remaining com o plano quando pausado.
  // Ignora o mount para preservar o estado restaurado do localStorage.
  const skipInitialSync = useRef(true);
  useEffect(() => {
    if (skipInitialSync.current) {
      skipInitialSync.current = false;
      return;
    }
    if (running) return;
    const safeCycle = cycle > totalCycles ? 1 : cycle;
    if (safeCycle !== cycle) setCycle(safeCycle);
    setRemaining(durationFor(mode, safeCycle - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, mode, cycle, totalCycles]);

  // Tick: ancora em Date.now() — imune ao throttling do browser em background
  useEffect(() => {
    if (!running) return undefined;

    resetAnchor(remaining);

    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - anchorRef.current.time) / 1000);
      const computed = anchorRef.current.rem - elapsed;
      setRemaining(computed <= 0 ? 0 : computed);
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Page Visibility: sincroniza imediatamente ao retornar a aba
  useEffect(() => {
    if (!running) return;

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const elapsed = Math.floor((Date.now() - anchorRef.current.time) / 1000);
      const computed = anchorRef.current.rem - elapsed;
      setRemaining(Math.max(0, computed));
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [running]);

  // Fim de um bloco (remaining chegou a 0 rodando) -> proxima fase da sessao.
  useEffect(() => {
    if (!running || remaining !== 0) return;

    if (mode === "focus") {
      const needBreak = cycle < totalCycles || totalCycles === 1;
      onPhaseEnd?.(mode, {
        cycle,
        cycles: totalCycles,
        nextMode: needBreak ? "break" : "focus",
        nextCycle: cycle,
        willContinue: needBreak,
      });
      if (needBreak) {
        const newRem = durationFor("break", cycle - 1);
        resetAnchor(newRem);
        setMode("break");
        setRemaining(newRem);
        return;
      }
      endSession();
      return;
    }

    if (cycle < totalCycles) {
      const next = cycle + 1;
      onPhaseEnd?.(mode, {
        cycle,
        cycles: totalCycles,
        nextMode: "focus",
        nextCycle: next,
        willContinue: true,
      });
      const newRem = durationFor("focus", next - 1);
      resetAnchor(newRem);
      setCycle(next);
      setMode("focus");
      setRemaining(newRem);
      return;
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

  // Persiste estado pausado (remaining exato)
  useEffect(() => {
    if (running) return;
    const planKey = plan.map((c) => `${c.focus}:${c.break}`).join(",");
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, cycle, running: false, remaining, planKey })
    );
  }, [running, mode, cycle, remaining, plan]);

  // Persiste ancora quando rodando (dispara no start e em transicoes de fase)
  // Deve ser definido APOS o tick effect e o phase-end effect para ler a
  // ancora ja atualizada por resetAnchor().
  useEffect(() => {
    if (!running) return;
    const planKey = plan.map((c) => `${c.focus}:${c.break}`).join(",");
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode,
        cycle,
        running: true,
        planKey,
        anchorTime: anchorRef.current.time,
        anchorRemaining: anchorRef.current.rem,
      })
    );
  }, [running, mode, cycle, plan]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setMode("focus");
    setCycle(1);
    setRemaining(durationFor("focus", 0));
    localStorage.removeItem(STORAGE_KEY);
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
