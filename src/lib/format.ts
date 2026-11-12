import type { Image } from '../types';

export function art(images: Image[] | { url: string }[] | undefined, min = 240): string {
  if (!images?.length) return '';
  const sized = images as Image[];
  const fit = [...sized].reverse().find((image) => !image.width || image.width >= min);
  return (fit ?? sized[0]).url;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatTotal(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${minutes % 60} phút`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(n);
}

export function plainText(value: string | null | undefined): string {
  if (!value) return '';
  const node = document.createElement('textarea');
  node.innerHTML = value;
  return node.value.replace(/<[^>]+>/g, '').trim();
}

export function hueFrom(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) % 360;
  return hash;
}

export function uriId(uri: string | undefined): string {
  if (!uri) return '';
  const parts = uri.split(':');
  return parts.length >= 3 ? parts[2] : '';
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function humanError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('premium')) return 'Cần Spotify Premium để phát nhạc trong trình duyệt.';
  if (text.includes('restriction') || text.includes('not available')) {
    return 'Spotify không cho phát bài này với khu vực hoặc gói hiện tại.';
  }
  if (text.includes('device')) return 'Chưa kết nối được trình phát. Tải lại trang rồi thử lại.';
  if (text.includes('token') || text.includes('unauthorized') || text.includes('phiên')) {
    return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.';
  }
  return message;
}

export function albumKind(type?: string): string {
  if (type === 'single') return 'Đĩa đơn';
  if (type === 'compilation') return 'Tuyển tập';
  return 'Album';
}
