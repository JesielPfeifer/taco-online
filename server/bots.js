// Simple AI for empty seats. Bots drive the same input/action API that humans use.

const G = 9.8;
const hyp = (x, z) => Math.sqrt(x * x + z * z);

function moveTo(p, x, z, sprint = false, stopAt = 0.25) {
  const dx = x - p.x;
  const dz = z - p.z;
  const d = hyp(dx, dz);
  if (d < stopAt) {
    p.input.mx = 0;
    p.input.mz = 0;
    p.input.sp = false;
    return true;
  }
  const slow = Math.min(1, d / 1.2);
  p.input.mx = (dx / d) * slow;
  p.input.mz = (dz / d) * slow;
  p.input.sp = sprint;
  return false;
}

function aimAt(p, x, z) {
  p.input.ax = x;
  p.input.az = z;
}

function landing(ball) {
  if (ball.y > 0.25) {
    const t = (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * G * Math.max(0, ball.y - 0.9))) / G;
    return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t, t };
  }
  return { x: ball.x + ball.vx * 0.5, z: ball.z + ball.vz * 0.5, t: 0.5 };
}

function behindPoint(room, k) {
  return { x: -0.5, z: room.zb(k) + room.sgn(k) * 2.2 };
}

export function botThink(room, p, dt) {
  if (!p.ai.init) {
    p.ai.init = true;
    p.ai.react = 0.13 + Math.random() * 0.1;
    p.ai.err = 0.4 + Math.random() * 0.8;
    p.ai.aimX = 0;
  }
  if (p.team === room.battingTeam) batter(room, p, dt);
  else fielder(room, p, dt);
  // Show the wind-up (cocking pose) for a moment before a planned throw.
  const ai = p.ai;
  p.charging = room.ball.holder === p.id && ai.throwAt != null && room.time > ai.throwAt - 0.45;
}

function fielder(room, p) {
  const b = room.ball;
  const ai = p.ai;
  const t = room.time;
  const holding = b.holder === p.id;

  if (room.phase === 'final') {
    if (holding) {
      const target = room.batters().sort((a, c) => hyp(a.x - p.x, a.z - p.z) - hyp(c.x - p.x, c.z - p.z))[0];
      aimAt(p, target.x, target.z);
      ai.throwAt ??= t + 0.9;
      if (t >= ai.throwAt) {
        ai.throwAt = null;
        room.act(p, 'throw', { power: 0.45 + Math.random() * 0.2 });
      }
    } else if (!b.holder && closestFielder(room) === p) moveTo(p, b.x, b.z, true, 0.1);
    else moveTo(p, p.x, p.z);
    return;
  }

  if (holding) {
    if (room.reta && room.reta.state === 'avail' && !ai.retaTried) {
      ai.retaTried = true;
      if (Math.random() < 0.75) room.act(p, 'reta', {});
    }
    const forced = p.retaThrow ?? p.penaltyThrow;
    if (forced != null) {
      aimAt(p, (Math.random() - 0.5) * 0.3, room.zb(forced));
      ai.throwAt ??= t + 0.8 + Math.random() * 0.6;
      if (t >= ai.throwAt) {
        ai.throwAt = null;
        room.act(p, 'throw', { power: 0.45 + Math.random() * 0.2 });
      }
      return;
    }
    // An unprotected casinha is an easy burn.
    for (const k of [0, 1]) {
      if (room.knocked[k] || room.isProtected(k)) continue;
      const d = hyp(p.x, p.z - room.zb(k));
      if (d < 1.15) {
        room.act(p, 'touch', {});
        return;
      }
      if (d < 7) {
        moveTo(p, 0, room.zb(k), true, 0.5);
        aimAt(p, 0, room.zb(k));
        if (d > 3 && d < 7 && Math.random() < 0.03) room.act(p, 'throw', { power: 0.3 + d / 25 });
        return;
      }
    }
    const k = hyp(p.x - behindPoint(room, 0).x, p.z - behindPoint(room, 0).z) <
      hyp(p.x - behindPoint(room, 1).x, p.z - behindPoint(room, 1).z)
      ? 0
      : 1;
    const bp = behindPoint(room, k);
    const tz = room.zb(1 - k);
    if (!moveTo(p, bp.x, bp.z, true, 0.4)) {
      aimAt(p, 0, tz);
      ai.throwAt = null;
      return;
    }
    if (ai.throwAt == null) {
      ai.throwAt = t + 0.8 + Math.random() * 1.6;
      ai.aimNoise = (Math.random() - 0.5) * ai.err;
    }
    aimAt(p, ai.aimNoise, tz);
    if (t >= ai.throwAt) {
      ai.throwAt = null;
      room.act(p, 'throw', { power: 0.5 + Math.random() * 0.35 });
    }
    return;
  }
  ai.throwAt = null;
  ai.retaTried = false;

  // A pitch still travelling towards a base belongs to the batter: wait behind it.
  const pitchInFlight =
    !b.holder && ['pitch', 'throw', 'reta'].includes(b.lastTouch.kind) && hyp(b.vx, b.vz) > 3 && room.time - b.throwT < 2;
  if (!b.holder && !pitchInFlight) {
    const chaser = closestFielder(room);
    if (chaser === p) {
      const l = landing(b);
      const err = b.lastTouch.kind === 'hit' ? ai.err * 0.6 : 0;
      moveTo(p, l.x + err * 0.3, l.z, true, 0.05);
      aimAt(p, b.x, b.z);
      if (b.outside) {
        ai.outT ??= t;
        if (t - ai.outT > 3 && hyp(b.x - p.x, b.z - p.z) > 5) room.act(p, 'patio', {});
      } else ai.outT = null;
      if (room.reta && room.reta.state === 'avail' && !ai.retaCall && hyp(b.x - p.x, b.z - p.z) < 4) {
        ai.retaCall = true;
        if (Math.random() < 0.6) room.act(p, 'reta', {});
      }
      return;
    }
  }
  ai.retaCall = false;
  ai.outT = null;
  const bp = behindPoint(room, p.post);
  moveTo(p, bp.x, bp.z, false, 0.3);
  aimAt(p, b.x, b.z);
}

