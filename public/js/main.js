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
  PREMIUM,
  POWERS,
  REWARDS,
  ownsBall,
} from '/shared/config.js';
import { buildAvatar } from './avatar.js';
import { drawBallSkin } from './skins.js';
import { World } from './scene.js';
import { buildScenario, SCENARIO_INFO } from './scenarios.js';
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
    if (p) return { name: p.name || '', avatar: sanitizeAvatar(p.avatar), key: p.key || newKey() };
  } catch {
    /* ignore */
  }
  return { name: '', avatar: defaultAvatar(), key: newKey() };
}

// Secret player key (identifies the wallet on the server). crypto.randomUUID only exists
// in secure contexts, so build a v4 UUID from getRandomValues (works on plain http too).
function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Team label/colour: registered team names during a championship, Azul/Vermelho otherwise.
function tName(t) {
  return state.room?.teamLabels?.[t] || TEAM_NAMES[t];
}
const COLORBLIND_TEAMS = ['#2f80ed', '#f2994a']; // blue x orange: safe for red-green colour blindness
function tColor(t) {
  return state.room?.teamColors?.[t] || (settings.colorblind ? COLORBLIND_TEAMS : TEAM_COLORS)[t];
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
let replacedHere = false;
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
    if (replacedHere) return; // another tab took over this player: do not fight back
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
  let backup = null;
  try {
    backup = JSON.parse(localStorage.getItem('taco-wallet-backup') || 'null');
  } catch {
    /* ignore */
  }
  send({ t: 'profile', name: state.profile.name || 'Jogador', avatar: state.profile.avatar, key: state.profile.key, backup });
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
    case 'me':
      state.me = m.me;
      // Signed copy of the wallet kept in the browser: if the server ever loses its data
      // (deploy without a persistent volume), it restores coins and purchases from it.
      if (m.backup)
        try {
          localStorage.setItem('taco-wallet-backup', JSON.stringify(m.backup));
        } catch {
          /* ignore */
        }
      renderWallet();
      break;
    case 'restored':
      toast('Suas moedas e compras foram restauradas do backup deste navegador ✅');
      break;
    case 'replaced':
      // Same player opened the game somewhere else (new tab or reload behind a proxy).
      replacedHere = true;
      toast('Você abriu o jogo em outra aba/janela. Esta foi desconectada.');
      break;
    case 'closed':
      voice.leave();
      state.room = null;
      document.exitPointerLock?.();
      showScreen('menu');
      history.replaceState(null, '', '/');
      toast(m.msg);
      send({ t: 'list' });
      break;
    case 'bought':
      sfx.point();
      toast('Compra feita! 🛍️');
      break;
    case 'ranking':
      renderRanking(m);
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
  saveProfile(); // persists a freshly generated player key right away
  $('#name').value = state.profile.name;
  for (const b of document.querySelectorAll('[data-open-shop]')) b.onclick = () => (renderShop(), openModal('#shopBox'));
  for (const b of document.querySelectorAll('[data-open-teams]')) b.onclick = () => (renderTeams(), openModal('#teamsBox'));
  for (const b of document.querySelectorAll('[data-open-rank]')) b.onclick = () => send({ t: 'ranking' });
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
      // Premium options can be tried on in the preview, but the server only keeps them once bought.
      const price = PREMIUM[key]?.[idx];
      const locked = price && !owned().includes(`${key}:${idx}`);
      el.innerHTML = `<div class="label">${esc(def.label)} · ${idx + 1}/${def.options.length}</div><div class="row"><button data-d="-1">◀</button><span class="value">${
        locked ? '🔒 ' : ''
      }${esc(def.options[idx])}</span><button data-d="1">▶</button></div>${
        locked ? `<button class="primary buy-inline" data-buy="${key}:${idx}">Comprar por 🪙 ${price}</button>` : ''
      }`;
      el.querySelectorAll('[data-d]').forEach(
        (b) => (b.onclick = () => setPart(key, (idx + Number(b.dataset.d) + def.options.length) % def.options.length)),
      );
      el.querySelector('[data-buy]')?.addEventListener('click', () => send({ t: 'buy', item: `${key}:${idx}` }));
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
  state.members = new Map(
    m.members.map((x) => {
      const team = teamOf(x.id);
      return [x.id, { ...x, team, color: team == null ? '#fff' : tColor(team) }];
    }),
  );
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
    state.world.setScenario(m.rules.scenario);
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
    div.innerHTML = `<h4 style="color:${tColor(t)}">Time ${tName(t)}</h4>`;
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
    if (key === 'scenario') continue; // chosen in step 1
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
    drawBallSwatch(c, k);
    const mine = ownsBall(k, owned());
    b.appendChild(c);
    b.appendChild(document.createTextNode((mine ? '' : `🔒 🪙${PREMIUM.ball[k]} `) + label));
    if (!mine) b.classList.add('locked');
    b.onclick = () => (mine ? send({ t: 'ballSkin', skin: k }) : (shopTab = 'ball', renderShop(), openModal('#shopBox')));
    bs.appendChild(b);
  }
  renderSetup();
  const champMode = r.mode === 'champ';
  $('#startGame').classList.toggle('hidden', champMode);
  $('#champPanel').classList.toggle('hidden', !champMode);
  $('#startGame').disabled = !host || !!r.champ;
  $('#hostHint').textContent = host ? 'Você é o anfitrião.' : 'Aguardando o anfitrião começar a partida.';
  renderChampPanel();
}

