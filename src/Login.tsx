import { useState } from 'react';
import { beginLogin, getClientId, redirectUri, setClientId } from './lib/auth';
import { Mark } from './icons';

export function LoginScreen({ error }: { error: string }) {
  const [clientId, setId] = useState(getClientId());
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState(error);
  const callbackUri = redirectUri();
  const wrongHost = window.location.hostname === 'localhost';

  async function connect() {
    setMessage('');
    setClientId(clientId);
    try {
      await beginLogin();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không mở được Spotify.');
    }
  }

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
          <li>Trong Settings của app, thêm đúng Redirect URI bên dưới rồi bấm Save.</li>
          <li>Dán Client ID vào ô này. Không cần Client Secret.</li>
          <li>Đăng nhập bằng tài khoản đã tạo app. Chỉ gói Premium nghe được trong trình duyệt.</li>
        </ol>
        {wrongHost && (
          <p className="warn">
            Spotify không chấp nhận localhost. Mở http://127.0.0.1:5173 khi chạy trên máy.
          </p>
        )}
        <div className="uri">
          <code>{callbackUri}</code>
          <button type="button" className="ghost" onClick={() => void copyUri()}>
            {copied ? 'Đã chép' : 'Chép'}
          </button>
        </div>
        <label className="field">
          Client ID
          <input
            value={clientId}
            autoComplete="off"
            spellCheck={false}
            placeholder="32 ký tự từ Dashboard"
            onChange={(event) => setId(event.target.value)}
          />
        </label>
        {message && <p className="error">{message}</p>}
        <button className="primary" type="button" disabled={clientId.trim().length < 10 || wrongHost} onClick={() => void connect()}>
          Kết nối Spotify
        </button>
        <p className="fine">
          Nghe không tải nhạc về máy và không phát hộ người khác. Quyền nghe theo đúng gói Spotify bạn đang đăng nhập.
        </p>
      </section>
    </main>
  );
}
