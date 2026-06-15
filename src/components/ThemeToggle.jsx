import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Sun, Moon } from "lucide-react";

const KEY = "rel-gio:theme";
const TRAVEL = 36; // px que o thumb desliza (track 72 - padding 8 - thumb 28)

function initialTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme);
  const thumbRef = useRef(null);
  const mounted = useRef(false);

  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Desliza o thumb com GSAP. Na primeira render (ou reduced-motion) so posiciona.
  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    const x = isDark ? TRAVEL : 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!mounted.current || reduce) {
      gsap.set(thumb, { x });
      mounted.current = true;
    } else {
      gsap.to(thumb, { x, duration: 0.28, ease: "power2.out" });
    }
  }, [isDark]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      className="theme-switch"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      <span className="theme-switch__track">
        <span className="theme-switch__thumb" ref={thumbRef}>
          {isDark ? (
            <Moon size={16} strokeWidth={2.5} />
          ) : (
            <Sun size={16} strokeWidth={2.5} />
          )}
        </span>
      </span>
    </button>
  );
}
