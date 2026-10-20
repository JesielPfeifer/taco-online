import * as THREE from 'three';
import {
  AVATAR_PARTS,
  RULE_DEFS,
  BALL_SKINS,
  TEAM_NAMES,
  TEAM_COLORS,
  FIELD,
  BASE_R,
  defaultAvatar,
  randomAvatar,
  sanitizeAvatar,
} from '/shared/config.js';
import { buildAvatar } from './avatar.js';
import { drawBallSkin } from './skins.js';
import { World } from './scene.js';
import { sfx, setMuted, isMuted } from './audio.js';
import { HELP_HTML } from './help.js';
import { VoiceChat } from './voice.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ------------------------------------------------------------------ state
const state = {
  myId: null,
  profile: loadProfile(),
  room: null, // last 'room' message
  members: new Map(),
  snap: null,
  world: null,
  local: null,
  keys: new Set(),
  mouse: { nx: 0, ny: 0, down: false, chargeStart: 0 },
  locked: false, // pointer lock: mouse turns the camera, aim = crosshair
  lastLook: 0, // last time the player turned the camera by hand
  yawGoal: null, // smooth turn target (X key, start of innings)
};
const voice = new VoiceChat((m) => send(m), () => renderVoice());

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('taco-profile') || 'null');
    if (p) return { name: p.name || '', avatar: sanitizeAvatar(p.avatar) };
  } catch {
    /* ignore */
  }
  return { name: '', avatar: defaultAvatar() };
}
function saveProfile() {
  try {
    localStorage.setItem('taco-profile', JSON.stringify(state.profile));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ network
let ws;
let reconnectDelay = 500;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    reconnectDelay = 500;
    sendProfile();
    send({ t: 'list' });
    const code = new URLSearchParams(location.search).get('sala');
    if (code) send({ t: 'join', code });
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    toast('Conexão perdida. Reconectando...');
    voice.leave();
    state.room = null;
    showScreen('menu');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(8000, reconnectDelay * 2);
  };
}
function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function sendProfile() {
  send({ t: 'profile', name: state.profile.name || 'Jogador', avatar: state.profile.avatar });
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      state.myId = m.id;
      break;
    case 'rooms':
      renderRoomList(m.list);
      break;
    case 'err':
      toast(m.msg);
      break;
    case 'rtc':
      voice.signal(m.from, m.data);
      break;
    case 'left':
      voice.leave();
      state.room = null;
      showScreen('menu');
      history.replaceState(null, '', '/');
      break;
    case 'room':
      onRoom(m);
      break;
    case 's':
      onSnapshot(m);
      break;
    case 'chat':
      addChat(m.from, m.text);
      break;
  }
}

// ------------------------------------------------------------------ screens
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  if (id === 'game') state.world?.resize();
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ------------------------------------------------------------------ menu / customizer
let preview;
function setupMenu() {
  $('#name').value = state.profile.name;
  $('#name').addEventListener('input', (e) => {
    state.profile.name = e.target.value.slice(0, 16);
    saveProfile();
    debounceProfile();
  });
  $('#randomAvatar').onclick = () => {
    state.profile.avatar = randomAvatar();
    onAvatarChange();
  };
  $('#createRoom').onclick = () => {
    if (!ensureName()) return;
    sfx.unlock();
    sendProfile();
    send({ t: 'create' });
  };
  $('#joinRoom').onclick = () => joinCode($('#joinCode').value);
  $('#joinCode').addEventListener('keydown', (e) => e.key === 'Enter' && joinCode(e.target.value));
  $('#helpMenu').innerHTML = HELP_HTML;
  $('#helpGame').innerHTML = HELP_HTML;
  renderCustomizer();
  preview = new AvatarPreview($('#preview'));
  preview.set(state.profile.avatar);
}

function ensureName() {
  if (!state.profile.name.trim()) {
    toast('Escolha um nome primeiro');
    $('#name').focus();
    return false;
  }
  return true;
}

function joinCode(code) {
  if (!ensureName()) return;
  sfx.unlock();
  sendProfile();
  send({ t: 'join', code: String(code).toUpperCase().trim() });
}

let profileTimer;
function debounceProfile() {
  clearTimeout(profileTimer);
  profileTimer = setTimeout(sendProfile, 300);
}

function onAvatarChange() {
  saveProfile();
  renderCustomizer();
  preview?.set(state.profile.avatar);
  debounceProfile();
}

function renderCustomizer() {
  const root = $('#customizer');
  root.innerHTML = '';
  for (const [key, def] of Object.entries(AVATAR_PARTS)) {
    const el = document.createElement('div');
    el.className = 'part';
    const idx = state.profile.avatar[key];
    if (def.color) {
      el.innerHTML = `<div class="label">${esc(def.label)}</div><div class="swatches">${def.options
        .map((c, i) => `<button class="swatch ${i === idx ? 'sel' : ''}" style="background:${c}" data-i="${i}" title="${c}"></button>`)
        .join('')}</div>`;
      el.querySelectorAll('.swatch').forEach((b) => (b.onclick = () => setPart(key, Number(b.dataset.i))));
    } else {
      el.innerHTML = `<div class="label">${esc(def.label)} · ${idx + 1}/${def.options.length}</div><div class="row"><button data-d="-1">◀</button><span class="value">${esc(
        def.options[idx],
      )}</span><button data-d="1">▶</button></div>`;
      el.querySelectorAll('button').forEach(
        (b) => (b.onclick = () => setPart(key, (idx + Number(b.dataset.d) + def.options.length) % def.options.length)),
      );
    }
    root.appendChild(el);
  }
}

