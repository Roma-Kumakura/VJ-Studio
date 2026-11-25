/**
 * Audio file decoding with a fallback for Opus-in-MP4.
 *
 * Suno's .m4a downloads contain Opus audio in an MP4 container. Safari (iPhone and Mac) cannot decode
 * that with decodeAudioData ("EncodingError: Decoding failed"), although its WebCodecs AudioDecoder can
 * decode Opus. So when the native path fails we read the audio packets out of the MP4 ourselves and
 * feed them to AudioDecoder.
 */

/** decode any supported audio file into an AudioBuffer */
export async function decodeAudioFile(data: ArrayBuffer): Promise<AudioBuffer> {
  let nativeError: unknown = null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    // decodeAudioData may detach the buffer, so give it a copy
    return await ctx.decodeAudioData(data.slice(0));
  } catch (e) {
    nativeError = e;
  } finally {
    ctx.close?.().catch(() => {});  // iOS limits how many AudioContexts can exist at once
  }
  if (isMp4(data) && typeof AudioDecoder !== 'undefined') {
    try { return await decodeMp4Audio(data); } catch (e) { console.warn('mp4 fallback failed', e); }
  }
  throw nativeError;
}

const isMp4 = (b: ArrayBuffer) => b.byteLength > 12 && new TextDecoder().decode(new Uint8Array(b, 4, 4)) === 'ftyp';

// ---------------------------------------------------------------- minimal MP4 demuxer (first audio track)
interface Box { type: string; start: number; end: number; body: number }
function* boxes(v: DataView, from: number, to: number): Generator<Box> {
  let p = from;
  while (p + 8 <= to) {
    let size = v.getUint32(p);
    const type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7));
    let body = p + 8;
    if (size === 1) { size = Number(v.getBigUint64(p + 8)); body = p + 16; }
    else if (size === 0) size = to - p;
    if (size < 8 || p + size > to) return;
    yield { type, start: p, end: p + size, body };
    p += size;
  }
}
const child = (v: DataView, b: Box, type: string) => { for (const c of boxes(v, b.body, b.end)) if (c.type === type) return c; return null; };
const path = (v: DataView, b: Box | null, ...types: string[]) => { let cur = b; for (const t of types) { if (!cur) return null; cur = child(v, cur, t); } return cur; };

interface Track { codec: 'opus' | 'aac'; sampleRate: number; channels: number; description?: Uint8Array; preSkip: number; samples: { off: number; size: number }[] }

