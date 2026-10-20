// Procedural canvas textures: ball skins, shirt patterns and bat finishes.

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Ball skins are drawn on an equirectangular 256x128 map.
export function drawBallSkin(skin) {
  const key = 'ball:' + skin;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  const W = 256;
  const H = 128;
  const fill = (col) => {
    g.fillStyle = col;
    g.fillRect(0, 0, W, H);
  };
  switch (skin) {
    case 'tenis':
      fill('#d4f03c');
      g.strokeStyle = '#fafafa';
      g.lineWidth = 7;
      g.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 4) * 34;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      noise(g, W, H, 'rgba(255,255,255,0.08)', 900);
      break;
    case 'borracha':
      fill('#d62828');
      noise(g, W, H, 'rgba(0,0,0,0.12)', 700);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(0, 40, W, 6);
      break;
    case 'meia':
      fill('#9ca3af');
      for (let y = 0; y < H; y += 6) {
        g.fillStyle = y % 12 ? '#8b929c' : '#b0b6bf';
        g.fillRect(0, y, W, 3);
      }
      g.fillStyle = '#1d4ed8';
      g.fillRect(0, 50, W, 10);
      g.fillStyle = '#ef4444';
      g.fillRect(0, 66, W, 10);
      break;
    case 'futebol':
      fill('#fafafa');
      g.fillStyle = '#111';
      for (let i = 0; i < 12; i++) {
        const x = (i % 6) * 44 + (i > 5 ? 22 : 0) + 10;
        const y = i > 5 ? 90 : 34;
        poly(g, x, y, 13, 5);
      }
      break;
    case 'praia': {
      const cols = ['#ef4444', '#facc15', '#3b82f6', '#fafafa', '#22c55e', '#f97316'];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = cols[i];
        g.fillRect((i * W) / 6, 0, W / 6 + 1, H);
      }
      g.fillStyle = '#fafafa';
      g.fillRect(0, 0, W, 10);
      g.fillRect(0, H - 10, W, 10);
      break;
    }
    case 'neon':
      fill('#ff2fd6');
      g.strokeStyle = '#00f0ff';
      g.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(0, 20 + i * 30);
        g.lineTo(W, 20 + i * 30 + 10);
        g.stroke();
      }
      break;
    case 'melancia':
      fill('#2f8f3a');
      g.fillStyle = '#1f5f26';
      for (let x = 0; x < W; x += 32) {
        g.beginPath();
        for (let y = 0; y <= H; y += 4) g.lineTo(x + Math.sin(y / 9) * 5 + 8, y);
        for (let y = H; y >= 0; y -= 4) g.lineTo(x + Math.sin(y / 9) * 5 + 2, y);
        g.fill();
      }
      break;
    case 'fogo': {
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#fff3b0');
      grd.addColorStop(0.4, '#ff9f1c');
      grd.addColorStop(1, '#d00000');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,200,0.5)';
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        const x = Math.random() * W;
        g.moveTo(x, H);
        g.quadraticCurveTo(x + 10, H / 2, x + 4, Math.random() * 40);
        g.quadraticCurveTo(x - 6, H / 2, x - 10, H);
        g.fill();
      }
      break;
    }
    case 'beisebol':
      fill('#f5f0e6');
      g.strokeStyle = '#c1121f';
      g.lineWidth = 2;
      for (const off of [0, W / 2]) {
        g.beginPath();
        for (let y = 0; y <= H; y += 3) g.lineTo(off + 40 + Math.sin((y / H) * Math.PI) * 30, y);
        g.stroke();
        for (let y = 6; y < H; y += 8) {
          const x = off + 40 + Math.sin((y / H) * Math.PI) * 30;
          g.beginPath();
          g.moveTo(x - 5, y - 2);
          g.lineTo(x + 5, y + 2);
          g.stroke();
        }
      }
      break;
    case 'basquete':
      fill('#e06a1b');
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, H / 2);
      g.lineTo(W, H / 2);
      for (const x of [0, W / 4, W / 2, (3 * W) / 4]) {
        g.moveTo(x, 0);
        g.lineTo(x, H);
      }
      g.stroke();
      noise(g, W, H, 'rgba(0,0,0,0.12)', 1200);
      break;
    case 'ouro': {
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#fff3a0');
      grd.addColorStop(0.35, '#e6b422');
      grd.addColorStop(0.6, '#a87900');
      grd.addColorStop(1, '#ffe066');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x <= W; x += 4) g.lineTo(x, H / 2 + Math.sin((x / W) * Math.PI * 4) * 30);
      g.stroke();
      break;
    }
    case 'galaxia': {
      const grd = g.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, '#1a0b3d');
      grd.addColorStop(0.5, '#4c1d95');
      grd.addColorStop(1, '#0b1a3d');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) {
        const neb = g.createRadialGradient((i * 47) % W, (i * 31) % H, 2, (i * 47) % W, (i * 31) % H, 30);
        neb.addColorStop(0, 'rgba(236,72,153,0.6)');
        neb.addColorStop(1, 'rgba(236,72,153,0)');
        g.fillStyle = neb;
        g.fillRect(0, 0, W, H);
      }
      noise(g, W, H, '#ffffff', 160);
      break;
    }
    case 'arcoiris': {
      const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#6366f1', '#a855f7'];
      cols.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect(0, (i * H) / cols.length, W, H / cols.length + 1);
      });
      break;
    }
    default:
      fill('#ffffff');
  }
  cache.set(key, c);
  return c;
}

