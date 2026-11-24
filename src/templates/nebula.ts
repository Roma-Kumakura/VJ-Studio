import { CommonUniforms, GLSL_COMMON, compile, createGL } from '../core/gl';
import { mulberry32 } from '../core/rng';
import type { RenderEnv, TemplateDef, TemplateInstance } from '../core/template';

// パーティクル星雲 — particles gather into the track title, explode on drops.
const BG_VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`;
const BG_FRAG = GLSL_COMMON + /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float t = uTime*.03;
  vec2 p = uv*1.6 + uV[0]*10.;
  float n1 = fbm(p + vec2(fbm(p + t), fbm(p - t + 3.)));
  float n2 = fbm(p*2. + 7. - t);
  vec3 col = uPal[0] * .6;
  col += uPal[1] * pow(n1, 2.5) * (.7 + uEnergy*.6);
  col += uPal[2] * pow(n2, 4.) * .6;
  vec2 sp = uv*120.; vec2 sc = floor(sp);
  col += vec3(1.) * ss(.15, 0., length(fract(sp)-hash22(sc))) * step(.99, hash12(sc)) * .7;
  col *= .55 + uDrop*.2;
  fragColor = vec4(finish(col), 1.);
}`;

const P_VERT = `#version 300 es
precision highp float;
in vec3 aTarget; in vec4 aRand;
uniform vec2 uRes;
uniform float uTime, uForm, uExplode, uKick, uBass, uSize, uRot, uHat;
uniform vec3 uPal[5];
out vec3 vCol; out float vA;
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
void main(){
  // galaxy disk position
  float r = pow(aRand.x, .6) * 1.7 + .05;
  float arm = floor(aRand.y*3.);
  float ang = arm*2.094 + r*2.6 + (aRand.z-.5)*.9/(r+.3) + uTime*.12/(r+.25);
  vec3 g = vec3(cos(ang)*r, (aRand.w-.5)*.12*(1.8-r), sin(ang)*r);
  g = rotX(1.05) * g;
  // text target with breathing
  vec3 tg = aTarget * (1. + uBass*.06);
  tg.z += (aRand.z-.5)*.08;
  tg.xy += (vec2(aRand.w, aRand.x)-.5)*.01*(1.+uHat*3.);
  float f = clamp(uForm*1.6 - aRand.w*.6, 0., 1.);
  f = f*f*(3.-2.*f);
  vec3 p = mix(g, tg, f);
  vec3 dir = normalize(vec3(aRand.xyz - .5) + 1e-3);
  p += dir * uExplode * (1.2 + aRand.w*2.5);
  p = rotY(uRot) * p;
  float z = 3.2 - p.z;
  vec2 sp = p.xy / z * 2.6;
  sp.x *= uRes.y/uRes.x;
  gl_Position = vec4(sp, 0., 1.);
  gl_PointSize = uSize * (uRes.y/1080.) * (2.2 + aRand.y*2.2) * (1. + uKick*.8) / z * 3.;
  vCol = mix(mix(uPal[2], uPal[3], aRand.y), uPal[4], step(.93, aRand.z));
  vA = (.35 + .4*aRand.x) * (1. + uKick*.5);
}`;
const P_FRAG = `#version 300 es
precision highp float;
in vec3 vCol; in float vA; out vec4 o;
void main(){ vec2 d = gl_PointCoord - .5; float a = exp(-dot(d,d)*18.); o = vec4(vCol * a * vA, 1.); }`;

