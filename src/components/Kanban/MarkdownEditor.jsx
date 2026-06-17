import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic } from "lucide-react";

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

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
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
