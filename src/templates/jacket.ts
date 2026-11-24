import { createShaderInstance } from '../core/gl';
import { mulberry32 } from '../core/rng';
import type { RenderEnv, TemplateDef } from '../core/template';

// ジャケット・パルス — cover art in the centre with a circular spectrum.
const frag = /* glsl */ `
uniform sampler2D uCover;
uniform sampler2D uRing;
vec3 cover(vec2 p, float lod){ return textureLod(uCover, p, lod).rgb; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float circ = step(.5, uV[0]);
  float pulse = 1. + uKick*.06 + uDropHit*.08;
  float S = (.5 + uV[1]*.08) * pulse;
  vec3 col;

  // blurred zoomed cover background
  vec2 bp = uv*.45 + .5 + vec2(sin(uTime*.07), cos(uTime*.05))*.05;
  col = cover(bp, 6.) * .55 + cover(bp + .03, 7.) * .3;
  col = mix(col, uPal[0], .45) * (.45 + uEnergy*.35);
  // light leaks
  col += uPal[1] * .25 * pow(fbm(uv*1.2 + uTime*.05), 3.) * 3.;

  // --- 3D: the foreground disc lives on a plane that tilts with the music
  float ry = sin(uTime*.31)*.42 + (uV[2]-.5)*.3 + uSnare*.05;
  float rx = cos(uTime*.23)*.24 - .1 + uKick*.05;
  mat3 Ry = mat3(cos(ry),0.,sin(ry), 0.,1.,0., -sin(ry),0.,cos(ry));
  mat3 Rx = mat3(1.,0.,0., 0.,cos(rx),-sin(rx), 0.,sin(rx),cos(rx));
  mat3 Rm = Ry*Rx;
  vec3 ro = vec3(0.,0.,-2.4);
  vec3 rd = normalize(vec3(uv, 2.4));
  vec3 n = Rm*vec3(0.,0.,1.);
  // receding halo rings stacked behind the disc (depth layers)
  for(int k=6;k>=1;k--){
    float fk = float(k);
    float tt = (fk*.32 - dot(ro,n))/dot(rd,n);
    vec2 lq = (transpose(Rm)*(ro+rd*tt)).xy;
    float ringR = .62 + uBands[k%8]*.12*uIntensity;
    float w = .006 + .004*fk;
    col += mix(uPal[2], uPal[3], fk/6.) * ss(w, .0, abs(length(lq)-ringR)) * (.35 + uBands[k%8]*1.2) * (1.15 - fk*.15);
  }
  vec2 lp = (transpose(Rm)*(ro + rd*(-dot(ro,n)/dot(rd,n)))).xy;
  // soft shadow of the disc onto the background
  col *= 1. - .45*ss(S*.95, S*.25, length(uv - vec2(.05,-.06)));
  float r = length(lp), a = atan(lp.y, lp.x);
  float R = circ > .5 ? S*.5 : S*.5*1.42;
  R += .02;

  // circular spectrum bars (mirrored)
  float nb = 72.;
  float ai = floor((a/TAU + .5)*nb);
  float ac = (ai + .5)/nb;
  float x = abs(fract(ac + .25)*2. - 1.);
  float v = spec(x*.95);
  float len = .015 + v*.17*uIntensity;
  float ang = fract((a/TAU + .5)*nb);
  float bar = ss(.0, .12, ang)*ss(1., .62, ang) * step(R, r) * step(r, R + len);
  vec3 bc = mix(uPal[2], uPal[3], x);
  col = mix(col, bc*1.3, bar);
  col += bc * .35 * exp(-max(0., r - R - len)*30.) * step(R, r) * v;

  // rotating text ring
  float R2 = R + .21;
  float th = .045;
  if(abs(r - R2) < th*.5){
    float u = fract(-a/TAU + uTime*.02*uSpeed);
    float vv = (r - R2)/th + .5;
    float tx = texture(uRing, vec2(u, vv)).a;
    col = mix(col, uPal[4], tx*.9);
  }
  // thin orbit lines
  col += uPal[4] * .25 * ss(.0025, .0, abs(r - (R2 + .04)));
  col += uPal[4] * .15 * ss(.0025, .0, abs(r - (R2 - .04)));

  // drop shockwave
  float sw = R + (1. - uDropHit)*1.4;
  col += uPal[3] * ss(.03, .0, abs(r - sw)) * uDropHit * 1.2;

  // the cover itself (square or vinyl disc), with RGB split on hits
  vec2 cp = lp / S;
  float rot = circ * uTime*.25*uSpeed;
  cp = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * cp;
  float inside;
  if(circ > .5) inside = ss(.5, .497, length(cp));
  else { vec2 q = abs(cp) - .5 + .03; inside = ss(.003, .0, length(max(q,0.)) + min(max(q.x,q.y),0.) - .03); }
  float split = (uKick*.006 + uSnare*.008 + uDropHit*.02);
  vec2 tp = cp + .5;
  vec3 cc = vec3(texture(uCover, tp + vec2(split, 0.)).r, texture(uCover, tp).g, texture(uCover, tp - vec2(split, 0.)).b);
  if(circ > .5){
    cc *= 1. - .25*ss(.07, .065, length(cp)); // label hole
    cc += .06*sin(length(cp)*260.) * ss(.2, .45, length(cp)); // grooves
  }
  // snare scanline glitch
  float gl = step(.92, hash12(vec2(floor(uv.y*40.), floor(uTime*20.)))) * uSnare;
  cc = mix(cc, cc.gbr, gl);
  col = mix(col, cc, inside);
  col += vec3(1.) * ss(.02, .0, abs(length(lp) - S*.5)) * .05 * circ;
  // glossy sheen sweeping across the tilted surface
  col += vec3(1.) * inside * .28 * ss(.12, .0, abs(dot(lp/S, normalize(vec2(1.,.6))) - sin(uTime*.31)*.7));

  // floating dust
  vec2 dp = uv*14. + vec2(uTime*.1, uTime*.25);
  vec2 dc = floor(dp);
  col += uPal[4] * ss(.05, .0, length(fract(dp) - hash22(dc))) * step(.85, hash12(dc)) * (.3 + uHat);

  col *= 1. + uKick*.1;
  fragColor = vec4(finish(col*1.05), 1.);
}
`;

