// Procedural low-poly "boneco" in the style of modular low-poly character kits
// (separate body parts + attachable accessories), built only from Three.js primitives.
import * as THREE from 'three';
import { AVATAR_PARTS } from '/shared/config.js';
import { drawShirt, drawPants, drawBat, drawBallSkin, GLOWING_BALLS } from './skins.js';

const P = AVATAR_PARTS;
const GOLD = '#e6b422';
const SILVER = '#d7dbe0';

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0, ...extra });
}
function metal(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.25, metalness: 0.9 });
}
function texMat(cnv) {
  const t = new THREE.CanvasTexture(cnv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, flatShading: true, roughness: 0.85 });
}
function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

const BUILD = [
  { h: 0.88, w: 1 },
  { h: 1, w: 1 },
  { h: 1.1, w: 1 },
  { h: 1.06, w: 0.82 },
  { h: 1.02, w: 1.22 },
  { h: 0.96, w: 1.32, belly: true },
];

export function buildAvatar(cfg) {
  const skinCol = P.skin.options[cfg.skin];
  const hairCol = P.hairColor.options[cfg.hairColor];
  const hatCol = P.hatColor.options[cfg.hatColor];
  const shirtCol = P.shirtColor.options[cfg.shirtColor];
  const pantsCol = P.pantsColor.options[cfg.pantsColor];
  const build = BUILD[cfg.height] || BUILD[1];

  const skin = mat(skinCol);
  const hair = mat(hairCol);
  const shirt = texMat(drawShirt(cfg.shirt, shirtCol));
  const pants = texMat(drawPants(cfg.pants, pantsCol));

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.set(build.w, build.h, build.w);
  root.add(body);

  // ---- legs
  const longPants = [1, 3, 5].includes(cfg.pants);
  const shortShort = cfg.pants === 2;
  function leg(side) {
    const g = new THREE.Group();
    g.position.set(0.11 * side, 0.84, 0);
    g.add(mesh(capsule(0.085, shortShort ? 0.12 : 0.3), pants, 0, shortShort ? -0.1 : -0.2, 0));
    if (shortShort) g.add(mesh(capsule(0.07, 0.25), skin, 0, -0.3, 0));
    g.add(mesh(capsule(0.072, 0.32), longPants ? pants : skin, 0, -0.55, 0));
    g.add(shoe(cfg.shoes, skin, hatCol));
    body.add(g);
    return g;
  }
  const legL = leg(1);
  const legR = leg(-1);

  // ---- upper body: one pivot at the hips so the trunk can twist and lean
  const upper = new THREE.Group();
  upper.position.y = 0.84;
  body.add(upper);
  const torso = mesh(capsule(0.2, 0.32), shirt, 0, 0.29, 0);
  torso.scale.set(1, 1, 0.68);
  upper.add(torso);
  if (build.belly) upper.add(mesh(sphere(0.2), shirt, 0, 0.18, 0.08));
  if (cfg.shirt === 5) upper.add(mesh(box(0.22, 0.05, 0.16), shirt, 0, 0.56, 0.04)); // polo collar
  if (cfg.shirt === 7) {
    const hood = mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 10), shirt, 0, 0.59, -0.06);
    hood.rotation.x = Math.PI / 2.4;
    upper.add(hood);
  }
  upper.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin, 0, 0.61, 0));
  const neckwear = necklace(cfg.necklace);
  if (neckwear) {
    neckwear.position.y -= 0.84;
    upper.add(neckwear);
  }

  // ---- arms: shoulder pivot -> upper arm -> elbow pivot -> forearm -> hand
  const sleeveMat = cfg.shirt === 2 ? skin : shirt;
  function arm(side) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.position.set(0.27 * side, 0.53, 0);
    g.add(mesh(capsule(0.062, 0.17), sleeveMat, 0, -0.12, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    g.add(elbow);
    elbow.add(mesh(capsule(0.055, 0.2), cfg.shirt === 7 ? shirt : skin, 0, -0.12, 0));
    const hand = new THREE.Group();
    hand.position.set(0, -0.3, 0);
    hand.add(mesh(sphere(0.06, 8, 6), skin));
    elbow.add(hand);
    upper.add(g);
    return { g, elbow, hand };
  }
  const armL = arm(1);
  const armR = arm(-1);
  const w = watch(cfg.watch);
  if (w) {
    w.position.set(0, -0.21, 0);
    armL.elbow.add(w);
  }

  // ---- head
  const head = new THREE.Group();
  head.position.set(0, 0.84, 0);
  upper.add(head);
  const skull = mesh(new THREE.IcosahedronGeometry(0.19, 1), skin);
  skull.scale.set(1, 1.08, 1);
  head.add(skull);
  head.add(mesh(sphere(0.045, 6, 5), skin, 0.19, 0, 0));
  head.add(mesh(sphere(0.045, 6, 5), skin, -0.19, 0, 0));
  const eyeWhite = mat('#ffffff');
  const pupil = mat(P.eyeColor.options[cfg.eyeColor]);
  for (const s of [1, -1]) {
    head.add(mesh(sphere(0.035, 8, 6), eyeWhite, 0.07 * s, 0.03, 0.155));
    head.add(mesh(sphere(0.02, 6, 5), pupil, 0.07 * s, 0.03, 0.185));
    const brow = mesh(box(0.07, 0.015, 0.02), hair, 0.07 * s, 0.09, 0.175);
    head.add(brow);
  }
  const nose = mesh(new THREE.ConeGeometry(0.03, 0.07, 5), skin, 0, -0.01, 0.2);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
  head.add(mesh(box(0.08, 0.018, 0.02), mat('#7a2e2e'), 0, -0.085, 0.175));
  addHair(head, cfg.hairStyle, hair);
  addFacialHair(head, cfg.facialHair, hair);
  addHat(head, cfg.hat, hatCol, cfg.hairStyle);
  addGlasses(head, cfg.glasses);
  addEarrings(head, cfg.earrings);

  // ---- bat & ball in the right hand
  const bat = new THREE.Group();
  const batMat = texMat(drawBat(cfg.bat));
  bat.add(mesh(box(0.1, 0.56, 0.035), batMat, 0, -0.42, 0));
  bat.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 6), batMat, 0, -0.07, 0));
  armR.hand.add(bat);
  const handBall = mesh(sphere(0.07), mat('#d4f03c'), 0, -0.04, 0.05);
  armR.hand.add(handBall);

  const anim = { phase: Math.random() * 6, chargeT: 0, charging: false };

  function applyPose(p) {
    upper.rotation.set(p.lean || 0, p.twist || 0, 0);
    armR.g.rotation.set(p.rx || 0, p.ry || 0, p.rz ?? -0.08);
    armR.elbow.rotation.x = p.re || 0;
    armL.g.rotation.set(p.lx || 0, p.ly || 0, p.lz ?? 0.08);
    armL.elbow.rotation.x = p.le || 0;
    legL.rotation.x = p.gl || 0;
    legR.rotation.x = p.gr || 0;
    bat.rotation.set(p.bat || 0, 0, 0);
    body.position.y = p.bob || 0;
    body.rotation.x = p.tilt || 0;
  }

  function update(st, dt) {
    const sp = Math.min(1, (st.speed || 0) / 5.5);
    anim.phase += dt * (4 + (st.speed || 0) * 1.6);
    const s = Math.sin(anim.phase) * 0.7 * sp;
    bat.visible = !!st.batting;
    handBall.visible = !!st.holding;
    if (st.charging && !anim.charging) anim.chargeT = 0;
    anim.charging = !!st.charging;
    if (anim.charging) anim.chargeT += dt;

    // Base locomotion: legs swing, arms counter-swing, elbows soft while running.
    const walk = { gl: s, gr: -s, lx: -s * 0.8, rx: s * 0.8, le: -0.35 * sp, re: -0.35 * sp, bob: Math.abs(Math.sin(anim.phase)) * 0.05 * sp };
    let pose = walk;

    if (st.dancing) {
      // Dancinha: hips sway, arms pump, a little hop and spin.
      const d = anim.phase * 1.6;
      pose = {
        twist: Math.sin(d) * 0.6,
        lean: Math.sin(d * 2) * 0.08,
        rx: -2.2 + Math.sin(d * 2) * 0.6,
        rz: -0.5,
        re: -1.2,
        lx: -2.2 - Math.sin(d * 2) * 0.6,
        lz: 0.5,
        le: -1.2,
        gl: Math.max(0, Math.sin(d * 2)) * -0.6,
        gr: Math.max(0, -Math.sin(d * 2)) * -0.6,
        bob: Math.abs(Math.sin(d * 2)) * 0.12,
      };
      body.rotation.y = Math.sin(d * 0.5) * 0.6;
      applyPose(pose);
      return;
    }
    body.rotation.y = 0;
    if (st.celebrate) {
      const w2 = Math.sin(anim.phase * 2) * 0.2;
      pose = { lx: -2.9 + w2, lz: 0.3, rx: -2.9 - w2, rz: -0.3, bob: Math.abs(Math.sin(anim.phase * 1.5)) * 0.25 };
    } else if (st.dead) {
      pose = { bob: -0.25, tilt: 0.25, rx: 0.2, rz: -0.3, lx: 0.2, lz: 0.3 };
    } else if (st.batting) {
      if (st.swingT >= 0) pose = sampleTrack(SWING, st.swingT);
      else if (st.shoulder) pose = { ...walk, rx: -2.6, rz: -0.25, re: -0.9, bat: 2.3 };
      else if (sp > 0.25) pose = { ...walk, rx: -0.9 + s * 0.3, re: -0.4, bat: -0.3 };
      else pose = { rx: -0.12, rz: -0.06, bat: 0.05, lx: 0.05 }; // taco no chão
    } else if (st.throwAge != null && st.throwAge < THROW_END) {
      pose = sampleTrack(THROW, st.throwAge);
    } else if (st.holding && anim.charging) {
      pose = sampleTrack(CHARGE, anim.chargeT);
    } else if (st.holding) {
      pose = { ...walk, rx: -0.6 + s * 0.3, re: -0.6 };
    }
    // Keep the legs running under an upper-body action.
    if (pose !== walk && sp > 0.3 && !st.celebrate && !st.dead) {
      pose = { ...pose, gl: s, gr: -s, bob: walk.bob };
    }
    applyPose(pose);
  }

  function setBallSkin(skinName) {
    const t = new THREE.CanvasTexture(drawBallSkin(skinName));
    t.colorSpace = THREE.SRGBColorSpace;
    handBall.material = new THREE.MeshStandardMaterial({
      map: t,
      roughness: 0.6,
      emissive: GLOWING_BALLS.has(skinName) ? '#ffffff' : '#000000',
      emissiveMap: GLOWING_BALLS.has(skinName) ? t : null,
      emissiveIntensity: 0.6,
    });
  }

  return { root, body, head, update, setBallSkin };
}

