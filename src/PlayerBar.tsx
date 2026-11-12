import { useEffect, useRef, useState } from 'react';
import {
  HeartFillIcon,
  HeartIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
  VolumeOffIcon,
} from './icons';
import { spotify } from './lib/api';
import { formatMs, uriId } from './lib/format';
import { usePlayer } from './player';
import type { Track, View } from './types';

export function PlayerBar({ open }: { open: (view: View) => void }) {
  const {
    deviceId,
    now,
    volume,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    toggleSave,
  } = usePlayer();
  const [shown, setShown] = useState(0);
  const [liked, setLiked] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const seeking = useRef(false);
  const lastVolume = useRef(volume || 0.8);
  const track = now.track;

  useEffect(() => {
    const started = performance.now();
    const base = now.position;
    let frame = 0;
    const loop = (time: number) => {
      if (!seeking.current) {
        const position = now.paused ? base : base + (time - started);
        setShown(Math.max(0, Math.min(position, now.duration || position)));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [now.position, now.paused, now.duration, track?.id]);

  useEffect(() => {
    if (!track?.id) return;
    let dead = false;
    spotify<boolean[]>(`/me/tracks/contains?ids=${track.id}`)
      .then((flags) => {
        if (!dead) setLiked(!!flags[0]);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [track?.id]);

  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; saved: boolean }>).detail;
      if (detail.id === track?.id) setLiked(detail.saved);
    };
    window.addEventListener('nghe:saved', onSaved);
    return () => window.removeEventListener('nghe:saved', onSaved);
  }, [track?.id]);

  useEffect(() => {
    if (!queueOpen) return;
    let dead = false;
    spotify<{ queue: Track[] }>('/me/player/queue')
      .then((data) => {
        if (!dead) setQueue((data.queue ?? []).filter((item) => item?.id).slice(0, 30));
      })
      .catch(() => {
        if (!dead) setQueue([]);
      });
    return () => {
      dead = true;
    };
  }, [queueOpen, track?.id]);

  const percent = now.duration ? (shown / now.duration) * 100 : 0;

  return (
    <footer className="player">
      <div className="now">
        {track ? (
          <>
            {track.image ? <img src={track.image} alt="" /> : <span className="cover placeholder tiny" />}
            <div className="now-copy">
              <strong>{track.name}</strong>
              <span>
                {track.artists.map((artist, index) => {
                  const id = uriId(artist.uri);
                  return (
                    <span key={artist.uri}>
                      {index > 0 ? ', ' : ''}
                      {id ? (
                        <button className="inline-link" onClick={() => open({ name: 'artist', id })}>
                          {artist.name}
                        </button>
                      ) : (
                        artist.name
                      )}
                    </span>
                  );
                })}
              </span>
            </div>
            <button
              className={`heart ${liked ? 'on' : ''}`}
              aria-label={liked ? 'Bỏ thích' : 'Thích'}
              onClick={() => void toggleSave(track.id, liked)}
            >
              {liked ? <HeartFillIcon /> : <HeartIcon />}
            </button>
          </>
        ) : (
          <p className="muted">{deviceId ? 'Chọn một bài để phát trên máy này.' : 'Đang kết nối trình phát…'}</p>
        )}
      </div>
      <div className="transport">
        <div className="transport-btns">
          <button className={`ctrl ${now.shuffle ? 'on' : ''}`} aria-label="Phát ngẫu nhiên" onClick={() => void toggleShuffle()}>
            <ShuffleIcon />
          </button>
          <button className="ctrl" aria-label="Bài trước" onClick={() => void prev()}>
            <PrevIcon />
          </button>
          <button className="ctrl-play" aria-label={now.paused ? 'Phát' : 'Tạm dừng'} onClick={() => void toggle()}>
            {now.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button className="ctrl" aria-label="Bài tiếp" onClick={() => void next()}>
            <NextIcon />
          </button>
          <button
            className={`ctrl ${now.repeat ? 'on' : ''}`}
            aria-label="Lặp lại"
            onClick={() => void cycleRepeat()}
          >
            <RepeatIcon />
            {now.repeat === 2 && <em>1</em>}
          </button>
        </div>
        <div className="seek-row">
          <span className="time">{formatMs(shown)}</span>
          <input
            className="timeline"
            type="range"
            min={0}
            max={now.duration || 0}
            value={Math.min(shown, now.duration || 0)}
            style={{ ['--pct' as string]: `${percent}%` }}
            aria-label="Vị trí phát"
            onPointerDown={() => {
              seeking.current = true;
            }}
            onChange={(event) => setShown(Number(event.target.value))}
            onPointerUp={(event) => {
              seeking.current = false;
              void seek(Number((event.target as HTMLInputElement).value));
            }}
            onKeyUp={(event) => {
              seeking.current = false;
              void seek(Number((event.target as HTMLInputElement).value));
            }}
          />
          <span className="time">{formatMs(now.duration)}</span>
        </div>
      </div>
      <div className="extras">
        <button className={`ctrl ${queueOpen ? 'on' : ''}`} aria-label="Hàng đợi" onClick={() => setQueueOpen((openQueue) => !openQueue)}>
          <QueueIcon />
        </button>
        <button
          className="ctrl"
          aria-label={volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'}
          onClick={() => {
            if (volume > 0) {
              lastVolume.current = volume;
              void setVolume(0);
            } else {
              void setVolume(lastVolume.current || 0.8);
            }
          }}
        >
          {volume === 0 ? <VolumeOffIcon /> : <VolumeIcon />}
        </button>
        <input
          className="timeline vol-range"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          style={{ ['--pct' as string]: `${volume * 100}%` }}
          aria-label="Âm lượng"
          onChange={(event) => void setVolume(Number(event.target.value))}
        />
      </div>
      {queueOpen && (
        <aside className="queue">
          <strong>Tiếp theo</strong>
          {queue.length === 0 && <p className="muted">Hàng đợi trống.</p>}
          <ul>
            {queue.map((item, index) => (
              <li key={`${item.id}-${index}`}>
                <span>{item.name}</span>
                <small>{item.artists?.map((artist) => artist.name).join(', ')}</small>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </footer>
  );
}
