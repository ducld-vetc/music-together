import { useEffect, useRef, useState } from 'react';
import { DetailScreen } from './Detail';
import { HomeScreen } from './Home';
import { LibraryScreen } from './Library';
import { SearchScreen } from './Search';
import { ChevronLeft, ChevronRight, CloseIcon, HomeIcon, LibraryIcon, Mark, MenuIcon, SearchIcon } from './icons';
import { spotify } from './lib/api';
import { art } from './lib/format';
import { PlayerBar } from './PlayerBar';
import { usePlayer } from './player';
import type { Paging, Playlist, View } from './types';

function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function Shell() {
  const { user, notice, premiumError, logout } = usePlayer();
  const [stack, setStack] = useState<View[]>([{ name: 'home' }]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [query, setQuery] = useState('');
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const view = stack[index] ?? { name: 'home' as const };

  useEffect(() => {
    spotify<Paging<Playlist>>('/me/playlists?limit=40')
      .then((page) => setPlaylists(page.items.filter((item) => item?.id)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
    setSolid(false);
  }, [index]);

  function open(next: View) {
    const current = stack[indexRef.current];
    if (current && sameView(current, next)) {
      setMenu(false);
      return;
    }
    setStack((items) => {
      const history = [...items.slice(0, indexRef.current + 1), next];
      indexRef.current = history.length - 1;
      setIndex(indexRef.current);
      return history;
    });
    setMenu(false);
  }

  function step(delta: number) {
    setIndex((current) => {
      const next = Math.min(stack.length - 1, Math.max(0, current + delta));
      indexRef.current = next;
      return next;
    });
  }

  function onQuery(value: string) {
    setQuery(value);
    if (value.trim() && view.name !== 'search') open({ name: 'search' });
  }

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'show' : ''}`}>
        <button className="brand-btn" onClick={() => open({ name: 'home' })}>
          <Mark size={32} />
          <span>Nghe</span>
        </button>
        <nav>
          <button className={view.name === 'home' ? 'on' : ''} onClick={() => open({ name: 'home' })}>
            <HomeIcon /> Trang chủ
          </button>
          <button className={view.name === 'search' ? 'on' : ''} onClick={() => open({ name: 'search' })}>
            <SearchIcon /> Tìm kiếm
          </button>
          <button className={view.name === 'library' ? 'on' : ''} onClick={() => open({ name: 'library' })}>
            <LibraryIcon /> Thư viện
          </button>
        </nav>
        <p className="side-label">Playlist của bạn</p>
        <div className="side-scroll">
          <button className={view.name === 'liked' ? 'plist on' : 'plist'} onClick={() => open({ name: 'liked' })}>
            <span className="dot" /> Đã thích
          </button>
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className={view.name === 'playlist' && view.id === playlist.id ? 'plist on' : 'plist'}
              onClick={() => open({ name: 'playlist', id: playlist.id })}
            >
              {art(playlist.images, 64) ? <img src={art(playlist.images, 64)} alt="" /> : <span className="dot" />}
              <span>{playlist.name}</span>
            </button>
          ))}
        </div>
        <div className="userrow">
          {user?.images?.[0]?.url ? <img src={user.images[0].url} alt="" /> : <span className="avatar">{user?.display_name?.[0] ?? 'N'}</span>}
          <span>{user?.display_name || 'Spotify'}</span>
          <button className="ghost" onClick={logout}>
            Thoát
          </button>
        </div>
      </aside>
      {menu && <button className="backdrop" aria-label="Đóng menu" onClick={() => setMenu(false)} />}
      <div className="main">
        <div
          className="content"
          ref={scroller}
          onScroll={(event) => setSolid(event.currentTarget.scrollTop > 16)}
        >
          <header className={`topbar ${solid ? 'solid' : ''}`}>
            <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setMenu(true)}>
              <MenuIcon />
            </button>
            <button className="icon-btn" aria-label="Quay lại" disabled={index === 0} onClick={() => step(-1)}>
              <ChevronLeft />
            </button>
            <button className="icon-btn" aria-label="Tiếp" disabled={index >= stack.length - 1} onClick={() => step(1)}>
              <ChevronRight />
            </button>
            <label className="searchbox">
              <SearchIcon size={18} />
              <input
                value={query}
                placeholder="Bạn muốn nghe gì?"
                onChange={(event) => onQuery(event.target.value)}
              />
              {query && (
                <button type="button" aria-label="Xóa" onClick={() => setQuery('')}>
                  <CloseIcon />
                </button>
              )}
            </label>
          </header>
          {premiumError && <p className="banner">{premiumError}</p>}
          {view.name === 'home' && <HomeScreen open={open} />}
          {view.name === 'search' && <SearchScreen query={query} open={open} onQuery={onQuery} />}
          {view.name === 'library' && <LibraryScreen open={open} />}
          {(view.name === 'playlist' || view.name === 'album' || view.name === 'artist' || view.name === 'liked') && (
            <DetailScreen view={view} open={open} />
          )}
        </div>
      </div>
      <PlayerBar open={open} />
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