// ------------------------------------------------------------------ key poses
// Overhand throw split into the classic phases: wind-up (lead knee up), stride + arm
// cocking (ball behind the head, trunk turned away), acceleration, release (ball near ear
// level, trunk turned to the target) and deceleration / follow-through (arm across the body).
// Keys: twist/lean = trunk, r*/l* = right/left shoulder (x,y,z) and elbow (e), gl/gr = hips.
const POSE_HOLD = { rx: -0.6, re: -0.6, lx: -0.15 };
const CHARGE = [
  [0, POSE_HOLD],
  [0.18, { twist: -0.35, rx: -0.3, re: -0.3, lx: -1.2, le: -0.5, gl: -1.0, gr: 0.05 }], // wind-up: knee lift
  [0.4, { twist: -0.8, lean: -0.05, rx: -3.5, rz: -0.45, re: -1.7, lx: -1.5, lz: 0.25, le: -0.2, gl: -0.4, gr: 0.25 }], // cocked
];
const THROW = [
  [0, { twist: -0.6, rx: -3.4, rz: -0.45, re: -1.5, lx: -1.4, lz: 0.3, le: -0.3, gl: -0.45, gr: 0.3 }],
  [0.06, { twist: 0.1, lean: 0.12, rx: -2.6, rz: -0.3, re: -0.7, lx: -0.9, lz: 0.5, le: -1.0, gl: -0.5, gr: 0.4 }], // acceleration
  [0.12, { twist: 0.5, lean: 0.28, rx: -1.7, rz: -0.1, re: -0.1, lx: -0.4, lz: 0.6, le: -1.4, gl: -0.5, gr: 0.6 }], // release
  [0.32, { twist: 0.75, lean: 0.45, rx: -0.5, ry: 0.25, rz: 0.55, re: -0.3, lx: 0.2, lz: 0.4, le: -1.2, gl: -0.4, gr: 0.95 }], // follow-through
  [0.6, POSE_HOLD],
];
const THROW_END = 0.6;
// Bat swing timed to the server contact window (sweet spot at 0.17 s).
const SWING = [
  [0, { twist: -0.95, rx: -1.35, ry: 1.3, re: -0.5, lx: -1.25, ly: 1.15, le: -0.7, gl: -0.15, gr: 0.15, bat: -0.35 }],
  [0.17, { twist: 0.1, rx: -1.5, ry: 0, re: -0.05, lx: -1.45, ly: 0.1, le: -0.3, gl: -0.35, gr: 0.25, bat: -0.15 }],
  [0.34, { twist: 1.05, lean: 0.1, rx: -1.7, ry: -1.4, re: -0.6, lx: -1.25, ly: -1.05, le: -0.9, gl: -0.3, gr: 0.45, bat: -0.7 }],
  [0.45, { rx: -0.12, rz: -0.06, bat: 0.05 }],
];

