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
      this.fresh = false;
    } catch {
      this.data = structuredClone(EMPTY);
      this.fresh = true;
    }
    this.timer = null;
    // Secret used to sign the wallet backups kept in each browser. Set TACO_SECRET so the
    // backups stay valid even if the data folder is lost (e.g. a deploy without a volume).
    this.secret = process.env.TACO_SECRET || this.data.secret;
    if (!this.secret) {
      this.secret = crypto.randomBytes(32).toString('hex');
      this.data.secret = this.secret;
      this.save();
    }
  }

  describe() {
    const players = Object.keys(this.data.players).length;
    return this.fresh
      ? `Dados: nenhum arquivo em ${this.file} (começando do zero). Se isso aconteceu depois de um deploy, o volume /data não está persistindo.`
      : `Dados: ${this.file} carregado (${players} jogadores, ${Object.keys(this.data.teams).length} times).`;
  }

  // ---- wallet backups (stored by the browser, verified with the server secret)
  sign(obj) {
    return crypto.createHmac('sha256', this.secret).update(JSON.stringify(obj)).digest('hex');
  }

  backupOf(p) {
    const data = { pub: p.pub, coins: p.coins, owned: p.owned, powersOff: p.powersOff, stats: p.stats, at: Date.now() };
    return { data, sig: this.sign(data) };
  }

  // Restore a wallet the server no longer has, if the browser's backup is genuine.
  restore(key, name, backup) {
    if (this.data.players[key] || !backup || typeof backup !== 'object') return false;
    const { data, sig } = backup;
    if (!data || typeof sig !== 'string' || data.pub !== Store.pub(key)) return false;
    const expected = this.sign(data);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const p = this.player(key, name);
    p.coins = Math.max(0, Number(data.coins) || 0);
    p.owned = Array.isArray(data.owned) ? data.owned.filter((x) => typeof x === 'string').slice(0, 200) : [];
    p.powersOff = Array.isArray(data.powersOff) ? data.powersOff.filter((x) => typeof x === 'string') : [];
    if (data.stats) p.stats = { games: +data.stats.games || 0, wins: +data.stats.wins || 0, titles: +data.stats.titles || 0 };
    this.save();
    return true;
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
      this.fresh = false;
    } catch (err) {
      console.error(`ERRO: não consegui salvar ${this.file} — moedas e compras serão perdidas ao reiniciar. Verifique permissões do volume.`, err.message);
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
