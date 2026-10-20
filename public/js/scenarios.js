// Scenario builders. Every scenario keeps the same playing area (FIELD): inside the
// boundary is the field, the boundary is the "fence" (low balls bounce, high balls go
// over) and outside it is the "pátio" where players move slowly.
import * as THREE from 'three';
import { FIELD } from '/shared/config.js';

const W = FIELD.halfW;
const L = FIELD.halfL;

const mats = new Map();
function m(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
}
function box(g, w, h, d, color, x, y, z, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? m(color) : color);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.castShadow = true;
  o.receiveShadow = true;
  g.add(o);
  return o;
}
function plane(g, w, d, color, x, z, y = 0.005) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m(color));
  o.rotation.x = -Math.PI / 2;
  o.position.set(x, y, z);
  o.receiveShadow = true;
  g.add(o);
  return o;
}
function cyl(g, rt, rb, h, color, x, y, z, seg = 8) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? m(color) : color);
  o.position.set(x, y, z);
  o.castShadow = true;
  g.add(o);
  return o;
}
function textTexture(text, bg, fg, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(h * 0.6)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- reusable props
function tree(g, x, z, s = 1, leaves = '#2f6b2f') {
  cyl(g, 0.25 * s, 0.35 * s, 3 * s, '#6b4226', x, 1.5 * s, z, 6);
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 * s, 0), m(leaves));
  top.position.set(x, 3.8 * s, z);
  top.castShadow = true;
  g.add(top);
}
function palm(g, x, z) {
  for (let i = 0; i < 6; i++) {
    const seg = cyl(g, 0.16, 0.2, 1, '#8b6b3e', x + i * 0.12, 0.5 + i * 0.95, z, 6);
    seg.rotation.z = -0.12;
  }
  for (let i = 0; i < 7; i++) {
    const leaf = box(g, 0.5, 0.05, 2.6, '#2f8f3a', x + 0.7, 5.9, z);
    leaf.rotation.set(0.5, (i / 7) * Math.PI * 2, 0);
    leaf.geometry.translate(0, 0, 1.2);
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), m('#6b4f2a'));
    c.position.set(x + 0.6 + Math.cos(i * 2) * 0.2, 5.6, z + Math.sin(i * 2) * 0.2);
    g.add(c);
  }
}
function house(g, x, z, w, h, color, ry = 0, roof = '#9b2226') {
  const hg = new THREE.Group();
  hg.position.set(x, 0, z);
  hg.rotation.y = ry;
  box(hg, w, h, 6, color, 0, h / 2, 0);
  const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 2.2, 4), m(roof));
  r.position.y = h + 1.1;
  r.rotation.y = Math.PI / 4;
  r.castShadow = true;
  hg.add(r);
  box(hg, 1, 2, 0.1, '#5b3a1e', 0, 1, 3.02);
  box(hg, 1.2, 1, 0.1, '#bfe3ff', -w / 4 - 0.4, h * 0.55, 3.02);
  box(hg, 1.2, 1, 0.1, '#bfe3ff', w / 4 + 0.4, h * 0.55, 3.02);
  g.add(hg);
}
const CAR_COLORS = ['#d62828', '#1d4ed8', '#f4f4f4', '#111827', '#f59e0b', '#16a34a', '#9ca3af', '#7c3aed'];
function car(g, x, z, ry = 0, color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]) {
  const cg = new THREE.Group();
  cg.position.set(x, 0, z);
  cg.rotation.y = ry;
  box(cg, 1.8, 0.7, 4.2, color, 0, 0.6, 0);
  box(cg, 1.6, 0.6, 2.2, color, 0, 1.2, -0.2);
  box(cg, 1.62, 0.45, 2.0, new THREE.MeshStandardMaterial({ color: '#9fd3f5', roughness: 0.1, metalness: 0.4 }), 0, 1.22, -0.2);
  for (const [wx, wz] of [
    [-0.9, 1.3],
    [0.9, 1.3],
    [-0.9, -1.3],
    [0.9, -1.3],
  ]) {
    const w = cyl(cg, 0.36, 0.36, 0.25, '#111111', wx, 0.36, wz, 10);
    w.rotation.z = Math.PI / 2;
  }
  box(cg, 0.4, 0.2, 0.05, '#fff7cc', -0.55, 0.7, 2.11);
  box(cg, 0.4, 0.2, 0.05, '#fff7cc', 0.55, 0.7, 2.11);
  g.add(cg);
  return cg;
}
function lamp(g, x, z, dir = 1) {
  cyl(g, 0.07, 0.09, 5, '#6b7280', x, 2.5, z, 6);
  box(g, 1.2 * Math.abs(dir), 0.08, 0.08, '#6b7280', x + 0.6 * dir, 5, z);
  box(g, 0.5, 0.15, 0.3, new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3b0', emissiveIntensity: 0.4 }), x + 1.1 * dir, 4.9, z);
}
function railFence(g, color = '#8a5a2b', rails = [0.45, 0.95], postEvery = 2.5) {
  const mat = m(color);
  const side = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    for (const y of rails) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, len), mat);
      r.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      r.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      r.castShadow = true;
      g.add(r);
    }
    const n = Math.ceil(len / postEvery);
    for (let i = 0; i <= n; i++) box(g, 0.12, FIELD.fenceH + 0.1, 0.12, mat, x1 + ((x2 - x1) * i) / n, (FIELD.fenceH + 0.1) / 2, z1 + ((z2 - z1) * i) / n);
  };
  side(-W, -L, W, -L);
  side(-W, L, W, L);
  side(-W, -L, -W, L);
  side(W, -L, W, L);
}
function scatter(g, geo, mat, count, place) {
  const im = new THREE.InstancedMesh(geo, mat, count);
  const mx = new THREE.Matrix4();
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 20) {
    const p = place();
    if (!p) continue;
    const s = p.s ?? 1;
    mx.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 3, 0)), new THREE.Vector3(s, s, s));
    im.setMatrixAt(n++, mx);
  }
  im.count = n;
  im.castShadow = true;
  g.add(im);
}
function outside(x, z, pad = 0.6) {
  return Math.abs(x) > W + pad || Math.abs(z) > L + pad;
}
function randOut(pad = 0.6) {
  const x = (Math.random() * 2 - 1) * FIELD.worldHalfW;
  const z = (Math.random() * 2 - 1) * FIELD.worldHalfL;
  return outside(x, z, pad) ? { x, z } : null;
}