function sampleTrack(track, t) {
  if (t <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [t1, b] = track[i];
    if (t <= t1) {
      const [t0, a] = track[i - 1];
      let f = (t - t0) / (t1 - t0);
      f = f * f * (3 - 2 * f); // smoothstep
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const def = k === 'rz' ? -0.08 : k === 'lz' ? 0.08 : 0;
        out[k] = (a[k] ?? def) + ((b[k] ?? def) - (a[k] ?? def)) * f;
      }
      return out;
    }
  }
  return track[track.length - 1][1];
}

// ------------------------------------------------------------------ parts
function shoe(style, skin, accent) {
  const g = new THREE.Group();
  g.position.set(0, -0.79, 0.04);
  const sole = mat('#f4f4f4');
  switch (style) {
    case 0:
      g.add(mesh(box(0.1, 0.06, 0.2), skin));
      break;
    case 1:
      g.add(mesh(box(0.11, 0.025, 0.24), mat('#2563eb'), 0, -0.02, 0));
      g.add(mesh(box(0.1, 0.05, 0.18), skin, 0, 0.02, 0));
      g.add(mesh(box(0.11, 0.015, 0.03), mat('#facc15'), 0, 0.04, 0.03));
      break;
    case 2:
      g.add(mesh(box(0.12, 0.09, 0.24), mat('#fafafa')));
      g.add(mesh(box(0.125, 0.03, 0.25), mat('#d1d5db'), 0, -0.04, 0));
      break;
    case 3:
      g.add(mesh(box(0.12, 0.09, 0.24), mat('#ff006e')));
      g.add(mesh(box(0.125, 0.03, 0.25), sole, 0, -0.04, 0));
      g.add(mesh(box(0.126, 0.03, 0.08), mat('#3a86ff'), 0, 0.01, -0.02));
      break;
    case 4:
      g.add(mesh(box(0.13, 0.2, 0.25), mat('#6b4423'), 0, 0.05, 0));
      g.add(mesh(box(0.135, 0.04, 0.26), mat('#2b1a0e'), 0, -0.05, 0));
      break;
    case 5:
      g.add(mesh(box(0.12, 0.1, 0.24), mat('#111827')));
      g.add(mesh(box(0.125, 0.04, 0.25), sole, 0, -0.04, 0));
      g.add(mesh(box(0.12, 0.05, 0.05), sole, 0, -0.01, 0.11));
      break;
    default:
      g.add(mesh(box(0.12, 0.08, 0.25), mat('#111111')));
      g.add(mesh(box(0.125, 0.015, 0.25), mat(accent), 0, 0.02, 0));
      for (const z of [-0.08, 0, 0.08]) g.add(mesh(box(0.1, 0.03, 0.02), sole, 0, -0.05, z));
  }
  return g;
}

