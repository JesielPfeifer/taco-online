import { Room } from './room.js';
import { Store } from './store.js';
import { sanitizeAvatar, sanitizeName, itemPrice, POWERS, TEAM_COLORS } from '../shared/config.js';

let nextId = 1;
const KEY_RE = /^[a-f0-9-]{36}$/;
const TEAM_PALETTE = ['#2f80ed', '#eb5757', '#27ae60', '#f2994a', '#9b51e0', '#f2c94c', '#56ccf2', '#ff70a6'];

function makeCode(rooms) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    if (!rooms.has(c)) return c;
  }
}

export class Lobby {
  constructor(store = new Store()) {
    this.clients = new Map();
    this.rooms = new Map();
    this.store = store;
  }

  connect(ws) {
    const client = {
      id: 'p' + nextId++,
      ws,
      name: 'Jogador',
      avatar: sanitizeAvatar(null),
      key: null,
      pub: null,
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
      // A reconnecting client may have taken over this id already.
      if (this.clients.get(client.id) === client) this.clients.delete(client.id);
      this.broadcastRooms();
    });
  }

  // Player record (wallet, purchases) of a client, or null for clients without a key.
  account(client) {
    return client.key ? this.store.player(client.key, client.name) : null;
  }

  owned(client) {
    return this.account(client)?.owned || [];
  }

  // Active powers of a client = owned and not switched off.
  powers(client) {
    const a = this.account(client);
    if (!a) return [];
    return POWERS.map((p) => p.id).filter((id) => a.owned.includes(`power:${id}`) && !a.powersOff.includes(id));
  }

  sendMe(client) {
    const a = this.account(client);
    if (!a) return;
    const teams = this.store.teamsOf(a.pub).map((t) => this.teamView(t));
    client.send({
      t: 'me',
      me: { pub: a.pub, coins: a.coins, owned: a.owned, powersOff: a.powersOff, stats: a.stats, teams },
      backup: this.store.backupOf(a),
    });
  }

  teamView(t) {
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      code: t.code,
      wins: t.wins,
      games: t.games,
      titles: t.titles,
      members: t.members.map((pub) => ({ pub, name: this.store.byPub(pub)?.name || '?' })),
    };
  }

  // Reward coins to a set of clients/pubs and refresh their wallets.
  reward(pub, coins, { game = false, win = false, title = false } = {}) {
    const p = this.store.byPub(pub);
    if (!p) return;
    p.coins += coins;
    if (game) p.stats.games++;
    if (win) p.stats.wins++;
    if (title) p.stats.titles++;
    this.store.save();
    for (const c of this.clients.values()) if (c.pub === pub) this.sendMe(c);
  }

  handle(client, msg) {
    switch (msg.t) {
      case 'profile': {
        client.name = sanitizeName(msg.name);
        if (typeof msg.key === 'string' && KEY_RE.test(msg.key) && !client.key) {
          client.key = msg.key;
          client.pub = Store.pub(msg.key);
          if (this.store.restore(msg.key, client.name, msg.backup)) {
            console.log(`carteira restaurada do backup do navegador (${client.pub})`);
            client.send({ t: 'restored' });
          }
        }
        client.avatar = sanitizeAvatar(msg.avatar, client.key ? this.owned(client) : []);
        this.sendMe(client);
        if (client.room) client.room.updateProfile(client);
        return;
      }
      case 'buy': {
        const a = this.account(client);
        const price = itemPrice(msg.item);
        if (!a || price == null) return client.send({ t: 'err', msg: 'Item inválido' });
        if (a.owned.includes(msg.item)) return;
        if (a.coins < price) return client.send({ t: 'err', msg: 'Moedas insuficientes' });
        a.coins -= price;
        a.owned.push(msg.item);
        this.store.save();
        client.send({ t: 'bought', item: msg.item });
        return this.sendMe(client);
      }
      case 'powers': {
        const a = this.account(client);
        if (!a || !Array.isArray(msg.off)) return;
        a.powersOff = msg.off.filter((id) => POWERS.some((p) => p.id === id));
        this.store.save();
        if (client.room) client.room.updateProfile(client);
        return this.sendMe(client);
      }
      case 'teamCreate': {
        if (!client.pub) return;
        const name = sanitizeName(msg.name).slice(0, 20);
        const used = new Set(this.store.teamsOf(client.pub).map((t) => t.color));
        const color = TEAM_PALETTE.find((c) => !used.has(c)) || TEAM_COLORS[0];
        try {
          this.store.createTeam(client.pub, name, color);
        } catch (err) {
          return client.send({ t: 'err', msg: err.message });
        }
        this.refreshTeams(client.pub);
        return;
      }
      case 'teamJoin': {
        if (!client.pub) return;
        try {
          const team = this.store.joinTeam(client.pub, String(msg.code || '').toUpperCase().trim());
          for (const pub of team.members) this.refreshTeams(pub);
        } catch (err) {
          client.send({ t: 'err', msg: err.message });
        }
        return;
      }
      case 'teamLeave': {
        if (!client.pub) return;
        const team = this.store.data.teams[msg.id];
        const others = team ? team.members.filter((m) => m !== client.pub) : [];
        this.store.leaveTeam(client.pub, msg.id);
        for (const pub of [client.pub, ...others]) this.refreshTeams(pub);
        return;
      }
      case 'list':
        client.send({ t: 'rooms', list: this.roomList() });
        return;
      case 'ranking':
        client.send({ t: 'ranking', ...this.ranking() });
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

  refreshTeams(pub) {
    for (const c of this.clients.values()) {
      if (c.pub !== pub) continue;
      this.sendMe(c);
      if (c.room) c.room.broadcastRoom();
    }
  }

  ranking() {
    const teams = Object.values(this.store.data.teams)
      .sort((a, b) => b.titles - a.titles || b.wins - a.wins)
      .slice(0, 20)
      .map((t) => this.teamView(t));
    const players = Object.values(this.store.data.players)
      .sort((a, b) => b.stats.titles - a.stats.titles || b.stats.wins - a.stats.wins)
      .slice(0, 20)
      .map((p) => ({ name: p.name, wins: p.stats.wins, games: p.stats.games, titles: p.stats.titles }));
    return { teams, players, championships: this.store.data.championships.slice(-10).reverse() };
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
