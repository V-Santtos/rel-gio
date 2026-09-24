// Gera os icones do PWA/iOS: fundo SOLIDO #101010 (BG do app) + F branco
// centralizado. iOS NAO aceita SVG como apple-touch-icon -> precisa de PNG opaco.
//   - Todos FULL-BLEED (sem cantos arredondados): o proprio SO recorta.
//   - apple-touch-icon / pwa-192/512 ("any"): F ocupa ~56% do quadrado.
//   - pwa-maskable-192/512: F menor (~46%) para caber na safe zone (circulo 80%).
//   - public/icon.svg: mesmo desenho do "any".
// Rodar a partir da raiz do projeto: node scripts/gen-icons.mjs
// Depois de trocar o icone no iPhone: apagar e reinstalar o PWA (iOS faz cache).
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const pub = join(process.cwd(), "public");
const BG = "#101010";

// Desenho do F (viewBox original 34 31 77 77).
const F = `
    <path d="M34 61C34 52.4 34.9 46.3 36.9 41.8C40.4 34.2 46.3 31 53.3 31H111C110.1 39.7 105.4 45.9 97.6 48.3C97 48.5 96.1 48.6 95.1 48.6H50.8C43.8 48.6 37.5 53.2 34 61Z"/>
    <path d="M34 82.6C34 72.8 36.5 64.3 42.8 58.3C46.2 55.1 50.3 54 55 54H82C80.8 62.3 75.1 68.9 66.4 71.1C65.3 71.4 64.3 71.5 63.1 71.5H47.2C41.1 71.5 36.4 76.1 34 82.6Z"/>
    <path d="M34 108V92.4C34 84.8 40.9 77.7 49.2 76.2C50.1 76.1 50.8 76 52 76V91.5C52 99.6 44.9 106.5 36.7 107.8C35.8 107.9 34.9 108 34 108Z"/>`;

// ratio = lado do F / lado do icone.
function svg(ratio) {
  const size = 512;
  const s = (size * ratio) / 77;
  const off = (size - 77 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(${off} ${off}) scale(${s}) translate(-34 -31)" fill="#ffffff">${F}
  </g>
</svg>
`;
}

const normal = svg(0.56);
const maskable = svg(0.46);

writeFileSync(join(pub, "icon.svg"), normal);

const jobs = [
  ["apple-touch-icon.png", normal, 180],
  ["pwa-192.png", normal, 192],
  ["pwa-512.png", normal, 512],
  ["pwa-maskable-192.png", maskable, 192],
  ["pwa-maskable-512.png", maskable, 512],
];

for (const [out, src, size] of jobs) {
  await sharp(Buffer.from(src), { density: 300 })
    .resize(size, size)
    .flatten({ background: BG })
    .png()
    .toFile(join(pub, out));
  console.log("ok", out, size);
}
