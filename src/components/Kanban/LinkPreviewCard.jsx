import { useEffect, useState } from "react";
import { cachedLinkPreview, fetchLinkPreview } from "./linkPreview.js";

const hostOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

// Link NAO borbulha pro container "clique pra editar" da descricao.
const stop = (e) => e.stopPropagation();

/** Cartao de previa de um link sozinho na linha da descricao. */
export default function LinkPreviewCard({ href }) {
  const [data, setData] = useState(() => cachedLinkPreview(href));
  const [status, setStatus] = useState(() => (cachedLinkPreview(href) ? "ok" : "loading"));
  const [thumbFailed, setThumbFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    if (status === "ok") return undefined;
    let alive = true;
    fetchLinkPreview(href).then((result) => {
      if (!alive) return;
      setData(result);
      setStatus(result ? "ok" : "failed");
    });
    return () => {
      alive = false;
    };
  }, [href, status]);

  if (status === "failed") {
    return (
      <p>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={stop}>
          {href}
        </a>
      </p>
    );
  }

  const host = hostOf(href);
  const loading = status === "loading";
  const showThumb = !loading && data.image && !thumbFailed;

  return (
    <a
      className={`linkcard${loading ? " is-loading" : ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      aria-busy={loading || undefined}
    >
      <span className="linkcard__body">
        <span className="linkcard__site">
          {!loading && data.favicon && !iconFailed ? (
            <img
              className="linkcard__icon"
              src={data.favicon}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setIconFailed(true)}
            />
          ) : null}
          <span className="linkcard__host">{(!loading && data.siteName) || host}</span>
        </span>
        {loading ? (
          <>
            <span className="linkcard__bar" aria-hidden="true" />
            <span className="linkcard__bar linkcard__bar--short" aria-hidden="true" />
            <span className="sr-only">Carregando prévia de {host}…</span>
          </>
        ) : (
          <>
            <span className="linkcard__title">{data.title || href}</span>
            {data.description ? <span className="linkcard__desc">{data.description}</span> : null}
          </>
        )}
      </span>
      {showThumb ? (
        <img
          className="linkcard__thumb"
          src={data.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setThumbFailed(true)}
        />
      ) : null}
    </a>
  );
}
