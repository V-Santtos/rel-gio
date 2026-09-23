// Link de rede social ganha o logo da rede na frente (descricao do cartao,
// leitura e editor). Logos em SVG local via data URI: aparecem na hora, sem
// rede, e cada <img> e um documento isolado (sem conflito de id de gradiente).
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const TIKTOK_PATH =
  "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z";
const X_PATH =
  "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z";
const PHONE_PATH =
  "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z";

// Fundo preto ganha um aro claro para nao sumir no tema escuro.
const DARK_TILE =
  '<rect x=".4" y=".4" width="23.2" height="23.2" rx="6" fill="#000" stroke="#fff" stroke-opacity=".28" stroke-width=".8"/>';

const ICONS = {
  instagram:
    '<defs><radialGradient id="g" cx=".3" cy="1.07" r="1.2"><stop offset=".08" stop-color="#fdf497"/><stop offset=".45" stop-color="#fd5949"/><stop offset=".6" stop-color="#d6249f"/><stop offset=".9" stop-color="#285aeb"/></radialGradient></defs>' +
    '<rect width="24" height="24" rx="6" fill="url(#g)"/>' +
    '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/>' +
    '<circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="1.8"/>' +
    '<circle cx="16.1" cy="7.9" r="1.05" fill="#fff"/>',
  youtube:
    '<rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#f00"/><path d="M10 8.8v6.4l5.6-3.2z" fill="#fff"/>',
  tiktok:
    DARK_TILE +
    `<g transform="translate(4.6 4.8) scale(.6)"><path d="${TIKTOK_PATH}" fill="#25f4ee"/></g>` +
    `<g transform="translate(5.2 5.2) scale(.6)"><path d="${TIKTOK_PATH}" fill="#fe2c55"/></g>` +
    `<g transform="translate(4.9 5) scale(.6)"><path d="${TIKTOK_PATH}" fill="#fff"/></g>`,
  x: DARK_TILE + `<g transform="translate(5.5 5.5) scale(.54)"><path d="${X_PATH}" fill="#fff"/></g>`,
  facebook:
    '<circle cx="12" cy="12" r="12" fill="#1877f2"/>' +
    '<path d="M13.4 24v-8.4h2.8l.45-3.3H13.4v-2.1c0-.95.27-1.6 1.63-1.6h1.74V5.65c-.3-.04-1.33-.13-2.53-.13-2.5 0-4.22 1.53-4.22 4.34v2.44H7.2v3.3h2.82V24z" fill="#fff"/>',
  linkedin:
    '<rect width="24" height="24" rx="5" fill="#0a66c2"/><circle cx="7.1" cy="7" r="1.7" fill="#fff"/>' +
    '<rect x="5.6" y="9.6" width="3" height="8.8" fill="#fff"/>' +
    '<path d="M10.6 9.6h2.9v1.3c.45-.8 1.5-1.55 3-1.55 3 0 3.6 1.9 3.6 4.4v4.65h-3v-4.1c0-1-.02-2.3-1.45-2.3s-1.65 1.1-1.65 2.2v4.2h-3z" fill="#fff"/>',
  threads:
    DARK_TILE +
    '<text x="12" y="17" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" fill="#fff">@</text>',
  pinterest:
    '<circle cx="12" cy="12" r="12" fill="#e60023"/>' +
    '<text x="12.3" y="18.2" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="700" fill="#fff">P</text>',
  whatsapp:
    '<circle cx="12" cy="12" r="12" fill="#25d366"/>' +
    '<path d="M12 5.2a6.8 6.8 0 0 0-5.9 10.2l-.9 3.4 3.5-.9A6.8 6.8 0 1 0 12 5.2z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
    `<g transform="translate(8.6 8.6) scale(.29)"><path d="${PHONE_PATH}" fill="#fff"/></g>`,
  spotify:
    '<circle cx="12" cy="12" r="12" fill="#1db954"/>' +
    '<path d="M6.5 9.3c3.8-1.1 7.9-.8 11.2 1.1M7.2 12.5c3.1-.9 6.4-.6 9.1.9M7.8 15.4c2.5-.7 5-.5 7.1.7" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/>',
};

const NETWORKS = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { key: "x", label: "X", hosts: ["x.com", "twitter.com", "t.co"] },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.watch"] },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"] },
  { key: "threads", label: "Threads", hosts: ["threads.net", "threads.com"] },
  { key: "pinterest", label: "Pinterest", hosts: ["pinterest.com", "pinterest.com.br", "pin.it"] },
  { key: "whatsapp", label: "WhatsApp", hosts: ["whatsapp.com", "wa.me"] },
  { key: "spotify", label: "Spotify", hosts: ["spotify.com", "spoti.fi"] },
];

const iconSrc = Object.fromEntries(
  Object.entries(ICONS).map(([key, body]) => [
    key,
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`,
    )}`,
  ]),
);

/** Rede social do link ({ key, label, icon }) ou null. */
export function socialNetworkOf(href) {
  let host;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
  const network = NETWORKS.find(({ hosts }) =>
    hosts.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  );
  return network ? { key: network.key, label: network.label, icon: iconSrc[network.key] } : null;
}

export function socialIconElement(network) {
  const img = document.createElement("img");
  img.className = "mdlink__icon";
  img.src = network.icon;
  img.alt = "";
  img.title = network.label;
  img.draggable = false;
  img.setAttribute("contenteditable", "false");
  return img;
}

function socialDecorations(doc) {
  const decorations = [];
  let lastEnd = -1;
  let lastHref = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const href = node.marks.find((mark) => mark.type.name === "link")?.attrs.href;
    // Link continuo (varios nos de texto, ex.: parte em negrito) = 1 icone so.
    const continues = href && pos === lastEnd && href === lastHref;
    lastEnd = pos + node.nodeSize;
    lastHref = href || null;
    if (!href || continues) return;
    const network = socialNetworkOf(href);
    if (!network) return;
    decorations.push(
      Decoration.widget(pos, () => socialIconElement(network), {
        side: -1,
        key: `social-${network.key}`,
        ignoreSelection: true,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

/** Editor: logo da rede social antes de cada link de rede social. */
export const SocialLinkIcons = Extension.create({
  name: "socialLinkIcons",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("socialLinkIcons"),
        props: { decorations: (state) => socialDecorations(state.doc) },
      }),
    ];
  },
});
