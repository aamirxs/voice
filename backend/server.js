const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  let currentRoomId = null;
  let currentUserName = null;

  // WebRTC signaling — registered ONCE per connection (not per join-room)
  socket.on('offer', (payload) => {
    io.to(payload.target).emit('offer', payload);
  });

  socket.on('answer', (payload) => {
    io.to(payload.target).emit('answer', payload);
  });

  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', payload);
  });

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
    
    // Send existing whiteboard state to the newly joined user
    if (rooms[roomId].whiteboardState.length > 0) {
      socket.emit('whiteboard-state', rooms[roomId].whiteboardState);
    }
    
    socket.to(roomId).emit('user-connected', socket.id, userName, avatarUrl);
    io.to(roomId).emit('update-host', rooms[roomId].currentHostSocket);
  });
    
  // Custom events
  socket.on('play-sound', (data) => {
    if (!currentRoomId) return;
    // Forward the full payload consistently
    socket.to(currentRoomId).emit('play-sound', { 
      userId: socket.id, 
      soundData: data.soundData, 
      senderName: data.senderName 
    });
  });

  socket.on('toggle-media', (type, isMuted) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('user-toggled-media', { userId: socket.id, type, isMuted });
  });

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

  // Request whiteboard state (for re-opening whiteboard within same session)
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
  console.log(`Signaling server running on port ${PORT}`);
});
