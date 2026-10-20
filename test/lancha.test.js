// Collision scenarios for "lancha" (ball on the batter's body) and the penalty variant.
// One asserted case per row: who is touched, by which kind of ball, under which rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';

const STEP = 1 / 240;

function setup(rules = {}) {
  const host = { id: 'h1', name: 'Host', avatar: {}, ws: { readyState: 1, send() {} }, send() {} };
  const room = new Room('LNCH', { removeRoom() {} });
  clearInterval(room.timer);
  room.join(host);
  room.seats = [
    [null, null],
    [null, null],
  ];
  Object.assign(room.rules, { startMethod: 'aleatorio', lanchaRule: 'tres', ...rules });
  room.startGame();
  room.beginInnings(0);
  room.phase = 'playing';
  room.events = [];
  const [b0, b1] = room.batters(); // b0 defends base 0 (z<0), b1 defends base 1 (z>0)
  const [f0, f1] = room.fielders(); // f0 behind base 0, f1 behind base 1
  return { room, b0, b1, f0, f1 };
}

// Put the ball just in front of `target` (a player), moving into them.
function ballInto(room, target, kind, { by, targetBase = null, speed = 15, y = 0.9 } = {}) {
  const b = room.ball;
  const dir = target.z > 0 ? 1 : -1; // travel along +z towards base 1, -z towards base 0
  Object.assign(b, { holder: null, x: target.x, y, z: target.z - dir * 0.3, vx: 0, vy: 0, vz: dir * speed, restT: 0, lanchaDone: false, dead: false });
  b.lastTouch = { kind, by: by?.id ?? null, team: by?.team ?? null, targetBase, t: room.time };
  b.thrower = by?.id ?? null;
  b.throwT = room.time - 1;
}

function step(room, n = 4) {
  for (let i = 0; i < n; i++) room.stepBall(STEP);
}

