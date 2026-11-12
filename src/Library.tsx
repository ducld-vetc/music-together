import { useEffect, useState } from 'react';
import { HeartFillIcon } from './icons';
import { spotify } from './lib/api';
import { art } from './lib/format';
import { usePlayer } from './player';
import type { Album, Artist, Paging, Playlist, View } from './types';
import { MediaCard } from './ui';

type Tab = 'playlist' | 'album' | 'artist';

export function LibraryScreen({ open }: { open: (view: View) => void }) {
  const { playContext } = usePlayer();
  const [tab, setTab] = useState<Tab>('playlist');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        if (tab === 'playlist') {
          const page = await spotify<Paging<Playlist>>('/me/playlists?limit=40');
          if (!dead) setPlaylists(page.items.filter((item) => item?.id));
        } else if (tab === 'album') {
          const page = await spotify<Paging<{ album: Album }>>('/me/albums?limit=40');
          if (!dead) setAlbums(page.items.map((item) => item.album));
        } else {
          const page = await spotify<{ artists: Paging<Artist> }>('/me/following?type=artist&limit=40');
          if (!dead) setArtists(page.artists.items);
        }
        if (!dead) setError('');
      } catch (err) {
        if (!dead) setError(err instanceof Error ? err.message : 'Không tải được thư viện');
      }
    };
    void load();
    return () => {
      dead = true;
    };
  }, [tab]);

  return (
    <div className="stack">
      <h2 className="greet">Thư viện</h2>
      <div className="chips">
        {(
          [
            ['playlist', 'Playlist'],
            ['album', 'Album'],
            ['artist', 'Nghệ sĩ'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {tab === 'playlist' && (
        <div className="card-grid">
          <button className="liked-tile" onClick={() => open({ name: 'liked' })}>
            <span className="liked-art">
              <HeartFillIcon size={28} />
            </span>
            <strong>Bài hát đã thích</strong>
            <span>Playlist</span>
          </button>
          {playlists.map((playlist) => (
            <MediaCard
              key={playlist.id}
              title={playlist.name}
              subtitle={`${playlist.tracks.total} bài hát`}
              image={art(playlist.images, 300)}
              onOpen={() => open({ name: 'playlist', id: playlist.id })}
              onPlay={() => void playContext(playlist.uri)}
            />
          ))}
        </div>
      )}
      {tab === 'album' && (
        <div className="card-grid">
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
          {albums.length === 0 && <p className="empty">Chưa lưu album nào.</p>}
        </div>
      )}
      {tab === 'artist' && (
        <div className="card-grid">
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
          {artists.length === 0 && <p className="empty">Bạn chưa theo dõi nghệ sĩ nào.</p>}
        </div>
      )}
    </div>
  );
}
