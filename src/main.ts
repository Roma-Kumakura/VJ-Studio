import { beatToTime, computeFeatures, computeStructure, timeToBeat, type Analysis, type Features } from './analysis/analyze';
import { Compositor } from './core/compositor';
import { FONTS, ensureAllFonts, ensureFont, fontCss, type FontId } from './core/fonts';
import { createFrame, sampleFrame } from './core/frame';
import { Hud } from './core/hud';
import { MediaLayer, type MediaBlend, type MediaMode } from './core/media';
import {
  COMMON_PARAMS, HUD_LABELS, ICON_FILTERS, ICON_FRAMES, type IconFilter, type IconFrame, SPECTRUM_STYLES, TEXT_ANIMS, TEXT_STYLES, defaultHud, defaultParams, newTextItem,
  type HudElementId, type HudOptions, type RenderEnv, type SpectrumStyle, type StereoPCM, type TemplateDef,
  type TemplateInstance, type TextItem, type TrackMeta,
} from './core/template';
import { TEMPLATES } from './templates';
import { BPL_CHOICES, LYRICS_CLASSIC, currentLine, lyricsLines, parseBlocks, readId3, timeBlocks, type LyricsStyle, type Tags } from './core/lyrics';
import { exportCapabilities, exportMp4, type ExportResult } from './export/exporter';
import { MOODS, REELS, reelLabel, roll, type MoodId, type Recipe, type ReelId } from './app/director';
import { TRANSITIONS, defaultSceneOptions, planScenes, type SceneOptions, type TransitionType } from './app/scenes';
import { SceneRenderer, type SceneSource } from './app/sceneRenderer';
import { defaultChaos, planChaos, type ChaosPlan } from './app/chaos';
import { drawEcoChart, ECO_LEGEND } from './ui/ecoChart';
import { runTour } from './ui/tour';
import { drawKinetic, KINETIC, KINETIC_IDS } from './core/kinetic';
import { demoSongFile } from './core/demo';
import { decodeAudioFile } from './core/decode';
import { addTranslations, applyLang, isEn, onLangChange, toggleLang } from './ui/i18n';
import { bind, color, confirmModal, esc, fileDrop, h, hint, posPad, refreshAll, sec, seg, select, setNotify, slider, text, toast, toggle } from './ui/controls';
import { Timeline } from './ui/timeline';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const STORE = 'vjstudio:v1';

// ============================================================ song loading
interface Song { name: string; buffer: AudioBuffer; F: Features; A: Analysis; pcm: StereoPCM; tags: Tags }

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function analyzeSong(blob: Blob, name: string, msg: (s: string) => void): Promise<Song> {
  msg('デコード中…');
  await nextFrame();
  const buffer = await decodeAudioFile(await blob.arrayBuffer());
  msg('解析中…（BPM・展開・帯域）');
  await nextFrame();
  const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * 22050), 22050);
  const src = off.createBufferSource(); src.buffer = buffer; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const F = await new Promise<Features>((resolve) => {
    try {
      const w = new Worker(new URL('./analysis/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        if (e.data.progress !== undefined) msg(`解析中… ${Math.round(e.data.progress * 100)}%`);
        else { resolve(e.data.F); w.terminate(); }
      };
      w.onerror = () => { w.terminate(); resolve(computeFeatures(mono, 22050)); };
      w.postMessage({ mono, sr: 22050 });
    } catch { resolve(computeFeatures(mono, 22050)); }
  });
  msg('BPM・展開を判定中…');
  const A = { ...F, ...computeStructure(F) };
  const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  let tags: Tags = {};
  try { tags = readId3(await blob.slice(0, 4 * 1024 * 1024).arrayBuffer()); } catch { /* not mp3 */ }
  return { name, buffer, F, A, pcm: { L, R, sampleRate: buffer.sampleRate }, tags };
}

async function imageToSquare(src: Blob | string, size: number): Promise<HTMLCanvasElement | null> {
  try {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    if (!blob.type.startsWith('image/')) return null;
    const img = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const s = Math.min(img.width, img.height);
    c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c;
  } catch { return null; }
}

// ============================================================ language
// theme names / taglines have English names on their definitions
addTranslations(Object.fromEntries(TEMPLATES.flatMap((d) => [[d.name, d.nameEn], [d.tagline, d.nameEn]])));
document.querySelectorAll<HTMLElement>('[data-lang-toggle]').forEach((b) => (b.onclick = () => toggleLang()));
applyLang();

// ============================================================ boot
const start = $('start'), loading = $('loading'), loadmsg = $('loadmsg');
let editorReady: ((s: Song) => void) | null = null;

/** files picked on the start screen besides the song */
interface Extras { avatar: File | null; media: File[] }
const extras: Extras = { avatar: null, media: [] };
let pendingSong: File | null = null;
/** start the guided tour once the editor has opened (set by the top page's tutorial buttons) */
let tourAfterLoad = false;

async function loadSong(blob: Blob, name: string) {
  loading.hidden = false;
  try {
    const song = await analyzeSong(blob, name, (m) => (loadmsg.textContent = m));
    if (editorReady) editorReady(song); else await startEditor(song, extras);
    start.hidden = true;
  } catch (e) {
    console.error(e);
    toast('この音声ファイルは読み込めませんでした');
  } finally { loading.hidden = true; }
}

{
  const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff?)$/i.test(f.name);
  const isVisual = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/');
  const songName = $('songname'), go = $<HTMLButtonElement>('startgo');
  const avThumb = $('avthumb'), mediaList = $('medialist');
  const render = () => {
    songName.textContent = pendingSong ? `🎵 ${pendingSong.name}` : '';
    $('drop').classList.toggle('done', !!pendingSong);
    go.disabled = !pendingSong;
    avThumb.style.backgroundImage = extras.avatar ? `url(${URL.createObjectURL(extras.avatar)})` : '';
    avThumb.classList.toggle('has', !!extras.avatar);
    mediaList.replaceChildren(...extras.media.map((f, i) => {
      const el = document.createElement('div');
      el.className = 'sm-cell';
      if (f.type.startsWith('image/')) el.style.backgroundImage = `url(${URL.createObjectURL(f)})`;
      else el.textContent = '🎬';
      const x = document.createElement('button'); x.textContent = '✕'; x.title = '外す';
      x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); extras.media.splice(i, 1); render(); };
      el.append(x);
      return el;
    }));
    $('mediacount').textContent = extras.media.length ? `${extras.media.length}個` : '';
  };
  /** anything dropped on the main zone is sorted by type */
  const take = (files: File[]) => {
    for (const f of files) {
      if (isAudio(f)) pendingSong = f;
      else if (isVisual(f)) extras.media.push(f);
    }
    render();
  };
  const wire = (zoneId: string, inputId: string, onFiles: (fs: File[]) => void) => {
    const zone = $(zoneId), input = $<HTMLInputElement>(inputId);
    input.onchange = () => { if (input.files?.length) onFiles([...input.files]); input.value = ''; };
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); if (e.dataTransfer?.files.length) onFiles([...e.dataTransfer.files]); };
  };
  wire('drop', 'songfile', take);
  wire('avdrop', 'avfile', (fs) => { const f = fs.find((x) => x.type.startsWith('image/')); if (f) { extras.avatar = f; render(); } });
  wire('mdrop', 'mfile', (fs) => { extras.media.push(...fs.filter(isVisual)); render(); });
  go.onclick = () => { if (pendingSong) loadSong(pendingSong, pendingSong.name); };
  // tutorial: open the editor with a synthesised demo song (+ whatever the user already picked) and start the tour
  const tour = () => { tourAfterLoad = true; const f = pendingSong ?? demoSongFile(); loadSong(f, f.name); };
  $('tourgo').onclick = tour; $('tourgo2').onclick = tour;
  // dropping files anywhere on the start screen works too
  start.ondragover = (e) => e.preventDefault();
  start.ondrop = (e) => { e.preventDefault(); if (e.dataTransfer?.files.length) take([...e.dataTransfer.files]); };
  render();
}

