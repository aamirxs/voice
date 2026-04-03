import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Mic, MicOff, PhoneOff, Monitor, MonitorOff, Video, VideoOff, MessageCircle, MessageSquare, Settings, Users, LayoutGrid, MonitorPlay, Sparkles, Smile, PenTool, Check, Link2 } from 'lucide-react';
import { io } from 'socket.io-client';
import { Room as LKRoom, RoomEvent, Track, ConnectionState } from 'livekit-client';
import useAudioVolume from '../hooks/useAudioVolume';
import VideoTile from './VideoTile';
import Soundbar from './Soundbar';
import Whiteboard from './Whiteboard';
import Controls from './Controls';
import ChatPanel from './ChatPanel';

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : window.location.origin
);

// LiveKit WebSocket URL — connects via Nginx proxy in production, direct in dev
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'ws://localhost:7880'
    : `wss://${window.location.hostname}/livekit/`
);

const EMOJI_LIST = ['👍', '👏', '😂', '❤️', '🎉', '🔥', '😮', '😢'];

const getSoundEmoji = (soundData) => {
  if (typeof soundData === 'string') {
    switch(soundData) {
      case 'airhorn': return '📣';
      case 'ba_dum_tss': return '🥁';
      case 'clap': return '👏';
      case 'cricket': return '🦗';
      case 'sad_horn': return '🎻';
      default: return '🎵';
    }
  }
  return '🎧';
};

