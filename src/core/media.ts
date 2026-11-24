/**
 * User photos / videos layered into the VJ.
 *  - background: media fills the frame, the template's light is blended on top
 *  - card: media floats as a 3D-tilting card that can be placed anywhere
 * Several items become a slideshow that cuts on the beat.
 * Everything is derived from (t, beat) so export can reproduce the preview exactly.
 */
export type MediaMode = 'off' | 'background' | 'card';
export type MediaBlend = 'screen' | 'add' | 'overlay' | 'normal';

export interface MediaItem {
  id: number;
  name: string;
  kind: 'image' | 'video';
  el: HTMLCanvasElement | HTMLVideoElement;
  width: number; height: number;
  thumb: string;
}

export interface MediaOptions {
  mode: MediaMode;
  blend: MediaBlend;
  mix: number;        // how strongly the template shows over the media (0..1)
  beatsPerCut: number;
  x: number; y: number; size: number; // card placement
  tilt: number;       // 3D tilt amount for card
  motion: number;     // ken-burns / kick zoom amount
  /** background is made ONLY from the user's media — no theme is rendered at all */
  only: boolean;
  /** 3D card: 0 = pasted on top with a frame, 1 = soft edges melted into the scene */
  soft?: number;
}

export const BLEND_IDS: Record<MediaBlend, number> = { screen: 0, add: 1, overlay: 2, normal: 3 };

let nextId = 1;

export class MediaLayer {
  items: MediaItem[] = [];
  /** called when a paused video has finished seeking (the preview should redraw) */
  onFrame: (() => void) | null = null;
  opts: MediaOptions = { mode: 'background', blend: 'screen', mix: 0.85, beatsPerCut: 8, x: 0.5, y: 0.45, size: 1, tilt: 1, motion: 1, only: false, soft: 0.6 };

  async add(file: File): Promise<MediaItem> {
    const url = URL.createObjectURL(file);
    let item: MediaItem;
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video load failed')); });
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      c.getContext('2d')!.drawImage(v, 0, 0, 160, 90);
      item = { id: nextId++, name: file.name, kind: 'video', el: v, width: v.videoWidth, height: v.videoHeight, thumb: c.toDataURL() };
    } else {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const th = document.createElement('canvas'); th.width = 160; th.height = 90;
      const s = Math.max(160 / c.width, 90 / c.height);
      th.getContext('2d')!.drawImage(c, (160 - c.width * s) / 2, (90 - c.height * s) / 2, c.width * s, c.height * s);
      item = { id: nextId++, name: file.name, kind: 'image', el: c, width: c.width, height: c.height, thumb: th.toDataURL() };
    }
    this.items.push(item);
    return item;
  }

  remove(id: number) {
    const i = this.items.findIndex((m) => m.id === id);
    if (i < 0) return;
    const m = this.items[i];
    if (m.el instanceof HTMLVideoElement) { m.el.pause(); URL.revokeObjectURL(m.el.src); }
    this.items.splice(i, 1);
  }

  get active() { return (this.opts.only || this.opts.mode !== 'off') && this.items.length > 0; }

  /** which item is on screen at this beat + how fresh the cut is (1 right at the cut, decays) */
  current(beat: number): { item: MediaItem; cut: number } | null {
    if (!this.active) return null;
    const n = this.opts.beatsPerCut;
    const seg = Math.floor(Math.max(0, beat) / n);
    const item = this.items[seg % this.items.length];
    const since = Math.max(0, beat) - seg * n; // beats since the cut
    const cut = this.items.length > 1 || seg > 0 ? Math.exp(-since * 3) : 0;
    return { item, cut };
  }

  private localTime(m: MediaItem, t: number) {
    const v = m.el as HTMLVideoElement;
    return v.duration > 0 ? t % v.duration : 0;
  }

  /** realtime preview: keep videos playing roughly in sync with the song */
  sync(t: number, beat: number, playing: boolean, all = false) {
    const cur = this.current(beat)?.item;
    for (const m of this.items) {
      if (m.kind !== 'video') continue;
      const v = m.el as HTMLVideoElement;
      // all: several pictures are on screen at once (super slot) — every video keeps moving
      if (m !== cur && !all) { if (!v.paused) v.pause(); continue; }
      const want = this.localTime(m, t);
      if (playing) {
        if (v.paused) v.play().catch(() => {});
        if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - want) > 0.04) {
          v.addEventListener('seeked', () => this.onFrame?.(), { once: true });
          v.currentTime = want;
        }
      }
    }
  }

  /** frame-exact export: seek the visible video and wait until the frame is ready */
  async prepare(t: number, beat: number) {
    const cur = this.current(beat)?.item;
    if (!cur || cur.kind !== 'video') return;
    const v = cur.el as HTMLVideoElement;
    v.pause();
    const want = this.localTime(cur, t);
    if (Math.abs(v.currentTime - want) < 1e-3) return;
    await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = want; });
  }
}
