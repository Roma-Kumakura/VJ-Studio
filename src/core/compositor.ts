import type { Frame } from './frame';
import { compile, createGL } from './gl';
import type { Hud } from './hud';
import { BLEND_IDS } from './media';
import { mulberry32 } from './rng';
import type { RenderEnv, TemplateInstance } from './template';

/**
 * Final output stage (shared by every template):
 *  1. post FX on the template image: bloom, anamorphic streak, chromatic aberration, zoom punch, drop flash
 *  2. 3D glitter field (twinkling star glints flying toward the camera, beat-locked)
 *  3. HUD overlay (icon, @username, analyzers)
 */
const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`;

const POST = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uKick, uSnare, uDrop, uDropHit, uEnergy, uBloom, uFx, uDim;
uniform sampler2D uMedia;
uniform int uMediaMode, uBlend;
uniform float uMix, uMediaAspect, uTilt, uMotion, uCut;
uniform vec3 uCard, uAcc;
float h(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h2(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 w=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),w.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),w.x), w.y); }
uniform sampler2D uTexB;
uniform int uTrans;   // -1 none, 0 cut,1 fade,2 flash,3 zoom,4 glitch,5 wipe
uniform float uP;     // transition progress 0..1 (or mask parameter for chaos masks 6..10)
uniform int uMirror;  // chaos: 0 none,1 x,2 y,3 xy,4 kaleido
uniform float uInv, uPoster, uHue, uStrobe;
uniform float uHit;       // manual chaos re-roll impact (1 at the tap, decays)
uniform sampler2D uLayer;  // photos / videos drawn to be blended into the scene (chaos collage)
uniform int uLayerOn;
uniform float uSoft;       // 3D card: 0 = pasted on top, 1 = melted into the scene
/** blend a picture into the scene: it picks up the scene's colour and light, soft-light in the darks, screen in the highlights */
vec3 organic(vec3 base, vec3 m, float amt){
  float lm = dot(m, vec3(.299,.587,.114));
  vec3 tint = m * mix(vec3(1.), base*1.7 + .2, .4*amt);
  vec3 sl = mix(2.*base*tint + base*base*(1. - 2.*tint), sqrt(max(base, 0.))*(2.*tint - 1.) + 2.*base*(1. - tint), step(.5, tint));
  vec3 sc = 1. - (1. - base)*(1. - tint);
  vec3 b = mix(sl, sc, smoothstep(.25, .85, lm));
  return mix(m, mix(b, tint, .35), amt);
}
vec3 rgbSplit(sampler2D t, vec2 u, vec2 d){ return vec3(texture(t, u + d).r, texture(t, u).g, texture(t, u - d).b); }
vec3 glowOf(sampler2D t, vec2 u){
  vec3 b = vec3(0.);
  for(int l=2; l<=7; l++){ vec3 s = textureLod(t, u, float(l)).rgb; b += s * smoothstep(.55, .95, dot(s, vec3(.299,.587,.114))); }
  vec3 st = vec3(0.);
  for(int i=-5; i<=5; i++){ float fi = float(i)*2.; vec3 s = textureLod(t, u + vec2(fi*.025, 0.), 4.).rgb; st += s * smoothstep(.75, 1., dot(s, vec3(.299,.587,.114))) * exp(-abs(fi)*.3); }
  float avg = dot(textureLod(t, vec2(.5), 12.).rgb, vec3(.299,.587,.114));
  return (b * .09 + st * .08 * vec3(.75, .88, 1.)) * (1. - .85*smoothstep(.3, .6, avg));
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 c = uv - .5;
  c *= 1. - (uKick*.014 + uDropHit*.06)*uFx - uHit*.11;
  // re-roll impact: the frame tears into horizontal slices for a moment
  if(uHit > .04){
    float row = floor(uv.y*36.);
    float rr = h(row + floor(uTime*24.)*13.7);
    c.x += (rr - .5) * uHit * .18 * step(.45, rr);
    c.y += (h(row*3.1 + floor(uTime*24.)) - .5) * uHit * .02;
  }
  c += (vec2(h(floor(uTime*30.)), h(floor(uTime*30.)+7.)) - .5) * uDropHit * .012 * uFx;
  vec2 u = c + .5;
  if(uMirror == 1 || uMirror == 3) u.x = .5 - abs(u.x - .5);
  if(uMirror == 2 || uMirror == 3) u.y = .5 - abs(u.y - .5);
  if(uMirror == 4){ vec2 q = (u - .5)*vec2(uRes.x/uRes.y, 1.); float a = atan(q.y, q.x), r = length(q); float sg = 6.2831/6.; a = abs(mod(a, sg) - sg*.5); u = vec2(cos(a), sin(a))*r*vec2(uRes.y/uRes.x, 1.) + .5; }
  float ca = (.0012 + uKick*.004 + uSnare*.002 + uDropHit*.016) * uFx + uHit*.03;
  vec2 d = c * ca * 2.;
  float bl = uBloom * (1. + uDrop*.4 + uKick*.6);
  vec3 col;
  if(uTrans < 0){
    col = rgbSplit(uTex, u, d) + glowOf(uTex, u) * bl;
  } else {
    // ---- scene transition between theme A (uTex) and theme B (uTexB)
    float p = clamp(uP, 0., 1.);
    vec2 ua = u, ub = u;
    float wb = 0.;
    vec3 extra = vec3(0.);
    if(uTrans == 0) wb = step(.5, p);
    else if(uTrans == 1) wb = smoothstep(0., 1., p);
    else if(uTrans == 2){ wb = step(.25, p); extra = vec3(1.) * pow(max(0., 1. - abs(p - .25) * 2.2), 2.) * 1.3; }
    else if(uTrans == 3){
      ua = (u - .5) * (1. - .55*smoothstep(0., .6, p)) + .5;
      ub = (u - .5) * (1. + .7*(1. - smoothstep(.45, 1., p))) + .5;
      wb = smoothstep(.42, .62, p);
      extra = vec3(1.) * .35 * (1. - abs(p - .52) * 2.);
    } else if(uTrans >= 6){
      // chaos masks: two themes coexist, cut by a moving pattern
      float tt = uTime;
      if(uTrans == 6) wb = step(.5, fract(uv.y*(4. + p*14.) + tt*.3*(p - .5)));
      else if(uTrans == 7) wb = step(length((uv - .5)*vec2(uRes.x/uRes.y, 1.)), .15 + .35*p + uKick*.15);
      else if(uTrans == 8) wb = step(.5, noise2(uv*(3. + p*6.) + tt*.4));
      else if(uTrans == 9) wb = mod(floor(uv.x*(4. + p*10.) + tt*.5) + floor(uv.y*(3. + p*8.)), 2.);
      else wb = -1.;
      if(wb >= 0.) wb *= clamp(p * 2.2, 0., 1.);   // the mask fades in with the mix amount
    } else if(uTrans == 4){
      float row = floor(uv.y * 28.);
      float r = h(row + floor(uTime * 24.) * 7.31);
      wb = step(r, p * 1.25 - .1);
      float sh = (r - .5) * .12 * sin(p * 3.1416);
      ua.x += sh; ub.x -= sh;
      d *= 1. + 8. * sin(p * 3.1416);
    } else {
      float e = (u.x + (1. - u.y) * .35) / 1.35;
      wb = 1. - smoothstep(p * 1.08 - .03, p * 1.08, e);
      extra = uAcc * smoothstep(.025, 0., abs(e - p * 1.08 + .015)) * 1.5;
    }
    vec3 ca_ = rgbSplit(uTex, ua, d), cb_ = rgbSplit(uTexB, ub, d);
    vec3 ga = wb < .999 ? glowOf(uTex, ua) : vec3(0.), gb = wb > .001 ? glowOf(uTexB, ub) : vec3(0.);
    if(wb < -.5){ ga = glowOf(uTex, ua); gb = glowOf(uTexB, ub); col = abs((ca_ + ga*bl) - (cb_ + gb*bl)) * 1.4; }
    else col = mix(ca_ + ga * bl, cb_ + gb * bl, wb) + extra;
  }

  // ---- user photo / video as background: template light is blended over it
  if(uMediaMode == 1){
    float fa = uRes.x/uRes.y, ma = uMediaAspect;
    float z = 1.05 + .04*sin(uTime*.11)*uMotion + (uKick*.03 + uCut*.12 + uDropHit*.08)*uMotion;
    vec2 q = uv - .5;
    q.x *= min(1., fa/ma); q.y *= min(1., ma/fa);
    q = q/z + vec2(sin(uTime*.07), cos(uTime*.05))*.012*uMotion;
    vec2 dm = q*ca*1.5;
    vec3 m = vec3(texture(uMedia, q+.5+dm).r, texture(uMedia, q+.5).g, texture(uMedia, q+.5-dm).b);
    m *= 1. + uCut*.5;
    vec3 t2 = col*uMix;
    if(uBlend == 0) col = 1. - (1.-m)*(1.-t2);
    else if(uBlend == 1) col = m + t2;
    else if(uBlend == 2) col = mix(2.*m*t2*1.6 + m*.3, 1. - 2.*(1.-m)*(1.-t2), step(.5, m));
    else col = mix(m, col, uMix);
  }
  // ---- melted-in photos / videos (follow the camera punch and colour split like the scene does)
  if(uLayerOn == 1){
    vec2 lu = u + (vec2(noise2(u*6. + uTime*.3), noise2(u*6. - uTime*.27)) - .5) * (.004 + uKick*.01);
    vec4 L = texture(uLayer, lu);
    if(L.a > .002){
      vec3 m = vec3(texture(uLayer, lu + d).r, L.g, texture(uLayer, lu - d).b);
      m += (h2(gl_FragCoord.xy + fract(uTime)*97.) - .5) * .06;   // a little grain so it sits in the same "film"
      col = mix(col, organic(col, m, .9), L.a);
    }
  }
  col += vec3(1.) * uDropHit * uDropHit * .18 * uFx;
  // re-roll impact: a negative frame at the very start, then a white flash that fades
  if(uHit > .82) col = 1. - col;
  col += vec3(1.) * uHit * uHit * .55;
  col *= 1. - uDim;
  // ---- chaos whole-frame mutations
  if(uHue != 0.){
    float a = uHue + uTime*.3;
    vec3 k = vec3(.57735);
    col = col*cos(a) + cross(k, col)*sin(a) + k*dot(k, col)*(1. - cos(a));
  }
  if(uPoster > 1.) col = floor(col*uPoster + .5)/uPoster;
  if(uInv > 0.) col = mix(col, 1. - col, uInv);
  if(uStrobe > 0.) col *= 1. + uStrobe*step(.5, fract(uTime*8.))*.8;

  // ---- user photo / video as a floating 3D card
  if(uMediaMode == 2){
    vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
    vec2 C = vec2((uCard.x - .5)*uRes.x/uRes.y, .5 - uCard.y);
    float hh = .28*uCard.z*(1. + uKick*.03*uMotion + uCut*.06*uMotion);
    vec2 hs = vec2(hh*clamp(uMediaAspect, .5, 2.2), hh);
    float ry = (sin(uTime*.37)*.38 + uSnare*.06)*uTilt, rx = (cos(uTime*.29)*.22 - uKick*.06)*uTilt;
    mat3 Ry = mat3(cos(ry),0.,sin(ry), 0.,1.,0., -sin(ry),0.,cos(ry));
    mat3 Rx = mat3(1.,0.,0., 0.,cos(rx),-sin(rx), 0.,sin(rx),cos(rx));
    mat3 R = Ry*Rx;
    vec3 ro = vec3(0.,0.,-2.4), rd = normalize(vec3(p, 2.4));
    vec3 P0 = vec3(C, 0.), n = R*vec3(0.,0.,1.);
    float tt = dot(P0 - ro, n)/dot(rd, n);
    vec2 l = (transpose(R)*(ro + rd*tt - P0)).xy;
    vec2 e = abs(l) - hs;
    float sd = length(max(e, 0.)) + min(max(e.x, e.y), 0.);
    // soft drop shadow (screen space) + accent glow halo
    vec2 sp = p - C - vec2(.02, -.03);
    vec2 se = abs(sp) - hs*.98;
    float ssd = length(max(se, 0.)) + min(max(se.x, se.y), 0.);
    float hard = 1. - uSoft;
    col *= 1. - .55*hard*smoothstep(.09, -.02, ssd);
    col += uAcc * exp(-max(sd, 0.)*35.) * (.25 + uKick*.7 + uCut*.8) * (.3 + .7*hard);
    float fe = .002 + uSoft*.09;   // feathered edge
    if(sd < fe){
      vec2 mu = clamp(l/(2.*hs) + .5, 0., 1.);
      vec3 m = vec3(texture(uMedia, mu + vec2(ca, 0.)).r, texture(uMedia, mu).g, texture(uMedia, mu - vec2(ca, 0.)).b);
      m *= 1. + uCut*.5;
      m += .18*hard*smoothstep(.09, .0, abs(dot(l/hs, normalize(vec2(1., .5))) - sin(uTime*.37)*1.2));
      float inside = smoothstep(fe, -fe, sd);
      col = mix(col, organic(col, m, uSoft), inside);
    }
    col = mix(col, vec3(1.), smoothstep(.004, .0, abs(sd))*.85*hard);
  }
  o = vec4(col, 1.);
}`;

