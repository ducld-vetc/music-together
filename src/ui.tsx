import { useEffect, useState, type MouseEvent } from 'react';
import { HeartFillIcon, HeartIcon, NoteIcon, PauseIcon, PlayIcon } from './icons';
import { spotify } from './lib/api';
import { art, formatMs, uriId } from './lib/format';
import { usePlayer } from './player';
import type { Track, View } from './types';

export function Cover({
  src,
  alt,
  round = false,
  className = '',
}: {
  src?: string;
  alt: string;
  round?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <span className={`cover placeholder ${round ? 'round' : ''} ${className}`}>
        <NoteIcon />
      </span>
    );
  }
  return <img className={`cover ${round ? 'round' : ''} ${className}`} src={src} alt={alt} decoding="async" />;
}

export function PlayFab({
  playing = false,
  onClick,
  label,
}: {
  playing?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  label?: string;
}) {
  return (
    <button className="play-fab" onClick={onClick} aria-label={label ?? (playing ? 'Tạm dừng' : 'Phát')}>
      {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
    </button>
  );
}

export function MediaCard({
  title,
  subtitle,
  image,
  round = false,
  playing = false,
  onOpen,
  onPlay,
}: {
  title: string;
  subtitle: string;
  image?: string;
  round?: boolean;
  playing?: boolean;
  onOpen: () => void;
  onPlay: () => void;
}) {
  return (
    <article className="card">
      <button className="card-hit" onClick={onOpen}>
        <Cover src={image} alt="" round={round} />
        <strong>{title}</strong>
        <span className="sub">{subtitle}</span>
      </button>
      <PlayFab
        playing={playing}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
      />
    </article>
  );
}

function useSavedSet(ids: string[]) {
  const key = ids.join(',');
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!key) return;
    let dead = false;
    const list = key.split(',');
    const load = async () => {
      const next = new Set<string>();
      for (let index = 0; index < list.length; index += 50) {
        const chunk = list.slice(index, index + 50);
        const flags = await spotify<boolean[]>(`/me/tracks/contains?ids=${chunk.join(',')}`);
        chunk.forEach((id, flagIndex) => {
          if (flags[flagIndex]) next.add(id);
        });
      }
      if (!dead) setSaved(next);
    };
    load().catch(() => {});
    return () => {
      dead = true;
    };
  }, [key]);

  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; saved: boolean }>).detail;
      setSaved((current) => {
        const next = new Set(current);
        if (detail.saved) next.add(detail.id);
        else next.delete(detail.id);
        return next;
      });
    };
    window.addEventListener('nghe:saved', onSaved);
    return () => window.removeEventListener('nghe:saved', onSaved);
  }, []);

  return saved;
}

export function TrackTable({
  tracks,
  showAlbum = true,
  onPlay,
  open,
}: {
  tracks: Track[];
  showAlbum?: boolean;
  onPlay: (index: number) => void;
  open: (view: View) => void;
}) {
  const { now, toggle, toggleSave } = usePlayer();
  const saved = useSavedSet(tracks.map((track) => track.id));

  return (
    <div className={`tracks ${showAlbum ? '' : 'no-album'}`}>
      <div className="tracks-head">
        <span>#</span>
        <span>Tiêu đề</span>
        {showAlbum && <span className="col-album">Album</span>}
        <span className="time-col">
          <span className="sr">Thời lượng</span>
          <ClockMark />
        </span>
        <span className="sr">Đã thích</span>
      </div>
      {tracks.map((track, index) => {
        const active = now.track?.id === track.id;
        const artistNodes = track.artists.map((artist, artistIndex) => {
          const id = artist.id || uriId(artist.uri);
          return (
            <span key={`${artist.uri}-${artistIndex}`}>
              {artistIndex > 0 ? ', ' : ''}
              {id ? (
                <button
                  className="inline-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    open({ name: 'artist', id });
                  }}
                >
                  {artist.name}
                </button>
              ) : (
                artist.name
              )}
            </span>
          );
        });
        return (
          <div
            key={`${track.id}-${index}`}
            className={`track ${active ? 'current' : ''} ${track.is_playable === false ? 'unplayable' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (active) void toggle();
              else onPlay(index);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (active) void toggle();
                else onPlay(index);
              }
            }}
          >
            <span className="idx">
              {active && !now.paused ? (
                <PauseIcon size={14} />
              ) : (
                <>
                  <span className="num">{index + 1}</span>
                  <span className="hover-play">
                    <PlayIcon size={14} />
                  </span>
                </>
              )}
            </span>
            <span className="title-cell">
              <Cover src={art(track.album?.images, 64)} alt="" className="tiny" />
              <span className="title-copy">
                <strong>{track.name}</strong>
                <span className="muted">
                  {track.explicit && <em className="explicit">E</em>}
                  {artistNodes}
                </span>
              </span>
            </span>
            {showAlbum && (
              <span className="col-album">
                {track.album?.id ? (
                  <button
                    className="inline-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      open({ name: 'album', id: track.album!.id });
                    }}
                  >
                    {track.album.name}
                  </button>
                ) : (
                  <span className="muted">{track.album?.name}</span>
                )}
              </span>
            )}
            <span className="time-col muted">{formatMs(track.duration_ms)}</span>
            <button
              className={`heart ${saved.has(track.id) ? 'on' : ''}`}
              aria-label={saved.has(track.id) ? 'Bỏ thích' : 'Thích'}
              onClick={(event) => {
                event.stopPropagation();
                void toggleSave(track.id, saved.has(track.id));
              }}
            >
              {saved.has(track.id) ? <HeartFillIcon /> : <HeartIcon />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ClockMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </svg>
  );
}
