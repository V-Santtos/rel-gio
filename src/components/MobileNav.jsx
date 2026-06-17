import gsap from "gsap";

export default function MobileNav({ items, active, onChange, hidden = false }) {
  function handleTap(el) {
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(el, { scale: 0.88 }, { scale: 1, duration: 0.32, ease: "back.out(2.2)" });
  }

  return (
    <nav
      className={`mobile-nav${hidden ? " mobile-nav--hidden" : ""}`}
      aria-label="Modos"
    >
      <div className="mobile-nav__items">
        {items.map(({ id, label, Icon, center }) => {
          const isActive = active === id;

          if (center) {
            return (
              <button
                key={id}
                type="button"
                className={`mobile-nav__item--center${isActive ? " is-active" : ""}`}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  handleTap(e.currentTarget.querySelector(".mobile-nav__center-circle"));
                  onChange(id);
                }}
              >
                <span className="mobile-nav__center-circle" aria-hidden="true">
                  <Icon size={22} strokeWidth={2.2} />
                </span>
              </button>
            );
          }

          return (
            <button
              key={id}
              type="button"
              className={`mobile-nav__item${isActive ? " is-active" : ""}`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              onClick={(e) => {
                handleTap(e.currentTarget);
                onChange(id);
              }}
            >
              <span className="mobile-nav__icon" aria-hidden="true">
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span className="mobile-nav__label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
