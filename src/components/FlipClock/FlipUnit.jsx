import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Uma unidade de duas casas (ex: "25") no estilo flip clock / split-flap.
 *
 * Durante a troca:
 * - static-top mostra o valor NOVO (revelado quando a aba de cima dobra).
 * - static-bottom mostra o valor ANTIGO (coberto quando a aba de baixo dobra).
 * - flip-top (aba de cima) mostra o ANTIGO e gira 0 -> -90.
 * - flip-bottom (aba de baixo) mostra o NOVO e gira 90 -> 0.
 */
export default function FlipUnit({ value, badge, action }) {
  const [current, setCurrent] = useState(value);
  const flipTopRef = useRef(null);
  const flipBottomRef = useRef(null);

  useLayoutEffect(() => {
    if (value === current) return undefined;

    const flipTop = flipTopRef.current;
    const flipBottom = flipBottomRef.current;

    gsap.set(flipTop, { rotateX: 0, force3D: true });
    gsap.set(flipBottom, { rotateX: 90, force3D: true });

    const tl = gsap.timeline({
      defaults: { force3D: true },
      onComplete: () => setCurrent(value),
    });
    tl.to(flipTop, { rotateX: -90, duration: 0.28, ease: "power1.in" }).to(
      flipBottom,
      { rotateX: 0, duration: 0.28, ease: "power2.out" },
      ">-0.02"
    );

    return () => tl.kill();
  }, [value, current]);

  return (
    <div className="flip-unit">
      {badge && <span className="flip-unit__badge">{badge}</span>}
      {action}
      <div className="card card--static-top">
        <span>{value}</span>
      </div>
      <div className="card card--static-bottom">
        <span>{current}</span>
      </div>
      <div className="card card--flip-top" ref={flipTopRef}>
        <span>{current}</span>
      </div>
      <div className="card card--flip-bottom" ref={flipBottomRef}>
        <span>{value}</span>
      </div>
    </div>
  );
}