function makeDefaultCover(env: RenderEnv) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const rng = mulberry32(env.seed + 101);
  const h = Math.floor(rng() * 360);
  const grad = g.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0, `hsl(${h},70%,65%)`);
  grad.addColorStop(0.5, `hsl(${(h + 50) % 360},60%,45%)`);
  grad.addColorStop(1, `hsl(${(h + 120) % 360},70%,20%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.25;
    g.fillStyle = `hsl(${(h + i * 40) % 360},90%,80%)`;
    g.beginPath(); g.arc(rng() * 1024, rng() * 1024, 80 + rng() * 300, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.95)';
  g.font = '900 96px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textAlign = 'left';
  g.fillText(env.meta.title || 'untitled', 70, 900);
  g.font = '500 44px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.fillText(env.meta.artist || '', 74, 960);
  return c;
}

function makeRing(env: RenderEnv) {
  const c = document.createElement('canvas');
  c.width = 4096; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.font = '600 64px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textBaseline = 'middle';
  const unit = [env.meta.title || 'untitled', env.meta.artist, `${Math.round(env.analysis.bpm)} BPM`].filter(Boolean).join('  ✦  ') + '  ✦  ';
  const w = g.measureText(unit).width;
  const reps = Math.max(1, Math.round(4096 / w));
  g.save();
  g.scale(4096 / (w * reps), 1);
  for (let i = 0; i < reps; i++) g.fillText(unit, i * w, 50);
  g.restore();
  return c;
}

export const jacket: TemplateDef = {
  id: 'jacket',
  name: 'ジャケット・パルス',
  nameEn: 'Cover Pulse',
  tagline: '自作ジャケットを中心に円形スペクトラム。キックで脈打ち、ドロップで衝撃波。',
  params: [],
  overlayDefault: false,
  create: (env) => createShaderInstance(env, {
    frag,
    palettes: [
      ['#0b0b18', '#ff6fb5', '#7af0ff', '#c38bff', '#ffffff'],
      ['#081018', '#5fffd0', '#a6ff6b', '#59b7ff', '#f4fff9'],
      ['#160a10', '#ffb36b', '#ff6f6f', '#ffd36b', '#fff4e8'],
    ],
    textures: (e) => ({ uCover: e.meta.cover ?? makeDefaultCover(e), uRing: makeRing(e) }),
  }),
};
