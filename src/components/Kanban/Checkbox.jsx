import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Checkbox circular no padrao do projeto (CSS puro + GSAP). Recriacao do
 * checkbox do berlix (21st.dev) com a estetica do Trello: circulo limpo no
 * estado neutro, preenche no accent e o "tick" se DESENHA via strokeDashoffset
 * ao marcar. O autoAlpha garante que o estado neutro fique 100% vazio (sem o
 * "ponto" residual que o strokeLinecap deixava).
 */
export default function Checkbox({ checked, onChange, size = 18, label }) {
  const tickRef = useRef(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const path = tickRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = String(len);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (first.current) {
      first.current = false;
      gsap.set(path, {
        strokeDashoffset: checked ? 0 : len,
        autoAlpha: checked ? 1 : 0,
      });
      return;
    }

    if (checked) {
      gsap.set(path, { autoAlpha: 1 });
      gsap.fromTo(
        path,
        { strokeDashoffset: len },
        { strokeDashoffset: 0, duration: reduce ? 0 : 0.3, ease: "power2.out" }
      );
    } else {
      gsap.to(path, {
        strokeDashoffset: len,
        autoAlpha: 0,
        duration: reduce ? 0 : 0.18,
        ease: "power2.in",
      });
    }
  }, [checked]);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`kcheck${checked ? " is-checked" : ""}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path
          ref={tickRef}
          className="kcheck__tick"
          d="M6 12.5 L10.5 17 L18 7.5"
          fill="none"
        />
      </svg>
    </button>
  );
}
