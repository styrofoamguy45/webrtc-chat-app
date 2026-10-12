const WebSocket = require('ws');
const ws = new WebSocket('wss://webrtc-app.loca.lt');
ws.on('open', () => { console.log('WS connected to tunnel OK'); ws.close(); process.exit(0); });
ws.on('error', (e) => { console.log('WS error:', e.message); process.exit(1); });
setTimeout(() => { console.log('Timeout'); process.exit(1); }, 8000);