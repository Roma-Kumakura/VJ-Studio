import type { Analysis } from '../analysis/analyze';
import type { Frame } from './frame';
import type { MediaLayer } from './media';
import type { FontId } from './fonts';
import { defaultLyrics, type LyricsOptions } from './lyrics';

export interface ParamDef { key: string; label: string; min: number; max: number; step: number; default: number }

export interface TrackMeta {
  title: string; artist: string; username: string;
  cover: HTMLCanvasElement | null;
  avatar: HTMLCanvasElement | null;
}

/** Raw stereo PCM for oscilloscope / goniometer overlays. */
export interface StereoPCM { L: Float32Array; R: Float32Array; sampleRate: number }

export type SpectrumStyle = 'wave' | 'capsule' | 'dots' | 'radial' | 'terrain';
export const SPECTRUM_STYLES: Record<SpectrumStyle, string> = {
  wave: 'ウェーブ', capsule: 'カプセル', dots: 'ドットLED', radial: 'サークル', terrain: '3Dテレイン',
};
export type HudElementId = 'icon' | 'text' | 'spectrum' | 'scope' | 'phase' | 'readout' | 'lyrics';
/** x,y = centre of the element as a fraction of the frame; size = scale multiplier */
export interface HudElement { on: boolean; x: number; y: number; size: number }
export type TextStyle = 'plain' | 'box' | 'outline' | 'neon' | 'shadow';
export type TextAnim = 'none' | 'fade' | 'pop' | 'type' | 'beat';
export interface TextItem {
  id: number;
  text: string;
  font: FontId;
  size: number;      // px at 1080p
  color: string;
  style: TextStyle;
  boxColor: string;
  x: number; y: number;
  align: 'left' | 'center' | 'right';
  rotate: number;    // degrees
  anim: TextAnim;
  start: number;     // seconds
  end: number;       // seconds; 0 = until the end
}
export const TEXT_STYLES: Record<TextStyle, string> = { plain: 'そのまま', box: '背景ボックス', outline: 'フチ取り', neon: 'ネオン', shadow: 'ドロップシャドウ' };
export const TEXT_ANIMS: Record<TextAnim, string> = { none: 'なし', fade: 'フェード', pop: 'ポップイン', type: 'タイプライター', beat: '拍で跳ねる' };
let textId = 1;
export function newTextItem(partial: Partial<TextItem> = {}): TextItem {
  return {
    id: textId++, text: 'テキスト', font: 'maru', size: 64, color: '#ffffff', style: 'box', boxColor: '#ff7ad9',
    x: 0.5, y: 0.3, align: 'center', rotate: 0, anim: 'pop', start: 0, end: 0, ...partial,
  };
}
export type IconFilter = 'none' | 'mono' | 'duotone' | 'vhs' | 'rainbow';
export type IconFrame = 'neon' | 'simple' | 'none';
export interface IconFx { filter: IconFilter; frame: IconFrame; pulse: number; tilt: number; rgb: number; glitch: number; glow: number }
export const defaultIconFx = (): IconFx => ({ filter: 'none', frame: 'neon', pulse: 0.5, tilt: 0.3, rgb: 0.3, glitch: 0.3, glow: 0.4 });
export const ICON_FILTERS: Record<IconFilter, string> = { none: 'なし', mono: 'モノクロ', duotone: 'デュオトーン', vhs: 'VHS', rainbow: '虹色' };
export const ICON_FRAMES: Record<IconFrame, string> = { neon: 'ネオン', simple: 'シンプル', none: '枠なし' };
export interface HudOptions {
  iconFx: IconFx;
  elements: Record<HudElementId, HudElement>;
  texts: TextItem[];
  titleFont: FontId;
  userFont: FontId;
  lyrics: LyricsOptions;
  lyricsFont: FontId;
  spectrumStyle: SpectrumStyle;
  iconShape: 'square' | 'circle';
  colors: { accent: string; accent2: string; text: string };
  glitter: number; // 0..2
  bloom: number;   // 0..2
  dim: number;     // 0..0.7 darken background so overlays pop
}
export const HUD_LABELS: Record<HudElementId, string> = {
  icon: 'アイコン', text: '曲名・@名前', lyrics: '歌詞', spectrum: 'スペアナ', scope: '波形', phase: '位相', readout: 'BPM表示',
};
export function defaultHud(): HudOptions {
  return {
    elements: {
      icon: { on: true, x: 0.5, y: 0.4, size: 1.3 },
      text: { on: true, x: 0.5, y: 0.79, size: 0.9 },
      spectrum: { on: true, x: 0.5, y: 0.92, size: 0.8 },
      scope: { on: false, x: 0.5, y: 0.1, size: 1 },
      phase: { on: false, x: 0.9, y: 0.16, size: 1 },
      readout: { on: true, x: 0.14, y: 0.06, size: 1 },
      lyrics: { on: false, x: 0.3, y: 0.5, size: 1 },
    },
    texts: [],
    iconFx: defaultIconFx(),
    lyrics: defaultLyrics(),
    lyricsFont: 'gothic',
    titleFont: 'gothic',
    userFont: 'gothic',
    spectrumStyle: 'wave',
    iconShape: 'square',
    colors: { accent: '#7af0ff', accent2: '#ff7ad9', text: '#ffffff' },
    glitter: 1, bloom: 1, dim: 0.15,
  };
}

export interface RenderEnv {
  width: number; height: number;
  seed: number;
  params: Record<string, number>; // mutable, read every frame
  meta: TrackMeta;
  analysis: Analysis;
  audio?: StereoPCM;
  hud?: HudOptions;
  media?: MediaLayer;
}

export interface TemplateInstance {
  canvas: HTMLCanvasElement;
  pixelated?: boolean;
  render(t: number, f: Frame): void;
  dispose(): void;
}

export interface TemplateDef {
  id: string;
  name: string;
  nameEn: string;
  tagline: string;
  params: ParamDef[];
  overlayDefault: boolean;
  create(env: RenderEnv): TemplateInstance;
}

export const COMMON_PARAMS: ParamDef[] = [
  { key: 'intensity', label: '反応の強さ', min: 0, max: 2, step: 0.01, default: 1 },
  { key: 'speed', label: 'スピード', min: 0.25, max: 2, step: 0.01, default: 1 },
  { key: 'hue', label: '色相シフト', min: -180, max: 180, step: 1, default: 0 },
];

export function defaultParams(def: TemplateDef): Record<string, number> {
  const p: Record<string, number> = {};
  for (const d of [...COMMON_PARAMS, ...def.params]) p[d.key] = d.default;
  return p;
}
