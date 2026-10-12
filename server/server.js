const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected users and rooms
const users = new Map(); // ws -> { id, username, room }
const rooms = new Map(); // roomId -> Set of user IDs
const userSockets = new Map(); // userId -> ws

// Helper to broadcast to a room (excluding sender)
function broadcastToRoom(roomId, message, excludeWs = null) {
  const roomUsers = rooms.get(roomId);
  if (!roomUsers) return;

  const messageStr = JSON.stringify(message);
  roomUsers.forEach(userId => {
    const targetWs = userSockets.get(userId);
    if (targetWs && targetWs !== excludeWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(messageStr);
    }
  });
}

// Helper to send to specific user
function sendToUser(userId, message) {
  const targetWs = userSockets.get(userId);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    handleDisconnect(ws);
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'join':
      handleJoin(ws, message);
      break;
    case 'chat':
      handleChat(ws, message);
      break;
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleWebRTCSignal(ws, message);
      break;
    case 'call-user':
      handleCallUser(ws, message);
      break;
    case 'call-accepted':
    case 'call-rejected':
    case 'call-ended':
      handleCallResponse(ws, message);
      break;
    case 'get-users':
      handleGetUsers(ws, message);
      break;
    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleJoin(ws, message) {
  const userId = message.userId || uuidv4();
  const username = message.username || `User-${userId.slice(0, 6)}`;
  const roomId = message.roomId || 'general';

  // Store user info
  users.set(ws, { id: userId, username, room: roomId });
  userSockets.set(userId, ws);

  // Add to room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(userId);

  // Send confirmation
  ws.send(JSON.stringify({
    type: 'joined',
    userId,
    username,
    roomId,
    users: getRoomUsers(roomId)
  }));

  // Notify others in room
  broadcastToRoom(roomId, {
    type: 'user-joined',
    userId,
    username,
    users: getRoomUsers(roomId)
  }, ws);

  console.log(`User ${username} (${userId}) joined room ${roomId}`);
}

function handleChat(ws, message) {
  const user = users.get(ws);
  if (!user) return;

  broadcastToRoom(user.room, {
    type: 'chat',
    userId: user.id,
    username: user.username,
    text: message.text,
    timestamp: Date.now()
  });
}

function handleWebRTCSignal(ws, message) {
  const user = users.get(ws);
  if (!user) return;

  // Forward signaling data to target user
  sendToUser(message.targetId, {
    type: message.type,
    fromId: user.id,
    fromUsername: user.username,
    data: message.data
  });
}

function handleCallUser(ws, message) {
  const user = users.get(ws);
  if (!user) return;

  // Notify target user of incoming call
  sendToUser(message.targetId, {
    type: 'incoming-call',
    fromId: user.id,
    fromUsername: user.username,
    callType: message.callType // 'audio' or 'video'
  });
}

function handleCallResponse(ws, message) {
  const user = users.get(ws);
  if (!user) return;

  // Forward response to caller
  sendToUser(message.targetId, {
    type: message.type,
    fromId: user.id,
    fromUsername: user.username
  });
}

function handleGetUsers(ws, message) {
  const user = users.get(ws);
  if (!user) return;

  ws.send(JSON.stringify({
    type: 'users-list',
    users: getRoomUsers(user.room)
  }));
}

function handleDisconnect(ws) {
  const user = users.get(ws);
  if (!user) return;

  const { id, username, room } = user;

  // Remove from room
  const roomUsers = rooms.get(room);
  if (roomUsers) {
    roomUsers.delete(id);
    if (roomUsers.size === 0) {
      rooms.delete(room);
    }
  }

  // Clean up
  users.delete(ws);
  userSockets.delete(id);

  // Notify others
  broadcastToRoom(room, {
    type: 'user-left',
    userId: id,
    username,
    users: getRoomUsers(room)
  });

  console.log(`User ${username} (${id}) left room ${room}`);
}

function getRoomUsers(roomId) {
  const roomUsers = rooms.get(roomId);
  if (!roomUsers) return [];

  const userList = [];
  roomUsers.forEach(userId => {
    // Find username from userSockets
    for (const [ws, user] of users.entries()) {
      if (user.id === userId) {
        userList.push({ id: userId, username: user.username });
        break;
      }
    }
  });
  return userList;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.size, rooms: rooms.size });
});

// Serve client for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});