function necklace(style) {
  if (!style) return null;
  const g = new THREE.Group();
  g.position.set(0, 1.41, 0.02);
  g.rotation.x = Math.PI / 2 - 0.35;
  const col = style === 1 ? GOLD : style === 2 ? SILVER : '#111111';
  if (style === 3) {
    const cols = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff'];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.add(mesh(sphere(0.018, 6, 4), mat(cols[i % 5]), Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0));
    }
    return g;
  }
  const r = style === 5 ? 0.075 : 0.12;
  g.add(mesh(new THREE.TorusGeometry(r, style === 5 ? 0.014 : 0.008, 5, 18), style === 4 || style === 5 ? mat(col) : metal(col)));
  if (style === 4) {
    const c = new THREE.Group();
    c.position.set(0, 0.13, -0.01);
    c.add(mesh(box(0.015, 0.06, 0.008), metal(SILVER)));
    c.add(mesh(box(0.04, 0.015, 0.008), metal(SILVER), 0, 0.01, 0));
    c.rotation.x = -Math.PI / 2;
    g.add(c);
  }
  return g;
}

function watch(style) {
  if (!style) return null;
  const g = new THREE.Group();
  const bands = [null, '#111111', GOLD, SILVER, '#a3e635', '#111111', '#7c4a23'];
  const bandM = style === 2 || style === 3 ? metal(bands[style]) : mat(bands[style]);
  g.add(mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.035, 10, 1, true), bandM));
  let face;
  if (style === 1) {
    face = mesh(box(0.05, 0.04, 0.025), mat('#111111'));
    face.add(mesh(box(0.038, 0.026, 0.002), mat('#22c55e', { emissive: '#22c55e', emissiveIntensity: 0.8 }), 0, 0, 0.013));
  } else if (style === 5) {
    face = mesh(box(0.055, 0.05, 0.02), mat('#111111'));
    face.add(mesh(box(0.045, 0.04, 0.002), mat('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 0.9 }), 0, 0, 0.011));
  } else {
    const rim = style === 4 ? mat('#f97316') : metal(style === 2 ? GOLD : SILVER);
    face = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), rim);
    face.rotation.x = Math.PI / 2;
    face.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 10), mat('#ffffff'), 0, 0.011, 0));
  }
  face.position.set(0.064, 0, 0);
  face.rotation.y = Math.PI / 2;
  if (style !== 1 && style !== 5) face.rotation.z = Math.PI / 2;
  g.add(face);
  return g;
}

