import { mediaUrl, type MediaItem } from '../api.js';
import { formatDuration, resolutionLabel } from '../format.js';

interface ItemCardProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
}

export function ItemCard({ item, onPlay }: ItemCardProps) {
  const progress =
    item.position_seconds && item.duration_seconds
      ? Math.min(100, (item.position_seconds / item.duration_seconds) * 100)
      : 0;

  return (
    <button className="card" type="button" onClick={() => onPlay(item)}>
      <div className="card-art">
        {item.artwork ? (
          <img src={mediaUrl(`/api/items/${item.id}/artwork`)} alt="" loading="lazy" />
        ) : (
          <div className="card-art-fallback">{item.series ?? item.title}</div>
        )}
        {progress > 0 ? <span className="card-progress" style={{ width: `${progress}%` }} /> : null}
        <span className="card-badge">{resolutionLabel(item.width, item.height)}</span>
      </div>
      <div className="card-meta">
        <span className="card-title">{item.series ?? item.title}</span>
        <span className="card-subtitle">
          {item.series ? item.title : [item.year, formatDuration(item.duration_seconds)].filter(Boolean).join(' · ')}
        </span>
      </div>
    </button>
  );
}
