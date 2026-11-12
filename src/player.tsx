import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearSession, ensureAccessToken } from './lib/auth';
import { spotify } from './lib/api';
import { humanError } from './lib/format';
import type { UserProfile } from './types';

export type NowTrack = {
  id: string;
  uri: string;
  name: string;
  artists: { uri: string; name: string }[];
  albumName: string;
  albumUri: string;
  image: string;
};

export type NowPlaying = {
  paused: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: 0 | 1 | 2;
  contextUri: string | null;
  track: NowTrack | null;
};

type PlayerContextValue = {
  user: UserProfile | null;
  deviceId: string | null;
  now: NowPlaying;
  volume: number;
  notice: string | null;
  premiumError: string | null;
  dismissNotice: () => void;
  playContext: (contextUri: string, offsetUri?: string) => Promise<void>;
  playUris: (uris: string[], index?: number) => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVolume: (value: number) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  toggleSave: (id: string, saved: boolean) => Promise<void>;
  logout: () => void;
};

const emptyNow: NowPlaying = {
  paused: true,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 0,
  contextUri: null,
  track: null,
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const playerRef = useRef<SpotifySdkPlayer | null>(null);
  const deviceRef = useRef<string | null>(null);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<0 | 1 | 2>(0);
  const volRef = useRef(Number(localStorage.getItem('nghe.volume') ?? '0.8') || 0.8);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState<NowPlaying>(emptyNow);
  const [volume, setVol] = useState(volRef.current);
  const [notice, setNotice] = useState<string | null>(null);
  const [premiumError, setPremiumError] = useState<string | null>(null);

  const fail = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Không phát được';
    setNotice(humanError(message));
  }, []);

  const logout = useCallback(() => {
    playerRef.current?.disconnect();
    clearSession();
    onLogout();
  }, [onLogout]);

  useEffect(() => {
    const onSessionEnd = () => {
      playerRef.current?.disconnect();
      onLogout();
    };
    window.addEventListener('nghe:logout', onSessionEnd);
    return () => window.removeEventListener('nghe:logout', onSessionEnd);
  }, [onLogout]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let dead = false;
    spotify<UserProfile>('/me')
      .then((profile) => {
        if (dead) return;
        setUser(profile);
        if (profile.product && profile.product !== 'premium') {
          setPremiumError('Tài khoản này không phải Premium. Bạn vẫn xem được thư viện, nhưng Spotify chỉ phát trong trình duyệt với Premium.');
        }
      })
      .catch((error: unknown) => {
        if (!dead) fail(error);
      });
    return () => {
      dead = true;
    };
  }, [fail]);

  useEffect(() => {
    let dead = false;
    let player: SpotifySdkPlayer | null = null;

    const waitForSdk = () =>
      new Promise<void>((resolve) => {
        if (window.Spotify) {
          resolve();
          return;
        }
        const previous = window.onSpotifyWebPlaybackSDKReady;
        window.onSpotifyWebPlaybackSDKReady = () => {
          previous?.();
          resolve();
        };
        const timer = window.setInterval(() => {
          if (window.Spotify) {
            window.clearInterval(timer);
            resolve();
          }
        }, 200);
      });

    const boot = async () => {
      await waitForSdk();
      if (dead || !window.Spotify) return;
      player = new window.Spotify.Player({
        name: 'Nghe',
        volume: volRef.current,
        enableMediaSession: true,
        getOAuthToken: (callback) => {
          ensureAccessToken().then(callback).catch(() => callback(''));
        },
      });
      playerRef.current = player;
      player.addListener('ready', ({ device_id }) => {
        deviceRef.current = device_id;
        setDeviceId(device_id);
      });
      player.addListener('not_ready', () => {
        deviceRef.current = null;
        setDeviceId(null);
      });
      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        const current = state.track_window.current_track;
        shuffleRef.current = state.shuffle;
        repeatRef.current = state.repeat_mode;
        const track = current?.id
          ? {
              id: current.id,
              uri: current.uri,
              name: current.name,
              artists: current.artists,
              albumName: current.album?.name ?? '',
              albumUri: current.album?.uri ?? '',
              image: current.album?.images?.[0]?.url ?? '',
            }
          : null;
        setNow({
          paused: state.paused,
          position: state.position,
          duration: state.duration,
          shuffle: state.shuffle,
          repeat: state.repeat_mode,
          contextUri: state.context?.uri ?? null,
          track,
        });
        if (track) document.title = `${track.name} · Nghe`;
      });
      player.addListener('account_error', ({ message }) => {
        setPremiumError(humanError(message));
      });
      player.addListener('authentication_error', () => {
        setNotice('Phiên Spotify bị từ chối. Hãy đăng nhập lại.');
      });
      player.addListener('playback_error', ({ message }) => setNotice(humanError(message)));
      player.addListener('initialization_error', ({ message }) => setNotice(humanError(message)));
      await player.connect();
    };

    void boot();
    return () => {
      dead = true;
      player?.disconnect();
      playerRef.current = null;
    };
  }, []);

  const withDevice = useCallback(
    async (body: unknown) => {
      try {
        await playerRef.current?.activateElement();
        const device = deviceRef.current;
        if (!device) throw new Error('Trình phát chưa sẵn sàng. Đợi vài giây rồi thử lại.');
        await spotify(`/me/player/play?device_id=${encodeURIComponent(device)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } catch (error) {
        fail(error);
      }
    },
    [fail],
  );

  const playContext = useCallback(
    async (contextUri: string, offsetUri?: string) => {
      await withDevice({
        context_uri: contextUri,
        ...(offsetUri ? { offset: { uri: offsetUri } } : {}),
      });
    },
    [withDevice],
  );

  const playUris = useCallback(
    async (uris: string[], index = 0) => {
      if (!uris.length) return;
      const start = Math.max(0, Math.min(index, uris.length - 1));
      const from = Math.max(0, start - 20);
      const slice = uris.slice(from, from + 100);
      await withDevice({ uris: slice, offset: { position: start - from } });
    },
    [withDevice],
  );

  const toggle = useCallback(async () => {
    try {
      await playerRef.current?.activateElement();
      await playerRef.current?.togglePlay();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const next = useCallback(async () => {
    try {
      await playerRef.current?.nextTrack();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const prev = useCallback(async () => {
    try {
      await playerRef.current?.previousTrack();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const seek = useCallback(
    async (ms: number) => {
      try {
        await playerRef.current?.seek(Math.max(0, ms));
      } catch (error) {
        fail(error);
      }
    },
    [fail],
  );

  const setVolume = useCallback(async (value: number) => {
    const nextVolume = Math.min(1, Math.max(0, value));
    volRef.current = nextVolume;
    setVol(nextVolume);
    localStorage.setItem('nghe.volume', String(nextVolume));
    try {
      await playerRef.current?.setVolume(nextVolume);
    } catch {
      /* the slider still reflects the chosen level */
    }
  }, []);

  const toggleShuffle = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) return;
    try {
      await spotify(`/me/player/shuffle?state=${!shuffleRef.current}&device_id=${device}`, { method: 'PUT' });
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const cycleRepeat = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) return;
    const modes = ['off', 'context', 'track'] as const;
    const mode = modes[(repeatRef.current + 1) % 3];
    try {
      await spotify(`/me/player/repeat?state=${mode}&device_id=${device}`, { method: 'PUT' });
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const toggleSave = useCallback(
    async (id: string, saved: boolean) => {
      window.dispatchEvent(new CustomEvent('nghe:saved', { detail: { id, saved: !saved } }));
      try {
        await spotify(`/me/tracks?ids=${id}`, { method: saved ? 'DELETE' : 'PUT' });
      } catch (error) {
        window.dispatchEvent(new CustomEvent('nghe:saved', { detail: { id, saved } }));
        fail(error);
      }
    },
    [fail],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void toggle();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        void playerRef.current?.getCurrentState().then((state) => {
          if (state) void seek(state.position + 5000);
        });
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        void playerRef.current?.getCurrentState().then((state) => {
          if (state) void seek(state.position - 5000);
        });
      } else if (event.code === 'ArrowUp') {
        event.preventDefault();
        void setVolume(volRef.current + 0.05);
      } else if (event.code === 'ArrowDown') {
        event.preventDefault();
        void setVolume(volRef.current - 0.05);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, setVolume, toggle]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      user,
      deviceId,
      now,
      volume,
      notice,
      premiumError,
      dismissNotice: () => setNotice(null),
      playContext,
      playUris,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      toggleSave,
      logout,
    }),
    [
      user,
      deviceId,
      now,
      volume,
      notice,
      premiumError,
      playContext,
      playUris,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      toggleSave,
      logout,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer nằm ngoài PlayerProvider');
  return value;
}