export const GLOWING_BALLS = new Set(['neon', 'fogo', 'galaxia', 'arcoiris']);

function noise(g, w, h, col, n) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
}

function poly(g, x, y, r, n) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.fill();
}

// Shirt pattern texture (index from AVATAR_PARTS.shirt).
export function drawShirt(style, color) {
  const key = `shirt:${style}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  const light = 'rgba(255,255,255,0.75)';
  const dark = 'rgba(0,0,0,0.28)';
  switch (style) {
    case 1: // listrada
      g.fillStyle = light;
      for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 8);
      break;
    case 3: // camisa de time
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 14);
      g.fillRect(56, 0, 16, 128);
      g.fillStyle = dark;
      g.font = 'bold 44px sans-serif';
      g.textAlign = 'center';
      g.fillText('10', 30, 80);
      g.fillText('10', 98, 80);
      break;
    case 4: // xadrez
      g.fillStyle = dark;
      for (let i = 0; i < 128; i += 24) {
        g.fillRect(i, 0, 10, 128);
        g.fillRect(0, i, 128, 10);
      }
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 12; i < 128; i += 24) g.fillRect(i, 0, 3, 128);
      break;
    case 5: // polo
      g.fillStyle = light;
      g.fillRect(0, 0, 128, 10);
      g.fillStyle = dark;
      g.fillRect(60, 10, 8, 30);
      break;
    case 6: // floral
      for (let i = 0; i < 26; i++) {
        const x = (i * 37) % 128;
        const y = (i * 53) % 128;
        g.fillStyle = ['#ffd166', '#ef476f', '#ffffff', '#06d6a0'][i % 4];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    case 7: // moletom
      g.fillStyle = dark;
      g.fillRect(0, 110, 128, 18);
      g.fillRect(40, 50, 48, 26);
      break;
  }
  cache.set(key, c);
  return c;
}

export function drawPants(style, color) {
  const key = `pants:${style}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  if (style === 1) {
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 64; i += 3) g.fillRect(i, 0, 1, 64);
  } else if (style === 2 || style === 3) {
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(4, 0, 5, 64);
    g.fillRect(55, 0, 5, 64);
  } else if (style === 4) {
    for (let i = 0; i < 20; i++) {
      g.fillStyle = ['#ffd166', '#ef476f', '#06d6a0'][i % 3];
      g.beginPath();
      g.arc((i * 23) % 64, (i * 41) % 64, 4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style === 5) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(10, 30, 18, 14);
    g.fillRect(36, 30, 18, 14);
  }
  cache.set(key, c);
  return c;
}

export function drawBat(style) {
  const key = 'bat:' + style;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(32, 128);
  const g = c.getContext('2d');
  const base = ['#c8955a', '#6b4226', '#1f9d3a', '#e8e8e8', '#222222', '#ff3ea5', '#55613a', '#e6b422', '#111827'][style] || '#c8955a';
  g.fillStyle = base;
  g.fillRect(0, 0, 32, 128);
  if (style === 0 || style === 1) {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let x = 2; x < 32; x += 5) {
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 3, 40, x - 3, 80, x + 2, 128);
      g.stroke();
    }
  } else if (style === 2) {
    g.fillStyle = '#ffd60a';
    for (let y = 0; y < 128; y += 20) g.fillRect(0, y, 32, 10);
  } else if (style === 3) {
    g.fillStyle = '#d62828';
    for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 32, 8);
  } else if (style === 7) {
    const grd = g.createLinearGradient(0, 0, 32, 0);
    grd.addColorStop(0, '#a87900');
    grd.addColorStop(0.5, '#fff3a0');
    grd.addColorStop(1, '#a87900');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 128);
  } else if (style === 8) {
    g.strokeStyle = '#00f0ff';
    g.lineWidth = 3;
    g.strokeRect(3, 3, 26, 96);
    g.fillStyle = '#ff2fd6';
    for (let y = 10; y < 96; y += 18) g.fillRect(8, y, 16, 4);
  } else if (style === 6) {
    for (let i = 0; i < 30; i++) {
      g.fillStyle = ['#3a4a2a', '#7a6a3a', '#2a3020'][i % 3];
      g.beginPath();
      g.arc((i * 13) % 32, (i * 29) % 128, 6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, 100, 32, 28); // grip tape
  cache.set(key, c);
  return c;
}
