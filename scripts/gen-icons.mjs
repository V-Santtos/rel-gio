// Gera os PNGs de icone a partir do mesmo desenho do public/icon.svg.
// iOS NAO aceita SVG como apple-touch-icon -> precisa de PNG opaco.
//   - apple-touch-icon.png (180) e os maskable: FULL-BLEED (sem cantos
//     arredondados); o proprio SO faz o recorte/arredondamento.
//   - pwa-192/512 "any": versao arredondada (formato de app onde nao ha mascara).
// Rodar a partir da raiz do projeto: node scripts/gen-icons.mjs
import sharp from "sharp";
import { join } from "node:path";

const pub = join(process.cwd(), "public");

const F = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f0726a"/>
      <stop offset="1" stop-color="#8c2f33"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="RX" fill="url(#bg)"/>
  <g transform="translate(146 146) scale(2.65)" fill="#ffffff">
    <path d="M34 61C34 52.4 34.9 46.3 36.9 41.8C40.4 34.2 46.3 31 53.3 31H111C110.1 39.7 105.4 45.9 97.6 48.3C97 48.5 96.1 48.6 95.1 48.6H50.8C43.8 48.6 37.5 53.2 34 61Z" transform="translate(-34 -31)"/>
    <path d="M34 82.6C34 72.8 36.5 64.3 42.8 58.3C46.2 55.1 50.3 54 55 54H82C80.8 62.3 75.1 68.9 66.4 71.1C65.3 71.4 64.3 71.5 63.1 71.5H47.2C41.1 71.5 36.4 76.1 34 82.6Z" transform="translate(-34 -31)"/>
    <path d="M34 108V92.4C34 84.8 40.9 77.7 49.2 76.2C50.1 76.1 50.8 76 52 76V91.5C52 99.6 44.9 106.5 36.7 107.8C35.8 107.9 34.9 108 34 108Z" transform="translate(-34 -31)"/>
  </g>`;

const svg = (rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">${F.replace(
    "RX",
    String(rx)
  )}</svg>`;

const fullBleed = Buffer.from(svg(0));
const rounded = Buffer.from(svg(112));

const jobs = [
  // iOS: opaco, full-bleed, 180. O iOS arredonda sozinho.
  { src: fullBleed, size: 180, out: "apple-touch-icon.png", flatten: "#8c2f33" },
  // Android maskable: full-bleed (o launcher aplica a mascara).
  { src: fullBleed, size: 512, out: "pwa-maskable-512.png" },
  { src: fullBleed, size: 192, out: "pwa-maskable-192.png" },
  // "any": formato de app (arredondado) onde nao ha mascara.
  { src: rounded, size: 512, out: "pwa-512.png" },
  { src: rounded, size: 192, out: "pwa-192.png" },
];

for (const job of jobs) {
  let pipe = sharp(job.src, { density: 384 }).resize(job.size, job.size);
  if (job.flatten) pipe = pipe.flatten({ background: job.flatten });
  await pipe.png().toFile(join(pub, job.out));
  console.log("ok", job.out);
}
