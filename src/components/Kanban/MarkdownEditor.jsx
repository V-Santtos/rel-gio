import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";

const editorPlaceholder = "";

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

export default function MarkdownEditor({ value, onSave, onCancel }) {
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

  const editor = useEditor({
    extensions,
    content: value || "",
    contentType: "markdown",
    autofocus: "end",
    editorProps: {
      attributes: {
        class: "mde__prose",
        "aria-label": "Editor visual de descricao",
        spellcheck: "false",
      },
    },
    onCreate: ({ editor: instance }) => {
      updateActiveState(instance);
      queueMicrotask(() => instance.commands.focus("end"));
    },
    onUpdate: ({ editor: instance }) => updateActiveState(instance),
    onSelectionUpdate: ({ editor: instance }) => updateActiveState(instance),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getMarkdown();
    if ((value || "").trim() !== current.trim()) {
      editor.commands.setContent(value || "", { contentType: "markdown" });
    }
  }, [editor, value]);

  const updateActiveState = (instance = editor) => {
    if (!instance) return;
    setActive({
      bold: instance.isActive("bold"),
      italic: instance.isActive("italic"),
      strike: instance.isActive("strike"),
      highlight: instance.isActive("highlight"),
      bulletList: instance.isActive("bulletList"),
      orderedList: instance.isActive("orderedList"),
      blockquote: instance.isActive("blockquote"),
      h1: instance.isActive("heading", { level: 1 }),
      h2: instance.isActive("heading", { level: 2 }),
      h3: instance.isActive("heading", { level: 3 }),
    });
  };

  const run = (command) => {
    if (!editor) return;
    command(editor.chain().focus()).run();
    updateActiveState(editor);
  };

  const save = () => {
    if (!editor) return;
    onSave(editor.getMarkdown().trim());
  };

  const onKeyDown = (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === "Enter") {
      event.preventDefault();
      save();
    }
  };

  return (
    <div className="mde" onKeyDown={onKeyDown}>
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
          title="Italico"
          active={active.italic}
          onClick={() => run((chain) => chain.toggleItalic())}
        >
          <Italic size={15} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Tachado"
          active={active.strike}
          onClick={() => run((chain) => chain.toggleStrike())}
        >
          <Strikethrough size={15} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Destaque"
          active={active.highlight}
          onClick={() => run((chain) => chain.toggleHighlight())}
        >
          <Highlighter size={15} strokeWidth={2.4} />
        </ToolbarButton>

        <span className="mde__sep" aria-hidden="true" />

        <ToolbarButton
          title="Titulo grande"
          active={active.h1}
          onClick={() => run((chain) => chain.toggleHeading({ level: 1 }))}
        >
          <Heading1 size={16} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Titulo medio"
          active={active.h2}
          onClick={() => run((chain) => chain.toggleHeading({ level: 2 }))}
        >
          <Heading2 size={16} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Titulo pequeno"
          active={active.h3}
          onClick={() => run((chain) => chain.toggleHeading({ level: 3 }))}
        >
          <Heading3 size={16} strokeWidth={2.4} />
        </ToolbarButton>

        <span className="mde__sep" aria-hidden="true" />

        <ToolbarButton
          title="Lista"
          active={active.bulletList}
          onClick={() => run((chain) => chain.toggleBulletList())}
        >
          <List size={15} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerada"
          active={active.orderedList}
          onClick={() => run((chain) => chain.toggleOrderedList())}
        >
          <ListOrdered size={15} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Citacao"
          active={active.blockquote}
          onClick={() => run((chain) => chain.toggleBlockquote())}
        >
          <Quote size={15} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Linha horizontal"
          onClick={() => run((chain) => chain.setHorizontalRule())}
        >
          <Minus size={15} strokeWidth={2.4} />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} className="mde__editor" />

      <div className="mde__actions">
        <button type="button" className="mde__save" onClick={save}>
          Salvar
        </button>
        <button type="button" className="mde__cancel" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
