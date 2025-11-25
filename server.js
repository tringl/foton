const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active connections
const activeConnections = new Map();
const waitingUsers = [];

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins the waiting list
  socket.on('join', () => {
    // Check if there's already someone waiting
    if (waitingUsers.length > 0) {
      // Get the first waiting user
      const partnerSocketId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);
      
      if (partnerSocket) {
        // Create a unique room for the pair
        const roomId = uuidv4();
        
        // Join both users to the same room
        socket.join(roomId);
        partnerSocket.join(roomId);
        
        // Store partner IDs for direct signaling
        socket.partnerId = partnerSocketId;
        partnerSocket.partnerId = socket.id;
        
        // Notify both users they're connected
        socket.emit('connected', { roomId, partnerId: partnerSocketId });
        partnerSocket.emit('connected', { roomId, partnerId: socket.id });
      } else {
        // If partner socket is not available, add current user to waiting list
        waitingUsers.push(socket.id);
      }
    } else {
      // Add current user to waiting list
      waitingUsers.push(socket.id);
      socket.emit('waiting');
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.target);
    if (targetSocket) {
      targetSocket.emit('offer', { 
        sdp: data.sdp, 
        from: socket.id 
      });
    }
  });

  socket.on('answer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.target);
    if (targetSocket) {
      targetSocket.emit('answer', { 
        sdp: data.sdp, 
        from: socket.id 
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const targetSocket = io.sockets.sockets.get(data.target);
    if (targetSocket) {
      targetSocket.emit('ice-candidate', { 
        candidate: data.candidate, 
        from: socket.id 
      });
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove from waiting list if present
    const waitingIndex = waitingUsers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingUsers.splice(waitingIndex, 1);
    }
    
    // Notify partner if connected
    if (socket.partnerId) {
      const partnerSocket = io.sockets.sockets.get(socket.partnerId);
      if (partnerSocket) {
        partnerSocket.emit('partner-disconnected');
      }
    }
    
    // Clean up partner references
    delete socket.partnerId;
  });

  // User wants to find a new partner
  socket.on('new-partner', () => {
    // Notify current partner of disconnection
    if (socket.partnerId) {
      const partnerSocket = io.sockets.sockets.get(socket.partnerId);
      if (partnerSocket) {
        partnerSocket.emit('partner-disconnected');
      }
      delete socket.partnerId;
    }
    
    // Add to waiting list again
    waitingUsers.push(socket.id);
    socket.emit('waiting');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});