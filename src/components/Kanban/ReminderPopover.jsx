import { useRef, useState } from "react";
import { X } from "lucide-react";
import Popover from "./Popover.jsx";

/**
 * Popover de lembrete do cartao (so Modo Semana). Um lembrete por cartao:
 * horario HH:MM + repeticao:
 *   once  -> toca no proximo dia da coluna do cartao e se desliga;
 *   daily -> toca todo dia;
 *   days  -> toca nos dias marcados.
 * Mesmo input de dois segmentos dos alarmes (sem o picker nativo). Salvar
 * devolve { time, repeat, days }; Remover devolve null. O disparo vive no
 * verificador global (App.jsx).
 */

// Mantem so digitos (max 2) e limita ao teto (23h / 59min).
const clampSeg = (value, max) => {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (digits === "") return "";
  const n = Number(digits);
  return n > max ? String(max) : digits;
};
const pad2 = (value) => (value === "" ? "" : value.padStart(2, "0"));

const REPEAT_OPTS = [
  { key: "once", label: "Uma vez" },
  { key: "daily", label: "Todo dia" },
  { key: "days", label: "Dias" },
];
const DAY_OPTS = [
  { key: "monday", short: "S", label: "Segunda" },
  { key: "tuesday", short: "T", label: "Terça" },
  { key: "wednesday", short: "Q", label: "Quarta" },
  { key: "thursday", short: "Q", label: "Quinta" },
  { key: "friday", short: "S", label: "Sexta" },
  { key: "saturday", short: "S", label: "Sábado" },
  { key: "sunday", short: "D", label: "Domingo" },
];

export default function ReminderPopover({
  anchorRef,
  day,
  dayKey,
  time,
  repeat,
  days,
  onSave,
  onClose,
}) {
  const [initialH = "", initialM = ""] = (time || "").split(":");
  const [hours, setHours] = useState(initialH);
  const [minutes, setMinutes] = useState(initialM);
  const [mode, setMode] = useState(repeat || "once");
  const [picked, setPicked] = useState(() =>
    days?.length ? days : dayKey ? [dayKey] : []
  );
  const hoursRef = useRef(null);
  const minutesRef = useRef(null);
  const ready = hours !== "" && minutes !== "" && (mode !== "days" || picked.length > 0);

  const save = () => {
    if (!ready) return;
    onSave({
      time: `${pad2(hours)}:${pad2(minutes)}`,
      repeat: mode,
      days: mode === "days" ? DAY_OPTS.map((d) => d.key).filter((k) => picked.includes(k)) : [],
    });
    onClose();
  };
  const remove = () => {
    onSave(null);
    onClose();
  };
  const toggleDay = (key) =>
    setPicked((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter" && event.target.tagName === "INPUT") {
      event.preventDefault();
      save();
    }
  };

  const hint =
    mode === "daily" ? (
      "Toca todos os dias neste horário."
    ) : mode === "days" ? (
      "Toca nos dias marcados neste horário."
    ) : (
      <>
        Toca uma vez, {day ? <>na próxima <strong>{day}</strong></> : "no dia da coluna"}, e se
        desliga.
      </>
    );

  return (
    <Popover anchorRef={anchorRef} width={280} className="kpop--reminder" onClose={onClose}>
      <div className="reminderpop" onKeyDown={onKeyDown}>
        <div className="kpop__head">
          <p className="kpop__title">Lembrete</p>
          <button type="button" className="kpop__close" aria-label="Fechar" onClick={onClose}>
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        <div className="alarm-time reminderpop__time">
          <input
            ref={hoursRef}
            className="alarm-time__seg"
            value={hours}
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            aria-label="Hora do lembrete"
            autoFocus
            onChange={(e) => {
              const v = clampSeg(e.target.value, 23);
              setHours(v);
              if (v.length === 2) minutesRef.current?.focus();
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => setHours((h) => pad2(h))}
          />
          <span className="alarm-time__colon" aria-hidden="true">:</span>
          <input
            ref={minutesRef}
            className="alarm-time__seg"
            value={minutes}
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            aria-label="Minuto do lembrete"
            onChange={(e) => setMinutes(clampSeg(e.target.value, 59))}
            onFocus={(e) => e.target.select()}
            onBlur={() => setMinutes((m) => pad2(m))}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && minutes === "") hoursRef.current?.focus();
            }}
          />
        </div>

        <div className="reminderpop__field">
          <span className="reminderpop__label" id="reminderpop-repeat">
            Repetir
          </span>
          <div className="reminderpop__repeat" role="radiogroup" aria-labelledby="reminderpop-repeat">
            {REPEAT_OPTS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={mode === opt.key}
                className={`reminderpop__opt${mode === opt.key ? " is-active" : ""}`}
                onClick={() => setMode(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode === "days" ? (
            <div className="reminderpop__days" role="group" aria-label="Dias da semana">
              {DAY_OPTS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={picked.includes(d.key)}
                  aria-label={d.label}
                  title={d.label}
                  className={`reminderpop__day${picked.includes(d.key) ? " is-active" : ""}`}
                  onClick={() => toggleDay(d.key)}
                >
                  {d.short}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <p className="reminderpop__hint">{hint}</p>

        <button type="button" className="datespop__save" onClick={save} disabled={!ready}>
          Salvar
        </button>
        {time ? (
          <button type="button" className="datespop__remove" onClick={remove}>
            Remover lembrete
          </button>
        ) : null}
      </div>
    </Popover>
  );
}
