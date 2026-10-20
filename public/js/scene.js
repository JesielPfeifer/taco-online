import * as THREE from 'three';
import { FIELD, BASE_R, TEAM_COLORS } from '/shared/config.js';
import { buildAvatar } from './avatar.js';
import { drawBallSkin, GLOWING_BALLS } from './skins.js';

const INTERP_DELAY = 85; // ms

export class World {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fd3f5');
    this.scene.fog = new THREE.Fog('#9fd3f5', 60, 140);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    this.camera.position.set(0, 12, -16);
    this.camDist = 1;
    this.overview = false;
    this.mode = 'third';
    this.yaw = 0;
    this.pitch = 0.32;

    const hemi = new THREE.HemisphereLight('#ffffff', '#4a6b3a', 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4d6', 1.6);
    sun.position.set(18, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.far = 90;
    this.scene.add(sun);

    this.avatars = new Map();
    this.snaps = [];
    this.baseDistance = 10;
    this.buildStatic();
    this.buildBall('tenis');

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.aim = new THREE.Vector3(0, 0, 10);

    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.33, 24),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.position.y = 0.03;
    this.scene.add(this.aimRing);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: '#ffd23f', dashSize: 0.3, gapSize: 0.2 }));
    this.scene.add(this.aimLine);

    this.retaRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24), new THREE.MeshBasicMaterial({ color: '#ff8c00', transparent: true, opacity: 0.8 }));
    this.retaRing.rotation.x = -Math.PI / 2;
    this.retaRing.position.y = 0.04;
    this.scene.add(this.retaRing);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ static field
  buildStatic() {
    const s = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#4f7a3a' }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfW * 2, FIELD.halfL * 2),
      new THREE.MeshStandardMaterial({ color: '#6fae4c' }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.005;
    field.receiveShadow = true;
    s.add(field);

    // Mowing stripes
    for (let i = -FIELD.halfL; i < FIELD.halfL; i += 4) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfW * 2, 2), new THREE.MeshStandardMaterial({ color: '#79b856' }));
      st.rotation.x = -Math.PI / 2;
      st.position.set(0, 0.007, i + 1);
      st.receiveShadow = true;
      s.add(st);
    }

    this.fieldGroup = new THREE.Group();
    s.add(this.fieldGroup);

    // Fence
    const wood = new THREE.MeshStandardMaterial({ color: '#8a5a2b', flatShading: true });
    const addRail = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      for (const y of [0.45, 0.95]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, len), wood);
        r.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        r.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        r.castShadow = true;
        s.add(r);
      }
      const n = Math.ceil(len / 2.5);
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, FIELD.fenceH + 0.1, 0.12), wood);
        p.position.set(x1 + ((x2 - x1) * i) / n, (FIELD.fenceH + 0.1) / 2, z1 + ((z2 - z1) * i) / n);
        p.castShadow = true;
        s.add(p);
      }
    };
    const W = FIELD.halfW;
    const L = FIELD.halfL;
    addRail(-W, -L, W, -L);
    addRail(-W, L, W, L);
    addRail(-W, -L, -W, L);
    addRail(W, -L, W, L);

    // Mato (tall grass) outside the fence
    const tuftGeo = new THREE.ConeGeometry(0.25, 0.9, 4);
    const tuftMat = new THREE.MeshStandardMaterial({ color: '#3d6b2a', flatShading: true });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 900);
    const m = new THREE.Matrix4();
    let n = 0;
    while (n < 900) {
      const x = (Math.random() * 2 - 1) * FIELD.worldHalfW;
      const z = (Math.random() * 2 - 1) * FIELD.worldHalfL;
      if (Math.abs(x) < W + 0.6 && Math.abs(z) < L + 0.6) continue;
      const sc = 0.6 + Math.random() * 0.9;
      m.compose(new THREE.Vector3(x, 0.4 * sc, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 3, 0)), new THREE.Vector3(sc, sc, sc));
      tufts.setMatrixAt(n++, m);
    }
    s.add(tufts);

    // Trees and houses around
    const trunk = new THREE.MeshStandardMaterial({ color: '#6b4226', flatShading: true });
    const leaves = new THREE.MeshStandardMaterial({ color: '#2f6b2f', flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 45 + Math.random() * 12;
      const g = new THREE.Group();
      g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), trunk), { castShadow: true }));
      g.children[0].position.y = 1.5;
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + Math.random(), 0), leaves);
      top.position.y = 4;
      top.castShadow = true;
      g.add(top);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 1.2);
      s.add(g);
    }
    const houseCols = ['#f4d35e', '#ee964b', '#f95738', '#a7c957', '#8ecae6', '#ffafcc'];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const w = 6 + Math.random() * 3;
      const h = 3 + Math.random() * 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 5), new THREE.MeshStandardMaterial({ color: houseCols[i % 6], flatShading: true }));
      body.position.y = h / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#9b2226', flatShading: true }));
      roof.position.y = h + 1.1;
      roof.rotation.y = Math.PI / 4;
      g.add(body, roof);
      const side = i < 5 ? -1 : 1;
      g.position.set(-24 + (i % 5) * 12, 0, side * 62);
      s.add(g);
    }
  }

  setBaseDistance(d) {
    this.baseDistance = d;
    const g = this.fieldGroup;
    while (g.children.length) g.remove(g.children[0]);
    const half = d / 2;
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(3.2, d + 6), new THREE.MeshStandardMaterial({ color: '#b38b5d' }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.012;
    dirt.receiveShadow = true;
    g.add(dirt);
    const chalk = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.06), chalk);
    mid.rotation.x = -Math.PI / 2;
    mid.position.y = 0.02;
    g.add(mid);
    this.baseRings = [];
    this.targets = [];
    for (const k of [0, 1]) {
      const z = (k === 0 ? -1 : 1) * half;
      const ring = new THREE.Mesh(new THREE.RingGeometry(BASE_R - 0.06, BASE_R, 32), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.022, z);
      g.add(ring);
      this.baseRings.push(ring);
      const behind = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.05), chalk);
      behind.rotation.x = -Math.PI / 2;
      behind.position.set(0, 0.02, z + (k === 0 ? -1 : 1) * 0.4);
      g.add(behind);
      g.add(this.makeTripod(z));
    }
  }

  makeTripod(z) {
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    const m = new THREE.MeshStandardMaterial({ color: '#d9b77a', flatShading: true });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.82, 6), m);
      leg.position.set(Math.cos(a) * 0.1, 0.4, Math.sin(a) * 0.1);
      leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      leg.castShadow = true;
      g.add(leg);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    top.position.y = 0.8;
    g.add(top);
    g.userData.fall = 0;
    this.targets.push(g);
    return g;
  }

  buildBall(skin) {
    if (this.ball) this.scene.remove(this.ball, this.ballShadow, this.trail);
    const tex = new THREE.CanvasTexture(drawBallSkin(skin));
    tex.colorSpace = THREE.SRGBColorSpace;
    const glow = GLOWING_BALLS.has(skin);
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 12),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: glow ? '#ffffff' : '#000000', emissiveMap: glow ? tex : null, emissiveIntensity: 0.7 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    // Trail
    this.trailPts = Array.from({ length: 14 }, () => new THREE.Vector3());
    const tg = new THREE.BufferGeometry().setFromPoints(this.trailPts);
    const col = { fogo: '#ff7b00', neon: '#00f0ff' }[skin] || '#ffffff';
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: glow ? 0.9 : 0.35 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.ballSkin = skin;
    for (const a of this.avatars.values()) a.av.setBallSkin(skin);
  }

  // ------------------------------------------------------------ players
  syncRoster(members, playerIds, myId) {
    this.myId = myId;
    const want = new Set(playerIds);
    for (const [id, a] of this.avatars) {
      if (!want.has(id) || a.cfgKey !== JSON.stringify(members.get(id)?.avatar) || a.name !== members.get(id)?.name) {
        this.scene.remove(a.av.root, a.label);
        this.avatars.delete(id);
      }
    }
    for (const id of playerIds) {
      if (this.avatars.has(id)) continue;
      const m = members.get(id);
      if (!m) continue;
      const av = buildAvatar(m.avatar);
      av.setBallSkin(this.ballSkin);
      this.scene.add(av.root);
      const label = this.makeLabel(m.name, m.team, id === myId);
      this.scene.add(label);
      this.avatars.set(id, { av, label, cfgKey: JSON.stringify(m.avatar), name: m.name, team: m.team, x: 0, z: 0, rot: 0 });
    }
  }

  makeLabel(name, team, me) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 30px system-ui, sans-serif';
    const w = Math.min(250, g.measureText(name).width + 28);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.roundRect((256 - w) / 2, 8, w, 46, 14);
    g.fill();
    g.strokeStyle = TEAM_COLORS[team] || '#fff';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = me ? '#ffd23f' : '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(1.6, 0.4, 1);
    sp.renderOrder = 10;
    return sp;
  }

  pushSnapshot(s) {
    this.snaps.push({ at: performance.now(), s });
    if (this.snaps.length > 30) this.snaps.shift();
  }

  // Interpolated server state at render time.
  sample() {
    const t = performance.now() - INTERP_DELAY;
    const sn = this.snaps;
    if (!sn.length) return null;
    let a = sn[0];
    let b = sn[sn.length - 1];
    for (let i = sn.length - 1; i > 0; i--) {
      if (sn[i - 1].at <= t) {
        a = sn[i - 1];
        b = sn[i];
        break;
      }
    }
    const span = b.at - a.at;
    const f = span > 0 ? Math.max(0, Math.min(1, (t - a.at) / span)) : 1;
    return { a: a.s, b: b.s, f };
  }

  screenToGround(nx, ny) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p)) this.aim.copy(p);
    return this.aim;
  }

  // ------------------------------------------------------------ frame
  render(dt, ctx) {
    const smp = this.sample();
    const me = ctx.local;
    if (smp && smp.b.P) {
      const { a, b, f } = smp;
      const pa = new Map(a.P ? a.P.map((p) => [p[0], p]) : []);
      for (const pb of b.P) {
        const av = this.avatars.get(pb[0]);
        if (!av) continue;
        const p0 = pa.get(pb[0]) || pb;
        let x = p0[1] + (pb[1] - p0[1]) * f;
        let z = p0[2] + (pb[2] - p0[2]) * f;
        let rot = lerpAngle(p0[3], pb[3], f);
        if (pb[0] === this.myId && me) {
          x = me.x;
          z = me.z;
          rot = me.rot;
        }
        // In first person my own body would block the view.
        const hideMe = pb[0] === this.myId && this.mode === 'first' && !this.overview;
        av.av.root.visible = !hideMe;
        av.label.visible = !hideMe;
        av.x = x;
        av.z = z;
        av.av.root.position.set(x, 0, z);
        av.av.root.rotation.y = rot;
        av.label.position.set(x, 2.25, z);
        const flags = pb[4];
        const batting = ctx.battingTeam === av.team;
        av.av.update(
          {
            speed: pb[0] === this.myId && me ? me.speed : pb[6],
            swingT: pb[5],
            holding: !!(flags & 1),
            shoulder: !!(flags & 2),
            dead: !!(flags & 16),
            batting,
            throwAge: pb[7],
            charging: pb[0] === this.myId && ctx.myCharging != null ? ctx.myCharging : !!(flags & 128),
            celebrate: ctx.celebrateTeam === av.team,
          },
          dt,
        );
      }
      // Ball
      const ba = a.B || b.B;
      const bb = b.B;
      const bx = ba[0] + (bb[0] - ba[0]) * f;
      const by = ba[1] + (bb[1] - ba[1]) * f;
      const bz = ba[2] + (bb[2] - ba[2]) * f;
      const held = bb[3];
      this.ball.visible = !held;
      if (!held) {
        this.ball.position.set(bx, Math.max(0.09, by), bz);
        this.ball.rotation.x += dt * 8;
        this.ballShadow.visible = true;
        this.ballShadow.position.set(bx, 0.025, bz);
        const sc = 1 + Math.min(2, by * 0.4);
        this.ballShadow.scale.set(sc, sc, sc);
        this.ballShadow.material.opacity = 0.4 / sc;
      } else this.ballShadow.visible = false;
      this.trailPts.pop();
      this.trailPts.unshift(this.ball.position.clone());
      this.trail.geometry.setFromPoints(this.trailPts);
      this.trail.visible = !held;
      // Targets
      if (this.targets && b.kn)
        this.targets.forEach((t, k) => {
          const goal = b.kn[k] ? 1 : 0;
          t.userData.fall += (goal - t.userData.fall) * Math.min(1, dt * 6);
          t.rotation.x = t.userData.fall * 1.45 * (k === 0 ? 1 : -1);
        });
      // Reta marker
      this.retaRing.visible = !!b.re;
      if (b.re) {
        this.retaRing.position.set(b.re.x, 0.04, b.re.z);
        const s = 1 + Math.sin(performance.now() / 150) * 0.15;
        this.retaRing.scale.set(s, s, s);
      }
      // Base rings: green when protected
      if (this.baseRings && ctx.protectedBases)
        this.baseRings.forEach((r, k) => r.material.color.set(ctx.protectedBases[k] ? '#3ddc84' : '#ffffff'));
    }

    // Aim helpers
    this.aimRing.visible = !!ctx.showAim;
    this.aimRing.position.set(this.aim.x, 0.03, this.aim.z);
    this.aimLine.visible = !!ctx.showAim && !!me;
    if (me && ctx.showAim) {
      const pts = [new THREE.Vector3(me.x, 1.2, me.z), new THREE.Vector3(this.aim.x, 0.05, this.aim.z)];
      this.aimLine.geometry.setFromPoints(pts);
      this.aimLine.computeLineDistances();
    }

    this.updateCamera(dt, me);
    this.renderer.render(this.scene, this.camera);
  }

  // Camera modes: 'third' (chase camera behind the player), 'first' (eyes of the
  // avatar) and the field overview (V). yaw/pitch belong to the camera and are kept
  // continuously, so crossing the middle of the field never flips the view.
  updateCamera(dt, me) {
    const cam = this.camera;
    if (this.overview || !me) {
      const pos = new THREE.Vector3(-26 * this.camDist, 22 * this.camDist, 0);
      cam.position.lerp(pos, Math.min(1, dt * 4));
      cam.lookAt(0, 0, 0);
      this.camTarget = null;
      return;
    }
    const dir = this.lookDir();
    if (this.mode === 'first') {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      cam.position.set(me.x + fx * 0.18, 1.62, me.z + fz * 0.18);
      cam.lookAt(cam.position.clone().add(dir));
      this.camTarget = null;
      return;
    }
    // Over-the-shoulder pivot slightly to the right so the crosshair is not hidden.
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = new THREE.Vector3(me.x, 1.55, me.z).addScaledVector(right, 0.45);
    const dist = 4.6 * this.camDist;
    const pos = pivot.clone().addScaledVector(dir, -dist);
    pos.y = Math.max(0.4, pos.y);
    // Follow position tightly (no lag while sprinting), smooth only the small corrections.
    cam.position.lerp(pos, Math.min(1, dt * 18));
    cam.lookAt(cam.position.clone().add(dir));
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  // Aim point = where the centre of the screen (crosshair) meets the ground.
  aimFromCenter(me) {
    if (this.overview || !me) return this.aim;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const p = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, p);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (!hit || Math.hypot(p.x - me.x, p.z - me.z) > 40 || (p.x - me.x) * fx + (p.z - me.z) * fz < 0.5) {
      p.set(me.x + fx * 40, 0, me.z + fz * 40);
    }
    this.aim.copy(p);
    return this.aim;
  }

  // Unit vectors for "forward"/"right" on the ground, from the camera yaw.
  cameraBasis() {
    if (this.overview) {
      const f = new THREE.Vector3();
      this.camera.getWorldDirection(f);
      f.y = 0;
      f.normalize();
      return { f, r: new THREE.Vector3(-f.z, 0, f.x) };
    }
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    return { f, r };
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
