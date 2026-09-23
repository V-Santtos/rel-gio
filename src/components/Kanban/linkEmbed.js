// "Abrir previa" so existe para Instagram e YouTube: os dois tem player
// oficial via iframe (/embed), sem SDK. Outros sites abrem direto em nova aba.

export function embedOf(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");

  if (host === "instagram.com") {
    const match = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/);
    if (!match) return null;
    const kind = match[1] === "reels" ? "reel" : match[1];
    return {
      src: `https://www.instagram.com/${kind}/${match[2]}/embed`,
      vertical: true,
      label: "Instagram",
    };
  }

  if (host === "youtube.com" || host === "youtu.be") {
    let id = null;
    let vertical = false;
    if (host === "youtu.be") {
      id = url.pathname.slice(1).split("/")[0];
    } else if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      if (match) {
        id = match[2];
        vertical = match[1] === "shorts";
      }
    }
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    return { src: `https://www.youtube-nocookie.com/embed/${id}`, vertical, label: "YouTube" };
  }

  return null;
}
