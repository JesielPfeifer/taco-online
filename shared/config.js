// Shared constants between server and browser (ES module, no dependencies).

export const FIELD = {
  halfW: 20, // fence half-width (x)
  halfL: 28, // fence half-length (z)
  fenceH: 1.1, // a ball lower than this bounces off the fence
  worldHalfW: 32, // the "mato"/pátio area ends here
  worldHalfL: 40,
};

export const BASE_R = 0.9; // base circle radius (players stand inside it)
export const TARGET_R = 0.22; // tripod ("casinha") collision radius
export const TARGET_H = 0.8;
export const BALL_R = 0.07;
// The pitching line sits behind the base circle: pitches only count from beyond it.
export const PITCH_LINE = BASE_R + 0.3;
export const MID_ZONE = 1.8; // |z| below this counts as the middle of the field
export const PLAYER_R = 0.32;

export const RULE_DEFS = {
  startMethod: {
    label: 'Quem começa no taco',
    options: [
      ['molhado', 'Molhado ou seco'],
      ['parimpar', 'Par ou ímpar'],
      ['palmo', 'Último palmo'],
      ['aleatorio', 'Sorteio'],
    ],
  },
  targetScore: {
    label: 'Pontos para vencer',
    options: [
      [5, '5'],
      [10, '10'],
      [12, '12'],
      [24, '24'],
      [100, '100'],
    ],
  },
  pointsPerRun: {
    label: 'Valor de cada cruzada',
    options: [
      [1, '1 ponto'],
      [2, '2 pontos'],
      [10, '10 pontos'],
    ],
  },
  baseDistance: {
    label: 'Distância entre as bases',
    options: [
      [6, '6 m'],
      [8, '8 m'],
      [10, '10 m'],
      [12, '12 m'],
    ],
  },
  catchRule: {
    label: 'Bola pega no ar (vitória)',
    options: [
      ['taco', 'Lançadores ganham o taco'],
      ['taco2', 'Ganham o taco + 2 pontos'],
      ['jogo', 'Vitória automática (fim de jogo)'],
    ],
  },
  lanchaRule: {
    label: 'Lancha (bola no corpo do rebatedor)',
    options: [
      ['tres', '3 na lancha: perde o taco'],
      ['menos4', '3 na lancha: perde 4 pontos (PR)'],
      ['penalti', 'Pênalti de perto (RS)'],
      ['imediato', 'Encostou, perdeu o taco'],
    ],
  },
  paraTrasLimit: {
    label: 'Pra trás para perder o taco',
    options: [
      [3, '3 pra trás'],
      [0, 'Desligado'],
    ],
  },
  noTrasAtMax: {
    label: 'Na pontuação máxima não tem "trás"',
    options: [
      [true, 'Sim'],
      [false, 'Não'],
    ],
  },
  halfOnLoseAtMax: {
    label: 'Perder o taco na pontuação máxima cai pela metade',
    options: [
      [true, 'Sim'],
      [false, 'Não'],
    ],
  },
  retaRule: {
    label: 'Bola parada entre as casinhas',
    options: [
      ['reta', 'Reta / bete-ombro (com "nada")'],
      ['off', 'Desligado'],
    ],
  },
  patioBonus: {
    label: 'Bola no pátio / mato ("bolinha perdida")',
    options: [
      ['corrida', 'Rebatedores ganham 1 cruzada'],
      ['duas', 'Rebatedores ganham 2 cruzadas'],
      ['nada', 'Sem pontos extras'],
      ['vitoria', 'Vitória dos rebatedores'],
    ],
  },
  tempoPenalty: {
    label: 'Pedir tempo ("tempo-para-dois") dá uma pra trás',
    options: [
      [false, 'Não'],
      [true, 'Sim'],
    ],
  },
  scenario: {
    label: 'Cenário',
    options: [
      ['campinho', 'Campinho de grama'],
      ['rua', 'Rua de bairro'],
      ['sitio', 'Sítio'],
      ['mercado', 'Estacionamento do mercado'],
      ['praia', 'Praia'],
    ],
  },
  powers: {
    label: 'Poderes comprados na loja',
    options: [
      [true, 'Liberados'],
      [false, 'Desligados (jogo limpo)'],
    ],
  },
  finalMode: {
    label: 'Final do jogo',
    options: [
      ['cruzar', 'Atingiu os pontos e cruzou os tacos: venceu'],
      ['paulista', 'De pé sobre os tacos (interior de SP)'],
    ],
  },
};

