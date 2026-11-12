import { useEffect, useState } from 'react';
import { spotify } from './lib/api';
import { art, greeting, plainText } from './lib/format';
import { usePlayer } from './player';
import type { Artist, Paging, Playlist, Track, View } from './types';
import { Cover, MediaCard } from './ui';

export function HomeScreen({ open }: { open: (view: View) => void }) {
  const { user, now, toggle, playContext, playUris } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let dead = false;
    const load = async () => {
      const [playlistPage, recentPage, trackPage, artistPage] = await Promise.all([
        spotify<Paging<Playlist>>('/me/playlists?limit=18').catch(() => null),
        spotify<{ items: { track: Track }[] }>('/me/player/recently-played?limit=10').catch(() => null),
        spotify<Paging<Track>>('/me/top/tracks?limit=8&time_range=short_term').catch(() => null),
        spotify<Paging<Artist>>('/me/top/artists?limit=8&time_range=short_term').catch(() => null),
      ]);
      if (dead) return;
      if (!playlistPage && !recentPage && !trackPage && !artistPage) setError('Không tải được dữ liệu từ Spotify.');
      setPlaylists((playlistPage?.items ?? []).filter((item) => item?.id));
      const seen = new Set<string>();
      setRecent(
        (recentPage?.items ?? [])
          .map((item) => item.track)
          .filter((track) => {
            if (!track?.id || seen.has(track.id)) return false;
            seen.add(track.id);
            return true;
          }),
      );
      setTopTracks(trackPage?.items ?? []);
      setArtists(artistPage?.items ?? []);
      setLoading(false);
    };
    void load();
    return () => {
      dead = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="stack">
        <div className="skel skel-title" />
        <div className="recent">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skel skel-tile" />
          ))}
        </div>
      </div>
    );
  }

  const name = user?.display_name?.split(' ')[0] ?? '';

  return (
    <div className="stack">
      <h2 className="greet">
        {greeting()}
        {name ? `, ${name}` : ''}
      </h2>
      {error && <p className="error">{error}</p>}
      {recent.length > 0 && (
        <section className="section">
          <div className="recent">
            {recent.map((track, index) => {
              const playing = now.track?.id === track.id && !now.paused;
              return (
                <button
                  key={track.id}
                  className="recent-item"
                  onClick={() => {
                    if (now.track?.id === track.id) void toggle();
                    else void playUris(recent.map((item) => item.uri), index);
                  }}
                >
                  <Cover src={art(track.album?.images, 80)} alt="" className="tile" />
                  <span>{track.name}</span>
                  <span className={`mini-play ${playing ? 'show' : ''}`}>{playing ? '❚❚' : '▶'}</span>
                </button>
              );
            })}
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
                subtitle={plainText(playlist.description) || `của ${playlist.owner?.display_name || 'Spotify'}`}
                image={art(playlist.images, 300)}
                playing={now.contextUri === playlist.uri && !now.paused}
                onOpen={() => open({ name: 'playlist', id: playlist.id })}
                onPlay={() => {
                  if (now.contextUri === playlist.uri) void toggle();
                  else void playContext(playlist.uri);
                }}
              />
            ))}
          </div>
        </section>
      )}
      {artists.length > 0 && (
        <section className="section">
          <h3>Nghệ sĩ bạn nghe nhiều</h3>
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
      {topTracks.length > 0 && (
        <section className="section">
          <h3>Nghe lại gần đây</h3>
          <div className="hrow">
            {topTracks.map((track, index) => (
              <MediaCard
                key={track.id}
                title={track.name}
                subtitle={track.artists.map((artist) => artist.name).join(', ')}
                image={art(track.album?.images, 300)}
                playing={now.track?.id === track.id && !now.paused}
                onOpen={() => track.album && open({ name: 'album', id: track.album.id })}
                onPlay={() => {
                  if (now.track?.id === track.id) void toggle();
                  else void playUris(topTracks.map((item) => item.uri), index);
                }}
              />
            ))}
          </div>
        </section>
      )}
      {!error && playlists.length === 0 && recent.length === 0 && (
        <p className="empty">Thư viện đang trống. Hãy tìm một bài hát để bắt đầu.</p>
      )}
    </div>
  );
}
