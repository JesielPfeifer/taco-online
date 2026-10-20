import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Lobby } from './lobby.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(root, 'public')));
app.use('/shared', express.static(path.join(root, 'shared')));
app.use('/vendor/three', express.static(path.join(root, 'node_modules/three/build')));

const lobby = new Lobby();
// ICE servers for the WebRTC voice chat. STUN is enough on a LAN; behind strict NATs set a TURN server.
const iceServers = [];
const stun = process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302';
if (stun) iceServers.push({ urls: stun.split(',').map((s) => s.trim()).filter(Boolean) });
if (process.env.TURN_URL)
  iceServers.push({
    urls: process.env.TURN_URL.split(',').map((s) => s.trim()),
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || '',
  });
app.get('/config', (_req, res) => res.json({ iceServers }));

app.get('/health', (_req, res) => res.json({ ok: true, rooms: lobby.rooms.size, clients: lobby.clients.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => lobby.connect(ws));

server.listen(PORT, () => {
  console.log(`Taco online rodando em http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    wss.clients.forEach((c) => c.close());
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