function setPart(key, i) {
  state.profile.avatar[key] = i;
  onAvatarChange();
}

class AvatarPreview {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#335533', 1.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.4);
    d.position.set(2, 4, 3);
    this.scene.add(d);
    this.camera = new THREE.PerspectiveCamera(32, canvas.width / canvas.height, 0.1, 50);
    this.camera.position.set(0, 1.3, 4.2);
    this.camera.lookAt(0, 0.95, 0);
    this.rot = 0.4;
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => (drag = e.clientX));
    window.addEventListener('pointerup', () => (drag = null));
    window.addEventListener('pointermove', (e) => {
      if (drag == null) return;
      this.rot += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    });
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!$('#menu').classList.contains('active')) return;
      const dt = (now - last) / 1000;
      last = now;
      if (drag == null) this.rot += dt * 0.5;
      if (this.av) {
        this.av.root.rotation.y = this.rot;
        this.av.update({ speed: 0, batting: true, swingT: -1 }, dt);
      }
      this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }
  set(cfg) {
    if (this.av) this.scene.remove(this.av.root);
    this.av = buildAvatar(cfg);
    this.scene.add(this.av.root);
  }
}

function renderRoomList(list) {
  const ul = $('#roomList');
  if (!list.length) {
    ul.innerHTML = '<li class="muted">Nenhuma sala ainda — crie uma!</li>';
    return;
  }
  ul.innerHTML = list
    .map(
      (r) =>
        `<li><span><b class="code">${esc(r.code)}</b> · ${esc(r.host)} · ${r.seated}/4 · ${r.phase === 'lobby' ? 'aguardando' : 'em jogo'}</span><button data-code="${esc(
          r.code,
        )}">Entrar</button></li>`,
    )
    .join('');
  ul.querySelectorAll('button').forEach((b) => (b.onclick = () => joinCode(b.dataset.code)));
}

// ------------------------------------------------------------------ lobby
function isHost() {
  return state.room && state.room.host === state.myId;
}

function teamOf(id) {
  const seats = state.room?.seats;
  if (!seats) return null;
  for (const t of [0, 1]) if (seats[t].includes(id)) return t;
  return null;
}

function onRoom(m) {
  const prevPhase = state.room?.phase;
  state.room = m;
  state.members = new Map(m.members.map((x) => [x.id, { ...x, team: teamOf(x.id) }]));
  history.replaceState(null, '', `/?sala=${m.code}`);
  voice.sync(state.myId, m.members);
  renderVoice();
  if (m.phase === 'lobby') {
    showScreen('lobby');
    renderLobby();
    state.snap = null;
    state.local = null;
    $('#overBox').classList.add('hidden');
  } else {
    ensureWorld();
    state.world.setBaseDistance(m.rules.baseDistance);
    if (state.world.ballSkin !== m.ballSkin) state.world.buildBall(m.ballSkin);
    const ids = m.seats.flat().filter(Boolean);
    state.world.syncRoster(state.members, ids, state.myId);
    if (prevPhase === 'lobby' || !prevPhase) {
      state.world.snaps = [];
      state.local = null;
    }
    showScreen('game');
  }
}

function renderLobby() {
  const r = state.room;
  $('#roomCode').textContent = r.code;
  const host = isHost();
  const seats = $('#seats');
  seats.innerHTML = '';
  for (const t of [0, 1]) {
    const div = document.createElement('div');
    div.className = `team t${t}`;
    div.innerHTML = `<h4 style="color:${TEAM_COLORS[t]}">Time ${TEAM_NAMES[t]}</h4>`;
    for (const s of [0, 1]) {
      const id = r.seats[t][s];
      const m = id && state.members.get(id);
      const seat = document.createElement('div');
      seat.className = 'seat' + (id === state.myId ? ' me' : '');
      if (m) {
        seat.innerHTML = `<span>${m.bot ? '🤖' : '🧍'} ${esc(m.name)}${id === r.host ? ' 👑' : ''}</span>`;
        if (host && m.bot) {
          const x = document.createElement('button');
          x.className = 'x ghost';
          x.textContent = '✕';
          x.title = 'Remover bot';
          x.onclick = (e) => {
            e.stopPropagation();
            send({ t: 'kick', team: t, slot: s });
          };
          seat.appendChild(x);
        }
        if (m.bot && host) seat.onclick = () => send({ t: 'seat', team: t, slot: s });
      } else {
        seat.innerHTML = `<span class="muted">vaga livre</span>`;
        seat.onclick = () => send({ t: 'seat', team: t, slot: s });
        if (host) {
          const b = document.createElement('button');
          b.className = 'ghost';
          b.textContent = '+ bot';
          b.onclick = (e) => {
            e.stopPropagation();
            send({ t: 'addBot', team: t, slot: s });
          };
          seat.appendChild(b);
        }
      }
      div.appendChild(seat);
    }
    seats.appendChild(div);
  }
  const seatedIds = new Set(r.seats.flat());
  const specs = r.members.filter((m) => !seatedIds.has(m.id));
  $('#spectators').textContent = specs.length ? specs.map((m) => m.name).join(', ') : '—';

  const rules = $('#rules');
  rules.innerHTML = '';
  for (const [key, def] of Object.entries(RULE_DEFS)) {
    const lab = document.createElement('label');
    lab.innerHTML = `${esc(def.label)}<select ${host ? '' : 'disabled'}>${def.options
      .map(([v, l], i) => `<option value="${i}" ${v === r.rules[key] ? 'selected' : ''}>${esc(l)}</option>`)
      .join('')}</select>`;
    lab.querySelector('select').onchange = (e) => {
      const rulesNew = { ...r.rules, [key]: def.options[Number(e.target.value)][0] };
      send({ t: 'rules', rules: rulesNew });
    };
    rules.appendChild(lab);
  }
  const bs = $('#ballSkins');
  bs.innerHTML = '';
  for (const [k, label] of BALL_SKINS) {
    const b = document.createElement('button');
    b.className = 'ball-skin' + (r.ballSkin === k ? ' sel' : '');
    b.disabled = !host;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(drawBallSkin(k), 0, 0, 128, 128, 0, 0, 64, 64);
    const grd = g.createRadialGradient(22, 20, 4, 32, 32, 34);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    b.appendChild(c);
    b.appendChild(document.createTextNode(label));
    b.onclick = () => send({ t: 'ballSkin', skin: k });
    bs.appendChild(b);
  }
  $('#startGame').disabled = !host;
  $('#hostHint').textContent = host ? 'Você é o anfitrião.' : 'Aguardando o anfitrião começar a partida.';
}

