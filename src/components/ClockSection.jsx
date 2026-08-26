import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import FlipClock from "./FlipClock/FlipClock.jsx";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function getCurrentTime() {
  return new Date();
}

/**
 * Relogio do horario atual. Atualiza exatamente na virada de cada minuto,
 * pois os segundos nao fazem parte desta visualizacao.
 */
export default function ClockSection({ expanded, onToggleExpand, clockRef }) {
  const [now, setNow] = useState(getCurrentTime);

  useEffect(() => {
    const updateTime = () => setNow(getCurrentTime());
    const millisecondsToNextMinute = 60_000 - (Date.now() % 60_000) + 25;
    let intervalId;
    const timeoutId = window.setTimeout(() => {
      updateTime();
      intervalId = window.setInterval(updateTime, 60_000);
    }, millisecondsToNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  const totalSeconds = now.getHours() * 3600 + now.getMinutes() * 60;
  const timeLabel = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="clock-section" aria-label={`Horário atual: ${timeLabel}`}>
      <div className="clock-stage">
        <p className="clock-date">{dateFormatter.format(now)}</p>
        <button
          type="button"
          className="clock-expand"
          onClick={onToggleExpand}
          aria-label={expanded ? "Recolher relógio" : "Expandir relógio em tela cheia"}
        >
          {expanded ? <Minimize strokeWidth={2.2} /> : <Maximize strokeWidth={2.2} />}
        </button>
        <FlipClock
          totalSeconds={totalSeconds}
          showHours
          showSeconds={false}
          padHours
          expanded={expanded}
          onExpand={onToggleExpand}
          rootRef={clockRef}
        />
      </div>
    </main>
  );
}
