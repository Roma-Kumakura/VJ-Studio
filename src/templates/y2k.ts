import { mulberry32, pick, type RNG } from '../core/rng';
import type { Frame } from '../core/frame';
import type { RenderEnv, TemplateDef, TemplateInstance } from '../core/template';
import { timeToBeat } from '../analysis/analyze';

// Y2Kデスクトップの夢 — an old desktop OS where windows spawn on the beat.
const FONT = '"MS PGothic", "Osaka", "Hiragino Sans", monospace';
const ERRORS = [
  '夢.exe は応答していません。', 'ファイルが見つかりません:\nsummer_2003.jpg', '接続が切断されました。\n再接続しますか？',
  'この記憶は読み取り専用です。', 'ここはどこですか？', 'メモリが不足しています。\n思い出を閉じてください。',
  '未送信のメッセージ (1)', 'おかえりなさい。',
];
const NOTES = [
  'まだ起きてる？', 'あの夏のプール、まだあるかな', '窓の外がずっと夕方', 'セーブデータが消えた日',
  '誰もいない廊下の音', 'ねむれない 3:04 AM', '空がきれいすぎて こわい', 'また明日ね',
];
const WINS = ['エラー', '警告', 'メモ帳 - 無題', 'ピクチャ ビューア', 'メディアプレーヤー', 'ダウンロード中...', 'メッセージ'];

interface Pal { desk: string[]; title: [string, string]; face: string; accent: string }
const PALS: Pal[] = [
  { desk: ['#8ec5ff', '#ffd6f0'], title: ['#1b2a8c', '#7a8fff'], face: '#d4d0c8', accent: '#ff6fb5' },
  { desk: ['#2a9d8f', '#2a9d8f'], title: ['#000080', '#1084d0'], face: '#c0c0c0', accent: '#ffe066' },
  { desk: ['#3a1f5c', '#ff8fc6'], title: ['#5a1a7a', '#ff6fd8'], face: '#e0d6ea', accent: '#7af0ff' },
  { desk: ['#ffb38a', '#ffe8c2'], title: ['#7a2e1f', '#e0784a'], face: '#ece4d8', accent: '#4ac0ff' },
];

function bevel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, face: string, inset = false) {
  g.fillStyle = face; g.fillRect(x, y, w, h);
  g.fillStyle = inset ? '#808080' : '#ffffff'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = inset ? '#ffffff' : '#404040'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.arc(x, y, 14 * s, 0, 7); g.arc(x + 16 * s, y - 8 * s, 18 * s, 0, 7); g.arc(x + 36 * s, y, 14 * s, 0, 7);
  g.rect(x, y - 2 * s, 36 * s, 14 * s); g.fill();
}