// ------------------------------------------------------------------ room setup wizard
const MAPS = [
  ['campinho', 'Campinho', 'Grama de várzea, cerca de madeira e mato em volta.'],
  ['rua', 'Rua de bairro', 'Asfalto, calçadas e muros. A bola rola longe.'],
  ['sitio', 'Sítio', 'Terreiro de terra, celeiro, milharal e vacas.'],
  ['mercado', 'Estacionamento', 'Vagas pintadas, carros e o supermercado ao fundo.'],
  ['praia', 'Praia', 'Areia fofa, coqueiros e o mar. A bola para rápido.'],
];
const MODES = [
  ['single', '⚔️', 'Partida única', 'Um jogo 2 contra 2. Vagas vazias viram bots.'],
  ['champ', '🏆', 'Campeonato', 'Duplas registradas, todos contra todos. 1º, 2º e 3º ganham moedas.'],
];
const STEPS = ['Mapa', 'Modo', 'Regras e jogadores'];

function renderSetup() {
  const r = state.room;
  const host = isHost();
  const step = r.champ ? 3 : r.setupStep || 1;
  $('#stepper').innerHTML = STEPS.map(
    (label, i) =>
      `<button class="step-pill ${i + 1 === step ? 'on' : ''} ${i + 1 < step ? 'done' : ''}" data-step="${i + 1}" ${host && !r.champ && i + 1 < step ? '' : 'disabled'}>${i + 1}. ${label}</button>`,
  ).join('<span class="step-sep">›</span>');
  $('#stepper').querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => send({ t: 'setup', step: Number(b.dataset.step) })));
  $('#stepMap').classList.toggle('hidden', step !== 1);
  $('#stepMode').classList.toggle('hidden', step !== 2);
  $('#stepRules').classList.toggle('hidden', step !== 3);
  const wait = host ? '' : `<p class="muted center">Aguardando o anfitrião escolher…</p>`;
  if (step === 1) {
    $('#stepMap').innerHTML = `<h2 class="center">Escolha o mapa</h2>${wait}<div class="map-grid">${MAPS.map(
      ([k, name, desc]) =>
        `<button class="map-card ${r.rules.scenario === k ? 'sel' : ''}" data-map="${k}" ${host ? '' : 'disabled'}><img alt="" src="${scenarioThumb(k)}" /><b>${name}</b><span>${desc}</span></button>`,
    ).join('')}</div>`;
    $('#stepMap').querySelectorAll('[data-map]').forEach((b) => (b.onclick = () => send({ t: 'setup', scenario: b.dataset.map, step: 2 })));
  } else if (step === 2) {
    const map = MAPS.find(([k]) => k === r.rules.scenario);
    $('#stepMode').innerHTML = `<h2 class="center">Partida única ou campeonato?</h2><p class="center muted">Mapa: <b>${map ? map[1] : ''}</b></p>${wait}<div class="map-grid modes">${MODES.map(
      ([k, icon, name, desc]) =>
        `<button class="map-card mode-card ${r.mode === k ? 'sel' : ''}" data-mode="${k}" ${host ? '' : 'disabled'}><span class="mode-icon">${icon}</span><b>${name}</b><span>${desc}</span></button>`,
    ).join('')}</div>`;
    $('#stepMode').querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => send({ t: 'setup', mode: b.dataset.mode, step: 3 })));
  } else {
    const map = MAPS.find(([k]) => k === r.rules.scenario);
    const mode = MODES.find(([k]) => k === r.mode);
    $('#setupSummary').innerHTML = `<img alt="" src="${scenarioThumb(r.rules.scenario)}" /><div><b>${map ? map[1] : ''}</b><br/><span class="muted small">${mode ? `${mode[1]} ${mode[2]}` : ''}</span></div>`;
  }
}

// Square map previews rendered once from the real scenario builders.
const thumbCache = new Map();
let thumbRenderer = null;
function scenarioThumb(name) {
  if (thumbCache.has(name)) return thumbCache.get(name);
  try {
    if (!thumbRenderer) {
      thumbRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      thumbRenderer.setSize(360, 270);
      thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENARIO_INFO[name]?.sky || '#9fd3f5');
    scene.add(new THREE.HemisphereLight('#ffffff', '#4a6b3a', 1));
    const sun = new THREE.DirectionalLight('#fff4d6', 1.5);
    sun.position.set(18, 30, 10);
    scene.add(sun);
    scene.add(buildScenario(name));
    const cam = new THREE.PerspectiveCamera(50, 360 / 270, 0.1, 400);
    cam.position.set(-34, 30, -26);
    cam.lookAt(0, 0, 4);
    thumbRenderer.render(scene, cam);
    const url = thumbRenderer.domElement.toDataURL('image/jpeg', 0.85);
    thumbCache.set(name, url);
    return url;
  } catch {
    return '';
  }
}