// ============================================================ editor
async function startEditor(first: Song, initial: Extras) {
  let song = first;
  const media = new MediaLayer();
  const meta: TrackMeta = { title: song.name.replace(/\.[^.]+$/, ''), artist: '', username: '', cover: null, avatar: null };
  const env: RenderEnv = {
    width: 960, height: 540, seed: 1234, params: defaultParams(TEMPLATES[0]),
    meta, analysis: song.A, audio: song.pcm, hud: defaultHud(), media,
  };
  type Aspect = '16:9' | '1:1' | '9:16';
  const isPhone = matchMedia('(max-width: 700px)').matches;
  const view = { aspect: '16:9' as Aspect, q: isPhone ? 360 : 540 };
  const ex = { res: 1080, fps: 30, range: 'drop30' as 'all' | 'drop30' | 'drop60' | 'x140' | 'custom', start: 0, end: 30, fade: true };
  const dims = (short: number, a: Aspect) => a === '16:9' ? [Math.round((short * 16) / 9 / 2) * 2, short] : a === '1:1' ? [short, short] : [short, Math.round((short * 16) / 9 / 2) * 2];
  const applyView = () => {
    [env.width, env.height] = dims(view.q, view.aspect);
    const [w, hh] = dims(1, view.aspect);
    document.documentElement.style.setProperty('--ar', String(view.aspect === '16:9' ? 16 / 9 : view.aspect === '1:1' ? 1 : 9 / 16));
    void w; void hh;
  };
  let def: TemplateDef = TEMPLATES[0];
  type SplitMode = 'auto' | 'section' | 'often';
  const sceneOpt: SceneOptions & { split: SplitMode } = { ...defaultSceneOptions(), split: 'auto' };
  let selScene = -1;
  const chaos = defaultChaos();
  let chaosPlan: ChaosPlan | null = null;
  const chaosAssets = (): CanvasImageSource[] => [...media.items.map((m) => m.el as CanvasImageSource), ...(meta.avatar ? [meta.avatar] : []), ...(meta.cover ? [meta.cover] : [])];
  /** time of a chaos tap made while playing: the impact shows at once, before the plan is recomputed */
  let liveTapT: number | null = null;
  const sceneSource = (): SceneSource => ({
    enabled: sceneOpt.enabled, scenes: sceneOpt.scenes, main: { tpl: def.id, seed: env.seed },
    chaos: chaos.enabled && chaosPlan ? { plan: chaosPlan, assets: chaosAssets(), liveTap: liveTapT } : null,
    mediaOnly: media.opts.only && media.items.length > 0,
  });
  /** switch for "background = my photos / videos only, no themes" (shown in the theme and media tabs) */
  const mediaOnlyToggle = () => {
    const box = h('<div class="media-only"></div>');
    box.append(
      toggle('🎬 素材だけで作る（テーマを使わない）', () => media.opts.only, (v) => {
        media.opts.only = v;
        if (v && !media.items.length) toast('「写真動画」タブで素材を追加すると、素材だけの映像になります');
        refreshAll(); dirty = true;
      }),
      hint('背景はすべて自分の写真・動画になり、テーマは一切使いません。拍に合わせて素材が切り替わります（切り替え間隔と動きは「写真動画」タブで調整）。'),
    );
    return box;
  };
  const sceneR = new SceneRenderer(env, TEMPLATES, sceneSource);
  /** (re)simulate the chaos network for the current song, assets and words */
  const replanChaos = () => {
    if (!chaos.enabled) { chaosPlan = null; dirty = true; return; }
    const H = env.hud!;
    const words = [meta.title, meta.username, meta.artist, ...H.texts.map((x) => x.text),
      ...H.lyrics.text.split('\n').filter((l) => l.trim() && !/^\s*\[/.test(l)).slice(0, 6), ...slotWordsRef().split('\n')].map((w) => w.trim()).filter(Boolean);
    const cols = [H.colors.accent, H.colors.accent2, H.colors.text, '#ffffff', '#ff3d7f', '#00e5ff', '#ffe066'];
    const t0 = performance.now();
    liveTapT = null; // the recomputed plan now contains the tap
    chaosPlan = planChaos(chaos, { A: env.analysis, themes: TEMPLATES.map((d) => d.id), assets: chaosAssets().length, words, colors: cols, aspect: env.width / env.height });
    console.debug('chaos net', chaosPlan.nodes.length, 'nodes', Math.round(performance.now() - t0), 'ms');
    // warm up the network's theme pool in the background so playback doesn't stall on first use
    const plan = chaosPlan;
    plan.nodes.filter((n) => n.kind === 'theme' && n.born < 8).forEach((n, i) => setTimeout(() => { if (chaosPlan === plan) sceneR.get(n.id, n.seed); }, 80 + i * 140));
    dirty = true;
    drawEco();
  };
  let ecoCanvas: HTMLCanvasElement | null = null;
  const drawEco = () => {
    if (!ecoCanvas) return;
    ecoCanvas.parentElement!.style.display = chaosPlan ? '' : 'none';
    if (chaosPlan && ecoCanvas.isConnected) drawEcoChart(ecoCanvas, chaosPlan, { dark: true });
  };
  /** record a manual chaos re-roll at the playhead (snapped to the beat unless turned off) */
  let tapTimer = 0;
  const afterTaps = () => {
    refreshAll(); timeline.invalidate(); touch();
    clearTimeout(tapTimer); tapTimer = window.setTimeout(replanChaos, 120);
  };
  const chaosTap = () => {
    const A = env.analysis;
    if (!chaos.enabled) chaos.enabled = true;
    let x = Math.max(0, t);
    if (chaos.snap !== false) {
      // nearest beat — but while playing never a beat that hasn't come yet (the hit is felt now)
      const b = timeToBeat(A, x);
      x = Math.max(0, beatToTime(A, src && beatToTime(A, Math.round(b)) > x + 0.03 ? Math.floor(b) : Math.round(b)));
    }
    if (src) liveTapT = t;
    const ts = chaos.taps ?? [];
    if (!ts.some((y) => Math.abs(y - x) < 0.05)) chaos.taps = [...ts, +x.toFixed(3)];
    document.querySelectorAll('.ctap .chaos-btn').forEach((b) => { b.classList.remove('hit'); void (b as HTMLElement).offsetWidth; b.classList.add('hit'); });
    afterTaps();
  };
  let slotWordsRef: () => string = () => '';
  let chaosTimer = 0;
  let hud: Hud, comp: Compositor;
  let dirty = true;
  let t = 0;
  media.onFrame = () => { dirty = true; };

  // ---------- persistence
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; } })();
  if (saved) {
    def = TEMPLATES.find((d) => d.id === saved.tpl) ?? def;
    env.seed = saved.seed ?? env.seed;
    env.params = { ...defaultParams(def), ...saved.params };
    const d = defaultHud();
    env.hud = { ...d, ...saved.hud, elements: { ...d.elements, ...saved.hud?.elements }, colors: { ...d.colors, ...saved.hud?.colors }, iconFx: { ...d.iconFx, ...saved.hud?.iconFx }, lyrics: { ...d.lyrics, ...saved.hud?.lyrics } };
    Object.assign(meta, { username: saved.meta?.username ?? '', artist: saved.meta?.artist ?? '' });
    if (saved.meta?.title) meta.title = saved.meta.title;
    Object.assign(media.opts, saved.media ?? {});
    Object.assign(view, saved.view ?? {}); Object.assign(ex, saved.ex ?? {});
    if (saved.scenes && saved.scenes.song === song.name) Object.assign(sceneOpt, saved.scenes);
    if (saved.chaos) Object.assign(chaos, saved.chaos);
    if (saved.avatar) meta.avatar = await imageToSquare(saved.avatar, 512);
    if (saved.cover) meta.cover = await imageToSquare(saved.cover, 1024);
  }
  const hudO = () => env.hud as HudOptions;
  applyView();
  // tags embedded in the file (e.g. Suno MP3: title / artist / cover / lyrics)
  const applyTags = async (tg: Tags) => {
    const got: string[] = [];
    if (tg.title) { meta.title = tg.title; got.push('曲名'); }
    if (tg.artist && !meta.artist) { meta.artist = tg.artist; got.push('アーティスト'); }
    if (tg.cover) { const c = await imageToSquare(tg.cover, 1024); if (c) { meta.cover = c; got.push('ジャケット'); } }
    if (tg.lyrics && tg.lyrics.trim().length > 4) { hudO().lyrics.text = tg.lyrics; hudO().elements.lyrics.on = true; got.push('歌詞'); }
    if (got.length) toast(`ファイルから ${got.join('・')} を読み込みました`);
  };
  let getSlot: () => unknown = () => saved?.slot;
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify({
          chaos, scenes: { ...sceneOpt, song: song.name }, slot: getSlot(), view, ex, tpl: def.id, seed: env.seed, params: env.params, hud: env.hud, media: media.opts,
          meta: { username: meta.username, artist: meta.artist, title: meta.title },
          avatar: meta.avatar?.toDataURL('image/jpeg', 0.85), cover: meta.cover?.toDataURL('image/jpeg', 0.85),
        }));
      } catch { /* quota: ignore */ }
    }, 500);
  };
  let layersReady = false;
  const touch = () => { dirty = true; save(); pushHist(); if (layersReady) renderLayers(); };
  setNotify(touch);
  let hist: string[] = [], hi = 0, histTimer = 0, histReady = false, restoring = false;
  function snapState() {
    return JSON.stringify({ scenes: sceneOpt, tpl: def.id, seed: env.seed, params: env.params, hud: env.hud, media: media.opts, meta: { title: meta.title, username: meta.username, artist: meta.artist }, view, ex });
  }
  function commitHist() {
    const st = snapState();
    if (st === hist[hi]) return;
    hist = hist.slice(0, hi + 1); hist.push(st);
    if (hist.length > 120) hist.shift();
    hi = hist.length - 1;
    ($('btn-undo') as HTMLButtonElement).disabled = hi <= 0;
    ($('btn-redo') as HTMLButtonElement).disabled = true;
  }
  function pushHist() {
    if (!histReady || restoring) return;
    clearTimeout(histTimer);
    histTimer = window.setTimeout(() => { histTimer = 0; commitHist(); }, 400);
  }

  // ---------- render objects
  const stage = $('stage');
  const rebuildOutput = () => {
    comp?.dispose();
    hud = new Hud(env);
    comp = new Compositor(env, hud);
    stage.replaceChildren(comp.canvas);
    attachPointer(comp.canvas);
    dirty = true;
  };
  const rebuildTemplate = () => { sceneR.invalidate(); dirty = true; };
  const barSec = () => 240 / env.analysis.bpm;
  /** theme weights for automatic scenes: every theme a little, the current mood's favourites a lot */
  const scenePool = () => {
    const pool: Record<string, number> = Object.fromEntries(TEMPLATES.map((d) => [d.id, 0.35]));
    const mood = lastMoodRef();
    if (mood) for (const [k, v] of Object.entries(MOODS[mood].templates)) if (pool[k] !== undefined) pool[k] += v as number;
    return pool;
  };
  let lastMoodRef: () => MoodId | null = () => null;
  const replanScenes = (seed = Math.floor(Math.random() * 1e9), keepLocks = true) => {
    sceneOpt.seed = seed;
    const split = sceneOpt.split === 'section' ? 9999 : sceneOpt.split === 'often' ? 6 : 0;
    sceneOpt.scenes = planScenes(env.analysis, scenePool(), seed, keepLocks ? sceneOpt.scenes : [], split);
    selScene = -1;
    timeline?.invalidate(); sceneListRender(); dirty = true;
  };
  let sceneListRender = () => {};
  function selectScene(id: number, seekTo: boolean) {
    selScene = id;
    const sc = sceneOpt.scenes.find((x) => x.id === id);
    if (seekTo && sc) seek(sc.start + 0.05);
    showTab('theme'); sceneListRender(); refreshAll(); timeline.invalidate();
  }
  let rebuildTimer = 0;
  const rebuildSoon = () => { clearTimeout(rebuildTimer); rebuildTimer = window.setTimeout(rebuildTemplate, 350); };

  // ---------- selection
  type Sel = { kind: 'el'; id: HudElementId } | { kind: 'text'; item: TextItem } | { kind: 'media' } | null;
  let sel: Sel = null;
  const measure = document.createElement('canvas').getContext('2d')!;
  type Box = [number, number, number, number];
  const boxOf = (s: NonNullable<Sel>, HH: HudOptions = hudO(), MO: { x: number; y: number; size: number } = media.opts): Box | null => {
    const W = env.width, H = env.height, k = Math.min(W, H) / 1080;
    if (s.kind === 'media') {
      const m = MO, it = media.items[0];
      const hh = 0.28 * m.size * H, hw = hh * Math.min(2.2, Math.max(0.5, it ? it.width / it.height : 16 / 9));
      return [m.x * W - hw, m.y * H - hh, m.x * W + hw, m.y * H + hh];
    }
    if (s.kind === 'text') {
      const it = s.item, px = it.size * k;
      measure.font = fontCss(it.font, px);
      const lines = it.text.split('\n');
      const w = Math.max(...lines.map((l) => measure.measureText(l).width)) + px * 0.7;
      const hgt = lines.length * px * 1.3;
      const cx = it.x * W, cy = it.y * H;
      const x0 = it.align === 'left' ? cx - px * 0.35 : it.align === 'right' ? cx - w + px * 0.35 : cx - w / 2;
      return [x0, cy - hgt / 2, x0 + w, cy + hgt / 2];
    }
    const e = HH.elements[s.id], sz = k * e.size, cx = e.x * W, cy = e.y * H;
    const r = (w: number, hh: number, dy = 0): Box => [cx - (w * sz) / 2, cy - (hh * sz) / 2 + dy * sz, cx + (w * sz) / 2, cy + (hh * sz) / 2 + dy * sz];
    switch (s.id) {
      case 'icon': return r(460, 460);
      case 'lyrics': { const ls = HH.lyrics.style; return ['apple', 'spotify'].includes(ls) ? r(1000, 560) : ls === 'tate' ? r(300, 820) : ls === 'ring' ? r(620, 620) : r(1150, 260); }
      case 'text': return r(620, 150, 8);
      case 'readout': return r(440, 56);
      case 'phase': return r(240, 300, 30);
      case 'scope': return [cx - Math.min(W * 0.96, 1500 * sz) / 2, cy - 70 * sz, cx + Math.min(W * 0.96, 1500 * sz) / 2, cy + 70 * sz];
      case 'spectrum': {
        const st = HH.spectrumStyle;
        return st === 'radial' ? r(450, 450) : st === 'terrain' ? r(1000, 280) : st === 'dots' ? r(920, 240) : r(920, 180);
      }
    }
  };
  const selectables = (): NonNullable<Sel>[] => {
    const out: NonNullable<Sel>[] = [];
    for (let i = hudO().texts.length - 1; i >= 0; i--) {
      const it = hudO().texts[i];
      const end = it.end > it.start ? it.end : Infinity;
      if (t >= it.start - 0.01 && t <= end) out.push({ kind: 'text', item: it });
    }
    for (const id of ['readout', 'text', 'lyrics', 'icon', 'phase', 'scope', 'spectrum'] as HudElementId[]) if (hudO().elements[id].on) out.push({ kind: 'el', id });
    if (media.active && media.opts.mode === 'card') out.push({ kind: 'media' });
    return out;
  };
  const selLabel = (s: NonNullable<Sel>) => s.kind === 'el' ? HUD_LABELS[s.id] : s.kind === 'text' ? `テロップ「${s.item.text.split('\n')[0].slice(0, 12)}」` : '写真・動画カード';
  const selbox = $('selbox'), sellabel = $('sellabel');
  const updateSelBox = () => {
    const b = sel && boxOf(sel);
    if (!b || !comp) { selbox.hidden = true; return; }
    const cr = comp.canvas.getBoundingClientRect(), sr = $('screen').getBoundingClientRect();
    const sx = cr.width / env.width, sy = cr.height / env.height;
    selbox.hidden = false;
    Object.assign(selbox.style, {
      left: `${cr.left - sr.left + b[0] * sx - 4}px`, top: `${cr.top - sr.top + b[1] * sy - 4}px`,
      width: `${(b[2] - b[0]) * sx + 8}px`, height: `${(b[3] - b[1]) * sy + 8}px`,
    });
    sellabel.textContent = selLabel(sel!);
  };
  const setSel = (s: Sel, reveal = true) => {
    sel = s;
    document.querySelectorAll('.item.sel').forEach((e) => e.classList.remove('sel'));
    if (s && reveal) {
      const tab: TabId = s.kind === 'text' ? 'telop' : s.kind === 'media' ? 'media' : s.id === 'text' ? 'title' : s.id;
      showTab(tab);
      const key = s.kind === 'text' ? `t${s.item.id}` : s.kind === 'media' ? 'media' : s.id;
      const el = document.querySelector<HTMLElement>(`.item[data-key="${key}"]`);
      if (el) { el.classList.add('sel'); el.classList.remove('closed'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
    updateSelBox();
    renderLayers();
  };

  function attachPointer(cv: HTMLCanvasElement) {
    let drag: { s: NonNullable<Sel>; dx: number; dy: number } | null = null;
    // pinch-to-resize on touch screens
    const pts = new Map<number, [number, number]>();
    let pinch: { d0: number; size0: number } | null = null;
    const sizeOf = (s: NonNullable<Sel>) => s.kind === 'text' ? s.item.size : s.kind === 'media' ? media.opts.size : hudO().elements[s.id].size;
    const setSize = (s: NonNullable<Sel>, v: number) => {
      if (s.kind === 'text') s.item.size = Math.min(300, Math.max(12, v));
      else if (s.kind === 'media') media.opts.size = Math.min(3, Math.max(0.2, v));
      else hudO().elements[s.id].size = Math.min(3, Math.max(0.2, v));
    };
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    const rel = (ev: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
    const posOf = (s: NonNullable<Sel>): { x: number; y: number } => s.kind === 'text' ? s.item : s.kind === 'media' ? media.opts : hudO().elements[s.id];
    cv.onpointerdown = (ev) => {
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 2 && sel) { drag = null; pinch = { d0: dist(), size0: sizeOf(sel) }; return; }
      const [x, y] = rel(ev);
      const px = x * env.width, py = y * env.height;
      const hit = selectables().find((s) => { const b = boxOf(s); return b && px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3]; }) ?? null;
      setSel(hit);
      if (hit) {
        const p = posOf(hit);
        drag = { s: hit, dx: p.x - x, dy: p.y - y };
        cv.setPointerCapture(ev.pointerId);
        cv.style.cursor = 'grabbing';
      }
    };
    cv.onpointermove = (ev) => {
      if (pts.has(ev.pointerId)) pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && sel && pts.size === 2) { setSize(sel, pinch.size0 * (dist() / Math.max(1, pinch.d0))); refreshAll(); touch(); updateSelBox(); return; }
      const [x, y] = rel(ev);
      if (!drag) {
        const px = x * env.width, py = y * env.height;
        const over = selectables().some((s) => { const b = boxOf(s); return b && px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3]; });
        cv.style.cursor = over ? 'grab' : 'default';
        return;
      }
      const p = posOf(drag.s);
      p.x = Math.round(Math.min(1, Math.max(0, x + drag.dx)) * 1000) / 1000;
      p.y = Math.round(Math.min(1, Math.max(0, y + drag.dy)) * 1000) / 1000;
      refreshAll(); touch(); updateSelBox();
    };
    cv.onpointerup = cv.onpointercancel = (ev: PointerEvent) => { pts.delete(ev.pointerId); if (pts.size < 2) pinch = null; drag = null; cv.style.cursor = 'grab'; };
    cv.onwheel = (ev) => {
      if (!sel) return;
      ev.preventDefault();
      const f = Math.exp(-ev.deltaY * 0.0015);
      setSize(sel, sizeOf(sel) * f);
      refreshAll(); touch(); updateSelBox();
    };
  }

  // ============================================================ panels
  const TABS = [
    { id: 'slot', label: 'おまかせ', ic: '🎲', c: '#ff5c93' },
    { id: 'song', label: '曲・BPM', ic: '♪', c: '#5b9dff' },
    { id: 'theme', label: 'テーマ・シーン', ic: '◐', c: '#3ee6c4' },
    { id: 'media', label: '写真・動画', ic: '▣', c: '#ff5c93' },
    { id: 'icon', label: 'アイコン', ic: '◉', c: '#ffb347' },
    { id: 'title', label: '曲名・@名前', ic: 'Aa', c: '#ffb347' },
    { id: 'lyrics', label: '歌詞', ic: '♫', c: '#d07cff' },
    { id: 'telop', label: 'テロップ', ic: 'T', c: '#ffcc4d' },
    { id: 'spectrum', label: 'スペアナ', ic: '▮▮', c: '#9b8cff' },
    { id: 'scope', label: '波形', ic: '∿', c: '#9b8cff' },
    { id: 'phase', label: '位相', ic: '◎', c: '#9b8cff' },
    { id: 'readout', label: 'BPM・時間', ic: '#', c: '#9b8cff' },
    { id: 'fx', label: 'エフェクト・色', ic: '✧', c: '#5be38a' },
    { id: 'export', label: '書き出し', ic: '↧', c: '#ff5c93' },
  ] as const;
  type TabId = typeof TABS[number]['id'];
  /** the layer list on the left: every element of the video, grouped, one click to edit */
  const LAYER_GROUPS: { label: string; tabs: TabId[] }[] = [
    { label: '曲', tabs: ['song'] },
    { label: '背景', tabs: ['theme', 'media'] },
    { label: '文字・アイコン', tabs: ['icon', 'title', 'lyrics', 'telop'] },
    { label: 'メーター', tabs: ['spectrum', 'scope', 'phase', 'readout'] },
    { label: '仕上げ', tabs: ['fx'] },
  ];
  /** layers that are HUD elements (have an on/off eye) */
  const LAYER_EL: Partial<Record<TabId, HudElementId>> = { icon: 'icon', title: 'text', lyrics: 'lyrics', spectrum: 'spectrum', scope: 'scope', phase: 'phase', readout: 'readout' };
  const panel = $('panel'), layersEl = $('layers');
  const panes = {} as Record<TabId, HTMLElement>;
  let curTab: TabId = 'slot';
  let prevTab: TabId | null = null;
  let exportRange: () => [number, number] = () => [0, env.analysis.duration];
  let lyricsListUpdate = () => {};
  let renderTelops = () => {};
  let renderMediaGrid = () => {};
  const addMedia = async (files: File[]) => {
    for (const f of files) { try { await media.add(f); } catch (e) { console.error(e); toast(`${f.name} を読み込めませんでした`); } }
    renderMediaGrid(); slotMediaUpdate(); replanChaos(); touch();
  };
  let slotMediaUpdate = () => {};
  let lyricsRender = () => {};

  function showTab(id: TabId) {
    curTab = id;
    for (const tb of TABS) panes[tb.id].hidden = tb.id !== id;
    renderLayers();
    document.body.classList.toggle('show-inspector', true);
    if (prevTab !== id) panel.scrollTop = 0;
    prevTab = id;
    setTimeout(() => timeline.invalidate()); // the export range shading depends on the open page
  }
  let layerSig = '';
  function renderLayers(force = false) {
    const H = hudO();
    const sig = JSON.stringify([curTab, sel && (sel.kind === 'text' ? sel.item.id : sel.kind === 'el' ? sel.id : 'm'), H.texts.map((x) => [x.id, x.text.slice(0, 20)]), Object.values(H.elements).map((e) => e.on), media.items.length, media.opts.only, def.id, sceneOpt.enabled, chaos.enabled]);
    if (!force && sig === layerSig) return;
    layerSig = sig;
    const row = (id: TabId, sub = '') => {
      const tb = TABS.find((x) => x.id === id)!;
      const elId = LAYER_EL[id];
      const off = elId ? !H.elements[elId].on : false;
      const r = h<HTMLDivElement>(`<div class="layer${curTab === id ? ' on' : ''}${off ? ' off' : ''}" role="button" tabindex="0" data-layer="${id}"><span class="lic" style="--c:${tb.c}">${tb.ic}</span><span class="lname">${tb.label}${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`);
      r.onclick = () => { showTab(id); if (elId && H.elements[elId].on) setSel({ kind: 'el', id: elId }, false); };
      r.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.click(); } };
      if (elId) {
        const eye = h<HTMLButtonElement>(`<button class="eye" title="${off ? '表示する' : '隠す'}">${off ? '○' : '●'}</button>`);
        eye.onclick = (e) => { e.stopPropagation(); H.elements[elId].on = !H.elements[elId].on; if (!H.elements[elId].on && sel?.kind === 'el' && sel.id === elId) setSel(null); refreshAll(); touch(); renderLayers(true); };
        r.append(eye);
      }
      return r;
    };
    const themeSub = media.opts.only && media.items.length ? '素材だけ' : chaos.enabled ? 'スーパースロット' : sceneOpt.enabled ? `${sceneOpt.scenes.length}シーン` : def.name;
    const subs: Partial<Record<TabId, string>> = { theme: themeSub, media: media.items.length ? `${media.items.length}個` : 'なし', telop: H.texts.length ? `${H.texts.length}個` : 'なし', song: `${env.analysis.bpm} BPM` };
    const nodes: HTMLElement[] = [];
    const auto = h<HTMLButtonElement>(`<button class="btn btn-mint btn-block layer-auto${curTab === 'slot' ? ' on' : ''}" data-layer="slot">🎲 おまかせで作る</button>`);
    auto.onclick = () => showTab('slot');
    nodes.push(auto);
    for (const g of LAYER_GROUPS) {
      nodes.push(h(`<div class="lgroup">${g.label}</div>`));
      for (const id of g.tabs) {
        nodes.push(row(id, subs[id] ?? ''));
        if (id === 'telop') {
          for (const it of [...H.texts].reverse()) {
            const tr = h<HTMLDivElement>(`<div class="layer child${sel?.kind === 'text' && sel.item.id === it.id ? ' on' : ''}" role="button" tabindex="0"><span class="lname" data-no-i18n>${esc(it.text.split('\n')[0] || '(空)')}<small>${fmt(it.start)}</small></span></div>`);
            tr.onclick = () => { showTab('telop'); if (t < it.start || (it.end > it.start && t > it.end)) seek(it.start + 0.05); setSel({ kind: 'text', item: it }); };
            nodes.push(tr);
          }
        }
      }
    }
    const exp = h<HTMLButtonElement>(`<button class="btn btn-pink btn-block layer-export" data-layer="export">書き出し →</button>`);
    exp.onclick = () => showTab('export');
    nodes.push(exp);
    layersEl.replaceChildren(...nodes);
  }
  const paneHead = (tb: typeof TABS[number], sub: string) =>
    h(`<div class="ptitle" style="--c:${tb.c}"><span class="pic">${tb.ic}</span><h2>${tb.label}</h2><p>${sub}</p></div>`);

  const fontSelect = (label: string, get: () => FontId, set: (v: FontId) => void) => {
    const f = h(`<div class="field"><span>${esc(label)}</span><select>${(Object.keys(FONTS) as FontId[]).map((k) => `<option value="${k}" style="font-family:${FONTS[k].family.replace(/"/g, "'")}">${FONTS[k].label}</option>`).join('')}</select></div>`);
    const se = f.querySelector('select')!;
    const paint = () => { se.style.fontFamily = FONTS[se.value as FontId].family; };
    se.onchange = () => { set(se.value as FontId); paint(); ensureFont(se.value as FontId).then(touch); touch(); };
    return bind(f, () => { se.value = get(); paint(); });
  };
  const itemBox = (key: string, title: string, right: HTMLElement[] = [], open = false) => {
    const box = h(`<div class="item${open ? '' : ' closed'}" data-key="${key}"><div class="item-head"><span class="name">${esc(title)}</span></div><div class="item-body"></div></div>`);
    const head = box.querySelector('.item-head')!;
    head.append(...right);
    box.querySelector('.name')!.addEventListener('click', () => box.classList.toggle('closed'));
    return { box, body: box.querySelector('.item-body') as HTMLElement, head };
  };
  const elementControls = (id: HudElementId) => [
    posPad('位置', () => [hudO().elements[id].x, hudO().elements[id].y], (x, y) => { hudO().elements[id].x = x; hudO().elements[id].y = y; updateSelBox(); }),
    slider('サイズ', 0.2, 3, 0.05, () => hudO().elements[id].size, (v) => { hudO().elements[id].size = v; updateSelBox(); }, (v) => `${Math.round(v * 100)}%`),
  ];
  const elToggle = (id: HudElementId) => {
    const tg = toggle('', () => hudO().elements[id].on, (v) => { hudO().elements[id].on = v; if (!v && sel?.kind === 'el' && sel.id === id) setSel(null); });
    tg.onclick = (e) => e.stopPropagation();
    return tg;
  };

  // ---- 🎰 slot machine
  let lastMood: MoodId | null = saved?.slot?.mood ?? null;
  lastMoodRef = () => lastMood;
  let lastLayout = saved?.slot?.layout ?? 'いまの配置';
  let lastTier = saved?.slot?.tier ?? '—';
  let slotWords: string = saved?.slot?.words ?? '';
  let forceMood: MoodId | 'auto' = saved?.slot?.force ?? 'auto';
  const locks = new Set<ReelId>(saved?.slot?.locks ?? []);
  let spinning = false;
  const measureFor = (q: { el?: HudElementId; text?: TextItem; card?: boolean }, r: Partial<Recipe>) => {
    const HH: HudOptions = { ...hudO(), elements: r.layout?.elements ?? hudO().elements, spectrumStyle: r.meter?.spectrumStyle ?? hudO().spectrumStyle, lyrics: { ...hudO().lyrics, style: r.layout?.lyricsStyle ?? hudO().lyrics.style } };
    const MO = r.layout?.card ?? media.opts;
    if (q.text) return boxOf({ kind: 'text', item: q.text }, HH, MO);
    if (q.card) return boxOf({ kind: 'media' }, HH, MO);
    return boxOf({ kind: 'el', id: q.el! }, HH, MO);
  };
  const captureRecipe = (): Recipe => ({
    mood: lastMood ?? 'liquid',
    theme: { tpl: def.id, seed: env.seed, params: { intensity: env.params.intensity, speed: env.params.speed, hue: env.params.hue } },
    color: { ...hudO().colors },
    media: { mode: media.opts.mode, blend: media.opts.blend, beatsPerCut: media.opts.beatsPerCut, mix: media.opts.mix, motion: media.opts.motion, tilt: media.opts.tilt },
    layout: { name: lastLayout, elements: structuredClone(hudO().elements), iconShape: hudO().iconShape, card: { x: media.opts.x, y: media.opts.y, size: media.opts.size }, lyricsStyle: hudO().lyrics.style },
    font: { title: hudO().titleFont, user: hudO().userFont, lyrics: hudO().lyricsFont, telop: hudO().texts[0]?.font ?? 'maru' },
    meter: { spectrumStyle: hudO().spectrumStyle, scope: hudO().elements.scope.on, phase: hudO().elements.phase.on, readout: hudO().elements.readout.on },
    fx: { glitter: hudO().glitter, bloom: hudO().bloom, dim: hudO().dim, iconFx: { ...hudO().iconFx }, tier: lastTier },
    telop: { items: structuredClone(hudO().texts) },
  });
  const applyRecipe = (r: Recipe) => {
    def = TEMPLATES.find((d) => d.id === r.theme.tpl) ?? def;
    env.seed = r.theme.seed;
    env.params = { ...defaultParams(def), ...r.theme.params };
    const H = hudO();
    H.colors = { ...r.color };
    Object.assign(media.opts, r.media, { x: r.layout.card.x, y: r.layout.card.y, size: r.layout.card.size });
    H.elements = structuredClone(r.layout.elements);
    H.iconShape = r.layout.iconShape;
    H.lyrics.style = r.layout.lyricsStyle;
    H.titleFont = r.font.title; H.userFont = r.font.user; H.lyricsFont = r.font.lyrics;
    H.spectrumStyle = r.meter.spectrumStyle;
    H.glitter = r.fx.glitter; H.bloom = r.fx.bloom; H.dim = r.fx.dim; H.iconFx = { ...r.fx.iconFx };
    H.texts = structuredClone(r.telop.items);
    lastMood = r.mood; lastLayout = r.layout.name; lastTier = r.fx.tier;
    if (sceneOpt.enabled) replanScenes(r.theme.seed, true);
    for (const f of Object.values(r.font)) ensureFont(f).then(() => { dirty = true; });
    rebuildTemplate(); rebuildOutput(); renderTelops(); setSel(null);
    refreshAll(); lyricsRender(); timeline.invalidate(); touch(); saveSlot();
  };
  slotWordsRef = () => slotWords;
  getSlot = () => ({ mood: lastMood, layout: lastLayout, tier: lastTier, words: slotWords, force: forceMood, locks: [...locks] });
  const saveSlot = () => save();
  const labelCtx = {
    templates: TEMPLATES.map((d) => ({ id: d.id, name: d.name })),
    spectrumNames: SPECTRUM_STYLES as Record<string, string>,
    fontNames: Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.label])),
    filterNames: ICON_FILTERS as Record<string, string>,
  };
  const reelRows = {} as Record<ReelId, { row: HTMLElement; strip: HTMLElement; lock: HTMLButtonElement }>;
  const reelItemHTML = (id: ReelId, r: Recipe | null, raw?: string) => {
    if (id === 'color' && r) return `<span class="sw2" style="background:${r.color.accent}"></span><span class="sw2" style="background:${r.color.accent2}"></span><span>${esc(r.color.accent)} / ${esc(r.color.accent2)}</span>`;
    if (id === 'font' && r) return `<span style="font-family:${FONTS[r.font.title].family.replace(/"/g, "'")}">${esc(FONTS[r.font.title].label)}</span><small> × </small><span style="font-family:${FONTS[r.font.telop].family.replace(/"/g, "'")}">${esc(FONTS[r.font.telop].label)}</span>`;
    if (id === 'theme' && r && sceneOpt.enabled && sceneOpt.scenes.length) {
      const names = [...new Set(sceneOpt.scenes.map((s) => TEMPLATES.find((d) => d.id === s.tpl)?.name ?? s.tpl))];
      return esc(`${sceneOpt.scenes.length}シーン · ${names.slice(0, 2).join('→')}${names.length > 2 ? '…' : ''}`);
    }
    return esc(raw ?? (r ? reelLabel(id, r, labelCtx) : '—'));
  };
  const spinCandidates = (id: ReelId): string[] => {
    switch (id) {
      case 'mood': return Object.values(MOODS).map((m) => `${m.emoji} ${m.name}`);
      case 'theme': return TEMPLATES.map((d) => d.name);
      case 'color': return ['🎨', '🌈', '💖', '💙', '💛', '💜'];
      case 'media': return ['背景', '3Dカード', '2拍で切替', '1小節で切替', '素材なし'];
      case 'layout': return ['センター', 'サイドプロフィール', 'コーナー', 'サークル', 'カード主役', 'ミニマル'];
      case 'font': return Object.values(FONTS).map((f) => f.label);
      case 'meter': return Object.values(SPECTRUM_STYLES);
      case 'fx': return ['控えめ', 'ふつう', 'ド派手', 'VHS', 'デュオトーン', '虹色'];
      case 'telop': return (slotWords.split('\n').filter((w) => w.trim()).length ? slotWords.split('\n').filter((w) => w.trim()) : ['NEW TRACK', 'OUT NOW', meta.title || '♪']);
    }
  };
  const renderReelFinal = (r: Recipe) => { for (const rr of REELS) reelRows[rr.id].strip.innerHTML = `<div class="r-item">${reelItemHTML(rr.id, r)}</div>`; };
  const spin = async () => {
    if (spinning) return;
    spinning = true;
    machine.classList.remove('won');
    const cur = captureRecipe();
    const seed = Math.floor(Math.random() * 1e9);
    const ctx = {
      A: env.analysis, aspect: view.aspect, W: env.width, H: env.height,
      hasAvatar: !!meta.avatar, mediaCount: media.items.length, hasVideo: media.items.some((m) => m.kind === 'video'),
      mediaAspect: media.items[0] ? media.items[0].width / media.items[0].height : 16 / 9,
      words: slotWords.split('\n').map((w) => w.trim()).filter(Boolean), lyrics: !!hudO().lyrics.text.trim(),
      title: meta.title, username: meta.username, templates: labelCtx.templates, measure: measureFor,
    };
    let next: Recipe;
    try { next = roll(ctx, cur, locks, seed, forceMood === 'auto' ? undefined : forceMood); }
    catch (e) { console.error(e); spinning = false; toast('生成に失敗しました。もう一度スピンしてください'); return; }
    seedLab.textContent = `#${seed.toString(36).toUpperCase()}`;
    const ROW = reelRows.mood.row.querySelector<HTMLElement>('.r-win')!.clientHeight || 34;
    const anims: Promise<unknown>[] = [];
    REELS.forEach((rr, i) => {
      const { strip, row } = reelRows[rr.id];
      if (locks.has(rr.id)) { row.classList.add('held'); setTimeout(() => row.classList.remove('held'), 600); return; }
      const cands = spinCandidates(rr.id);
      const n = 14 + i * 2;
      const items = Array.from({ length: n }, () => `<div class="r-item">${esc(cands[Math.floor(Math.random() * cands.length)])}</div>`);
      strip.innerHTML = items.join('') + `<div class="r-item">${reelItemHTML(rr.id, next)}</div>`;
      const a = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-n * ROW}px)` }],
        { duration: 650 + i * 160, easing: 'cubic-bezier(.12,.75,.25,1.12)', fill: 'forwards' });
      anims.push(a.finished.then(() => { row.classList.add('stop'); setTimeout(() => row.classList.remove('stop'), 300); }));
    });
    await Promise.all(anims);
    applyRecipe(next);
    renderReelFinal(next);
    REELS.forEach((rr) => reelRows[rr.id].strip.getAnimations().forEach((a) => a.cancel()));
    machine.classList.add('won');
    spinning = false;
  };
  const machine = h(`<div class="slot-machine"><div class="slot-top"><span class="slot-title">🎰 おまかせ生成</span><span class="slot-seed"></span></div><div class="reels"></div></div>`);
  const seedLab = machine.querySelector<HTMLElement>('.slot-seed')!;
  {
    const tb = TABS.find((x) => x.id === 'slot')!, p = h('<div></div>');
    p.append(paneHead(tb, '素材を入れてスピン'));
    const reels = machine.querySelector('.reels')!;
    for (const rr of REELS) {
      const row = h(`<div class="reel"><span class="r-ic">${rr.emoji}</span><span class="r-name">${rr.label}</span><div class="r-win"><div class="r-strip"></div></div><button class="r-lock" title="ロックするとスピンしても変わりません">🔓</button></div>`);
      const lock = row.querySelector<HTMLButtonElement>('.r-lock')!;
      lock.onclick = () => { if (locks.has(rr.id)) locks.delete(rr.id); else locks.add(rr.id); syncLock(); saveSlot(); };
      const syncLock = () => { const on = locks.has(rr.id); lock.textContent = on ? '🔒' : '🔓'; row.classList.toggle('locked', on); };
      syncLock();
      reels.append(row);
      reelRows[rr.id] = { row, strip: row.querySelector<HTMLElement>('.r-strip')!, lock };
    }
    renderReelFinal(captureRecipe());
    const lever = h<HTMLButtonElement>(`<button class="btn btn-pink btn-block lever">🎰 スピン！ <kbd>R</kbd></button>`);
    lever.onclick = () => spin();
    const unlock = h<HTMLButtonElement>(`<button class="btn btn-sm">ロックを全部はずす</button>`);
    unlock.onclick = () => { locks.clear(); REELS.forEach((rr) => { reelRows[rr.id].lock.textContent = '🔓'; reelRows[rr.id].row.classList.remove('locked'); }); saveSlot(); };
    p.append(machine, lever, h('<div style="display:flex;justify-content:flex-end;margin-top:6px"></div>'));
    (p.lastElementChild as HTMLElement).append(unlock);
    p.append(hint('気に入った項目は 🔒 で固定して、ほかだけ回し直せます。⌘Z で前の結果に戻れます。'));
    // ---- SUPER SLOT (chaos network)
    const chaosCard = h(`<div class="chaos-card"><div class="chaos-title">🌀 スーパースロット <small>カオス・ネットワーク</small></div>
      <p>テーマと写真・動画が「生き物」になります。曲の音をエサとして奪い合い、エサを得たものは変異した子を産み、飢えたものや年老いたものは死んで二度と戻りません。ドロップでは大量絶滅が起こります。世代を重ねるうちに群れは曲に適応し、曲の終わりは始まりとは別の世界になります。</p></div>`);
    const chaosBtn = h<HTMLButtonElement>(`<button class="btn btn-block chaos-btn">🌀 カオスを回す</button>`);
    chaosBtn.onclick = () => { chaos.enabled = true; chaos.seed = Math.floor(Math.random() * 1e9); replanChaos(); refreshAll(); touch(); toast('ネットワークを生成しました'); };
    chaosCard.append(
      toggle('スーパースロットモード', () => chaos.enabled, (v) => { chaos.enabled = v; replanChaos(); }),
      chaosBtn,
      slider('カオス度', 0.3, 1.6, 0.05, () => chaos.level, (v) => { chaos.level = v; clearTimeout(chaosTimer); chaosTimer = window.setTimeout(replanChaos, 250); }),
      slider('進化の速さ', 0.3, 2.5, 0.05, () => chaos.evolve ?? 1, (v) => { chaos.evolve = v; clearTimeout(chaosTimer); chaosTimer = window.setTimeout(replanChaos, 250); }),
      hint('写真・動画が多いほどネットワークが育ちます。通常モードに戻すにはスイッチをオフ。'),
    );
    const eco = h(`<div class="eco"><div class="eco-h">🧬 生態系の記録 <a href="./about.html#alife" target="_blank" rel="noopener">しくみ ↗</a></div><canvas></canvas><div class="eco-legend">${ECO_LEGEND}</div></div>`);
    ecoCanvas = eco.querySelector('canvas');
    chaosCard.append(eco);
    // ---- manual chaos: tap along with the music, every tap re-rolls the whole ecosystem at that moment
    const tapBox = h(`<div class="ctap"><div class="eco-h">🥁 手動カオス（タップ記録）</div>
      <p>再生しながら下のボタンか <kbd>C</kbd> キーを押すと、その瞬間にカオスが総入れ替えされ、時間が記録されます（歌詞のタップと同じ）。曲に合わせて連打してみてください。</p></div>`);
    const tapBtn = h<HTMLButtonElement>(`<button class="btn btn-block chaos-btn">🌀 ここでカオス！ <kbd>C</kbd></button>`);
    tapBtn.onclick = () => chaosTap();
    const tapList = h('<div class="ctap-list"></div>');
    const undoTap = h<HTMLButtonElement>('<button class="btn btn-sm">最後を取り消す</button>');
    undoTap.onclick = () => { if (!chaos.taps?.length) return; chaos.taps.pop(); afterTaps(); };
    const clearTaps = h<HTMLButtonElement>('<button class="btn btn-sm">すべて消す</button>');
    clearTaps.onclick = () => { chaos.taps = []; afterTaps(); };
    const acts = h('<div class="ctap-acts"></div>'); acts.append(undoTap, clearTaps);
    tapBox.append(tapBtn, toggle('拍にそろえる', () => chaos.snap !== false, (v) => (chaos.snap = v)), bind(tapList, () => {
      const ts = chaos.taps ?? [];
      tapList.replaceChildren(...(ts.length ? [h(`<span class="ctap-n">${ts.length}回</span>`)] : [h('<span class="ctap-n">まだ記録はありません</span>')]),
        ...[...ts].sort((x, y) => x - y).map((x) => {
          const c = h<HTMLButtonElement>(`<button class="ctap-chip" title="クリックでこの位置へ／右の×で削除">${fmt(x)}<i>×</i></button>`);
          c.onclick = (e) => { if ((e.target as HTMLElement).tagName === 'I') { chaos.taps = (chaos.taps ?? []).filter((y) => y !== x); afterTaps(); } else seek(x); };
          return c;
        }));
    }), acts);
    chaosCard.append(tapBox);
    requestAnimationFrame(drawEco);
    p.append(chaosCard);
    p.append(sec('雰囲気'), seg(null, [['auto', '🎲 曲から判断'], ...Object.entries(MOODS).map(([k, m]) => [k, `${m.emoji} ${m.name}`] as [string, string])], () => forceMood, (v) => { forceMood = v as MoodId | 'auto'; saveSlot(); }));
    p.append(sec('ぶち込む素材'));
    const words = h<HTMLTextAreaElement>(`<textarea rows="4" placeholder="テロップにしたい言葉を1行ずつ\n例）NEW SINGLE\n12.24 配信\n夜の東京を泳ぐ"></textarea>`);
    words.value = slotWords;
    words.oninput = () => { slotWords = words.value; saveSlot(); };
    p.append(words, hint('曲の展開（サビ頭・切り替わり）に合わせて自動で配置されます。空なら曲名などから自動で作ります。'));
    const mediaInfo = h('<p class="hint"></p>');
    slotMediaUpdate = () => { mediaInfo.textContent = media.items.length ? `📦 素材 ${media.items.length}個（写真${media.items.filter((m) => m.kind === 'image').length}・動画${media.items.filter((m) => m.kind === 'video').length}）` : '素材はまだありません（なくても生成できます）'; };
    slotMediaUpdate();
    p.append(fileDrop('📷 写真・🎬 動画をドロップ（複数OK）', 'image/*,video/*', true, addMedia), mediaInfo);
    const up = h(`<div class="upload"><div class="thumb"></div></div>`);
    const th = up.querySelector<HTMLElement>('.thumb')!;
    const showAv = () => { th.style.backgroundImage = meta.avatar ? `url(${meta.avatar.toDataURL('image/jpeg', 0.6)})` : ''; };
    up.append(fileDrop('👤 アイコン画像', 'image/*', false, async ([f]) => { meta.avatar = await imageToSquare(f, 512); showAv(); touch(); refreshAll(); }));
    bind(up, showAv);
    p.append(up);
    panes.slot = p;
  }

  // ---- 🎵 song
  const songInfo = h('<div></div>');
  const renderSongInfo = () => {
    const A = env.analysis;
    const colors = ['#6f87a8', '#e0b23c', '#ff5c93', '#9b8cff'];
    const names = ['イントロ/ブレイク', 'ビルド', 'ドロップ', 'アウトロ'];
    songInfo.innerHTML = `
      <div class="kv"><b>ファイル</b><span>${esc(song.name)}</span><b>長さ</b><span>${fmt(A.duration)}</span><b>BPM</b><span>${A.bpm}${A.tempoDrift > 0.3 ? `（テンポのゆれ ±${A.tempoDrift.toFixed(1)}、拍の位置は自動で追従）` : ''}</span></div>
      <div class="sections">${A.sections.map((s) => `<span title="${names[s.type]} ${fmt(s.start)}" style="flex:${s.end - s.start};background:${colors[s.type]}"></span>`).join('')}</div>
      <div class="hint">${A.sections.map((s) => `${names[s.type]} ${fmt(s.start)}`).join(' → ')}</div>`;
    $('songchip').innerHTML = `🎵 <b data-no-i18n>${esc(song.name)}</b><span class="tag">${A.bpm} BPM</span><span class="tag">${fmt(A.duration)}</span>`;
  };
  const applyBpm = (bpm: number) => {
    Object.assign(env.analysis, computeStructure(song.F, bpm));
    renderSongInfo(); replanScenes(sceneOpt.seed, true); replanChaos(); timeline.invalidate(); touch(); toast(`BPM を ${bpm} にしました`);
  };
  {
    const tb = TABS.find((x) => x.id === 'song')!, p = h('<div></div>');
    p.append(paneHead(tb, '曲の読み込みとBPM'));
    p.append(sec('いまの曲'), songInfo);
    const bpmRow = h(`<div class="field"><span>BPMを補正</span><div style="display:flex;gap:6px"><button class="btn btn-sm">÷2</button><button class="btn btn-sm">×2</button><input type="number" step="0.1" style="width:90px"><button class="btn btn-sm btn-mint">適用</button></div></div>`);
    const [half, dbl, ap] = [...bpmRow.querySelectorAll('button')];
    const bin = bpmRow.querySelector('input')!;
    bin.value = String(env.analysis.bpm);
    half.onclick = () => applyBpm(Math.round(env.analysis.bpm / 2 * 100) / 100);
    dbl.onclick = () => applyBpm(Math.round(env.analysis.bpm * 2 * 100) / 100);
    ap.onclick = () => { const v = +bin.value; if (v > 40 && v < 300) applyBpm(v); };
    p.append(bpmRow, hint('DnBなどで半分/倍のテンポで検出されたときに使います。ビートや展開の判定が更新されます。'));
    p.append(sec('別の曲に変更'), fileDrop('🎵 曲をドロップ / クリックで選択', 'audio/*,.mp3,.m4a,.mp4,.aac,.wav,.flac,.ogg,.opus,.aif,.aiff', false, ([f]) => loadSong(f, f.name)));
    p.append(sec('プレビュー画質'), seg(null, [['360', '軽い'], ['540', '標準'], ['720', '高'], ['1080', '最高']], () => String(view.q), (v) => {
      view.q = +v; applyView(); rebuildOutput(); rebuildTemplate();
    }), hint('重いときは「軽い」に。書き出しの画質には影響しません。'));
    panes.song = p;
  }

  // ---- 🌈 theme
  const thumbs: Record<string, string> = {};
  const themeCards: Record<string, HTMLElement> = {};
  {
    const tb = TABS.find((x) => x.id === 'theme')!, p = h('<div></div>');
    p.append(paneHead(tb, '映像のベースを選ぶ'));
    p.append(sec('画面の形'), seg(null, [['16:9', '横 16:9'], ['1:1', '正方形 1:1'], ['9:16', '縦 9:16']], () => view.aspect, (v) => { view.aspect = v as Aspect; applyView(); rebuildOutput(); rebuildTemplate(); timeline.invalidate(); }), hint('横はX・YouTube、正方形はX・インスタ、縦はリール・TikTok・ショート向け。'));
    p.append(mediaOnlyToggle());
    const cards = h('<div class="cards"></div>');
    const emoji: Record<string, string> = {
      caustics: '🌊', highway: '🌃', sky: '☁️', aurora: '🌌', nebula: '✨', y2k: '💾', train: '🚃', jacket: '💿',
      puddle: '🌧️', goldfish: '🐟', crt: '📺', danchi: '🏢', classroom: '🏫', jellyfish: '🪼', sakura: '🌸', wirecity: '🌆', constellation: '⭐', lcd: '🟥',
      kaleido: '🔮', ink: '🎨', rainglass: '☔', elevator: '🚀', torii: '⛩️', holoterrain: '⛰️', prism: '💎', dawnsea: '🌅', fireworks: '🎆', film: '🎞️',
      yatai: '🏮', ukiyowave: '🌊', reiho: '🗻', bamboo: '🎋', karesansui: '🪨', shinkansen: '🚄', sumi: '🖌️', momiji: '🍁', denkigai: '🔌', yukiguni: '❄️',
      warp: '🚀', orbital: '🛰️', dyson: '☀️', twinsun: '🏜️', cockpit: '🎯', blackhole: '🕳️', megacity: '🏙️', circuit: '🔌', planet: '🪐', portal: '🌀',
      lofiwindow: '🪟', vaporgrid: '🌴', citypop: '🌇', watercolor: '🎨', lavalamp: '🫧', stainedglass: '⛪', opart: '🌀', neontube: '💡', ascii: '⌨️', polyhedra: '🔷',
      bubbles: '🫧', speaker: '🔊', cassette: '📼', vinyl: '💿', discoball: '🪩', marble: '🌈', godrays: '🌤️', ferris: '🎡', ecg: '💓', pixeltown: '👾',
    };
    for (const d of TEMPLATES) {
      const c = h(`<button class="ocard" title="${esc(d.tagline)}"><div class="th">${emoji[d.id] ?? '🎬'}</div><div class="nm">${esc(d.name)}</div></button>`);
      c.onclick = () => {
        const sc = sceneOpt.enabled ? sceneOpt.scenes.find((x) => x.id === selScene) : null;
        if (sc) { sc.tpl = d.id; sc.lock = true; sceneListRender(); timeline.invalidate(); }
        else {
          def = d;
          env.params = { ...defaultParams(d), intensity: env.params.intensity, speed: env.params.speed, hue: env.params.hue };
          if (sceneOpt.enabled) { sceneOpt.enabled = false; sceneListRender(); toast('テーマ1つだけのモードにしました（シーンを選ぶとそのシーンだけ変えられます）'); }
        }
        refreshAll(); dirty = true; touch();
      };
      themeCards[d.id] = c;
      cards.append(c);
    }
    const tagline = h(`<p class="hint">${esc(def.tagline)}</p>`);
    const curTheme = () => { const sc = sceneOpt.enabled ? sceneOpt.scenes.find((x) => x.id === selScene) : null; return TEMPLATES.find((d) => d.id === (sc ? sc.tpl : def.id)) ?? def; };
    bind(cards, () => { const ct = curTheme(); for (const [id, c] of Object.entries(themeCards)) c.classList.toggle('on', id === ct.id); tagline.textContent = ct.tagline; });

    // ---- scene switching
    const sceneBox = h('<div class="scene-list"></div>');
    const tplOptions = TEMPLATES.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    const trOptions = Object.entries(TRANSITIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    sceneListRender = () => {
      sceneBox.hidden = !sceneOpt.enabled;
      sceneBox.replaceChildren(...sceneOpt.scenes.map((sc, i) => {
        const row = h(`<div class="scene-row${sc.id === selScene ? ' sel' : ''}"><span class="sc-time">${fmt(sc.start)}</span><select class="sc-tpl">${tplOptions}</select><select class="sc-tr" title="このシーンへの切り替え方">${trOptions}</select><button class="icon-btn sc-lock" title="固定（組み直しても変わらない）">${sc.lock ? '🔒' : '🔓'}</button></div>`);
        const [st, str] = row.querySelectorAll('select');
        st.value = sc.tpl; str.value = sc.trans; (str as HTMLSelectElement).disabled = i === 0;
        st.onchange = () => { sc.tpl = st.value; sc.lock = true; sceneListRender(); timeline.invalidate(); refreshAll(); dirty = true; touch(); };
        str.onchange = () => { sc.trans = str.value as TransitionType; touch(); };
        (row.querySelector('.sc-lock') as HTMLButtonElement).onclick = () => { sc.lock = !sc.lock; sceneListRender(); timeline.invalidate(); touch(); };
        row.onclick = (e) => { if ((e.target as HTMLElement).closest('select,button')) return; selectScene(sc.id, true); };
        return row;
      }));
    };
    const reroll = h<HTMLButtonElement>(`<button class="btn btn-mint btn-block">🎲 シーンを組み直す（🔒は残す）</button>`);
    reroll.onclick = () => { replanScenes(); refreshAll(); touch(); };
    p.append(sec('シーン切替'),
      toggle('曲の展開に合わせてテーマを切り替える', () => sceneOpt.enabled, (v) => { sceneOpt.enabled = v; if (v && !sceneOpt.scenes.length) replanScenes(); sceneListRender(); timeline.invalidate(); dirty = true; }),
      bind(h('<div></div>'), () => {}),
    );
    const splitSeg = seg('切替の細かさ', [['auto', 'おまかせ'], ['section', '展開ごと'], ['often', '4〜8小節']], () => sceneOpt.split, (v) => { sceneOpt.split = v as SplitMode; replanScenes(sceneOpt.seed); });
    p.append(splitSeg, reroll, hint('シーンをクリック（タイムラインの SCENE 帯でもOK）→ 下のテーマカードで差し替え。境目はタイムライン上でドラッグできます。'), sceneBox);
    bind(splitSeg, () => { splitSeg.hidden = !sceneOpt.enabled; reroll.hidden = !sceneOpt.enabled; });
    // mood filter (lots of themes)
    let filt: string = 'all';
    const applyFilter = () => {
      const ids = filt === 'all' ? null : Object.keys(MOODS[filt as MoodId].templates);
      for (const [id, c] of Object.entries(themeCards)) c.hidden = !!ids && !ids.includes(id);
    };
    const moodFilter = seg(null, [['all', 'すべて'], ...Object.entries(MOODS).map(([k, m]) => [k, `${m.emoji}${m.name}`] as [string, string])], () => filt, (v) => { filt = v; applyFilter(); });
    p.append(sec('テーマ'), moodFilter, cards, tagline);
    const dice = h<HTMLButtonElement>(`<button class="btn btn-mint btn-block">🎲 ランダムに生成し直す</button>`);
    const seedLabel = h(`<p class="hint" style="text-align:center"></p>`);
    const showSeed = () => { seedLabel.textContent = `シード #${env.seed}（同じ番号なら同じ映像になります）`; };
    dice.onclick = () => { env.seed = Math.floor(Math.random() * 1e6); showSeed(); rebuildTemplate(); rebuildOutput(); touch(); };
    bind(seedLabel, showSeed);
    p.append(sec('ゆらぎ'), dice, seedLabel);
    p.append(sec('動きと色'));
    for (const pd of COMMON_PARAMS) p.append(slider(pd.label, pd.min, pd.max, pd.step, () => env.params[pd.key], (v) => (env.params[pd.key] = v)));
    p.append(sec('ジャケット画像'), hint('「ジャケット・パルス」で中央に表示されます。'));
    const up = h(`<div class="upload"><div class="thumb"></div></div>`);
    const th = up.querySelector<HTMLElement>('.thumb')!;
    const showCover = () => { th.style.backgroundImage = meta.cover ? `url(${meta.cover.toDataURL('image/jpeg', 0.6)})` : ''; };
    up.append(fileDrop('画像を選ぶ', 'image/*', false, async ([f]) => { meta.cover = await imageToSquare(f, 1024); showCover(); rebuildTemplate(); touch(); }));
    showCover();
    p.append(up);
    panes.theme = p;
  }

  // ---- ◉ icon / Aa title
  const visibleRow = (id: HudElementId) => {
    const r = toggle('画面に表示する', () => hudO().elements[id].on, (v) => { hudO().elements[id].on = v; if (!v && sel?.kind === 'el' && sel.id === id) setSel(null); renderLayers(true); });
    r.classList.add('showrow');
    return r;
  };
  {
    const tb = TABS.find((x) => x.id === 'icon')!, p = h('<div></div>');
    p.append(paneHead(tb, 'SNSのアイコン画像'));
    p.append(visibleRow('icon'));
    const up = h(`<div class="upload"><div class="thumb"></div></div>`);
    const th = up.querySelector<HTMLElement>('.thumb')!;
    const showAv = () => { th.style.backgroundImage = meta.avatar ? `url(${meta.avatar.toDataURL('image/jpeg', 0.6)})` : ''; };
    up.append(fileDrop('アイコン画像を選ぶ', 'image/*', false, async ([f]) => { meta.avatar = await imageToSquare(f, 512); showAv(); touch(); }));
    showAv();
    p.append(sec('画像'), up);
    const ifx = () => hudO().iconFx;
    p.append(sec('形と配置'), seg('形', [['square', '正方形'], ['circle', '円形']], () => hudO().iconShape, (v) => (hudO().iconShape = v as 'square' | 'circle')), ...elementControls('icon'));
    p.append(
      sec('エフェクト'),
      seg('フィルター', Object.entries(ICON_FILTERS), () => ifx().filter, (v) => (ifx().filter = v as IconFilter)),
      seg('枠', Object.entries(ICON_FRAMES), () => ifx().frame, (v) => (ifx().frame = v as IconFrame)),
      slider('ビートで脈動', 0, 1.5, 0.05, () => ifx().pulse, (v) => (ifx().pulse = v)),
      slider('3Dゆらぎ', 0, 1.5, 0.05, () => ifx().tilt, (v) => (ifx().tilt = v)),
      slider('RGBずれ', 0, 1.5, 0.05, () => ifx().rgb, (v) => (ifx().rgb = v)),
      slider('グリッチ', 0, 1.5, 0.05, () => ifx().glitch, (v) => (ifx().glitch = v)),
      slider('発光', 0, 1.5, 0.05, () => ifx().glow, (v) => (ifx().glow = v)),
    );
    panes.icon = p;
  }
  {
    const tb = TABS.find((x) => x.id === 'title')!, p = h('<div></div>');
    p.append(paneHead(tb, '曲のタイトルとSNSのID'));
    p.append(visibleRow('text'));
    p.append(sec('文字'),
      text('曲名', () => meta.title, (v) => { meta.title = v; rebuildSoon(); }, '曲のタイトル'),
      text('@ユーザー名', () => meta.username, (v) => (meta.username = v), '@your_id'),
      text('アーティスト', () => meta.artist, (v) => (meta.artist = v), '任意'),
    );
    p.append(sec('フォント'),
      fontSelect('曲名', () => hudO().titleFont, (v) => (hudO().titleFont = v)),
      fontSelect('@名前', () => hudO().userFont, (v) => (hudO().userFont = v)),
    );
    p.append(sec('配置'), ...elementControls('text'));
    panes.title = p;
  }

  // ---- meters (one page each)
  {
    const tb = TABS.find((x) => x.id === 'spectrum')!, p = h('<div></div>');
    p.append(paneHead(tb, '周波数ごとの音量を表示'));
    p.append(visibleRow('spectrum'));
    const cards = h('<div class="cards"></div>');
    const glyph: Record<SpectrumStyle, string> = { wave: '〰️', capsule: '┃┃┃', dots: '⠿⠿', radial: '◎', terrain: '⛰️' };
    const grads: Record<SpectrumStyle, string> = {
      wave: 'linear-gradient(135deg,#1b2b4a,#3d2b5e)', capsule: 'linear-gradient(135deg,#123a3a,#1b2b4a)', dots: 'linear-gradient(135deg,#1a1a2e,#2c1a3e)',
      radial: 'linear-gradient(135deg,#2a1838,#14324a)', terrain: 'linear-gradient(135deg,#0f2a2e,#1c1838)',
    };
    const specCards: [SpectrumStyle, HTMLElement][] = (Object.keys(SPECTRUM_STYLES) as SpectrumStyle[]).map((k) => {
      const c = h(`<button class="ocard"><div class="th" style="background:${grads[k]};font-size:22px;color:#8ff0e5">${glyph[k]}</div><div class="nm">${SPECTRUM_STYLES[k]}</div></button>`);
      c.onclick = () => { hudO().spectrumStyle = k; hudO().elements.spectrum.on = true; specCards.forEach(([kk, cc]) => cc.classList.toggle('on', kk === k)); refreshAll(); touch(); updateSelBox(); renderLayers(true); };
      cards.append(c);
      return [k, c];
    });
    bind(cards, () => specCards.forEach(([k, c]) => c.classList.toggle('on', k === hudO().spectrumStyle)));
    p.append(sec('デザイン'), cards, sec('配置'), ...elementControls('spectrum'));
    panes.spectrum = p;
  }
  for (const [id, sub] of [['scope', 'オシロスコープ（音の波形）'], ['phase', 'ゴニオメーター（左右の広がり）'], ['readout', 'BPM・経過時間・拍のランプ']] as const) {
    const tb = TABS.find((x) => x.id === id)!, p = h('<div></div>');
    p.append(paneHead(tb, sub), visibleRow(id), sec('配置'), ...elementControls(id));
    panes[id] = p;
  }

  // ---- 🖼 media
  {
    const tb = TABS.find((x) => x.id === 'media')!, p = h('<div></div>');
    p.append(paneHead(tb, '自分の素材で個性を出す'));
    const grid = h('<div class="media-grid"></div>');
    const renderGrid = () => {
      grid.replaceChildren(...media.items.map((m) => {
        const c = h(`<div class="media-cell" style="background-image:url(${m.thumb})"><span class="k">${m.kind === 'video' ? '🎬' : '🖼️'}</span><button class="x" title="削除">✕</button></div>`);
        (c.querySelector('.x') as HTMLButtonElement).onclick = () => { media.remove(m.id); renderGrid(); touch(); };
        return c;
      }));
    };
    renderMediaGrid = renderGrid;
    p.append(fileDrop('📷 写真・🎬 動画をドロップ / クリックで追加（複数OK）', 'image/*,video/*', true, addMedia), grid, hint('複数入れると拍に合わせて切り替わるスライドショーになります。素材はこのブラウザ内だけで使われ、保存はされません。'));
    p.append(mediaOnlyToggle());
    p.append(sec('見せ方'));
    p.append(seg('表示', [['background', '背景'], ['card', '3Dカード'], ['off', 'オフ']], () => media.opts.mode, (v) => { media.opts.mode = v as MediaMode; updateSelBox(); }));
    p.append(seg('合成', [['screen', 'スクリーン'], ['add', '加算'], ['overlay', 'オーバーレイ'], ['normal', '通常']], () => media.opts.blend, (v) => (media.opts.blend = v as MediaBlend)));
    p.append(seg('切り替え', [['2', '2拍'], ['4', '1小節'], ['8', '2小節'], ['16', '4小節'], ['32', '8小節']], () => String(media.opts.beatsPerCut), (v) => (media.opts.beatsPerCut = +v)));
    p.append(slider('テーマの重なり', 0, 1, 0.01, () => media.opts.mix, (v) => (media.opts.mix = v)));
    p.append(slider('動き', 0, 2, 0.05, () => media.opts.motion, (v) => (media.opts.motion = v)));
    const card = itemBox('media', '3Dカードの配置', [], true);
    card.body.append(
      posPad('位置', () => [media.opts.x, media.opts.y], (x, y) => { media.opts.x = x; media.opts.y = y; updateSelBox(); }),
      slider('サイズ', 0.2, 3, 0.05, () => media.opts.size, (v) => { media.opts.size = v; updateSelBox(); }, (v) => `${Math.round(v * 100)}%`),
      slider('傾き', 0, 2, 0.05, () => media.opts.tilt, (v) => (media.opts.tilt = v)),
      slider('なじませ', 0, 1, 0.01, () => media.opts.soft ?? 0.6, (v) => (media.opts.soft = v), (v) => `${Math.round(v * 100)}%`),
      hint('0%で枠つきのカード、上げるほど縁がぼけて背景の色や光と混ざります。'),
    );
    p.append(card.box);
    panes.media = p;
  }

  // ---- 🎤 lyrics
  let tapCursor = -1;
  const L = () => hudO().lyrics;
  const flatLines = () => timeBlocks(L(), env.analysis).flatMap((b) => b.lines);
  const nextTapIndex = () => {
    const fl = flatLines();
    if (tapCursor >= 0 && tapCursor < fl.length) return tapCursor;
    const k = fl.findIndex((l) => l.t >= t - 0.35);
    return k < 0 ? fl.length - 1 : k;
  };
  const tapLyric = () => {
    if (!L().text.trim() || parseBlocks(L().text).lrc) return;
    const gi = nextTapIndex();
    if (gi < 0) return;
    L().taps = { ...(L().taps ?? {}), [gi]: +Math.max(0, t - 0.06).toFixed(3) }; // compensate typical tap latency
    tapCursor = gi + 1;
    hudO().elements.lyrics.on = true;
    touch(); lyricsRender();
  };
  {
    const tb = TABS.find((x) => x.id === 'lyrics')!, p = h('<div></div>');
    p.append(paneHead(tb, 'コピペで流し込むだけ'));
    p.append(h('<div style="margin:10px 0"></div>'));
    p.append(toggle('歌詞を表示', () => hudO().elements.lyrics.on, (v) => (hudO().elements.lyrics.on = v)));
    const ta = h<HTMLTextAreaElement>(`<textarea rows="8" style="margin-top:10px" placeholder="[Verse]\n夜の東京を泳いで\n光る街に溶けていく\n\n[Chorus]\nきみに届け…"></textarea>`);
    ta.oninput = () => { L().text = ta.value; if (ta.value.trim()) hudO().elements.lyrics.on = true; refreshAll(); touch(); renderLines(); };
    bind(ta, () => { if (document.activeElement !== ta) ta.value = L().text; });
    p.append(ta, hint('Sunoの歌詞をそのまま貼り付けOK。[Verse] [Chorus] などのタグをブロックとして読み取り、ビートに合わせて自動で割り当てます。LRC形式（[00:12.34] 歌詞）ならその時間どおり。'));
    // ---- look: classic scrolling styles + kinetic "vocal-synth MV" templates (with rendered previews)
    const styleCards: [LyricsStyle, HTMLElement][] = [];
    const pickStyle = (v: LyricsStyle) => { L().style = v; hudO().elements.lyrics.on = true; styleCards.forEach(([k, c]) => c.classList.toggle('on', k === v)); refreshAll(); touch(); updateSelBox(); };
    const classic = h('<div class="cards cards-3"></div>');
    for (const [k, name] of Object.entries(LYRICS_CLASSIC) as [LyricsStyle, string][]) {
      const c = h(`<button class="ocard lcard"><div class="nm">${name}</div></button>`);
      c.onclick = () => pickStyle(k); classic.append(c); styleCards.push([k, c]);
    }
    const kin = h('<div class="cards cards-3"></div>');
    const previews: [HTMLCanvasElement, typeof KINETIC_IDS[number]][] = [];
    for (const k of KINETIC_IDS) {
      const c = h(`<button class="ocard"><div class="th kth"><canvas width="240" height="135"></canvas></div><div class="nm">${KINETIC[k]}</div></button>`);
      c.onclick = () => pickStyle(k); kin.append(c); styleCards.push([k, c]);
      previews.push([c.querySelector('canvas')!, k]);
    }
    const drawPreviews = () => {
      const fr = createFrame(); fr.bpm = 120;
      for (const [cv, k] of previews) {
        const g = cv.getContext('2d')!;
        const grd = g.createLinearGradient(0, 0, 240, 135); grd.addColorStop(0, '#1a1f35'); grd.addColorStop(1, '#2a1630');
        g.fillStyle = grd; g.fillRect(0, 0, 240, 135);
        drawKinetic(k, { g, W: 240, H: 135, cx: 120, cy: 67, s: 0.3, text: isEn() ? 'NIGHT SWIM' : '夜を泳ぐ', age: k === 'giant' ? 0.1 : 1.6, dur: 3, out: 0, f: fr, font: hudO().lyricsFont, col: '#ffffff', acc: hudO().colors.accent, acc2: hudO().colors.accent2, seed: 7919 });
      }
    };
    drawPreviews();
    document.fonts?.ready.then(drawPreviews);
    onLangChange(drawPreviews);
    let prevFont = '';
    bind(kin, () => { styleCards.forEach(([k, c]) => c.classList.toggle('on', k === L().style)); if (prevFont !== hudO().lyricsFont + hudO().colors.accent) { prevFont = hudO().lyricsFont + hudO().colors.accent; drawPreviews(); } });
    p.append(sec('見た目（定番）'), classic, sec('見た目（ボカロ風モーション）'), kin,
      hint('ボカロMVのように、文字が1行ごとに動いて出てきます。スーパースロットでは、これらが1行ごとに入れ替わり、重なり合って表示されます。'));
    p.append(fontSelect('フォント', () => hudO().lyricsFont, (v) => (hudO().lyricsFont = v)));
    p.append(...elementControls('lyrics'));

    // tap sync
    p.append(sec('タイミングを合わせる'));
    const tapCard = h(`<div class="tapcard"><button class="btn btn-mint btn-block tapbtn">👆 次の行をいまに合わせる <kbd>Enter</kbd></button><div class="tapnext"></div><div class="tapacts"><button class="btn btn-sm">↺ タップを全部消す</button></div></div>`);
    const tapBtn = tapCard.querySelector<HTMLButtonElement>('.tapbtn')!, tapNext = tapCard.querySelector<HTMLElement>('.tapnext')!;
    tapBtn.onclick = tapLyric;
    (tapCard.querySelector('.tapacts button') as HTMLButtonElement).onclick = () => { L().taps = {}; tapCursor = -1; touch(); lyricsRender(); };
    p.append(tapCard, hint('いちばん簡単な合わせ方：再生しながら、歌が始まる瞬間ごとに Enter（またはボタン）。その後の行も自動でついてきます。<br>ブロックごとの「開始」と「1行の長さ」でもざっくり合わせられます。'));

    // block cards
    const blocksBox = h('<div class="lyr-blocks"></div>');
    const adj = (idx: number) => { L().blocks = L().blocks ?? {}; return (L().blocks[idx] = L().blocks[idx] ?? {}); };
    const clearBlockTaps = (b: ReturnType<typeof timeBlocks>[number]) => { const tp = { ...(L().taps ?? {}) }; b.lines.forEach((l) => delete tp[l.gi]); L().taps = tp; };
    const renderLines = () => {
      if (parseBlocks(L().text).lrc) {
        const lines = lyricsLines(L(), env.analysis);
        blocksBox.replaceChildren(h('<p class="hint">LRCのタイムスタンプで表示しています。</p>'), ...lines.map((ln) => {
          const r = h(`<button class="lyr-row" data-gi="${ln.gi ?? -1}"><b>${fmt(Math.max(0, ln.t))}</b><span data-no-i18n>${esc(ln.text)}</span></button>`);
          r.onclick = () => seek(Math.max(0, ln.t - 0.3));
          return r;
        }));
        return;
      }
      const tbs = timeBlocks(L(), env.analysis);
      blocksBox.replaceChildren(...tbs.map((b, bi) => {
        const card = h(`<div class="lyr-block">
          <div class="lb-head"><span class="lb-tag">${esc(b.tag ? `[${b.tag}]` : `ブロック ${bi + 1}`)}</span><span class="lb-time">${fmt(Math.max(0, b.start))}</span><span class="lb-mode">${b.manualStart ? '手動' : '自動'}</span></div>
          <div class="lb-ctrl"><button class="btn btn-sm" data-a="now">ここから始まる</button><button class="btn btn-sm" data-a="m">−1拍</button><button class="btn btn-sm" data-a="p">+1拍</button><button class="btn btn-sm" data-a="auto">自動</button></div>
          <div class="field"><span>1行の長さ</span><div class="seg lb-bpl"></div></div>
          <div class="lb-lines"></div></div>`);
        card.querySelectorAll<HTMLButtonElement>('.lb-ctrl button').forEach((btn) => {
          btn.onclick = () => {
            const a = btn.dataset.a;
            if (a === 'now') { adj(b.index).start = +t.toFixed(3); clearBlockTaps(b); }
            if (a === 'm' || a === 'p') { adj(b.index).start = beatToTime(env.analysis, timeToBeat(env.analysis, b.start) + (a === 'p' ? 1 : -1)); clearBlockTaps(b); }
            if (a === 'auto') { delete adj(b.index).start; delete adj(b.index).bpl; clearBlockTaps(b); }
            touch(); renderLines();
          };
        });
        const bplBox = card.querySelector('.lb-bpl')!;
        const names: Record<number, string> = { 2: '2拍', 4: '1小節', 8: '2小節', 16: '4小節' };
        const opts: [number | null, string][] = [[null, `自動(${names[b.autoBpl]})`], ...BPL_CHOICES.map((c) => [c, names[c]] as [number, string])];
        for (const [v, l] of opts) {
          const bt = h<HTMLButtonElement>(`<button type="button">${l}</button>`);
          bt.classList.toggle('on', v === null ? !b.manualBpl : b.manualBpl && b.bpl === v);
          bt.onclick = () => { if (v === null) delete adj(b.index).bpl; else adj(b.index).bpl = v; touch(); renderLines(); };
          bplBox.append(bt);
        }
        // continuous line length (beats), updates live while dragging
        const sl = h(`<div class="row"><span>微調整</span><input type="range" min="1" max="16" step="0.05"><output></output></div>`);
        const si = sl.querySelector('input')!, so = sl.querySelector('output')!;
        const showSl = (v: number) => { so.textContent = `${v.toFixed(2)}拍`; si.style.setProperty('--p', `${((v - 1) / 15) * 100}%`); };
        si.value = String(b.bpl); showSl(b.bpl);
        si.oninput = () => { adj(b.index).bpl = +si.value; showSl(+si.value); bplBox.querySelectorAll('button').forEach((x) => x.classList.remove('on')); touch(); updateTimes(); };
        si.onchange = () => renderLines();
        card.querySelector('.lb-lines')!.before(sl);
        const linesBox = card.querySelector('.lb-lines')!;
        for (const ln of b.lines) {
          const r = h(`<div class="lyr-row" data-gi="${ln.gi}"><b>${fmt(Math.max(0, ln.t))}</b><span data-no-i18n>${esc(ln.text)}</span>${ln.tapped ? '<i title="タップで合わせた行（クリックで解除）">●</i>' : ''}</div>`);
          r.onclick = (e) => {
            if ((e.target as HTMLElement).tagName === 'I') { const tp = { ...(L().taps ?? {}) }; delete tp[ln.gi]; L().taps = tp; touch(); renderLines(); return; }
            seek(Math.max(0, ln.t - 0.4)); tapCursor = ln.gi;
          };
          linesBox.append(r);
        }
        return card;
      }));
    };
    /** cheap refresh of the times shown (used while dragging sliders, so the cards are not rebuilt) */
    const updateTimes = () => {
      const tbs = timeBlocks(L(), env.analysis);
      const cards = blocksBox.querySelectorAll<HTMLElement>('.lyr-block');
      tbs.forEach((b, i) => {
        const c = cards[i]; if (!c) return;
        const tl = c.querySelector('.lb-time'); if (tl) tl.textContent = fmt(Math.max(0, b.start));
        for (const ln of b.lines) { const r = c.querySelector(`.lyr-row[data-gi="${ln.gi}"] b`); if (r) r.textContent = fmt(Math.max(0, ln.t)); }
      });
    };
    lyricsListUpdate = () => {
      const lines = lyricsLines(L(), env.analysis), i = currentLine(lines, t + 0.06);
      const gi = i >= 0 ? lines[i].gi : -99;
      blocksBox.querySelectorAll<HTMLElement>('.lyr-row').forEach((r) => r.classList.toggle('on', +r.dataset.gi! === gi));
      const fl = flatLines(), nx = fl[nextTapIndex()];
      tapNext.innerHTML = nx ? `次にタップする行：「<span data-no-i18n>${esc(nx.text)}</span>」` : '';
    };
    renderLines();
    lyricsRender = renderLines;

    const global = itemBox('lyr-global', '全体の調整（歌い出し・歌い終わり・ずらし）');
    const anchor = (label: string, key: 'singStart' | 'singEnd') => {
      const f = h(`<div class="field"><span>${label}</span><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="anc" style="min-width:52px;font-weight:800"></span><button class="btn btn-sm">いまの位置</button><button class="btn btn-sm">自動</button></div></div>`);
      const [now, auto] = [...f.querySelectorAll('button')];
      const lab = f.querySelector<HTMLElement>('.anc')!;
      now.onclick = () => { L()[key] = +t.toFixed(2); refreshAll(); touch(); renderLines(); };
      auto.onclick = () => { L()[key] = -1; refreshAll(); touch(); renderLines(); };
      return bind(f, () => { lab.textContent = L()[key] >= 0 ? fmt(L()[key]) : '自動'; });
    };
    p.append(slider('歌詞の進む速さ', 0.5, 2, 0.01, () => L().speed ?? 1, (v) => { L().speed = v; updateTimes(); }, (v) => `×${v.toFixed(2)}`));
    p.append(hint('全体の切り替わりが遅い／早いときはここで連続的に調整。ブロックごとの「微調整」で1行の長さ（拍）も細かく変えられます。'));
    global.body.append(anchor('歌い出し', 'singStart'), anchor('歌い終わり', 'singEnd'),
      slider('自動の行をずらす', -4, 4, 0.05, () => L().offset, (v) => { L().offset = v; renderLines(); }, (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}s`));
    p.append(global.box, sec('ブロック'), hint('行をクリックでその位置へ移動。● はタップで合わせた行（● をクリックで解除）。'), blocksBox);
    panes.lyrics = p;
  }

  // ---- 💬 telop
  const telopList = h('<div></div>');
  const telopEditor = (it: TextItem, open: boolean) => {
    const del = h<HTMLButtonElement>(`<button class="icon-btn" title="削除">🗑</button>`);
    const ib = itemBox(`t${it.id}`, it.text.split('\n')[0] || '(空)', [del], open);
    const name = ib.box.querySelector('.name')!;
    name.setAttribute('data-no-i18n', ''); // the caption's own text
    ib.head.querySelector('.name')!.addEventListener('click', () => setSel({ kind: 'text', item: it }, false));
    del.onclick = () => removeTelop(it);
    const ta = h<HTMLTextAreaElement>(`<textarea rows="2" placeholder="テキストを入力"></textarea>`);
    ta.value = it.text;
    ta.oninput = () => { it.text = ta.value; name.textContent = it.text.split('\n')[0] || '(空)'; ensureFont(it.font, it.text).then(touch); touch(); updateSelBox(); };
    const colors = h('<div class="colors"></div>');
    colors.append(color('文字', () => it.color, (v) => (it.color = v)), color('ボックス/フチ', () => it.boxColor, (v) => (it.boxColor = v)));
    const timing = h(`<div class="field"><span>表示する時間</span><div style="display:flex;gap:6px;align-items:center"><input type="number" step="0.1" min="0" style="width:72px"><button class="btn btn-sm">今</button><span>〜</span><input type="number" step="0.1" min="0" style="width:72px"><button class="btn btn-sm">今</button></div></div>`);
    const [ns, ne] = [...timing.querySelectorAll('input')];
    const [bs, be] = [...timing.querySelectorAll('button')];
    const syncT = () => { ns.value = it.start.toFixed(1); ne.value = it.end.toFixed(1); };
    ns.onchange = () => { it.start = Math.max(0, +ns.value); touch(); };
    ne.onchange = () => { it.end = Math.max(0, +ne.value); touch(); };
    bs.onclick = () => { it.start = +t.toFixed(2); syncT(); touch(); };
    be.onclick = () => { it.end = +t.toFixed(2); syncT(); touch(); };
    syncT();
    ib.body.append(
      ta,
      fontSelect('フォント', () => it.font, (v) => (it.font = v)),
      seg('スタイル', Object.entries(TEXT_STYLES), () => it.style, (v) => (it.style = v as TextItem['style'])),
      seg('動き', Object.entries(TEXT_ANIMS), () => it.anim, (v) => (it.anim = v as TextItem['anim'])),
      seg('揃え', [['left', '左'], ['center', '中央'], ['right', '右']], () => it.align, (v) => (it.align = v as TextItem['align'])),
      colors,
      slider('サイズ', 12, 300, 1, () => it.size, (v) => { it.size = v; updateSelBox(); }, (v) => `${Math.round(v)}`),
      slider('回転', -45, 45, 1, () => it.rotate, (v) => (it.rotate = v), (v) => `${Math.round(v)}°`),
      posPad('位置', () => [it.x, it.y], (x, y) => { it.x = x; it.y = y; updateSelBox(); }),
      timing, hint('終了を 0 にすると最後まで表示されます。'),
    );
    return ib.box;
  };
  renderTelops = () => { telopList.replaceChildren(...[...hudO().texts].reverse().map((it) => telopEditor(it, false))); };
  const removeTelop = (it: TextItem) => {
    hudO().texts = hudO().texts.filter((x) => x !== it);
    document.querySelector(`.item[data-key="t${it.id}"]`)?.remove();
    if (sel?.kind === 'text' && sel.item === it) setSel(null);
    timeline.invalidate(); touch();
  };
  {
    const tb = TABS.find((x) => x.id === 'telop')!, p = h('<div></div>');
    p.append(paneHead(tb, 'インスタ風に文字を置く'));
    const add = h<HTMLButtonElement>(`<button class="btn btn-mint btn-block">＋ いまの位置にテロップを追加</button>`);
    add.onclick = () => {
      const it = newTextItem({ start: Math.max(0, +(t - 0.5).toFixed(1)), y: 0.22 + 0.08 * (hudO().texts.length % 5) });
      hudO().texts.push(it);
      document.querySelectorAll('[data-key^="t"].item').forEach((e) => e.classList.add('closed'));
      telopList.prepend(telopEditor(it, true));
      ensureFont(it.font, it.text).then(touch);
      setSel({ kind: 'text', item: it });
      (telopList.querySelector('textarea') as HTMLTextAreaElement)?.select();
      timeline.invalidate(); touch();
    };
    p.append(add, hint('タイムライン下段のピンクの帯がテロップの表示区間です。プレビュー上で直接ドラッグ＆ホイールで調整できます。'), telopList);
    renderTelops();
    panes.telop = p;
  }

  // ---- ✨ fx
  {
    const tb = TABS.find((x) => x.id === 'fx')!, p = h('<div></div>');
    p.append(paneHead(tb, '色とキラキラ'));
    const PRESETS = [
      ['#7af0ff', '#ff7ad9', '#ffffff'], ['#ffd36b', '#ff6f6f', '#fff8ec'], ['#9effc8', '#5fb7ff', '#f4fff9'],
      ['#c9a7ff', '#7a8fff', '#ffffff'], ['#ff9ccf', '#ffe08a', '#fff4fa'], ['#39c5bb', '#ff5fa2', '#ffffff'],
      ['#ffffff', '#9a9aa8', '#ffffff'], ['#ff8a3d', '#ffd23f', '#fffaf0'],
    ];
    const sw = h('<div class="swatches"></div>');
    const swBtns = PRESETS.map((c) => {
      const b = h<HTMLButtonElement>(`<button class="swatch" style="background:linear-gradient(90deg,${c[0]} 50%,${c[1]} 50%)"></button>`);
      b.onclick = () => { hudO().colors = { accent: c[0], accent2: c[1], text: c[2] }; refreshAll(); touch(); markSw(); };
      sw.append(b);
      return [c, b] as const;
    });
    const markSw = () => swBtns.forEach(([c, b]) => b.classList.toggle('on', c[0] === hudO().colors.accent && c[1] === hudO().colors.accent2));
    bind(sw, markSw);
    const cs = h('<div class="colors"></div>');
    cs.append(
      color('メイン', () => hudO().colors.accent, (v) => { hudO().colors.accent = v; markSw(); }),
      color('サブ', () => hudO().colors.accent2, (v) => { hudO().colors.accent2 = v; markSw(); }),
      color('文字', () => hudO().colors.text, (v) => (hudO().colors.text = v)),
    );
    p.append(sec('カラープリセット'), sw, sec('カスタム'), cs, hint('アイコン枠・メーター・キラキラ・テロップ以外の文字色に使われます。テーマ自体の色は「テーマ → 色相シフト」で。'));
    p.append(sec('エフェクト'));
    p.append(slider('キラキラ', 0, 2, 0.05, () => hudO().glitter, (v) => (hudO().glitter = v)));
    p.append(slider('ブルーム（光のにじみ）', 0, 2, 0.05, () => hudO().bloom, (v) => (hudO().bloom = v)));
    p.append(slider('背景を暗く', 0, 0.7, 0.01, () => hudO().dim, (v) => (hudO().dim = v)));
    panes.fx = p;
  }

  // ---- 📤 export
  {
    const tb = TABS.find((x) => x.id === 'export')!, p = h('<div></div>');
    p.append(paneHead(tb, 'SNSに合わせてMP4を保存'));
    const range = (): [number, number] => {
      const D = env.analysis.duration;
      const drop = env.analysis.sections.find((x) => x.type === 2)?.start ?? 0;
      const pre = (60 / env.analysis.bpm) * 4 * 2;
      switch (ex.range) {
        case 'all': return [0, D];
        case 'drop30': return [Math.max(0, drop - pre), Math.min(D, Math.max(0, drop - pre) + 30)];
        case 'drop60': return [Math.max(0, drop - pre), Math.min(D, Math.max(0, drop - pre) + 60)];
        case 'x140': return [0, Math.min(D, 140)];
        default: return [Math.max(0, Math.min(ex.start, D)), Math.max(0, Math.min(ex.end, D))];
      }
    };
    exportRange = range;
    // ---- one-click presets for each platform
    type Preset = { id: string; name: string; mark: string; aspect: Aspect; res: number; fps: number; range: typeof ex.range; spec: string; note: string };
    const PRESETS: Preset[] = [
      { id: 'youtube', name: 'YouTube', mark: '▶', aspect: '16:9', res: 1080, fps: 30, range: 'all', spec: '横 16:9・1080p・曲全体', note: '通常の動画として曲をまるごと。' },
      { id: 'x', name: 'X（Twitter）', mark: '𝕏', aspect: '16:9', res: 720, fps: 30, range: 'x140', spec: '横 16:9・720p・最大2:20', note: '通常アカウントの上限 2分20秒 に収めます。' },
      { id: 'instagram', name: 'Instagram リール', mark: '◎', aspect: '9:16', res: 1080, fps: 30, range: 'drop60', spec: '縦 9:16・1080p・サビ60秒', note: 'リール向けの縦長。サビの手前から60秒。' },
      { id: 'tiktok', name: 'TikTok', mark: '♪', aspect: '9:16', res: 1080, fps: 30, range: 'drop30', spec: '縦 9:16・1080p・サビ30秒', note: '縦長・短め。サビの手前から30秒。' },
    ];
    const presetGrid = h('<div class="presets"></div>');
    const presetBtns = PRESETS.map((pr) => {
      const b = h<HTMLButtonElement>(`<button class="preset" data-p="${pr.id}"><span class="pm">${pr.mark}</span><b>${pr.name}</b><small>${pr.spec}</small></button>`);
      b.onclick = () => {
        const aspectChanged = view.aspect !== pr.aspect;
        view.aspect = pr.aspect; ex.res = pr.res; ex.fps = pr.fps; ex.range = pr.range;
        if (aspectChanged) { applyView(); rebuildOutput(); rebuildTemplate(); }
        timeline.invalidate(); refreshAll(); touch();
        toast(`${pr.name} 用に設定しました。${pr.note}`);
      };
      presetGrid.append(b);
      return [pr, b] as const;
    });
    p.append(sec('どこに投稿する？'), bind(presetGrid, () => presetBtns.forEach(([pr, b]) => b.classList.toggle('on', view.aspect === pr.aspect && ex.res === pr.res && ex.fps === pr.fps && ex.range === pr.range))));
    p.append(hint('選ぶと、画面の形・画質・長さがそのSNS向けにそろいます。下で細かく変えることもできます。'));
    p.append(sec('画面の形'), seg(null, [['16:9', '横 16:9'], ['1:1', '正方形'], ['9:16', '縦 9:16']], () => view.aspect, (v) => { view.aspect = v as Aspect; applyView(); rebuildOutput(); rebuildTemplate(); }));
    p.append(seg('画質', [['720', '720p'], ['1080', '1080p']], () => String(ex.res), (v) => (ex.res = +v)));
    p.append(seg('なめらかさ', [['30', '30fps'], ['60', '60fps']], () => String(ex.fps), (v) => (ex.fps = +v)));
    p.append(sec('書き出す区間'), seg(null, [['drop30', 'サビ30秒'], ['drop60', 'サビ60秒'], ['x140', '頭から2:20'], ['all', '曲全体'], ['custom', 'カスタム']], () => ex.range, (v) => { ex.range = v as typeof ex.range; if (v === 'custom') { const [a, b] = range(); ex.start = a; ex.end = b; } timeline.invalidate(); }));
    const cust = h(`<div class="field"><span>開始〜終了</span><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input type="number" step="0.1" min="0" style="width:72px"><button class="btn btn-sm">今</button><span>〜</span><input type="number" step="0.1" min="0" style="width:72px"><button class="btn btn-sm">今</button></div></div>`);
    const [cs, ce] = [...cust.querySelectorAll('input')], [bs, be] = [...cust.querySelectorAll('button')];
    const setCustom = () => { ex.range = 'custom'; refreshAll(); touch(); timeline.invalidate(); };
    cs.onchange = () => { ex.start = +cs.value; setCustom(); };
    ce.onchange = () => { ex.end = +ce.value; setCustom(); };
    bs.onclick = () => { const [, b] = range(); ex.start = +t.toFixed(1); ex.end = b; setCustom(); };
    be.onclick = () => { const [a] = range(); ex.start = a; ex.end = +t.toFixed(1); setCustom(); };
    p.append(bind(cust, () => { const [a, b] = range(); if (document.activeElement !== cs) cs.value = a.toFixed(1); if (document.activeElement !== ce) ce.value = b.toFixed(1); }));
    p.append(toggle('最後をフェードアウト', () => ex.fade, (v) => (ex.fade = v)));
    const info = h('<div class="callout" style="margin-top:12px;font-size:12px"></div>');
    p.append(bind(info, () => {
      const [a, b] = range(), d = Math.max(0, b - a);
      const [w, hh] = dims(ex.res, view.aspect);
      const mb = ((w * hh >= 1900000 ? 12 : 6) + 0.2) * d / 8;
      info.innerHTML = `📐 ${w}×${hh} · ${ex.fps}fps · ${fmt(d)}（${fmt(a)} 〜 ${fmt(b)}）<br>📦 約 ${Math.round(mb)} MB` + (d > 140 ? '<br>⚠️ Xの通常アカウントは2分20秒までです' : '');
    }));
    const go = h<HTMLButtonElement>(`<button class="btn btn-pink btn-block" style="margin-top:14px;font-size:16px;padding:14px">📤 MP4を書き出す</button>`);
    go.onclick = () => runExport();
    const capNote = h('<p class="hint"></p>');
    exportCapabilities(1920, 1080).then((c) => {
      capNote.textContent = c.frameExact ? '✅ このブラウザはコマ落ちなしの高速書き出しに対応しています。' : '⚠️ このブラウザは高速書き出しに非対応のため、リアルタイム録画で書き出します（曲の長さぶん時間がかかります）。PCのChromeがおすすめです。';
    });
    p.append(go, capNote);
    panes.export = p;
  }

  for (const tb of TABS) panel.append(panes[tb.id]);
  layersReady = true;
  showTab(curTab);
  const startTour = () => {
    stop(); setSel(null);
    runTour([
      { title: 'VJ STUDIO へようこそ', body: '曲に合わせて動く映像を作るアプリです。<br>このツアーで、画面の見方と作り方を1分で案内します。<br><small>→ キーや Enter でも進めます。</small>' },
      { target: '#screen', title: 'プレビュー', body: 'いまの映像です。アイコンやテロップなどの要素は<b>クリックで選択</b>、<b>ドラッグで移動</b>、<b>ホイール（スマホはピンチ）でサイズ変更</b>できます。' },
      { target: '.transport', title: '再生とタイムライン', body: '▶（Space）で再生。波形の色は曲の展開（イントロ・ビルド・ドロップ）です。下の段はシーン（テーマの切り替え）とテロップ。クリックでその位置へ移動します。' },
      { target: '.layer-auto', title: 'まずは「おまかせ」', body: '迷ったらここ。スロットを回すと、テーマ・色・配置・フォント・メーターまで<b>丸ごと自動で</b>決まります（R キー）。気に入った項目は🔒で固定できます。', before: () => showTab('slot') },
      { target: '#layers', title: '映像の要素リスト', body: '映像に使われている要素がすべて並んでいます。<b>クリックするとすぐ右側で編集</b>できます。●を押すと表示／非表示。' },
      { target: '[data-layer="lyrics"]', title: '歌詞', body: '歌詞をコピペで流し込むと、Apple Music のように曲に合わせて流れます。Suno の mp3 なら自動で読み込まれます。', before: () => showTab('lyrics') },
      { target: '[data-layer="telop"]', title: 'テロップ', body: '「12.24 配信」「NEW SINGLE」など、好きな文字を好きな時間に。フォントは8種類、アニメーション付き。', before: () => showTab('telop') },
      { target: '[data-layer="media"]', title: '写真・動画', body: '自分の写真や動画を背景やカードに。テーマを使わず「素材だけ」で作ることもできます。', before: () => showTab('media') },
      { target: '#panel', title: '設定パネル', body: '左で選んだ要素の設定がここに出ます。いじった結果はすぐプレビューに反映。⌘Z でいつでも元に戻せます。' },
      { target: '#btn-export', title: '書き出し', body: 'YouTube・X・Instagram・TikTok を選ぶだけで、画面の形・画質・長さがそろいます。あとはMP4を保存して投稿するだけ。', before: () => showTab('export') },
      { target: '#btn-reset', title: 'これで準備完了', body: 'ツアーは上の「チュートリアル」からいつでも見直せます。「リセット」はすべて消してトップページに戻ります。<br>まずは 🎲おまかせ から始めてみましょう。', before: () => showTab('slot') },
    ]);
  };
  $('btn-tour').onclick = startTour;
  onLangChange(() => { timeline.invalidate(); drawEco(); renderLayers(true); dirty = true; });
  if (tourAfterLoad) { tourAfterLoad = false; setTimeout(startTour, 500); }
  $('btn-export').onclick = () => showTab('export');
  $('btn-auto').onclick = () => showTab('slot');
  $('btn-reset').onclick = async () => {
    if (!(await confirmModal('すべてを初期化してトップページに戻りますか？ 曲・写真・動画・アイコン・歌詞・テロップ・すべての設定が消えます（元に戻せません）。', 'すべて初期化する'))) return;
    stop();
    try { localStorage.removeItem(STORE); sessionStorage.clear(); } catch { /* storage blocked */ }
    location.href = location.pathname + location.search; // back to the top page, nothing kept
  };

  // ============================================================ export
  let exporting = false;
  async function runExport() {
    if (exporting) return;
    const [a, b] = exportRange();
    if (b - a < 1) { toast('書き出す区間が短すぎます'); return; }
    stop();
    exporting = true;
    const signal = { cancelled: false };
    const m = h(`<div class="modal"><div class="modal-card"><p>📤 書き出し中…</p><div class="bar"><i></i></div><p class="hint" style="margin:8px 0 14px">準備中…</p><div class="modal-actions"><button class="btn">キャンセル</button></div></div></div>`);
    const bar = m.querySelector<HTMLElement>('.bar i')!, msg = m.querySelector<HTMLElement>('.hint')!;
    (m.querySelector('button') as HTMLButtonElement).onclick = () => { signal.cancelled = true; };
    document.body.append(m);
    const [w, hh] = dims(ex.res, view.aspect);
    let res: ExportResult | null = null;
    try {
      res = await exportMp4({
        def, scenes: sceneSource(), defs: TEMPLATES, env: { ...env, hud: env.hud, media }, buffer: song.buffer, width: w, height: hh, fps: ex.fps, start: a, end: b, fadeOut: ex.fade, signal,
        onProgress: (pr, info) => { bar.style.width = `${(pr * 100).toFixed(1)}%`; msg.textContent = info; },
      });
    } catch (e) {
      m.remove(); exporting = false; dirty = true;
      if ((e as Error).message !== 'cancelled') { console.error(e); toast('書き出しに失敗しました: ' + (e as Error).message); }
      else toast('キャンセルしました');
      return;
    }
    exporting = false; dirty = true;
    const url = URL.createObjectURL(res.blob);
    const fname = `${(meta.title || 'vj').replace(/[\\/:*?"<>|]/g, '_')}_${view.aspect.replace(':', 'x')}.${res.ext}`;
    m.querySelector('.modal-card')!.innerHTML = `<p>🎉 できました！（${(res.blob.size / 1e6).toFixed(1)} MB）</p>
      <video src="${url}" controls playsinline style="width:100%;max-height:50vh;border-radius:12px;background:#000"></video>
      ${res.note ? `<p class="hint">${esc(res.note)}</p>` : ''}
      <div class="modal-actions" style="margin-top:12px"><button class="btn">閉じる</button><a class="btn btn-pink" href="${url}" download="${esc(fname)}" style="text-decoration:none">⬇ ダウンロード</a></div>`;
    (m.querySelector('.modal-actions button') as HTMLButtonElement).onclick = () => { m.remove(); };
  }

  // ============================================================ playback & timeline
  const timeline = new Timeline($<HTMLCanvasElement>('timeline'), () => ({
    A: env.analysis, pcm: env.audio!, texts: hudO().texts, accent: '#2ec4b6', range: curTab === 'export' ? exportRange() : null, marks: chaos.enabled ? chaos.taps ?? [] : null,
    scenes: sceneOpt.enabled ? sceneOpt.scenes : null, selScene, themeName: (id: string) => { const d = TEMPLATES.find((x) => x.id === id); return d ? (isEn() ? d.nameEn : d.name) : id; },
  }), (time) => seek(time), {
    onScene: (id) => selectScene(id, false),
    onBoundary: (i, tt, done) => {
      const sc = sceneOpt.scenes, A = env.analysis;
      const snapped = beatToTime(A, Math.round(timeToBeat(A, tt) / 4) * 4);
      const lo = sc[i - 1].start + barSec(), hi = sc[i].end - barSec();
      const v = Math.min(hi, Math.max(lo, snapped));
      sc[i].start = v; sc[i - 1].end = v;
      dirty = true;
      if (done) { sceneListRender(); touch(); }
    },
  });
  const playBtn = $('play'), tlabel = $('tlabel'), fpsEl = $('fps');
  const actx = new AudioContext();
  // dev/verification mute: open with ?mute (or set localStorage 'vj-mute' = '1') to keep playback
  // timing intact while sending nothing to the system audio output
  const devMute = new URLSearchParams(location.search).has('mute') || localStorage.getItem('vj-mute') === '1';
  const out = actx.createGain();
  out.gain.value = devMute ? 0 : 1;
  out.connect(actx.destination);
  let src: AudioBufferSourceNode | null = null;
  let startAt = 0;
  const stop = () => { if (src) { const s = src; src = null; s.stop(); } playBtn.innerHTML = '<span>▶</span>'; dirty = true; };
  const play = () => {
    actx.resume();
    if (t >= env.analysis.duration - 0.05) t = 0;
    src = actx.createBufferSource(); src.buffer = song.buffer; src.connect(out);
    src.start(0, t); startAt = actx.currentTime - t; playBtn.innerHTML = '<span>❚❚</span>';
    const me = src;
    src.onended = () => { if (src === me) stop(); };
  };
  playBtn.onclick = () => (src ? stop() : play());
  // click track: lets you check by ear that the detected beats sit on the music
  let metro = false, nextClick = 0;
  const metroBtn = $<HTMLButtonElement>('metro');
  const setMetro = (v: boolean) => { metro = v; metroBtn.classList.toggle('on', v); nextClick = 0; };
  metroBtn.onclick = () => { setMetro(!metro); toast(metro ? 'クリック音 ON（拍が合っているか確認できます）' : 'クリック音 OFF'); };
  const scheduleClicks = () => {
    if (!metro || !src) return;
    const A = env.analysis, ahead = t + 0.25;
    let b = Math.max(Math.ceil(timeToBeat(A, t) - 1e-3), nextClick);
    for (; beatToTime(A, b) < ahead; b++) {
      const bt = beatToTime(A, b);
      if (bt < t - 0.01) continue;
      const when = startAt + bt;
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = ((b % 4) + 4) % 4 === 0 ? 1760 : 1100;
      g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.35, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      o.connect(g).connect(out); o.start(when); o.stop(when + 0.06);
    }
    nextClick = b;
  };
  function seek(time: number) {
    const was = !!src;
    nextClick = 0;
    if (src) stop();
    t = Math.max(0, Math.min(env.analysis.duration, time));
    tapCursor = -1;
    dirty = true;
    if (was) play();
  }
  // ---------- undo / redo
  const undoBtn = $<HTMLButtonElement>('btn-undo'), redoBtn = $<HTMLButtonElement>('btn-redo');
  const updUndo = () => { undoBtn.disabled = hi <= 0; redoBtn.disabled = hi >= hist.length - 1; };
  function restoreSnap(js: string) {
    restoring = true;
    const o = JSON.parse(js);
    def = TEMPLATES.find((d) => d.id === o.tpl) ?? def;
    env.seed = o.seed; env.params = o.params; env.hud = o.hud;
    Object.assign(media.opts, o.media); Object.assign(meta, o.meta); Object.assign(view, o.view); Object.assign(ex, o.ex);
    if (o.scenes) { Object.assign(sceneOpt, o.scenes); sceneListRender(); }
    applyView(); rebuildTemplate(); rebuildOutput(); renderTelops(); setSel(null);
    refreshAll(); lyricsRender(); timeline.invalidate(); renderSongInfo();
    dirty = true; save();
    restoring = false;
  }
  const flushHist = () => { if (histTimer) { clearTimeout(histTimer); histTimer = 0; commitHist(); } };
  const undo = () => { flushHist(); if (hi > 0) { hi--; restoreSnap(hist[hi]); updUndo(); toast('元に戻しました'); } };
  const redo = () => { flushHist(); if (hi < hist.length - 1) { hi++; restoreSnap(hist[hi]); updUndo(); toast('やり直しました'); } };
  undoBtn.onclick = undo; redoBtn.onclick = redo;
  hist = [snapState()]; hi = 0; histReady = true; updUndo();

  // ---------- keyboard shortcuts
  const KEYS: [string, string][] = [
    ['Space', '再生 / 停止'], ['← / →', '1小節もどる / すすむ'], ['Shift + ← / →', '4小節もどる / すすむ'], ['Home', '曲の先頭へ'],
    ['⌘/Ctrl + Z', '元に戻す'], ['⇧ + ⌘/Ctrl + Z', 'やり直す'], ['Enter / L', '歌詞：次の行をいまに合わせる'],
    ['R', 'おまかせ生成（スピン）'], ['M', 'クリック音（拍の確認）'], ['C', 'スーパースロット：この瞬間にカオスを総入れ替え（記録）'], ['1〜9', '左の要素リストを上から選ぶ'], ['⌘/Ctrl + E', '書き出しを開く'], ['Delete', '選択中のテロップを削除'], ['Esc', '選択を解除'], ['?', 'この一覧'],
  ];
  const showKeys = () => {
    const m = h(`<div class="modal"><div class="modal-card"><p>⌨️ ショートカット</p><div class="kv keys">${KEYS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div><div class="modal-actions" style="margin-top:14px"><button class="btn btn-mint">OK</button></div></div></div>`);
    m.onclick = (e) => { if (e.target === m || (e.target as HTMLElement).tagName === 'BUTTON') m.remove(); };
    document.body.append(m);
  };
  $('btn-keys').onclick = showKeys;
  window.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    const typing = el instanceof HTMLInputElement && !['range', 'checkbox', 'color', 'file'].includes(el.type) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (document.querySelector('.modal') && e.key === 'Escape') { document.querySelectorAll('.modal').forEach((x) => x.remove()); return; }
    if (mod && k === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (mod && k === 'e') { e.preventDefault(); showTab('export'); return; }
    if (typing || mod || e.altKey) return;
    const bar = (60 / env.analysis.bpm) * 4;
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(t - bar * (e.shiftKey ? 4 : 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(t + bar * (e.shiftKey ? 4 : 1)); }
    else if (e.key === 'Home') { e.preventDefault(); seek(0); }
    else if ((e.key === 'Enter' || k === 'l') && L().text.trim()) { e.preventDefault(); tapLyric(); }
    else if (/^[1-9]$/.test(e.key)) { const ids = LAYER_GROUPS.flatMap((g) => g.tabs); const id = ids[+e.key - 1]; if (id) showTab(id); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'text') { e.preventDefault(); removeTelop(sel.item); }
    else if (e.key === 'Escape') setSel(null);
    else if (e.key === '?') showKeys();
    else if (k === 'r') spin();
    else if (k === 'm') metroBtn.click();
    else if (k === 'c' && chaos.enabled) { e.preventDefault(); chaosTap(); }
  });
  window.addEventListener('resize', () => { updateSelBox(); timeline.invalidate(); });

  // new song dropped later
  editorReady = (s: Song) => {
    stop();
    song = s; env.analysis = s.A; env.audio = s.pcm;
    if (!meta.title || meta.title === first.name.replace(/\.[^.]+$/, '')) meta.title = s.name.replace(/\.[^.]+$/, '');
    t = s.A.sections.find((x) => x.type === 2)?.start ?? 0;
    renderSongInfo(); replanScenes(undefined, false); replanChaos(); refreshAll(); rebuildTemplate(); rebuildOutput(); timeline.invalidate(); lyricsRender();
    applyTags(s.tags).then(() => { refreshAll(); rebuildTemplate(); lyricsRender(); });
    toast(`「${s.name}」を読み込みました（${s.A.bpm} BPM）`);
  };

  // first view: a few seconds into the first drop looks best
  t = (song.A.sections.find((x) => x.type === 2)?.start ?? 0) + 4;
  await applyTags(song.tags);
  renderSongInfo();
  rebuildOutput();
  rebuildTemplate();
  if (!sceneOpt.scenes.length) replanScenes(sceneOpt.seed || undefined, false); else sceneListRender();
  replanChaos();
  ensureAllFonts().then(touch);
  // files chosen on the start screen
  (async () => {
    if (initial.avatar) { meta.avatar = await imageToSquare(initial.avatar, 512); }
    for (const f of initial.media) { try { await media.add(f); } catch { toast(`${f.name} を読み込めませんでした`); } }
    if (initial.avatar || initial.media.length) {
      if (initial.media.length && media.opts.mode === 'off') media.opts.mode = 'background';
      renderMediaGrid(); slotMediaUpdate(); refreshAll(); touch();
      toast(`アイコン${initial.avatar ? '1' : '0'}・素材${initial.media.length}個を読み込みました`);
    }
  })();

  const frame = createFrame();
  const renderAt = (time: number) => {
    sampleFrame(env.analysis, time, frame);
    media.sync(time, frame.beat, !!src, chaos.enabled);
    sceneR.render(comp, time, frame, barSec());
  };
  let frames = 0, lastFps = performance.now(), ms = 0, capturing = false;
  const loop = () => {
    if (!capturing && !exporting) {
      if (src) { t = actx.currentTime - startAt - (actx.outputLatency || 0); scheduleClicks(); }
      if (src || dirty) {
        const t0 = performance.now();
        renderAt(t);
        ms += performance.now() - t0; frames++;
        if (sel) updateSelBox();
        dirty = false;
      }
      timeline.draw(t);
      if (curTab === 'lyrics') lyricsListUpdate();
      tlabel.textContent = fmt(Math.max(0, t));
    }
    const now = performance.now();
    if (now - lastFps > 1000) { fpsEl.textContent = src && frames ? `${frames}fps` : ""; frames = 0; ms = 0; lastFps = now; }
    requestAnimationFrame(loop);
  };
  loop();

  // thumbnails for theme cards (rendered once, in the background)
  (async () => {
    const at = (song.A.sections.find((x) => x.type === 2)?.start ?? song.A.duration * 0.3) + 5;
    const fr = sampleFrame(song.A, at, createFrame());
    for (const d of TEMPLATES) {
      await new Promise((r) => setTimeout(r, 60));
      try {
        const e2: RenderEnv = { ...env, width: 320, height: 180, params: defaultParams(d), hud: undefined, media: undefined };
        const ti = d.create(e2);
        ti.render(at, fr);
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const g = c.getContext('2d')!;
        g.imageSmoothingEnabled = !ti.pixelated;
        g.drawImage(ti.canvas, 0, 0, 320, 180);
        thumbs[d.id] = c.toDataURL('image/jpeg', 0.8);
        ti.dispose();
        const thEl = themeCards[d.id].querySelector<HTMLElement>('.th')!;
        thEl.style.backgroundImage = `url(${thumbs[d.id]})`; thEl.textContent = '';
      } catch (e) { console.warn('thumb', d.id, e); }
    }
  })();

  void capturing;
}
