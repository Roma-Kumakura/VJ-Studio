import { computeFeatures } from './analyze';

// Heavy FFT analysis off the main thread so the UI stays responsive.
self.onmessage = (e: MessageEvent<{ mono: Float32Array; sr: number }>) => {
  const { mono, sr } = e.data;
  const F = computeFeatures(mono, sr, (p) => (self as unknown as Worker).postMessage({ progress: p }));
  const transfer = [F.rms, F.centroid, F.bands, F.spec, F.kick, F.snare, F.hat, F.onset].map((a) => a.buffer);
  (self as unknown as Worker).postMessage({ F }, transfer);
};