const Room = ({ roomId, userName, avatarUrl, userToken, onLeave, shareLink }) => {
  // Peer tracks from LiveKit: { participantIdentity: { videoTrack, audioTrack, screenTrack, screenAudioTrack } }
  const [peers, setPeers] = useState({});
  const [peerNames, setPeerNames] = useState({});
  const [peerAvatars, setPeerAvatars] = useState({});
  const [peerVideoStates, setPeerVideoStates] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [hostId, setHostId] = useState(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const isVideoOffRef = useRef(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const isScreenSharingRef = useRef(false);

  // Devices State
  const [availableDevices, setAvailableDevices] = useState({ audio: [], video: [] });
  const [selectedAudioId, setSelectedAudioId] = useState('default');
  const [selectedVideoId, setSelectedVideoId] = useState('default');

  // Layout mode: 'auto' | 'tiled' | 'sidebar' | 'spotlight'
  const [layoutMode, setLayoutMode] = useState('auto');

  // Multi-presenter and pinning tracking
  const [presenterIds, setPresenterIds] = useState([]);
  const [pinnedUser, setPinnedUser] = useState(null);

  // Audio mute tracking
  const [peerAudioStates, setPeerAudioStates] = useState({});

  // Clear pinned user if they leave
  useEffect(() => {
    if (pinnedUser && pinnedUser !== 'local' && !peerNames[pinnedUser]) {
      setPinnedUser(null);
    }
  }, [peerNames, pinnedUser]);

  // Emoji reactions
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const emojiIdRef = useRef(0);

  // Chat
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const isChatOpenRef = useRef(false);

  // Participants panel
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  
  // Whiteboard
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  
  const isSpeaking = useAudioVolume(localStream);

  const socketRef = useRef();
  const lkRoomRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  // ========== DEVICE SWITCHING ==========
  const switchDevice = async (kind, deviceId) => {
    try {
      if (kind === 'audio') {
        setSelectedAudioId(deviceId);
        if (lkRoomRef.current) {
          await lkRoomRef.current.switchActiveDevice('audioinput', deviceId);
        }
      }
      if (kind === 'video') {
        setSelectedVideoId(deviceId);
        if (lkRoomRef.current) {
          await lkRoomRef.current.switchActiveDevice('videoinput', deviceId);
        }
      }
    } catch (err) {
      console.error('Error switching device:', err);
    }
  };

  // ========== CALLBACK REFS FOR LOCAL VIDEO ==========
  const localCameraCallback = useCallback((videoEl) => {
    if (videoEl && localStreamRef.current) {
      videoEl.srcObject = localStreamRef.current;
    }
  }, [localStream]); // eslint-disable-line react-hooks/exhaustive-deps

  const localScreenCallback = useCallback((videoEl) => {
    if (videoEl && screenStreamRef.current) {
      videoEl.srcObject = screenStreamRef.current;
    }
  }, [screenStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Spawn a floating emoji
  const spawnEmoji = useCallback((emoji, senderName) => {
    const id = emojiIdRef.current++;
    const left = 15 + Math.random() * 70;
    const size = 1.8 + Math.random() * 1.5;
    const rotation = (Math.random() - 0.5) * 60;
    const drift = (Math.random() - 0.5) * 100;
    
    setFloatingEmojis(prev => [...prev, { id, emoji, senderName, left, size, rotation, drift }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 3800);
  }, []);

  const sendEmoji = useCallback((emoji) => {
    spawnEmoji(emoji, 'You');
    if (socketRef.current) {
      socketRef.current.emit('emoji-reaction', { emoji, senderName: userName });
    }
  }, [userName, spawnEmoji]);

  // ========== HELPER: Build MediaStream from LiveKit participant tracks ==========
  const buildPeerStream = useCallback((participant) => {
    const tracks = [];
    participant.trackPublications.forEach((pub) => {
      if (pub.track && pub.isSubscribed) {
        // Only include camera video and mic audio (not screen share)
        if (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone) {
          tracks.push(pub.track.mediaStreamTrack);
        }
      }
    });
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }, []);

  const buildScreenStream = useCallback((participant) => {
    const tracks = [];
    participant.trackPublications.forEach((pub) => {
      if (pub.track && pub.isSubscribed) {
        if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
          tracks.push(pub.track.mediaStreamTrack);
        }
      }
    });
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }, []);

  // ========== HELPER: Refresh all peer states from LiveKit room ==========
  const refreshPeerStates = useCallback(() => {
    const room = lkRoomRef.current;
    if (!room) return;

    const newPeers = {};
    const newNames = {};
    const newVideoStates = {};
    const newAudioStates = {};
    const newPresenters = [...(isScreenSharingRef.current ? ['local'] : [])];

    room.remoteParticipants.forEach((participant, identity) => {
      const pId = identity;
      newNames[pId] = participant.name || participant.identity;

      // Build camera+mic stream for this participant
      const cameraStream = buildPeerStream(participant);
      if (cameraStream) {
        newPeers[pId] = cameraStream;
      }

      // Check if they have a screen share
      const screenStream = buildScreenStream(participant);
      if (screenStream) {
        // Use a separate key for screen share
        newPeers[pId + '_screen'] = screenStream;
        if (!newPresenters.includes(pId)) newPresenters.push(pId);
      }

      // Track mute states
      const camPub = participant.getTrackPublication(Track.Source.Camera);
      const micPub = participant.getTrackPublication(Track.Source.Microphone);
      newVideoStates[pId] = !camPub || camPub.isMuted || !camPub.isSubscribed;
      newAudioStates[pId] = !micPub || micPub.isMuted || !micPub.isSubscribed;
    });

    setPeers(newPeers);
    setPeerNames(prev => ({ ...prev, ...newNames }));
    setPeerVideoStates(newVideoStates);
    setPeerAudioStates(newAudioStates);
    setPresenterIds(newPresenters);
  }, [buildPeerStream, buildScreenStream]);

  // ========== MAIN EFFECT: LIVEKIT + SOCKET.IO SETUP ==========
  useEffect(() => {
    let isMounted = true;

    // ---- Socket.io for custom features ----
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', roomId, userName, avatarUrl, userToken);
    });

    socket.on('update-host', (newHostId) => {
      setHostId(newHostId);
    });

    socket.on('force-mute', () => {
      if (!isMutedRef.current && lkRoomRef.current) {
        setIsMuted(true);
        isMutedRef.current = true;
        lkRoomRef.current.localParticipant.setMicrophoneEnabled(false);
      }
    });

    socket.on('force-kick', () => {
      alert("You have been kicked from the room by the host.");
      onLeave();
    });

    socket.on('user-connected', (userId, newUserName, newAvatarUrl) => {
      setPeerAvatars(prev => ({ ...prev, [userId]: newAvatarUrl }));
    });

    socket.on('user-disconnected', (userId) => {
      setPeerAvatars(prev => { const n = {...prev}; delete n[userId]; return n; });
    });

    socket.on('play-sound', (payload) => {
      playSound(payload.soundData);
      spawnEmoji(getSoundEmoji(payload.soundData), payload.senderName || 'Someone');
    });

    socket.on('emoji-reaction', (data) => {
      spawnEmoji(data.emoji, data.senderName);
    });

    socket.on('chat-message', () => {
      if (!isChatOpenRef.current) {
        setUnreadChat(prev => prev + 1);
      }
    });

    // ---- LiveKit for video/audio ----
    const connectLiveKit = async () => {
      try {
        // Get token from our backend
        const tokenUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? 'http://localhost:5000/api/token'
          : `${window.location.origin}/api/token`;

        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, userName }),
        });
        const { token } = await res.json();
        if (!isMounted) return;

        const room = new LKRoom({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: { width: 1280, height: 720, frameRate: 30 },
          },
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        lkRoomRef.current = room;

        // ---- LiveKit Event Handlers ----
        room.on(RoomEvent.TrackSubscribed, () => {
          if (isMounted) refreshPeerStates();
        });

        room.on(RoomEvent.TrackUnsubscribed, () => {
          if (isMounted) refreshPeerStates();
        });

        room.on(RoomEvent.TrackMuted, () => {
          if (isMounted) refreshPeerStates();
        });

        room.on(RoomEvent.TrackUnmuted, () => {
          if (isMounted) refreshPeerStates();
        });

        room.on(RoomEvent.ParticipantConnected, (participant) => {
          if (isMounted) {
            setPeerNames(prev => ({ ...prev, [participant.identity]: participant.name || participant.identity }));
            refreshPeerStates();
          }
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (isMounted) {
            const pId = participant.identity;
            setPeers(prev => {
              const n = { ...prev };
              delete n[pId];
              delete n[pId + '_screen'];
              return n;
            });
            setPeerNames(prev => { const n = {...prev}; delete n[pId]; return n; });
            setPeerVideoStates(prev => { const n = {...prev}; delete n[pId]; return n; });
            setPeerAudioStates(prev => { const n = {...prev}; delete n[pId]; return n; });
            setPresenterIds(prev => prev.filter(id => id !== pId));
          }
        });

        room.on(RoomEvent.LocalTrackPublished, () => {
          if (isMounted) {
            // Update local stream for speaking detection
            const tracks = [];
            room.localParticipant.trackPublications.forEach((pub) => {
              if (pub.track && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
                tracks.push(pub.track.mediaStreamTrack);
              }
            });
            const stream = tracks.length > 0 ? new MediaStream(tracks) : null;
            localStreamRef.current = stream;
            setLocalStream(stream);
          }
        });

        room.on(RoomEvent.LocalTrackUnpublished, () => {
          if (isMounted) {
            const tracks = [];
            room.localParticipant.trackPublications.forEach((pub) => {
              if (pub.track && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
                tracks.push(pub.track.mediaStreamTrack);
              }
            });
            const stream = tracks.length > 0 ? new MediaStream(tracks) : null;
            localStreamRef.current = stream;
            setLocalStream(stream);
          }
        });

        // Connect to LiveKit room
        await room.connect(LIVEKIT_URL, token);
        if (!isMounted) { room.disconnect(); return; }

        // Enable camera and microphone
        try {
          await room.localParticipant.enableCameraAndMicrophone();
          setMediaError(null);
          
          // Build local stream for speaking indicator
          const tracks = [];
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
              tracks.push(pub.track.mediaStreamTrack);
            }
          });
          const stream = tracks.length > 0 ? new MediaStream(tracks) : null;
          localStreamRef.current = stream;
          setLocalStream(stream);
        } catch (err) {
          console.error('Failed to enable camera/mic:', err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setMediaError('Camera/Microphone permission was denied. Please allow access and reload.');
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setMediaError('No camera or microphone found. Please connect a device.');
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            setMediaError('Camera/Mic is already in use by another app. Close it and reload.');
          } else {
            setMediaError(`Media error: ${err.message}`);
          }
          setIsVideoOff(true);
          isVideoOffRef.current = true;
          setIsMuted(true);
          isMutedRef.current = true;
        }

        // Initial state refresh for any existing participants
        refreshPeerStates();

      } catch (err) {
        console.error('LiveKit connection failed:', err);
        if (isMounted) setMediaError(`Connection failed: ${err.message}. Please reload.`);
      }
    };

    // Enumerate devices
    const updateDeviceList = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableDevices({
          audio: devices.filter(d => d.kind === 'audioinput'),
          video: devices.filter(d => d.kind === 'videoinput')
        });
      } catch (err) {
        console.warn("Failed to enumerate devices:", err);
      }
    };
    updateDeviceList();
    navigator.mediaDevices.addEventListener('devicechange', updateDeviceList);

    connectLiveKit();

    return () => {
      isMounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', updateDeviceList);
      if (lkRoomRef.current) {
        lkRoomRef.current.disconnect();
        lkRoomRef.current = null;
      }
      socket.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ========== MEDIA CONTROLS (Simple with LiveKit!) ==========
  const toggleMute = () => {
    if (!lkRoomRef.current) return;
    const newState = !isMuted;
    setIsMuted(newState);
    isMutedRef.current = newState;
    lkRoomRef.current.localParticipant.setMicrophoneEnabled(!newState);
  };

  const toggleVideo = async () => {
    if (!lkRoomRef.current) return;
    const newState = !isVideoOff;
    setIsVideoOff(newState);
    isVideoOffRef.current = newState;
    
    if (newState) {
      // Turning camera OFF — stop the hardware device so LED turns off
      const camPub = lkRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub && camPub.track) {
        camPub.track.mediaStreamTrack.stop(); // kills the OS camera handle
      }
      await lkRoomRef.current.localParticipant.setCameraEnabled(false);
    } else {
      // Turning camera ON — LiveKit will request a fresh device
      await lkRoomRef.current.localParticipant.setCameraEnabled(true);
    }
    
    // Rebuild local stream for display & speaking indicator
    const tracks = [];
    lkRoomRef.current.localParticipant.trackPublications.forEach((pub) => {
      if (pub.track && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
        tracks.push(pub.track.mediaStreamTrack);
      }
    });
    const stream = tracks.length > 0 ? new MediaStream(tracks) : null;
    localStreamRef.current = stream;
    setLocalStream(stream);
  };

  const toggleScreenShare = async () => {
    if (!lkRoomRef.current) return;
    
    if (!isScreenSharing) {
      try {
        await lkRoomRef.current.localParticipant.setScreenShareEnabled(true, {
          audio: true,
          video: {
            displaySurface: 'monitor',
            frameRate: { ideal: 60 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;
        setPresenterIds(prev => prev.includes('local') ? prev : [...prev, 'local']);

        // Get the screen share track for local preview
        const screenPub = lkRoomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (screenPub && screenPub.track) {
          const screenMediaStream = new MediaStream([screenPub.track.mediaStreamTrack]);
          screenStreamRef.current = screenMediaStream;
          setScreenStream(screenMediaStream);

          // Listen for track end (user clicks "Stop sharing" in browser UI)
          screenPub.track.mediaStreamTrack.onended = () => {
            stopScreenShare();
          };
        }
      } catch (err) {
        console.error("Error sharing screen", err);
      }
    } else {
      stopScreenShare();
    }
  };
  
  const stopScreenShare = async () => {
    if (!lkRoomRef.current) return;
    try {
      await lkRoomRef.current.localParticipant.setScreenShareEnabled(false);
    } catch(e) {}
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
    setScreenStream(null);
    screenStreamRef.current = null;
    setPresenterIds(prev => prev.filter(id => id !== 'local'));
  };

  const playSound = (soundData) => {
    if (typeof soundData === 'string') {
      const audios = {
        airhorn: '/sounds/airhorn.mp3',
        ba_dum_tss: '/sounds/ba_dum_tss.mp3',
        clap: '/sounds/clap.mp3',
        cricket: '/sounds/cricket.mp3',
        sad_horn: '/sounds/sad_horn.mp3'
      };
      if (audios[soundData]) {
        const audio = new Audio(audios[soundData]);
        audio.play().catch(e => console.warn("Audio play blocked or unsupported:", e));
      }
    } else if (typeof soundData === 'object' && soundData.type === 'custom' && soundData.base64) {
      const audio = new Audio(soundData.base64);
      audio.play().catch(e => console.warn("Custom Audio play blocked:", e));
    }
  };

  const handleEmitSound = (soundData) => {
    playSound(soundData);
    spawnEmoji(getSoundEmoji(soundData), 'You');
    if (socketRef.current) socketRef.current.emit('play-sound', { soundData, senderName: userName });
  };

  // ========== LAYOUT LOGIC ==========
  // Use peerNames as source of truth for which peers exist
  const peerIds = Object.keys(peerNames);
  const hasPeers = peerIds.length > 0;
  
  const hasScreenShare = presenterIds.length > 0;
  const activeLayout = (layoutMode === 'auto') 
    ? (isWhiteboardOpen || hasScreenShare || pinnedUser ? 'sidebar' : 'tiled') 
    : (isWhiteboardOpen && layoutMode === 'tiled' ? 'sidebar' : layoutMode);

  const activePresenters = presenterIds;
  const mainStageId = isWhiteboardOpen ? 'whiteboard' : (pinnedUser || (activePresenters.length > 0 ? activePresenters[0] : (peerIds.length > 0 ? peerIds[0] : 'local')));

  const allUserIds = ['local', ...peerIds];
  const tiledColCount = allUserIds.length <= 1 ? 1 : allUserIds.length <= 4 ? 2 : allUserIds.length <= 9 ? 3 : 4;
  const tiledRowCount = Math.ceil(allUserIds.length / tiledColCount);

  const getPresenterName = (id) => {
    if (id === 'local') return 'You';
    return peerNames[id] || `Guest-${id.substring(0,4)}`;
  };

  const hostActionMute = (peerId) => {
    if (socketRef.current) socketRef.current.emit('host-action-mute', peerId);
  };

  const hostActionKick = (peerId) => {
    if (socketRef.current) socketRef.current.emit('host-action-kick', peerId);
  };

  const isHost = socketRef.current?.id && hostId === socketRef.current.id;

  // Helper: get the correct stream for a peer (screen share if presenting, camera otherwise)
  const getPeerStream = (id) => {
    if (presenterIds.includes(id) && peers[id + '_screen']) {
      return peers[id + '_screen'];
    }
    return peers[id];
  };

  return (
    <div className="meeting-container">
      {/* ===== MEDIA ERROR BANNER ===== */}
      {mediaError && (
        <div className="media-error-banner">
          <span>⚠️ {mediaError}</span>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {/* ===== FLOATING EMOJI REACTIONS ===== */}
      <div className="emoji-overlay">
        {floatingEmojis.map(({ id, emoji, senderName, left, size, rotation, drift }) => (
          <div 
            key={id} 
            className="floating-emoji" 
            style={{ 
              left: `${left}%`,
              '--size': `${size}rem`,
              '--rotation': `${rotation}deg`,
              '--drift': `${drift}px`
            }}
          >
            <span className="emoji-char">{emoji}</span>
            <span className="emoji-sender">{senderName}</span>
          </div>
        ))}
      </div>

      {/* ===== LAYOUT RENDERING ENGINE ===== */}
      <div className={`main-stage layout-${activeLayout}`}>

        {/* --- Empty State Overlay (any layout) --- */}
        {peerIds.length === 0 && (
          <div className="empty-state-overlay">
            <div style={{ color: 'white', fontSize: '1.4rem', fontWeight: 600, textShadow: '0 2px 10px rgba(0,0,0,0.5)', letterSpacing: '-0.5px' }}>
              Waiting for others to join ✨
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginTop: '12px' }}>
              Share the meeting link to invite your friends.
            </div>
          </div>
        )}

        {/* ========== TILED LAYOUT ========== */}
        {activeLayout === 'tiled' && (
          <div className="tiled-grid" style={{ '--tile-cols': tiledColCount, '--tile-rows': tiledRowCount }}>
            {allUserIds.map(id => (
              <div 
                key={id} 
                className={`tiled-tile ${id === 'local' && isSpeaking && !isMuted ? 'tile-speaking' : ''}`}
                onClick={() => setPinnedUser(id)}
                style={{ cursor: 'pointer' }}
                title="Click to pin"
              >
                {id === 'local' ? (
                  <>
                    {isVideoOff ? (
                      <div className="avatar-center">
                        <img 
                          src={avatarUrl} 
                          alt="Your avatar"
                          className="user-avatar"
                          style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.1)' }} 
                        />
                      </div>
                    ) : (
                      <video ref={localCameraCallback} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                    )}
                    <div className="tile-name-label">You</div>
                    {isMuted && (
                      <div className="tile-mute-indicator">
                        <MicOff size={14} strokeWidth={2.5} color="#fbbf24" />
                      </div>
                    )}
                  </>
                ) : (
                  <VideoTile 
                    stream={getPeerStream(id)} 
                    userName={getPresenterName(id)} 
                    avatarUrl={peerAvatars[id]}
                    isVideoOff={peerVideoStates[id]}
                    isMuted={peerAudioStates[id]}
                    isPresenting={presenterIds.includes(id)}
                    variant="tiled"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ========== SIDEBAR LAYOUT ========== */}
        {activeLayout === 'sidebar' && (
          <>
            {/* Presenter Switcher Bar */}
            {activePresenters.length > 1 && (
              <div className="presenter-switcher">
                {activePresenters.map(id => (
                  <button
                    key={id}
                    className={`presenter-tab ${mainStageId === id ? 'active' : ''}`}
                    onClick={() => setPinnedUser(id)}
                  >
                    <Monitor size={14} />
                    <span>{getPresenterName(id)}'s screen</span>
                  </button>
                ))}
              </div>
            )}

            {/* Main Stage Spotlight */}
            <div 
              className={`main-tile ${mainStageId === 'local' && isSpeaking && !isMuted && !presenterIds.includes('local') ? 'tile-speaking' : ''}`} 
              onDoubleClick={() => setPinnedUser(null)}
              title="Double click to unpin"
            >
              {mainStageId === 'whiteboard' ? (
                 <Whiteboard socket={socketRef.current} isHost={isHost} onClose={() => setIsWhiteboardOpen(false)} />
              ) : mainStageId === 'local' ? (
                 presenterIds.includes('local') ? (
                   <>
                     <video ref={localScreenCallback} autoPlay muted playsInline className="screen-share-video" />
                     <div className="tile-name-label presenting-badge">
                       <Monitor size={14} strokeWidth={2} /> You are presenting
                     </div>
                   </>
                 ) : (
                   <>
                     {isVideoOff ? (
                       <div className="avatar-center" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
                         <img 
                           src={avatarUrl} 
                           alt="Your avatar"
                           className="user-avatar"
                           style={{ width: '140px', height: '140px', borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.1)' }} 
                         />
                       </div>
                     ) : (
                       <video ref={localCameraCallback} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                     )}
                     <div className="tile-name-label">
                       You {pinnedUser === 'local' && '(Pinned)'}
                     </div>
                     {isMuted && (
                       <div className="tile-mute-indicator">
                         <MicOff size={14} strokeWidth={2.5} color="#fbbf24" />
                       </div>
                     )}
                   </>
                 )
              ) : (
                   <VideoTile 
                     stream={getPeerStream(mainStageId)} 
                     userName={presenterIds.includes(mainStageId) ? `${getPresenterName(mainStageId)}'s Screen` : `${getPresenterName(mainStageId)} ${pinnedUser === mainStageId ? '(Pinned)' : ''}`}
                     avatarUrl={peerAvatars[mainStageId]}
                     isVideoOff={!presenterIds.includes(mainStageId) && peerVideoStates[mainStageId]} 
                     isMuted={peerAudioStates[mainStageId]}
                     isPresenting={presenterIds.includes(mainStageId)}
                     variant="main"
                   />
                )}
            </div>

            {/* PiP Stack */}
            <div className="pip-stack">
              {['local', ...peerIds].filter(id => id !== mainStageId).map(id => {
                if (id === 'local') {
                  return (
                    <div 
                      key="local" 
                      className={`pip-tile ${isSpeaking && !isMuted && !presenterIds.includes('local') ? 'tile-speaking' : ''}`}
                      onClick={() => setPinnedUser('local')}
                      style={{ cursor: 'pointer' }}
                      title="Click to pin to Main Stage"
                    >
                      {presenterIds.includes('local') ? (
                         <video ref={localScreenCallback} autoPlay muted playsInline className="screen-share-video" />
                      ) : isVideoOff ? (
                        <div className="avatar-center" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
                          <img 
                            src={avatarUrl} 
                            alt="Your avatar"
                            className="user-avatar pip-avatar"
                            style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} 
                          />
                        </div>
                      ) : (
                        <video ref={localCameraCallback} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                      )}
                      <div className="tile-name-label">You {presenterIds.includes('local') ? '(Presenting)' : ''}</div>
                      {!presenterIds.includes('local') && isMuted && (
                        <div className="tile-mute-indicator">
                          <MicOff size={12} strokeWidth={2.5} color="#fbbf24" />
                        </div>
                      )}
                    </div>
                  );
                } else {
                  return (
                    <div key={id} className="pip-tile" onClick={() => setPinnedUser(id)} style={{ cursor: 'pointer' }} title="Click to pin to Main Stage">
                      <VideoTile 
                        stream={getPeerStream(id)} 
                        userName={presenterIds.includes(id) ? `${getPresenterName(id)}'s Screen` : getPresenterName(id)} 
                        avatarUrl={peerAvatars[id]}
                        isVideoOff={!presenterIds.includes(id) && peerVideoStates[id]}
                        isMuted={peerAudioStates[id]}
                        isPresenting={presenterIds.includes(id)}
                        variant="pip"
                      />
                    </div>
                  );
                }
              })}
            </div>
          </>
        )}

        {/* ========== SPOTLIGHT LAYOUT ========== */}
        {activeLayout === 'spotlight' && (
          <div 
            className="spotlight-tile"
            onDoubleClick={() => setPinnedUser(null)}
            title="Double click to unpin"
          >
            {mainStageId === 'whiteboard' ? (
              <Whiteboard socket={socketRef.current} isHost={isHost} onClose={() => setIsWhiteboardOpen(false)} />
            ) : mainStageId === 'local' ? (
              <>
                {isVideoOff ? (
                  <div className="avatar-center">
                    <img 
                      src={avatarUrl} 
                      alt="Your avatar"
                      className="user-avatar"
                      style={{ width: '180px', height: '180px', borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.1)' }} 
                    />
                  </div>
                ) : (
                  <video ref={localCameraCallback} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                )}
                <div className="tile-name-label">You (Spotlight)</div>
              </>
            ) : (
              <VideoTile 
                stream={getPeerStream(mainStageId)} 
                userName={`${getPresenterName(mainStageId)} (Spotlight)`}
                avatarUrl={peerAvatars[mainStageId]}
                isVideoOff={peerVideoStates[mainStageId]} 
                isMuted={peerAudioStates[mainStageId]}
                isPresenting={presenterIds.includes(mainStageId)}
                variant="main"
              />
            )}
          </div>
        )}
      </div>

      {/* ===== BOTTOM BAR ===== */}
      <div className="bottom-bar">
        <div className="bottom-bar-left">
          <span className="meeting-time">{currentTime}</span>
          <span className="meeting-divider">|</span>
          <span className="meeting-id">{roomId}</span>
        </div>

        <div className="bottom-bar-center">
          <Controls 
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            layoutMode={layoutMode}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={toggleScreenShare}
            onChangeLayout={setLayoutMode}
            onPlaySound={handleEmitSound}
            onLeave={onLeave}
            onSendEmoji={sendEmoji}
            emojis={EMOJI_LIST}
            audioDevices={availableDevices.audio}
            videoDevices={availableDevices.video}
            selectedAudioId={selectedAudioId}
            selectedVideoId={selectedVideoId}
            onSelectAudio={(id) => switchDevice('audio', id)}
            onSelectVideo={(id) => switchDevice('video', id)}
          />
        </div>

        <div className="bottom-bar-right">
          <button className="share-link-btn" onClick={() => {
            navigator.clipboard.writeText(shareLink).then(() => {
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            });
          }}>
            {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
            <span>{linkCopied ? 'Copied!' : 'Share'}</span>
          </button>
          
          <button 
            className={`chat-toggle-btn ${isWhiteboardOpen ? 'chat-toggle-active' : ''}`} 
            onClick={() => setIsWhiteboardOpen(!isWhiteboardOpen)}
            title="Graffiti Board"
          >
            <PenTool size={16} />
          </button>

          <button className={`chat-toggle-btn ${isChatOpen ? 'chat-toggle-active' : ''}`} onClick={() => { const next = !isChatOpen; setIsChatOpen(next); isChatOpenRef.current = next; if (next) setUnreadChat(0); setIsParticipantsOpen(false); }}>
            <MessageSquare size={18} />
            {unreadChat > 0 && <span className="chat-badge">{unreadChat}</span>}
          </button>
          <button 
            className={`chat-toggle-btn ${isParticipantsOpen ? 'chat-toggle-active' : ''}`} 
            onClick={() => { setIsParticipantsOpen(!isParticipantsOpen); setIsChatOpen(false); }}
          >
            <Users size={16} />
            <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{peerIds.length + 1}</span>
          </button>
        </div>
      </div>

      {/* ===== CHAT PANEL ===== */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        socket={socketRef.current}
        userName={userName}
        avatarUrl={avatarUrl}
        unreadCount={unreadChat}
        onResetUnread={() => setUnreadChat(0)}
      />

      {/* ===== PARTICIPANTS PANEL ===== */}
      {isParticipantsOpen && (
        <div className="participants-panel">
          <div className="participants-panel-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>People ({peerIds.length + 1})</span>
            <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
              {isHost && peerIds.length > 0 && (
                <button onClick={() => peerIds.forEach(id => hostActionMute(id))} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                  Mute All
                </button>
              )}
              <button className="participants-close-btn" onClick={() => setIsParticipantsOpen(false)}>✕</button>
            </div>
          </div>
          <div className="participants-list">
            {/* Local user */}
            <div className="participant-item">
              <img 
                src={avatarUrl} 
                alt={userName}
                className="participant-avatar"
              />
              <div className="participant-info">
                <span className="participant-name">You ({userName})</span>
                {isHost && <span className="participant-role">Host</span>}
              </div>
              <div className="participant-status">
                {isMuted ? <MicOff size={14} color="#fbbf24" /> : <Mic size={14} color="#4ade80" />}
              </div>
            </div>

            {/* Remote peers */}
            {peerIds.map(id => (
              <div key={id} className="participant-item block-layout" style={{ flexWrap: 'wrap' }}>
                <div style={{display:'flex', alignItems:'center', width:'100%'}}>
                  <img 
                    src={peerAvatars[id] || `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(peerNames[id] || 'Guest')}&scale=120&backgroundColor=b6e3f4,c0aede,d1d4f9`} 
                    alt={peerNames[id] || 'Guest'}
                    className="participant-avatar"
                  />
                  <div className="participant-info">
                    <span className="participant-name">{peerNames[id] || `Guest-${id.substring(0,4)}`}</span>
                    {hostId === id && <span className="participant-role">Host</span>}
                    {presenterIds.includes(id) && <span className="participant-role presenting">Presenting</span>}
                  </div>
                  <div className="participant-status">
                    {peerVideoStates[id] && <VideoOff size={14} color="#fbbf24" style={{marginRight: 4}} />}
                  </div>
                </div>
                {isHost && hostId !== id && (
                  <div className="host-controls" style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px', paddingLeft: '36px' }}>
                    <button className="host-btn mute-btn" onClick={() => hostActionMute(id)} title="Mute Mic" style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>Mute</button>
                    <button className="host-btn kick-btn" onClick={() => hostActionKick(id)} title="Kick User" style={{ background: '#e74c3c', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>Kick</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;