const champPick = new Set();
function renderChampPanel() {
  const r = state.room;
  const box = $('#champPanel');
  const host = isHost();
  if (r.champ) {
    box.innerHTML = `<h3>🏆 Campeonato em andamento</h3>${champHtml(r.champ)}${host ? '<button class="ghost" id="champCancel">Encerrar campeonato</button>' : ''}`;
    $('#champCancel')?.addEventListener('click', () => confirm('Encerrar o campeonato sem premiação?') && send({ t: 'champCancel' }));
    return;
  }
  const teams = r.teams || [];
  for (const id of [...champPick]) if (!teams.some((t) => t.id === id)) champPick.delete(id);
  box.innerHTML = `<h3>🏆 Campeonato</h3>
    <p class="muted small">Todos contra todos entre as duplas registradas (botão "Meus times" no menu). 1º, 2º e 3º lugares ganham moedas.</p>
    ${
      teams.length
        ? teams
            .map(
              (t) =>
                `<label class="champ-pick"><input type="checkbox" data-team="${t.id}" ${champPick.has(t.id) ? 'checked' : ''} ${host ? '' : 'disabled'} /> <b style="color:${t.color}">${esc(
                  t.name,
                )}</b> <span class="muted small">${t.members.map((m) => esc(m.name)).join(' & ')}</span></label>`,
            )
            .join('')
        : '<p class="muted small">Nenhum time com jogador nesta sala.</p>'
    }
    ${host ? `<button class="primary" id="champStart" ${champPick.size < 2 ? 'disabled' : ''}>Iniciar campeonato (${champPick.size} times)</button>` : ''}`;
  box.querySelectorAll('[data-team]').forEach(
    (c) =>
      (c.onchange = () => {
        if (c.checked) champPick.add(c.dataset.team);
        else champPick.delete(c.dataset.team);
        renderChampPanel();
      }),
  );
  $('#champStart')?.addEventListener('click', () => send({ t: 'champStart', teamIds: [...champPick] }));
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

// ------------------------------------------------------------------ wallet, shop, teams, ranking
function owned() {
  return state.me?.owned || [];
}

function renderWallet() {
  const coins = state.me ? state.me.coins : '…';
  for (const el of document.querySelectorAll('.wallet')) el.textContent = `🪙 ${coins}`;
  renderCustomizer();
  if (!$('#shopBox').classList.contains('hidden')) renderShop();
  if (!$('#teamsBox').classList.contains('hidden')) renderTeams();
  if (state.room?.phase === 'lobby') renderLobby();
}

let shopTab = 'ball';
function openModal(id) {
  document.exitPointerLock?.();
  $(id).classList.remove('hidden');
}
function renderShop() {
  const coins = state.me?.coins ?? 0;
  const own = owned();
  const tabs = [
    ['ball', 'Bolinhas'],
    ['bat', 'Tacos'],
    ['hat', 'Chapéus'],
    ['power', 'Poderes'],
  ];
  let items = [];
  if (shopTab === 'ball')
    items = BALL_SKINS.filter(([k]) => PREMIUM.ball[k]).map(([k, label]) => ({ id: `ball:${k}`, name: label, price: PREMIUM.ball[k], ball: k }));
  else if (shopTab === 'power') items = POWERS.map((p) => ({ id: `power:${p.id}`, name: p.name, desc: p.desc, price: p.price, power: p.id }));
  else
    items = Object.entries(PREMIUM[shopTab]).map(([i, price]) => ({
      id: `${shopTab}:${i}`,
      name: AVATAR_PARTS[shopTab].options[i],
      price,
      part: shopTab,
      idx: Number(i),
    }));
  const off = state.me?.powersOff || [];
  $('#shopBody').innerHTML = `
    <div class="shop-head"><h2>🛒 Loja</h2><span class="wallet big-wallet">🪙 ${coins}</span></div>
    <p class="muted small">Ganhe moedas jogando: vitória +${REWARDS.win}, derrota +${REWARDS.loss}. Campeonato: 1º +${REWARDS.champ[0]}, 2º +${REWARDS.champ[1]}, 3º +${REWARDS.champ[2]} para cada jogador da dupla.</p>
    <div class="choices">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === shopTab ? 'sel' : ''}">${l}</button>`).join('')}</div>
    <div class="shop-grid">${items
      .map((it) => {
        const has = own.includes(it.id);
        let action = has ? '<span class="ok">✔ Seu</span>' : `<button class="primary" data-buy="${it.id}" ${coins < it.price ? 'disabled' : ''}>🪙 ${it.price}</button>`;
        if (has && it.power)
          action = `<button data-ptoggle="${it.power}">${off.includes(it.power) ? '⏸ Desligado' : '✅ Ativo'}</button>`;
        if (has && it.part) action = `<button data-equip="${it.part}:${it.idx}">Usar</button>`;
        return `<div class="shop-item">${it.ball ? `<canvas data-ball="${it.ball}" width="64" height="64"></canvas>` : `<div class="shop-icon">${it.power ? { folego: '🏃', mira: '🎯', danca: '💃' }[it.power] : it.part === 'bat' ? '🏏' : '🎩'}</div>`}<b>${esc(
          it.name,
        )}</b>${it.desc ? `<span class="muted small">${esc(it.desc)}</span>` : ''}${action}</div>`;
      })
      .join('')}</div>
    <button class="ghost" data-close>Fechar</button>`;
  const body = $('#shopBody');
  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((shopTab = b.dataset.tab), renderShop())));
  body.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => send({ t: 'buy', item: b.dataset.buy })));
  body.querySelectorAll('[data-ptoggle]').forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.ptoggle;
        const offNew = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
        send({ t: 'powers', off: offNew });
      }),
  );
  body.querySelectorAll('[data-equip]').forEach(
    (b) =>
      (b.onclick = () => {
        const [part, idx] = b.dataset.equip.split(':');
        setPart(part, Number(idx));
        toast('Equipado!');
      }),
  );
  body.querySelectorAll('canvas[data-ball]').forEach((c) => drawBallSwatch(c, c.dataset.ball));
  body.querySelector('[data-close]').onclick = () => $('#shopBox').classList.add('hidden');
}

function drawBallSwatch(c, k) {
  const g = c.getContext('2d');
  g.save();
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.clip();
  g.drawImage(drawBallSkin(k), 0, 0, 128, 128, 0, 0, 64, 64);
  const grd = g.createRadialGradient(22, 20, 4, 32, 32, 34);
  grd.addColorStop(0, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.restore();
}

function renderTeams() {
  const teams = state.me?.teams || [];
  $('#teamsBody').innerHTML = `
    <h2>👥 Meus times (duplas)</h2>
    <p class="muted small">Crie uma dupla e passe o código para o seu parceiro entrar. Times com alguém na sala podem disputar campeonatos.</p>
    ${
      teams.length
        ? teams
            .map(
              (t) => `<div class="team-card" style="border-color:${t.color}"><div><b style="color:${t.color}">${esc(t.name)}</b> · código <span class="code">${esc(t.code)}</span><br/>
        <span class="small">${t.members.map((m) => esc(m.name)).join(' & ')}${t.members.length < 2 ? ' <span class="muted">(falta o parceiro)</span>' : ''}</span><br/>
        <span class="muted small">🏆 ${t.titles} títulos · ${t.wins}/${t.games} vitórias</span></div><button class="ghost" data-leave="${t.id}">Sair</button></div>`,
            )
            .join('')
        : '<p class="muted">Você ainda não tem time.</p>'
    }
    <div class="join-row"><input id="teamName" maxlength="20" placeholder="Nome do novo time" /><button class="primary" id="teamCreate">Criar</button></div>
    <div class="join-row"><input id="teamCode" maxlength="5" placeholder="CÓDIGO" /><button id="teamJoin">Entrar no time</button></div>
    <button class="ghost" data-close>Fechar</button>`;
  const body = $('#teamsBody');
  body.querySelectorAll('[data-leave]').forEach((b) => (b.onclick = () => confirm('Sair desse time?') && send({ t: 'teamLeave', id: b.dataset.leave })));
  $('#teamCreate').onclick = () => {
    const name = $('#teamName').value.trim();
    if (name) send({ t: 'teamCreate', name });
  };
  $('#teamJoin').onclick = () => send({ t: 'teamJoin', code: $('#teamCode').value });
  body.querySelector('[data-close]').onclick = () => $('#teamsBox').classList.add('hidden');
}

function renderRanking(r) {
  const medals = ['🥇', '🥈', '🥉'];
  $('#rankBody').innerHTML = `
    <h2>🏆 Ranking</h2>
    <div class="rank-grid">
      <div><h3>Times</h3><ol>${r.teams.map((t) => `<li><b style="color:${t.color}">${esc(t.name)}</b> — ${t.titles} 🏆 · ${t.wins} vitórias</li>`).join('') || '<li class="muted">—</li>'}</ol></div>
      <div><h3>Jogadores</h3><ol>${r.players.map((p) => `<li>${esc(p.name)} — ${p.titles} 🏆 · ${p.wins}/${p.games}</li>`).join('') || '<li class="muted">—</li>'}</ol></div>
    </div>
    <h3>Últimos campeonatos</h3>
    <ul>${r.championships.map((c) => `<li>${new Date(c.at).toLocaleDateString(undefined)}: ${c.podium.map((n, i) => `${medals[i]} ${esc(n)}`).join(' ')}</li>`).join('') || '<li class="muted">Nenhum ainda</li>'}</ul>
    <button class="ghost" data-close>Fechar</button>`;
  $('#rankBody [data-close]').onclick = () => $('#rankBox').classList.add('hidden');
  openModal('#rankBox');
}

// Championship table (lobby side panel and end-of-match modal).
function champHtml(c) {
  const medals = ['🥇', '🥈', '🥉'];
  const rows = c.table
    .map(
      (r, i) =>
        `<tr><td>${c.done && i < 3 ? medals[i] : i + 1}</td><td><b style="color:${r.color}">${esc(r.name)}</b></td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf - r.pa}</td></tr>`,
    )
    .join('');
  const games = c.matches
    .map((m, i) => {
      const A = c.teams[m.a];
      const B = c.teams[m.b];
      const res = m.r ? `${m.r.sa} × ${m.r.sb}` : i === c.idx && !c.done ? '<b>agora</b>' : 'vs';
      return `<li>${esc(A.name)} ${res} ${esc(B.name)}</li>`;
    })
    .join('');
  return `<table class="champ-table"><tr><th>#</th><th>Time</th><th>Pts</th><th>V</th><th>D</th><th>Saldo</th></tr>${rows}</table><ul class="champ-games">${games}</ul>`;
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
  applySettings();
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
  $('#crosshair').classList.toggle('on', !!mp && !state.world.overview && (settings.fixedCrosshair || state.locked || state.world.mode === 'first'));
  updateVignette(dt);
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

