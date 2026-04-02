import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Smile, Wand2, MoreVertical, ChevronUp, LayoutGrid, Columns, Maximize, Sparkles, Check } from 'lucide-react';
import Soundbar from './Soundbar';

const LAYOUT_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: Sparkles, description: 'Smart layout switching' },
  { id: 'tiled', label: 'Tiled', icon: LayoutGrid, description: 'Equal grid for everyone' },
  { id: 'sidebar', label: 'Sidebar', icon: Columns, description: 'Speaker + thumbnails' },
  { id: 'spotlight', label: 'Spotlight', icon: Maximize, description: 'Focus on one person' },
];

const Controls = ({ 
  isMuted, 
  isVideoOff, 
  isScreenSharing, 
  layoutMode,
  onToggleMute, 
  onToggleVideo, 
  onToggleScreenShare, 
  onChangeLayout,
  onPlaySound,
  onLeave,
  onSendEmoji,
  emojis = [],
  audioDevices = [],
  videoDevices = [],
  selectedAudioId = 'default',
  selectedVideoId = 'default',
  onSelectAudio,
  onSelectVideo
}) => {
  const [showSoundbar, setShowSoundbar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  
  const moreMenuRef = useRef(null);
  const micMenuRef = useRef(null);
  const videoMenuRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setShowMoreMenu(false);
      if (micMenuRef.current && !micMenuRef.current.contains(e.target)) setShowMicMenu(false);
      if (videoMenuRef.current && !videoMenuRef.current.contains(e.target)) setShowVideoMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeAllPopups = () => {
    setShowSoundbar(false);
    setShowEmojiPicker(false);
    setShowMoreMenu(false);
    setShowMicMenu(false);
    setShowVideoMenu(false);
  };

  return (
    <div className="controls-row">
      {/* Mic with chevron */}
      <div className="control-group" ref={micMenuRef} style={{ position: 'relative' }}>
        {showMicMenu && audioDevices.length > 0 && (
          <div className="more-menu-popup device-menu-popup">
            <div className="more-menu-header">Microphone</div>
            {audioDevices.map(d => (
              <button 
                key={d.deviceId} 
                className={`more-menu-item ${selectedAudioId === d.deviceId ? 'more-menu-item-active' : ''}`}
                onClick={() => { onSelectAudio(d.deviceId); setShowMicMenu(false); }}
              >
                <div className="more-menu-item-text">
                  <span className="more-menu-item-label">{d.label || 'Default Microphone'}</span>
                </div>
                {selectedAudioId === d.deviceId && <Check size={16} className="more-menu-check" />}
              </button>
            ))}
          </div>
        )}
        <button className="ctrl-chevron" onClick={() => { closeAllPopups(); setShowMicMenu(!showMicMenu); }}>
          <ChevronUp size={14} />
        </button>
        <button className={`ctrl-btn ${isMuted ? 'ctrl-danger' : ''}`} onClick={onToggleMute}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
      </div>

      {/* Camera with chevron */}
      <div className="control-group" ref={videoMenuRef} style={{ position: 'relative' }}>
        {showVideoMenu && videoDevices.length > 0 && (
          <div className="more-menu-popup device-menu-popup">
            <div className="more-menu-header">Camera</div>
            {videoDevices.map(d => (
              <button 
                key={d.deviceId} 
                className={`more-menu-item ${selectedVideoId === d.deviceId ? 'more-menu-item-active' : ''}`}
                onClick={() => { onSelectVideo(d.deviceId); setShowVideoMenu(false); }}
              >
                <div className="more-menu-item-text">
                  <span className="more-menu-item-label">{d.label || 'Default Camera'}</span>
                </div>
                {selectedVideoId === d.deviceId && <Check size={16} className="more-menu-check" />}
              </button>
            ))}
          </div>
        )}
        <button className="ctrl-chevron" onClick={() => { closeAllPopups(); setShowVideoMenu(!showVideoMenu); }}>
          <ChevronUp size={14} />
        </button>
        <button className={`ctrl-btn ${isVideoOff ? 'ctrl-danger' : ''}`} onClick={onToggleVideo}>
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
      </div>

      {/* Screen Share */}
      <button className={`ctrl-btn ${isScreenSharing ? 'ctrl-active' : ''}`} onClick={onToggleScreenShare}>
        <MonitorUp size={20} />
      </button>

      {/* Emoji Picker */}
      <div style={{ position: 'relative' }}>
        {showEmojiPicker && (
          <div className="emoji-picker-popup">
            {emojis.map((emoji, i) => (
              <button 
                key={i} 
                className="emoji-pick-btn"
                onClick={() => {
                  onSendEmoji(emoji);
                  setShowEmojiPicker(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button className="ctrl-btn" onClick={() => { closeAllPopups(); setShowEmojiPicker(!showEmojiPicker); }}>
          <Smile size={20} />
        </button>
      </div>

      {/* Soundboard */}
      <div style={{ position: 'relative' }}>
        {showSoundbar && <Soundbar onPlaySound={(id) => { onPlaySound(id); setShowSoundbar(false); }} />}
        <button className="ctrl-btn" onClick={() => { closeAllPopups(); setShowSoundbar(!showSoundbar); }}>
          <Wand2 size={20} />
        </button>
      </div>

      {/* More — Layout Picker */}
      <div style={{ position: 'relative' }} ref={moreMenuRef}>
        {showMoreMenu && (
          <div className="more-menu-popup">
            <div className="more-menu-header">Change Layout</div>
            {LAYOUT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isActive = layoutMode === opt.id;
              return (
                <button
                  key={opt.id}
                  className={`more-menu-item ${isActive ? 'more-menu-item-active' : ''}`}
                  onClick={() => {
                    onChangeLayout(opt.id);
                    setShowMoreMenu(false);
                  }}
                >
                  <Icon size={18} />
                  <div className="more-menu-item-text">
                    <span className="more-menu-item-label">{opt.label}</span>
                    <span className="more-menu-item-desc">{opt.description}</span>
                  </div>
                  {isActive && <Check size={16} className="more-menu-check" />}
                </button>
              );
            })}
          </div>
        )}
        <button className="ctrl-btn" onClick={() => { closeAllPopups(); setShowMoreMenu(!showMoreMenu); }}>
          <MoreVertical size={20} />
        </button>
      </div>

      {/* End Call */}
      <button className="ctrl-btn ctrl-end" onClick={onLeave}>
        <PhoneOff size={20} />
      </button>
    </div>
  );
};

export default Controls;
