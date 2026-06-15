import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Nucleo do cronometro (contagem CRESCENTE, com centesimos).
 *
 * - elapsed em ms; o display deriva H/M/S e centesimos a partir dele.
 * - usa Date.now() como base para nao acumular drift.
 * - atualiza por frame via gsap.ticker (centesimos fluidos).
 * - start / pause / reset.
 */
export function useStopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const baseRef = useRef(0);

  useEffect(() => {
    if (!running) return undefined;
    baseRef.current = Date.now() - elapsed;
    const update = () => setElapsed(Date.now() - baseRef.current);
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
    // elapsed e lido so na entrada (ao iniciar/retomar); nao deve recriar o tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setElapsed(0);
  }, []);

  return { elapsed, running, start, pause, reset };
}
