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

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId, userName, avatarUrl) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', socket.id, userName, avatarUrl);
    
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

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id} (user: ${userName})`);
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