function dome(r, m, tilt = -0.4, theta = Math.PI * 0.5) {
  const d = mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, theta), m);
  d.rotation.x = tilt;
  return d;
}

function addHair(head, style, m) {
  if (style === 0) return;
  if (style === 3) {
    const afro = mesh(new THREE.IcosahedronGeometry(0.3, 1), m, 0, 0.1, -0.06);
    afro.scale.set(1, 0.85, 1);
    head.add(afro);
    return;
  }
  const top = dome(0.212, m);
  top.position.y = 0.025;
  if (style !== 2) head.add(top);
  switch (style) {
    case 2: {
      const mo = mesh(box(0.06, 0.12, 0.38), m, 0, 0.19, -0.02);
      mo.rotation.x = -0.15;
      head.add(mo);
      break;
    }
    case 4: {
      const tail = mesh(new THREE.ConeGeometry(0.07, 0.32, 6), m, 0, -0.06, -0.26);
      tail.rotation.x = -2.6;
      head.add(tail);
      head.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 4, 8), mat('#ec4899'), 0, 0.06, -0.22));
      break;
    }
    case 5:
      head.add(mesh(box(0.4, 0.42, 0.1), m, 0, -0.14, -0.13));
      head.add(mesh(box(0.06, 0.34, 0.16), m, 0.19, -0.12, -0.02));
      head.add(mesh(box(0.06, 0.34, 0.16), m, -0.19, -0.12, -0.02));
      break;
    case 6: {
      const q = mesh(box(0.22, 0.1, 0.2), m, 0, 0.2, 0.08);
      q.rotation.x = -0.5;
      head.add(q);
      break;
    }
    case 7:
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
        const b = mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.36, 5), m, Math.cos(a) * 0.2, -0.12, -Math.sin(a) * 0.17);
        head.add(b);
      }
      break;
  }
}

