// Previa de link na descricao (estilo Trello): um link SOZINHO na linha, cujo
// texto e a propria URL, vira cartao. Link com texto proprio ou no meio de uma
// frase continua link normal. Os metadados vem de /api/link-preview.

const STORAGE_KEY = "fluxtime.linkpreview.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

const inflight = new Map();

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    const entries = Object.entries(store)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Sem storage (aba privada / cota): segue so com o cache em memoria.
  }
}

export function cachedLinkPreview(url) {
  const hit = readStore()[url];
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : null;
}

/** Resolve os metadados ou `null` (falha vira fallback de link simples). */
export function fetchLinkPreview(url) {
  const cached = cachedLinkPreview(url);
  if (cached) return Promise.resolve(cached);
  if (inflight.has(url)) return inflight.get(url);

  const request = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || (!data.title && !data.image)) return null;
      const store = readStore();
      store[url] = { at: Date.now(), data };
      writeStore(store);
      return data;
    })
    .catch(() => null);
  inflight.set(url, request);
  return request;
}

const normalizeUrl = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

const isBlank = (node) => node.type === "text" && !node.value.trim();

const textOf = (node) =>
  node.type === "text" ? node.value : (node.children || []).map(textOf).join("");

function previewHref(line) {
  const nodes = line.filter((node) => !isBlank(node));
  if (nodes.length !== 1) return null;
  const [node] = nodes;
  if (node.type !== "element" || node.tagName !== "a") return null;
  const href = String(node.properties?.href || "");
  if (!/^https?:\/\//i.test(href)) return null;
  return normalizeUrl(textOf(node)) === normalizeUrl(href) ? href : null;
}

const BR = { type: "element", tagName: "br", properties: {}, children: [] };

// Remonta um <p> com as linhas restantes, preservando o tipo de quebra
// original (<br> = quebra forte; "\n" = quebra simples do Markdown).
function paragraphOf(lines) {
  while (lines.length && lines[0].nodes.every(isBlank)) lines.shift();
  while (lines.length && lines[lines.length - 1].nodes.every(isBlank)) lines.pop();
  if (!lines.length) return [];
  const children = lines.flatMap(({ sep, nodes }, i) => {
    if (i === 0) return nodes;
    return [sep === "br" ? BR : { type: "text", value: "\n" }, ...nodes];
  });
  return [{ type: "element", tagName: "p", properties: {}, children }];
}

// Quebra o <p> em linhas (<br> e "\n") e troca cada linha "so link" por <linkpreview>.
function splitParagraph(p) {
  const lines = [{ sep: null, nodes: [] }];
  const current = () => lines[lines.length - 1].nodes;
  for (const child of p.children) {
    if (child.type === "element" && child.tagName === "br") {
      lines.push({ sep: "br", nodes: [] });
    } else if (child.type === "text" && child.value.includes("\n")) {
      child.value.split("\n").forEach((value, i) => {
        if (i > 0) lines.push({ sep: "soft", nodes: [] });
        if (value) current().push({ type: "text", value });
      });
    } else {
      current().push(child);
    }
  }
  if (!lines.some((line) => previewHref(line.nodes))) return [p];

  const out = [];
  let pending = [];
  for (const line of lines) {
    const href = previewHref(line.nodes);
    if (!href) {
      pending.push(line);
      continue;
    }
    out.push(...paragraphOf(pending));
    pending = [];
    out.push({ type: "element", tagName: "linkpreview", properties: { href }, children: [] });
  }
  out.push(...paragraphOf(pending));
  return out;
}

export function rehypeLinkPreview() {
  const walk = (node) => {
    if (!Array.isArray(node.children)) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === "element" && child.tagName === "p") return splitParagraph(child);
      walk(child);
      return child;
    });
  };
  return walk;
}
