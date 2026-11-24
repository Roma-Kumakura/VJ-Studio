import type { Frame } from './frame';
import { hex, hueShift, mulberry32, type RGB } from './rng';
import type { RenderEnv, TemplateInstance } from './template';

export const GLSL_COMMON = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime, uBeat, uBeatPhase, uBar, uKick, uSnare, uHat, uEnergy, uCentroid;
uniform float uDrop, uDropHit, uBuild, uBpm, uTravel, uProg, uSection;
uniform float uIntensity, uSpeed;
uniform float uBands[8];
uniform float uV[8];
uniform vec3 uPal[5];
uniform sampler2D uSpec;
#define PI 3.14159265
#define TAU 6.2831853
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float noise1(float x){ float i=floor(x), f=fract(x); return mix(hash11(i),hash11(i+1.),f*f*(3.-2.*f)); }
float fbm(vec2 p){ float v=0., a=.5; mat2 r=mat2(.8,.6,-.6,.8); for(int i=0;i<5;i++){ v+=a*noise(p); p=r*p*2.03; a*=.5; } return v; }
float fbm1(float x){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise1(x); x*=2.07; a*=.5; } return v; }
float spec(float x){ return texture(uSpec, vec2(clamp(x,0.,1.), .5)).r; }
float ss(float a,float b,float x){ return smoothstep(a,b,x); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
vec3 finish(vec3 col){
  vec2 q = gl_FragCoord.xy/uRes;
  col *= .55 + .45*pow(16.*q.x*q.y*(1.-q.x)*(1.-q.y), .25);
  col = aces(col);
  col = pow(col, vec3(1./1.1));
  col += (hash12(gl_FragCoord.xy + fract(uTime*7.13)*100.) - .5) * .035;
  return col;
}
`;

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`;

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      console.error(log, '\n', lines);
      throw new Error('Shader compile error: ' + log);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
  return p;
}

export function makeTexture(gl: WebGL2RenderingContext, src: TexImageSource, opts: { mip?: boolean; repeat?: boolean } = {}) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (opts.mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

export function createGL(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false })!;
  if (!gl) throw new Error('WebGL2 not supported');
  return { canvas, gl };
}

/** Shared uniform state: spectrum texture + all common uniforms. */
export class CommonUniforms {
  private specTex: WebGLTexture;
  private specBytes = new Uint8Array(32);
  private loc = new Map<string, WebGLUniformLocation | null>();
  readonly v: Float32Array;
  private palettes: RGB[][];
  private palIndex: number;

  constructor(private gl: WebGL2RenderingContext, private env: RenderEnv, palettes: string[][]) {
    const rng = mulberry32(env.seed * 7919 + 13);
    this.v = new Float32Array(8).map(() => rng());
    this.palettes = palettes.map((p) => p.map(hex));
    this.palIndex = Math.floor(rng() * palettes.length);
    this.specTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 32, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.specBytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  palette(): RGB[] {
    const base = this.palettes[this.palIndex];
    const h = this.env.params.hue ?? 0;
    // slight seed-based hue jitter so the same palette varies between seeds
    const jitter = (this.v[7] - 0.5) * 24;
    const out = base.map((c) => hueShift(c, h + jitter));
    while (out.length < 5) out.push(out[out.length - 1]);
    return out;
  }

  private u(p: WebGLProgram, name: string) {
    const key = name;
    if (!this.loc.has(key)) this.loc.set(key, this.gl.getUniformLocation(p, name));
    return this.loc.get(key)!;
  }

  apply(p: WebGLProgram, t: number, f: Frame, specUnit = 0) {
    const gl = this.gl, P = this.env.params;
    const I = P.intensity ?? 1, S = P.speed ?? 1;
    for (let i = 0; i < 32; i++) this.specBytes[i] = Math.min(255, f.spec[i] * 255 * Math.min(1.5, 0.4 + I * 0.6));
    gl.activeTexture(gl.TEXTURE0 + specUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 1, gl.RED, gl.UNSIGNED_BYTE, this.specBytes);
    gl.uniform1i(this.u(p, 'uSpec'), specUnit);
    gl.uniform2f(this.u(p, 'uRes'), this.env.width, this.env.height);
    const set = (n: string, v: number) => gl.uniform1f(this.u(p, n), v);
    set('uTime', t * S); set('uBeat', f.beat); set('uBeatPhase', f.beatPhase); set('uBar', f.bar);
    set('uKick', f.kick * I); set('uSnare', f.snare * I); set('uHat', f.hat * I);
    set('uEnergy', f.energy); set('uCentroid', f.centroid);
    set('uDrop', f.drop); set('uDropHit', f.dropHit * Math.min(1, I)); set('uBuild', f.build);
    set('uBpm', f.bpm); set('uTravel', f.travel * S); set('uProg', f.prog); set('uSection', f.section);
    set('uIntensity', I); set('uSpeed', S);
    gl.uniform1fv(this.u(p, 'uBands[0]'), f.bands);
    gl.uniform1fv(this.u(p, 'uV[0]'), this.v);
    const pal = this.palette();
    gl.uniform3fv(this.u(p, 'uPal[0]'), new Float32Array(pal.slice(0, 5).flat()));
  }
}

export interface ShaderTemplateOpts {
  frag: string;
  palettes: string[][];
  /** extra textures: name -> source; created once per instance */
  textures?: (env: RenderEnv) => Record<string, TexImageSource>;
}

/** Build a fullscreen-fragment-shader template instance. */
export function createShaderInstance(env: RenderEnv, opts: ShaderTemplateOpts): TemplateInstance {
  const { canvas, gl } = createGL(env.width, env.height);
  const prog = compile(gl, VERT, GLSL_COMMON + opts.frag);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const common = new CommonUniforms(gl, env, opts.palettes);
  const extra = opts.textures ? Object.entries(opts.textures(env)).map(([name, src]) => ({ name, tex: makeTexture(gl, src, { mip: true }) })) : [];
  return {
    canvas,
    render(t, f) {
      gl.viewport(0, 0, env.width, env.height);
      gl.useProgram(prog);
      common.apply(prog, t, f, 0);
      extra.forEach((e, i) => {
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.uniform1i(gl.getUniformLocation(prog, e.name), 1 + i);
      });
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