function create(env: RenderEnv): TemplateInstance {
  const DH = 360, DW = Math.round(360 * (env.width / env.height));
  const scale = 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(DW * scale); canvas.height = Math.round(DH * scale);
  const g = canvas.getContext('2d')!;
  const seedRng = mulberry32(env.seed * 31 + 7);
  const pal = pick(seedRng, PALS);
  const wallpaper = Math.floor(seedRng() * 3);
  const A = env.analysis;

  const beatAt = (time: number) => timeToBeat(A, time);

  function drawWallpaper(t: number, f: Frame) {
    const gr = g.createLinearGradient(0, 0, 0, DH);
    gr.addColorStop(0, pal.desk[0]); gr.addColorStop(1, pal.desk[1]);
    g.fillStyle = gr; g.fillRect(0, 0, DW, DH);
    if (wallpaper === 0) {
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 7; i++) {
        const r = mulberry32(env.seed + i * 13);
        const x = ((r() * DW * 1.4 + t * (6 + r() * 6)) % (DW * 1.4)) - DW * 0.2;
        cloud(g, x, 30 + r() * 180, 0.8 + r() * 1.2);
      }
    } else if (wallpaper === 1) {
      // dreamcore checker floor
      const hy = DH * 0.55;
      g.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 1; i < 14; i++) {
        const y0 = hy + Math.pow(i / 14, 2) * (DH - hy);
        const y1 = hy + Math.pow((i + 1) / 14, 2) * (DH - hy);
        for (let j = -12; j < 12; j++) {
          if ((i + j) % 2) continue;
          const xa = DW / 2 + j * 40 * (y0 - hy) / (DH - hy) * 1.8, xb = DW / 2 + (j + 1) * 40 * (y0 - hy) / (DH - hy) * 1.8;
          const xc = DW / 2 + (j + 1) * 40 * (y1 - hy) / (DH - hy) * 1.8, xd = DW / 2 + j * 40 * (y1 - hy) / (DH - hy) * 1.8;
          g.beginPath(); g.moveTo(xa, y0); g.lineTo(xb, y0); g.lineTo(xc, y1); g.lineTo(xd, y1); g.fill();
        }
      }
    } else {
      // vaporwave grid + sun
      const hy = DH * 0.6;
      g.fillStyle = pal.accent; g.globalAlpha = 0.8;
      g.beginPath(); g.arc(DW / 2, hy, 70, Math.PI, 0); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const y = hy + Math.pow(((i + (f.beat % 1)) / 12), 2) * (DH - hy);
        g.beginPath(); g.moveTo(0, y); g.lineTo(DW, y); g.stroke();
      }
      for (let j = -10; j <= 10; j++) { g.beginPath(); g.moveTo(DW / 2 + j * 8, hy); g.lineTo(DW / 2 + j * 90, DH); g.stroke(); }
    }
    // desktop icons
    const icons = ['マイ ドリーム', '夢.exe', 'summer.jpg', 'ごみ箱'];
    g.font = `10px ${FONT}`; g.textAlign = 'center';
    icons.forEach((name, i) => {
      const x = 28, y = 24 + i * 58;
      g.fillStyle = i === 3 ? '#e8e8e8' : i === 1 ? pal.accent : '#ffe08a';
      g.fillRect(x - 12, y, 24, 20); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 12, y + 20, 24, 2);
      g.fillStyle = '#fff'; g.fillText(name, x, y + 34);
    });
  }

  function drawWindow(k: number, age: number, f: Frame, t: number) {
    const r: RNG = mulberry32(env.seed * 1000 + k * 7919);
    const type = Math.floor(r() * 6);
    const w = [170, 150, 190, 170, 200, 180][type] + r() * 40;
    const h = [80, 90, 120, 130, 110, 70][type] + r() * 20;
    const x = 50 + r() * (DW - w - 60), y = 10 + r() * (DH - h - 40);
    const pop = Math.min(1, age * 4);
    // 3D flip-in: fake rotateY via horizontal squash + shear, with overshoot
    const e = 1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2);
    const ang = (1 - pop) * 1.4 * (k % 2 ? 1 : -1);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.transform(Math.cos(ang) * e, Math.sin(ang) * 0.25, 0, e, 0, 0);
    g.translate(-(x + w / 2), -(y + h / 2));
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 3, y + 3, w, h);
    bevel(g, x, y, w, h, pal.face);
    const tg = g.createLinearGradient(x, 0, x + w, 0);
    tg.addColorStop(0, pal.title[0]); tg.addColorStop(1, pal.title[1]);
    g.fillStyle = tg; g.fillRect(x + 3, y + 3, w - 6, 14);
    g.fillStyle = '#fff'; g.font = `bold 10px ${FONT}`; g.textAlign = 'left';
    const title = type === 4 ? `${env.meta.title || 'untitled'} - プレーヤー` : WINS[[0, 1, 2, 3, 4, 5][type] ?? 0];
    g.fillText(title, x + 7, y + 13);
    for (let b = 0; b < 3; b++) bevel(g, x + w - 18 - b * 14, y + 5, 12, 10, pal.face);
    g.fillStyle = '#000'; g.font = `9px ${FONT}`; g.fillText('×', x + w - 15, y + 13);
    const cx = x + 8, cy = y + 24, cw = w - 16, ch = h - 30;
    g.font = `11px ${FONT}`; g.fillStyle = '#000';
    if (type === 0 || type === 1) {
      // error / warning dialog
      g.fillStyle = type === 0 ? '#e02020' : '#ffd400';
      g.beginPath();
      if (type === 0) g.arc(cx + 14, cy + 14, 12, 0, 7); else { g.moveTo(cx + 14, cy + 2); g.lineTo(cx + 27, cy + 26); g.lineTo(cx + 1, cy + 26); }
      g.fill();
      g.fillStyle = type === 0 ? '#fff' : '#000'; g.font = `bold 14px ${FONT}`; g.textAlign = 'center';
      g.fillText(type === 0 ? '×' : '!', cx + 14, cy + 20); g.textAlign = 'left';
      g.fillStyle = '#000'; g.font = `11px ${FONT}`;
      pick(r, ERRORS).split('\n').forEach((line, i) => g.fillText(line, cx + 36, cy + 12 + i * 14));
      const flash = f.snare > 0.5 && (k % 2 === 0);
      bevel(g, x + w / 2 - 28, y + h - 26, 56, 18, flash ? pal.accent : pal.face);
      g.fillStyle = '#000'; g.textAlign = 'center'; g.fillText('OK', x + w / 2, y + h - 13); g.textAlign = 'left';
    } else if (type === 2) {
      // notepad typewriter
      bevel(g, cx - 2, cy - 2, cw + 4, ch + 4, '#fff', true);
      const text = [pick(r, NOTES), pick(r, NOTES), pick(r, NOTES)].join('\n');
      const n = Math.floor(age * 18);
      text.slice(0, n).split('\n').forEach((line, i) => { g.fillStyle = '#000'; g.fillText(line, cx + 2, cy + 12 + i * 15); });
      if (Math.floor(t * 2) % 2) g.fillRect(cx + 2 + g.measureText(text.slice(0, n).split('\n').pop() || '').width, cy + 2 + (text.slice(0, n).split('\n').length - 1) * 15, 1, 12);
    } else if (type === 3) {
      // picture viewer with a procedural memory photo
      const pr = mulberry32(k * 17 + env.seed);
      const gr = g.createLinearGradient(0, cy, 0, cy + ch);
      const hue = Math.floor(pr() * 360);
      gr.addColorStop(0, `hsl(${hue},70%,75%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},60%,88%)`);
      g.fillStyle = gr; g.fillRect(cx, cy, cw, ch);
      if (pr() < 0.5) {
        g.fillStyle = '#7fd6f0'; g.fillRect(cx, cy + ch * 0.6, cw, ch * 0.4);
        g.strokeStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < cw; i += 10) { g.beginPath(); g.moveTo(cx + i, cy + ch * 0.6); g.lineTo(cx + i, cy + ch); g.stroke(); }
      } else {
        g.fillStyle = 'rgba(255,255,255,.9)'; cloud(g, cx + cw * 0.3, cy + ch * 0.4, 0.8);
      }
      g.fillStyle = 'rgba(255,255,255,.8)'; g.font = `9px ${FONT}`; g.fillText(`IMG_${2000 + (k % 9)}0${k % 7}${k % 10}.JPG`, cx + 3, cy + ch - 4);
    } else if (type === 4) {
      // media player with live spectrum
      g.fillStyle = '#111'; g.fillRect(cx, cy, cw, ch - 18);
      for (let b = 0; b < 16; b++) {
        const v = f.spec[b * 2];
        const bh = v * (ch - 26);
        const gr = g.createLinearGradient(0, cy + ch - 20, 0, cy);
        gr.addColorStop(0, '#3f6'); gr.addColorStop(0.7, '#ff0'); gr.addColorStop(1, '#f33');
        g.fillStyle = gr; g.fillRect(cx + 4 + b * ((cw - 8) / 16), cy + ch - 20 - bh, (cw - 8) / 16 - 2, bh);
      }
      g.fillStyle = '#3f6'; g.font = `10px ${FONT}`;
      g.fillText(`♪ ${env.meta.artist || ''} - ${env.meta.title || ''}`.slice(0, 30), cx + 4, cy + 12);
      bevel(g, cx, cy + ch - 14, cw, 10, '#fff', true);
      g.fillStyle = pal.title[0]; g.fillRect(cx + 2, cy + ch - 12, (cw - 4) * f.prog, 6);
    } else {
      // download progress
      g.fillText('夢をダウンロードしています...', cx, cy + 10);
      bevel(g, cx, cy + 20, cw, 14, '#fff', true);
      const p = Math.min(1, age * 0.35);
      const blocks = Math.floor(p * (cw - 6) / 8);
      g.fillStyle = pal.title[0];
      for (let i = 0; i < blocks; i++) g.fillRect(cx + 3 + i * 8, cy + 23, 6, 8);
      g.fillText(`残り ${Math.max(0, Math.round((1 - p) * 99))} 秒`, cx, cy + 48);
    }
    g.restore();
  }

  return {
    canvas,
    pixelated: true,
    render(t, f) {
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.imageSmoothingEnabled = false;
      drawWallpaper(t * (env.params.speed ?? 1), f);
      // windows spawned since start of this section
      const secBeat = Math.ceil(beatAt(f.sectionStart));
      const every = f.section === 2 ? 1 : f.section === 1 ? 2 : 4;
      const cur = Math.floor(f.beat);
      const count = Math.floor((cur - secBeat) / every) + 1;
      const maxWin = 12;
      for (let i = Math.max(0, count - maxWin); i < count; i++) {
        const kb = secBeat + i * every;
        drawWindow(kb + f.sectionIndex * 100000, f.beat - kb, f, t);
      }
      // taskbar
      bevel(g, 0, DH - 22, DW, 22, pal.face);
      bevel(g, 3, DH - 19, 58, 16, pal.face);
      g.fillStyle = pal.accent; g.fillRect(8, DH - 15, 8, 8);
      g.fillStyle = '#000'; g.font = `bold 11px ${FONT}`; g.textAlign = 'left'; g.fillText('スタート', 19, DH - 7);
      bevel(g, DW - 60, DH - 19, 57, 16, pal.face, true);
      const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
      g.font = `10px ${FONT}`; g.fillText(`${mm}:${String(ss).padStart(2, '0')}`, DW - 40, DH - 7);
      // cursor
      const ct = t * 0.4;
      const mx = DW * (0.5 + 0.38 * Math.sin(ct * 1.3 + env.seed)), my = DH * (0.45 + 0.3 * Math.sin(ct * 1.7));
      g.fillStyle = '#fff'; g.strokeStyle = '#000';
      g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, my + 14); g.lineTo(mx + 4, my + 10); g.lineTo(mx + 9, my + 10); g.closePath(); g.fill(); g.stroke();

      // glitches (snare) + drop invert
      g.setTransform(1, 0, 0, 1, 0, 0);
      const I = env.params.intensity ?? 1;
      const gl = f.snare * I;
      if (gl > 0.35) {
        const r = mulberry32(Math.floor(t * 30) + env.seed);
        for (let i = 0; i < 6; i++) {
          const sy = r() * canvas.height, sh = 4 + r() * 30, dx = (r() - 0.5) * 60 * gl;
          g.drawImage(canvas, 0, sy, canvas.width, sh, dx, sy, canvas.width, sh);
        }
        g.globalCompositeOperation = 'screen';
        g.fillStyle = `rgba(255,0,128,${0.15 * gl})`; g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalCompositeOperation = 'source-over';
      }
      if (f.dropHit > 0.75) {
        g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalCompositeOperation = 'source-over';
      }
      // scanlines
      g.fillStyle = 'rgba(0,0,0,.08)';
      for (let y = 0; y < canvas.height; y += 3) g.fillRect(0, y, canvas.width, 1);
    },
    dispose() {},
  };
}

export const y2k: TemplateDef = {
  id: 'y2k',
  name: 'Y2Kデスクトップの夢',
  nameEn: 'Y2K Desktop Dream',
  tagline: '拍ごとにウィンドウが増殖。スネアでグリッチ、ブレイクで全部消える。',
  params: [],
  overlayDefault: false,
  create,
};
