import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Popover from "./Popover.jsx";
import {
  Bold,
  Italic,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
} from "lucide-react";

// Icone do botao de titulo: generico (H) fora de titulo; especifico (H1/H2/H3)
// quando o cursor esta numa linha de titulo — feedback direto do nivel atual.
const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3 };

const editorPlaceholder = "Adicione uma descrição mais detalhada…";

function ToolbarButton({ active, title, children, onClick }) {
  return (
    <button
      type="button"
      className={`mde__btn${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Editor de descricao. Uso pessoal: a barra mostra so Negrito e Italico; todo o
// resto do markdown (titulos #, citacao >, regua ---, listas, tachado ~~,
// destaque ==) continua FUNCIONANDO digitando na mao (input rules do Tiptap),
// so nao tem botao. Sem Salvar/Cancelar: grava ao vivo via onChange (o "Salvar"
// do card e que comita o rascunho); sai do modo edicao no blur.
export default function MarkdownEditor({ value, onChange, onBlur }) {
  const [active, setActive] = useState({});
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingBtnRef = useRef(null);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          // So 3 niveis: a visualizacao (.md-rendered) so estiliza h1-h3 —
          // h4-h6 sairiam MENORES que o texto normal (default do browser).
          levels: [1, 2, 3],
        },
        link: {
          autolink: true,
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Highlight,
      Placeholder.configure({
        placeholder: editorPlaceholder,
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
        },
      }),
    ],
    []
  );

  const updateActiveState = (instance) => {
    if (!instance) return;
    setActive({
      bold: instance.isActive("bold"),
      italic: instance.isActive("italic"),
      heading: instance.isActive("heading"),
      h1: instance.isActive("heading", { level: 1 }),
      h2: instance.isActive("heading", { level: 2 }),
      h3: instance.isActive("heading", { level: 3 }),
    });
  };

  const editor = useEditor({
    extensions,
    content: value || "",
    contentType: "markdown",
    autofocus: "end",
    editorProps: {
      attributes: {
        class: "mde__prose",
        "aria-label": "Editor de descricao",
        spellcheck: "false",
      },
    },
    onCreate: ({ editor: instance }) => {
      updateActiveState(instance);
      queueMicrotask(() => instance.commands.focus("end"));
    },
    onUpdate: ({ editor: instance }) => {
      updateActiveState(instance);
      onChange?.(instance.getMarkdown().trim());
    },
    onSelectionUpdate: ({ editor: instance }) => updateActiveState(instance),
    onBlur: () => onBlur?.(),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getMarkdown();
    if ((value || "").trim() !== current.trim()) {
      editor.commands.setContent(value || "", { contentType: "markdown" });
    }
  }, [editor, value]);

  const run = (command) => {
    if (!editor) return;
    command(editor.chain().focus()).run();
    updateActiveState(editor);
  };

  return (
    <div className="mde">
      <div
        className="mde__toolbar"
        role="toolbar"
        aria-label="Formatacao"
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="mde__heading-wrap">
          <button
            type="button"
            ref={headingBtnRef}
            className={`mde__btn mde__btn--heading${
              active.heading ? " is-active" : ""
            }${headingOpen ? " is-open" : ""}`}
            title="Título"
            aria-label="Título"
            aria-haspopup="menu"
            aria-expanded={headingOpen}
            onClick={() => setHeadingOpen((v) => !v)}
          >
            {(() => {
              const level = active.h1 ? 1 : active.h2 ? 2 : active.h3 ? 3 : 0;
              const Icon = HEADING_ICONS[level] || Heading;
              return <Icon size={level ? 17 : 15} strokeWidth={2.4} />;
            })()}
            <ChevronDown size={11} strokeWidth={2.4} />
          </button>
          {headingOpen ? (
            <Popover
              anchorRef={headingBtnRef}
              onClose={() => setHeadingOpen(false)}
              width={190}
              className="mde__heading-popover"
            >
            <div
              className="mde__heading-menu"
              role="menu"
              aria-label="Nível do título"
              onMouseDown={(event) => event.preventDefault()}
            >
              {[1, 2, 3].map((level) => (
                <button
                  type="button"
                  key={level}
                  role="menuitem"
                  className={active[`h${level}`] ? "is-active" : ""}
                  onClick={() => {
                    run((chain) => chain.toggleHeading({ level }));
                    setHeadingOpen(false);
                  }}
                >
                  <span
                    className={`mde__heading-sample mde__heading-sample--h${level}`}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  Título {level}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={active.heading ? "" : "is-active"}
                onClick={() => {
                  run((chain) => chain.setParagraph());
                  setHeadingOpen(false);
                }}
              >
                <span className="mde__heading-sample" aria-hidden="true">
                  Aa
                </span>
                Texto normal
              </button>
            </div>
            </Popover>
          ) : null}
        </div>
        <span className="mde__sep" aria-hidden="true" />
        <ToolbarButton
          title="Negrito"
          active={active.bold}
          onClick={() => run((chain) => chain.toggleBold())}
        >
          <Bold size={15} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Itálico"
          active={active.italic}
          onClick={() => run((chain) => chain.toggleItalic())}
        >
          <Italic size={15} strokeWidth={2.4} />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} className="mde__editor" />
    </div>
  );
}
