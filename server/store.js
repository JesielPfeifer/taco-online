// Tiny persistent store (one JSON file) for player wallets, purchases, teams and
// championship history. Writes are debounced and atomic (write temp file + rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EMPTY = { players: {}, teams: {}, championships: [] };

export class Store {
  constructor(dir = process.env.DATA_DIR || path.resolve('data')) {
    this.file = path.join(dir, 'taco.json');
    this.dir = dir;
    try {
      this.data = { ...EMPTY, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      this.data = structuredClone(EMPTY);
    }
    this.timer = null;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('falha ao salvar dados', err);
    }
  }

  // Public id derived from the secret key: safe to show to other players.
  static pub(key) {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
  }

  player(key, name) {
    let p = this.data.players[key];
    if (!p) {
      p = this.data.players[key] = {
        pub: Store.pub(key),
        name,
        coins: 100,
        owned: [],
        powersOff: [],
        stats: { games: 0, wins: 0, titles: 0 },
        createdAt: Date.now(),
      };
      this.save();
    }
    if (name && p.name !== name) {
      p.name = name;
      this.save();
    }
    return p;
  }

  byPub(pub) {
    return Object.values(this.data.players).find((p) => p.pub === pub) || null;
  }

  // ---- teams
  teamsOf(pub) {
    return Object.values(this.data.teams).filter((t) => t.members.includes(pub));
  }

  createTeam(pub, name, color) {
    if (this.teamsOf(pub).length >= 5) throw new Error('Você já está em 5 times');
    const id = crypto.randomUUID();
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 5 }, () => letters[crypto.randomInt(letters.length)]).join('');
    } while (Object.values(this.data.teams).some((t) => t.code === code));
    const team = { id, name, color, code, members: [pub], wins: 0, games: 0, titles: 0, createdAt: Date.now() };
    this.data.teams[id] = team;
    this.save();
    return team;
  }

  joinTeam(pub, code) {
    const team = Object.values(this.data.teams).find((t) => t.code === code);
    if (!team) throw new Error('Time não encontrado');
    if (team.members.includes(pub)) return team;
    if (team.members.length >= 2) throw new Error('Esse time já tem dois jogadores (é uma dupla)');
    team.members.push(pub);
    this.save();
    return team;
  }

  leaveTeam(pub, id) {
    const team = this.data.teams[id];
    if (!team) return;
    team.members = team.members.filter((m) => m !== pub);
    if (!team.members.length) delete this.data.teams[id];
    this.save();
  }
}