function addFacialHair(head, style, m) {
  switch (style) {
    case 1:
      head.add(mesh(box(0.11, 0.025, 0.03), m, 0, -0.055, 0.19));
      break;
    case 2:
      head.add(mesh(box(0.09, 0.02, 0.03), m, 0, -0.055, 0.19));
      head.add(mesh(box(0.06, 0.08, 0.05), m, 0, -0.17, 0.15));
      break;
    case 3:
    case 4: {
      const full = style === 4;
      const g = new THREE.SphereGeometry(full ? 0.205 : 0.198, 12, 8, Math.PI / 2 - 1.5, 3.0, Math.PI * 0.55, Math.PI * (full ? 0.4 : 0.3));
      const beard = mesh(g, m, 0, full ? -0.02 : 0, 0.01);
      head.add(beard);
      head.add(mesh(box(0.11, 0.025, 0.03), m, 0, -0.055, 0.19));
      if (full) head.add(mesh(box(0.14, 0.1, 0.08), m, 0, -0.2, 0.12));
      break;
    }
    case 5:
      head.add(mesh(box(0.03, 0.12, 0.06), m, 0.185, -0.03, 0.05));
      head.add(mesh(box(0.03, 0.12, 0.06), m, -0.185, -0.03, 0.05));
      break;
    case 6:
      for (const s of [1, -1]) {
        const t = mesh(new THREE.TorusGeometry(0.04, 0.014, 4, 8, Math.PI), m, 0.045 * s, -0.06, 0.19);
        t.rotation.z = s > 0 ? Math.PI : 0;
        head.add(t);
      }
      break;
  }
}

