import { useCallback, useEffect, useState } from 'react';
import { LoginScreen } from './Login';
import { consumeAuthRedirect, hasSession } from './lib/auth';
import { PlayerProvider } from './player';
import { Shell } from './Shell';

export function App() {
  const [phase, setPhase] = useState<'boot' | 'login' | 'app'>('boot');
  const [error, setError] = useState('');
  const showLogin = useCallback(() => setPhase('login'), []);

  useEffect(() => {
    const authError = consumeAuthRedirect();
    if (authError) {
      setError(authError);
      setPhase('login');
      return;
    }
    hasSession()
      .then((loggedIn) => setPhase(loggedIn ? 'app' : 'login'))
      .catch(() => {
        setError('Không kết nối được máy chủ proxy.');
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
