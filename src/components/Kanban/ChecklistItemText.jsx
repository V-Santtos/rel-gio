import { useState } from "react";
import SmartLink from "./SmartLink.jsx";

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const hasUrl = (text) => /https?:\/\/\S/.test(text || "");

/**
 * Texto do item do checklist. Sem link: campo sempre editavel (como antes).
 * Com link: modo leitura com o link inteligente (limitado a 3 linhas com
 * reticencias); clicar fora do link entra em edicao, Enter/Esc/blur sai.
 */
export default function ChecklistItemText({ text, onChange }) {
  const [editing, setEditing] = useState(false);

  if (editing || !hasUrl(text)) {
    return (
      <input
        className="checkitem__text"
        value={text}
        autoFocus={editing}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || (event.key === "Escape" && editing)) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <div
      className="checkitem__view"
      tabIndex={0}
      title="Clique para editar"
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          setEditing(true);
        }
      }}
    >
      <span className="checkitem__clamp">
        {text.split(URL_SPLIT).map((part, i) =>
          i % 2 === 1 ? <SmartLink key={`${i}-${part}`} href={part} /> : part,
        )}
      </span>
    </div>
  );
}