function addHat(head, style, col, hairStyle) {
  if (!style) return;
  const m = mat(col);
  const lift = hairStyle === 3 ? 0.1 : 0;
  const g = new THREE.Group();
  g.position.y = lift;
  head.add(g);
  const cap = () => {
    const c = dome(0.218, m, -0.25, Math.PI * 0.52);
    c.position.y = 0.03;
    g.add(c);
    g.add(mesh(sphere(0.02, 6, 4), m, 0, 0.25, -0.02));
  };
  switch (style) {
    case 1: {
      cap();
      const brim = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 10, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.07, 0.15);
      brim.rotation.x = 0.28;
      brim.scale.set(1.15, 1, 1.3);
      g.add(brim);
      break;
    }
    case 2: {
      const c = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 10), m, 0, 0.13, -0.01);
      g.add(c);
      g.add(mesh(box(0.28, 0.015, 0.2), m, 0, 0.06, 0.24));
      g.add(mesh(box(0.06, 0.04, 0.01), mat('#ffd60a'), 0.08, 0.15, 0.21));
      break;
    }
    case 3: {
      cap();
      const brim = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 10, 1, false, Math.PI / 2, Math.PI), m, 0, 0.08, -0.16);
      brim.rotation.x = -0.2;
      brim.scale.set(1.1, 1, 1.2);
      g.add(brim);
      break;
    }
    case 4: {
      const straw = mat('#e2c172');
      g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 14), straw, 0, 0.1, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 12), straw, 0, 0.18, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.04, 12), m, 0, 0.12, 0));
      break;
    }
    case 5: {
      const c = dome(0.225, m, -0.15, Math.PI * 0.55);
      c.position.y = 0.02;
      g.add(c);
      g.add(mesh(new THREE.TorusGeometry(0.205, 0.035, 5, 14), m, 0, 0.04, 0).rotateX(Math.PI / 2 - 0.15));
      g.add(mesh(sphere(0.06, 8, 6), mat('#ffffff'), 0, 0.27, -0.03));
      break;
    }
    case 6: {
      g.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 5, 16), m, 0, 0.08, 0).rotateX(Math.PI / 2));
      const brim = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.015, 10, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.08, 0.15);
      brim.rotation.x = 0.2;
      g.add(brim);
      break;
    }
    case 7: {
      g.add(mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.08, 14, 1, true), m, 0, 0.09, 0));
      g.add(mesh(new THREE.TetrahedronGeometry(0.06), m, 0, 0.08, -0.22));
      const tail = mesh(box(0.05, 0.14, 0.02), m, 0.03, -0.01, -0.23);
      tail.rotation.z = 0.3;
      g.add(tail);
      break;
    }
    case 8: {
      const brown = mat(col === '#f8f8f8' ? '#f5f5f4' : '#8b5a2b');
      const brim = mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.03, 14), brown, 0, 0.1, 0);
      brim.scale.set(1, 1, 0.8);
      g.add(brim);
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.2, 10), brown, 0, 0.2, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.035, 10), m, 0, 0.13, 0));
      break;
    }
    case 9: {
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.215, 0.17, 12), m, 0, 0.14, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.07, 12, 1, true), m, 0, 0.04, 0));
      break;
    }
    case 10: {
      // Coroa (premium): golden band with points and jewels.
      const gold = metal(GOLD);
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12, 1, true), gold, 0, 0.17, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(mesh(new THREE.ConeGeometry(0.04, 0.1, 4), gold, Math.sin(a) * 0.19, 0.25, Math.cos(a) * 0.19));
        g.add(mesh(sphere(0.018, 6, 4), mat(['#ef4444', '#3b82f6', '#22c55e'][i % 3], { emissive: '#330000' }), Math.sin(a) * 0.2, 0.17, Math.cos(a) * 0.2));
      }
      break;
    }
    case 11: {
      // Cartola (premium): tall top hat with a coloured band.
      const black = mat('#111111');
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14), black, 0, 0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 14), black, 0, 0.29, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 14), m, 0, 0.16, 0));
      break;
    }
  }
}

