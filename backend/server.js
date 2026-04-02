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

  socket.on('join-room', (roomId, userName, avatarUrl, userToken) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        originalCreatorToken: userToken,
        currentHostSocket: socket.id,
        participants: []
      };
    } else if (rooms[roomId].originalCreatorToken === userToken) {
      rooms[roomId].currentHostSocket = socket.id;
    } else if (!rooms[roomId].currentHostSocket) {
      rooms[roomId].currentHostSocket = socket.id;
    }
    
    rooms[roomId].participants.push({ id: socket.id, token: userToken, name: userName });
    
    socket.to(roomId).emit('user-connected', socket.id, userName, avatarUrl);
    io.to(roomId).emit('update-host', rooms[roomId].currentHostSocket);
    
    // WebRTC signaling
    socket.on('offer', (payload) => {
      io.to(payload.target).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
      io.to(payload.target).emit('answer', payload);
    });

    socket.on('ice-candidate', (payload) => {
      io.to(payload.target).emit('ice-candidate', payload);
    });
    
    // Custom events
    socket.on('play-sound', (soundId) => {
      socket.to(roomId).emit('play-sound', { userId: socket.id, soundId });
    });

    socket.on('toggle-media', (type, isMuted) => {
      socket.to(roomId).emit('user-toggled-media', { userId: socket.id, type, isMuted });
    });

    socket.on('emoji-reaction', (data) => {
      socket.to(roomId).emit('emoji-reaction', { userId: socket.id, emoji: data.emoji, senderName: data.senderName });
    });

    // Chat events
    socket.on('chat-message', (data) => {
      socket.to(roomId).emit('chat-message', { ...data, userId: socket.id });
    });

    socket.on('chat-reaction', (data) => {
      socket.to(roomId).emit('chat-reaction', { ...data, userId: socket.id });
    });

    socket.on('chat-delete', (data) => {
      socket.to(roomId).emit('chat-delete', data);
    });

    socket.on('chat-pin', (data) => {
      socket.to(roomId).emit('chat-pin', data);
    });

    // Host actions
    socket.on('host-action-mute', (targetId) => {
      if (rooms[roomId]?.currentHostSocket === socket.id) {
        io.to(targetId).emit('force-mute');
      }
    });

    socket.on('host-action-kick', (targetId) => {
      if (rooms[roomId]?.currentHostSocket === socket.id) {
        io.to(targetId).emit('force-kick'); // The client will disconnect itself
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id} (user: ${userName})`);
      if (rooms[roomId]) {
        rooms[roomId].participants = rooms[roomId].participants.filter(p => p.id !== socket.id);
        
        if (rooms[roomId].participants.length === 0) {
          delete rooms[roomId]; // Cleanup empty room
        } else if (rooms[roomId].currentHostSocket === socket.id) {
          // Promote next oldest member
          rooms[roomId].currentHostSocket = rooms[roomId].participants[0].id;
          io.to(roomId).emit('update-host', rooms[roomId].currentHostSocket);
        }
      }
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
