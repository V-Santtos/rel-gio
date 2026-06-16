import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Bottom navigation flutuante (mobile) — estilo "pill + circulo elevado".
 * A barra e um pill arredondado destacado das bordas; o item ATIVO sobe num
 * circulo accent que flutua acima da barra e DESLIZA na horizontal entre os
 * itens via GSAP (mais um leve "pop" no icone). O icone do item ativo dentro
 * da barra some (ele e representado pelo circulo). Respeita reduced-motion.
 */
export default function MobileNav({ items, active, onChange }) {
  const liftRef = useRef(null);
  const btnRefs = useRef({});
  const first = useRef(true);

  const moveLift = (animate) => {
    const btn = btnRefs.current[active];
    const lift = liftRef.current;
    if (!btn || !lift) return;
    const x = btn.offsetLeft + btn.offsetWidth / 2 - lift.offsetWidth / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate && !reduce) {
      gsap.to(lift, { x, duration: 0.45, ease: "power3.out" });
      gsap.fromTo(
        lift.firstChild,
        { scale: 0.5, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.32, ease: "back.out(2.2)" }
      );
    } else {
      gsap.set(lift, { x });
      gsap.set(lift.firstChild, { scale: 1, autoAlpha: 1 });
    }
  };

  useLayoutEffect(() => {
    moveLift(!first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const onResize = () => moveLift(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ActiveIcon = items.find((item) => item.id === active)?.Icon;

  return (
    <nav className="mobile-nav" aria-label="Modos">
      <div className="mobile-nav__items">
        <span className="mobile-nav__lift" ref={liftRef} aria-hidden="true">
          <span className="mobile-nav__lift-icon">
            {ActiveIcon ? <ActiveIcon size={22} strokeWidth={2.4} /> : null}
          </span>
        </span>
        {items.map(({ id, label, Icon, disabled }) => (
          <button
            key={id}
            type="button"
            ref={(el) => (btnRefs.current[id] = el)}
            className={`mobile-nav__item${active === id ? " is-active" : ""}${
              disabled ? " is-disabled" : ""
            }`}
            aria-label={label}
            aria-current={active === id ? "page" : undefined}
            disabled={disabled}
            onClick={() => !disabled && onChange(id)}
          >
            <span className="mobile-nav__icon" aria-hidden="true">
              <Icon size={22} strokeWidth={2.2} />
            </span>
            <span className="mobile-nav__label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