const G_VERT = `#version 300 es
precision highp float;
in vec4 aRand;
uniform vec2 uRes;
uniform float uTime, uFlow, uKick, uHat, uDropHit, uAmt;
uniform vec3 uC0, uC1;
out vec3 vCol; out float vA; out float vStar;
void main(){
  float z = fract(aRand.z - uFlow * (.4 + aRand.w*.6));
  float zz = mix(.25, 5., z);
  vec2 p = (aRand.xy - .5) * vec2(7., 4.2);
  // burst outward on drops
  p *= 1. + uDropHit * .6 * (1. - z);
  vec2 sp = p / zz;
  sp.x *= uRes.y / uRes.x;
  gl_Position = vec4(sp, 0., 1.);
  float tw = .55 + .45 * sin(uTime * (2. + aRand.w*6.) + aRand.w*60.);
  vStar = step(.86, aRand.w);
  float size = (vStar > .5 ? 26. : 7.) * (1. + uKick*.6 + uHat*.4) / zz;
  gl_PointSize = size * uRes.y / 1080. * (.6 + uAmt*.4) * 3.;
  float fade = smoothstep(1., .75, z) * smoothstep(.0, .12, z);
  vA = fade * tw * (.35 + uHat*.5 + uDropHit*.8) * min(uAmt, 1.5);
  vCol = mix(mix(uC0, uC1, aRand.x), vec3(1., .95, .85), step(.6, aRand.y));
}`;
const G_FRAG = `#version 300 es
precision highp float;
in vec3 vCol; in float vA; in float vStar; out vec4 o;
void main(){
  vec2 d = gl_PointCoord - .5;
  float core = exp(-dot(d,d) * (vStar > .5 ? 120. : 30.));
  float arms = vStar * (exp(-abs(d.x)*90.) * exp(-abs(d.y)*7.) + exp(-abs(d.y)*90.) * exp(-abs(d.x)*7.));
  float diag = vStar * .35 * (exp(-abs(d.x-d.y)*80.) + exp(-abs(d.x+d.y)*80.)) * exp(-length(d)*9.);
  o = vec4(vCol * (core + arms + diag) * vA, 1.);
}`;

