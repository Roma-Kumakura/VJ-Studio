/** Fonts available for titles and free text (loaded from Google Fonts in index.html). */
export type FontId = 'gothic' | 'maru' | 'mincho' | 'dot' | 'heavy' | 'pop' | 'marker' | 'sf';

export interface FontDef { label: string; family: string; weight: number }

const JP_FALLBACK = '"Noto Sans JP", "Hiragino Sans", sans-serif';

export const FONTS: Record<FontId, FontDef> = {
  gothic: { label: 'ゴシック', family: `"Noto Sans JP", "Hiragino Sans", sans-serif`, weight: 900 },
  maru: { label: '丸ゴシック', family: `"Zen Maru Gothic", ${JP_FALLBACK}`, weight: 900 },
  mincho: { label: '明朝', family: `"Shippori Mincho", "Hiragino Mincho ProN", serif`, weight: 800 },
  dot: { label: 'ドット', family: `"DotGothic16", ${JP_FALLBACK}`, weight: 400 },
  heavy: { label: '極太', family: `"Dela Gothic One", ${JP_FALLBACK}`, weight: 400 },
  pop: { label: 'ポップ', family: `"Mochiy Pop One", ${JP_FALLBACK}`, weight: 400 },
  marker: { label: '手書きマーカー', family: `"Yusei Magic", ${JP_FALLBACK}`, weight: 400 },
  sf: { label: 'SF (英数字)', family: `"Orbitron", ${JP_FALLBACK}`, weight: 900 },
};

export const fontCss = (id: FontId, px: number) => {
  const f = FONTS[id] ?? FONTS.gothic;
  return `${f.weight} ${px}px ${f.family}`;
};

/** Make sure a font (and the glyphs for `text`) is ready before drawing to canvas. */
export async function ensureFont(id: FontId, text = 'あA') {
  const first = (FONTS[id] ?? FONTS.gothic).family.split(',')[0];
  try { await document.fonts.load(`${FONTS[id].weight} 40px ${first}`, text); } catch { /* fall back silently */ }
}

export async function ensureAllFonts(text = 'あいうアイウ漢字ABCabc123@') {
  await Promise.all((Object.keys(FONTS) as FontId[]).map((id) => ensureFont(id, text)));
}