const TURN_SPEED = 1.6; // rad/s for Q/E
// Camera settings, saved per browser. sens 1 = same as the desktop cursor.
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const SETTINGS_DEFAULT = {
  // camera & mouse
  sens: 1,
  invertY: false,
  dist: 1,
  fov: 55,
  autoFace: !prefersReducedMotion,
  // accessibility / comfort (motion sickness)
  reduceMotion: prefersReducedMotion, // no automatic camera turns, no screen animations, no ball trail
  snapTurn: false, // Q/E and X turn in instant steps instead of a smooth rotation
  smoothing: 0, // 0 = camera glued to the player (no sway); higher = softer follow
  vignette: false, // darken the screen edges while moving/turning
  fixedCrosshair: false, // always-visible centre dot (stable visual reference)
  hudScale: 1,
  colorblind: false, // blue x orange team colours
};
const settings = loadSettings();
function loadSettings() {
  try {
    const v = JSON.parse(localStorage.getItem('taco-settings') || '{}');
    const old = Number(localStorage.getItem('taco-sens'));
    if (old && !v.sens) v.sens = old;
    return { ...SETTINGS_DEFAULT, ...v };
  } catch {
    return { ...SETTINGS_DEFAULT };
  }
}
function saveSettings() {
  try {
    localStorage.setItem('taco-settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
function applySettings() {
  document.body.classList.toggle('reduce-motion', settings.reduceMotion);
  document.documentElement.style.setProperty('--hud-scale', String(settings.hudScale));
  const w = state.world;
  if (!w) return;
  w.camDist = settings.dist;
  w.smoothing = settings.smoothing;
  w.reduceMotion = settings.reduceMotion;
  if (w.camera.fov !== settings.fov) {
    w.camera.fov = settings.fov;
    w.camera.updateProjectionMatrix();
  }
}
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
  if (!settings.snapTurn) {
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
  }
  if (ph !== lastYawPhase) {
    if (ph === 'intro') state.yawGoal = faceFieldYaw(L);
    lastYawPhase = ph;
  }
  const idle = settings.autoFace && !settings.reduceMotion && L.speed < 0.3 && performance.now() - state.lastLook > 1500;
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
    // Comfort: jump straight to the new direction instead of a sweeping rotation.
    if (settings.reduceMotion || settings.snapTurn) {
      w.yaw = state.yawGoal;
      state.yawGoal = null;
    } else {
      w.yaw += d * Math.min(1, dt * 6);
      if (Math.abs(d) < 0.02) state.yawGoal = null;
    }
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

// Comfort vignette: the faster the view moves or turns, the darker the screen edges.
let lastYawV = 0;
let vignetteLevel = 0;
function updateVignette(dt) {
  const el = $('#vignette');
  if (!settings.vignette || !state.world || dt <= 0) {
    el.style.opacity = '0';
    return;
  }
  const turn = Math.abs(wrapAngle(state.world.yaw - lastYawV)) / dt;
  lastYawV = state.world.yaw;
  const move = state.local ? state.local.speed / 7.6 : 0;
  const target = Math.min(0.85, turn * 0.35 + move * 0.55);
  vignetteLevel += (target - vignetteLevel) * Math.min(1, dt * 8);
  el.style.opacity = vignetteLevel.toFixed(2);
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
    if (e.code === 'Escape') {
      // With the mouse captured the browser uses Esc to release it; the next Esc opens the menu.
      if (!state.locked && myPlayer()) toggleGameMenu();
      return;
    }
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
      case 'KeyQ':
      case 'KeyE':
        if (settings.snapTurn) {
          // Snap turn: 45° steps, no visible rotation.
          state.world.yaw = wrapAngle(state.world.yaw + (e.code === 'KeyQ' ? 1 : -1) * (Math.PI / 4));
          state.lastLook = performance.now();
          state.yawGoal = null;
        }
        break;
      case 'BracketLeft':
      case 'BracketRight':
        settings.sens = Math.max(0.2, Math.min(3, +(settings.sens + (e.code === 'BracketRight' ? 0.1 : -0.1)).toFixed(2)));
        settingsChanged();
        toast(`Sensibilidade ${settings.sens.toFixed(2)}×`);
        break;
      case 'KeyG':
        if (state.room?.members.find((m) => m.id === state.myId)?.powers.includes('danca')) send({ t: 'dance' });
        else toast('Compre a Dancinha na loja para dançar 💃');
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
  $('#menuBtn').onclick = () => toggleGameMenu();
  for (const b of document.querySelectorAll('[data-open-options]')) b.onclick = () => openOptions();
  applySettings();
  document.querySelectorAll('[data-menu]').forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.menu;
        $('#gameMenu').classList.add('hidden');
        if (a === 'options') openOptions();
        else if (a === 'surrender') send({ t: 'surrender' });
        else if (a === 'leave' && confirm('Sair da partida? Um bot vai jogar no seu lugar.')) send({ t: 'leave' });
      }),
  );

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
    // Same feel as the desktop cursor: dragging the mouse across the whole screen turns
    // the view by the horizontal field of view (movementX already carries the OS mouse
    // speed/acceleration). The menu slider scales it.
    const vfov = (w.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * w.camera.aspect);
    const k = (hfov / Math.max(1, window.innerWidth)) * settings.sens;
    w.yaw = wrapAngle(w.yaw - e.movementX * k);
    w.pitch = Math.max(-0.35, Math.min(1.25, w.pitch + e.movementY * k * (settings.invertY ? -1 : 1)));
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
      settings.dist = Math.max(0.55, Math.min(2.2, settings.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
      settingsChanged();
    },
    { passive: true },
  );
}

