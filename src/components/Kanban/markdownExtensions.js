import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { defaultUrlTransform } from "react-markdown";

// Imagem enviada vira anexo privado; no Markdown ela e referenciada por id
// (`attachment:<uuid>`), nunca por URL assinada (que expira).
export const ATTACHMENT_SCHEME = "attachment:";

export const attachmentIdFromSrc = (src) =>
  typeof src === "string" && src.startsWith(ATTACHMENT_SCHEME)
    ? src.slice(ATTACHMENT_SCHEME.length)
    : null;

export const markdownUrlTransform = (url) =>
  url?.startsWith(ATTACHMENT_SCHEME) ? url : defaultUrlTransform(url);

// Mesma lista de extensoes para o editor real e para os fixtures de ida e
// volta: o que o teste valida e exatamente o que o usuario edita.
export function descriptionExtensions({ placeholder, imageNodeView } = {}) {
  const image = imageNodeView
    ? Image.extend({ addNodeView: () => ReactNodeViewRenderer(imageNodeView) })
    : Image;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
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
    image.configure({ inline: false, allowBase64: false }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    Markdown.configure({ markedOptions: { gfm: true } }),
  ];
}

export function normalizeUrl(raw, { allowMailto = true } = {}) {
  const value = (raw || "").trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    const allowed = allowMailto ? ["http:", "https:", "mailto:"] : ["http:", "https:"];
    if (!allowed.includes(url.protocol)) return null;
    if (url.protocol !== "mailto:" && !url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}
