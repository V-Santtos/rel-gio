import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import Logo from "./Logo.jsx";

/**
 * Dock vertical "glass" no canto superior esquerdo. So icones (sem rotulos, sem
 * expansao): cada icone troca o modo. No topo, a marca isolada/encapsulada (a
 * ampulheta por enquanto, futuramente a letra da logo). O item ativo e destacado
 * por um circulo solido (neutro) que DESLIZA na vertical via GSAP (offsetTop).
 */
export default function Sidebar({ items, active, onChange }) {
  const indicatorRef = useRef(null);
  const btnRefs = useRef({});
  const first = useRef(true);

  const moveIndicator = (animate) => {
    const btn = btnRefs.current[active];
    const ind = indicatorRef.current;
    if (!btn || !ind) return;
    const y = btn.offsetTop;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate && !reduce) {
      gsap.to(ind, { y, duration: 0.42, ease: "power3.out" });
    } else {
      gsap.set(ind, { y });
    }
  };

  useLayoutEffect(() => {
    moveIndicator(!first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const onResize = () => moveIndicator(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className="dock" aria-label="Modos">
      <span className="dock__brand" aria-hidden="true">
        <Logo size={22} />
      </span>
      <span className="dock__divider" aria-hidden="true" />

      <div className="dock__items">
        <span className="dock__indicator" ref={indicatorRef} aria-hidden="true" />
        {items.map(({ id, label, Icon, disabled }) => (
          <button
            key={id}
            type="button"
            ref={(el) => (btnRefs.current[id] = el)}
            className={`dock__item${active === id ? " is-active" : ""}${
              disabled ? " is-disabled" : ""
            }`}
            aria-label={label}
            aria-current={active === id ? "page" : undefined}
            title={label}
            disabled={disabled}
            onClick={() => !disabled && onChange(id)}
          >
            <Icon size={22} strokeWidth={2.2} />
          </button>
        ))}
      </div>
    </aside>
  );
}
