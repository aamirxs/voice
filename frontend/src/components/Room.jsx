import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Mic, MicOff, PhoneOff, Monitor, MonitorOff, Video, VideoOff, MessageCircle, MessageSquare, Settings, Users, LayoutGrid, MonitorPlay, Sparkles, Smile, PenTool, Check, Link2 } from 'lucide-react';
import { io } from 'socket.io-client';
import useAudioVolume from '../hooks/useAudioVolume';
import VideoTile from './VideoTile';
import Soundbar from './Soundbar';
import Whiteboard from './Whiteboard';
import Controls from './Controls';
import ChatPanel from './ChatPanel';
import { getAudioContext } from '../hooks/useAudioVolume';

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : window.location.origin
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
  const [presenterIds, setPresenterIds] = useState([]); // array of 'local' or peer ids
  const [pinnedUser, setPinnedUser] = useState(null);

  // Audio mute tracking
  const [peerAudioStates, setPeerAudioStates] = useState({});

  // Clear pinned user if they leave
  useEffect(() => {
    if (pinnedUser && pinnedUser !== 'local' && !peers[pinnedUser]) {
      setPinnedUser(null);
    }
  }, [peers, pinnedUser]);

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
  const peersRef = useRef({});
  
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const mixedAudioContextRef = useRef(null);
  const iceCandidateQueue = useRef({});

  const switchDevice = async (kind, deviceId) => {
    try {
      if (kind === 'audio') setSelectedAudioId(deviceId);
      if (kind === 'video') setSelectedVideoId(deviceId);

      const constraints = {
        video: kind === 'video' ? { deviceId: { exact: deviceId } } : (isVideoOffRef.current ? false : true),
        audio: kind === 'audio' ? { deviceId: { exact: deviceId } } : true
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
      
      const oldTrack = kind === 'video' 
        ? localStreamRef.current?.getVideoTracks()[0] 
        : localStreamRef.current?.getAudioTracks()[0];

      if (oldTrack) oldTrack.stop();

      if (kind === 'audio') newTrack.enabled = !isMuted;
      if (kind === 'video') newTrack.enabled = !isVideoOffRef.current;

      if (localStreamRef.current) {
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current.addTrack(newTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      // Replace track for all peers
      for (const peerId in peersRef.current) {
        const sender = peersRef.current[peerId].getSenders().find(s => s.track?.kind === kind);
        if (sender) {
          sender.replaceTrack(newTrack).catch(e => console.warn(e));
        }
      }
      
    } catch (err) {
      console.error('Error switching device:', err);
    }
  };

  const stopMediaStream = (stream) => {
    if (stream) stream.getTracks().forEach(t => t.stop());
  };

  // ========== CALLBACK REFS (fixes the dual-ref bug) ==========
  // Instead of storing a React ref and hoping srcObject stays set,
  // use callback refs that set srcObject every time the DOM element mounts.
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

  useEffect(() => {
    let isMounted = true;
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;
    
    const initRoom = (stream) => {
      if (!isMounted) return;
      
      socket.emit('join-room', roomId, userName, avatarUrl, userToken);

      socket.on('update-host', (newHostId) => {
        setHostId(newHostId);
      });

      socket.on('force-mute', () => {
        if (!isMuted) {
          setIsMuted(true);
          const tracks = localStreamRef.current?.getAudioTracks() || [];
          tracks.forEach(track => { track.enabled = false; });
          socket.emit('toggle-media', 'audio', true);
        }
      });

      socket.on('force-kick', () => {
        alert("You have been kicked from the room by the host.");
        onLeave();
      });

      socket.on('user-toggled-media', (payload) => {
        if (payload.type === 'video') {
           setPeerVideoStates(prev => ({ ...prev, [payload.userId]: payload.isMuted }));
        } else if (payload.type === 'audio') {
           setPeerAudioStates(prev => ({ ...prev, [payload.userId]: payload.isMuted }));
        } else if (payload.type === 'screen') {
           if (payload.isMuted) {
             setPresenterIds(prev => prev.includes(payload.userId) ? prev : [...prev, payload.userId]);
           } else {
             setPresenterIds(prev => prev.filter(id => id !== payload.userId));
           }
        }
      });

      socket.on('user-connected', (userId, newUserName, newAvatarUrl) => {
        setPeerNames(prev => ({ ...prev, [userId]: newUserName }));
        setPeerAvatars(prev => ({ ...prev, [userId]: newAvatarUrl }));
        socket.emit('toggle-media', 'video', isVideoOffRef.current);
        socket.emit('toggle-media', 'audio', isMuted);
        if (isScreenSharingRef.current) socket.emit('toggle-media', 'screen', true);
        
        const peerConnection = createPeerConnection(userId, stream);
        peersRef.current[userId] = peerConnection;
        iceCandidateQueue.current[userId] = [];
        
        peerConnection.createOffer()
          .then(offer => peerConnection.setLocalDescription(offer))
          .then(() => {
            socket.emit('offer', { target: userId, caller: socket.id, callerName: userName, callerAvatar: avatarUrl, sdp: peerConnection.localDescription });
          });
      });

      socket.on('offer', (payload) => {
        setPeerNames(prev => ({ ...prev, [payload.caller]: payload.callerName }));
        setPeerAvatars(prev => ({ ...prev, [payload.caller]: payload.callerAvatar }));
        socket.emit('toggle-media', 'video', isVideoOffRef.current);
        socket.emit('toggle-media', 'audio', isMuted);
        if (isScreenSharingRef.current) socket.emit('toggle-media', 'screen', true);

        const peerConnection = createPeerConnection(payload.caller, stream);
        peersRef.current[payload.caller] = peerConnection;
        iceCandidateQueue.current[payload.caller] = [];
        
        peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          .then(() => {
             const queue = iceCandidateQueue.current[payload.caller] || [];
             queue.forEach(candidate => peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn(e)));
             iceCandidateQueue.current[payload.caller] = [];
             return peerConnection.createAnswer();
          })
          .then(answer => peerConnection.setLocalDescription(answer))
          .then(() => {
            socket.emit('answer', { target: payload.caller, caller: socket.id, sdp: peerConnection.localDescription });
          });
      });

      socket.on('answer', (payload) => {
        const item = peersRef.current[payload.caller];
        if (item) {
           item.setRemoteDescription(new RTCSessionDescription(payload.sdp))
             .then(() => {
                const queue = iceCandidateQueue.current[payload.caller] || [];
                queue.forEach(candidate => item.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn(e)));
                iceCandidateQueue.current[payload.caller] = [];
             })
             .catch(e => console.warn(e));
        }
      });

      socket.on('ice-candidate', (payload) => {
        const item = peersRef.current[payload.caller];
        if (item) {
          if (!item.remoteDescription || !item.remoteDescription.type) {
             if (!iceCandidateQueue.current[payload.caller]) iceCandidateQueue.current[payload.caller] = [];
             iceCandidateQueue.current[payload.caller].push(payload.candidate);
          } else {
             item.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(e => console.warn(e));
          }
        }
      });

      socket.on('user-disconnected', (userId) => {
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
        }
        setPeers((prevPeers) => {
          const newPeers = { ...prevPeers };
          delete newPeers[userId];
          return newPeers;
        });
        setPeerNames(prev => { const n = {...prev}; delete n[userId]; return n; });
        setPeerVideoStates(prev => { const n = {...prev}; delete n[userId]; return n; });
        setPresenterIds(prev => prev.filter(id => id !== userId));
        delete peersRef.current[userId];
        delete iceCandidateQueue.current[userId];
      });

      socket.on('play-sound', (payload) => {
         // Server wraps our custom object in { userId, soundId: { soundData, senderName } }
         const data = payload.soundId || payload;
         playSound(data.soundData);
         spawnEmoji(getSoundEmoji(data.soundData), data.senderName || 'Someone');
      });

      // Emoji reactions from peers
      socket.on('emoji-reaction', (data) => {
        spawnEmoji(data.emoji, data.senderName);
      });

      // Unread chat counter
      socket.on('chat-message', () => {
        if (!isChatOpenRef.current) {
          setUnreadChat(prev => prev + 1);
        }
      });
    };

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

    navigator.mediaDevices.getUserMedia({ 
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }, 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        // Advanced WebRTC noise cancellation constraints (WebKit/Blink)
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true
      }
    }).then((stream) => {
      if (!isMounted) {
         stopMediaStream(stream);
         return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaError(null);
      initRoom(stream);
    }).catch(err => {
      console.error('Failed to get local stream:', err);
      if (isMounted) {
        // Set error state so user knows what happened
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setMediaError('Camera/Microphone permission was denied. Please allow access and reload.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setMediaError('No camera or microphone found. Please connect a device.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setMediaError('Camera/Mic is already in use by another app. Close it and reload.');
        } else {
          setMediaError(`Media error: ${err.message}`);
        }
        // Still join the room so user can at least chat/listen
        setIsVideoOff(true);
        isVideoOffRef.current = true;
        setIsMuted(true);
        initRoom(null);
      }
    });

    return () => {
      isMounted = false;
      stopMediaStream(localStreamRef.current);
      stopMediaStream(screenStreamRef.current);
      Object.values(peersRef.current).forEach(pc => {
        try { pc.close(); } catch (e) { /* ignore */ }
      });
      socket.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createPeerConnection = (partnerId, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Free TURN relay servers for NAT traversal across different networks
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
      ],
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { target: partnerId, caller: socketRef.current.id, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setPeers(oldPeers => {
        // ALWAYS return a top-level new object so React re-renders.
        // We also clone the MediaStream to force HTMLMediaElement to recognize the new tracks.
        const newStream = new MediaStream(event.streams[0].getTracks());
        return { ...oldPeers, [partnerId]: newStream };
      });
    };

    if (stream) {
       stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } else {
      // No local media — still request to receive remote tracks
      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (err) {
        console.warn('Failed to add recvonly transceivers:', err);
      }
    }
    return pc;
  };

  const toggleMute = () => {
    if (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0) {
      console.warn('No audio track available to toggle');
      return;
    }
    const newState = !isMuted;
    setIsMuted(newState);
    localStreamRef.current.getAudioTracks()[0].enabled = !newState;
    if (socketRef.current) socketRef.current.emit('toggle-media', 'audio', newState);
  };

  const toggleVideo = async () => {
    const newState = !isVideoOff;
    setIsVideoOff(newState);
    isVideoOffRef.current = newState;

    if (newState) {
      // Turning camera OFF: actually stop the video track so the LED turns off
      const videoTracks = localStreamRef.current?.getVideoTracks() || [];
      videoTracks.forEach(track => track.stop());
    } else {
      // Turning camera ON: re-acquire the video track from hardware
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        const newVideoTrack = newStream.getVideoTracks()[0];

        // Replace the old (stopped) track in the local stream
        const oldVideoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (oldVideoTrack) localStreamRef.current.removeTrack(oldVideoTrack);
        if (localStreamRef.current) localStreamRef.current.addTrack(newVideoTrack);

        // Replace the track in all active peer connections so remote users see your camera again
        for (let peerId in peersRef.current) {
          const sender = peersRef.current[peerId].getSenders().find(s => s.track?.kind === 'video' || (s.track === null && s !== undefined));
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(e => console.warn('replaceTrack failed:', e));
          }
        }
      } catch (err) {
        console.warn('Failed to re-acquire camera:', err);
        // Revert state if camera can't be re-opened
        setIsVideoOff(true);
        isVideoOffRef.current = true;
      }
    }

    if (socketRef.current) socketRef.current.emit('toggle-media', 'video', newState);
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ 
          video: {
            displaySurface: 'monitor',
            frameRate: { ideal: 60 },
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 }
          },
          audio: {
             echoCancellation: false,
             noiseSuppression: false,
             sampleRate: 44100
          }
        });
        screenStreamRef.current = screen;
        setScreenStream(screen);
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;
        setPresenterIds(prev => prev.includes('local') ? prev : [...prev, 'local']);
        if (socketRef.current) socketRef.current.emit('toggle-media', 'screen', true);
        
        const videoTrack = screen.getVideoTracks()[0];
        const screenAudio = screen.getAudioTracks()[0];
        const micAudio = localStreamRef.current?.getAudioTracks()[0];
        
        let trackToSend = screenAudio || micAudio;

        if (screenAudio && micAudio) {
           const audioCtx = getAudioContext();
           if (audioCtx) {
             const dest = audioCtx.createMediaStreamDestination();
             const micSource = audioCtx.createMediaStreamSource(new MediaStream([micAudio]));
             const screenSource = audioCtx.createMediaStreamSource(new MediaStream([screenAudio]));
             
             micSource.connect(dest);
             screenSource.connect(dest);
             
             mixedAudioContextRef.current = { dest, micSource, screenSource };
             trackToSend = dest.stream.getAudioTracks()[0];
           }
        }

        for (let peerId in peersRef.current) {
          const senderVid = peersRef.current[peerId].getSenders().find(s => s.track?.kind === 'video');
          if (senderVid && videoTrack) senderVid.replaceTrack(videoTrack).catch(e=>console.warn(e));

          if (trackToSend) {
             const senderAud = peersRef.current[peerId].getSenders().find(s => s.track?.kind === 'audio');
             if (senderAud) senderAud.replaceTrack(trackToSend).catch(e=>console.warn(e));
          }
        }

        videoTrack.onended = () => {
          stopScreenShare(screen);
        };
      } catch (err) {
        console.error("Error sharing screen", err);
      }
    } else {
      stopScreenShare(screenStreamRef.current);
    }
  };
  
  const stopScreenShare = (streamToStop) => {
     stopMediaStream(streamToStop);
     setIsScreenSharing(false);
     isScreenSharingRef.current = false;
     setScreenStream(null);
     screenStreamRef.current = null;
     setPresenterIds(prev => prev.filter(id => id !== 'local'));
     if (socketRef.current) socketRef.current.emit('toggle-media', 'screen', false);

     if (mixedAudioContextRef.current) {
         try {
           mixedAudioContextRef.current.micSource.disconnect();
           mixedAudioContextRef.current.screenSource.disconnect();
         } catch(e) {}
         mixedAudioContextRef.current = null;
     }
     
     const videoTrack = localStreamRef.current?.getVideoTracks()[0];
     const audioTrack = localStreamRef.current?.getAudioTracks()[0];
     for (let peerId in peersRef.current) {
        const senderVid = peersRef.current[peerId].getSenders().find(s => s.track?.kind === 'video');
        if (senderVid && videoTrack) {
           senderVid.replaceTrack(videoTrack).catch(e=>console.warn(e));
        }
        const senderAud = peersRef.current[peerId].getSenders().find(s => s.track?.kind === 'audio');
        if (senderAud && audioTrack) {
           senderAud.replaceTrack(audioTrack).catch(e=>console.warn(e));
        }
     }
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

  
  // Decide which user IDs to display. Use peerNames as the source of truth so
  // users are visible even if their WebRTC stream hasn't arrived yet.
  const peerIds = Object.keys(peerNames);
  const hasPeers = peerIds.length > 0;
  
  // Derive active layout from layoutMode
  const hasScreenShare = presenterIds.length > 0;
  const activeLayout = (layoutMode === 'auto') 
    ? (isWhiteboardOpen || hasScreenShare || pinnedUser ? 'sidebar' : 'tiled') 
    : (isWhiteboardOpen && layoutMode === 'tiled' ? 'sidebar' : layoutMode);

  // Resolve main stage user (used by sidebar & spotlight)
  const activePresenters = presenterIds;
  const mainStageId = isWhiteboardOpen ? 'whiteboard' : (pinnedUser || (activePresenters.length > 0 ? activePresenters[0] : (peerIds.length > 0 ? peerIds[0] : 'local')));

  // All participant IDs for tiled layout
  const allUserIds = ['local', ...peerIds];
  // Compute CSS grid columns and rows based on participant count
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
                    stream={peers[id]} 
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
                     stream={peers[mainStageId]} 
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
                        stream={peers[id]} 
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
                stream={peers[mainStageId]} 
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
