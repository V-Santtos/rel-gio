import { Maximize, Minimize } from "lucide-react";
import FlipUnit from "./FlipUnit.jsx";
import "./FlipClock.css";

function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * Display do timer. Adaptativo:
 * - showHours = true  -> HH MM SS (3 cartoes)
 * - showHours = false -> MM SS    (2 cartoes)
 */
export default function FlipClock({ totalSeconds, showHours, onExpand, expanded, rootRef }) {
  const safe = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const units = showHours
    ? [
        { value: String(hours), label: "Horas" },
        { value: pad(minutes), label: "Minutos" },
        { value: pad(seconds), label: "Segundos" },
      ]
    : [
        { value: pad(Math.floor(safe / 60)), label: "Minutos" },
        { value: pad(seconds), label: "Segundos" },
      ];

  const lastIndex = units.length - 1;

  return (
    <div
      ref={rootRef}
      className={`flip-clock${showHours ? " flip-clock--hours" : ""}`}
    >
      {units.map(({ value, label }, i) => (
        <div className="flip-cell" key={label}>
          <FlipUnit
            value={value}
            action={
              i === lastIndex && onExpand ? (
                <button
                  type="button"
                  className="flip-unit__action"
                  onClick={onExpand}
                  aria-label={expanded ? "Recolher relógio" : "Expandir relógio em tela cheia"}
                >
                  {expanded ? (
                    <Minimize strokeWidth={2.2} />
                  ) : (
                    <Maximize strokeWidth={2.2} />
                  )}
                </button>
              ) : undefined
            }
          />
          <span className="flip-cell__label">{label}</span>
        </div>
      ))}
    </div>
  );
}
