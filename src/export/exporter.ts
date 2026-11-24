import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { Compositor } from '../core/compositor';
import { ensureAllFonts } from '../core/fonts';
import { createFrame, sampleFrame } from '../core/frame';
import { Hud } from '../core/hud';
import type { RenderEnv, TemplateDef } from '../core/template';
import { SceneRenderer, type SceneSource } from '../app/sceneRenderer';

export interface ExportJob {
  def: TemplateDef;
  scenes: SceneSource;
  defs: TemplateDef[];
  env: RenderEnv;          // settings to copy (seed, params, hud, meta, media, analysis, audio)
  buffer: AudioBuffer;
  width: number; height: number; fps: number;
  start: number; end: number;
  fadeOut: boolean;
  onProgress: (p: number, info: string) => void;
  signal: { cancelled: boolean };
}
export interface ExportResult { blob: Blob; ext: 'mp4' | 'webm'; note?: string }

const even = (n: number) => Math.round(n / 2) * 2;

/** What the browser can do: frame-exact WebCodecs export, or realtime recording fallback. */
export async function exportCapabilities(width: number, height: number) {
  const hasWC = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  let video: string | null = null, audio: 'aac' | 'opus' | null = null;
  if (hasWC) {
    for (const codec of ['avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42e01f']) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec, width: even(width), height: even(height), bitrate: 8e6, framerate: 30 });
        if (r.supported) { video = codec; break; }
      } catch { /* next */ }
    }
  }
  if (typeof AudioEncoder !== 'undefined') {
    for (const [codec, id] of [['mp4a.40.2', 'aac'], ['opus', 'opus']] as const) {
      try {
        const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
        if (r.supported) { audio = id; break; }
      } catch { /* next */ }
    }
  }
  return { video, audio, frameExact: !!video && !!audio };
}

function makeEnv(job: ExportJob): RenderEnv {
  return { ...job.env, width: even(job.width), height: even(job.height) };
}

/** Slice + optional fades of the song section that is exported. */
function sliceAudio(buf: AudioBuffer, start: number, end: number, fadeOut: boolean, outRate: number) {
  const sr = buf.sampleRate;
  const a = Math.floor(start * sr), b = Math.min(buf.length, Math.floor(end * sr));
  const n = b - a;
  const chans = [0, 1].map((c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)).slice(a, b));
  const fi = Math.min(n, Math.floor(sr * 0.02));
  const fo = Math.min(n, Math.floor(sr * (fadeOut ? 1.5 : 0.05)));
  for (const ch of chans) {
    for (let i = 0; i < fi; i++) ch[i] *= i / fi;
    for (let i = 0; i < fo; i++) ch[n - 1 - i] *= i / fo;
  }
  if (outRate === sr) return { chans, sr };
  // simple linear resample (only used when the context rate is unusual)
  const m = Math.floor((n * outRate) / sr);
  const res = chans.map((ch) => {
    const o = new Float32Array(m);
    for (let i = 0; i < m; i++) { const x = (i * sr) / outRate, j = Math.floor(x), f = x - j; o[i] = (ch[j] ?? 0) * (1 - f) + (ch[j + 1] ?? 0) * f; }
    return o;
  });
  return { chans: res, sr: outRate };
}

