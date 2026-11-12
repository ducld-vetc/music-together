export type Image = { url: string; width: number | null; height: number | null };

export type Artist = {
  id: string;
  name: string;
  uri: string;
  images?: Image[];
  genres?: string[];
  followers?: { total: number };
};

export type Album = {
  id: string;
  name: string;
  uri: string;
  images: Image[];
  album_type?: string;
  release_date?: string;
  total_tracks?: number;
  artists: { id?: string; name: string; uri: string }[];
  tracks?: Paging<Track>;
};

export type Track = {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit?: boolean;
  is_local?: boolean;
  is_playable?: boolean;
  type?: string;
  artists: { id?: string; name: string; uri: string }[];
  album?: {
    id: string;
    name: string;
    uri: string;
    images?: Image[];
    artists?: { id?: string; name: string; uri: string }[];
  };
};

export type Playlist = {
  id: string;
  name: string;
  uri: string;
  description?: string | null;
  images?: Image[];
  owner?: { display_name?: string | null };
  tracks: { total: number; href?: string; items?: { track: Track | null }[]; next?: string | null };
};

export type Paging<T> = {
  items: T[];
  next: string | null;
  total: number;
};

export type UserProfile = {
  id: string;
  display_name: string | null;
  images?: Image[];
  product?: string;
  country?: string;
};

export type View =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'playlist'; id: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'liked' };

export function tracksOnly(items: { track: Track | null }[] | undefined): Track[] {
  return (items ?? [])
    .map((item) => item.track)
    .filter((track): track is Track => !!track && !track.is_local && track.type !== 'episode' && !!track.id && !!track.uri);
}
