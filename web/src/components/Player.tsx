import { useEffect, useRef, useState } from 'react';
import { api, mediaUrl, type MediaItem } from '../api.js';
import { formatSize, resolutionLabel } from '../format.js';

interface PlayerProps {
  item: MediaItem;
  onClose: () => void;
}

const PROGRESS_INTERVAL_MS = 10_000;

export function Player({ item, onClose }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [method, setMethod] = useState<'direct' | 'transcode' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resumeAt = item.position_seconds ?? 0;

  useEffect(() => {
    let cancelled = false;
    api
      .playback(item.id)
      .then((playback) => {
        if (cancelled) return;
        setMethod(playback.method);
        // A transcode is produced from a seek point, so resume is baked into the URL.
        const url =
          playback.method === 'transcode' && resumeAt > 5
            ? `${playback.url}?start=${Math.floor(resumeAt)}`
            : playback.url;
        setSource(mediaUrl(url));
      })
      .catch((caught: unknown) => setError((caught as Error).message));
    return () => {
      cancelled = true;
    };
  }, [item.id, resumeAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      const offset = method === 'transcode' && resumeAt > 5 ? resumeAt : 0;
      const position = offset + video.currentTime;
      const duration = item.duration_seconds ?? 0;
      void api.saveProgress(item.id, position, duration > 0 && position / duration > 0.95);
    }, PROGRESS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [item.id, item.duration_seconds, method, resumeAt]);

  function handleLoaded() {
    const video = videoRef.current;
    if (video && method === 'direct' && resumeAt > 5) video.currentTime = resumeAt;
  }

  return (
    <div className="player-overlay" role="dialog" aria-label={`Playing ${item.title}`}>
      <div className="player-header">
        <div>
          <h2>{item.series ? `${item.series} — ${item.title}` : item.title}</h2>
          <p className="player-tech">
            {[
              method === 'transcode' ? 'Transcoding' : 'Direct play',
              resolutionLabel(item.width, item.height),
              item.video_codec,
              item.audio_codec,
              formatSize(item.size_bytes),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button className="ghost" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {source ? (
        <video
          ref={videoRef}
          src={source}
          controls
          autoPlay
          onLoadedMetadata={handleLoaded}
          onError={() => setError('This file could not be played.')}
        />
      ) : (
        <p className="muted">Preparing stream…</p>
      )}
    </div>
  );
}
