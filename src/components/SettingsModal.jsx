import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { X } from "lucide-react";
import NumberStepper from "./NumberStepper.jsx";
import { MAX_CYCLES, clampCycles, fitCycleTimes } from "../lib/cycles.js";

/**
 * Modal central "Montar sessão de foco": define a quantidade de ciclos
 * (1..MAX_CYCLES) e o Foco/Break de CADA ciclo. O Ciclo 1 e o mesmo dos
 * steppers da tela (mesma fonte de dados). Mostra um resumo ao vivo
 * (foco/pausa/total) que respeita a regra de pausa pulada no ultimo ciclo.
 * Segue as Web Interface Guidelines: Escape, foco preso, inert no fundo,
 * retorno de foco, overscroll e prefers-reduced-motion.
 */
export default function SettingsModal({ config, setConfig, onClose }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  const closingRef = useRef(false);
  const cycleRefs = useRef([]);
  const prevCountRef = useRef(config.cycleTimes.length);

  const cycleTimes = config.cycleTimes;

  const totalCount = cycleTimes.length;

  const setCount = (n) => {
    const count = clampCycles(n);
    setConfig((c) => ({
      ...c,
      cycles: count,
      cycleTimes: fitCycleTimes(c.cycleTimes, count),
    }));
  };

  // S1 — ao MUDAR a quantidade de ciclos: aumentar deixa o(s) bloco(s) novo(s)
  // entrarem animados (a entrada propria roda no useLayoutEffect abaixo);
  // diminuir recolhe os blocos que vao sair (altura + fade) ANTES de remover
  // do estado, em vez de sumirem secos.
  const applyCount = (n) => {
    const count = clampCycles(n);
    if (count >= totalCount || reduce()) {
      setCount(count);
      return;
    }
    const leaving = cycleRefs.current.slice(count, totalCount).filter(Boolean);
    if (!leaving.length) {
      setCount(count);
      return;
    }
    gsap.set(leaving, { overflow: "hidden" });
    gsap.to(leaving, {
      height: 0,
      opacity: 0,
      marginTop: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.32,
      ease: "power2.in",
      stagger: 0.05,
      onComplete: () => setCount(count),
    });
  };

  const patchCycle = (index, patch) => {
    setConfig((c) => ({
      ...c,
      cycleTimes: c.cycleTimes.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const reduce = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Entrada (GSAP) + foco inicial no painel.
  useLayoutEffect(() => {
    const r = reduce();
    gsap.set(backdropRef.current, { opacity: 0 });
    gsap.set(panelRef.current, { opacity: 0, y: 16, scale: 0.97 });
    gsap.to(backdropRef.current, { opacity: 1, duration: r ? 0 : 0.25, ease: "power2.out" });
    gsap.to(panelRef.current, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: r ? 0 : 0.34,
      ease: "power3.out",
    });
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // S1 — entrada do(s) bloco(s) recem-adicionado(s): cresce de altura + fade.
  // So roda quando a quantidade AUMENTA; ignora o primeiro render e reducoes.
  useLayoutEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = totalCount;
    if (totalCount <= prev || reduce()) return;
    const incoming = cycleRefs.current.slice(prev, totalCount).filter(Boolean);
    if (!incoming.length) return;
    gsap.set(incoming, { overflow: "hidden" });
    gsap.from(incoming, {
      height: 0,
      opacity: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.42,
      ease: "power3.out",
      stagger: 0.08,
      onComplete: () => gsap.set(incoming, { clearProps: "all" }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount]);

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
    gsap.killTweensOf([backdropRef.current, panelRef.current]);
    gsap.to(panelRef.current, {
      opacity: 0,
      y: 12,
      scale: 0.97,
      duration: r ? 0 : 0.2,
      ease: "power2.in",
    });
    gsap.to(backdropRef.current, {
      opacity: 0,
      duration: r ? 0 : 0.22,
      ease: "power2.in",
      onComplete: onClose,
    });
  };

  // Escape fecha; Tab fica preso dentro do painel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        close();
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
  }, []);

  return createPortal(
    <div
      className="sessmodal"
      role="dialog"
      aria-modal="true"
      aria-label="Configurar sessão de foco"
    >
      <div className="sessmodal__backdrop" ref={backdropRef} onClick={close} />

      <div className="sessmodal__panel" ref={panelRef} tabIndex={-1}>
        <div className="sessmodal__top">
          <h2 className="sessmodal__title">Configurar sessão de foco</h2>
          <button
            type="button"
            className="sessmodal__close"
            onClick={close}
            aria-label="Fechar"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="sessmodal__count">
          <div className="sessmodal__count-text">
            <div className="sessmodal__summary" aria-live="polite">
              <span className="sessmodal__count-label">Quantos ciclos?</span>
              <span className="sessmodal__count-hint">
                Cada ciclo é um bloco de foco seguido de uma pausa.
                <br />
                Você pode configurar até {MAX_CYCLES} ciclos diretos de
                estudo/trabalho.
              </span>
            </div>
          </div>
          <NumberStepper
            label="Ciclos"
            value={config.cycles}
            min={1}
            max={MAX_CYCLES}
            onChange={applyCount}
          />
        </div>

        <div className="sessmodal__cycles">
          {cycleTimes.map((c, i) => (
            <div
              className="sessmodal__cycle"
              key={i}
              ref={(el) => {
                cycleRefs.current[i] = el;
              }}
            >
              <div className="sessmodal__cycle-head">
                <span className="sessmodal__cycle-name">Ciclo {i + 1}</span>
              </div>
              <div className="sessmodal__cycle-body">
                <div className="sessmodal__group">
                  <span className="sessmodal__group-title">Foco</span>
                  <div className="stepper-row">
                    <NumberStepper
                      label="Horas"
                      value={c.focusHours}
                      min={0}
                      max={23}
                      onChange={(v) => patchCycle(i, { focusHours: v })}
                    />
                    <NumberStepper
                      label="Min"
                      value={c.focusMinutes}
                      min={0}
                      max={59}
                      onChange={(v) => patchCycle(i, { focusMinutes: v })}
                    />
                    <NumberStepper
                      label="Seg"
                      value={c.focusSeconds}
                      min={0}
                      max={59}
                      onChange={(v) => patchCycle(i, { focusSeconds: v })}
                    />
                  </div>
                </div>

                <div className="sessmodal__group-divider" aria-hidden="true" />

                <div className="sessmodal__group">
                  <span className="sessmodal__group-title">Break</span>
                  <div className="stepper-row">
                    <NumberStepper
                      label="Min"
                      value={c.breakMinutes}
                      min={0}
                      max={59}
                      onChange={(v) => patchCycle(i, { breakMinutes: v })}
                    />
                    <NumberStepper
                      label="Seg"
                      value={c.breakSeconds}
                      min={0}
                      max={59}
                      onChange={(v) => patchCycle(i, { breakSeconds: v })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
