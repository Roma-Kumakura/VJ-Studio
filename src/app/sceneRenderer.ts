import type { Compositor } from '../core/compositor';
import type { Frame } from '../core/frame';
import type { RenderEnv, TemplateDef, TemplateInstance } from '../core/template';
import { TRANSITION_IDS, sceneMix, transWindow, type Scene } from './scenes';
import { chaosDeal, chaosState, chaosUpcoming, drawChaos, drawChaosMedia, type ChaosPlan } from './chaos';

/** impact of a manual re-roll: from the plan, or from a tap made live a moment ago */
const hitOf = (planHit: number, liveTap: number | null | undefined, t: number) =>
  Math.max(planHit, liveTap != null && t >= liveTap - 0.02 ? Math.exp(-Math.max(0, t - liveTap) / 0.32) : 0);

export interface SceneSource {
  enabled: boolean;
  scenes: Scene[];
  /** theme used when scene switching is off */
  main: { tpl: string; seed: number };
  /** super-slot chaos plan (overrides scenes when present) */
  /** liveTap: song time of a tap just made while playing (instant impact before the plan is recomputed) */
  chaos?: { plan: ChaosPlan; assets: CanvasImageSource[]; liveTap?: number | null } | null;
  /** background made only from the user's photos / videos: no theme is created or rendered */
  mediaOnly?: boolean;
}

/** an empty "theme" used when the background comes only from the user's media */
function blankInstance(): TemplateInstance {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const g = canvas.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, 2, 2);
  return { canvas, render() {}, dispose() {} };
}

/**
 * Renders the right theme(s) for time t: one theme, or two blended during a scene transition.
 * Keeps a small cache of live theme instances (current, next, and the one being left) and
 * creates the next scene's instance a few seconds early so switches don't stutter.
 */
export class SceneRenderer {
  private cache = new Map<string, { inst: TemplateInstance; last: number }>();
  private tick = 0;
  private blank: TemplateInstance | null = null;

  constructor(private env: RenderEnv, private defs: TemplateDef[], public src: () => SceneSource) {}

  private key(tpl: string, seed: number) { return `${tpl}|${seed}|${this.env.width}x${this.env.height}`; }

  get(tpl: string, seed: number): TemplateInstance | null {
    const k = this.key(tpl, seed);
    const hit = this.cache.get(k);
    if (hit) { hit.last = this.tick; return hit.inst; }
    const def = this.defs.find((d) => d.id === tpl) ?? this.defs[0];
    try {
      // keep at most 8 live themes (each is a WebGL context)
      if (this.cache.size >= 8) {
        let oldK = '', oldT = Infinity;
        for (const [kk, v] of this.cache) if (v.last < oldT) { oldT = v.last; oldK = kk; }
        if (oldK) { this.cache.get(oldK)!.inst.dispose(); this.cache.delete(oldK); }
      }
      const inst = def.create({ ...this.env, seed });
      this.cache.set(k, { inst, last: this.tick });
      return inst;
    } catch (e) { console.error('theme create failed', tpl, e); return null; }
  }

  /** dispose everything (size, text or image changes) */
  invalidate() { for (const v of this.cache.values()) v.inst.dispose(); this.cache.clear(); }

  /** dispose instances not used recently (keeps WebGL context count low) */
  private prune() {
    for (const [k, v] of this.cache) if (this.tick - v.last > 90) { v.inst.dispose(); this.cache.delete(k); }
  }

  /** scene showing at t (for UI) */
  sceneAt(t: number): Scene | null {
    const s = this.src();
    if (!s.enabled || !s.scenes.length) return null;
    return s.scenes.find((x) => t >= x.start && t < x.end) ?? s.scenes[s.scenes.length - 1];
  }

  render(comp: Compositor, t: number, f: Frame, bar: number) {
    this.tick++;
    const s = this.src();
    if (s.mediaOnly) {
      // no themes at all; chaos mode still contributes its frame effects and overlay
      this.blank ??= blankInstance();
      if (s.chaos?.plan) {
        const st = chaosState(s.chaos.plan, t), d = chaosDeal(s.chaos.plan, st), ch = s.chaos;
        comp.chaosFx = { ...d.fx, hit: hitOf(d.hit, ch.liveTap, t) }; comp.chaosLyrics = ch.plan.seed; comp.setOverlay((g, W, H, tt, ff) => drawChaos(g, W, H, tt, ff, ch.plan, st, ch.assets));
        comp.mixLayer = (g, W, H, tt, ff) => drawChaosMedia(g, W, H, tt, ff, ch.plan, st, ch.assets);
      } else { comp.chaosFx = null; comp.chaosLyrics = null; comp.mixLayer = null; comp.setOverlay(null); }
      comp.render(this.blank, t, f);
      if (this.tick % 60 === 0) this.prune();
      return;
    }
    if (s.chaos?.plan) { this.renderChaos(comp, t, f, s.chaos); return; }
    comp.chaosFx = null; comp.chaosLyrics = null; comp.mixLayer = null; comp.setOverlay(null);
    if (!s.enabled || !s.scenes.length) {
      const inst = this.get(s.main.tpl, s.main.seed);
      if (inst) { inst.render(t, f); comp.render(inst, t, f); }
      if (this.tick % 60 === 0) this.prune();
      return;
    }
    const m = sceneMix(s.scenes, t, bar);
    const a = this.get(m.a.tpl, m.a.seed);
    const b = m.b ? this.get(m.b.tpl, m.b.seed) : null;
    // warm up the next scene ahead of time
    const i = s.scenes.indexOf(m.b ?? m.a);
    const nx = s.scenes[i + 1];
    if (nx && t > nx.start - transWindow(nx.trans, bar)[0] - 3) this.get(nx.tpl, nx.seed);
    if (!a) return;
    a.render(t, f);
    if (b) { b.render(t, f); comp.render(a, t, f, b, TRANSITION_IDS[m.type], m.p); }
    else comp.render(a, t, f);
    if (this.tick % 60 === 0) this.prune();
  }

  private renderChaos(comp: Compositor, t: number, f: Frame, ch: NonNullable<SceneSource['chaos']>) {
    const st = chaosState(ch.plan, t);
    const d = chaosDeal(ch.plan, st);
    const a = d.themeA ? this.get(d.themeA, d.seedA) : null;
    const b = d.themeB ? this.get(d.themeB, d.seedB) : null;
    // themes about to be born: create them a few seconds early (one per frame at most)
    for (const n of chaosUpcoming(ch.plan, t, 4)) {
      if (!this.cache.has(this.key(n.id, n.seed))) { this.get(n.id, n.seed); break; }
    }
    comp.chaosFx = { ...d.fx, hit: hitOf(d.hit, ch.liveTap, t) }; comp.chaosLyrics = ch.plan.seed;
    comp.mixLayer = (g, W, H, tt, ff) => drawChaosMedia(g, W, H, tt, ff, ch.plan, st, ch.assets);
    comp.setOverlay((g, W, H, tt, ff) => drawChaos(g, W, H, tt, ff, ch.plan, st, ch.assets));
    if (!a) return;
    a.render(t, f);
    // B is either the next theme mid-transition or a theme mixed in through a mask (curated moments only)
    if (b && b !== a && d.p > 0.001) { b.render(t, f); comp.render(a, t, f, b, d.trans, d.p); }
    else comp.render(a, t, f);
    if (this.tick % 60 === 0) this.prune();
  }

  dispose() { this.invalidate(); }
}
