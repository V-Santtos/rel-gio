import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Popover from "./Popover.jsx";
import { ImageNodeView } from "./DescriptionImage.jsx";
import { descriptionExtensions, normalizeUrl } from "./markdownExtensions.js";
import { IMAGE_TYPES, validateAttachmentFile } from "./attachments.js";
import { MenuItem, MenuList } from "../MenuList.jsx";
import {
  Bold,
  Italic,
  ChevronDown,
  Plus,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Image as ImageIcon,
  Upload,
} from "lucide-react";

const editorPlaceholder = "Adicione uma descrição mais detalhada…";
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

function ToolbarButton({ active, title, children, onClick, buttonRef, expanded }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`mde__btn${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Escape dentro do dialogo fecha SO o dialogo (nao a edicao nem o modal).
const stopEscape = (onClose) => (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  onClose();
};

function LinkDialog({ anchorRef, initialText, onInsert, onClose }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState(initialText || "");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const href = normalizeUrl(url);
    if (!href) {
      setError("Informe um endereço válido (ex.: https://site.com).");
      return;
    }
    onInsert({ href, text: text.trim() });
  };

  return (
    <Popover anchorRef={anchorRef} width={300} className="kpop--mde" onClose={onClose}>
      <form className="mdedlg" onSubmit={submit} onKeyDown={stopEscape(onClose)}>
        <p className="kpop__title">Link</p>
        <label className="mdedlg__field">
          <span>URL</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            placeholder="https://…"
            aria-invalid={!!error}
            autoFocus
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
          />
        </label>
        <label className="mdedlg__field">
          <span>Texto de exibição (opcional)</span>
          <input
            type="text"
            autoComplete="off"
            value={text}
            placeholder="Texto do link"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {error ? (
          <p className="coverpop__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mdedlg__actions">
          <button type="button" className="mdedlg__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="mdedlg__submit">
            Inserir
          </button>
        </div>
      </form>
    </Popover>
  );
}

function ImageDialog({ anchorRef, canUpload, onUpload, onInsert, onClose }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const pickFile = async (file) => {
    if (!file) return;
    const invalid = validateAttachmentFile(file, { imagesOnly: true });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setUploading(true);
    try {
      const att = await onUpload(file);
      onInsert({
        src: `attachment:${att.id}`,
        alt: alt.trim() || att.name.replace(/\.[^.]+$/, ""),
      });
    } catch (err) {
      setError(err.message || "Não consegui enviar a imagem.");
      setUploading(false);
    }
  };

  const submitUrl = (event) => {
    event.preventDefault();
    const src = normalizeUrl(url, { allowMailto: false });
    if (!src) {
      setError("Informe o endereço de uma imagem (https://…).");
      return;
    }
    onInsert({ src, alt: alt.trim() });
  };

  return (
    <Popover anchorRef={anchorRef} width={300} className="kpop--mde" onClose={onClose}>
      <form className="mdedlg" onSubmit={submitUrl} onKeyDown={stopEscape(onClose)}>
        <p className="kpop__title">Imagem</p>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={(event) => {
            pickFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="coverpop__upload"
          disabled={!canUpload || uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} strokeWidth={2.3} aria-hidden="true" />
          <span>{uploading ? "Enviando…" : "Enviar do computador"}</span>
        </button>
        {!canUpload ? (
          <p className="kpop__empty">Entre na sua conta para enviar imagens.</p>
        ) : null}
        <p className="mdedlg__or">ou</p>
        <label className="mdedlg__field">
          <span>URL da imagem</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            placeholder="https://…"
            aria-invalid={!!error}
            autoFocus
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
          />
        </label>
        <label className="mdedlg__field">
          <span>Descrição da imagem (opcional)</span>
          <input
            type="text"
            autoComplete="off"
            value={alt}
            placeholder="Texto alternativo"
            onChange={(event) => setAlt(event.target.value)}
          />
        </label>
        {error ? (
          <p className="coverpop__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mdedlg__actions">
          <button type="button" className="mdedlg__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="mdedlg__submit" disabled={uploading}>
            Inserir URL
          </button>
        </div>
      </form>
    </Popover>
  );
}

// Editor de descricao. Barra: Titulo, Negrito, Italico e o menu + (Link e
// Imagem). O resto do markdown segue funcionando digitando na mao (input rules).
// Sem Salvar/Cancelar: grava ao vivo via onChange; sai da edicao no blur —
// exceto enquanto um dialogo de link/imagem esta aberto.
export default function MarkdownEditor({ value, onChange, onBlur, canUpload = false, onUploadImage }) {
  const [active, setActive] = useState({});
  const [headingOpen, setHeadingOpen] = useState(false);
  const [insertMenu, setInsertMenu] = useState(null); // null | "menu" | "link" | "image"
  const [listOpen, setListOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [attachError, setAttachError] = useState("");
  const [attaching, setAttaching] = useState(false);
  const headingBtnRef = useRef(null);
  const listBtnRef = useRef(null);
  const plusBtnRef = useRef(null);
  const attachInputRef = useRef(null);
  const dialogOpenRef = useRef(false);
  // O seletor de arquivos do SO tira o foco do editor: nao sair da edicao.
  // Os menus tambem recebem foco (navegacao por teclado).
  dialogOpenRef.current = insertMenu !== null || attaching || headingOpen || listOpen;
  const openInsertRef = useRef(null);

  const extensions = useMemo(
    () => descriptionExtensions({ placeholder: editorPlaceholder, imageNodeView: ImageNodeView }),
    []
  );

  const updateActiveState = (instance) => {
    if (!instance) return;
    setActive({
      bold: instance.isActive("bold"),
      italic: instance.isActive("italic"),
      heading: instance.isActive("heading"),
      level: HEADING_LEVELS.find((level) => instance.isActive("heading", { level })) || 0,
      bulletList: instance.isActive("bulletList"),
      orderedList: instance.isActive("orderedList"),
    });
  };

  const editor = useEditor({
    extensions,
    content: value || "",
    contentType: "markdown",
    // Sem autofocus automatico: ele rola ate o cursor. Ao abrir a edicao nada
    // acima pode se mover — o foco vai pro fim SEM scroll (onCreate).
    autofocus: false,
    editorProps: {
      attributes: {
        class: "mde__prose",
        "aria-label": "Editor de descricao",
        spellcheck: "false",
      },
      // Ctrl/Cmd+K abre o dialogo de link (como no Trello).
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openInsertRef.current?.("link");
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: instance }) => {
      updateActiveState(instance);
      queueMicrotask(() => instance.commands.focus("end", { scrollIntoView: false }));
    },
    onUpdate: ({ editor: instance }) => {
      updateActiveState(instance);
      onChange?.(instance.getMarkdown().trim());
    },
    onSelectionUpdate: ({ editor: instance }) => updateActiveState(instance),
    onBlur: () => {
      if (!dialogOpenRef.current) onBlur?.();
    },
  });

  useEffect(() => {
    const input = attachInputRef.current;
    if (!input) return undefined;
    const onCancel = () => {
      setAttaching(false);
      editor?.commands.focus();
    };
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, [editor]);

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

  // Posicao do cursor no momento em que o menu + abriu: os dialogos tiram o
  // foco do editor, entao a insercao volta explicitamente para ela.
  const savedRange = useRef(null);
  const openInsertMenu = (target = "menu") => {
    if (insertMenu && target === "menu") {
      setInsertMenu(null);
      return;
    }
    if (editor) {
      const { from, to } = editor.state.selection;
      savedRange.current = { from, to };
      if (target === "link") setLinkText(editor.state.doc.textBetween(from, to, " "));
    }
    setInsertMenu(target);
  };
  openInsertRef.current = openInsertMenu;

  const closeMenu = (setOpen) => () => {
    setOpen(false);
    editor?.commands.focus();
  };
  const applyAndClose = (setOpen, command) => () => {
    run(command);
    setOpen(false);
  };
  const chainAtSaved = () => {
    const chain = editor.chain().focus();
    return savedRange.current ? chain.setTextSelection(savedRange.current) : chain;
  };

  const closeDialog = () => {
    setInsertMenu(null);
    if (editor && savedRange.current) {
      editor.chain().focus().setTextSelection(savedRange.current).run();
    } else {
      editor?.commands.focus();
    }
  };

  const openLink = () => {
    if (editor && savedRange.current) {
      const { from, to } = savedRange.current;
      setLinkText(editor.state.doc.textBetween(from, to, " "));
    }
    setInsertMenu("link");
  };

  const insertLink = ({ href, text }) => {
    if (!editor) return;
    const range = savedRange.current;
    const empty = !range || range.from === range.to;
    const chain = chainAtSaved();
    if (!text && !empty) {
      chain.extendMarkRange("link").setLink({ href }).run();
    } else {
      chain
        .insertContent([
          { type: "text", text: text || href, marks: [{ type: "link", attrs: { href } }] },
          { type: "text", text: " " },
        ])
        .run();
    }
    savedRange.current = null;
    setInsertMenu(null);
  };

  const insertImage = ({ src, alt }) => {
    if (!editor) return;
    chainAtSaved().setImage({ src, alt: alt || null }).run();
    savedRange.current = null;
    setInsertMenu(null);
  };

  // Clipe: envia uma imagem como anexo e ja insere no texto.
  const attachImage = async (file) => {
    if (!file) {
      setAttaching(false);
      editor?.commands.focus();
      return;
    }
    const invalid = validateAttachmentFile(file, { imagesOnly: true });
    if (invalid) {
      setAttachError(invalid);
      setAttaching(false);
      editor?.commands.focus();
      return;
    }
    setAttachError("");
    try {
      const att = await onUploadImage(file);
      insertImage({ src: `attachment:${att.id}`, alt: att.name.replace(/\.[^.]+$/, "") });
    } catch (err) {
      setAttachError(err.message || "Não consegui enviar a imagem.");
      editor?.commands.focus();
    } finally {
      setAttaching(false);
    }
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
            title="Estilo do texto"
            aria-label="Estilo do texto"
            aria-haspopup="menu"
            aria-expanded={headingOpen}
            onClick={() => setHeadingOpen((v) => !v)}
          >
            <span className="mde__tt" aria-hidden="true">
              Tt
            </span>
            <ChevronDown size={11} strokeWidth={2.4} />
          </button>
          {headingOpen ? (
            <Popover
              anchorRef={headingBtnRef}
              onClose={closeMenu(setHeadingOpen)}
              width={264}
              className="kpop--mlist"
            >
              <MenuList label="Estilo do texto" onClose={closeMenu(setHeadingOpen)}>
                <MenuItem
                  label="Texto normal"
                  shortcut="Mod-Alt-0"
                  checked={!active.heading}
                  onSelect={applyAndClose(setHeadingOpen, (chain) => chain.setParagraph())}
                />
                {HEADING_LEVELS.map((level) => (
                  <MenuItem
                    key={level}
                    label={`Título ${level}`}
                    labelClassName={`mlist__label--h${level}`}
                    shortcut={`Mod-Alt-${level}`}
                    checked={active.level === level}
                    onSelect={applyAndClose(setHeadingOpen, (chain) =>
                      chain.setHeading({ level })
                    )}
                  />
                ))}
              </MenuList>
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
        <span className="mde__sep" aria-hidden="true" />
        <button
          type="button"
          ref={listBtnRef}
          className={`mde__btn mde__btn--heading${
            active.bulletList || active.orderedList ? " is-active" : ""
          }${listOpen ? " is-open" : ""}`}
          title="Listas"
          aria-label="Listas"
          aria-haspopup="menu"
          aria-expanded={listOpen}
          onClick={() => setListOpen((v) => !v)}
        >
          {active.orderedList ? (
            <ListOrdered size={16} strokeWidth={2.3} />
          ) : (
            <List size={16} strokeWidth={2.3} />
          )}
          <ChevronDown size={11} strokeWidth={2.4} />
        </button>
        {listOpen ? (
          <Popover
            anchorRef={listBtnRef}
            onClose={closeMenu(setListOpen)}
            width={264}
            className="kpop--mlist"
          >
            <MenuList label="Listas" onClose={closeMenu(setListOpen)}>
              <MenuItem
                icon={<List size={16} strokeWidth={2.3} />}
                label="Lista com marcadores"
                shortcut="Mod-Shift-8"
                checked={!!active.bulletList}
                onSelect={applyAndClose(setListOpen, (chain) => chain.toggleBulletList())}
              />
              <MenuItem
                icon={<ListOrdered size={16} strokeWidth={2.3} />}
                label="Lista numerada"
                shortcut="Mod-Shift-7"
                checked={!!active.orderedList}
                onSelect={applyAndClose(setListOpen, (chain) => chain.toggleOrderedList())}
              />
            </MenuList>
          </Popover>
        ) : null}
        <span className="mde__sep" aria-hidden="true" />
        <button
          type="button"
          ref={plusBtnRef}
          className={`mde__btn mde__btn--heading${insertMenu !== null ? " is-open" : ""}`}
          title="Inserir"
          aria-label="Inserir link ou imagem"
          aria-haspopup="menu"
          aria-expanded={insertMenu === "menu"}
          onClick={() => openInsertMenu("menu")}
        >
          <Plus size={16} strokeWidth={2.4} />
          <ChevronDown size={11} strokeWidth={2.4} />
        </button>
        <span className="mde__spacer" aria-hidden="true" />
        <input
          ref={attachInputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={(event) => {
            attachImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <ToolbarButton
          title={canUpload ? "Anexar imagem" : "Entre na sua conta para anexar"}
          onClick={() => {
            if (!canUpload || !onUploadImage) return;
            if (editor) {
              const { from, to } = editor.state.selection;
              savedRange.current = { from, to };
            }
            setAttaching(true);
            attachInputRef.current?.click();
          }}
        >
          <Paperclip size={15} strokeWidth={2.3} />
        </ToolbarButton>
      </div>
      {attachError ? (
        <p className="mde__error" role="alert">
          {attachError}
        </p>
      ) : null}

      {insertMenu === "menu" ? (
        <Popover anchorRef={plusBtnRef} width={300} className="kpop--mlist" onClose={closeDialog}>
          <MenuList label="Inserir" onClose={closeDialog}>
            <MenuItem
              icon={<Link2 size={18} strokeWidth={2.2} />}
              label="Link"
              description="Insira um link"
              shortcut="Mod-K"
              onSelect={openLink}
            />
            <MenuItem
              icon={<ImageIcon size={18} strokeWidth={2.2} />}
              label="Imagem"
              description="Envie do computador ou use uma URL"
              onSelect={() => setInsertMenu("image")}
            />
          </MenuList>
        </Popover>
      ) : null}
      {insertMenu === "link" ? (
        <LinkDialog
          anchorRef={plusBtnRef}
          initialText={linkText}
          onInsert={insertLink}
          onClose={closeDialog}
        />
      ) : null}
      {insertMenu === "image" ? (
        <ImageDialog
          anchorRef={plusBtnRef}
          canUpload={canUpload && !!onUploadImage}
          onUpload={onUploadImage}
          onInsert={insertImage}
          onClose={closeDialog}
        />
      ) : null}

      <EditorContent editor={editor} className="mde__editor" />
    </div>
  );
}
