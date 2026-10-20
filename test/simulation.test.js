// Headless bot-vs-bot matches: every start method and rule variant must reach a winner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';

function playMatch(rules, maxMinutes = 25) {
  const host = { id: 'h1', name: 'Host', avatar: {}, ws: { readyState: 1, send() {} }, send() {} };
  const room = new Room('TEST', { removeRoom() {} });
  clearInterval(room.timer);
  room.join(host);
  room.seats = [
    [null, null],
    [null, null],
  ];
  Object.assign(room.rules, rules);
  room.startGame();
  const kinds = new Set();
  room.sendSnapshot = function () {
    for (const e of this.events) kinds.add(e.k);
    this.events = [];
  };
  for (let i = 0; i < 60 * 60 * maxMinutes && room.phase !== 'gameover'; i++) room.tick();
  return { room, kinds };
}

for (const startMethod of ['molhado', 'parimpar', 'palmo', 'aleatorio']) {
  test(`partida completa começando por ${startMethod}`, () => {
    const { room, kinds } = playMatch({ startMethod });
    assert.equal(room.phase, 'gameover');
    assert.ok([0, 1].includes(room.winner));
    assert.ok(kinds.has('clank'), 'houve cruzada de tacos');
    assert.ok(kinds.has('point'), 'houve ponto');
  });
}

test('variantes regionais também terminam', () => {
  const { room } = playMatch({
    startMethod: 'aleatorio',
    targetScore: 12,
    pointsPerRun: 2,
    catchRule: 'taco2',
    lanchaRule: 'penalti',
    finalMode: 'paulista',
    tempoPenalty: true,
    patioBonus: 'duas',
  });
  assert.equal(room.phase, 'gameover');
});

test('base protegida não é queimada na mão; desprotegida é', () => {
  const { room } = playMatch({ startMethod: 'aleatorio' }, 0);
  room.phase = 'playing';
  const [fielder] = room.fielders();
  const [b0, b1] = room.batters();
  room.ball.holder = fielder.id;
  fielder.x = 0.3;
  fielder.z = room.zb(0) - 0.8;
  room.touchTarget(fielder);
  assert.equal(room.knocked[0], false, 'taco no chão protege');
  b0.x = 3; // batter left the base without "licença"
  b1.x = 3;
  room.touchTarget(fielder);
  assert.equal(room.knocked[0], true);
  assert.equal(room.phase, 'swap');
});

test('três pra trás perde o taco e ponto desconta os pra trás', () => {
  const { room } = playMatch({ startMethod: 'aleatorio' }, 0);
  room.phase = 'playing';
  room.addParaTras();
  room.addParaTras();
  assert.equal(room.paraTras, 2);
  const [a, b] = room.batters();
  room.runPending = true;
  a.crossed = b.crossed = false;
  room.checkRuns();
  assert.equal(room.paraTras, 0);
  room.addParaTras();
  room.addParaTras();
  room.addParaTras();
  assert.ok(room.pendingLose);
});

test('bola no corpo durante o giro é lancha, não rebatida; no taco é rebatida', () => {
  const { room } = playMatch({ startMethod: 'aleatorio', lanchaRule: 'tres' }, 0);
  room.phase = 'playing';
  const batter = room.batters()[1]; // at base 1, facing base 0 (rot = PI)
  const pitch = (x, z) => {
    const b = room.ball;
    Object.assign(b, { holder: null, x, y: 0.9, z, vx: 0, vy: 0, vz: -15, restT: 0, lanchaDone: false });
    b.lastTouch = { kind: 'pitch', by: room.fielders()[0].id, team: 1 - room.battingTeam, targetBase: 1, t: room.time };
  };
  // Ball straight into the body while the bat is still on the batter's right side.
  batter.swingT = 0.06;
  batter.swingHit = false;
  pitch(batter.x, batter.z - 0.2);
  room.stepBall(1 / 240);
  assert.equal(room.lancha, 1, 'contou lancha');
  assert.notEqual(room.ball.lastTouch.kind, 'hit');
  // Ball in front of the batter exactly where the bat passes (sweet spot): a real hit.
  room.lancha = 0;
  batter.swingT = 0.185;
  batter.swingHit = false;
  batter.rot = Math.PI;
  pitch(batter.x, batter.z - 0.9);
  room.stepBall(1 / 240);
  assert.equal(room.ball.lastTouch.kind, 'hit');
  assert.equal(room.lancha, 0);
});

test('rendição: sem parceiro humano encerra na hora e o outro time vence', () => {
  const { room } = playMatch({ startMethod: 'aleatorio' }, 0);
  room.phase = 'playing';
  const p = room.batters()[0];
  room.requestSurrender(p.id);
  assert.equal(room.phase, 'gameover');
  assert.equal(room.winner, 1 - p.team);
});