function closestFielder(room) {
  const b = room.ball;
  const l = landing(b);
  let best = null;
  let bd = Infinity;
  for (const f of room.fielders()) {
    if (f.dead) continue;
    const d = hyp(f.x - l.x, f.z - l.z);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function batter(room, p) {
  const b = room.ball;
  const ai = p.ai;
  const lt = b.lastTouch;
  const [a1, a2] = room.batters();
  const partner = a1 === p ? a2 : a1;
  const half = room.rules.baseDistance / 2;

  if (room.phase === 'final') {
    moveTo(p, p.x, p.z);
    return;
  }
  if (room.reta && room.reta.state === 'avail' && room.reta.hitter === p.id && !ai.nadaTried) {
    ai.nadaTried = true;
    if (Math.random() < 0.7) room.act(p, 'nada', {});
  }
  if (!room.reta) ai.nadaTried = false;

  const home = p.homeBase;
  const fwd = -room.sgn(home);
  if (lt.kind !== 'hit' || b.holder) ai.aimX = ai.aimX || (Math.random() - 0.5) * 18;
  aimAt(p, ai.aimX, room.zb(home) + fwd * 18);

  // Swing at incoming balls.
  if (!b.holder && ['pitch', 'throw', 'reta'].includes(lt.kind) && !p.shoulder && p.swingCd <= 0 && !p.crossed) {
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const d = hyp(dx, dz);
    const sp = hyp(b.vx, b.vz);
    const toward = (b.vx * dx + b.vz * dz) / (d * sp + 1e-6);
    if (toward > 0.6 && d < 7 && sp > 2 && ai.lastThrow !== b.throwT) {
      const tArr = (d - 0.75) / sp;
      if (tArr < ai.react) {
        ai.lastThrow = b.throwT;
        // Bots are not perfect: sometimes they freeze, sometimes they mistime.
        if (Math.random() < 0.3) return;
        room.act(p, 'swing', {});
        ai.aimX = (Math.random() - 0.5) * 18;
        ai.react = 0.08 + Math.random() * 0.22;
      }
    }
  }

  const homeX = 0.55;
  if (p.crossed) {
    moveTo(p, homeX, room.zb(1 - home), true, 0.15);
    return;
  }
  if (room.runPending) {
    moveTo(p, homeX, room.zb(home), true, 0.15);
    return;
  }
  const partnerRunning = partner && !partner.bot && Math.abs(partner.z) < half - 1.3;
  let wantRun = false;
  if (room.runsOpen() && !b.holder && lt.kind === 'hit' && !p.shoulder) {
    let fieldTime = Infinity;
    for (const f of room.fielders()) {
      const toBall = hyp(f.x - b.x, f.z - b.z) / 6.5;
      const back = Math.min(hyp(b.x, b.z - room.zb(0)), hyp(b.x, b.z - room.zb(1))) / 14;
      fieldTime = Math.min(fieldTime, toBall + back + 0.5);
    }
    const runTime = (hyp(p.x, p.z) + half) / 6.8;
    wantRun = fieldTime > runTime + 0.6;
  }
  if (b.holder) {
    const h = room.players.get(b.holder);
    if (h && h.team !== room.battingTeam && hyp(h.x - p.x, h.z - p.z) > 6 && !room.isBehind(h, 0) && !room.isBehind(h, 1)) {
      // keep running only if already in the middle
      wantRun = Math.abs(p.z) < 2 && Math.abs(partner.z) < 2;
    }
  }
  if (wantRun || (partnerRunning && room.runsOpen())) moveTo(p, p.slot ? 0.45 : -0.45, 0, true, 0.2);
  else moveTo(p, homeX, room.zb(home), true, 0.15);
}

export function botDecide(room, d) {
  const isBot = (id) => room.members.get(id)?.bot;
  const t = room.time;
  d.botAt ??= t + 1.2;
  if (t < d.botAt) return;
  d.botAt = t + 0.9;
  if (d.method === 'molhado' && d.stage === 'choose' && isBot(d.captains[0])) {
    room.molhadoChoose(Math.random() < 0.5 ? 'molhado' : 'seco');
  } else if (d.method === 'parimpar' && d.stage === 'choose') {
    if (isBot(d.captains[0]) && d.numA == null) {
      d.parity = Math.random() < 0.5 ? 'par' : 'impar';
      d.numA = Math.floor(Math.random() * 6);
    }
    if (isBot(d.captains[1]) && d.numB == null) d.numB = Math.floor(Math.random() * 6);
    room.parImparCheck();
  } else if (d.method === 'palmo') {
    if (d.stage === 'hands' && isBot(d.captains[d.turn])) room.palmoHand();
    else if (d.stage === 'balance' && isBot(d.captains[d.holder])) {
      d.balanceStart ??= t;
      if (t - d.balanceStart > 10) room.palmoDone(Math.random() < 0.65);
    }
  }
}