export const DEFAULT_RULES = {
  startMethod: 'molhado',
  targetScore: 10,
  pointsPerRun: 1,
  baseDistance: 10,
  catchRule: 'taco',
  lanchaRule: 'tres',
  paraTrasLimit: 3,
  noTrasAtMax: true,
  halfOnLoseAtMax: true,
  retaRule: 'reta',
  patioBonus: 'corrida',
  tempoPenalty: false,
  finalMode: 'cruzar',
  scenario: 'campinho',
  powers: true,
};

export function sanitizeRules(input) {
  const out = { ...DEFAULT_RULES };
  if (!input || typeof input !== 'object') return out;
  for (const [key, def] of Object.entries(RULE_DEFS)) {
    const match = def.options.find(([v]) => v === input[key]);
    if (match) out[key] = match[0];
  }
  return out;
}

// Avatar customization: every part has at least 6 choices.
export const AVATAR_PARTS = {
  skin: {
    label: 'Pele',
    options: ['#f6d7c3', '#eac09a', '#d7a27a', '#b97c55', '#8d5a3b', '#6a412a', '#4a2c1c', '#f1c9a5'],
    color: true,
  },
  height: { label: 'Altura', options: ['Baixinho', 'Médio', 'Alto', 'Magrelo', 'Fortão', 'Gordinho'] },
  hairStyle: {
    label: 'Cabelo',
    options: ['Careca', 'Curto', 'Moicano', 'Black power', 'Rabo de cavalo', 'Longo', 'Topete', 'Trancinhas'],
  },
  hairColor: {
    label: 'Cor do cabelo',
    options: ['#1b1b1b', '#5a3620', '#c9a24a', '#a8431f', '#9a9a9a', '#2f6fd6', '#e05aa8', '#3bb36a'],
    color: true,
  },
  eyeColor: {
    label: 'Olhos',
    options: ['#3b2414', '#2f78c4', '#3e8f4c', '#a87a2c', '#6d7680', '#111111'],
    color: true,
  },
  facialHair: {
    label: 'Barba',
    options: ['Nenhuma', 'Bigode', 'Cavanhaque', 'Barba curta', 'Barba cheia', 'Costeletas', 'Bigodão'],
  },
  hat: {
    label: 'Boné / chapéu',
    options: [
      'Nenhum',
      'Boné aba curva',
      'Boné aba reta',
      'Boné pra trás',
      'Chapéu de palha',
      'Gorro',
      'Viseira',
      'Bandana',
      'Chapéu de cowboy',
      'Bucket',
      'Coroa',
      'Cartola',
    ],
  },
  hatColor: {
    label: 'Cor do boné',
    options: ['#d62828', '#1d4ed8', '#111827', '#f8f8f8', '#16a34a', '#f59e0b', '#7c3aed', '#ec4899'],
    color: true,
  },
  glasses: {
    label: 'Óculos de sol',
    options: ['Nenhum', 'Aviador', 'Wayfarer', 'Redondo', 'Esportivo espelhado', 'Coração', 'Gatinho', 'Nerd'],
  },
  earrings: {
    label: 'Brinco',
    options: ['Nenhum', 'Argola dourada', 'Argola prata', 'Ponto de brilhante', 'Cruz', 'Pena', 'Pérola', 'Alargador'],
  },
  watch: {
    label: 'Relógio',
    options: ['Nenhum', 'Digital preto', 'Dourado', 'Prateado', 'Esportivo neon', 'Smartwatch', 'Pulseira de couro'],
  },
  necklace: {
    label: 'Colar',
    options: ['Nenhum', 'Corrente dourada', 'Corrente prata', 'Contas coloridas', 'Cordão com cruz', 'Gargantilha'],
  },
  shirt: {
    label: 'Camiseta',
    options: ['Lisa', 'Listrada', 'Regata', 'Camisa de time', 'Xadrez', 'Polo', 'Floral', 'Moletom'],
  },
  shirtColor: {
    label: 'Cor da camiseta',
    options: ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#ffd60a', '#ffffff', '#111111', '#8338ec', '#06d6a0', '#ff70a6'],
    color: true,
  },
  pants: {
    label: 'Calça / bermuda',
    options: ['Bermuda', 'Calça jeans', 'Short esportivo', 'Calça moletom', 'Bermuda floral', 'Calça cargo'],
  },
  pantsColor: {
    label: 'Cor da calça',
    options: ['#264b8c', '#1f2937', '#6b7280', '#b08968', '#3a5a40', '#e9edc9', '#9d0208', '#5e60ce'],
    color: true,
  },
  shoes: {
    label: 'Calçado',
    options: ['Descalço', 'Chinelo', 'Tênis branco', 'Tênis colorido', 'Bota', 'All-star', 'Chuteira'],
  },
  bat: {
    label: 'Taco',
    options: ['Madeira', 'Madeira escura', 'Verde e amarelo', 'Listrado', 'Preto fosco', 'Rosa choque', 'Camuflado', 'Dourado', 'Neon'],
  },
};

