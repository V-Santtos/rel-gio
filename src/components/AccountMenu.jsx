import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { LogOut, Menu, Moon, Settings, Sun, UserRound, X } from "lucide-react";

const THEME_KEY = "rel-gio:theme";

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignora */
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function AccountMenu({ session, onLogout }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const email = session?.user?.email || "Sessao local";
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage indisponivel: tema segue em memoria. */
    }
  }, [theme]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.fromTo(
      menuRef.current,
      { autoAlpha: 0, y: -8, scale: 0.96 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: reduce ? 0 : 0.2,
        ease: "power2.out",
      }
    );
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onDown = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="account-menu">
      <button
        type="button"
        ref={buttonRef}
        className={`account-menu__trigger${open ? " is-open" : ""}`}
        aria-label={open ? "Fechar menu da conta" : "Abrir menu da conta"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X size={20} strokeWidth={2.5} />
        ) : (
          <>
            <Menu
              size={20}
              strokeWidth={2.35}
              className="account-menu__glyph account-menu__glyph--mobile"
            />
            <Settings
              size={20}
              strokeWidth={2.35}
              className="account-menu__glyph account-menu__glyph--desktop"
            />
          </>
        )}
      </button>

      {open ? (
        <div className="account-menu__panel" ref={menuRef} role="dialog" aria-label="Conta">
          <div className="account-menu__item account-menu__identity">
            <span className="account-menu__icon" aria-hidden="true">
              <UserRound size={16} strokeWidth={2.35} />
            </span>
            <span className="account-menu__text">
              <strong>Conta</strong>
              <span>{email}</span>
            </span>
          </div>

          <button
            type="button"
            className="account-menu__item"
            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
          >
            <span className="account-menu__icon" aria-hidden="true">
              {isDark ? <Moon size={16} strokeWidth={2.35} /> : <Sun size={16} strokeWidth={2.35} />}
            </span>
            <span className="account-menu__text">
              <strong>Tema</strong>
              <span>{isDark ? "Escuro" : "Claro"}</span>
            </span>
          </button>

          {onLogout ? (
            <button type="button" className="account-menu__item" onClick={onLogout}>
              <span className="account-menu__icon" aria-hidden="true">
                <LogOut size={16} strokeWidth={2.35} />
              </span>
              <span className="account-menu__text">
                <strong>Sair</strong>
                <span>Encerrar sessao</span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