// ---- scenarios
export const SCENARIO_INFO = {
  campinho: { sky: '#9fd3f5', strip: '#b38b5d' },
  rua: { sky: '#a9d6f5', strip: null },
  sitio: { sky: '#bfe0f0', strip: '#a07a4a' },
  mercado: { sky: '#b5d9f2', strip: null },
  praia: { sky: '#8fd0ff', strip: null },
};

export function buildScenario(name) {
  const g = new THREE.Group();
  (BUILDERS[name] || BUILDERS.campinho)(g);
  return g;
}

const BUILDERS = {
  campinho(g) {
    plane(g, 300, 300, '#4f7a3a', 0, 0, 0);
    plane(g, W * 2, L * 2, '#6fae4c', 0, 0);
    for (let i = -L; i < L; i += 4) plane(g, W * 2, 2, '#79b856', 0, i + 1, 0.007);
    railFence(g);
    scatter(g, new THREE.ConeGeometry(0.25, 0.9, 4), m('#3d6b2a'), 900, () => {
      const p = randOut();
      if (p) {
        p.s = 0.6 + Math.random() * 0.9;
        p.y = 0.4 * p.s;
      }
      return p;
    });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 45 + Math.random() * 12;
      tree(g, Math.cos(a) * r, Math.sin(a) * r * 1.2, 1 + Math.random() * 0.4);
    }
    const cols = ['#f4d35e', '#ee964b', '#f95738', '#a7c957', '#8ecae6', '#ffafcc'];
    for (let i = 0; i < 10; i++) house(g, -24 + (i % 5) * 12, (i < 5 ? -1 : 1) * 62, 6 + Math.random() * 3, 3 + Math.random() * 2, cols[i % 6], i < 5 ? 0 : Math.PI);
  },

  // Rua de bairro: asphalt street along the pitch, sidewalks, front yards behind low walls.
  rua(g) {
    plane(g, 300, 300, '#6f8a46', 0, 0, 0); // backyards
    plane(g, 18, 300, '#3b3f45', 0, 0); // street (continues past both ends)
    plane(g, 300, 14, '#3b3f45', 0, L + 6); // cross street
    plane(g, 300, 14, '#3b3f45', 0, -L - 6);
    for (const s of [-1, 1]) {
      plane(g, 2, L * 2, '#c9c9c4', s * 10, 0, 0.012); // sidewalk
      box(g, 0.25, 0.15, L * 2, '#9a9a95', s * 9, 0.075, 0); // curb
      plane(g, 9, L * 2, '#7fae52', s * 15.5, 0, 0.008); // front yards
      for (let z = -L + 4; z < L; z += 7) lamp(g, s * 10.4, z, -s);
    }
    // crosswalks
    for (const zc of [-L + 2.5, L - 2.5]) for (let x = -8; x <= 8; x += 1.4) plane(g, 0.7, 3, '#f2f2f2', x, zc, 0.012);
    // Low colourful walls (the boundary) on the long sides, gates at the ends.
    const wallCols = ['#f4a261', '#e9c46a', '#8ecae6', '#ffafcc', '#a7c957', '#ffffff'];
    for (const s of [-1, 1])
      for (let z = -L; z < L; z += 7) box(g, 0.25, FIELD.fenceH, 7, wallCols[Math.abs(Math.round(z / 7 + s)) % 6], s * W, FIELD.fenceH / 2, z + 3.5);
    for (const s of [-1, 1]) {
      box(g, W * 2 - 18, 0.08, 0.08, '#555', 0, FIELD.fenceH, s * L).position.x = 0;
      for (const x of [-W, -9, 9, W]) cyl(g, 0.06, 0.06, FIELD.fenceH, '#555', x, FIELD.fenceH / 2, s * L, 6);
    }
    const cols = ['#f4d35e', '#ee964b', '#f95738', '#a7c957', '#8ecae6', '#ffafcc', '#e5e5e5'];
    for (const s of [-1, 1])
      for (let z = -L + 3; z < L; z += 11) house(g, s * 26, z, 8, 3 + Math.random() * 2.5, cols[Math.floor(Math.random() * cols.length)], s > 0 ? -Math.PI / 2 : Math.PI / 2);
    // Parked cars on the driveways inside the yards and on the cross streets.
    for (const [x, z, r] of [
      [-16, -12, 0],
      [16, 4, Math.PI],
      [-16, 15, 0],
      [16, -20, Math.PI],
      [-12, L + 6, Math.PI / 2],
      [6, -L - 6, -Math.PI / 2],
    ])
      car(g, x, z, r);
    for (const s of [-1, 1]) for (let z = -L + 8; z < L; z += 14) tree(g, s * 13, z, 0.8, '#3f7f3f');
    // trash bins
    for (const z of [-6, 12]) cyl(g, 0.3, 0.3, 0.9, '#2f6b2f', 11, 0.45, z, 10);
  },

  // Sítio: dirt "terreiro", ranch fence, barn, corn field, cows, hay.
  sitio(g) {
    plane(g, 300, 300, '#7d9a45', 0, 0, 0);
    plane(g, W * 2, L * 2, '#a98b5d', 0, 0);
    scatter(g, new THREE.CircleGeometry(1.2, 6).rotateX(-Math.PI / 2), m('#8fa64e'), 60, () => {
      const x = (Math.random() * 2 - 1) * (W - 2);
      const z = (Math.random() * 2 - 1) * (L - 2);
      return Math.abs(x) < 3 ? null : { x, z, y: 0.008, s: 0.6 + Math.random() };
    });
    railFence(g, '#7a5230', [0.3, 0.7, 1.05], 3);
    // Corn field on +x side
    scatter(g, new THREE.ConeGeometry(0.18, 2.2, 4), m('#9bbf3a'), 700, () => {
      const x = W + 2 + Math.random() * (FIELD.worldHalfW - W);
      const z = (Math.random() * 2 - 1) * FIELD.worldHalfL;
      return { x, z: Math.round(z * 1.2) / 1.2, y: 1.1, s: 0.8 + Math.random() * 0.4 };
    });
    // Pasture grass on -x side
    scatter(g, new THREE.ConeGeometry(0.2, 0.6, 4), m('#5f8a32'), 400, () => {
      const p = randOut();
      return p && p.x < 0 ? { ...p, y: 0.3 } : null;
    });
    // Barn
    const barn = new THREE.Group();
    barn.position.set(-6, 0, L + 9);
    box(barn, 12, 6, 9, '#b23a2a', 0, 3, 0);
    const roof = box(barn, 13, 0.3, 6, '#5a3a2a', 0, 7.4, 2.3);
    roof.rotation.x = -0.6;
    const roof2 = box(barn, 13, 0.3, 6, '#5a3a2a', 0, 7.4, -2.3);
    roof2.rotation.x = 0.6;
    box(barn, 4, 4.5, 0.2, '#f4f1ea', 0, 2.25, -4.55);
    box(barn, 3.6, 4.1, 0.25, '#8a2a1e', 0, 2.1, -4.6);
    g.add(barn);
    // Water tank (caixa d'água)
    for (const [x, z] of [
      [8, 34],
      [10, 34],
      [8, 36],
      [10, 36],
    ])
      cyl(g, 0.1, 0.1, 5, '#6b4f2a', x, 2.5, z, 5);
    cyl(g, 1.6, 1.6, 2, '#4a6fa5', 9, 6, 35, 12);
    // Hay bales
    for (const [x, z] of [
      [-24, -10],
      [-25, -6],
      [-23, 8],
      [24, 30],
      [-12, -33],
    ]) {
      const h = cyl(g, 0.7, 0.7, 1.2, '#e2c172', x, 0.7, z, 10);
      h.rotation.z = Math.PI / 2;
    }
    // Cows
    for (const [x, z, r] of [
      [-26, 5, 0.4],
      [-28, -14, 2],
      [-24, 20, -1],
    ]) {
      const c = new THREE.Group();
      c.position.set(x, 0, z);
      c.rotation.y = r;
      box(c, 0.9, 0.8, 1.8, '#f5f5f5', 0, 1.1, 0);
      box(c, 0.92, 0.5, 0.6, '#222', 0, 1.2, 0.2);
      box(c, 0.5, 0.5, 0.6, '#f5f5f5', 0, 1.35, 1.1);
      box(c, 0.4, 0.2, 0.15, '#f4b6c2', 0, 1.2, 1.42);
      for (const [lx, lz] of [
        [-0.3, 0.6],
        [0.3, 0.6],
        [-0.3, -0.6],
        [0.3, -0.6],
      ])
        box(c, 0.15, 0.7, 0.15, '#eee', lx, 0.35, lz);
      g.add(c);
    }
    // Tractor
    const t = new THREE.Group();
    t.position.set(20, 0, -34);
    t.rotation.y = 0.5;
    box(t, 1.6, 1, 2.6, '#2e8b3a', 0, 1, 0);
    box(t, 1.4, 1.2, 1.2, '#2e8b3a', 0, 2, -0.6);
    for (const [x, z, r] of [
      [-0.95, -0.9, 0.75],
      [0.95, -0.9, 0.75],
      [-0.9, 1, 0.45],
      [0.9, 1, 0.45],
    ]) {
      const w = cyl(t, r, r, 0.35, '#1b1b1b', x, r, z, 10);
      w.rotation.z = Math.PI / 2;
    }
    g.add(t);
    for (let i = 0; i < 14; i++) tree(g, -FIELD.worldHalfW - 6 - Math.random() * 10, -40 + i * 6, 1.2 + Math.random() * 0.5, '#4a7a3a');
  },

  // Estacionamento do mercado: asphalt lot with painted spaces, cars, supermarket front.
  mercado(g) {
    plane(g, 300, 300, '#6b8a46', 0, 0, 0);
    plane(g, W * 2, L * 2, '#4a4f55', 0, 0);
    plane(g, 300, 20, '#3b3f45', 0, -L - 10); // avenue behind
    // Parking spaces along both long sides
    for (const s of [-1, 1]) {
      for (let z = -L + 1; z <= L - 1; z += 2.6) plane(g, 5, 0.1, '#f2f2f2', s * (W - 2.5), z, 0.012);
      plane(g, 0.1, L * 2 - 2, '#f2f2f2', s * (W - 5), 0, 0.012);
      for (let z = -L + 2.3; z < L - 1; z += 2.6) if (Math.random() < 0.45) car(g, s * (W - 2.6), z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    // driving arrows
    for (const z of [-18, 0, 18]) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 3), m('#f2f2f2'));
      a.rotation.set(-Math.PI / 2, 0, 0);
      a.position.set(-9, 0.015, z);
      a.scale.y = 0.02;
      g.add(a);
    }
    // Curbs (the boundary) with grass beds and shrubs outside
    for (const [w, d, x, z] of [
      [W * 2, 0.3, 0, L],
      [W * 2, 0.3, 0, -L],
      [0.3, L * 2, W, 0],
      [0.3, L * 2, -W, 0],
    ])
      box(g, w, 0.25, d, '#c9c9c4', x, 0.12, z);
    scatter(g, new THREE.IcosahedronGeometry(0.6, 0), m('#3f7f3f'), 160, () => {
      const p = randOut(1.2);
      return p && p.z < L + 4 ? { ...p, y: 0.4 } : null;
    });
    // Supermarket building
    const sm = new THREE.Group();
    sm.position.set(0, 0, L + 12);
    box(sm, 46, 8, 16, '#e7e2d6', 0, 4, 0);
    box(sm, 46, 1.2, 16.4, '#d62828', 0, 8.6, 0);
    box(sm, 20, 4, 0.2, new THREE.MeshStandardMaterial({ color: '#9fd3f5', roughness: 0.1, metalness: 0.5 }), 0, 2, -8.05);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.6), new THREE.MeshBasicMaterial({ map: textTexture('SUPERMERCADO TACO', '#d62828', '#ffffff', 1024, 150) }));
    sign.position.set(0, 6.4, -8.11);
    sign.rotation.y = Math.PI;
    sm.add(sign);
    box(sm, 46, 0.3, 3, '#9a9a95', 0, 4.2, -9.5); // canopy
    g.add(sm);
    // Shopping carts
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      c.position.set(14 + i * 0.5, 0, L + 2.5);
      const wire = new THREE.MeshStandardMaterial({ color: '#c0c4c8', metalness: 0.8, roughness: 0.3, wireframe: true });
      box(c, 0.6, 0.5, 0.9, wire, 0, 0.75, 0);
      box(c, 0.6, 0.05, 0.05, '#d62828', 0, 1.05, 0.5);
      g.add(c);
    }
    for (const s of [-1, 1]) for (const z of [-L + 6, 0, L - 6]) lamp(g, s * (W - 5.5), z, -s);
  },

  // Praia: sand field, rope boundary, sea on +x, palms and umbrellas.
  praia(g) {
    plane(g, 300, 300, '#e9d8a6', 0, 0, 0);
    plane(g, W * 2, L * 2, '#f1e3b8', 0, 0);
    // Sea
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 300), new THREE.MeshStandardMaterial({ color: '#1e88c7', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(W + 8 + 100, 0.03, 0);
    g.add(sea);
    plane(g, 2.5, 300, '#e6f6ff', W + 8.6, 0, 0.035); // foam
    plane(g, 4, 300, '#d8c48f', W + 6.5, 0, 0.01); // wet sand
    // Rope boundary on posts
    for (const [x1, z1, x2, z2] of [
      [-W, -L, W, -L],
      [-W, L, W, L],
      [-W, -L, -W, L],
      [W, -L, W, L],
    ]) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const r = box(g, 0.05, 0.05, len, '#c9a46a', (x1 + x2) / 2, FIELD.fenceH * 0.9, (z1 + z2) / 2);
      r.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      const n = Math.ceil(len / 4);
      for (let i = 0; i <= n; i++) cyl(g, 0.06, 0.06, FIELD.fenceH, '#8b6b3e', x1 + ((x2 - x1) * i) / n, FIELD.fenceH / 2, z1 + ((z2 - z1) * i) / n, 6);
    }
    for (let i = 0; i < 12; i++) palm(g, -W - 4 - Math.random() * 8, -36 + i * 6.5);
    for (const z of [-34, 34]) for (let i = 0; i < 4; i++) palm(g, -14 + i * 8, z + Math.random() * 3);
    const cols = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#f97316'];
    for (let i = 0; i < 8; i++) {
      const x = W + 2 + Math.random() * 3;
      const z = -L + 3 + i * 7;
      cyl(g, 0.04, 0.04, 2.4, '#ffffff', x, 1.2, z, 5);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 8), m(cols[i % 5]));
      top.position.set(x, 2.5, z);
      top.castShadow = true;
      g.add(top);
      box(g, 0.7, 0.1, 1.6, cols[(i + 2) % 5], x + 1, 0.3, z);
    }
    // Kiosk
    const k = new THREE.Group();
    k.position.set(-W - 8, 0, -4);
    box(k, 4, 2.6, 3, '#f2f2f2', 0, 1.3, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.6, 4), m('#c9a46a'));
    roof.position.y = 3.4;
    roof.rotation.y = Math.PI / 4;
    k.add(roof);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.7), new THREE.MeshBasicMaterial({ map: textTexture('ÁGUA DE COCO', '#2f8f3a', '#ffffff') }));
    sign.position.set(2.02, 2.2, 0);
    sign.rotation.y = Math.PI / 2;
    k.add(sign);
    g.add(k);
  },
};
