import { Room } from './room.js';
import { sanitizeAvatar, sanitizeName } from '../shared/config.js';

let nextId = 1;

function makeCode(rooms) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    if (!rooms.has(c)) return c;
  }
}

export class Lobby {
  constructor() {
    this.clients = new Map();
    this.rooms = new Map();
  }

  connect(ws) {
    const client = {
      id: 'p' + nextId++,
      ws,
      name: 'Jogador',
      avatar: sanitizeAvatar(null),
      room: null,
      send(msg) {
        if (ws.readyState === 1) ws.send(JSON.stringify(msg));
      },
    };
    this.clients.set(client.id, client);
    client.send({ t: 'welcome', id: client.id });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      try {
        this.handle(client, msg);
      } catch (err) {
        console.error('erro ao processar mensagem', msg.t, err);
      }
    });
    ws.on('close', () => {
      if (client.room) client.room.leave(client.id, true);
      this.clients.delete(client.id);
      this.broadcastRooms();
    });
  }

  handle(client, msg) {
    switch (msg.t) {
      case 'profile':
        client.name = sanitizeName(msg.name);
        client.avatar = sanitizeAvatar(msg.avatar);
        if (client.room) client.room.updateProfile(client);
        return;
      case 'list':
        client.send({ t: 'rooms', list: this.roomList() });
        return;
      case 'create': {
        if (client.room) client.room.leave(client.id);
        const code = makeCode(this.rooms);
        const room = new Room(code, this);
        this.rooms.set(code, room);
        room.join(client);
        this.broadcastRooms();
        return;
      }
      case 'join': {
        const room = this.rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!room) return client.send({ t: 'err', msg: 'Sala não encontrada' });
        if (client.room && client.room !== room) client.room.leave(client.id);
        room.join(client);
        this.broadcastRooms();
        return;
      }
      case 'leave':
        if (client.room) client.room.leave(client.id);
        client.send({ t: 'left' });
        this.broadcastRooms();
        return;
      default:
        if (client.room) client.room.handle(client, msg);
    }
  }

  roomList() {
    return [...this.rooms.values()].map((r) => r.summary());
  }

  broadcastRooms() {
    const list = this.roomList();
    for (const c of this.clients.values()) if (!c.room) c.send({ t: 'rooms', list });
  }

  removeRoom(room) {
    room.destroy();
    this.rooms.delete(room.code);
    this.broadcastRooms();
  }
}