/** Frame-exact export: every frame rendered offline, so nothing is dropped even on slow machines. */
export async function exportMp4(job: ExportJob): Promise<ExportResult> {
  const env = makeEnv(job);
  const W = env.width, H = env.height;
  const caps = await exportCapabilities(W, H);
  if (!caps.frameExact) return exportRealtime(job);
  await ensureAllFonts();

  const scenes = new SceneRenderer(env, job.defs, () => job.scenes);
  const hud = new Hud(env);
  const comp = new Compositor(env, hud);
  const bar = 240 / env.analysis.bpm;
  const sr = job.buffer.sampleRate === 44100 ? 44100 : 48000;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: job.fps },
    audio: { codec: caps.audio!, numberOfChannels: 2, sampleRate: sr },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failed: Error | null = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e) });
  const pixels = W * H;
  venc.configure({ codec: caps.video!, width: W, height: H, bitrate: pixels >= 1920 * 1080 * 0.9 ? 12e6 : 6e6, framerate: job.fps, bitrateMode: 'variable', latencyMode: 'quality' });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failed = e) });
  aenc.configure({ codec: caps.audio === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: sr, numberOfChannels: 2, bitrate: 192000 });

  try {
    // audio first (cheap)
    const { chans } = sliceAudio(job.buffer, job.start, job.end, job.fadeOut, sr);
    const CH = 4096;
    for (let i = 0; i < chans[0].length; i += CH) {
      const n = Math.min(CH, chans[0].length - i);
      const data = new Float32Array(n * 2);
      data.set(chans[0].subarray(i, i + n), 0);
      data.set(chans[1].subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sr) * 1e6), data });
      aenc.encode(ad); ad.close();
    }

    // video, frame by frame
    const frame = createFrame();
    const total = Math.max(1, Math.round((job.end - job.start) * job.fps));
    const t0 = performance.now();
    for (let i = 0; i < total; i++) {
      if (job.signal.cancelled) throw new Error('cancelled');
      if (failed) throw failed;
      const t = job.start + i / job.fps;
      sampleFrame(env.analysis, t, frame);
      if (env.media) await env.media.prepare(t, frame.beat);
      scenes.render(comp, t, frame, bar);
      const vf = new VideoFrame(comp.canvas, { timestamp: Math.round((i * 1e6) / job.fps), duration: Math.round(1e6 / job.fps) });
      venc.encode(vf, { keyFrame: i % (job.fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
      if (i % 3 === 0) {
        const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
        job.onProgress((i + 1) / total, `${i + 1} / ${total} コマ · 残り約 ${Math.max(0, Math.round((total - i) / rate))} 秒`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await venc.flush(); await aenc.flush();
    if (failed) throw failed;
    muxer.finalize();
    job.onProgress(1, '完了');
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', note: caps.audio === 'opus' ? '音声がOpusになっています（このブラウザはAAC非対応）。Xで再生できない場合はChromeで書き出してください。' : undefined };
  } finally {
    try { venc.close(); } catch { /* */ }
    try { aenc.close(); } catch { /* */ }
    scenes.dispose(); comp.dispose();
  }
}

/**
 * Fallback for browsers without WebCodecs audio (some phones):
 * plays the section in real time and records canvas + audio with MediaRecorder.
 */
export async function exportRealtime(job: ExportJob): Promise<ExportResult> {
  const env = makeEnv(job);
  await ensureAllFonts();
  const scenes = new SceneRenderer(env, job.defs, () => job.scenes);
  const hud = new Hud(env);
  const comp = new Compositor(env, hud);
  const bar = 240 / env.analysis.bpm;
  const actx = new AudioContext();
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = job.buffer;
  const gain = actx.createGain();
  src.connect(gain); gain.connect(dest);
  const stream = new MediaStream([...comp.canvas.captureStream(job.fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const dur = job.end - job.start;
  const frame = createFrame();
  return new Promise<ExportResult>((resolve, reject) => {
    rec.onstop = () => {
      scenes.dispose(); comp.dispose(); actx.close();
      if (job.signal.cancelled) return reject(new Error('cancelled'));
      const isMp4 = mime.includes('mp4');
      resolve({ blob: new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }), ext: isMp4 ? 'mp4' : 'webm', note: 'リアルタイム録画モードで書き出しました（再生中はタブを開いたままにしてください）。' });
    };
    rec.start(250);
    const t0 = actx.currentTime + 0.1;
    src.start(t0, job.start, dur);
    if (job.fadeOut) { gain.gain.setValueAtTime(1, t0 + Math.max(0, dur - 1.5)); gain.gain.linearRampToValueAtTime(0, t0 + dur); }
    const tick = () => {
      const t = job.start + Math.max(0, actx.currentTime - t0);
      if (job.signal.cancelled || t >= job.end) { rec.stop(); return; }
      sampleFrame(env.analysis, t, frame);
      env.media?.sync(t, frame.beat, true);
      scenes.render(comp, t, frame, bar);
      job.onProgress((t - job.start) / dur, `録画中… ${Math.round(t - job.start)} / ${Math.round(dur)} 秒`);
      requestAnimationFrame(tick);
    };
    tick();
  });
}