function sampleText(env: RenderEnv, count: number): Float32Array {
  const text = (env.meta.title || env.meta.artist || '♪').trim();
  const c = document.createElement('canvas');
  const H = 220;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const font = `900 ${H}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = Math.max(64, w); c.height = H + 60;
  g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2);
  const img = g.getImageData(0, 0, c.width, c.height).data;
  const pts: number[] = [];
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (img[(y * c.width + x) * 4 + 3] > 128) pts.push(x, y);
  const out = new Float32Array(count * 3);
  const rng = mulberry32(env.seed + 5);
  const aspect = env.width / env.height;
  const scale = Math.min((1.75 * aspect) / c.width, 1.0 / c.height);
  for (let i = 0; i < count; i++) {
    if (pts.length === 0) { const a = rng() * Math.PI * 2; out.set([Math.cos(a), Math.sin(a), 0], i * 3); continue; }
    const k = Math.floor(rng() * (pts.length / 2)) * 2;
    out[i * 3] = (pts[k] + rng() * 2 - c.width / 2) * scale;
    out[i * 3 + 1] = -(pts[k + 1] + rng() * 2 - c.height / 2) * scale;
    out[i * 3 + 2] = 0;
  }
  return out;
}

function create(env: RenderEnv): TemplateInstance {
  const { canvas, gl } = createGL(env.width, env.height);
  const bg = compile(gl, BG_VERT, BG_FRAG);
  const pp = compile(gl, P_VERT, P_FRAG);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bgVao = gl.createVertexArray()!;
  gl.bindVertexArray(bgVao);
  const bl = gl.getAttribLocation(bg, 'aPos');
  gl.enableVertexAttribArray(bl);
  gl.vertexAttribPointer(bl, 2, gl.FLOAT, false, 0, 0);

  const N = 90000;
  const targets = sampleText(env, N);
  const rng = mulberry32(env.seed + 77);
  const rand = new Float32Array(N * 4).map(() => rng());
  const pVao = gl.createVertexArray()!;
  gl.bindVertexArray(pVao);
  const tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, targets, gl.STATIC_DRAW);
  const tl = gl.getAttribLocation(pp, 'aTarget'); gl.enableVertexAttribArray(tl); gl.vertexAttribPointer(tl, 3, gl.FLOAT, false, 0, 0);
  const rb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, rb); gl.bufferData(gl.ARRAY_BUFFER, rand, gl.STATIC_DRAW);
  const rl = gl.getAttribLocation(pp, 'aRand'); gl.enableVertexAttribArray(rl); gl.vertexAttribPointer(rl, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const common = new CommonUniforms(gl, env, [
    ['#05030f', '#3b1a6b', '#ff7ad9', '#7af0ff', '#ffffff'],
    ['#020812', '#0f3b5c', '#8fe9ff', '#b58cff', '#fff6c9'],
    ['#0c0508', '#5c1f3b', '#ffb36b', '#ff6fb5', '#ffffff'],
  ]);
  const U = (n: string) => gl.getUniformLocation(pp, n);

  return {
    canvas,
    render(t, f) {
      const P = env.params, I = P.intensity ?? 1;
      gl.viewport(0, 0, env.width, env.height);
      gl.disable(gl.BLEND);
      gl.useProgram(bg);
      common.apply(bg, t, f);
      gl.bindVertexArray(bgVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(pp);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      const form = Math.min(1, f.build * 1.2 + f.drop);
      gl.uniform2f(U('uRes'), env.width, env.height);
      gl.uniform1f(U('uTime'), t * (P.speed ?? 1));
      gl.uniform1f(U('uForm'), form);
      gl.uniform1f(U('uExplode'), (f.dropHit * f.dropHit * 1.0 + f.kick * 0.03) * I);
      gl.uniform1f(U('uKick'), f.kick * I);
      gl.uniform1f(U('uHat'), f.hat * I);
      gl.uniform1f(U('uBass'), (f.bands[0] + f.bands[1]) * 0.5 * I);
      gl.uniform1f(U('uSize'), 1.0);
      gl.uniform1f(U('uRot'), Math.sin(t * 0.15 * (P.speed ?? 1)) * 0.5);
      gl.uniform3fv(U('uPal[0]'), new Float32Array(common.palette().flat()));
      gl.bindVertexArray(pVao);
      gl.drawArrays(gl.POINTS, 0, N);
      gl.disable(gl.BLEND);
    },
    dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

export const nebula: TemplateDef = {
  id: 'nebula',
  name: 'パーティクル星雲',
  nameEn: 'Particle Nebula',
  tagline: '9万の粒子が銀河から曲名へ集合。ドロップの瞬間に爆散して再集合する。',
  params: [],
  overlayDefault: false,
  create,
};
