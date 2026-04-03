import React, { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';

const VideoTile = ({ stream, userName, avatarUrl, isVideoOff, isMuted, isPresenting, variant = 'grid' }) => {
  const mediaRef = useRef(null);

  const mediaCallback = React.useCallback((el) => {
    mediaRef.current = el;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);

  // Re-set srcObject when stream or presenting state changes
  useEffect(() => {
    if (mediaRef.current && stream) {
      mediaRef.current.srcObject = stream;
      mediaRef.current.play().catch(() => {});
    }
  }, [stream, isPresenting]);

  // Ensure we actually have an active video stream
  const hasActiveVideo = stream && typeof stream.getVideoTracks === 'function' 
    && stream.getVideoTracks().length > 0;
  
  // Show avatar if camera off or no video, but always show video if presenting
  const showAvatar = isPresenting ? false : (isVideoOff || !hasActiveVideo);

  return (
    <div className={`video-tile-inner`}>
      {showAvatar ? (
        <>
          <div 
            className="avatar-center" 
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}
          >
            <img 
              src={avatarUrl || `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(userName)}&scale=120&backgroundColor=b6e3f4,c0aede,d1d4f9`} 
              alt={`${userName}'s avatar`}
              className={`user-avatar ${variant === 'pip' ? 'pip-avatar' : ''}`}
              style={{ 
                width: variant === 'pip' ? '60px' : '140px', 
                height: variant === 'pip' ? '60px' : '140px', 
                borderRadius: '50%', 
                objectFit: 'cover',
                border: variant === 'pip' ? '2px solid rgba(255,255,255,0.1)' : '3px solid rgba(255,255,255,0.1)'
              }} 
            />
          </div>
          <audio ref={mediaCallback} autoPlay playsInline />
        </>
      ) : (
        <video 
          ref={mediaCallback} 
          autoPlay 
          playsInline 
          className={isPresenting ? 'screen-share-video' : ''} 
        />
      )}
      <div className="tile-name-label">{userName}</div>
      {isMuted && (
        <div className="tile-mute-indicator">
          <MicOff size={variant === 'pip' ? 12 : 14} strokeWidth={2.5} color="#fbbf24" />
        </div>
      )}
    </div>
  );
};

export default VideoTile;
