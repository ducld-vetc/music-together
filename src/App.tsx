import { useCallback, useEffect, useState } from 'react';
import { LoginScreen } from './Login';
import { finishLoginFromUrl, getTokens } from './lib/auth';
import { PlayerProvider } from './player';
import { Shell } from './Shell';

export function App() {
  const [phase, setPhase] = useState<'boot' | 'login' | 'app'>('boot');
  const [error, setError] = useState('');
  const showLogin = useCallback(() => setPhase('login'), []);

  useEffect(() => {
    finishLoginFromUrl()
      .then((loggedIn) => {
        setPhase(loggedIn || getTokens() ? 'app' : 'login');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
        setPhase('login');
      });
  }, []);

  if (phase === 'boot') {
    return (
      <main className="gate">
        <p>Đang mở Nghe…</p>
      </main>
    );
  }
  if (phase === 'login') return <LoginScreen error={error} />;
  return (
    <PlayerProvider onLogout={showLogin}>
      <Shell />
    </PlayerProvider>
  );
}
