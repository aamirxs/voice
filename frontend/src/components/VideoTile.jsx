import React, { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import useAudioVolume from '../hooks/useAudioVolume';

const VideoTile = ({ stream, userName, avatarUrl, isVideoOff, isMuted, isPresenting, variant = 'grid' }) => {
  const mediaRef = useRef(null);

  const mediaCallback = React.useCallback((el) => {
    mediaRef.current = el;
    if (el && stream) {
      // Always re-assign srcObject — new MediaStream objects are created on
      // screen share toggle to force the element to pick up replaced tracks
      el.srcObject = stream;
      // Kick the element to render immediately (autoPlay can stall sometimes)
      el.play().catch(() => {});
    }
  }, [stream]);

  // When isPresenting changes, force the existing element to re-read the stream
  useEffect(() => {
    if (mediaRef.current && stream) {
      mediaRef.current.srcObject = stream;
      mediaRef.current.play().catch(() => {});
    }
  }, [isPresenting, stream]);

  // Temporarily disable useAudioVolume for remote streams to prevent 
  // the known Chrome bug where Web Audio API steals the MediaStream track
  // and silences the HTML media element.
  const isSpeaking = false;

  // Ensure we actually have an active video stream to play
  const hasActiveVideo = stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().length > 0;
  
  // Show avatar if explicitly turned off, OR if we don't have a valid video stream
  // BUT: if presenting (screen share), always show video regardless of camera state
  const showAvatar = isPresenting ? false : (isVideoOff || !hasActiveVideo);

  return (
    <div className={`video-tile-inner ${isSpeaking ? 'tile-speaking' : ''}`}>
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
