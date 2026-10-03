"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { adjustEventTime, completeEvent } from "@/app/actions/planning";
import { Badge, buttonSecondary } from "@/components/ui";

function fmt(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/**
 * Chronomètre d'événement Scrum : écoulé / restant / dépassement de timebox.
 * - Scrum Master : curseur déplaçable manuellement (repositionne le chrono)
 *   + bouton « Terminer ✓ » qui remplit la barre d'un coup (étape faite).
 * - Autres rôles : lecture seule.
 */
export function EventChrono({
  startedAtISO,
  endedAtISO,
  timeboxMinutes,
  eventId,
  teamId,
  canManage = false,
  completed = false,
}: {
  startedAtISO: string | null;
  endedAtISO: string | null;
  timeboxMinutes: number;
  eventId: string;
  teamId: string;
  canManage?: boolean;
  completed?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const running = !!startedAtISO && !endedAtISO && !completed;
  const sliderMax = Math.max(timeboxMinutes, 1);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const liveElapsedMin = startedAtISO
    ? Math.max(0, ((endedAtISO ? new Date(endedAtISO).getTime() : now) - new Date(startedAtISO).getTime()) / 60000)
    : 0;
  const [cursor, setCursor] = useState(() => Math.min(Math.floor(liveElapsedMin), sliderMax));
  // Dernière valeur envoyée au serveur : évite les doubles commits
  // (ex. touchend suivi du pointerup synthétique).
  const lastSentRef = useRef<number | null>(null);

  // Resynchronise le curseur quand les données serveur changent (hors drag).
  useEffect(() => {
    if (!dragging) setCursor(Math.min(Math.floor(liveElapsedMin), sliderMax));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtISO, endedAtISO, completed, dragging]);

  if (!startedAtISO && !completed) {
    return (
      <div className="w-full">
        <Badge tone="zinc">Timebox : {timeboxMinutes} min — non démarré</Badge>
        {canManage && (
          <ManualControls
            cursor={cursor}
            sliderMax={sliderMax}
            timeboxMinutes={timeboxMinutes}
            pending={pending}
            hint="Glissez le curseur pour démarrer le chrono à cet avancement."
            onCursorChange={(v) => {
              setCursor(v);
              setDragging(true);
            }}
            onCommit={() => {
              setDragging(false);
              commitAdjust();
            }}
            onComplete={commitComplete}
          />
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  const start = startedAtISO ? new Date(startedAtISO).getTime() : Date.now();
  const end = endedAtISO ? new Date(endedAtISO).getTime() : now;
  const elapsedMin = completed ? timeboxMinutes : (end - start) / 60000;
  const shownMin = dragging ? cursor : running ? (end - start) / 60000 : elapsedMin;
  const remaining = timeboxMinutes - elapsedMin;
  const over = !completed && remaining < 0;
  const pct = completed ? 100 : Math.min(100, Math.max(0, (shownMin / sliderMax) * 100));

  function commitAdjust() {
    if (lastSentRef.current === cursor) return;
    lastSentRef.current = cursor;
    setError(null);
    startTransition(async () => {
      try {
        await adjustEventTime(teamId, eventId, cursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ajustement impossible.");
      }
    });
  }

  function commitComplete() {
    setError(null);
    setDragging(false);
    startTransition(async () => {
      try {
        await completeEvent(teamId, eventId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action impossible.");
      }
    });
  }

  const adjustable = canManage && !completed && !endedAtISO;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={completed ? "green" : over ? "red" : running ? "blue" : "zinc"}>
          {completed ? "Terminé ✓" : endedAtISO ? "Terminé" : "En cours"} — {fmt((end - start) / 1000)}
        </Badge>
        <span className={over ? "font-medium text-red-600" : "text-navy-900/70"}>
          {completed
            ? `Étape faite (${timeboxMinutes} min)`
            : over
              ? `Timebox dépassée de ${fmt(-remaining * 60)}`
              : `Reste ${fmt(remaining * 60)} / ${timeboxMinutes} min`}
        </span>
        {canManage && !completed && (
          <button
            type="button"
            className={buttonSecondary}
            disabled={pending}
            onClick={commitComplete}
            title="Remplit la barre d'un coup : l'étape est marquée comme faite"
          >
            {pending ? "…" : "Terminer ✓"}
          </button>
        )}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sand-100">
        <div
          className={`h-full rounded-full ${completed ? "bg-green-600" : over ? "bg-red-500" : "bg-navy-900"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {adjustable ? (
        <ManualControls
          cursor={cursor}
          sliderMax={sliderMax}
          timeboxMinutes={timeboxMinutes}
          pending={pending}
          hint={
            startedAtISO
              ? "Glissez le curseur pour repositionner le chrono, puis relâchez pour appliquer (clavier : flèches puis Entrée)."
              : "Glissez le curseur pour démarrer le chrono à cet avancement."
          }
          onCursorChange={(v) => {
            setCursor(v);
            setDragging(true);
          }}
          onCommit={() => {
            setDragging(false);
            commitAdjust();
          }}
          onComplete={commitComplete}
        />
      ) : (
        canManage &&
        !completed &&
        endedAtISO && (
          <p className="mt-1 text-xs text-navy-900/60">
            Chrono stoppé — relancez-le pour déplacer le curseur, ou « Terminer ✓ » pour marquer l&apos;étape comme faite.
          </p>
        )
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ManualControls({
  cursor,
  sliderMax,
  timeboxMinutes,
  pending,
  hint,
  onCursorChange,
  onCommit,
  onComplete,
}: {
  cursor: number;
  sliderMax: number;
  timeboxMinutes: number;
  pending: boolean;
  hint: string;
  onCursorChange: (v: number) => void;
  onCommit: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-dashed border-navy-900/30 bg-white/60 p-2">
      <label className="flex items-center gap-2 text-xs font-medium text-navy-900">
        <span className="shrink-0">Curseur : {cursor} / {timeboxMinutes} min</span>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={1}
          value={cursor}
          disabled={pending}
          aria-label="Déplacer le curseur de la timeline (minutes écoulées)"
          title="Déplacer le curseur de la timeline"
          className="w-full accent-navy-900"
          onChange={(e) => onCursorChange(Number(e.target.value))}
          onPointerUp={onCommit}
          onTouchEnd={onCommit}
          onKeyUp={(e) => {
            if (e.key === "Enter") onCommit();
          }}
        />
        <button
          type="button"
          className={buttonSecondary}
          disabled={pending}
          onClick={onComplete}
          title="Remplit la barre d'un coup : l'étape est marquée comme faite"
        >
          {pending ? "…" : "Terminer ✓"}
        </button>
      </label>
      <p className="mt-1 text-xs text-navy-900/60">{hint}</p>
    </div>
  );
}
