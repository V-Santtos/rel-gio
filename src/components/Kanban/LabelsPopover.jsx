import { ArrowLeft, Check, Edit3, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import Popover from "./Popover.jsx";
import Checkbox from "./Checkbox.jsx";
import { LABEL_COLORS } from "./labels.js";
import { makeClientId } from "../../lib/id.js";

function LabelForm({ initialLabel, onBack, onSave }) {
  const [name, setName] = useState(initialLabel?.name || "");
  const [color, setColor] = useState(initialLabel?.color || LABEL_COLORS[0]);
  const isEditing = Boolean(initialLabel);

  const submit = () => {
    onSave({
      id: initialLabel?.id || makeClientId(),
      name: name.trim(),
      color,
    });
  };

  return (
    <div className="label-form">
      <div className="kpop__head kpop__head--form">
        <button type="button" className="kpop__back" onClick={onBack} aria-label="Voltar">
          <ArrowLeft size={16} strokeWidth={2.4} />
        </button>
        <span className="kpop__title">{isEditing ? "Editar Etiqueta" : "Criar Etiqueta"}</span>
        <button type="button" className="kpop__close" onClick={onBack} aria-label="Fechar">
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <div className="label-form__preview" style={{ background: color }} />

      <label className="label-form__field">
        <span>Titulo</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <div className="label-form__field">
        <span>Selecionar uma cor</span>
        <div className="label-form__colors">
          {LABEL_COLORS.map((item) => (
            <button
              type="button"
              key={item}
              className={`label-form__color${color === item ? " is-selected" : ""}`}
              style={{ background: item }}
              aria-label={`Selecionar cor ${item}`}
              onClick={() => setColor(item)}
            >
              {color === item ? <Check size={16} strokeWidth={2.5} /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="label-form__foot">
        <button type="button" className="label-form__remove" onClick={() => setColor("transparent")}>
          <X size={16} strokeWidth={2.2} />
          <span>Remover cor</span>
        </button>
        <button type="button" className="label-form__create" onClick={submit}>
          {isEditing ? "Salvar" : "Criar"}
        </button>
      </div>
    </div>
  );
}

export default function LabelsPopover({
  anchorRef,
  selected,
  labels,
  onToggle,
  onCreate,
  onUpdate,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return labels;
    return labels.filter((label) =>
      (label.name || "Etiqueta").toLowerCase().includes(normalized)
    );
  }, [labels, query]);

  const saveLabel = (label) => {
    if (editing) {
      onUpdate(label);
    } else {
      onCreate(label);
    }
    setEditing(null);
  };

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={296} className="kpop--labels">
      {editing !== null ? (
        <LabelForm
          initialLabel={editing === "new" ? null : editing}
          onBack={() => setEditing(null)}
          onSave={saveLabel}
        />
      ) : (
        <>
          <div className="kpop__head">
            <span className="kpop__title">Etiquetas</span>
            <button type="button" className="kpop__close" onClick={onClose} aria-label="Fechar">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>

          <input
            className="kpop__search"
            value={query}
            placeholder="Buscar etiquetas..."
            onChange={(event) => setQuery(event.target.value)}
          />

          <span className="kpop__section-label">Etiquetas</span>

          <div className="kpop__labels">
            {filtered.map((label) => {
              const isOn = selected.includes(label.id);
              const isLocked = !isOn && selected.length >= 4;
              return (
                <div key={label.id} className={`kpop__label-row${isLocked ? " is-locked" : ""}`}>
                  <Checkbox
                    checked={isOn}
                    onChange={() => onToggle(label.id)}
                    size={16}
                    label={`Selecionar etiqueta ${label.name || label.id}`}
                  />
                  <button
                    type="button"
                    className="kpop__swatch"
                    style={{ background: label.color }}
                    onClick={() => onToggle(label.id)}
                    disabled={isLocked}
                  >
                    {label.name ? <span>{label.name}</span> : null}
                  </button>
                  <button
                    type="button"
                    className="kpop__edit"
                    aria-label="Editar etiqueta"
                    onClick={() => setEditing(label)}
                  >
                    <Edit3 size={15} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="kpop__create-label" onClick={() => setEditing("new")}>
            <Plus size={16} strokeWidth={2.3} />
            <span>Criar uma nova etiqueta</span>
          </button>
        </>
      )}
    </Popover>
  );
}
