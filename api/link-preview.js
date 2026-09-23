// Previa de link (Vercel Function). GET /api/link-preview?url=https://...
// Busca o HTML no servidor (o navegador nao pode por causa de CORS) e extrai
// os metadados Open Graph / Twitter. Protecoes: so http(s), bloqueia hosts
// internos (tambem a cada redirect), timeout, limite de tamanho e cache na CDN.
// Tambem e usada no dev pelo plugin do vite.config.js (mesma assinatura).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
// UA de "robo de previa": Instagram, X e afins so entregam og:* para ele.
const USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function isPrivateIp(ip) {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
    return (
      v6 === "::" ||
      v6 === "::1" ||
      v6.startsWith("fc") ||
      v6.startsWith("fd") ||
      v6.startsWith("fe80")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid-url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("blocked-host");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some(({ address }) => isPrivateIp(address))) {
    throw new Error("blocked-host");
  }
  return url;
}

async function fetchHtml(startUrl, signal) {
  let url = await assertPublicUrl(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location"), url).href);
      continue;
    }
    if (!res.ok) throw new Error(`upstream-${res.status}`);
    const type = res.headers.get("content-type") || "";
    if (!type.includes("html")) return { url, html: "" };

    // Le no maximo MAX_BYTES: os metadados ficam no <head>.
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const charset = /charset=([\w-]+)/i.exec(type)?.[1] || "utf-8";
    let decoder;
    try {
      decoder = new TextDecoder(charset);
    } catch {
      decoder = new TextDecoder("utf-8");
    }
    return { url, html: decoder.decode(Buffer.concat(chunks)) };
  }
  throw new Error("too-many-redirects");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function parseAttrs(tag) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return attrs;
}

function extractMeta(html, baseUrl) {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html;
  const meta = {};
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = attrs.content.trim();
  }
  let icon = "";
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag);
    if (/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(attrs.rel || "") && attrs.href) {
      icon = attrs.href;
      if (/apple-touch-icon/i.test(attrs.rel)) break;
    }
  }
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1];
  const absolute = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value, baseUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const clip = (value, max) => {
    const text = (value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  return {
    title: clip(meta["og:title"] || meta["twitter:title"] || decodeEntities(titleTag || ""), 200),
    description: clip(
      meta["og:description"] || meta["twitter:description"] || meta.description,
      300,
    ),
    image: absolute(meta["og:image"] || meta["og:image:url"] || meta["twitter:image"]),
    siteName: clip(meta["og:site_name"], 80),
    favicon: absolute(icon || "/favicon.ico"),
  };
}

function send(res, status, body, cacheSeconds) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader(
    "cache-control",
    cacheSeconds
      ? `public, max-age=3600, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`
      : "no-store",
  );
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method-not-allowed" });
  const target = new URL(req.url, "http://localhost").searchParams.get("url");
  if (!target || target.length > 2048) return send(res, 400, { error: "invalid-url" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { url, html } = await fetchHtml(target, controller.signal);
    const data = extractMeta(html, url);
    return send(res, 200, { url: target, ...data }, 86400);
  } catch (err) {
    const code = err?.name === "AbortError" ? "timeout" : err?.message || "failed";
    const status = code === "invalid-url" || code === "blocked-host" ? 400 : 502;
    return send(res, status, { error: code });
  } finally {
    clearTimeout(timer);
  }
}
