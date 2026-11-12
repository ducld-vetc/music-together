import { useEffect, useState } from 'react';
import { HeartFillIcon } from './icons';
import { spotify } from './lib/api';
import { albumKind, art, compact, formatTotal, hueFrom, plainText } from './lib/format';
import { usePlayer } from './player';
import type { Album, Artist, Playlist, Track, View } from './types';
import { tracksOnly } from './types';
import { Cover, MediaCard, PlayFab, TrackTable } from './ui';

type Header = {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  round?: boolean;
  hue: number;
  contextUri: string | null;
  liked?: boolean;
};

export function DetailScreen({ view, open }: { view: Exclude<View, { name: 'home' | 'search' | 'library' }>; open: (next: View) => void }) {
  const { user, now, toggle, playContext, playUris } = usePlayer();
  const [header, setHeader] = useState<Header | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const id = 'id' in view ? view.id : 'liked';

  useEffect(() => {
    let dead = false;
    setError('');
    setHeader(null);
    setTracks([]);
    setAlbums([]);
    setNextUrl(null);

    const run = async () => {
      try {
        if (view.name === 'playlist') {
          const playlist = await spotify<Playlist>(`/playlists/${view.id}`);
          if (dead) return;
          const list = tracksOnly(playlist.tracks.items);
          setHeader({
            eyebrow: 'Playlist',
            title: playlist.name,
            subtitle: [playlist.owner?.display_name || 'Spotify', `${playlist.tracks.total} bài hát`, plainText(playlist.description)]
              .filter(Boolean)
              .join(' · '),
            image: art(playlist.images, 400),
            hue: hueFrom(playlist.id),
            contextUri: playlist.uri,
          });
          setTracks(list);
          setNextUrl(playlist.tracks.next ?? null);
        } else if (view.name === 'album') {
          const album = await spotify<Album>(`/albums/${view.id}`);
          if (dead) return;
          const list = (album.tracks?.items ?? []).map((track) => ({
            ...track,
            album: {
              id: album.id,
              name: album.name,
              uri: album.uri,
              images: album.images,
              artists: album.artists,
            },
          }));
          const year = album.release_date?.slice(0, 4) ?? '';
          setHeader({
            eyebrow: albumKind(album.album_type),
            title: album.name,
            subtitle: [album.artists.map((artist) => artist.name).join(', '), year, `${album.total_tracks ?? list.length} bài hát`]
              .filter(Boolean)
              .join(' · '),
            image: art(album.images, 400),
            hue: hueFrom(album.id),
            contextUri: album.uri,
          });
          setTracks(list);
          setNextUrl(album.tracks?.next ?? null);
        } else if (view.name === 'artist') {
          const market = user?.country || 'VN';
          const [artist, top, release] = await Promise.all([
            spotify<Artist>(`/artists/${view.id}`),
            spotify<{ tracks: Track[] }>(`/artists/${view.id}/top-tracks?market=${market}`),
            spotify<{ items: Album[] }>(`/artists/${view.id}/albums?include_groups=album,single&limit=12`),
          ]);
          if (dead) return;
          setHeader({
            eyebrow: 'Nghệ sĩ',
            title: artist.name,
            subtitle: [
              artist.followers ? `${compact(artist.followers.total)} người theo dõi` : '',
              (artist.genres ?? []).slice(0, 3).join(', '),
            ]
              .filter(Boolean)
              .join(' · '),
            image: art(artist.images, 400),
            round: true,
            hue: hueFrom(artist.id),
            contextUri: null,
          });
          setTracks(top.tracks);
          setAlbums(release.items);
        } else {
          const page = await spotify<{ items: { track: Track }[]; total: number; next: string | null }>('/me/tracks?limit=50');
          if (dead) return;
          const list = tracksOnly(page.items);
          setHeader({
            eyebrow: 'Playlist',
            title: 'Bài hát đã thích',
            subtitle: `${page.total} bài hát`,
            image: '',
            hue: 330,
            contextUri: null,
            liked: true,
          });
          setTracks(list);
          setNextUrl(page.next);
        }
      } catch (err) {
        if (!dead) setError(err instanceof Error ? err.message : 'Không mở được trang này');
      }
    };
    void run();
    return () => {
      dead = true;
    };
  }, [view.name, id, user?.country]);

  async function loadMore() {
    if (!nextUrl) return;
    setLoadingMore(true);
    try {
      if (view.name === 'album') {
        const page = await spotify<{ items: Track[]; next: string | null }>(nextUrl);
        setTracks((current) => [
          ...current,
          ...page.items.map((track) => ({
            ...track,
            album: current[0]?.album ?? track.album,
          })),
        ]);
        setNextUrl(page.next);
      } else {
        const page = await spotify<{ items: { track: Track | null }[]; next: string | null }>(nextUrl);
        setTracks((current) => [...current, ...tracksOnly(page.items)]);
        setNextUrl(page.next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải thêm được');
    } finally {
      setLoadingMore(false);
    }
  }

  function playAt(index: number) {
    if (!header) return;
    if (header.contextUri) void playContext(header.contextUri, tracks[index]?.uri);
    else void playUris(tracks.map((track) => track.uri), index);
  }

  const playingHere =
    !!header &&
    !now.paused &&
    (header.contextUri ? now.contextUri === header.contextUri : tracks.some((track) => track.id === now.track?.id));

  if (error && !header) return <p className="error">{error}</p>;
  if (!header) return <div className="skel skel-hero" />;

  const duration = formatTotal(tracks.reduce((sum, track) => sum + (track.duration_ms || 0), 0));

  return (
    <div className="stack">
      <header className="hero" style={{ background: `linear-gradient(180deg, hsl(${header.hue} 42% 28%), transparent)` }}>
        {header.liked ? (
          <span className="cover liked-art hero-art">
            <HeartFillIcon size={48} />
          </span>
        ) : (
          <Cover src={header.image} alt="" round={header.round} className="hero-art" />
        )}
        <div className="hero-copy">
          <p className="eyebrow">{header.eyebrow}</p>
          <h2>{header.title}</h2>
          <p>
            {header.subtitle}
            {tracks.length > 0 ? ` · ${duration}` : ''}
          </p>
        </div>
      </header>
      <div className="hero-actions">
        <PlayFab
          playing={playingHere}
          onClick={() => {
            if (playingHere) void toggle();
            else if (header.contextUri) void playContext(header.contextUri);
            else void playUris(tracks.map((track) => track.uri), 0);
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {tracks.length > 0 && (
        <TrackTable tracks={tracks} showAlbum={view.name !== 'album'} onPlay={playAt} open={open} />
      )}
      {nextUrl && (
        <button className="chip more" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Đang tải…' : 'Tải thêm'}
        </button>
      )}
      {albums.length > 0 && (
        <section className="section">
          <h3>Đĩa nhạc</h3>
          <div className="hrow">
            {albums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.name}
                subtitle={`${albumKind(album.album_type)} · ${album.release_date?.slice(0, 4) ?? ''}`}
                image={art(album.images, 300)}
                onOpen={() => open({ name: 'album', id: album.id })}
                onPlay={() => void playContext(album.uri)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
