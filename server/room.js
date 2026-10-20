import {
  FIELD,
  BASE_R,
  TARGET_R,
  TARGET_H,
  BALL_R,
  MID_ZONE,
  PLAYER_R,
  BALL_SKINS,
  TEAM_NAMES,
  sanitizeRules,
  sanitizeAvatar,
  randomAvatar,
  DEFAULT_RULES,
} from '../shared/config.js';
import { botThink, botDecide } from './bots.js';

const DT = 1 / 60;
const G = 9.8;
const BOT_NAMES = ['Zeca', 'Tião', 'Juju', 'Dona Cida', 'Biel', 'Neném', 'Bia', 'Toninho', 'Lelê', 'Chico', 'Tatá', 'Nando'];

const r2 = (v) => Math.round(v * 100) / 100;
const hyp = (x, z) => Math.sqrt(x * x + z * z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Room {
  constructor(code, lobby) {
    this.code = code;
    this.lobby = lobby;
    this.members = new Map(); // id -> { id, name, avatar, client, bot }
    this.seats = [
      [null, null],
      [null, null],
    ];
    this.hostId = null;
    this.rules = { ...DEFAULT_RULES };
    this.ballSkin = 'tenis';
    this.phase = 'lobby';
    this.time = 0;
    this.frame = 0;
    this.events = [];
    this.botSeq = 0;
    this.timer = setInterval(() => this.tick(), 1000 / 60);
  }

  destroy() {
    clearInterval(this.timer);
  }

  // ---------------------------------------------------------------- lobby
  summary() {
    const host = this.members.get(this.hostId);
    return {
      code: this.code,
      host: host ? host.name : '',
      humans: this.humans().length,
      seated: this.seats.flat().filter(Boolean).length,
      phase: this.phase,
    };
  }

  humans() {
    return [...this.members.values()].filter((m) => m.client);
  }

  sendAll(msg) {
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) if (m.client && m.client.ws.readyState === 1) m.client.ws.send(data);
  }

  roomState() {
    return {
      t: 'room',
      code: this.code,
      host: this.hostId,
      phase: this.phase,
      rules: this.rules,
      ballSkin: this.ballSkin,
      seats: this.seats,
      members: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        bot: m.bot,
        voice: !!(m.voice && m.client),
        muted: !!m.muted,
      })),
    };
  }

  broadcastRoom() {
    this.sendAll(this.roomState());
  }

  join(client) {
    if (this.humans().length >= 12) return client.send({ t: 'err', msg: 'Sala cheia' });
    this.members.set(client.id, { id: client.id, name: client.name, avatar: client.avatar, client, bot: false });
    client.room = this;
    if (!this.hostId || !this.members.get(this.hostId)?.client) this.hostId = client.id;
    if (this.phase === 'lobby') {
      const free = this.firstFreeSeat();
      if (free) this.seats[free[0]][free[1]] = client.id;
    }
    this.broadcastRoom();
    this.chatSystem(`${client.name} entrou na sala`);
  }

  firstFreeSeat() {
    // Alternate teams so the first two humans end up as opponents.
    for (const [t, s] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      if (!this.seats[t][s]) return [t, s];
    return null;
  }

  leave(id, disconnected = false) {
    const m = this.members.get(id);
    if (!m) return;
    if (m.client) m.client.room = null;
    m.voice = false;
    const p = this.players?.get(id);
    if (this.phase !== 'lobby' && p) {
      // Keep the seat in the match: the avatar becomes "bete morto" and a bot takes over shortly.
      m.client = null;
      p.dead = true;
      p.discAt = this.time;
      this.ev({ k: 'msg', text: `${m.name} saiu${disconnected ? ' (caiu a conexão)' : ''}. Bete morto até um bot assumir.` });
    } else {
      this.members.delete(id);
      for (const t of [0, 1]) for (const s of [0, 1]) if (this.seats[t][s] === id) this.seats[t][s] = null;
    }
    if (this.hostId === id) this.hostId = this.humans()[0]?.id || null;
    if (!this.humans().length) {
      this.lobby.removeRoom(this);
      return;
    }
    this.broadcastRoom();
  }

  updateProfile(client) {
    const m = this.members.get(client.id);
    if (!m) return;
    m.name = client.name;
    m.avatar = client.avatar;
    const p = this.players?.get(client.id);
    if (p) p.name = m.name;
    this.broadcastRoom();
  }

  chatSystem(text) {
    this.sendAll({ t: 'chat', from: '', text });
  }

  isHost(client) {
    return client.id === this.hostId;
  }

  addBot(t, s) {
    if (this.seats[t][s]) return;
    const id = `b${this.code}${++this.botSeq}`;
    const used = new Set([...this.members.values()].map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${this.botSeq}`;
    this.members.set(id, { id, name, avatar: randomAvatar(), client: null, bot: true });
    this.seats[t][s] = id;
  }

  handle(client, msg) {
    const host = this.isHost(client);
    switch (msg.t) {
      case 'seat': {
        if (this.phase !== 'lobby') return;
        const t = Number(msg.team);
        const s = Number(msg.slot);
        if (![0, 1].includes(t) || ![0, 1].includes(s)) return;
        const occupant = this.seats[t][s];
        if (occupant && !(host && this.members.get(occupant)?.bot)) return;
        if (occupant) this.members.delete(occupant);
        for (const tt of [0, 1]) for (const ss of [0, 1]) if (this.seats[tt][ss] === client.id) this.seats[tt][ss] = null;
        this.seats[t][s] = client.id;
        return this.broadcastRoom();
      }
      case 'unseat':
        if (this.phase !== 'lobby') return;
        for (const t of [0, 1]) for (const s of [0, 1]) if (this.seats[t][s] === client.id) this.seats[t][s] = null;
        return this.broadcastRoom();
      case 'addBot':
        if (!host || this.phase !== 'lobby') return;
        if ([0, 1].includes(msg.team) && [0, 1].includes(msg.slot)) this.addBot(msg.team, msg.slot);
        return this.broadcastRoom();
      case 'kick': {
        if (!host || this.phase !== 'lobby') return;
        const id = this.seats[msg.team]?.[msg.slot];
        if (!id) return;
        this.seats[msg.team][msg.slot] = null;
        if (this.members.get(id)?.bot) this.members.delete(id);
        return this.broadcastRoom();
      }
      case 'rules':
        if (!host || this.phase !== 'lobby') return;
        this.rules = sanitizeRules(msg.rules);
        return this.broadcastRoom();
      case 'ballSkin':
        if (!host) return;
        if (BALL_SKINS.some(([k]) => k === msg.skin)) this.ballSkin = msg.skin;
        return this.broadcastRoom();
      case 'start':
        if (!host || this.phase !== 'lobby') return;
        return this.startGame();
      case 'again':
        if (!host || this.phase !== 'gameover') return;
        return this.backToLobby();
      case 'chat': {
        const text = String(msg.text || '')
          .replace(/[<>]/g, '')
          .trim()
          .slice(0, 140);
        if (text) this.sendAll({ t: 'chat', from: client.name, text });
        return;
      }
      case 'decide':
        return this.onDecide(client.id, msg);
      case 'in': {
        const p = this.players?.get(client.id);
        if (!p) return;
        const mx = clamp(Number(msg.mx) || 0, -1, 1);
        const mz = clamp(Number(msg.mz) || 0, -1, 1);
        const ax = clamp(Number(msg.ax) || 0, -60, 60);
        const az = clamp(Number(msg.az) || 0, -60, 60);
        const sig = `${mx.toFixed(1)}${mz.toFixed(1)}${ax.toFixed(0)}${az.toFixed(0)}`;
        if (sig !== p.inputSig) {
          p.inputSig = sig;
          this.touchActivity(p);
        }
        p.input = { mx, mz, ax, az, sp: !!msg.sp };
        p.charging = !!msg.ch && this.ball?.holder === p.id;
        return;
      }
      case 'voice': {
        const m = this.members.get(client.id);
        if (!m) return;
        m.voice = !!msg.on;
        m.muted = !!msg.muted;
        return this.broadcastRoom();
      }
      case 'rtc': {
        // WebRTC signaling relay (SDP offers/answers and ICE candidates) between voice peers.
        const from = this.members.get(client.id);
        const to = this.members.get(String(msg.to || ''));
        if (!from?.voice || !to?.client || !to.voice || typeof msg.data !== 'object') return;
        to.client.send({ t: 'rtc', from: client.id, data: msg.data });
        return;
      }
      case 'act': {
        const p = this.players?.get(client.id);
        if (!p) return;
        this.touchActivity(p);
        if (Number.isFinite(msg.ax) && Number.isFinite(msg.az)) {
          p.input.ax = clamp(msg.ax, -60, 60);
          p.input.az = clamp(msg.az, -60, 60);
        }
        return this.act(p, String(msg.a), msg);
      }
    }
  }

  touchActivity(p) {
    p.lastActive = this.time;
    if (p.dead && !p.discAt) {
      p.dead = false;
      this.ev({ k: 'msg', text: `${p.name} voltou: taco vivo de novo.` });
    }
  }

  // ---------------------------------------------------------------- match setup
  startGame() {
    for (const t of [0, 1]) for (const s of [0, 1]) if (!this.seats[t][s]) this.addBot(t, s);
    this.players = new Map();
    for (const t of [0, 1])
      for (const s of [0, 1]) {
        const m = this.members.get(this.seats[t][s]);
        this.players.set(m.id, {
          id: m.id,
          name: m.name,
          bot: m.bot,
          team: t,
          slot: s,
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          rot: 0,
          input: { mx: 0, mz: 0, ax: 0, az: 0, sp: false },
          inputSig: '',
          stamina: 1,
          swingT: -1,
          swingCd: 0,
          swingHit: false,
          throwAt: -10,
          shoulder: false,
          licenca: null,
          licencaUntil: 0,
          crossed: false,
          homeBase: s,
          post: s,
          frozen: false,
          frozenUntil: 0,
          retaThrow: null,
          penaltyThrow: null,
          dead: false,
          discAt: 0,
          lastActive: 0,
          ai: {},
        });
      }
    this.score = [0, 0];
    this.battingTeam = 0;
    this.winner = null;
    this.ball = this.newBall();
    this.knocked = [false, false];
    this.resetCounters();
    this.layoutPlayers();
    this.startDecide();
    this.broadcastRoom();
  }

  backToLobby() {
    this.phase = 'lobby';
    this.players = null;
    for (const t of [0, 1])
      for (const s of [0, 1]) {
        const id = this.seats[t][s];
        const m = this.members.get(id);
        if (m && !m.client && !m.bot) {
          this.members.delete(id);
          this.seats[t][s] = null;
        }
      }
    this.broadcastRoom();
  }

  newBall() {
    return {
      x: 0,
      y: 1,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      holder: null,
      lastTouch: { kind: 'none', by: null, team: null, targetBase: null, t: 0 },
      bouncedSinceHit: true,
      lanchaDone: false,
      restT: 0,
      outside: false,
      outsideT: 0,
      thrower: null,
      throwT: -10,
      retaChecked: true,
    };
  }

  resetCounters() {
    this.paraTras = 0;
    this.lancha = 0;
    this.reta = null;
    this.runPending = false;
    this.pendingLose = null;
    this.pendingPenalty = null;
    this.finalState = null;
    this.pause = null;
  }

  zb(k) {
    return (k === 0 ? -1 : 1) * (this.rules.baseDistance / 2);
  }

  sgn(k) {
    return k === 0 ? -1 : 1;
  }

  batters() {
    return [...this.players.values()].filter((p) => p.team === this.battingTeam).sort((a, b) => a.slot - b.slot);
  }

  fielders() {
    return [...this.players.values()].filter((p) => p.team !== this.battingTeam).sort((a, b) => a.slot - b.slot);
  }

  layoutPlayers() {
    for (const p of this.players.values()) {
      p.vx = p.vz = 0;
      p.swingT = -1;
      p.shoulder = false;
      p.licenca = null;
      p.crossed = false;
      p.frozen = false;
      p.retaThrow = null;
      p.penaltyThrow = null;
      if (p.team === this.battingTeam) {
        p.homeBase = p.slot;
        p.x = 0.55;
        p.z = this.zb(p.slot);
        p.rot = p.slot === 0 ? 0 : Math.PI;
      } else {
        p.post = p.slot;
        p.x = -0.5;
        p.z = this.zb(p.slot) + this.sgn(p.slot) * 2.2;
        p.rot = p.slot === 0 ? 0 : Math.PI;
      }
    }
    this.knocked = [false, false];
    const pitcher = this.fielders().find((f) => f.post === 0);
    this.ball = this.newBall();
    this.ball.holder = pitcher.id;
  }

  beginInnings(team, text) {
    this.battingTeam = team;
    this.resetCounters();
    this.layoutPlayers();
    this.phase = 'intro';
    this.phaseUntil = this.time + 1.6;
    this.ev({ k: 'innings', text: text || `Time ${TEAM_NAMES[team]} está com os tacos!` });
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- who starts
  captain(team) {
    const ids = this.seats[team];
    const human = ids.find((id) => this.members.get(id)?.client);
    return human || ids[0];
  }

  startDecide() {
    const method = this.rules.startMethod;
    this.phase = 'decide';
    const captains = [this.captain(0), this.captain(1)];
    if (method === 'aleatorio') {
      const w = Math.random() < 0.5 ? 0 : 1;
      this.decide = { method, stage: 'done', winner: w, captains, until: this.time + 2.5 };
      this.ev({ k: 'msg', text: `Sorteio: Time ${TEAM_NAMES[w]} começa no taco` });
    } else if (method === 'molhado') {
      this.decide = { method, stage: 'choose', captains, choice: null, result: null, until: this.time + 20 };
    } else if (method === 'parimpar') {
      this.decide = { method, stage: 'choose', captains, parity: null, numA: null, numB: null, until: this.time + 20 };
    } else {
      const length = Math.round(70 + Math.random() * 12);
      this.decide = {
        method: 'palmo',
        stage: 'hands',
        captains,
        length,
        remaining: length,
        hands: [],
        turn: 0,
        holder: null,
        success: null,
        until: this.time + 15,
      };
    }
  }

  onDecide(id, msg) {
    const d = this.decide;
    if (this.phase !== 'decide' || !d) return;
    const team = d.captains.indexOf(id);
    if (team < 0) return;
    if (d.method === 'molhado' && d.stage === 'choose' && team === 0) {
      if (msg.choice === 'molhado' || msg.choice === 'seco') this.molhadoChoose(msg.choice);
    } else if (d.method === 'parimpar' && d.stage === 'choose') {
      const n = Number(msg.num);
      if (!Number.isInteger(n) || n < 0 || n > 5) return;
      if (team === 0 && d.numA == null && (msg.parity === 'par' || msg.parity === 'impar')) {
        d.parity = msg.parity;
        d.numA = n;
      } else if (team === 1 && d.numB == null) d.numB = n;
      this.parImparCheck();
    } else if (d.method === 'palmo') {
      if (d.stage === 'hands' && d.turn === team && msg.hand) this.palmoHand();
      else if (d.stage === 'balance' && d.holder === team && typeof msg.balance === 'boolean') this.palmoDone(msg.balance);
    }
  }

  molhadoChoose(choice) {
    const d = this.decide;
    d.choice = choice;
    d.result = Math.random() < 0.5 ? 'molhado' : 'seco';
    d.winner = d.result === choice ? 0 : 1;
    d.stage = 'flip';
    d.until = this.time + 3;
    this.ev({ k: 'msg', text: `Time ${TEAM_NAMES[0]} escolheu ${choice}. Taco para cima...` });
  }

  parImparCheck() {
    const d = this.decide;
    if (d.numA == null || d.numB == null) return;
    d.sum = d.numA + d.numB;
    const even = d.sum % 2 === 0;
    d.winner = (d.parity === 'par') === even ? 0 : 1;
    d.stage = 'done';
    d.until = this.time + 3.5;
    this.ev({ k: 'msg', text: `${d.numA} + ${d.numB} = ${d.sum} (${even ? 'par' : 'ímpar'}): Time ${TEAM_NAMES[d.winner]} começa no taco` });
  }

  palmoHand() {
    const d = this.decide;
    const w = Math.round((8 + Math.random() * 2) * 10) / 10;
    d.remaining = Math.round((d.remaining - w) * 10) / 10;
    d.hands.push({ team: d.turn, w });
    d.holder = d.turn;
    d.turn = 1 - d.turn;
    d.until = this.time + 15;
    if (d.remaining < 8) {
      d.stage = 'balance';
      d.until = this.time + 18;
      this.ev({ k: 'msg', text: `Último palmo do Time ${TEAM_NAMES[d.holder]}! Equilibre o taco por 10 segundos.` });
    }
  }

  palmoDone(ok) {
    const d = this.decide;
    d.success = ok;
    d.winner = ok ? d.holder : 1 - d.holder;
    d.stage = 'done';
    d.until = this.time + 3;
    this.ev({
      k: 'msg',
      text: ok ? `Equilibrou! Time ${TEAM_NAMES[d.winner]} começa no taco` : `Deixou cair! Time ${TEAM_NAMES[d.winner]} começa no taco`,
    });
  }

  tickDecide() {
    const d = this.decide;
    botDecide(this, d);
    if (this.time < d.until) return;
    if (d.stage === 'done') return this.beginInnings(d.winner);
    if (d.method === 'molhado') {
      if (d.stage === 'choose') this.molhadoChoose(Math.random() < 0.5 ? 'molhado' : 'seco');
      else {
        d.stage = 'done';
        d.until = this.time + 2;
        this.ev({ k: 'msg', text: `Caiu ${d.result}! Time ${TEAM_NAMES[d.winner]} começa no taco` });
      }
    } else if (d.method === 'parimpar') {
      if (d.numA == null) {
        d.parity = d.parity || (Math.random() < 0.5 ? 'par' : 'impar');
        d.numA = Math.floor(Math.random() * 6);
      }
      if (d.numB == null) d.numB = Math.floor(Math.random() * 6);
      this.parImparCheck();
    } else if (d.method === 'palmo') {
      if (d.stage === 'hands') this.palmoHand();
      else this.palmoDone(false);
    }
  }

  // ---------------------------------------------------------------- main loop
  ev(e) {
    this.events.push(e);
  }

  tick() {
    this.frame++;
    if (this.phase === 'lobby') return;
    this.time += DT;
    switch (this.phase) {
      case 'decide':
        this.tickDecide();
        break;
      case 'intro':
      case 'swap':
        this.movePlayers(DT, true);
        if (this.time >= this.phaseUntil) {
          if (this.phase === 'intro') this.phase = 'playing';
          else this.beginInnings(this.nextBatting, this.nextText);
        }
        break;
      case 'paused':
        if (this.time >= this.pause.until) this.resume('Acabou o tempo de descanso: jogo retomado!');
        break;
      case 'playing':
      case 'final':
        this.tickPlay(DT);
        break;
    }
    if (this.frame % 2 === 0) this.sendSnapshot();
  }

  tickPlay(dt) {
    const ph = this.phase;
    for (const p of this.players.values()) if (p.bot) botThink(this, p, dt);
    this.movePlayers(dt, false);
    this.updateBall(dt);
    if (this.phase !== ph) return;
    if (ph === 'playing') {
      this.checkRuns();
      this.checkReta();
    } else this.checkFinal();
    this.checkMisc();
  }

  checkMisc() {
    const t = this.time;
    if (this.pendingLose && t >= this.pendingLose.at) {
      const pl = this.pendingLose;
      this.pendingLose = null;
      return this.loseTacos(pl.text);
    }
    if (this.pendingPenalty && t >= this.pendingPenalty.at) {
      this.setupPenalty(this.pendingPenalty.base);
      this.pendingPenalty = null;
    }
    for (const p of this.players.values()) {
      const m = this.members.get(p.id);
      if (p.discAt && t - p.discAt > 8) {
        p.discAt = 0;
        p.dead = false;
        p.bot = true;
        if (m) m.bot = true;
        this.ev({ k: 'msg', text: `Um bot assumiu o lugar de ${p.name}.` });
        this.broadcastRoom();
      }
      if (!p.bot && !p.dead && p.team === this.battingTeam && t - p.lastActive > 35) {
        p.dead = true;
        this.ev({ k: 'msg', text: `Bete morto! ${p.name} sumiu sem pedir tempo: a casinha dele pode ser derrubada.` });
      }
      if (p.licenca != null && t > p.licencaUntil) {
        p.licenca = null;
        this.ev({ k: 'msg', text: `Acabou a licença de ${p.name}.` });
      }
      if (p.frozen && p.frozenUntil && t > p.frozenUntil) {
        p.frozen = false;
        p.retaThrow = null;
        p.penaltyThrow = null;
        if (this.reta) this.reta = null;
        this.clearShoulders();
      }
    }
  }

  // ---------------------------------------------------------------- players
  movePlayers(dt, free) {
    const fw = FIELD.worldHalfW - 0.5;
    const fl = FIELD.worldHalfL - 0.5;
    for (const p of this.players.values()) {
      if (p.swingT >= 0) {
        p.swingT += dt;
        if (p.swingT > 0.45) p.swingT = -1;
      }
      p.swingCd -= dt;
      let { mx, mz } = p.input;
      const len = hyp(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      let speed = 5.2;
      if (p.input.sp && p.stamina > 0.05 && len > 0.1) {
        speed = 7.6;
        p.stamina = Math.max(0, p.stamina - dt * 0.33);
      } else p.stamina = Math.min(1, p.stamina + dt * 0.18);
      if (Math.abs(p.x) > FIELD.halfW || Math.abs(p.z) > FIELD.halfL) speed *= 0.5; // mato
      if (p.swingT >= 0) speed *= 0.35;
      if (p.dead || (!free && p.frozen)) speed = 0;
      const k = Math.min(1, dt * 12);
      p.vx += (mx * speed - p.vx) * k;
      p.vz += (mz * speed - p.vz) * k;
      p.x = clamp(p.x + p.vx * dt, -fw, fw);
      p.z = clamp(p.z + p.vz * dt, -fl, fl);
      const ax = p.input.ax - p.x;
      const az = p.input.az - p.z;
      if (hyp(ax, az) > 0.3) p.rot = Math.atan2(ax, az);
      else if (hyp(p.vx, p.vz) > 0.5) p.rot = Math.atan2(p.vx, p.vz);
      // Tripods are solid.
      for (const kk of [0, 1]) {
        if (this.knocked[kk]) continue;
        const dx = p.x;
        const dz = p.z - this.zb(kk);
        const d = hyp(dx, dz);
        const min = TARGET_R + PLAYER_R;
        if (d < min && d > 1e-4) {
          p.x = (dx / d) * min;
          p.z = this.zb(kk) + (dz / d) * min;
        }
      }
    }
    const list = [...this.players.values()];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = hyp(dx, dz);
        const min = PLAYER_R * 2;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
  }

  inBase(p, k) {
    return hyp(p.x, p.z - this.zb(k)) <= BASE_R;
  }

  nearestBase(p) {
    return Math.abs(p.z - this.zb(0)) < Math.abs(p.z - this.zb(1)) ? 0 : 1;
  }

  isBehind(p, k) {
    return this.sgn(k) * p.z >= Math.abs(this.zb(k)) + 0.4 && Math.abs(p.x) < 6;
  }

  // A base is "protected" while a batter keeps the bat on the ground inside it
  // (or has asked for "licença"). Lifting the bat only exposes the base while
  // the ball has not been thrown (rule 1); swinging at a live ball is fine.
  isProtected(k) {
    const ballHeld = !!this.ball.holder;
    for (const b of this.batters()) {
      if (b.licenca === k) return true;
      if (b.dead) continue;
      if (this.inBase(b, k) && (b.swingT < 0 || !ballHeld) && !b.shoulder) return true;
    }
    return false;
  }

  runsOpen() {
    if (this.pendingLose || this.pendingPenalty) return false;
    const h = this.ball.holder && this.players.get(this.ball.holder);
    if (h && h.team !== this.battingTeam && (this.isBehind(h, 0) || this.isBehind(h, 1))) return false;
    if (this.batters().some((b) => b.licenca != null)) return false;
    return true;
  }

  // ---------------------------------------------------------------- actions
  act(p, a, msg) {
    if (this.phase === 'paused') {
      if (a === 'tempo') this.tempo(p);
      return;
    }
    if (this.phase !== 'playing' && this.phase !== 'final') return;
    const batting = p.team === this.battingTeam;
    switch (a) {
      case 'swing':
        if (!batting || p.shoulder || p.dead || p.swingCd > 0 || this.phase === 'final') return;
        p.swingT = 0;
        p.swingHit = false;
        p.swingCd = 0.6;
        this.ev({ k: 'swing', id: p.id });
        return;
      case 'throw':
        if (batting) return;
        return this.throwBall(p, clamp(Number(msg.power) || 0, 0.05, 1));
      case 'touch':
        if (batting) return;
        return this.touchTarget(p);
      case 'clash':
        if (batting && this.phase === 'playing') this.tryClash(2.4);
        return;
      case 'reta':
        if (!batting) this.callReta(p);
        return;
      case 'nada':
        if (batting && this.reta && this.reta.state === 'avail') {
          this.reta = null;
          this.ev({ k: 'call', text: `${p.name}: "NADA!" O lançador tem que voltar para trás da base.` });
        }
        return;
      case 'patio':
        if (!batting) this.callPatio(p);
        return;
      case 'licenca':
        if (batting) this.licenca(p);
        return;
      case 'tempo':
        return this.tempo(p);
    }
  }

  throwBall(p, power) {
    const b = this.ball;
    if (b.holder !== p.id || p.dead) return;
    let dx = p.input.ax - p.x;
    let dz = p.input.az - p.z;
    let dist = hyp(dx, dz);
    if (dist < 0.5) {
      dx = Math.sin(p.rot);
      dz = Math.cos(p.rot);
      dist = 6;
    } else {
      dx /= dist;
      dz /= dist;
    }
    let kind = 'throw';
    let targetBase = null;
    if (this.phase === 'final') kind = 'final';
    else if (p.retaThrow != null) {
      kind = 'reta';
      targetBase = p.retaThrow;
      this.reta = null;
    } else if (p.penaltyThrow != null) {
      kind = 'pitch';
      targetBase = p.penaltyThrow;
    } else {
      for (const k of [0, 1]) if (this.isBehind(p, k)) {
        kind = 'pitch';
        targetBase = 1 - k;
      }
    }
    p.retaThrow = null;
    p.penaltyThrow = null;
    p.charging = false;
    p.frozen = false;
    p.frozenUntil = 0;
    const noise = (Math.random() - 0.5) * (0.025 + power * 0.07);
    const c = Math.cos(noise);
    const s = Math.sin(noise);
    const ndx = dx * c - dz * s;
    const ndz = dx * s + dz * c;
    const vh = 7 + power * 15;
    const t = dist / vh;
    const vy = clamp((0.45 - 1.5 + 0.5 * G * t * t) / t, -3, 13);
    b.holder = null;
    b.x = p.x + ndx * 0.45;
    b.z = p.z + ndz * 0.45;
    b.y = 1.5;
    b.vx = ndx * vh;
    b.vz = ndz * vh;
    b.vy = vy;
    b.lastTouch = { kind, by: p.id, team: p.team, targetBase, t: this.time };
    b.lanchaDone = false;
    b.thrower = p.id;
    b.throwT = this.time;
    b.restT = 0;
    b.bouncedSinceHit = true;
    p.throwAt = this.time;
    this.ev({ k: 'throw', id: p.id, kind });
  }

  touchTarget(p) {
    if (this.ball.holder !== p.id || this.phase !== 'playing') return;
    for (const k of [0, 1]) {
      if (this.knocked[k]) continue;
      if (hyp(p.x, p.z - this.zb(k)) > 1.3) continue;
      if (this.isProtected(k)) {
        this.ev({ k: 'msg', text: 'Base protegida: o taco está no chão!', to: p.id });
        return;
      }
      p.throwAt = this.time;
      return this.knockTarget(k, `${p.name} queimou na mão!`);
    }
  }

  tryClash(maxDist) {
    const [a, b] = this.batters();
    if (!a || !b || a.crossed || b.crossed || this.runPending || a.dead || b.dead) return;
    if (Math.abs(a.z) > MID_ZONE || Math.abs(b.z) > MID_ZONE) return;
    if (hyp(a.x - b.x, a.z - b.z) > maxDist) return;
    if (!this.runsOpen()) return;
    this.ev({ k: 'clank', text: 'Cruzou os tacos!' });
    const bt = this.battingTeam;
    if (this.score[bt] >= this.rules.targetScore) {
      if (this.rules.finalMode === 'paulista') return this.enterFinal();
      return this.win(bt, `Time ${TEAM_NAMES[bt]} cruzou os tacos com ${this.score[bt]} pontos!`);
    }
    a.crossed = b.crossed = true;
    this.runPending = true;
  }

  checkRuns() {
    this.tryClash(1.9);
    for (const p of this.batters()) {
      if (p.crossed && this.inBase(p, 1 - p.homeBase)) {
        p.homeBase = 1 - p.homeBase;
        p.crossed = false;
      }
    }
    const [a, b] = this.batters();
    if (this.runPending && !a.crossed && !b.crossed) {
      this.runPending = false;
      const bt = this.battingTeam;
      this.score[bt] += this.rules.pointsPerRun;
      const desc = this.paraTras ? ` (descontou ${this.paraTras} pra trás)` : '';
      this.paraTras = 0;
      this.ev({ k: 'point', text: `+${this.rules.pointsPerRun} para o Time ${TEAM_NAMES[bt]}!${desc}` });
      if (this.score[bt] >= this.rules.targetScore)
        this.ev({ k: 'msg', text: `Time ${TEAM_NAMES[bt]} atingiu ${this.score[bt]}! Agora é cruzar os tacos para vencer.` });
    }
  }

  callReta(p) {
    const r = this.reta;
    if (!r || r.state !== 'avail') return;
    r.state = 'called';
    const hitter = this.players.get(r.hitter);
    if (hitter) hitter.shoulder = true;
    this.ev({
      k: 'call',
      text: `${p.name}: "RETA!" Bete-ombro: ${hitter ? hitter.name : 'o rebatedor'} põe o taco no ombro e a bola sai de onde parou.`,
    });
    const h = this.ball.holder && this.players.get(this.ball.holder);
    if (h && h.team !== this.battingTeam && hyp(h.x - r.x, h.z - r.z) < 1.8) this.armReta(h);
  }

  armReta(f) {
    const r = this.reta;
    r.state = 'armed';
    f.frozen = true;
    f.frozenUntil = this.time + 10;
    f.retaThrow = r.base;
  }

  checkReta() {
    const b = this.ball;
    const r = this.reta;
    if (r) {
      if (r.state === 'avail') {
        const h = b.holder && this.players.get(b.holder);
        if (this.time > r.until || (h && hyp(h.x - r.x, h.z - r.z) > 1.8)) this.reta = null;
      }
      return;
    }
    if (this.rules.retaRule !== 'reta' || b.retaChecked || b.holder || b.restT < 0.3) return;
    if (b.lastTouch.kind !== 'hit') return;
    b.retaChecked = true;
    const half = this.rules.baseDistance / 2;
    if (Math.abs(b.z) < half - 0.3 && Math.abs(b.x) < 2.5) {
      this.reta = { state: 'avail', base: b.lastTouch.base, hitter: b.lastTouch.by, x: b.x, z: b.z, until: this.time + 8 };
      this.ev({ k: 'msg', text: 'Bola parada entre as casinhas! Lançador: R = "reta". Rebatedor: N = "nada".' });
    }
  }

  callPatio(p) {
    const b = this.ball;
    if (b.holder || !b.outside) return;
    const bt = this.battingTeam;
    const ppr = this.rules.pointsPerRun;
    const bonus = this.rules.patioBonus;
    let text = `${p.name}: "PÁTIO! Bolinha perdida!"`;
    if (bonus === 'vitoria') return this.win(bt, `${text} Vitória do Time ${TEAM_NAMES[bt]}.`);
    const add = bonus === 'corrida' ? ppr : bonus === 'duas' ? ppr * 2 : 0;
    this.score[bt] += add;
    if (add) text += ` Time ${TEAM_NAMES[bt]} ganha +${add} pela interrupção.`;
    this.ev({ k: 'call', text });
    this.resetPlay();
  }

  // Reset positions/ball without changing who bats (pátio, penalty, final miss).
  resetPlay() {
    const keep = this.batters().map((b) => b.homeBase);
    this.runPending = false;
    this.reta = null;
    this.layoutPlayers();
    this.batters().forEach((b, i) => {
      b.homeBase = keep[i];
      b.z = this.zb(b.homeBase);
    });
  }

  licenca(p) {
    if (p.licenca != null) {
      p.licenca = null;
      this.ev({ k: 'msg', text: `${p.name} voltou com o taco no chão.` });
      return;
    }
    const k = this.inBase(p, 0) ? 0 : this.inBase(p, 1) ? 1 : -1;
    if (k < 0) return this.ev({ k: 'msg', text: 'Licença só dentro da base.', to: p.id });
    p.licenca = k;
    p.licencaUntil = this.time + 20;
    this.ev({ k: 'call', text: `${p.name}: "Licença!" Pode tirar o taco do chão sem ser queimado (sem correr).` });
  }

  tempo(p) {
    if (this.phase === 'paused') {
      if (p.team === this.pause.by || this.time > this.pause.until - 70) this.resume(`${p.name} encerrou o tempo. Jogo retomado!`);
      return;
    }
    if (this.phase !== 'playing' || this.pendingLose) return;
    this.pause = { by: p.team, name: p.name, until: this.time + 100 };
    this.phase = 'paused';
    this.ev({ k: 'call', text: `${p.name} pediu TEMPO ("licença betes"). Contando até 100...` });
    if (this.rules.tempoPenalty && p.team === this.battingTeam) this.addParaTras('pelo tempo pedido');
  }

  resume(text) {
    this.phase = 'playing';
    this.pause = null;
    this.ev({ k: 'msg', text });
  }

  // ---------------------------------------------------------------- outcomes
  addParaTras(why = '') {
    const lim = this.rules.paraTrasLimit;
    if (!lim) return;
    const bt = this.battingTeam;
    if (this.rules.noTrasAtMax && this.score[bt] >= this.rules.targetScore) {
      this.ev({ k: 'msg', text: 'Na pontuação máxima não tem "trás".' });
      return;
    }
    this.paraTras++;
    this.ev({ k: 'tras', text: `${this.paraTras === 1 ? 'Uma' : this.paraTras === 2 ? 'Duas' : 'Três'} pra trás${why ? ' ' + why : ''}!` });
    if (this.paraTras >= lim && !this.pendingLose) this.pendingLose = { at: this.time + 1, text: 'Três pra trás! Perderam os tacos.' };
  }

  lanchaHit(p) {
    const b = this.ball;
    b.lanchaDone = true;
    b.vx *= -0.25;
    b.vz *= -0.25;
    b.vy = Math.abs(b.vy) * 0.3;
    const rule = this.rules.lanchaRule;
    if (rule === 'imediato') {
      this.ev({ k: 'lancha', text: `A bola encostou em ${p.name}!` });
      if (!this.pendingLose) this.pendingLose = { at: this.time + 0.8, text: 'Bola no rebatedor: perderam os tacos!' };
      return;
    }
    if (rule === 'penalti') {
      this.ev({ k: 'lancha', text: `Bola no pé de ${p.name}: PÊNALTI!` });
      this.pendingPenalty = { at: this.time + 1.2, base: this.nearestBase(p) };
      return;
    }
    this.lancha++;
    this.ev({ k: 'lancha', text: `${this.lancha === 1 ? 'Uma' : this.lancha === 2 ? 'Duas' : 'Três'} na lancha!` });
    if (this.lancha >= 3) {
      if (rule === 'menos4') {
        const bt = this.battingTeam;
        this.score[bt] = Math.max(0, this.score[bt] - 4);
        this.lancha = 0;
        this.ev({ k: 'msg', text: `Três na lancha: Time ${TEAM_NAMES[bt]} perde 4 pontos.` });
      } else if (!this.pendingLose) this.pendingLose = { at: this.time + 0.8, text: 'Três na lancha! Perderam os tacos.' };
    }
  }

  setupPenalty(base) {
    this.resetPlay();
    const f = this.fielders().find((x) => x.post === 1 - base) || this.fielders()[0];
    const s = this.sgn(base);
    f.x = 0;
    f.z = this.zb(base) - s * 4;
    f.rot = s > 0 ? 0 : Math.PI;
    f.frozen = true;
    f.frozenUntil = this.time + 12;
    f.penaltyThrow = base;
    this.ball.holder = f.id;
    this.ev({ k: 'msg', text: `${f.name} cobra o pênalti de perto na casinha!` });
  }

  vitoria(f) {
    const text = `${f.name} pegou no ar: "VITÓRIA!"`;
    const rule = this.rules.catchRule;
    this.ev({ k: 'vitoria', text });
    if (rule === 'jogo') return this.win(f.team, `${text} Vitória automática do Time ${TEAM_NAMES[f.team]}.`);
    if (rule === 'taco2') this.score[f.team] += 2;
    this.loseTacos(rule === 'taco2' ? `${text} Ganharam o taco e +2 pontos.` : `${text} Entreguem os tacos!`);
  }

  knockTarget(k, text) {
    this.knocked[k] = true;
    this.ev({ k: 'knock', base: k });
    this.loseTacos(text || 'Queimou! A casinha caiu.');
  }

  loseTacos(text) {
    if (this.phase !== 'playing' && this.phase !== 'final') return;
    const bt = this.battingTeam;
    if (this.rules.halfOnLoseAtMax && this.score[bt] >= this.rules.targetScore) {
      this.score[bt] = Math.floor(this.score[bt] / 2);
      text += ` Estavam na máxima: pontos caem para ${this.score[bt]}.`;
    }
    this.ev({ k: 'swap', text });
    this.phase = 'swap';
    this.phaseUntil = this.time + 2.8;
    this.nextBatting = 1 - bt;
    this.nextText = `Troca! Time ${TEAM_NAMES[1 - bt]} pega os tacos.`;
    this.pendingLose = null;
    const b = this.ball;
    b.vx *= 0.3;
    b.vz *= 0.3;
  }

  win(team, text) {
    this.winner = team;
    this.phase = 'gameover';
    this.winText = text;
    this.ev({ k: 'win', team, text });
    this.broadcastRoom();
  }

  enterFinal() {
    this.phase = 'final';
    this.finalState = { thrown: false };
    for (const b of this.batters()) {
      b.frozen = true;
      b.frozenUntil = 0;
      b.vx = b.vz = 0;
    }
    const h = this.ball.holder && this.players.get(this.ball.holder);
    if (h) {
      h.frozen = true;
      h.frozenUntil = 0;
    }
    this.ev({
      k: 'call',
      text: 'De pé sobre os tacos! Lançadores: acertem os rebatedores lançando de onde pegarem a bola. Errou, perdeu!',
    });
  }

  checkFinal() {
    const b = this.ball;
    const fs = this.finalState;
    if (b.lastTouch.kind === 'final') fs.thrown = true;
    if (!fs.thrown) return;
    if ((!b.holder && b.restT > 0.6) || b.outside || (b.holder && this.time - b.throwT > 0.4)) {
      const bt = this.battingTeam;
      this.win(bt, `O lançador errou! Vitória do Time ${TEAM_NAMES[bt]}.`);
    }
  }

  finalHit(p) {
    const bt = this.battingTeam;
    const loss = Math.ceil(this.rules.targetScore / 2);
    this.score[bt] = Math.max(0, this.score[bt] - loss);
    this.ev({ k: 'lancha', text: `Acertou ${p.name}! Time ${TEAM_NAMES[bt]} perde ${loss} pontos, mas continua no taco.` });
    this.phase = 'swap';
    this.phaseUntil = this.time + 2.5;
    this.nextBatting = bt;
    this.nextText = `Time ${TEAM_NAMES[bt]} continua com os tacos.`;
  }

  clearShoulders() {
    for (const p of this.players.values()) p.shoulder = false;
  }

  // ---------------------------------------------------------------- ball physics
  updateBall(dt) {
    const b = this.ball;
    if (b.holder) {
      const h = this.players.get(b.holder);
      b.x = h.x + Math.sin(h.rot + 0.9) * 0.3;
      b.z = h.z + Math.cos(h.rot + 0.9) * 0.3;
      b.y = 1.05;
      b.vx = b.vy = b.vz = 0;
      b.outside = false;
      return;
    }
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (this.stepBall(h)) return;
      if (this.phase !== 'playing' && this.phase !== 'final') return;
    }
    const sp = hyp(b.vx, b.vz);
    if (sp < 0.15 && b.y <= BALL_R + 0.01 && Math.abs(b.vy) < 0.1) b.restT += dt;
    else b.restT = 0;
    if (b.restT > 0.6 && b.lastTouch.kind !== 'hit') this.clearShoulders();
  }

  // Returns true when the ball got picked up.
  stepBall(h) {
    const b = this.ball;
    const px = b.x;
    const pz = b.z;
    b.vy -= G * h;
    const drag = 1 - 0.04 * h;
    b.vx *= drag;
    b.vz *= drag;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      b.bouncedSinceHit = true;
      if (b.vy < -1.2) {
        b.vy = -b.vy * 0.45;
        b.vx *= 0.8;
        b.vz *= 0.8;
      } else {
        b.vy = 0;
        const sp = hyp(b.vx, b.vz);
        const dec = (Math.abs(b.x) > FIELD.halfW || Math.abs(b.z) > FIELD.halfL ? 9 : 2.6) * h;
        if (sp <= dec) b.vx = b.vz = 0;
        else {
          b.vx *= (sp - dec) / sp;
          b.vz *= (sp - dec) / sp;
        }
      }
    }
    // Fence: low balls bounce back, high balls fly over into the pátio/mato.
    const wasIn = Math.abs(px) <= FIELD.halfW && Math.abs(pz) <= FIELD.halfL;
    const isIn = Math.abs(b.x) <= FIELD.halfW && Math.abs(b.z) <= FIELD.halfL;
    if (wasIn !== isIn && b.y < FIELD.fenceH) {
      if ((Math.abs(px) <= FIELD.halfW) !== (Math.abs(b.x) <= FIELD.halfW)) {
        b.x = px;
        b.vx *= -0.4;
      }
      if ((Math.abs(pz) <= FIELD.halfL) !== (Math.abs(b.z) <= FIELD.halfL)) {
        b.z = pz;
        b.vz *= -0.4;
      }
    }
    const ww = FIELD.worldHalfW;
    const wl = FIELD.worldHalfL;
    if (Math.abs(b.x) > ww) {
      b.x = Math.sign(b.x) * ww;
      b.vx *= -0.3;
    }
    if (Math.abs(b.z) > wl) {
      b.z = Math.sign(b.z) * wl;
      b.vz *= -0.3;
    }
    const out = Math.abs(b.x) > FIELD.halfW || Math.abs(b.z) > FIELD.halfL;
    if (out && !b.outside) this.ev({ k: 'msg', text: 'A bola foi para o mato! Lançadores podem gritar "PÁTIO" (P).' });
    b.outside = out;

    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    const lt = b.lastTouch;
    const final = this.phase === 'final';

    // Targets ("casinhas").
    if (!final)
      for (const k of [0, 1]) {
        if (this.knocked[k] || speed < 0.4) continue;
        const dx = b.x;
        const dz = b.z - this.zb(k);
        const d = hyp(dx, dz);
        if (d < TARGET_R + BALL_R && b.y < TARGET_H) {
          const legal = (lt.kind === 'pitch' || lt.kind === 'reta') && lt.targetBase === k;
          if (legal || !this.isProtected(k)) {
            const who = this.players.get(lt.by);
            const text =
              lt.kind === 'hit' ? 'A bola rebatida derrubou a própria casinha!' : `${who ? who.name : 'O lançador'} derrubou a casinha! Queimou!`;
            this.knockTarget(k, text);
            return true;
          }
          const nx = dx / (d || 1);
          const nz = dz / (d || 1);
          const dot = b.vx * nx + b.vz * nz;
          if (dot < 0) {
            b.vx = (b.vx - 2 * dot * nx) * 0.4;
            b.vz = (b.vz - 2 * dot * nz) * 0.4;
          }
        }
      }

    for (const p of this.players.values()) {
      if (p.team !== this.battingTeam) continue;
      // Bat contact.
      if (!final && p.swingT >= 0.05 && p.swingT <= 0.32 && !p.swingHit) {
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        const d = hyp(dx, dz);
        const fx = Math.sin(p.rot);
        const fz = Math.cos(p.rot);
        if (d < 1.35 && d > 0.1 && b.y < 1.5 && (dx * fx + dz * fz) / d > -0.15) {
          this.hitBall(p);
          continue;
        }
      }
      // Body contact (lancha / final hit).
      if (b.lanchaDone || speed < 2) continue;
      if (lt.kind === 'hit' && lt.by === p.id && this.time - lt.t < 0.4) continue;
      if (lt.kind === 'none') continue;
      if (hyp(b.x - p.x, b.z - p.z) < 0.34 && b.y < 1.75) {
        if (final) {
          if (lt.kind === 'final') this.finalHit(p);
          return true;
        }
        if (lt.kind !== 'hit') this.lanchaHit(p);
        else b.lanchaDone = true;
      }
    }

    // Fielders catch / pick up.
    for (const f of this.players.values()) {
      if (f.team === this.battingTeam || f.dead) continue;
      if (b.thrower === f.id && this.time - b.throwT < 0.35) continue;
      const d = hyp(b.x - f.x, b.z - f.z);
      if (d < 0.8 && b.y < 2.3) {
        const inAir = lt.kind === 'hit' && !b.bouncedSinceHit && b.y > BALL_R + 0.05;
        this.pickup(f);
        if (inAir && this.phase === 'playing') this.vitoria(f);
        return true;
      }
    }
    return false;
  }

  hitBall(p) {
    const b = this.ball;
    const q = clamp(1 - Math.abs(p.swingT - 0.17) / 0.15, 0, 1);
    const s0 = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    let dx;
    let dz;
    let speed;
    let loft;
    if (q < 0.18) {
      // Edge of the bat: the ball glances off, usually backwards.
      const iv = hyp(b.vx, b.vz) || 1;
      const a = (Math.random() - 0.5) * 1.2;
      const ix = b.vx / iv;
      const iz = b.vz / iv;
      dx = ix * Math.cos(a) - iz * Math.sin(a);
      dz = ix * Math.sin(a) + iz * Math.cos(a);
      speed = 3 + s0 * 0.4;
      loft = 0.3 + Math.random() * 0.4;
    } else {
      dx = p.input.ax - p.x;
      dz = p.input.az - p.z;
      const l = hyp(dx, dz);
      if (l < 0.3) {
        dx = Math.sin(p.rot);
        dz = Math.cos(p.rot);
      } else {
        dx /= l;
        dz /= l;
      }
      const a = (Math.random() - 0.5) * (1 - q) * 0.9;
      const ndx = dx * Math.cos(a) - dz * Math.sin(a);
      dz = dx * Math.sin(a) + dz * Math.cos(a);
      dx = ndx;
      speed = 7 + q * 13 + s0 * 0.2;
      loft = 0.1 + Math.random() * 0.55;
    }
    b.vx = dx * speed * Math.cos(loft);
    b.vz = dz * speed * Math.cos(loft);
    b.vy = speed * Math.sin(loft);
    b.y = Math.max(b.y, 0.3);
    const base = this.nearestBase(p);
    b.lastTouch = { kind: 'hit', by: p.id, team: p.team, targetBase: null, base, t: this.time };
    b.bouncedSinceHit = false;
    b.lanchaDone = false;
    b.restT = 0;
    b.retaChecked = false;
    p.swingHit = true;
    this.clearShoulders();
    this.reta = null;
    this.ev({ k: 'hit', id: p.id, q: r2(q) });
    if (dz * this.sgn(base) > 0.3) this.addParaTras();
  }

  pickup(f) {
    const b = this.ball;
    b.holder = f.id;
    b.vx = b.vy = b.vz = 0;
    b.restT = 0;
    this.ev({ k: 'catch', id: f.id });
    if (this.phase === 'final') {
      f.frozen = true;
      f.frozenUntil = 0;
    }
    if (b.lastTouch.kind !== 'hit') this.clearShoulders();
    const r = this.reta;
    if (r && r.state === 'called' && hyp(f.x - r.x, f.z - r.z) < 1.8) this.armReta(f);
  }

  // ---------------------------------------------------------------- network
  sendSnapshot() {
    const ev = this.events;
    this.events = [];
    const msg = { t: 's', ph: this.phase, tm: r2(this.time) };
    if (this.phase === 'decide') msg.dc = this.decide;
    if (this.players) {
      const b = this.ball;
      msg.P = [...this.players.values()].map((p) => [
        p.id,
        r2(p.x),
        r2(p.z),
        r2(p.rot),
        (b.holder === p.id ? 1 : 0) |
          (p.shoulder ? 2 : 0) |
          (p.licenca != null ? 4 : 0) |
          (p.crossed ? 8 : 0) |
          (p.dead ? 16 : 0) |
          (p.frozen ? 32 : 0) |
          (p.bot ? 64 : 0) |
          (p.charging && b.holder === p.id ? 128 : 0),
        r2(p.swingT),
        r2(hyp(p.vx, p.vz)),
        r2(this.time - p.throwAt),
        r2(p.stamina),
      ]);
      msg.B = [r2(b.x), r2(b.y), r2(b.z), b.holder || 0, b.outside ? 1 : 0];
      msg.bt = this.battingTeam;
      msg.sc = this.score;
      msg.tr = this.paraTras;
      msg.ln = this.lancha;
      msg.kn = this.knocked;
      msg.ro = this.phase === 'playing' ? (this.runsOpen() ? 1 : 0) : 0;
      msg.rp = this.runPending ? 1 : 0;
      if (this.reta) msg.re = { s: this.reta.state, x: r2(this.reta.x), z: r2(this.reta.z), h: this.reta.hitter };
      if (this.pause) msg.pa = { by: this.pause.by, name: this.pause.name, left: Math.max(0, Math.ceil(this.pause.until - this.time)) };
      if (this.phase === 'gameover') msg.win = { team: this.winner, text: this.winText };
    }
    if (ev.length) msg.ev = ev;
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) if (m.client && m.client.ws.readyState === 1) m.client.ws.send(data);
  }
}

export { sanitizeAvatar };
