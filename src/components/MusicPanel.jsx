import { useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * Painel de musica de fundo do modo Foco (DESKTOP).
 *
 * Lista as faixas (grid 2 colunas) com um toggle dark-vermelho cada, na
 * identidade do app. O toggle define a ROTACAO: ligadas tocam em sequencia com
 * crossfade; 1 ligada faz loop nela mesma. A direita, coluna de volume VERTICAL
 * com icone de volume no topo e de mudo embaixo. Esconde no mobile via CSS.
 */
export default function MusicPanel({
  tracks,
  enabled,
  onToggle,
  volume,
  onVolume,
}) {
  // Guarda o ultimo volume audivel pra restaurar ao desmutar.
  const lastVolRef = useRef(volume > 0 ? volume : 0.5);
  const muted = volume === 0;

  const toggleMute = () => {
    if (muted) {
      onVolume(lastVolRef.current || 0.5);
    } else {
      lastVolRef.current = volume;
      onVolume(0);
    }
  };

  return (
    <section className="music-panel" aria-label="Música de fundo">
      <div className="music-panel__main">
        <span className="music-panel__title">Música</span>
        <ul className="music-list">
          {tracks.map((t) => {
            const on = enabled.includes(t.id);
            return (
              <li key={t.id} className="music-row" data-on={on}>
                <span className="music-row__name">{t.title}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Desativar" : "Ativar"} ${t.title}`}
                  className="mtoggle"
                  data-on={on}
                  onClick={() => onToggle(t.id)}
                >
                  <span className="mtoggle__track">
                    <span className="mtoggle__knob" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="music-vol">
        <Volume2
          className="music-vol__icon"
          size={16}
          strokeWidth={2.2}
          aria-hidden="true"
        />
        <input
          type="range"
          className="music-vol__range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          aria-label="Volume da música"
          orient="vertical"
        />
        <button
          type="button"
          className="music-vol__mute"
          data-muted={muted}
          aria-pressed={muted}
          aria-label={muted ? "Tirar do mudo" : "Mutar música"}
          onClick={toggleMute}
        >
          <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