// Options screen: opened from the start menu, the room and Esc → Opções in a match.
let optionsTab = 'camera';
const OPTION_TABS = [
  ['camera', '🖱️ Câmera e mouse'],
  ['access', '♿ Acessibilidade'],
];
const RANGE_FIELDS = {
  camera: [
    ['sens', 'Sensibilidade do mouse', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`, '1× = igual ao cursor do PC (a velocidade do mouse do sistema também vale). Atalhos: [ e ].'],
    ['dist', 'Distância da câmera', 0.55, 2.2, 0.05, (v) => `${v.toFixed(2)}×`, 'Também muda com a roda do mouse.'],
    ['fov', 'Campo de visão', 45, 90, 1, (v) => `${v}°`, 'Valores maiores costumam enjoar menos.'],
  ],
  access: [
    ['smoothing', 'Suavização da câmera', 0, 0.9, 0.05, (v) => (v ? `${Math.round(v * 100)}%` : 'desligada'), '0 = câmera presa ao boneco, sem balanço (recomendado para quem enjoa).'],
    ['hudScale', 'Tamanho do texto e da interface', 0.8, 1.6, 0.05, (v) => `${Math.round(v * 100)}%`, ''],
  ],
};
const CHECK_FIELDS = {
  camera: [
    ['invertY', 'Inverter eixo vertical', ''],
    ['autoFace', 'Parado na base, a câmera vira sozinha para o campo', ''],
  ],
  access: [
    ['reduceMotion', 'Reduzir movimento (enjoo / motion sickness)', 'Sem giros automáticos da câmera, viradas instantâneas, sem rastro da bola e sem animações de tela.'],
    ['snapTurn', 'Giro em passos (Q/E viram 45° na hora)', 'Evita a rotação contínua da imagem.'],
    ['vignette', 'Vinheta de conforto ao mover/girar', 'Escurece as bordas da tela durante o movimento.'],
    ['fixedCrosshair', 'Ponto fixo no centro da tela', 'Uma referência estável ajuda o cérebro a não enjoar.'],
    ['colorblind', 'Cores para daltonismo (azul × laranja)', 'Troca o vermelho do segundo time por laranja.'],
  ],
};

function openOptions(tab) {
  if (tab) optionsTab = tab;
  renderOptions();
  openModal('#optionsBox');
}

function renderOptions() {
  const ranges = RANGE_FIELDS[optionsTab];
  const checks = CHECK_FIELDS[optionsTab];
  $('#optionsBody').innerHTML = `
    <h2>⚙️ Opções</h2>
    <div class="choices">${OPTION_TABS.map(([k, l]) => `<button data-otab="${k}" class="${k === optionsTab ? 'sel' : ''}">${l}</button>`).join('')}</div>
    ${optionsTab === 'access' ? '<p class="muted small">Sente enjoo jogando em 3D? Ligue "Reduzir movimento", deixe a suavização em 0, aumente o campo de visão e experimente a vinheta e o ponto fixo.</p>' : ''}
    ${ranges
      .map(
        ([k, label, min, max, step, , hint]) =>
          `<label class="sens">${label} <b data-val="${k}"></b><input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" />${hint ? `<span class="muted small">${hint}</span>` : ''}</label>`,
      )
      .join('')}
    ${checks
      .map(([k, label, hint]) => `<label class="check"><input type="checkbox" data-check="${k}" /> <span>${label}${hint ? `<br/><span class="muted small">${hint}</span>` : ''}</span></label>`)
      .join('')}
    ${optionsTab === 'camera' ? '<p class="muted small">Pré-visualização: as mudanças valem na hora, inclusive no meio da partida.</p>' : ''}
    <div class="choices"><button class="ghost" data-reset>Restaurar padrão</button><button class="primary" data-close>Pronto</button></div>`;
  const body = $('#optionsBody');
  body.querySelectorAll('[data-otab]').forEach((b) => (b.onclick = () => ((optionsTab = b.dataset.otab), renderOptions())));
  body.querySelectorAll('[data-set]').forEach(
    (inp) =>
      (inp.oninput = () => {
        settings[inp.dataset.set] = Number(inp.value);
        settingsChanged();
      }),
  );
  body.querySelectorAll('[data-check]').forEach(
    (inp) =>
      (inp.onchange = () => {
        settings[inp.dataset.check] = inp.checked;
        settingsChanged();
      }),
  );
  body.querySelector('[data-reset]').onclick = () => {
    Object.assign(settings, SETTINGS_DEFAULT);
    settingsChanged();
  };
  body.querySelector('[data-close]').onclick = () => $('#optionsBox').classList.add('hidden');
  syncSettingsPanel();
}

function settingsChanged() {
  applySettings();
  saveSettings();
  syncSettingsPanel();
  // Team colours may have changed (colour-blind palette).
  if (state.room) {
    for (const m of state.members.values()) if (m.team != null) m.color = tColor(m.team);
    if (state.room.phase === 'lobby') renderLobby();
    else state.world?.syncRoster(state.members, state.room.seats.flat().filter(Boolean), state.myId);
  }
}

function syncSettingsPanel() {
  const box = $('#optionsBody');
  if (!box) return;
  for (const fields of Object.values(RANGE_FIELDS))
    for (const [k, , , , , fmt] of fields) {
      const inp = box.querySelector(`[data-set="${k}"]`);
      if (inp) inp.value = String(settings[k]);
      const val = box.querySelector(`[data-val="${k}"]`);
      if (val) val.textContent = fmt(settings[k]);
    }
  box.querySelectorAll('[data-check]').forEach((inp) => (inp.checked = !!settings[inp.dataset.check]));
}

function toggleGameMenu() {
  const m = $('#gameMenu');
  const open = m.classList.contains('hidden');
  m.classList.toggle('hidden', !open);
  if (open) document.exitPointerLock?.();
  m.querySelector('[data-menu="surrender"]').disabled = !['playing', 'paused', 'intro', 'swap', 'final', 'decide'].includes(state.snap?.ph);
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
    `<div class="sb-team" style="border-color:${tColor(t)}"><div class="tag" style="color:${tColor(t)}">TIME ${tName(t).toUpperCase()} · ${
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
    if (s.pen?.s === 'wait') status = '⚽ Lancha! Preparando o pênalti…';
    else if (s.pen?.s === 'armed')
      status =
        s.pen.by === state.myId
          ? '⚽ PÊNALTI: mire na casinha e lance (segure e solte o clique)'
          : role === 'bat'
            ? '⚽ PÊNALTI de perto! Defenda a casinha — ninguém corre até o lançamento'
            : '⚽ PÊNALTI de perto na casinha';
    else if (s.re?.s === 'avail') status = role === 'field' ? 'Bola parada entre as casinhas: R para pedir RETA' : role === 'bat' ? 'Bola parada entre as casinhas: N para pedir NADA' : 'Bola parada entre as casinhas';
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

  // Surrender request
  const sb = $('#surrenderBox');
  if (s.sr) {
    const mine = s.sr.partner === state.myId;
    const asked = s.sr.by === state.myId;
    // Build the prompt once per request; only the countdown changes afterwards, so the
    // buttons are never replaced under the player's mouse.
    const sig = `${s.sr.by}:${mine}`;
    if (sb.dataset.sig === sig) {
      const left = sb.querySelector('.sr-left');
      if (left) left.textContent = s.sr.left;
    } else {
      sb.dataset.sig = sig;
      sb.classList.remove('hidden');
      sb.innerHTML = mine
        ? `<div class="modal-card"><h2>🏳️ Rendição?</h2><p><b>${esc(s.sr.name)}</b> quer se render. O outro time vence a partida.</p><p class="muted small"><span class="sr-left">${s.sr.left}</span>s para responder</p><div class="choices"><button class="primary" data-sr="1">Aceitar</button><button data-sr="0">Recusar e continuar</button></div></div>`
        : `<div class="modal-card"><p>🏳️ ${asked ? 'Você pediu' : `${esc(s.sr.name)} pediu`} rendição — aguardando o parceiro (<span class="sr-left">${s.sr.left}</span>s)</p></div>`;
      sb.querySelectorAll('[data-sr]').forEach((b) => (b.onclick = () => send({ t: 'surrenderVote', yes: b.dataset.sr === '1' })));
      if (mine) document.exitPointerLock?.();
    }
  } else if (!sb.classList.contains('hidden')) {
    sb.classList.add('hidden');
    sb.dataset.sig = '';
  }

  // Game over
  const ob = $('#overBox');
  if (s.ph === 'gameover' && s.win) {
    const champ = state.room.champ;
    const sig = JSON.stringify([s.win, champ?.idx, champ?.done, champ?.table]);
    if (ob.classList.contains('hidden') || ob.dataset.sig !== sig) {
      ob.dataset.sig = sig;
      ob.classList.remove('hidden');
      const next = champ ? (champ.done ? 'Encerrar e voltar para a sala' : 'Próxima partida do campeonato') : 'Voltar para a sala';
      const podium = champ?.done
        ? `<div class="podium">${champ.table
            .slice(0, 3)
            .map((r, i) => `<div class="p${i + 1}" style="border-color:${r.color}"><span>${['🥇', '🥈', '🥉'][i]}</span><b>${esc(r.name)}</b><small>+${REWARDS.champ[i]} 🪙</small></div>`)
            .join('')}</div>`
        : '';
      ob.innerHTML = `<div class="modal-card ${champ ? 'wide' : ''}"><h2 style="color:${tColor(s.win.team)}">🏆 ${esc(tName(s.win.team))} venceu!</h2><p>${esc(
        s.win.text,
      )}</p><p><b>${s.sc[0]}</b> × <b>${s.sc[1]}</b></p>${champ ? `${podium}${champHtml(champ)}` : ''}<p class="muted small">Dancinha comprada? Aperte <kbd>G</kbd> para comemorar.</p>${
        isHost() ? `<button class="primary" id="againBtn">${next}</button>` : '<p class="muted">Aguardando o anfitrião...</p>'
      } <button id="quitBtn">Sair da sala</button></div>`;
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
    html = `<h2>💧 Molhado ou seco?</h2><p>Um lado do taco foi molhado. O capitão do Time ${tName(0)} escolhe e o taco é jogado para cima.</p>`;
    if (d.stage === 'choose') {
      html +=
        d.captains[0] === me
          ? `<div class="choices"><button class="primary" data-c="molhado">💧 Molhado</button><button class="primary" data-c="seco">☀️ Seco</button></div>`
          : `<p class="muted">Aguardando ${esc(capName(0))} escolher...</p>`;
    } else if (d.stage === 'flip') html += `<div class="flip-stage"><span class="flip-bat">🏏</span></div><p>Time ${tName(0)} escolheu <b>${d.choice}</b>. Taco no ar...</p>`;
    else html += `<p>Caiu <b>${d.result}</b>! Time <b>${tName(d.winner)}</b> começa no taco.</p>`;
  } else if (d.method === 'parimpar') {
    html = `<h2>✋ Par ou ímpar</h2>`;
    if (d.stage === 'choose') {
      const myTeam = d.captains.indexOf(me);
      if (myTeam === 0 && d.numA == null)
        html += `<p>Você é o capitão do Time ${tName(0)}. Escolha:</p><div class="choices"><button data-par="par" class="${
          (pendingParity || 'par') === 'par' ? 'sel' : ''
        }">Par</button><button data-par="impar" class="${pendingParity === 'impar' ? 'sel' : ''}">Ímpar</button></div><p>e quantos dedos:</p><div class="choices">${[0, 1, 2, 3, 4, 5]
          .map((n) => `<button class="primary" data-n="${n}">${n}</button>`)
          .join('')}</div>`;
      else if (myTeam === 1 && d.numB == null)
        html += `<p>Você é o capitão do Time ${tName(1)}. Quantos dedos?</p><div class="choices">${[0, 1, 2, 3, 4, 5]
          .map((n) => `<button class="primary" data-n="${n}">${n}</button>`)
          .join('')}</div>`;
      else html += `<p class="muted">Aguardando ${esc(capName(0))} e ${esc(capName(1))}...</p>`;
    } else html += `<p style="font-size:1.5rem">${d.numA} + ${d.numB} = <b>${d.sum}</b></p><p>Time ${tName(0)} pediu <b>${d.parity === 'par' ? 'par' : 'ímpar'}</b>. Time <b>${tName(d.winner)}</b> começa no taco.</p>`;
  } else if (d.method === 'palmo') {
    html = `<h2>🖐 Último palmo</h2><p class="muted">Os capitães vão fechando a mão no taco, uma em cima da outra. Quem segurar por último precisa balançar o taco como pêndulo por 10 segundos.</p>`;
    let y = 0;
    const hands = d.hands
      .map((h) => {
        const top = 260 - ((y + h.w) / d.length) * 260;
        y += h.w;
        return `<div class="palmo-hand" style="top:${top}px;height:${(h.w / d.length) * 260 - 2}px;background:${tColor(h.team)}">${tName(h.team)}</div>`;
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
    } else html += `<p>${d.success ? 'Equilibrou!' : 'Deixou cair!'} Time <b>${tName(d.winner)}</b> começa no taco.</p>`;
  } else html = `<h2>🎲 Sorteio</h2><p>Time <b>${tName(d.winner)}</b> começa no taco.</p>`;

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
