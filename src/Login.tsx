import { useEffect, useState } from 'react';
import { beginLogin, redirectUri } from './lib/auth';
import { Mark } from './icons';

export function LoginScreen({ error }: { error: string }) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState(error);
  const [callbackUri, setCallbackUri] = useState('');
  const wrongHost = window.location.hostname === 'localhost';

  useEffect(() => {
    setMessage(error);
  }, [error]);

  useEffect(() => {
    redirectUri().then(setCallbackUri).catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Máy chủ proxy chưa chạy.');
    });
  }, []);

  async function copyUri() {
    try {
      await navigator.clipboard.writeText(callbackUri);
      setCopied(true);
    } catch {
      setMessage('Không copy được. Hãy chọn dòng Redirect URI và copy tay.');
    }
  }

  return (
    <main className="gate">
      <section className="gate-card">
        <div className="brand">
          <Mark size={40} />
          <div>
            <h1>Nghe</h1>
            <p>Trình phát cá nhân, nhạc chạy từ chính tài khoản Spotify của bạn.</p>
          </div>
        </div>
        <ol className="steps">
          <li>
            Tạo app tại{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
              Spotify for Developers
            </a>
            .
          </li>
          <li>Đặt Client ID và Client Secret trong file server/.env trên máy chủ. Trình duyệt không nhận secret.</li>
          <li>Trong Settings của app, thêm đúng Redirect URI bên dưới rồi bấm Save.</li>
          <li>Đăng nhập bằng tài khoản đã tạo app. Chỉ gói Premium nghe được trong trình duyệt.</li>
        </ol>
        {wrongHost && (
          <p className="warn">
            Spotify không chấp nhận localhost. Mở http://127.0.0.1:5173 khi chạy trên máy.
          </p>
        )}
        <div className="uri">
          <code>{callbackUri || 'Đang đọc Redirect URI từ máy chủ…'}</code>
          <button type="button" className="ghost" onClick={() => void copyUri()} disabled={!callbackUri}>
            {copied ? 'Đã chép' : 'Chép'}
          </button>
        </div>
        {message && <p className="error">{message}</p>}
        <button className="primary" type="button" disabled={!callbackUri || wrongHost} onClick={beginLogin}>
          Kết nối Spotify
        </button>
        <p className="fine">
          Nghe không tải nhạc về máy và không phát hộ người khác. Quyền nghe theo đúng gói Spotify bạn đang đăng nhập.
        </p>
      </section>
    </main>
  );
}
