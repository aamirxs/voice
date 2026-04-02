import { useState, useEffect } from 'react';
import Room from './components/Room';
import { Video, Link2, Copy, Check, Sparkles, Shield, Zap, RefreshCw } from 'lucide-react';
import './index.css';

const generateToken = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

function App() {
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('savedUserName') || '');
  const [fromLink, setFromLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [avatarSeed, setAvatarSeed] = useState(() => localStorage.getItem('savedAvatarSeed') || Math.random().toString(36).substring(7));
  const [userToken, setUserToken] = useState(() => {
    let token = localStorage.getItem('userToken');
    if (!token) {
      token = generateToken();
      localStorage.setItem('userToken', token);
    }
    return token;
  });

  const avatarUrl = `https://api.dicebear.com/9.x/lorelei/svg?seed=${avatarSeed}&scale=120&backgroundColor=b6e3f4,c0aede,d1d4f9`;

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/room\/(.+)$/);
    if (match) {
      setRoomId(decodeURIComponent(match[1]));
      setFromLink(true);
    }
  }, []);

  const generateRoom = () => {
    const id = Math.random().toString(36).substring(2, 9);
    setRoomId(id);
    document.getElementById('name-input')?.focus();
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (roomId && userName) {
      localStorage.setItem('savedUserName', userName);
      localStorage.setItem('savedAvatarSeed', avatarSeed);
      window.history.pushState({}, '', `/room/${roomId}`);
      setJoined(true);
    }
  };

  const handleLeave = () => {
    setJoined(false);
    window.history.pushState({}, '', '/');
  };

  const getShareLink = () => `${window.location.origin}/room/${roomId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(getShareLink()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (joined) {
    return <Room roomId={roomId} userName={userName} avatarUrl={avatarUrl} userToken={userToken} onLeave={handleLeave} shareLink={getShareLink()} />;
  }

  return (
    <div className="join-screen">
      {/* Animated background orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <div className="join-card">
        {/* Logo */}
        <div className="join-logo">
          <div className="join-logo-icon">
            <Video size={28} strokeWidth={2} />
          </div>
          <h1 className="join-title">Stream Room</h1>
          <p className="join-subtitle">Premium video conferencing for everyone</p>
        </div>

        {fromLink && (
          <div className="link-invite-banner">
            <Link2 size={16} />
            <span>You've been invited to room <strong>{roomId}</strong></span>
          </div>
        )}
        
        <div className="join-avatar-section">
          <div className="join-avatar-preview">
            <img src={avatarUrl} alt="Avatar Preview" />
            <button className="join-avatar-shuffle" aria-label="Shuffle Avatar" title="Shuffle Avatar" onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <form onSubmit={joinRoom} className="join-form">
          <div className="input-group">
            <label className="input-label" htmlFor="name-input">Your name</label>
            <input 
              type="text" 
              placeholder="Enter your name" 
              className="join-input"
              value={userName}
              id="name-input"
              onChange={e => setUserName(e.target.value)}
              autoFocus
              required
            />
          </div>

          {!fromLink && (
            <div className="input-group">
              <label className="input-label">Room code</label>
              <input 
                type="text" 
                placeholder="Enter a code or create new" 
                className="join-input"
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                required
              />
            </div>
          )}

          <div className="join-actions">
            {!fromLink && (
              <button type="button" className="join-btn join-btn-secondary" onClick={generateRoom}>
                <Sparkles size={16} />
                New Meeting
              </button>
            )}
            <button type="submit" className="join-btn join-btn-primary">
              <Zap size={16} />
              {fromLink ? 'Join Now' : 'Join'}
            </button>
          </div>

          {roomId && !fromLink && (
            <button type="button" className="copy-link-btn" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Link Copied!' : 'Copy Invite Link'}
            </button>
          )}
        </form>

        {/* Features strip */}
        <div className="join-features">
          <div className="join-feature">
            <Shield size={14} />
            <span>End-to-end encrypted</span>
          </div>
          <div className="join-feature">
            <Zap size={14} />
            <span>HD quality</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
