import { createShaderInstance, type ShaderTemplateOpts } from '../core/gl';
import type { TemplateDef } from '../core/template';

/** Shorthand for a fullscreen-shader theme. */
export function shaderTheme(id: string, name: string, nameEn: string, tagline: string, frag: string, palettes: string[][], textures?: ShaderTemplateOpts['textures']): TemplateDef {
  return { id, name, nameEn, tagline, params: [], overlayDefault: true, create: (env) => createShaderInstance(env, { frag, palettes, textures }) };
}
