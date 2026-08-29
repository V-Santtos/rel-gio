import { ArrowLeft, Check, Edit3, Pipette, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Popover from "./Popover.jsx";
import Checkbox from "./Checkbox.jsx";
import { makeClientId } from "../../lib/id.js";

const LABEL_PRESETS = [
  "#C06C75", "#C98B5B", "#B39B55", "#699C78",
  "#5C9F9B", "#6689BC", "#8B76B6", "#AD6E97",
];

const normalizeHex = (value) => {
  const next = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(next) ? next.toUpperCase() : null;
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const hexToHsv = (hex) => {
  const safe = normalizeHex(hex) || LABEL_PRESETS[0];
  const r = parseInt(safe.slice(1, 3), 16) / 255;
  const g = parseInt(safe.slice(3, 5), 16) / 255;
  const b = parseInt(safe.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max ? (delta / max) * 100 : 0, v: max * 100 };
};

const hsvToHex = (h, s, v) => {
  const saturation = clamp(s) / 100, value = clamp(v) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = value - chroma;
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((part) => Math.round((part + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

function ColorPickerPanel({ value, onApply, onClose }) {
  const initial = hexToHsv(value);
  const [hue, setHue] = useState(initial.h);
  const [saturation, setSaturation] = useState(initial.s);
  const [brightness, setBrightness] = useState(initial.v);
  const selectionRef = useRef(null);
  const hex = hsvToHex(hue, saturation, brightness);
  const updateSelection = (event) => {
    const rect = selectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSaturation(clamp(((event.clientX - rect.left) / rect.width) * 100));
    setBrightness(clamp(100 - ((event.clientY - rect.top) / rect.height) * 100));
  };
  const sampleFromScreen = async () => {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      const next = hexToHsv(result.sRGBHex);
      setHue(next.h); setSaturation(next.s); setBrightness(next.v);
    } catch { /* cancelamento do usuário */ }
  };

  return (
    <div className="label-color-picker">
      <div className="kpop__head kpop__head--form">
        <button type="button" className="kpop__back" onClick={onClose} aria-label="Voltar">
          <ArrowLeft size={16} strokeWidth={2.4} />
        </button>
        <span className="kpop__title">Personalizar cor</span>
        <button type="button" className="kpop__close" onClick={onClose} aria-label="Fechar">
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>
      <div
        ref={selectionRef}
        className="label-color-picker__field"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateSelection(event); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSelection(event); }}
      >
        <span style={{ left: `${saturation}%`, top: `${100 - brightness}%` }} aria-hidden="true" />
      </div>
      <div className="label-color-picker__hue">
        <input type="range" min="0" max="360" value={hue} onChange={(event) => setHue(Number(event.target.value))} aria-label="Matiz" />
      </div>
      <div className="label-color-picker__meta">
        <button type="button" className="label-color-picker__eyedropper" onClick={sampleFromScreen} aria-label="Capturar cor da tela">
          <Pipette size={16} strokeWidth={2.2} />
        </button>
        <span className="label-color-picker__sample" style={{ background: hex }} aria-hidden="true" />
        <label className="label-color-picker__hex"><span>HEX</span><input value={hex} readOnly /></label>
      </div>
      <div className="label-color-picker__actions">
        <button type="button" className="label-color-picker__cancel" onClick={onClose}>Cancelar</button>
        <button type="button" className="label-color-picker__apply" onClick={() => onApply(hex)}>Aplicar cor</button>
      </div>
    </div>
  );
}

function LabelForm({ initialLabel, onBack, onSave }) {
  const [name, setName] = useState(initialLabel?.name || "");
  const [color, setColor] = useState(initialLabel?.color || LABEL_PRESETS[0]);
  const [hex, setHex] = useState(initialLabel?.color || LABEL_PRESETS[0]);
  const [nameError, setNameError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isEditing = Boolean(initialLabel);

  const chooseColor = (next) => {
    setColor(next);
    setHex(next);
  };
  const updateHex = (value) => {
    setHex(value);
    const valid = normalizeHex(value);
    if (valid) setColor(valid);
  };
  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    onSave({ id: initialLabel?.id || makeClientId(), name: trimmedName, color });
  };

  if (pickerOpen) {
    return <ColorPickerPanel value={color} onClose={() => setPickerOpen(false)} onApply={(next) => { chooseColor(next); setPickerOpen(false); }} />;
  }

  return (
    <div className="label-form">
      <div className="kpop__head kpop__head--form">
        <button type="button" className="kpop__back" onClick={onBack} aria-label="Voltar">
          <ArrowLeft size={16} strokeWidth={2.4} />
        </button>
        <span className="kpop__title">{isEditing ? "Editar etiqueta" : "Nova etiqueta"}</span>
        <button type="button" className="kpop__close" onClick={onBack} aria-label="Fechar">
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <div className="label-form__preview" style={{ "--label-color": color }}>
        <span aria-hidden="true" />
        <strong>{name.trim() || "Sua etiqueta"}</strong>
      </div>

      <label className="label-form__field">
        <span>Nome da etiqueta</span>
        <input
          value={name}
          maxLength={24}
          placeholder="Ex.: Trabalho"
          aria-invalid={nameError}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(false);
          }}
        />
      </label>
      {nameError ? <p className="label-form__error">Dê um nome à etiqueta para continuar.</p> : null}

      <div className="label-form__field">
        <span>Cores sugeridas</span>
        <div className="label-form__colors">
          {LABEL_PRESETS.map((item) => (
            <button
              type="button"
              key={item}
              className={`label-form__color${color === item ? " is-selected" : ""}`}
              style={{ background: item }}
              aria-label={`Selecionar cor ${item}`}
              onClick={() => chooseColor(item)}
            >
              {color === item ? <Check size={15} strokeWidth={2.7} /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="label-form__custom">
        <button type="button" className="label-form__color-picker" onClick={() => setPickerOpen(true)}>
          <span className="label-form__color-picker-dot" style={{ background: normalizeHex(color) || "transparent" }} />
          <span>Personalizar</span>
        </button>
        <label className="label-form__hex">
          <span>HEX</span>
          <input value={hex} maxLength={7} onChange={(event) => updateHex(event.target.value)} />
        </label>
      </div>

      <div className="label-form__foot">
        <button type="button" className="label-form__remove" onClick={() => chooseColor("transparent")}>
          <X size={16} strokeWidth={2.2} />
          <span>Sem cor</span>
        </button>
        <button type="button" className="label-form__create" onClick={submit}>
          {isEditing ? "Salvar" : "Criar etiqueta"}
        </button>
      </div>
    </div>
  );
}

export default function LabelsPopover({ anchorRef, selected, labels, onToggle, onCreate, onUpdate, onClose }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const hasLabels = labels.some((label) => Boolean(label.name?.trim()) || selected.includes(label.id));
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    // As cores antigas sem nome são preservadas para cartões que já as usam,
    // mas não são oferecidas como catálogo inicial. Assim, novos cartões
    // começam com etiquetas pessoais em vez de um conjunto de semáforos.
    return labels.filter((label) => {
      const visible = Boolean(label.name?.trim()) || selected.includes(label.id);
      if (!visible) return false;
      return !normalized || (label.name || "Sem nome").toLowerCase().includes(normalized);
    });
  }, [labels, query, selected]);
  const saveLabel = (label) => {
    if (editing && editing !== "new") onUpdate(label);
    else onCreate(label);
    setEditing(null);
  };

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={312} className="kpop--labels">
      {editing !== null ? (
        <LabelForm initialLabel={editing === "new" ? null : editing} onBack={() => setEditing(null)} onSave={saveLabel} />
      ) : (
        <>
          <div className="kpop__head">
            <span className="kpop__title">Etiquetas</span>
            <button type="button" className="kpop__close" onClick={onClose} aria-label="Fechar">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
          {hasLabels ? (
            <>
              <input className="kpop__search" value={query} placeholder="Buscar etiquetas..." onChange={(event) => setQuery(event.target.value)} />
              <span className="kpop__section-label">Suas etiquetas</span>
              <div className="kpop__labels">
                {filtered.map((label) => {
                  const isOn = selected.includes(label.id);
                  const isLocked = !isOn && selected.length >= 4;
                  return (
                    <div key={label.id} className={`kpop__label-row${isLocked ? " is-locked" : ""}`}>
                      <Checkbox checked={isOn} onChange={() => onToggle(label.id)} size={16} label={`Selecionar etiqueta ${label.name || "sem nome"}`} />
                      <button type="button" className="kpop__swatch" style={{ "--label-color": label.color }} onClick={() => onToggle(label.id)} disabled={isLocked}>
                        <i aria-hidden="true" />
                        <span>{label.name || "Sem nome"}</span>
                      </button>
                      <button type="button" className="kpop__edit" aria-label="Editar etiqueta" onClick={() => setEditing(label)}>
                        <Edit3 size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="kpop__empty">Nenhuma etiqueta criada.</p>
          )}
          <button type="button" className="kpop__create-label" onClick={() => setEditing("new")}>
            <Plus size={16} strokeWidth={2.3} />
            <span>Criar etiqueta</span>
          </button>
        </>
      )}
    </Popover>
  );
}
