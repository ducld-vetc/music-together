import type { ReactNode } from 'react';

type IconProps = { size?: number };

function base(size: number, body: ReactNode, filled = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

export function Mark({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1ed760" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="#06210f" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="2" fill="#06210f" />
    </svg>
  );
}

export function PlayIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M8 5.2v13.6L19.2 12 8 5.2z" />, true);
}

export function PauseIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M6.5 5h3.4v14H6.5zM14.1 5H17.5v14h-3.4z" />, true);
}

export function NextIcon({ size = 20 }: IconProps) {
  return base(size, <path d="M5.5 5.2v13.6L15 12 5.5 5.2zM16.8 5.2h2.2v13.6h-2.2z" />, true);
}

export function PrevIcon({ size = 20 }: IconProps) {
  return base(size, <path d="M18.5 5.2v13.6L9 12l9.5-6.8zM5 5.2h2.2v13.6H5z" />, true);
}

export function HomeIcon({ size = 22 }: IconProps) {
  return base(size, <path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1v-9.4z" />, true);
}

export function SearchIcon({ size = 20 }: IconProps) {
  return base(size, <><circle cx="11" cy="11" r="6.25" /><path d="m16 16 4 4" /></>);
}

export function LibraryIcon({ size = 22 }: IconProps) {
  return base(size, <><rect x="3.5" y="4" width="7" height="16" rx="1.2" /><rect x="13" y="4" width="7.5" height="16" rx="1.2" /></>, true);
}

export function HeartIcon({ size = 16 }: IconProps) {
  return base(size, <path d="M12 19.4 4.7 12.4a4.2 4.2 0 0 1 6-5.9L12 7.7l1.3-1.2a4.2 4.2 0 0 1 6 5.9L12 19.4z" />);
}

export function HeartFillIcon({ size = 16 }: IconProps) {
  return base(size, <path d="M12 19.4 4.7 12.4a4.2 4.2 0 0 1 6-5.9L12 7.7l1.3-1.2a4.2 4.2 0 0 1 6 5.9L12 19.4z" />, true);
}

export function ChevronLeft({ size = 18 }: IconProps) {
  return base(size, <path d="m14.5 5-7 7 7 7" />);
}

export function ChevronRight({ size = 18 }: IconProps) {
  return base(size, <path d="m9.5 5 7 7-7 7" />);
}

export function CloseIcon({ size = 16 }: IconProps) {
  return base(size, <path d="m6 6 12 12M18 6 6 18" />);
}

export function MenuIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M4 7h16M4 12h16M4 17h16" />);
}

export function ShuffleIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M4 7h3.2c2.4 0 3.8 1.2 5.3 3.2L16 15.2c.8 1 1.6 1.6 2.8 1.6H20M20 6.2l2 2-2 2M4 17h3.2c1.2 0 2-.6 2.8-1.6M20 17.8l2-2-2-2" />);
}

export function RepeatIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M17 3.5 20 6.2 17 9M4 12a6 6 0 0 1 6-6h10M7 20.5 4 17.8 7 15M20 12a6 6 0 0 1-6 6H4" />);
}

export function VolumeIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M4 10h3.2L12 6.2v11.6L7.2 14H4v-4zM15.2 9.2a3.6 3.6 0 0 1 0 5.6M17.4 7a6.4 6.4 0 0 1 0 10" />);
}

export function VolumeOffIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M4 10h3.2L12 6.2v11.6L7.2 14H4v-4zM16 10l4 4M20 10l-4 4" />);
}

export function QueueIcon({ size = 18 }: IconProps) {
  return base(size, <path d="M4 7h10M4 12h10M4 17h6M16 10v8M16 14l3-2.2L16 10" />);
}

export function NoteIcon({ size = 28 }: IconProps) {
  return base(size, <path d="M10 17.5a2.6 2.6 0 1 1-1.8-2.5V6.2l9-1.6v8.2" />, true);
}