function addGlasses(head, style) {
  if (!style) return;
  const g = new THREE.Group();
  g.position.set(0, 0.03, 0.19);
  head.add(g);
  const lensDark = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.1, metalness: 0.6 });
  const frameBlack = mat('#0b0b0b');
  const temples = (m) => {
    for (const s of [1, -1]) {
      const t = mesh(box(0.012, 0.012, 0.2), m, 0.105 * s, 0.01, -0.1);
      g.add(t);
    }
  };
  switch (style) {
    case 1: {
      const lens = new THREE.MeshStandardMaterial({ color: '#3f6212', roughness: 0.05, metalness: 0.7 });
      for (const s of [1, -1]) {
        const l = mesh(sphere(0.055, 8, 6), lens, 0.065 * s, -0.005, 0);
        l.scale.set(1, 0.85, 0.2);
        g.add(l);
      }
      g.add(mesh(box(0.05, 0.008, 0.008), metal(GOLD), 0, 0.03, 0.005));
      temples(metal(GOLD));
      break;
    }
    case 2:
      for (const s of [1, -1]) {
        g.add(mesh(box(0.1, 0.065, 0.02), frameBlack, 0.065 * s, 0, 0));
        g.add(mesh(box(0.085, 0.05, 0.004), lensDark, 0.065 * s, -0.002, 0.011));
      }
      temples(frameBlack);
      break;
    case 3:
      for (const s of [1, -1]) {
        g.add(mesh(new THREE.TorusGeometry(0.042, 0.007, 5, 12), metal(GOLD), 0.06 * s, 0, 0));
        g.add(mesh(new THREE.CircleGeometry(0.04, 12), lensDark, 0.06 * s, 0, 0.002));
      }
      g.add(mesh(box(0.035, 0.008, 0.008), metal(GOLD), 0, 0.01, 0));
      temples(metal(GOLD));
      break;
    case 4: {
      const mirror = new THREE.MeshStandardMaterial({ color: '#60a5fa', roughness: 0.02, metalness: 1, emissive: '#1e3a8a', emissiveIntensity: 0.4 });
      const band = mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 14, 1, true, -1.1, 2.2), mirror, 0, 0, -0.19);
      g.add(band);
      temples(mat('#ef4444'));
      break;
    }
    case 5: {
      const heart = new THREE.Shape();
      heart.moveTo(0, -0.04);
      heart.bezierCurveTo(-0.06, 0, -0.05, 0.05, 0, 0.025);
      heart.bezierCurveTo(0.05, 0.05, 0.06, 0, 0, -0.04);
      const red = mat('#ff2d6f', { side: THREE.DoubleSide });
      for (const s of [1, -1]) g.add(mesh(new THREE.ShapeGeometry(heart), red, 0.065 * s, 0, 0.004));
      temples(mat('#ff2d6f'));
      break;
    }
    case 6: {
      const shape = new THREE.Shape();
      shape.moveTo(-0.045, -0.025);
      shape.lineTo(0.04, -0.03);
      shape.lineTo(0.06, 0.045);
      shape.lineTo(-0.05, 0.025);
      shape.closePath();
      const m = new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.2, side: THREE.DoubleSide });
      for (const s of [1, -1]) {
        const l = mesh(new THREE.ShapeGeometry(shape), m, 0.065 * s, 0, 0.004);
        l.scale.x = s;
        g.add(l);
      }
      temples(mat('#7c2d12'));
      break;
    }
    default: {
      const clear = new THREE.MeshStandardMaterial({ color: '#334155', transparent: true, opacity: 0.55, roughness: 0.1 });
      for (const s of [1, -1]) {
        g.add(mesh(box(0.1, 0.08, 0.025), frameBlack, 0.065 * s, 0, 0));
        g.add(mesh(box(0.075, 0.055, 0.004), clear, 0.065 * s, 0, 0.014));
      }
      g.add(mesh(box(0.04, 0.015, 0.015), frameBlack, 0, 0.01, 0));
      temples(frameBlack);
    }
  }
}

function addEarrings(head, style) {
  if (!style) return;
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(0.205 * s, -0.06, 0.01);
    head.add(g);
    switch (style) {
      case 1:
      case 2: {
        const t = mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 12), metal(style === 1 ? GOLD : SILVER), 0, -0.03, 0);
        t.rotation.y = Math.PI / 2;
        g.add(t);
        break;
      }
      case 3:
        g.add(mesh(new THREE.OctahedronGeometry(0.015), new THREE.MeshStandardMaterial({ color: '#e0f2fe', emissive: '#7dd3fc', emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.05 })));
        break;
      case 4:
        g.add(mesh(box(0.006, 0.05, 0.008), metal(SILVER), 0, -0.035, 0));
        g.add(mesh(box(0.006, 0.008, 0.03), metal(SILVER), 0, -0.025, 0));
        break;
      case 5: {
        const f = mesh(new THREE.ConeGeometry(0.015, 0.1, 4), mat('#0ea5e9'), 0, -0.07, 0);
        f.rotation.x = Math.PI;
        f.scale.z = 0.3;
        g.add(f);
        g.add(mesh(sphere(0.008, 5, 4), metal(GOLD), 0, -0.015, 0));
        break;
      }
      case 6:
        g.add(mesh(sphere(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: '#fdfaf3', roughness: 0.15, metalness: 0.2 }), 0, -0.025, 0));
        break;
      default: {
        const t = mesh(new THREE.TorusGeometry(0.02, 0.008, 5, 10), mat('#111111'), 0, -0.01, 0);
        t.rotation.y = Math.PI / 2;
        g.add(t);
      }
    }
  }
}