export function defaultAvatar() {
  return {
    skin: 2,
    height: 1,
    hairStyle: 1,
    hairColor: 0,
    eyeColor: 0,
    facialHair: 0,
    hat: 1,
    hatColor: 0,
    glasses: 0,
    earrings: 0,
    watch: 1,
    necklace: 0,
    shirt: 0,
    shirtColor: 1,
    pants: 0,
    pantsColor: 0,
    shoes: 2,
    bat: 0,
  };
}

export function randomAvatar() {
  const a = {};
  for (const [k, def] of Object.entries(AVATAR_PARTS)) a[k] = Math.floor(Math.random() * def.options.length);
  return a;
}

// owned: list of purchased item ids; premium parts not owned fall back to the default.
export function sanitizeAvatar(input, owned = null) {
  const out = defaultAvatar();
  if (!input || typeof input !== 'object') return out;
  for (const [k, def] of Object.entries(AVATAR_PARTS)) {
    const v = Number(input[k]);
    if (!Number.isInteger(v) || v < 0 || v >= def.options.length) continue;
    if (owned && PREMIUM[k]?.[v] && !owned.includes(`${k}:${v}`)) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- shop
// Prices in coins (🪙). Items not listed here are free.
export const PREMIUM = {
  ball: { neon: 150, melancia: 120, fogo: 250, basquete: 100, ouro: 400, galaxia: 350, arcoiris: 200 },
  bat: { 5: 80, 6: 120, 7: 300, 8: 200 },
  hat: { 10: 300, 11: 150 },
};

export const POWERS = [
  { id: 'folego', name: 'Corrida prolongada', desc: 'O fôlego dura o dobro e recupera mais rápido.', price: 250 },
  { id: 'mira', name: 'Mira quase perfeita', desc: 'Lançamentos e rebatidas quase sem desvio.', price: 400 },
  { id: 'danca', name: 'Dancinha', desc: 'Tecla G: solta uma dancinha no meio da partida.', price: 100 },
];

export function itemPrice(id) {
  const [kind, val] = String(id).split(':');
  if (kind === 'power') return POWERS.find((p) => p.id === val)?.price ?? null;
  return PREMIUM[kind]?.[val] ?? null;
}

export function ownsBall(skin, owned) {
  return !PREMIUM.ball[skin] || owned.includes(`ball:${skin}`);
}

// Coins paid at the end of matches and championships (per human player).
export const REWARDS = { win: 50, loss: 15, champ: [500, 300, 150] };

export const BALL_SKINS = [
  ['tenis', 'Bola de tênis'],
  ['borracha', 'Borracha vermelha'],
  ['meia', 'Bola de meia'],
  ['futebol', 'Futebol'],
  ['praia', 'Bola de praia'],
  ['neon', 'Neon'],
  ['melancia', 'Melancia'],
  ['fogo', 'Fogo'],
  ['beisebol', 'Beisebol'],
  ['basquete', 'Basquete'],
  ['ouro', 'Bola de ouro'],
  ['galaxia', 'Galáxia'],
  ['arcoiris', 'Arco-íris'],
];

export const TEAM_NAMES = ['Azul', 'Vermelho'];
export const TEAM_COLORS = ['#2f80ed', '#eb5757'];

export function sanitizeName(name) {
  const s = String(name || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 16);
  return s || 'Jogador';
}
