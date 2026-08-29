import { useRef, useState } from "react";
import { ChevronDown, Pause, Play, Volume2, VolumeX } from "lucide-react";
import Popover from "./Kanban/Popover.jsx";
import MusicTrackPicker from "./MusicTrackPicker.jsx";

/**
 * Mini player de musica de fundo do modo Foco. Os controles vivem numa unica
 * superficie: play/pause circular, faixa atual (abre um modal central) e
 * volume (abre um popover pequeno). Visivel no desktop e no mobile.
 */
export default function MusicPanel({
  tracks,
  trackId,
  onPickTrack,
  on,
  promptMusic,
  onToggleOn,
  volume,
  onVolume,
}) {
  const volRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [volOpen, setVolOpen] = useState(false);

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

  const current = tracks.find((t) => t.id === trackId) ?? tracks[0];

  return (
    <section className="music-panel" data-on={on} aria-label="Player de música de foco">
      <button
        type="button"
        className="music-player__play"
        data-on={on}
        data-prompt={promptMusic}
        aria-pressed={on}
        aria-label={on ? "Pausar música" : "Tocar música"}
        onClick={onToggleOn}
      >
        {on ? (
          <Pause size={19} strokeWidth={2.7} aria-hidden="true" />
        ) : (
          <Play size={19} strokeWidth={2.7} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className="music-pick"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        onClick={() => {
          setVolOpen(false);
          setPickerOpen(true);
        }}
      >
        <span className="music-pick__copy">
          <span className="music-pick__meta">{on ? "Tocando agora" : "Música de foco"}</span>
          <span className="music-pick__label" title={current?.title}>
            {current?.title ?? "Escolher faixa"}
          </span>
        </span>
        <ChevronDown size={17} strokeWidth={2.4} className="music-pick__chevron" aria-hidden="true" />
      </button>

      <span className="music-player__divider" aria-hidden="true" />

      <button
        ref={volRef}
        type="button"
        className="music-vol-btn"
        aria-haspopup="dialog"
        aria-expanded={volOpen}
        aria-label="Volume da música"
        onClick={() => {
          setPickerOpen(false);
          setVolOpen((v) => !v);
        }}
      >
        {muted ? (
          <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
      {volOpen ? (
        <Popover
          anchorRef={volRef}
          onClose={() => setVolOpen(false)}
          width={200}
          className="kpop--volume"
        >
          <div className="music-vol-pop">
            <input
              type="range"
              className="music-vol__range music-vol__range--h"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              onChange={(e) => onVolume(Number(e.target.value) / 100)}
              aria-label="Volume da música"
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
        </Popover>
      ) : null}

      {pickerOpen ? (
        <MusicTrackPicker
          tracks={tracks}
          selectedId={trackId}
          onSelect={onPickTrack}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}