function readTrack(buf: ArrayBuffer): Track {
  const v = new DataView(buf);
  let moov: Box | null = null;
  for (const b of boxes(v, 0, buf.byteLength)) if (b.type === 'moov') moov = b;
  if (!moov) throw new Error('no moov');
  for (const trak of boxes(v, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const hdlr = path(v, trak, 'mdia', 'hdlr');
    if (!hdlr || String.fromCharCode(...new Uint8Array(buf, hdlr.body + 8, 4)) !== 'soun') continue;
    const stbl = path(v, trak, 'mdia', 'minf', 'stbl');
    if (!stbl) continue;
    // sample description
    const stsd = child(v, stbl, 'stsd')!;
    const entry = boxes(v, stsd.body + 8, stsd.end).next().value as Box;
    const channels = v.getUint16(entry.body + 16);
    const rate = v.getUint32(entry.body + 24) >>> 16;
    let track: Partial<Track>;
    if (entry.type === 'Opus') {
      const dOps = child(v, { ...entry, body: entry.body + 28 }, 'dOps');
      if (!dOps) throw new Error('no dOps');
      const d = dOps.body;
      const outCh = v.getUint8(d + 1), preSkip = v.getUint16(d + 2), inRate = v.getUint32(d + 4), gain = v.getInt16(d + 8), family = v.getUint8(d + 10);
      // OpusHead (little-endian) built from the big-endian dOps box
      const extra = family !== 0 ? new Uint8Array(buf, d + 11, 2 + outCh) : new Uint8Array(0);
      const head = new Uint8Array(19 + extra.length); const hv = new DataView(head.buffer);
      head.set([...'OpusHead'].map((c) => c.charCodeAt(0)), 0);
      hv.setUint8(8, 1); hv.setUint8(9, outCh); hv.setUint16(10, preSkip, true); hv.setUint32(12, inRate, true); hv.setInt16(16, gain, true); hv.setUint8(18, family);
      head.set(extra, 19);
      track = { codec: 'opus', sampleRate: 48000, channels: outCh || channels, description: head, preSkip };
    } else if (entry.type === 'mp4a') {
      // AudioSpecificConfig from esds (descriptor tag 0x05)
      const esds = child(v, { ...entry, body: entry.body + 28 }, 'esds');
      if (!esds) throw new Error('no esds');
      const bytes = new Uint8Array(buf, esds.body + 4, esds.end - esds.body - 4);
      let asc: Uint8Array | undefined;
      for (let i = 0; i < bytes.length - 2; i++) {
        if (bytes[i] !== 0x05) continue;
        let j = i + 1, len = 0;
        for (let k = 0; k < 4; k++) { const c = bytes[j++]; len = (len << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
        asc = bytes.slice(j, j + len); break;
      }
      track = { codec: 'aac', sampleRate: rate, channels, description: asc, preSkip: 0 };
    } else throw new Error('unsupported audio entry ' + entry.type);
    // sample table: sizes, chunk offsets, samples per chunk
    const stsz = child(v, stbl, 'stsz')!, stsc = child(v, stbl, 'stsc')!;
    const stco = child(v, stbl, 'stco'), co64 = child(v, stbl, 'co64');
    const fixed = v.getUint32(stsz.body + 4), count = v.getUint32(stsz.body + 8);
    const sizes = Array.from({ length: count }, (_, i) => fixed || v.getUint32(stsz.body + 12 + i * 4));
    const nChunks = v.getUint32((stco ?? co64)!.body + 4);
    const chunkOff = Array.from({ length: nChunks }, (_, i) => stco ? v.getUint32(stco.body + 8 + i * 4) : Number(v.getBigUint64(co64!.body + 8 + i * 8)));
    const nStsc = v.getUint32(stsc.body + 4);
    const runs = Array.from({ length: nStsc }, (_, i) => ({ first: v.getUint32(stsc.body + 8 + i * 12) - 1, per: v.getUint32(stsc.body + 12 + i * 12) }));
    const samples: { off: number; size: number }[] = [];
    let si = 0;
    for (let c = 0; c < nChunks && si < count; c++) {
      let per = runs[0].per;
      for (const r of runs) if (c >= r.first) per = r.per;
      let off = chunkOff[c];
      for (let k = 0; k < per && si < count; k++) { samples.push({ off, size: sizes[si] }); off += sizes[si]; si++; }
    }
    return { ...(track as Track), samples };
  }
  throw new Error('no audio track');
}

async function decodeMp4Audio(buf: ArrayBuffer): Promise<AudioBuffer> {
  const tr = readTrack(buf);
  const config: AudioDecoderConfig = { codec: tr.codec === 'opus' ? 'opus' : 'mp4a.40.2', sampleRate: tr.sampleRate, numberOfChannels: tr.channels, description: tr.description };
  const sup = await AudioDecoder.isConfigSupported(config);
  if (!sup.supported) throw new Error('decoder does not support ' + config.codec);
  const chans: Float32Array[][] = Array.from({ length: tr.channels }, () => []);
  let outRate = tr.sampleRate, total = 0, failed: unknown = null;
  const dec = new AudioDecoder({
    output: (ad) => {
      outRate = ad.sampleRate;
      for (let c = 0; c < tr.channels; c++) {
        const plane = new Float32Array(ad.numberOfFrames);
        ad.copyTo(plane, { planeIndex: Math.min(c, ad.numberOfChannels - 1), format: 'f32-planar' });
        chans[c].push(plane);
      }
      total += ad.numberOfFrames;
      ad.close();
    },
    error: (e) => { failed = e; },
  });
  dec.configure(config);
  const u8 = new Uint8Array(buf);
  let ts = 0;
  const frameUs = tr.codec === 'opus' ? 20000 : (1024 / tr.sampleRate) * 1e6;
  for (const s of tr.samples) {
    dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(ts), data: u8.subarray(s.off, s.off + s.size) }));
    ts += frameUs;
    if (dec.decodeQueueSize > 64) await new Promise((r) => setTimeout(r, 0));
    if (failed) break;
  }
  await dec.flush();
  dec.close();
  if (failed) throw failed;
  const skip = Math.min(total, Math.round((tr.preSkip * outRate) / 48000));
  const length = Math.max(1, total - skip);
  const out = new AudioBuffer({ length, numberOfChannels: tr.channels, sampleRate: outRate });
  for (let c = 0; c < tr.channels; c++) {
    const all = new Float32Array(total);
    let p = 0; for (const part of chans[c]) { all.set(part, p); p += part.length; }
    out.copyToChannel(all.subarray(skip), c);
  }
  return out;
}
