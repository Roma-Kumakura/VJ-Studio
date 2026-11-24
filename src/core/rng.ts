export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: RNG, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
export const range = (rng: RNG, a: number, b: number) => a + (b - a) * rng();

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Rotate hue of an RGB color by `deg` degrees (YIQ rotation). */
export function hueShift(c: RGB, deg: number): RGB {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const [r, g, b] = c;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const i = 0.596 * r - 0.274 * g - 0.322 * b;
  const q = 0.211 * r - 0.523 * g + 0.312 * b;
  const i2 = i * cos - q * sin, q2 = i * sin + q * cos;
  const cl = (x: number) => Math.min(1, Math.max(0, x));
  return [cl(y + 0.956 * i2 + 0.621 * q2), cl(y - 0.272 * i2 - 0.647 * q2), cl(y - 1.106 * i2 + 1.703 * q2)];
}
