const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

// ========== LiveKit Token Endpoint ==========
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'APIzora2026stream';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secretZoraLiveKit2026xRunPlace';

app.post('/api/token', async (req, res) => {
  try {
    const { roomId, userName } = req.body;
    if (!roomId || !userName) {
      return res.status(400).json({ error: 'roomId and userName are required' });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userName + '_' + Date.now().toString(36),
      name: userName,
      ttl: '6h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    res.json({ token });
  } catch (err) {
    console.error('Token generation failed:', err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', livekit: true });
});

// ========== Socket.io — Custom Features Only ==========
// LiveKit handles ALL video/audio/screen share natively.
// Socket.io is only used for: chat, emoji, sounds, whiteboard, host actions.

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  let currentRoomId = null;
  let currentUserName = null;

  socket.on('join-room', (roomId, userName, avatarUrl, userToken) => {
    socket.join(roomId);
    currentRoomId = roomId;
    currentUserName = userName;
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        originalCreatorToken: userToken,
        currentHostSocket: socket.id,
        participants: [],
        whiteboardState: []
      };
    } else if (rooms[roomId].originalCreatorToken === userToken) {
      rooms[roomId].currentHostSocket = socket.id;
    } else if (!rooms[roomId].currentHostSocket) {
      rooms[roomId].currentHostSocket = socket.id;
    }
    
    rooms[roomId].participants.push({ id: socket.id, token: userToken, name: userName });
    
    if (rooms[roomId].whiteboardState.length > 0) {
      socket.emit('whiteboard-state', rooms[roomId].whiteboardState);
    }
    
    socket.to(roomId).emit('user-connected', socket.id, userName, avatarUrl);
    io.to(roomId).emit('update-host', rooms[roomId].currentHostSocket);
  });
    
  // Sound effects
  socket.on('play-sound', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('play-sound', { 
      userId: socket.id, 
      soundData: data.soundData, 
      senderName: data.senderName 
    });
  });

  // Emoji reactions
  socket.on('emoji-reaction', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('emoji-reaction', { userId: socket.id, emoji: data.emoji, senderName: data.senderName });
  });

  // Chat events
  socket.on('chat-message', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('chat-message', { ...data, userId: socket.id });
  });

  socket.on('chat-reaction', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('chat-reaction', { ...data, userId: socket.id });
  });

  socket.on('chat-delete', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('chat-delete', data);
  });

  socket.on('chat-pin', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('chat-pin', data);
  });

  // Whiteboard events
  socket.on('draw-line', (lineData) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    rooms[currentRoomId].whiteboardState.push(lineData);
    if (rooms[currentRoomId].whiteboardState.length > 5000) {
       rooms[currentRoomId].whiteboardState.shift();
    }
    socket.to(currentRoomId).emit('draw-line', lineData);
  });

  socket.on('clear-board', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    if (rooms[currentRoomId].currentHostSocket === socket.id) {
      rooms[currentRoomId].whiteboardState = [];
      io.to(currentRoomId).emit('clear-board');
    }
  });

  socket.on('request-whiteboard-state', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    if (rooms[currentRoomId].whiteboardState.length > 0) {
      socket.emit('whiteboard-state', rooms[currentRoomId].whiteboardState);
    }
  });

  // Host actions
  socket.on('host-action-mute', (targetId) => {
    if (!currentRoomId) return;
    if (rooms[currentRoomId]?.currentHostSocket === socket.id) {
      io.to(targetId).emit('force-mute');
    }
  });

  socket.on('host-action-kick', (targetId) => {
    if (!currentRoomId) return;
    if (rooms[currentRoomId]?.currentHostSocket === socket.id) {
      io.to(targetId).emit('force-kick');
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} (user: ${currentUserName})`);
    if (currentRoomId && rooms[currentRoomId]) {
      rooms[currentRoomId].participants = rooms[currentRoomId].participants.filter(p => p.id !== socket.id);
      
      if (rooms[currentRoomId].participants.length === 0) {
        delete rooms[currentRoomId];
      } else if (rooms[currentRoomId].currentHostSocket === socket.id) {
        rooms[currentRoomId].currentHostSocket = rooms[currentRoomId].participants[0].id;
        io.to(currentRoomId).emit('update-host', rooms[currentRoomId].currentHostSocket);
      }
      socket.to(currentRoomId).emit('user-disconnected', socket.id);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (LiveKit SFU mode)`);
});
