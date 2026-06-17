import { useRef, useState } from "react";
import { ArrowLeft, Bell, Check, Edit3, Plus, Trash2, X } from "lucide-react";
import Popover from "./Popover.jsx";
import Checkbox from "./Checkbox.jsx";
import { periodForTime, PERIOD_LABELS } from "./alarms.js";

/**
 * Popover de alarmes de uma coluna-dia. Lista os alarmes (horario + descricao),
 * com adicionar/editar/remover e um toggle por alarme. Segue o padrao visual do
 * LabelsPopover (kpop*). O comportamento de disparo vive no DayLane.
 */

// Mantem so digitos (max 2) e limita ao teto (23h / 59min). Preserva o que foi
// digitado enquanto cabe; "estoura" para o teto se passar.
const clampSeg = (value, max) => {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (digits === "") return "";
  const n = Number(digits);
  return n > max ? String(max) : digits;
};
const pad2 = (value) => (value === "" ? "" : value.padStart(2, "0"));
const splitTime = (t) => {
  const [h = "", m = ""] = (t || "").split(":");
  return { h, m };
};

// directEdit=true: aberto diretamente pelo item inline (sem lista por tras).
// Nesse caso: seta de voltar some, X fecha o popover todo (onClose).
function AlarmForm({ initialAlarm, periodsWithCards, onBack, onSave, directEdit = false, onClose }) {
  const initial = splitTime(initialAlarm?.time);
  const [hours, setHours] = useState(initial.h);
  const [minutes, setMinutes] = useState(initial.m);
  const [description, setDescription] = useState(initialAlarm?.description || "");
  const [error, setError] = useState("");
  const hoursRef = useRef(null);
  const minutesRef = useRef(null);
  const isEditing = Boolean(initialAlarm);
  const ready = hours !== "" && minutes !== "";

  const submit = () => {
    if (!ready) return;
    const time = `${pad2(hours)}:${pad2(minutes)}`;
    // Regra: so e possivel ter alarme num periodo que ja tem ao menos um card.
    const period = periodForTime(time);
    if (!periodsWithCards.includes(period)) {
      setError(
        `Crie um card na ${PERIOD_LABELS[period]} antes de adicionar um alarme nesse horário.`
      );
      return;
    }
    onSave({
      id: initialAlarm?.id,
      time,
      description: description.trim(),
      enabled: initialAlarm ? initialAlarm.enabled !== false : true,
    });
  };

  const onHours = (e) => {
    setError("");
    const v = clampSeg(e.target.value, 23);
    setHours(v);
    if (v.length === 2) minutesRef.current?.focus(); // avanca sozinho p/ minutos
  };
  const onMinutes = (e) => {
    setError("");
    setMinutes(clampSeg(e.target.value, 59));
  };
  const onEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="alarm-form">
      <div className="kpop__head kpop__head--form">
        {directEdit ? null : (
          <button type="button" className="kpop__back" onClick={onBack} aria-label="Voltar">
            <ArrowLeft size={16} strokeWidth={2.4} />
          </button>
        )}
        <span className="kpop__title">{isEditing ? "Editar alarme" : "Novo alarme"}</span>
        <button
          type="button"
          className="kpop__close"
          onClick={directEdit ? onClose : onBack}
          aria-label="Fechar"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <div className="alarm-form__field">
        <span>Horário</span>
        <div className="alarm-time">
          <input
            ref={hoursRef}
            className="alarm-time__seg"
            value={hours}
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            aria-label="Hora"
            onChange={onHours}
            onFocus={(e) => e.target.select()}
            onBlur={() => setHours((h) => pad2(h))}
            onKeyDown={onEnter}
          />
          <span className="alarm-time__colon" aria-hidden="true">:</span>
          <input
            ref={minutesRef}
            className="alarm-time__seg"
            value={minutes}
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            aria-label="Minuto"
            onChange={onMinutes}
            onFocus={(e) => e.target.select()}
            onBlur={() => setMinutes((m) => pad2(m))}
            onKeyDown={(e) => {
              onEnter(e);
              if (e.key === "Backspace" && minutes === "") hoursRef.current?.focus();
            }}
          />
        </div>
      </div>

      <label className="alarm-form__field">
        <span>Descrição</span>
        <input
          className="alarm-form__desc"
          value={description}
          placeholder="O que fazer neste horário…"
          maxLength={120}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onEnter}
        />
      </label>

      {error ? (
        <p className="alarm-form__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="alarm-form__foot">
        <button
          type="button"
          className="alarm-form__save"
          onClick={submit}
          disabled={!ready}
        >
          <Check size={16} strokeWidth={2.4} />
          <span>{isEditing ? "Salvar" : "Criar alarme"}</span>
        </button>
      </div>
    </div>
  );
}

export default function AlarmsPopover({
  anchorRef,
  alarms,
  periodsWithCards = [],
  initialEditId = null,
  onCreate,
  onUpdate,
  onToggle,
  onDelete,
  onClose,
}) {
  // Se abriu com um alarme especifico (clique no item inline), guarda o flag
  // para que o AlarmForm saiba que nao tem lista por tras.
  const directEdit = Boolean(initialEditId);
  const [editing, setEditing] = useState(() => {
    if (initialEditId) {
      const found = alarms.find((a) => a.id === initialEditId);
      if (found) return found;
    }
    return alarms.length ? null : "new";
  });

  const save = (alarm) => {
    if (editing && editing !== "new") {
      onUpdate(alarm);
    } else {
      onCreate(alarm);
    }
    onClose();
  };

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={272} className="kpop--alarms">
      {editing !== null ? (
        <AlarmForm
          initialAlarm={editing === "new" ? null : editing}
          periodsWithCards={periodsWithCards}
          onBack={() => setEditing(null)}
          onSave={save}
          directEdit={directEdit && editing !== "new"}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="kpop__head">
            <span className="kpop__title">Alarmes</span>
            <button type="button" className="kpop__close" onClick={onClose} aria-label="Fechar">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>

          {alarms.length ? (
            <div className="alarm-list">
              {alarms.map((alarm) => (
                <div
                  key={alarm.id}
                  className={`alarm-row${alarm.enabled ? "" : " is-off"}`}
                >
                  <Checkbox
                    checked={alarm.enabled}
                    onChange={() => onToggle(alarm.id)}
                    size={16}
                    label={`${alarm.enabled ? "Desativar" : "Ativar"} alarme das ${alarm.time}`}
                  />
                  <button
                    type="button"
                    className="alarm-row__main"
                    onClick={() => setEditing(alarm)}
                  >
                    <span className="alarm-row__time">{alarm.time}</span>
                    {alarm.description ? (
                      <span className="alarm-row__desc">{alarm.description}</span>
                    ) : (
                      <span className="alarm-row__desc is-empty">Sem descrição</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="alarm-row__edit"
                    aria-label="Editar alarme"
                    onClick={() => setEditing(alarm)}
                  >
                    <Edit3 size={15} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="alarm-row__delete"
                    aria-label="Excluir alarme"
                    onClick={() => onDelete(alarm.id)}
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="alarm-empty">
              <Bell size={16} strokeWidth={2.2} />
              <span>Nenhum alarme neste dia.</span>
            </p>
          )}

          <button
            type="button"
            className="kpop__create-label"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} strokeWidth={2.3} />
            <span>Adicionar alarme</span>
          </button>
        </>
      )}
    </Popover>
  );
}
