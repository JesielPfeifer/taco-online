// Teams, championship and coin rewards, driven through the real Lobby message handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Lobby } from '../server/lobby.js';
import { Store } from '../server/store.js';
import { REWARDS } from '../shared/config.js';

function fakeClient(lobby, name) {
  const inbox = [];
  const ws = { readyState: 1, send: (d) => inbox.push(JSON.parse(d)), on() {} };
  lobby.connect(ws);
  const client = [...lobby.clients.values()].at(-1);
  client.inbox = inbox;
  lobby.handle(client, { t: 'profile', name, key: crypto.randomUUID(), avatar: {} });
  return client;
}

test('campeonato todos contra todos premia 1º, 2º e 3º', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-'));
  const lobby = new Lobby(new Store(dir));
  const players = ['Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Fabi'].map((n) => fakeClient(lobby, n));
  // Three duplas: (Ana, Beto), (Caio, Duda), (Eva, Fabi)
  for (let i = 0; i < 6; i += 2) {
    lobby.handle(players[i], { t: 'teamCreate', name: `Time ${i / 2 + 1}` });
    const team = lobby.store.teamsOf(players[i].pub)[0];
    lobby.handle(players[i + 1], { t: 'teamJoin', code: team.code });
    assert.equal(lobby.store.data.teams[team.id].members.length, 2);
  }
  lobby.handle(players[0], { t: 'create' });
  const room = players[0].room;
  clearInterval(room.timer);
  for (const p of players.slice(1)) lobby.handle(p, { t: 'join', code: room.code });
  room.rules.startMethod = 'aleatorio';
  room.rules.targetScore = 5;
  const teamIds = room.availableTeams().map((t) => t.id);
  assert.equal(teamIds.length, 3);
  lobby.handle(players[0], { t: 'champStart', teamIds });
  assert.equal(room.champ.matches.length, 3);

  const coinsBefore = players.map((p) => lobby.store.player(p.key).coins);
  let guard = 0;
  while (room.champ && guard++ < 60 * 60 * 90) {
    if (room.players) for (const p of room.players.values()) p.bot = true; // let the AI play for everyone
    room.tick();
    if (room.phase === 'gameover') {
      if (room.champ.done) break;
      lobby.handle(players[0], { t: 'champNext' });
    }
  }
  assert.ok(room.champ?.done, 'campeonato terminou');
  const table = room.standings();
  assert.equal(table.reduce((s, r) => s + r.w, 0), 3);
  const champion = room.champ.teams[table[0].k];
  const team = lobby.store.data.teams[champion.id];
  assert.equal(team.titles, 1);
  // Each champion earned at least the 1st-place prize on top of match rewards.
  for (const m of champion.members) {
    const idx = players.findIndex((p) => p.pub === m.pub);
    assert.ok(lobby.store.player(players[idx].key).coins - coinsBefore[idx] >= REWARDS.champ[0]);
  }
  assert.equal(lobby.store.data.championships.length, 1);
  lobby.store.flush();
  assert.ok(fs.existsSync(path.join(dir, 'taco.json')));
});

test('loja: compra, saldo e item premium só com posse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-'));
  const lobby = new Lobby(new Store(dir));
  const c = fakeClient(lobby, 'Ana');
  const acc = lobby.store.player(c.key);
  assert.equal(acc.coins, 100);
  lobby.handle(c, { t: 'buy', item: 'power:mira' }); // 400: too expensive
  assert.ok(!acc.owned.includes('power:mira'));
  lobby.handle(c, { t: 'buy', item: 'power:danca' }); // 100
  assert.ok(acc.owned.includes('power:danca'));
  assert.equal(acc.coins, 0);
  assert.deepEqual(lobby.powers(c), ['danca']);
  // Premium hat (Coroa = 10) is refused until bought.
  lobby.handle(c, { t: 'profile', name: 'Ana', avatar: { hat: 10 } });
  assert.notEqual(c.avatar.hat, 10);
});

test('F5: o mesmo jogador volta para o seu lugar em campo, não como espectador', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-'));
  const lobby = new Lobby(new Store(dir));
  const ana = fakeClient(lobby, 'Ana');
  const key = ana.key;
  lobby.handle(ana, { t: 'create' });
  const room = ana.room;
  clearInterval(room.timer);
  room.rules.startMethod = 'aleatorio';
  lobby.handle(ana, { t: 'start' });
  const seatId = ana.id;
  assert.ok(room.players.has(seatId));
  // Reload: socket closes, a new one connects with the same key and joins the room.
  room.leave(ana.id, true);
  for (let i = 0; i < 60 * 15; i++) room.tick(); // long enough for a bot to take over
  assert.equal(room.players.get(seatId).bot, true);
  const inbox = [];
  lobby.connect({ readyState: 1, send: (d) => inbox.push(JSON.parse(d)), on() {} });
  const again = [...lobby.clients.values()].at(-1);
  lobby.handle(again, { t: 'profile', name: 'Ana', key, avatar: {} });
  lobby.handle(again, { t: 'join', code: room.code });
  assert.equal(again.id, seatId, 'assumiu o mesmo id/lugar');
  assert.equal(room.players.get(seatId).bot, false);
  assert.ok(inbox.some((m) => m.t === 'welcome' && m.id === seatId));
  assert.ok(room.seats.flat().includes(seatId));
});
