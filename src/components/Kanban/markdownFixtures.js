import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "@tiptap/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { descriptionExtensions, markdownUrlTransform } from "./markdownExtensions.js";

// Ida e volta Tiptap -> Markdown -> ReactMarkdown. Cada fixture e carregado no
// editor (mesmas extensoes do app), serializado de volta e os dois Markdown
// sao renderizados: o HTML precisa ser identico (mesma hierarquia de blocos).
// Uso (dev): (await import('/src/components/Kanban/markdownFixtures.js')).runMarkdownRoundtrip()
export const MARKDOWN_FIXTURES = {
  titulos: "# Titulo 1\n\n## Titulo 2\n\n### Titulo 3\n\nParagrafo.",
  paragrafos: "Primeira linha.\n\nSegunda linha com **negrito** e *italico*.",
  citacao: "> Uma citacao simples.",
  listaNaCitacao: "> Antes da lista:\n>\n> - item um\n> - item dois",
  separador: "Antes\n\n---\n\nDepois",
  listas: "- a\n- b\n  - b1\n\n1. um\n2. dois",
  link: "Veja [o site](https://example.com) agora.",
  imagemUrl: "![Logo](https://example.com/logo.png)",
  imagemAnexo: "![Foto](attachment:9f1c2d7e-1111-4222-8333-944455556666)",
  referenciaCanonica:
    "# O QUE E O FORMATO?\n\nTela dividida e quando o video aparece em duas partes.\n\n## AS VARIACOES\n\nVoce pode:\n\n- **Analisar** alguma coisa.\n- **Usar imagens** pra ilustrar.\n- **Narrar** a cena.",
};

const render = (markdown) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm], urlTransform: markdownUrlTransform },
      markdown
    )
  );

export function runMarkdownRoundtrip(fixtures = MARKDOWN_FIXTURES) {
  const results = Object.entries(fixtures).map(([name, source]) => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: descriptionExtensions(),
      content: source,
      contentType: "markdown",
    });
    const output = editor.getMarkdown().trim();
    editor.destroy();
    const ok = render(source) === render(output);
    return { name, ok, ...(ok ? {} : { source, output }) };
  });
  const failed = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed };
}
