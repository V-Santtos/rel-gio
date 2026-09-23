import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import Popover from "./Popover.jsx";
import Checkbox from "./Checkbox.jsx";
import {
  MONTHS,
  WEEKDAYS,
  dayKey,
  formatDMY,
  formatHM,
  keyToDate,
  maskDMY,
  maskHM,
  parseDMY,
  parseHM,
} from "./cardDates.js";

// 6 semanas a partir do domingo anterior ao dia 1 do mes.
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

/**
 * Popover de datas (referencia: Trello, sem recorrencia/lembrete). Calendario
 * mensal + Data de inicio (opcional) + Data de entrega com hora. Clicar num dia
 * preenche o campo em foco (inicio ou entrega). Salvar devolve
 * { startDate: "AAAA-MM-DD" | null, dueAt: ISO | null }.
 */
export default function DatesPopover({ anchorRef, startDate, dueAt, onSave, onClose }) {
  const today = dayKey(new Date());
  const due = dueAt ? new Date(dueAt) : null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const empty = !startDate && !dueAt;

  const [startOn, setStartOn] = useState(Boolean(startDate));
  const [startText, setStartText] = useState(formatDMY(startDate));
  const [dueOn, setDueOn] = useState(Boolean(dueAt) || empty);
  const [dueText, setDueText] = useState(formatDMY(due ? dayKey(due) : empty ? dayKey(tomorrow) : ""));
  const [timeText, setTimeText] = useState(due ? formatHM(due) : "12:00");
  const [field, setField] = useState(startDate && !dueAt ? "start" : "due");
  const [error, setError] = useState("");

  const anchorDay = keyToDate(parseDMY(dueText)) || keyToDate(parseDMY(startText)) || new Date();
  const [view, setView] = useState({ y: anchorDay.getFullYear(), m: anchorDay.getMonth() });
  const grid = useMemo(() => monthGrid(view.y, view.m), [view]);

  const startKey = startOn ? parseDMY(startText) : null;
  const dueKey = dueOn ? parseDMY(dueText) : null;

  const shift = (months) =>
    setView(({ y, m }) => {
      const d = new Date(y, m + months, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const pickDay = (key) => {
    setError("");
    if (field === "start" && startOn) setStartText(formatDMY(key));
    else {
      setDueOn(true);
      setDueText(formatDMY(key));
      setField("due");
    }
  };

  const save = () => {
    const s = startOn ? parseDMY(startText) : null;
    if (startOn && !s) return setError("Data de início inválida (D/M/AAAA).");
    const d = dueOn ? parseDMY(dueText) : null;
    if (dueOn && !d) return setError("Data de entrega inválida (D/M/AAAA).");
    const t = dueOn ? parseHM(timeText) : null;
    if (dueOn && !t) return setError("Hora inválida (HH:MM).");
    if (s && d && s > d) return setError("A data de início deve ser antes da entrega.");
    let iso = null;
    if (d) {
      const date = keyToDate(d);
      date.setHours(t.h, t.min, 0, 0);
      iso = date.toISOString();
    }
    onSave({ startDate: s, dueAt: iso });
    onClose();
  };

  const remove = () => {
    onSave({ startDate: null, dueAt: null });
    onClose();
  };

  const stopEscape = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <Popover anchorRef={anchorRef} width={304} className="kpop--dates" onClose={onClose}>
      <div className="datespop" onKeyDown={stopEscape}>
        <div className="kpop__head">
          <p className="kpop__title">Datas</p>
          <button type="button" className="kpop__close" aria-label="Fechar" onClick={onClose}>
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        <div className="datespop__nav">
          <button type="button" aria-label="Ano anterior" onClick={() => shift(-12)}>
            <ChevronsLeft size={16} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)}>
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <span className="datespop__month" aria-live="polite">
            {MONTHS[view.m]} {view.y}
          </span>
          <button type="button" aria-label="Próximo mês" onClick={() => shift(1)}>
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Próximo ano" onClick={() => shift(12)}>
            <ChevronsRight size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="datespop__grid" role="grid" aria-label="Calendário">
          {WEEKDAYS.map((w) => (
            <span key={w} className="datespop__weekday" role="columnheader">
              {w}
            </span>
          ))}
          {grid.map((cell) => {
            const inRange = startKey && dueKey && cell.key > startKey && cell.key < dueKey;
            const selected = cell.key === dueKey || cell.key === startKey;
            return (
              <button
                key={cell.key}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-label={formatDMY(cell.key)}
                className={`datespop__day${cell.inMonth ? "" : " is-muted"}${
                  cell.key === today ? " is-today" : ""
                }${selected ? " is-selected" : ""}${inRange ? " is-range" : ""}`}
                onClick={() => pickDay(cell.key)}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <div className="datespop__field">
          <span className="datespop__label" id="datespop-start">
            Data de início
          </span>
          <div className="datespop__row">
            <Checkbox
              checked={startOn}
              shape="square"
              size={16}
              label="Usar data de início"
              onChange={(v) => {
                setStartOn(v);
                setError("");
                if (v) {
                  setField("start");
                  if (!parseDMY(startText)) setStartText(formatDMY(dueKey || today));
                }
              }}
            />
            <input
              className={`datespop__input${field === "start" && startOn ? " is-focus" : ""}`}
              aria-labelledby="datespop-start"
              inputMode="numeric"
              placeholder="D/M/AAAA"
              disabled={!startOn}
              value={startOn ? startText : ""}
              onFocus={() => setField("start")}
              onChange={(e) => {
                setStartText(maskDMY(e.target.value));
                setError("");
              }}
            />
          </div>
        </div>

        <div className="datespop__field">
          <span className="datespop__label" id="datespop-due">
            Data de entrega
          </span>
          <div className="datespop__row">
            <Checkbox
              checked={dueOn}
              shape="square"
              size={16}
              label="Usar data de entrega"
              onChange={(v) => {
                setDueOn(v);
                setError("");
                if (v) {
                  setField("due");
                  if (!parseDMY(dueText)) setDueText(formatDMY(dayKey(tomorrow)));
                }
              }}
            />
            <input
              className={`datespop__input${field === "due" && dueOn ? " is-focus" : ""}`}
              aria-labelledby="datespop-due"
              inputMode="numeric"
              placeholder="D/M/AAAA"
              disabled={!dueOn}
              value={dueOn ? dueText : ""}
              onFocus={() => setField("due")}
              onChange={(e) => {
                setDueText(maskDMY(e.target.value));
                setError("");
              }}
            />
            <input
              className="datespop__input datespop__input--time"
              aria-label="Hora da entrega"
              inputMode="numeric"
              placeholder="HH:MM"
              disabled={!dueOn}
              value={dueOn ? timeText : ""}
              onChange={(e) => {
                setTimeText(maskHM(e.target.value));
                setError("");
              }}
            />
          </div>
        </div>

        {error ? (
          <p className="coverpop__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="button" className="datespop__save" onClick={save}>
          Salvar
        </button>
        <button type="button" className="datespop__remove" onClick={remove}>
          Remover
        </button>
      </div>
    </Popover>
  );
}
