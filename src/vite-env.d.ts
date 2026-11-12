/// <reference types="vite/client" />

interface SpotifySdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: 'ready' | 'not_ready', cb: (data: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (state: SpotifySdkState | null) => void): boolean;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
    cb: (error: { message: string }) => void,
  ): boolean;
  removeListener(event: string, cb?: (...args: never[]) => void): void;
  getCurrentState(): Promise<SpotifySdkState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  activateElement(): Promise<void>;
}

interface SpotifySdkTrack {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { uri: string; name: string }[];
  album: { uri: string; name: string; images: { url: string }[] };
}

interface SpotifySdkState {
  paused: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat_mode: 0 | 1 | 2;
  context: { uri: string } | null;
  track_window: { current_track: SpotifySdkTrack | null };
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: {
    Player: new (options: {
      name: string;
      getOAuthToken: (callback: (token: string) => void) => void;
      volume?: number;
      enableMediaSession?: boolean;
    }) => SpotifySdkPlayer;
  };
}
