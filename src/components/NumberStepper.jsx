import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Campo numerico com setas customizadas (substitui o spinner feio do <input>).
 * - Aceita digitar e tambem clicar nas setas.
 * - Da um "pop" sutil (GSAP) ao mudar o valor.
 */
export default function NumberStepper({ label, value, min, max, onChange }) {
  const valueRef = useRef(null);
  const first = useRef(true);

  const commit = (n) => {
    if (Number.isNaN(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    onChange(n);
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = valueRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      el,
      { scale: 1.16 },
      { scale: 1, duration: 0.22, ease: "power2.out" }
    );
  }, [value]);

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={() => commit(value + 1)}
        aria-label={`Aumentar ${label}`}
      >
        <ChevronUp size={18} strokeWidth={2.4} />
      </button>

      <input
        ref={valueRef}
        className="stepper__value"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => commit(parseInt(e.target.value, 10))}
        aria-label={label}
      />

      <button
        type="button"
        className="stepper__btn"
        onClick={() => commit(value - 1)}
        aria-label={`Diminuir ${label}`}
      >
        <ChevronDown size={18} strokeWidth={2.4} />
      </button>

      <span className="stepper__label">{label}</span>
    </div>
  );
}
