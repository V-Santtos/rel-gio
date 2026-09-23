import { useLayoutEffect, useRef } from "react";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

// "Mod-Alt-1" -> "Ctrl+Alt+1" (ou "⌘⌥1" no Mac).
export function formatShortcut(keys) {
  if (!keys) return "";
  const parts = keys.split("-");
  if (IS_MAC) {
    const map = { Mod: "⌘", Alt: "⌥", Shift: "⇧" };
    return parts.map((p) => map[p] || p.toUpperCase()).join("");
  }
  const map = { Mod: "Ctrl", Alt: "Alt", Shift: "Shift" };
  return parts.map((p) => map[p] || p.toUpperCase()).join("+");
}

/**
 * Lista de menu padrao do app (dropdowns). Setas/Home/End navegam, Escape fecha
 * so o menu. Ao abrir, o foco vai para o item ativo (ou o primeiro).
 */
export function MenuList({ label, onClose, children, className = "" }) {
  const ref = useRef(null);

  const items = () =>
    Array.from(ref.current?.querySelectorAll('[role^="menuitem"]:not([disabled])') || []);

  useLayoutEffect(() => {
    const list = items();
    const current = list.find((el) => el.getAttribute("aria-checked") === "true") || list[0];
    current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    const move = (next) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`mlist ${className}`}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

// Item simples (rotulo + atalho) ou rico (icone em caixa + titulo + descricao).
export function MenuItem({
  icon,
  label,
  description,
  shortcut,
  checked,
  labelClassName = "",
  onSelect,
}) {
  const rich = Boolean(description);
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked === undefined ? undefined : checked}
      className={`mlist__item${rich ? " mlist__item--rich" : ""}${checked ? " is-active" : ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      {icon ? (
        <span className={rich ? "mlist__icon" : "mlist__glyph"} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {rich ? (
        <span className="mlist__text">
          <span className="mlist__title">{label}</span>
          <span className="mlist__desc">{description}</span>
        </span>
      ) : (
        <span className={`mlist__label ${labelClassName}`}>{label}</span>
      )}
      {shortcut ? <kbd className="mlist__kbd">{formatShortcut(shortcut)}</kbd> : null}
    </button>
  );
}