const HUD_FRAG = `#version 300 es
precision highp float;
out vec4 o; uniform sampler2D uHud; uniform vec2 uRes;
void main(){ o = texture(uHud, vec2(gl_FragCoord.x/uRes.x, 1. - gl_FragCoord.y/uRes.y)); }`;

function hexToVec(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private post: WebGLProgram; private glit: WebGLProgram; private hudP: WebGLProgram;
  private quadVao: WebGLVertexArrayObject; private glitVao: WebGLVertexArrayObject;
  private srcTex: WebGLTexture; private hudTex: WebGLTexture;
  private nGlitter = 2600;
  private mediaTex: WebGLTexture;
  private srcTexB: WebGLTexture;
  private mediaShown = -1;
  private layerTex: WebGLTexture;
  private layer: HTMLCanvasElement | null = null;
  /** draws photos / videos that should melt into the scene (chaos collage); null = off */
  mixLayer: ((g: CanvasRenderingContext2D, W: number, H: number, t: number, f: Frame) => void) | null = null;

  constructor(private env: RenderEnv, private hud: Hud) {
    const { canvas, gl } = createGL(env.width, env.height);
    this.canvas = canvas; this.gl = gl;
    this.post = compile(gl, VERT, POST);
    this.glit = compile(gl, G_VERT, G_FRAG);
    this.hudP = compile(gl, VERT, HUD_FRAG);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const p of [this.post, this.hudP]) { gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p); }

    const rng = mulberry32(env.seed * 3 + 1);
    const rand = new Float32Array(this.nGlitter * 4).map(() => rng());
    this.glitVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.glitVao);
    const rb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, rb); gl.bufferData(gl.ARRAY_BUFFER, rand, gl.STATIC_DRAW);
    const rl = gl.getAttribLocation(this.glit, 'aRand');
    gl.enableVertexAttribArray(rl); gl.vertexAttribPointer(rl, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.srcTex = gl.createTexture()!;
    this.hudTex = gl.createTexture()!;
    this.srcTexB = gl.createTexture()!;
    this.mediaTex = gl.createTexture()!;
    this.layerTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, this.mediaTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private upload(unit: number, tex: WebGLTexture, inst: TemplateInstance) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, inst.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, inst.pixelated ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** render one frame; with instB + trans it blends two themes (scene transition) */
  /** chaos-mode collage drawn into the HUD layer */
  setOverlay(fn: Hud['extra']) { this.hud.extra = fn; }

  /** chaos-mode whole-frame effects (null = off) */
  chaosFx: { mirror: number; invert: number; posterize: number; hue: number; strobe: number; hit?: number } | null = null;
  /** chaos mode: lyric templates intersect (seed) — passed to the HUD */
  chaosLyrics: number | null = null;

  render(inst: TemplateInstance, t: number, f: Frame, instB?: TemplateInstance | null, trans = -1, p = 0) {
    const gl = this.gl, env = this.env;
    const o = env.hud;
    const fx = env.params.intensity ?? 1;
    gl.viewport(0, 0, env.width, env.height);

    // 1. template(s) -> mipmapped texture(s) -> post
    this.upload(0, this.srcTex, inst);
    const blend = !!instB && trans >= 0;
    if (blend) this.upload(3, this.srcTexB, instB!);

    gl.disable(gl.BLEND);
    gl.useProgram(this.post);
    const P = (n: string) => gl.getUniformLocation(this.post, n);
    gl.uniform1i(P('uTex'), 0);
    gl.uniform1i(P('uTexB'), 3);
    gl.uniform1i(P('uTrans'), blend ? trans : -1);
    gl.uniform1f(P('uP'), p);
    const cf = this.chaosFx;
    gl.uniform1i(P('uMirror'), cf?.mirror ?? 0);
    gl.uniform1f(P('uInv'), cf?.invert ?? 0);
    gl.uniform1f(P('uPoster'), cf?.posterize ?? 0);
    gl.uniform1f(P('uHue'), cf?.hue ?? 0);
    gl.uniform1f(P('uStrobe'), cf?.strobe ?? 0);
    gl.uniform1f(P('uHit'), Math.min(1, cf?.hit ?? 0));
    // photo / video layer to be melted in
    if (this.mixLayer) {
      if (!this.layer) { this.layer = document.createElement('canvas'); }
      const L = this.layer;
      if (L.width !== env.width || L.height !== env.height) { L.width = env.width; L.height = env.height; }
      const lg = L.getContext('2d')!;
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, L.width, L.height);
      this.mixLayer(lg, L.width, L.height, t, f);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, L);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(P('uLayerOn'), 1);
    } else gl.uniform1i(P('uLayerOn'), 0);
    gl.uniform1i(P('uLayer'), 4);
    gl.uniform1f(P('uSoft'), env.media?.opts.soft ?? 0.6);
    gl.uniform3fv(P('uAcc'), hexToVec(this.hud.accent));
    gl.uniform2f(P('uRes'), env.width, env.height);
    gl.uniform1f(P('uTime'), t);
    gl.uniform1f(P('uKick'), f.kick); gl.uniform1f(P('uSnare'), f.snare);
    gl.uniform1f(P('uDrop'), f.drop); gl.uniform1f(P('uDropHit'), f.dropHit);
    gl.uniform1f(P('uEnergy'), f.energy);
    gl.uniform1f(P('uBloom'), o?.bloom ?? 1);
    gl.uniform1f(P('uFx'), fx);
    gl.uniform1f(P('uDim'), o?.dim ?? 0);
    const cur = env.media?.current(f.beat);
    if (cur && env.media) {
      const mo = env.media.opts, it = cur.item;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.mediaTex);
      if (it.kind === 'video' || this.mediaShown !== it.id) {
        const ready = !(it.el instanceof HTMLVideoElement) || it.el.readyState >= 2;
        if (ready) {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, it.el);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          this.mediaShown = it.id;
        }
      }
      gl.uniform1i(P('uMedia'), 2);
      // media-only: the media IS the background (normal blend, nothing from a theme on top)
      gl.uniform1i(P('uMediaMode'), mo.only || mo.mode === 'background' ? 1 : 2);
      gl.uniform1i(P('uBlend'), mo.only ? BLEND_IDS.normal : BLEND_IDS[mo.blend]);
      gl.uniform1f(P('uMix'), mo.only ? 0 : mo.mix);
      gl.uniform1f(P('uMediaAspect'), it.width / it.height);
      gl.uniform3f(P('uCard'), mo.x, mo.y, mo.size);
      gl.uniform1f(P('uTilt'), mo.tilt);
      gl.uniform1f(P('uMotion'), mo.motion);
      gl.uniform1f(P('uCut'), cur.cut);
      gl.uniform3fv(P('uAcc'), hexToVec(this.hud.accent));
      gl.activeTexture(gl.TEXTURE0);
    } else {
      gl.uniform1i(P('uMediaMode'), 0);
      gl.uniform1i(P('uMedia'), 2);
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. glitter
    const amt = o?.glitter ?? 1;
    if (amt > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.glit);
      const G = (n: string) => gl.getUniformLocation(this.glit, n);
      gl.uniform2f(G('uRes'), env.width, env.height);
      gl.uniform1f(G('uTime'), t);
      gl.uniform1f(G('uFlow'), f.beat * 0.045 + f.travel * 0.02);
      gl.uniform1f(G('uKick'), f.kick * fx); gl.uniform1f(G('uHat'), f.hat * fx);
      gl.uniform1f(G('uDropHit'), f.dropHit * fx);
      gl.uniform1f(G('uAmt'), amt);
      gl.uniform3fv(G('uC0'), hexToVec(this.hud.accent));
      gl.uniform3fv(G('uC1'), hexToVec(this.hud.accent2));
      gl.bindVertexArray(this.glitVao);
      gl.drawArrays(gl.POINTS, 0, Math.round(this.nGlitter * Math.min(1, amt)));
    }

    // 3. HUD
    this.hud.chaosLyrics = this.chaosLyrics;
    if (this.hud.render(t, f)) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.hud.canvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.useProgram(this.hudP);
      gl.uniform1i(gl.getUniformLocation(this.hudP, 'uHud'), 1);
      gl.uniform2f(gl.getUniformLocation(this.hudP, 'uRes'), env.width, env.height);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
  }

  dispose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
