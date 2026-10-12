# WebRTC Chat & Video Call App

A real-time chat and video calling application using WebRTC with a Node.js signaling server. Features user IDs, rooms, text chat, audio calls, and video calls.

## Features

- 💬 **Real-time text chat** with timestamps
- 📞 **Audio calls** via WebRTC
- 📹 **Video calls** via WebRTC
- 👥 **User IDs** - unique identifiers for each user
- 🏠 **Rooms** - create/join rooms to chat with specific groups
- 📋 **Online users list** with click-to-call
- 🔗 **Shareable links** - share room ID with others
- 📱 **Responsive design** - works on desktop and mobile

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- npm or yarn

### Install & Run

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start the server
npm start
```

Server runs on `http://localhost:3000`

Open multiple browser tabs/windows to test with multiple users.

## Deploy to Production

### Option 1: Railway (Recommended - Free Tier)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repository
5. Railway auto-detects Node.js and deploys
6. Get your public URL (e.g., `https://your-app.up.railway.app`)

### Option 2: Render (Free Tier)

1. Push to GitHub
2. Go to [render.com](https://render.com) and sign up
3. New → Web Service → Connect GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy

### Option 3: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly launch
fly deploy
```

### Option 4: VPS (DigitalOcean, Linode, etc.)

```bash
# On your server
git clone <your-repo>
cd webrtc-chat-app/server
npm install

# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name webrtc-chat
pm2 startup
pm2 save

# Set up nginx reverse proxy (optional, for SSL)
# See nginx config example below
```

### Option 5: Docker

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ ./
COPY client/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t webrtc-chat .
docker run -p 3000:3000 webrtc-chat
```

## Nginx Reverse Proxy Config (for VPS with SSL)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Usage

1. **Open the app** in your browser
2. **Enter your name** and optionally a **Room ID**
3. **Click "Join Room"**
4. **Share the Room ID** with others to join
5. **Click 📞 or 📹** next to a user's name to call them
6. **Accept/Reject** incoming calls via the modal

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐
│  Client A   │ ◄─────────────────► │  Signaling  │
└─────────────┘                     │   Server    │
       │                            └─────────────┘
       │                                 ▲
       │ WebRTC (Peer-to-Peer)           │
       ▼                                 │
┌─────────────┐                          │
│  Client B   │ ◄────────────────────────┘
└─────────────┘
```

- **Signaling Server**: Handles user connections, room management, and WebRTC signaling (offer/answer/ICE candidates)
- **WebRTC**: Direct peer-to-peer media streams (audio/video) - no media goes through the server
- **STUN Servers**: Google's public STUN servers for NAT traversal

## Project Structure

```
webrtc-chat-app/
├── server/
│   ├── package.json
│   └── server.js          # WebSocket + Express server
└── client/
    └── public/
        ├── index.html     # Main HTML
        ├── style.css      # Styling
        └── app.js         # Client-side logic
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

## Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Chrome Android)

**Requires HTTPS** for camera/microphone access in production (localhost works with HTTP).

## Troubleshooting

### "Cannot access camera/microphone"
- Ensure you're on HTTPS (or localhost)
- Check browser permissions
- Try a different browser

### "Connection failed" / calls don't connect
- Check if STUN servers are reachable
- Some corporate networks block WebRTC - try TURN server (not included)
- Check browser console for errors

### Users can't see each other
- Ensure they're in the same Room ID
- Check signaling server logs
- Verify WebSocket connection is established

## Adding TURN Server (for restrictive networks)

For production use behind strict firewalls, add a TURN server:

```javascript
// In app.js, update iceServers:
this.iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
};
```

Free TURN servers: [metered.ca](https://www.metered.ca/tools/openrelay/), [twilio](https://www.twilio.com/docs/stun-turn)

## License

MIT - Feel free to use and modify!