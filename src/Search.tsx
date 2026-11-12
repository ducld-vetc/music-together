import { useEffect, useState } from 'react';
import { spotify } from './lib/api';
import { art } from './lib/format';
import { usePlayer } from './player';
import type { Album, Artist, Playlist, Track, View } from './types';
import { MediaCard, TrackTable } from './ui';

type SearchResult = {
  tracks?: { items: Track[] };
  artists?: { items: Artist[] };
  albums?: { items: Album[] };
  playlists?: { items: (Playlist | null)[] };
};

const QUERY_KEY = 'nghe.queries';

function readQueries(): string[] {
  try {
    return JSON.parse(localStorage.getItem(QUERY_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function remember(query: string) {
  const next = [query, ...readQueries().filter((item) => item !== query)].slice(0, 8);
  localStorage.setItem(QUERY_KEY, JSON.stringify(next));
}

export function SearchScreen({ query, open, onQuery }: { query: string; open: (view: View) => void; onQuery: (value: string) => void }) {
  const { playContext, playUris } = usePlayer();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [past, setPast] = useState<string[]>(readQueries);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResult(null);
      setLoading(false);
      return;
    }
    let dead = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: text,
        type: 'track,artist,album,playlist',
        limit: '6',
        market: 'from_token',
      });
      spotify<SearchResult>(`/search?${params}`)
        .then((data) => {
          if (dead) return;
          setResult(data);
          setError('');
          remember(text);
          setPast(readQueries());
        })
        .catch((err: unknown) => {
          if (!dead) setError(err instanceof Error ? err.message : 'Tìm kiếm thất bại');
        })
        .finally(() => {
          if (!dead) setLoading(false);
        });
    }, 280);
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!query.trim()) {
    return (
      <div className="stack">
        <h2 className="greet">Tìm kiếm</h2>
        <p className="muted">Bài hát, nghệ sĩ, album hoặc playlist trên Spotify của bạn.</p>
        {past.length > 0 && (
          <div className="chips">
            {past.map((item) => (
              <button key={item} className="chip" onClick={() => onQuery(item)}>
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const tracks = result?.tracks?.items ?? [];
  const artists = result?.artists?.items ?? [];
  const albums = result?.albums?.items ?? [];
  const playlists = (result?.playlists?.items ?? []).filter((item): item is Playlist => !!item?.id);

  return (
    <div className="stack">
      <h2 className="greet">Kết quả cho “{query.trim()}”</h2>
      {loading && <p className="muted">Đang tìm…</p>}
      {error && <p className="error">{error}</p>}
      {tracks.length > 0 && (
        <section className="section">
          <h3>Bài hát</h3>
          <TrackTable tracks={tracks} onPlay={(index) => void playUris(tracks.map((track) => track.uri), index)} open={open} />
        </section>
      )}
      {artists.length > 0 && (
        <section className="section">
          <h3>Nghệ sĩ</h3>
          <div className="hrow">
            {artists.map((artist) => (
              <MediaCard
                key={artist.id}
                title={artist.name}
                subtitle="Nghệ sĩ"
                image={art(artist.images, 300)}
                round
                onOpen={() => open({ name: 'artist', id: artist.id })}
                onPlay={() => open({ name: 'artist', id: artist.id })}
              />
            ))}
          </div>
        </section>
      )}
      {albums.length > 0 && (
        <section className="section">
          <h3>Album</h3>
          <div className="hrow">
            {albums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.name}
                subtitle={album.artists.map((artist) => artist.name).join(', ')}
                image={art(album.images, 300)}
                onOpen={() => open({ name: 'album', id: album.id })}
                onPlay={() => void playContext(album.uri)}
              />
            ))}
          </div>
        </section>
      )}
      {playlists.length > 0 && (
        <section className="section">
          <h3>Playlist</h3>
          <div className="hrow">
            {playlists.map((playlist) => (
              <MediaCard
                key={playlist.id}
                title={playlist.name}
                subtitle={playlist.owner?.display_name || 'Playlist'}
                image={art(playlist.images, 300)}
                onOpen={() => open({ name: 'playlist', id: playlist.id })}
                onPlay={() => void playContext(playlist.uri)}
              />
            ))}
          </div>
        </section>
      )}
      {!loading && result && tracks.length + artists.length + albums.length + playlists.length === 0 && (
        <p className="empty">Không thấy kết quả nào.</p>
      )}
    </div>
  );
}