const CASES = [
  {
    name: 'lançamento acerta o corpo do rebatedor que defende a casinha → uma na lancha',
    run({ room, b1, f0 }) {
      ballInto(room, b1, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      assert.equal(room.lancha, 1);
    },
  },
  {
    name: 'lançamento passa raspando no rebatedor do lado do lançador → não é lancha',
    run({ room, b0, f0 }) {
      ballInto(room, b0, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      assert.equal(room.lancha, 0);
      assert.ok(room.ball.lanchaDone, 'bola só desviou');
    },
  },
  {
    name: 'bola devolvida por um lançador (não é lançamento) acerta rebatedor correndo → não é lancha',
    run({ room, b1, f1 }) {
      b1.z = 0;
      ballInto(room, b1, 'throw', { by: f1 });
      step(room);
      assert.equal(room.lancha, 0);
    },
  },
  {
    name: 'bola rebatida acerta o parceiro → não é lancha',
    run({ room, b0, b1 }) {
      ballInto(room, b1, 'hit', { by: b0 });
      step(room);
      assert.equal(room.lancha, 0);
    },
  },
  {
    name: 'lançamento quase parado (< 2 m/s) encosta no pé → não é lancha',
    run({ room, b1, f0 }) {
      ballInto(room, b1, 'pitch', { by: f0, targetBase: 1, speed: 1.2, y: 0.07 });
      step(room);
      assert.equal(room.lancha, 0);
    },
  },
  {
    name: 'o mesmo lançamento encostando duas vezes conta uma lancha só',
    run({ room, b1, f0 }) {
      ballInto(room, b1, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      room.ball.x = b1.x;
      room.ball.z = b1.z;
      room.ball.vz = 10;
      step(room);
      assert.equal(room.lancha, 1);
    },
  },
  {
    name: 'três na lancha → perde o taco e a bola fica morta (não derruba casinha nem é pega)',
    run({ room, b1, f0 }) {
      room.lancha = 2;
      ballInto(room, b1, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      assert.ok(room.pendingLose);
      assert.ok(room.ball.dead);
      room.ball.x = 0;
      room.ball.z = room.zb(1);
      room.ball.vz = 5;
      step(room);
      assert.equal(room.knocked[1], false, 'bola morta não derruba a casinha');
    },
  },
  {
    name: 'regra PR: três na lancha tira 4 pontos e zera a contagem',
    rules: { lanchaRule: 'menos4' },
    run({ room, b1, f0 }) {
      room.score[room.battingTeam] = 7;
      room.lancha = 2;
      ballInto(room, b1, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      assert.equal(room.score[room.battingTeam], 3);
      assert.equal(room.lancha, 0);
      assert.equal(room.pendingLose, null);
    },
  },
  {
    name: 'regra "encostou, perdeu": vale também para o rebatedor do lado do lançador',
    rules: { lanchaRule: 'imediato' },
    run({ room, b0, f0 }) {
      ballInto(room, b0, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      assert.ok(room.pendingLose);
    },
  },
  {
    name: 'pênalti: lancha marca o pênalti, a bola fica morta e ninguém corre',
    rules: { lanchaRule: 'penalti' },
    run({ room, b1, f0 }) {
      ballInto(room, b1, 'pitch', { by: f0, targetBase: 1 });
      step(room);
      assert.ok(room.pendingPenalty);
      assert.ok(room.ball.dead);
      assert.equal(room.runsOpen(), false);
      assert.equal(room.lancha, 0, 'no pênalti não se conta lancha');
    },
  },
  {
    name: 'pênalti armado: lançador a 4 m da casinha, parado, com a bola; corrida fechada até o lançamento',
    rules: { lanchaRule: 'penalti' },
    run({ room, f1 }) {
      room.setupPenalty(1);
      const kicker = room.players.get(room.ball.holder);
      assert.ok(kicker && kicker.team !== room.battingTeam);
      assert.ok(Math.abs(kicker.z - (room.zb(1) - 4)) < 1e-6);
      assert.ok(kicker.frozen);
      assert.equal(room.runsOpen(), false);
      kicker.input.ax = 0;
      kicker.input.az = room.zb(1);
      room.throwBall(kicker, 0.5);
      assert.equal(room.ball.lastTouch.kind, 'pitch');
      assert.equal(room.ball.lastTouch.targetBase, 1);
      assert.ok(room.penalty.thrown);
      void f1;
    },
  },
  {
    name: 'pênalti que acerta o corpo não gera outro pênalti: bola em jogo',
    rules: { lanchaRule: 'penalti' },
    run({ room, b1 }) {
      room.setupPenalty(1);
      const kicker = room.players.get(room.ball.holder);
      kicker.input.ax = b1.x;
      kicker.input.az = b1.z;
      room.throwBall(kicker, 0.5);
      ballInto(room, b1, 'pitch', { by: kicker, targetBase: 1 });
      step(room);
      assert.equal(room.pendingPenalty, null);
      assert.equal(room.penalty, null);
      assert.ok(!room.ball.dead);
    },
  },
  {
    name: 'pênalti que derruba a casinha → troca (lançamento legal)',
    rules: { lanchaRule: 'penalti' },
    run({ room }) {
      room.setupPenalty(1);
      const kicker = room.players.get(room.ball.holder);
      const b = room.ball;
      kicker.input.ax = 0;
      kicker.input.az = room.zb(1);
      room.throwBall(kicker, 0.5);
      Object.assign(b, { x: 0, y: 0.4, z: room.zb(1) - 0.3, vx: 0, vy: 0, vz: 12 });
      for (const p of room.batters()) p.x = 3; // nobody in the way
      step(room, 8);
      assert.equal(room.knocked[1], true);
      assert.equal(room.phase, 'swap');
    },
  },
  {
    name: 'final paulista: o arremesso final que acerta um rebatedor tira metade da meta',
    rules: { finalMode: 'paulista', targetScore: 10 },
    run({ room, b1, f0 }) {
      room.score[room.battingTeam] = 10;
      room.enterFinal();
      ballInto(room, b1, 'final', { by: f0 });
      step(room);
      assert.equal(room.score[room.battingTeam], 5);
    },
  },
];

for (const c of CASES) test(c.name, () => c.run(setup(c.rules)));
