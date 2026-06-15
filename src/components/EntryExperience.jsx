import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

const LOGO_PATHS = [
  "M34 61C34 52.4 34.9 46.3 36.9 41.8C40.4 34.2 46.3 31 53.3 31H111C110.1 39.7 105.4 45.9 97.6 48.3C97 48.5 96.1 48.6 95.1 48.6H50.8C43.8 48.6 37.5 53.2 34 61Z",
  "M34 82.6C34 72.8 36.5 64.3 42.8 58.3C46.2 55.1 50.3 54 55 54H82C80.8 62.3 75.1 68.9 66.4 71.1C65.3 71.4 64.3 71.5 63.1 71.5H47.2C41.1 71.5 36.4 76.1 34 82.6Z",
  "M34 108V92.4C34 84.8 40.9 77.7 49.2 76.2C50.1 76.1 50.8 76 52 76V91.5C52 99.6 44.9 106.5 36.7 107.8C35.8 107.9 34.9 108 34 108Z",
];

export default function EntryExperience({ children, onComplete }) {
  const svgRef = useRef(null);
  const curtainRef = useRef(null);
  const panelRef = useRef(null);
  const contentRef = useRef(null);
  const completedRef = useRef(false);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const curtain = curtainRef.current;
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!svg || !curtain || !panel || !content) return undefined;

    const paths = svg.querySelectorAll("path");
    const card = content.querySelector(".auth-card");
    const items = content.querySelectorAll(
      ".auth-card__header, .auth-card__tabs, .auth-field, .auth-remember, .auth-submit"
    );
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete?.();
    };

    if (reduce) {
      gsap.set([curtain, panel], { y: "0%" });
      gsap.set(content, { autoAlpha: 1 });
      complete();
      return undefined;
    }

    gsap.set([curtain, panel], { y: "100%" });
    gsap.set(content, { autoAlpha: 0 });
    if (card) {
      gsap.set(card, { autoAlpha: 0, y: 16 });
      gsap.set(items, { autoAlpha: 0, y: 10 });
    }
    gsap.set(paths, { fill: "transparent", strokeOpacity: 1 });

    paths.forEach((path) => {
      const len = path.getTotalLength();
      path.setAttribute("stroke-dasharray", len);
      path.setAttribute("stroke-dashoffset", len);
    });

    const tl = gsap.timeline();
    const fallback = setTimeout(() => {
      gsap.set([curtain, panel], { y: "0%" });
      gsap.set(content, { autoAlpha: 1 });
      complete();
    }, 3200);

    tl.to(paths, {
      attr: { "stroke-dashoffset": 0 },
      duration: 1.4,
      ease: "power2.inOut",
      stagger: 0.2,
    });

    tl.to(
      paths,
      {
        fill: "white",
        strokeOpacity: 0,
        duration: 0.4,
        ease: "power1.in",
        stagger: 0.08,
      },
      "-=0.2"
    );

    // cortina 1 (clara) varre por cima do logo pinado
    tl.to(curtain, {
      y: "0%",
      duration: 0.55,
      ease: "power3.inOut",
    });

    // cortina 2 (escura) engole a clara logo atras, com leve atraso
    tl.to(
      panel,
      {
        y: "0%",
        duration: 0.55,
        ease: "power3.inOut",
      },
      "-=0.4"
    );

    // transicao de tela: o fundo pontilhado surge macio sobre a cortina preta.
    // `entered` dispara no INICIO desse fade (onStart), nao no fim da timeline:
    // assim o Foco monta junto com a revelacao e o claquete entra em sincronia
    // com a cortina escura, sem ~0,55s de palco vazio.
    tl.to(
      content,
      {
        autoAlpha: 1,
        duration: 0.55,
        ease: "power2.out",
        onStart: complete,
      },
      "-=0.05"
    );

    // so depois que o ambiente assenta, o card se monta e os itens entram em cascata
    if (card) {
      tl.to(
        card,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
        },
        "-=0.1"
      );

      tl.to(
        items,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.35,
          ease: "power2.out",
          stagger: 0.07,
        },
        "-=0.2"
      );
    }

    return () => {
      clearTimeout(fallback);
      tl.kill();
    };
  }, []);

  return (
    <main className="entry" aria-label="Flux Time">
      <svg
        ref={svgRef}
        viewBox="34 31 77 77"
        className="entry__logo"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        {LOGO_PATHS.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="none"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div className="entry__curtain" ref={curtainRef} aria-hidden="true" />

      <div className="entry__panel" ref={panelRef}>
        <div className="entry__content" ref={contentRef}>
          {children}
        </div>
      </div>
    </main>
  );
}
