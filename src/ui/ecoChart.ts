import { FEATURES, type ChaosPlan } from '../app/chaos';
import { tr } from './i18n';

const FEAT_JA: Record<string, string> = { kick: 'キック', snare: 'スネア', hat: 'ハット', energy: '音量', bass: '低音', mid: '中音', high: '高音', build: 'ビルド', drop: 'ドロップ' };

/**
 * Ecosystem chart for a chaos plan:
 *  top    — population per kind (stacked), mean generation (line), extinctions (red ticks)
 *  bottom — heat strip of what the living population listens to (mean ear per feature over time)
 */
export function drawEcoChart(cv: HTMLCanvasElement, p: ChaosPlan, opts: { dark?: boolean; labels?: boolean; playhead?: number } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const Wc = cv.clientWidth || 300, Hc = cv.clientHeight || 150;
  cv.width = Wc * dpr; cv.height = Hc * dpr;
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, Wc, Hc);
  const eco = p.eco;
  if (!eco.length) return;
  const fg = opts.dark ? 'rgba(255,255,255,.85)' : '#2a2340';
  const lab = opts.labels ? 46 : 0;
  const x0 = lab, w = Wc - lab - 4;
  const topH = Math.round(Hc * 0.56), heatY = topH + 6, heatH = Hc - heatY - (opts.labels ? 14 : 2);
  const T = eco[eco.length - 1].t || 1;
  const X = (t: number) => x0 + (t / T) * w;
  const maxPop = Math.max(4, ...eco.map((e) => e.theme + e.word + e.asset));
  const Y = (v: number) => topH - (v / maxPop) * (topH - 4);
  // stacked populations
  const layers: [keyof typeof eco[0], string][] = [['theme', '#ff3d7f'], ['asset', '#ffb84d'], ['word', '#00e5ff']];
  const acc = new Float32Array(eco.length);
  for (const [k, col] of layers) {
    g.beginPath();
    eco.forEach((e, i) => { const v = acc[i] + (e[k] as number); i ? g.lineTo(X(e.t), Y(v)) : g.moveTo(X(e.t), Y(v)); });
    for (let i = eco.length - 1; i >= 0; i--) g.lineTo(X(eco[i].t), Y(acc[i]));
    g.closePath(); g.fillStyle = col; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
    eco.forEach((e, i) => { acc[i] += e[k] as number; });
  }
  // extinctions
  g.strokeStyle = '#ff2a2a'; g.lineWidth = 1.5;
  for (const e of p.events) if (e.kind === 'extinction') { g.beginPath(); g.moveTo(X(e.t), 0); g.lineTo(X(e.t), topH); g.stroke(); }
  // mean generation
  const maxGen = Math.max(1, ...eco.map((e) => e.gen));
  g.strokeStyle = fg; g.lineWidth = 1.6; g.beginPath();
  eco.forEach((e, i) => { const y = topH - (e.gen / maxGen) * (topH - 6); i ? g.lineTo(X(e.t), y) : g.moveTo(X(e.t), y); });
  g.stroke();
  // ear heat strip
  const rows = FEATURES.length, rh = heatH / rows;
  let mx = 0.01; for (const e of eco) for (const v of e.ear) mx = Math.max(mx, v);
  const cw = Math.max(1, w / eco.length + 0.5);
  eco.forEach((e) => {
    for (let f = 0; f < rows; f++) {
      const v = e.ear[f] / mx;
      g.fillStyle = `hsla(${280 - v * 230}, 95%, ${12 + v * 55}%, 1)`;
      g.fillRect(X(e.t), heatY + f * rh, cw, rh + 0.5);
    }
  });
  if (opts.labels) {
    g.fillStyle = fg; g.font = '10px "M PLUS Rounded 1c", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'right';
    FEATURES.forEach((f, i) => { if (rh >= 8) g.fillText(tr(FEAT_JA[f]), lab - 4, heatY + (i + 0.5) * rh); });
    g.fillText(tr('個体数'), lab - 4, 10);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (let s = 0; s <= T; s += 30) g.fillText(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, X(s) + 2, Hc - 2);
  }
  if (opts.playhead !== undefined) { g.fillStyle = fg; g.fillRect(X(opts.playhead) - 0.75, 0, 1.5, Hc); }
}

export const ECO_LEGEND = '<span style="color:#ff3d7f">■</span>テーマ <span style="color:#ffb84d">■</span>写真・動画 ― 平均世代 <span style="color:#ff2a2a">|</span>大量絶滅 ／ 下段：群れが「聴いている」音';