function addChat(from, text) {
  for (const log of [$('#lobbyChat'), $('#gameChatLog')]) {
    const d = document.createElement('div');
    if (from) d.innerHTML = `<b>${esc(from)}:</b> ${esc(text)}`;
    else {
      d.className = 'sys';
      d.textContent = text;
    }
    log.appendChild(d);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
}

// ------------------------------------------------------------------ voice chat UI
function renderVoice() {
  const members = state.room?.members || [];
  const inVoice = members.filter((m) => m.voice);
  const list = inVoice
    .map((m) => {
      const icon = m.muted ? '🔇' : voice.speaking(m.id) ? '🔊' : '🎙️';
      const far = m.id !== state.myId && voice.on && (voice.peers.get(m.id)?.distGain ?? 1) < 0.05 ? ' <span class="muted">(longe)</span>' : '';
      const linking = m.id !== state.myId && voice.on && !voice.connected(m.id) ? ' <span class="muted">(conectando…)</span>' : '';
      return `<div class="${voice.speaking(m.id) && !m.muted ? 'talking' : ''}">${icon} ${esc(m.name)}${far}${linking}</div>`;
    })
    .join('');
  const html = `<div class="voice-row"><button data-voice-join>${voice.on ? '📴 Sair da voz' : '🎤 Entrar na voz'}</button>${
    voice.on ? `<button data-voice-mute>${voice.muted ? '🔇 Mudo (B)' : '🎙️ Mic ligado (B)'}</button>` : ''
  }</div><div class="voice-list">${list || '<span class="muted">Ninguém na voz</span>'}</div>`;
  for (const el of document.querySelectorAll('.voice-box')) {
    el.innerHTML = html;
    el.querySelector('[data-voice-join]').onclick = toggleVoice;
    el.querySelector('[data-voice-mute]')?.addEventListener('click', () => voice.toggleMute());
  }
}

async function toggleVoice() {
  if (voice.on) return voice.leave();
  try {
    await voice.join();
    voice.sync(state.myId, state.room?.members || []);
    toast('Chat de voz ligado — a voz fica mais baixa conforme a distância no campo');
  } catch (err) {
    toast(err.message || 'Não foi possível acessar o microfone');
  }
}

function setupLobby() {
  $('#leaveLobby').onclick = () => send({ t: 'leave' });
  $('#copyLink').onclick = async () => {
    const link = `${location.origin}/?sala=${state.room?.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado!');
    } catch {
      toast(link);
    }
  };
  $('#startGame').onclick = () => send({ t: 'start' });
  for (const id of ['#lobbyChatInput', '#gameChatInput']) {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = e.target.value.trim();
        if (text) send({ t: 'chat', text });
        e.target.value = '';
        if (id === '#gameChatInput') e.target.blur();
      } else if (e.key === 'Escape') e.target.blur();
      e.stopPropagation();
    });
  }
}

// ------------------------------------------------------------------ game
function ensureWorld() {
  if (state.world) return;
  state.world = new World($('#viewport'));
  let last = performance.now();
  let sendAcc = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!$('#game').classList.contains('active')) return;
    const ctx = frameContext(dt);
    sendAcc += dt;
    if (sendAcc > 1 / 30) {
      sendAcc = 0;
      sendInput(ctx);
    }
    state.world.render(dt, ctx);
    updatePowerBar();
  };
  requestAnimationFrame(loop);
}

function myPlayer() {
  return state.snap?.P?.find((p) => p[0] === state.myId);
}

function myRole() {
  const t = teamOf(state.myId);
  if (t == null || !state.snap) return 'spec';
  return t === state.snap.bt ? 'bat' : 'field';
}

function moveVector() {
  const k = state.keys;
  let fwd = 0;
  let right = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) right += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) right -= 1;
  if (!fwd && !right) return { x: 0, z: 0 };
  const { f, r } = state.world.cameraBasis();
  let x = f.x * fwd + r.x * right;
  let z = f.z * fwd + r.z * right;
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

function frameContext(dt) {
  const s = state.snap;
  const mp = myPlayer();
  const ph = s?.ph;
  // Local prediction for my own avatar.
  if (mp) {
    if (!state.local || Math.hypot(state.local.x - mp[1], state.local.z - mp[2]) > 2.2) {
      state.local = { x: mp[1], z: mp[2], rot: mp[3], vx: 0, vz: 0, speed: 0 };
    }
    const L = state.local;
    const mv = moveVector();
    const flags = mp[4];
    const locked = ph === 'decide' || ph === 'paused' || ph === 'gameover' || flags & 16 || ((flags & 32) && ph !== 'swap' && ph !== 'intro');
    let speed = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') ? (mp[8] > 0.05 ? 7.6 : 5.2) : 5.2;
    if (Math.abs(L.x) > FIELD.halfW || Math.abs(L.z) > FIELD.halfL) speed *= 0.5;
    if (mp[5] >= 0) speed *= 0.35;
    if (locked) speed = 0;
    const k = Math.min(1, dt * 12);
    L.vx += (mv.x * speed - L.vx) * k;
    L.vz += (mv.z * speed - L.vz) * k;
    L.x += L.vx * dt;
    L.z += L.vz * dt;
    L.x = Math.max(-FIELD.worldHalfW + 0.5, Math.min(FIELD.worldHalfW - 0.5, L.x));
    L.z = Math.max(-FIELD.worldHalfL + 0.5, Math.min(FIELD.worldHalfL - 0.5, L.z));
    // Reconcile towards the authoritative position.
    L.x += (mp[1] - L.x) * Math.min(1, dt * 3);
    L.z += (mp[2] - L.z) * Math.min(1, dt * 3);
    L.speed = Math.hypot(L.vx, L.vz);
    updateCameraYaw(dt, L, mp, ph);
    const w = state.world;
    if (state.locked || w.mode === 'first') w.aimFromCenter(L);
    else w.screenToGround(state.mouse.nx, state.mouse.ny);
    const aim = w.aim;
    if (Math.hypot(aim.x - L.x, aim.z - L.z) > 0.3) L.rot = Math.atan2(aim.x - L.x, aim.z - L.z);
  } else state.local = null;

  const role = myRole();
  const holding = mp && mp[4] & 1;
  $('#crosshair').classList.toggle('on', !!mp && !state.world.overview && (state.locked || state.world.mode === 'first'));
  $('#lockHint').classList.toggle('off', state.locked || !mp || ph === 'decide' || ph === 'gameover');
  updateVoiceSpatial();
  return {
    myCharging: holding ? state.mouse.down : null,
    local: state.local,
    battingTeam: s?.bt,
    celebrateTeam: ph === 'gameover' ? s?.win?.team : null,
    showAim: (role === 'field' && holding) || role === 'bat',
    protectedBases: protectedBases(),
  };
}

const TURN_SPEED = 2.4; // rad/s for Q/E
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// The camera yaw is continuous: it stays behind the player while running across the
// middle (no more flipping at z = 0). It only turns by itself in two calm moments:
// at the start of an innings, and when the player is standing still at a base/post
// without touching the camera — then it eases to face the field.
function updateCameraYaw(dt, L, mp, ph) {
  const w = state.world;
  const k = state.keys;
  if (k.has('KeyQ')) {
    w.yaw += TURN_SPEED * dt;
    state.lastLook = performance.now();
    state.yawGoal = null;
  }
  if (k.has('KeyE')) {
    w.yaw -= TURN_SPEED * dt;
    state.lastLook = performance.now();
    state.yawGoal = null;
  }
  if (ph !== lastYawPhase) {
    if (ph === 'intro') state.yawGoal = faceFieldYaw(L);
    lastYawPhase = ph;
  }
  const idle = L.speed < 0.3 && performance.now() - state.lastLook > 1500;
  if (state.yawGoal == null && idle && ph === 'playing' && state.room) {
    const half = state.room.rules.baseDistance / 2;
    const atBase = Math.abs(Math.abs(L.z) - half) < 2.8 && Math.abs(L.x) < 3;
    if (atBase) {
      const goal = faceFieldYaw(L);
      if (Math.abs(wrapAngle(goal - w.yaw)) > 0.05) w.yaw += wrapAngle(goal - w.yaw) * Math.min(1, dt * 2.2);
    }
  }
  if (state.yawGoal != null) {
    const d = wrapAngle(state.yawGoal - w.yaw);
    w.yaw += d * Math.min(1, dt * 6);
    if (Math.abs(d) < 0.02) state.yawGoal = null;
  }
  w.yaw = wrapAngle(w.yaw);
}
let lastYawPhase = null;

// Yaw that looks from the player's position down the pitch, towards the other base.
function faceFieldYaw(L) {
  const half = (state.room?.rules.baseDistance || 10) / 2;
  const targetZ = L.z < 0 ? half : -half;
  return Math.atan2(-L.x * 0.6, targetZ - L.z);
}

function updateVoiceSpatial() {
  if (!voice.on) return;
  const s = state.snap;
  const proximity = state.room?.phase !== 'lobby' && s?.P && state.local && !state.world?.overview;
  const pos = new Map();
  if (s?.P) for (const p of s.P) pos.set(p[0], { x: p[1], z: p[2] });
  voice.updateSpatial(proximity ? { x: state.local.x, z: state.local.z, yaw: state.world.yaw } : null, pos);
}

function protectedBases() {
  const s = state.snap;
  if (!s?.P || !state.room) return null;
  const half = state.room.rules.baseDistance / 2;
  const held = !!s.B[3];
  const out = [false, false];
  for (const p of s.P) {
    const m = state.members.get(p[0]);
    if (!m || m.team !== s.bt) continue;
    const flags = p[4];
    for (const k of [0, 1]) {
      const z = k === 0 ? -half : half;
      const inside = Math.hypot(p[1], p[2] - z) <= BASE_R;
      if (inside && (flags & 4 || (!(flags & 16) && !(flags & 2) && (p[5] < 0 || !held)))) out[k] = true;
    }
  }
  return out;
}

function sendInput() {
  if (!state.snap || myRole() === 'spec') return;
  const mv = moveVector();
  const aim = state.world.aim;
  send({
    t: 'in',
    mx: +mv.x.toFixed(2),
    mz: +mv.z.toFixed(2),
    ax: +aim.x.toFixed(2),
    az: +aim.z.toFixed(2),
    sp: state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'),
    ch: state.mouse.down,
  });
}

function act(a, extra = {}) {
  const aim = state.world?.aim;
  send({ t: 'act', a, ax: aim?.x, az: aim?.z, ...extra });
}

function chatFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT');
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (!$('#game').classList.contains('active') || chatFocused()) return;
    if (e.code === 'Enter') {
      document.exitPointerLock?.();
      $('#gameChatInput').focus();
      e.preventDefault();
      return;
    }
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    state.keys.add(e.code);
    if (decideKey(e)) return;
    switch (e.code) {
      case 'Space':
        act('clash');
        break;
      case 'KeyF':
        act('touch');
        break;
      case 'KeyR':
        act('reta');
        break;
      case 'KeyN':
        act('nada');
        break;
      case 'KeyP':
        act('patio');
        break;
      case 'KeyL':
        act('licenca');
        break;
      case 'KeyT':
        act('tempo');
        break;
      case 'KeyH':
        $('#helpBox').classList.toggle('hidden');
        break;
      case 'KeyV':
        state.world.overview = !state.world.overview;
        break;
      case 'KeyC':
        state.world.mode = state.world.mode === 'first' ? 'third' : 'first';
        state.world.overview = false;
        toast(state.world.mode === 'first' ? 'Primeira pessoa' : 'Terceira pessoa');
        break;
      case 'KeyX':
        // Quick about-turn (e.g. after crossing to the other base).
        state.yawGoal = wrapAngle(state.world.yaw + Math.PI);
        state.lastLook = performance.now();
        break;
      case 'KeyB':
        if (voice.on) voice.toggleMute();
        break;
      case 'KeyM':
        setMuted(!isMuted());
        toast(isMuted() ? 'Som desligado' : 'Som ligado');
        break;
    }
  });
  window.addEventListener('keyup', (e) => state.keys.delete(e.code));
  window.addEventListener('blur', () => state.keys.clear());
  document.querySelector('[data-close-help]').onclick = () => $('#helpBox').classList.add('hidden');

  const vp = $('#viewport');
  vp.addEventListener('pointermove', (e) => {
    const r = vp.getBoundingClientRect();
    state.mouse.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    state.mouse.ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  });
  vp.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === vp;
    if (!state.locked) state.mouse.down = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked || !state.world) return;
    const w = state.world;
    w.yaw = wrapAngle(w.yaw - e.movementX * 0.0035);
    w.pitch = Math.max(-0.35, Math.min(1.25, w.pitch + e.movementY * 0.0028));
    state.lastLook = performance.now();
    state.yawGoal = null;
  });
  vp.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    document.activeElement?.blur?.();
    if (!state.locked && myPlayer() && vp.requestPointerLock) {
      // First click only grabs the mouse; the next ones play.
      vp.requestPointerLock();
      return;
    }
    const role = myRole();
    if (e.button === 2) {
      act('touch');
      return;
    }
    if (e.button !== 0) return;
    if (role === 'bat') act('swing');
    else if (role === 'field' && myPlayer()?.[4] & 1) {
      state.mouse.down = true;
      state.mouse.chargeStart = performance.now();
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !state.mouse.down) return;
    state.mouse.down = false;
    act('throw', { power: chargePower() });
  });
  vp.addEventListener(
    'wheel',
    (e) => {
      if (!state.world) return;
      state.world.camDist = Math.max(0.55, Math.min(2.2, state.world.camDist * (e.deltaY > 0 ? 1.1 : 0.9)));
    },
    { passive: true },
  );
}

function chargePower() {
  // Power sweeps up and down so holding too long is not free.
  const t = (performance.now() - state.mouse.chargeStart) / 1100;
  const cyc = t % 2;
  return Math.max(0.05, cyc < 1 ? cyc : 2 - cyc);
}

function updatePowerBar() {
  const bar = $('#power');
  if (state.mouse.down && myPlayer()?.[4] & 1) {
    bar.style.display = 'block';
    $('#powerFill').style.width = `${chargePower() * 100}%`;
  } else {
    bar.style.display = 'none';
    if (state.mouse.down && !(myPlayer()?.[4] & 1)) state.mouse.down = false;
  }
  const mp = myPlayer();
  $('#staminaFill').style.width = `${(mp ? mp[8] : 1) * 100}%`;
}

// ------------------------------------------------------------------ snapshots & HUD
let lastPhase = null;
function onSnapshot(s) {
  state.snap = s;
  state.world?.pushSnapshot(s);
  if (s.ev) for (const e of s.ev) onEvent(e);
  if (s.ph !== lastPhase) {
    lastPhase = s.ph;
    state.mouse.down = false;
    // Modals need the cursor back.
    if (['decide', 'paused', 'gameover'].includes(s.ph) && state.locked) document.exitPointerLock?.();
  }
  renderHud(s);
}

function onEvent(e) {
  if (e.to && e.to !== state.myId) return;
  const s = {
    hit: () => sfx.hit(e.q),
    swing: () => sfx.swing(),
    throw: () => sfx.throw(),
    clank: () => sfx.clank(),
    knock: () => sfx.knock(),
    catch: () => sfx.catch(),
    point: () => sfx.point(),
    swap: () => sfx.whistle(),
    vitoria: () => sfx.cheer(),
    win: () => sfx.win(),
    tras: () => sfx.bad(),
    lancha: () => sfx.bad(),
    call: () => sfx.whistle(),
  }[e.k];
  s?.();
  if (!e.text) return;
  const feed = $('#feed');
  const d = document.createElement('div');
  d.textContent = e.text;
  feed.appendChild(d);
  while (feed.children.length > 6) feed.removeChild(feed.firstChild);
  if (['knock', 'swap', 'vitoria', 'win', 'clank', 'point', 'innings', 'tras', 'lancha', 'call'].includes(e.k)) banner(e.text);
}

let bannerTimer;
function banner(text) {
  const b = $('#banner');
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 2400);
}

function teamNames(t) {
  const ids = state.room?.seats[t] || [];
  return ids.map((id) => state.members.get(id)?.name || '?').join(' & ');
}

function renderHud(s) {
  if (!state.room || !s.sc) {
    renderDecide(s);
    return;
  }
  const r = state.room.rules;
  const team = (t) =>
    `<div class="sb-team" style="border-color:${TEAM_COLORS[t]}"><div class="tag" style="color:${TEAM_COLORS[t]}">TIME ${TEAM_NAMES[t].toUpperCase()} · ${
      s.bt === t ? '🏏 NO TACO' : '⚾ NA BOLA'
    }</div><div class="score">${s.sc[t]}</div><div class="names">${esc(teamNames(t))}</div></div>`;
  const dots = (n, lim) => Array.from({ length: lim }, (_, i) => `<span class="${i < n ? 'on' : ''}"></span>`).join('');
  const mid = `<div class="sb-mid">Meta: <b>${r.targetScore}</b> + cruzar<br/>${
    r.paraTrasLimit ? `Pra trás <span class="dots">${dots(s.tr, 3)}</span><br/>` : ''
  }${['tres', 'menos4'].includes(r.lanchaRule) ? `Lancha <span class="dots">${dots(s.ln, 3)}</span>` : ''}</div>`;
  $('#scoreboard').innerHTML = team(0) + mid + team(1);

  const role = myRole();
  const mp = myPlayer();
  let status = '';
  if (s.ph === 'intro') status = 'Preparem-se...';
  else if (s.ph === 'swap') status = 'Trocando os tacos...';
  else if (s.ph === 'final') status = '🏁 De pé sobre os tacos! Lançadores: um único arremesso de onde pegarem a bola.';
  else if (s.ph === 'playing') {
    if (s.re?.s === 'avail') status = role === 'field' ? 'Bola parada entre as casinhas: R para pedir RETA' : role === 'bat' ? 'Bola parada entre as casinhas: N para pedir NADA' : 'Bola parada entre as casinhas';
    else if (s.re) status = 'RETA! Lançamento de onde a bola parou — rebatedor com taco no ombro';
    else if (s.B[4]) status = role === 'field' ? 'Bola no mato! P para gritar "PÁTIO"' : 'Bola no mato! Corram enquanto não gritarem pátio';
    else if (s.rp) status = 'Cruzaram! Agora encostem o taco na base oposta';
    else if (role === 'bat') status = s.ro ? 'Corrida liberada' : 'Bola de volta atrás da base: corrida fechada';
  }
  $('#status').textContent = status;

  const cam = ' · <kbd>Mouse</kbd>/<kbd>Q</kbd><kbd>E</kbd> girar · <kbd>X</kbd> virar · <kbd>C</kbd> 1ª pessoa · <kbd>H</kbd> ajuda';
  const keys = {
    bat: '<kbd>WASD</kbd> mover · <kbd>Shift</kbd> correr · <kbd>Clique</kbd> rebater · <kbd>Espaço</kbd> bater os tacos · <kbd>N</kbd> nada · <kbd>L</kbd> licença' + cam,
    field: '<kbd>WASD</kbd> mover · <kbd>Shift</kbd> correr · <kbd>Segure/solte clique</kbd> lançar · <kbd>F</kbd> queimar · <kbd>R</kbd> reta · <kbd>P</kbd> pátio' + cam,
    spec: '<kbd>V</kbd> câmera · <kbd>H</kbd> regras · <kbd>Enter</kbd> conversar',
  }[role];
  $('#keys').innerHTML = keys;

  let hint = '';
  if (role === 'bat') {
    hint = mp && mp[4] & 2
      ? '<b>Taco no ombro</b> (bete-ombro): não pode rebater este lançamento.'
      : mp && mp[4] & 4
        ? '<b>Licença</b> ativa: sua casinha não pode ser queimada, mas não dá para cruzar. L para voltar.'
        : '<b>Você está no TACO.</b> Taco no chão dentro do círculo protege a casinha (anel verde). Rebata mirando com o mouse, corra até o meio, cruze os tacos lado a lado com seu parceiro e encoste na base oposta: ponto!';
  } else if (role === 'field') {
    hint = mp && mp[4] & 1
      ? '<b>Você está com a bola.</b> De trás da sua base, lance na casinha do outro lado. Casinha desprotegida perto? F queima na mão.'
      : '<b>Você está na BOLA.</b> Busque a bolinha, pegue rebatida no ar para "VITÓRIA!" e volte para trás da base para fechar a corrida.';
  } else hint = '<b>Espectador</b> — assistindo à partida.';
  if (mp && mp[4] & 16) hint = '<b>Bete morto!</b> Você ficou parado demais. Mexa-se para voltar.';
  $('#roleHint').innerHTML = hint;

  // Pause
  const pb = $('#pauseBox');
  if (s.ph === 'paused' && s.pa) {
    pb.classList.remove('hidden');
    pb.innerHTML = `<div class="modal-card"><h2>⏸ TEMPO</h2><p>${esc(s.pa.name)} pediu tempo (licença betes / tempo-para-dois).</p><p>Retoma sozinho em <b>${s.pa.left}s</b>.</p><p class="muted">O time que pediu aperta <kbd>T</kbd> para voltar (os outros podem após 30s).</p></div>`;
  } else pb.classList.add('hidden');

  // Game over
  const ob = $('#overBox');
  if (s.ph === 'gameover' && s.win) {
    if (ob.classList.contains('hidden')) {
      ob.classList.remove('hidden');
      ob.innerHTML = `<div class="modal-card"><h2 style="color:${TEAM_COLORS[s.win.team]}">🏆 Time ${TEAM_NAMES[s.win.team]} venceu!</h2><p>${esc(
        s.win.text,
      )}</p><p><b>${s.sc[0]}</b> × <b>${s.sc[1]}</b></p>${
        isHost() ? '<button class="primary" id="againBtn">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião...</p>'
      } <button id="quitBtn">Sair</button></div>`;
      $('#againBtn')?.addEventListener('click', () => send({ t: 'again' }));
      $('#quitBtn').onclick = () => send({ t: 'leave' });
    }
  } else ob.classList.add('hidden');

  renderDecide(s);
}

// ------------------------------------------------------------------ who starts (decide)
let decideKeyHandler = null;
function decideKey(e) {
  return decideKeyHandler ? decideKeyHandler(e) : false;
}

let balanceGame = null;
let lastDecideSig = '';
function renderDecide(s) {
  const box = $('#decide');
  if (s.ph !== 'decide' || !s.dc) {
    box.classList.add('hidden');
    decideKeyHandler = null;
    balanceGame?.stop();
    balanceGame = null;
    lastDecideSig = '';
    return;
  }
  const d = s.dc;
  const sig = JSON.stringify({ ...d, until: 0, botAt: 0, balanceStart: 0 });
  if (sig === lastDecideSig) return;
  lastDecideSig = sig;
  box.classList.remove('hidden');
  const me = state.myId;
  const capName = (t) => state.members.get(d.captains[t])?.name || '?';
  let html = '';
  decideKeyHandler = null;
  if (d.method === 'molhado') {
    html = `<h2>💧 Molhado ou seco?</h2><p>Um lado do taco foi molhado. O capitão do Time ${TEAM_NAMES[0]} escolhe e o taco é jogado para cima.</p>`;
    if (d.stage === 'choose') {
      html +=
        d.captains[0] === me
          ? `<div class="choices"><button class="primary" data-c="molhado">💧 Molhado</button><button class="primary" data-c="seco">☀️ Seco</button></div>`
          : `<p class="muted">Aguardando ${esc(capName(0))} escolher...</p>`;
    } else if (d.stage === 'flip') html += `<p style="font-size:3rem;animation:spin 0.4s linear infinite">🏏</p><p>Time ${TEAM_NAMES[0]} escolheu <b>${d.choice}</b>. Taco no ar...</p>`;
    else html += `<p>Caiu <b>${d.result}</b>! Time <b>${TEAM_NAMES[d.winner]}</b> começa no taco.</p>`;
  } else if (d.method === 'parimpar') {
    html = `<h2>✋ Par ou ímpar</h2>`;
    if (d.stage === 'choose') {
      const myTeam = d.captains.indexOf(me);
      if (myTeam === 0 && d.numA == null)
        html += `<p>Você é o capitão do Time ${TEAM_NAMES[0]}. Escolha:</p><div class="choices"><button data-par="par" class="${
          (pendingParity || 'par') === 'par' ? 'sel' : ''
        }">Par</button><button data-par="impar" class="${pendingParity === 'impar' ? 'sel' : ''}">Ímpar</button></div><p>e quantos dedos:</p><div class="choices">${[0, 1, 2, 3, 4, 5]
          .map((n) => `<button class="primary" data-n="${n}">${n}</button>`)
          .join('')}</div>`;
      else if (myTeam === 1 && d.numB == null)
        html += `<p>Você é o capitão do Time ${TEAM_NAMES[1]}. Quantos dedos?</p><div class="choices">${[0, 1, 2, 3, 4, 5]
          .map((n) => `<button class="primary" data-n="${n}">${n}</button>`)
          .join('')}</div>`;
      else html += `<p class="muted">Aguardando ${esc(capName(0))} e ${esc(capName(1))}...</p>`;
    } else html += `<p style="font-size:1.5rem">${d.numA} + ${d.numB} = <b>${d.sum}</b></p><p>Time ${TEAM_NAMES[0]} pediu <b>${d.parity === 'par' ? 'par' : 'ímpar'}</b>. Time <b>${TEAM_NAMES[d.winner]}</b> começa no taco.</p>`;
  } else if (d.method === 'palmo') {
    html = `<h2>🖐 Último palmo</h2><p class="muted">Os capitães vão fechando a mão no taco, uma em cima da outra. Quem segurar por último precisa balançar o taco como pêndulo por 10 segundos.</p>`;
    let y = 0;
    const hands = d.hands
      .map((h) => {
        const top = 260 - ((y + h.w) / d.length) * 260;
        y += h.w;
        return `<div class="palmo-hand" style="top:${top}px;height:${(h.w / d.length) * 260 - 2}px;background:${TEAM_COLORS[h.team]}">${TEAM_NAMES[h.team]}</div>`;
      })
      .join('');
    if (d.stage !== 'balance' || d.captains[d.holder] !== me) html += `<div class="palmo-bat">${hands}</div>`;
    if (d.stage === 'hands') {
      if (d.captains[d.turn] === me) {
        html += `<button class="primary big" data-hand>Pôr a mão (Espaço)</button>`;
        decideKeyHandler = (e) => {
          if (e.code === 'Space') {
            send({ t: 'decide', hand: true });
            return true;
          }
          return false;
        };
      } else html += `<p class="muted">Vez de ${esc(capName(d.turn))}...</p>`;
    } else if (d.stage === 'balance') {
      if (d.captains[d.holder] === me) {
        html += `<p><b>Equilibre o taco!</b> Use <kbd>A</kbd>/<kbd>D</kbd> ou o mouse por 10 segundos.</p><div class="balance"><canvas id="balanceCanvas" width="300" height="220"></canvas></div>`;
      } else html += `<p>${esc(capName(d.holder))} está equilibrando o taco...</p>`;
    } else html += `<p>${d.success ? 'Equilibrou!' : 'Deixou cair!'} Time <b>${TEAM_NAMES[d.winner]}</b> começa no taco.</p>`;
  } else html = `<h2>🎲 Sorteio</h2><p>Time <b>${TEAM_NAMES[d.winner]}</b> começa no taco.</p>`;

  box.innerHTML = `<div class="modal-card">${html}</div>`;
  box.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => send({ t: 'decide', choice: b.dataset.c })));
  box.querySelectorAll('[data-par]').forEach(
    (b) =>
      (b.onclick = () => {
        pendingParity = b.dataset.par;
        box.querySelectorAll('[data-par]').forEach((x) => x.classList.toggle('sel', x === b));
      }),
  );
  box.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => send({ t: 'decide', parity: pendingParity || 'par', num: Number(b.dataset.n) })));
  box.querySelector('[data-hand]')?.addEventListener('click', () => send({ t: 'decide', hand: true }));
  const bc = $('#balanceCanvas');
  if (bc && !balanceGame) balanceGame = new BalanceGame(bc, (ok) => send({ t: 'decide', balance: ok }));
  else if (bc && balanceGame) balanceGame.attach(bc);
}
let pendingParity = null;

// Pendulum mini-game for "último palmo".
class BalanceGame {
  constructor(canvas, done) {
    this.done = done;
    this.angle = (Math.random() - 0.5) * 0.2;
    this.vel = 0;
    this.time = 0;
    this.over = false;
    this.attach(canvas);
    this.onMove = (e) => {
      this.mouseX = e.clientX / window.innerWidth - 0.5;
    };
    window.addEventListener('pointermove', this.onMove);
    let last = performance.now();
    const loop = (now) => {
      if (this.over) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.step(dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }
  attach(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
  }
  step(dt) {
    this.time += dt;
    let ctrl = 0;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) ctrl -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) ctrl += 1;
    if (this.mouseX != null) ctrl += this.mouseX * 3;
    // Inverted pendulum: gravity pushes it away from vertical, the hand pushes back.
    const gust = Math.sin(this.time * 2.3) * 0.8 + Math.sin(this.time * 5.1) * 0.5;
    this.vel += (Math.sin(this.angle) * 3.2 + ctrl * 3.4 + gust * 0.6) * dt;
    this.vel *= 0.985;
    this.angle += this.vel * dt;
    if (Math.abs(this.angle) > 1.1) this.finish(false);
    else if (this.time >= 10) this.finish(true);
  }
  draw() {
    const g = this.g;
    g.clearRect(0, 0, 300, 220);
    g.fillStyle = '#ffffff';
    g.font = 'bold 18px system-ui';
    g.textAlign = 'center';
    g.fillText(`${Math.max(0, 10 - this.time).toFixed(1)}s`, 150, 22);
    g.save();
    g.translate(150, 200);
    g.rotate(this.angle);
    g.fillStyle = '#c8955a';
    g.fillRect(-8, -170, 16, 170);
    g.restore();
    g.fillStyle = '#f1c9a5';
    g.beginPath();
    g.arc(150, 200, 14, 0, Math.PI * 2);
    g.fill();
  }
  finish(ok) {
    if (this.over) return;
    this.over = true;
    this.done(ok);
    this.stop();
  }
  stop() {
    this.over = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onMove);
  }
}

// ------------------------------------------------------------------ boot
setupMenu();
setupLobby();
setupInput();
window.__taco = { state, voice }; // debug handle (inspect in the browser console)
connect();
