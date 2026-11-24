import type { RenderEnv } from '../core/template';
import { mulberry32 } from '../core/rng';
import { shaderTheme } from './_make';

/** first user photo, else the cover, else a generated gradient */
function userImage(env: RenderEnv): HTMLCanvasElement {
  const img = env.media?.items.find((m) => m.kind === 'image')?.el as HTMLCanvasElement | undefined;
  if (img) return img;
  if (env.meta.cover) return env.meta.cover;
  return generated(env.seed);
}
function generated(seed: number, label = '') {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const r = mulberry32(seed);
  const h = Math.floor(r() * 360);
  const gr = g.createLinearGradient(0, 0, 512, 512);
  gr.addColorStop(0, `hsl(${h},70%,18%)`); gr.addColorStop(1, `hsl(${(h + 140) % 360},70%,10%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.85; g.fillStyle = `hsl(${(h + i * 37) % 360},95%,${55 + r() * 20}%)`;
    g.beginPath();
    if (i % 3 === 0) { g.rect(r() * 512, r() * 512, 10 + r() * 90, 4 + r() * 20); }
    else g.arc(r() * 512, r() * 512, 6 + r() * 60, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  if (label) { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '900 60px sans-serif'; g.fillText(label, 30, 470); }
  return c;
}
/** 2x2 atlas of up to 4 user photos (generated fallbacks) */
function photoAtlas(env: RenderEnv) {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const imgs = (env.media?.items ?? []).filter((m) => m.kind === 'image').map((m) => m.el as HTMLCanvasElement);
  if (!imgs.length && env.meta.cover) imgs.push(env.meta.cover);
  for (let i = 0; i < 4; i++) {
    const src = imgs[i % Math.max(1, imgs.length)] ?? generated(env.seed + i * 17);
    const s = Math.min(src.width, src.height);
    g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, (i % 2) * 512, Math.floor(i / 2) * 512, 512, 512);
  }
  return c;
}

// ------------------------------------------------------------ 11. 万華鏡
export const kaleido = shaderTheme('kaleido', '万華鏡', 'Kaleidoscope', '自分の写真やジャケットが万華鏡に。BPMで回転し、キックで分割数とズームが変わる。', /* glsl */ `
uniform sampler2D uImg;
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(uv), a = atan(uv.y, uv.x);
  float N = 6. + 2.*mod(floor(uBar), 3.) + (uDrop > .5 ? 4. : 0.);
  float seg = 6.2831/N;
  a = mod(a + uBeat*.08, seg);
  a = abs(a - seg*.5);
  float zoom = .55 + .15*sin(uTime*.2) - uKick*.08 - uDropHit*.15;
  vec2 p = vec2(cos(a), sin(a))*r*zoom;
  p = mat2(cos(uTime*.1), -sin(uTime*.1), sin(uTime*.1), cos(uTime*.1))*p;
  vec2 tuv = fract(p + .5 + vec2(uTravel*.02, 0.));
  tuv = abs(tuv*2. - 1.); // mirror tile so seams don't show
  vec3 col = texture(uImg, tuv).rgb;
  col = mix(col, col*mix(uPal[1], uPal[2], r), .25);
  col += uPal[3]*ss(.012,.0,abs(a - seg*.5 + .0))*.0;
  col += uPal[3]*ss(.01,.0,abs(fract(r*4. - uBeat*.5)-.5)-.48)*.25*(1. + uKick);
  col *= (1. - .35*ss(.6, 1.2, r))*.85;
  col *= 1. + uKick*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#100818', '#ff7ad9', '#7af0ff', '#ffffff', '#ffd36b'],
  ['#081018', '#9effc8', '#ffd36b', '#ffffff', '#ff8fbe'],
  ['#180c08', '#ffb36b', '#c9a7ff', '#ffffff', '#7af0ff'],
], (env) => ({ uImg: userImage(env) }));

// ------------------------------------------------------------ 12. インク・イン・ウォーター
export const ink = shaderTheme('ink', 'インク・イン・ウォーター', 'Ink in Water', '水に色インクがふわりと広がる。低音が鳴るたびにインクが注がれる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float t = uTravel*.08;
  vec2 p = uv*1.4 + uV[0]*10.;
  // domain warping = curling ink
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.*q + vec2(1.7, 9.2) + t*.6), fbm(p + 3.*q + vec2(8.3, 2.8) - t*.4));
  float f = fbm(p + 3.5*r);
  float bass = (uBands[0] + uBands[1])*.5;
  vec3 col = uPal[0];
  col = mix(col, uPal[1], ss(.35, .75, f)*(.6 + bass*.6));
  col = mix(col, uPal[2], ss(.5, .9, length(q))*(.5 + uEnergy*.5));
  col = mix(col, uPal[3], ss(.55, .95, r.x)*.7);
  // fresh injection blobs on kicks
  vec2 c = vec2(sin(floor(uBeat)*2.3)*.6, cos(floor(uBeat)*1.7)*.3);
  float blob = exp(-length(uv - c + (q-.5)*.3)*(6. - uKick*3.)) * uKick;
  col = mix(col, uPal[4], clamp(blob*1.5, 0., 1.));
  col += uPal[4]*pow(f, 6.)*.6;
  col *= .85 + .3*uEnergy;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#05070f', '#2d5bff', '#ff4fa3', '#38e1ff', '#ffe066'],
  ['#0b0612', '#9b5cff', '#ff8a3d', '#5fffd7', '#ffffff'],
  ['#f2efe9', '#1b3a6b', '#c0392b', '#2a9d8f', '#e9c46a'],
]);

// ------------------------------------------------------------ 13. 雨の車窓ボケ
export const rainglass = shaderTheme('rainglass', '雨の車窓ボケ', 'Rainy Window Bokeh', '雨粒の窓越しに街の光がにじむ。エネルギーで雨粒が流れ落ちる速さが変わる。', /* glsl */ `
vec3 bokeh(vec2 p){
  vec3 c = mix(uPal[0]*.4, uPal[0], ss(-.6,.6,p.y));
  for(int l=0;l<3;l++){
    float fl = float(l);
    vec2 g = p*(3. + fl*2.) + vec2(uTravel*(.05 + fl*.03), fl*7.);
    vec2 cell = floor(g), f = fract(g);
    vec2 o = .3 + .4*hash22(cell + fl*13.);
    float rad = .1 + .18*hash12(cell+3.);
    float d = length(f - o);
    float on = step(.45, hash12(cell + 9.));
    vec3 lc = uPal[1 + int(mod(hash12(cell)*3., 3.))];
    float pulse = 1. + uKick*.6*step(.6, hash12(cell+5.));
    c += lc * ss(rad, rad*.75, d) * on * (.35 - fl*.07) * pulse;
    c += lc * ss(rad, rad*.9, d) * ss(rad*.8, rad*.95, d) * on * .25;
  }
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = bokeh(uv);
  // static drops + trickles
  float speed = .1 + uEnergy*.8 + uDrop*.5;
  for(int l=0;l<2;l++){
    float s = 14. + float(l)*10.;
    vec2 g = uv*vec2(s, s*.6);
    float colId = floor(g.x);
    float hs = hash11(colId + float(l)*31.);
    g.y += uTime*speed*(.5 + hs) + hs*20.;
    vec2 cell = floor(g), f = fract(g) - .5;
    float exists = step(.55, hash12(cell));
    f.x += sin(g.y*3.)*.08;
    float d = length(f*vec2(1., .7));
    float drop = ss(.22, .16, d)*exists;
    float trail = ss(.06,.0,abs(f.x))*ss(.0,.5,f.y)*exists*.6;
    vec3 refr = bokeh(uv*-.6 + f*.3);
    col = mix(col, refr*1.4 + .05, drop);
    col += vec3(.8)*ss(.06,.0,length(f - vec2(-.06,.08)))*drop*.6;
    col = mix(col, col*1.15 + .03, trail);
  }
  // tiny static droplets everywhere
  vec2 sg = uv*60.; vec2 sc = floor(sg);
  col += vec3(.6)*ss(.15,.0,length(fract(sg)-hash22(sc)))*step(.8, hash12(sc))*.12;
  fragColor = vec4(finish(col*1.1), 1.);
}`, [
  ['#0a0d18', '#ff9d5c', '#ff4f8a', '#7af0ff', '#ffffff'],
  ['#0c0814', '#ffd36b', '#c9a7ff', '#ff7ad9', '#ffffff'],
  ['#06100f', '#9effc8', '#ffb36b', '#5fb7ff', '#ffffff'],
]);

// ------------------------------------------------------------ 14. 宇宙エレベーター
export const elevator = shaderTheme('elevator', '宇宙エレベーター', 'Space Elevator', '大気圏を昇って宇宙へ。曲の進行が高度になり、ドロップで大気を突き抜ける。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float alt = clamp(uProg*1.1 + uDrop*.15, 0., 1.);
  // sky: blue -> violet -> black with altitude
  vec3 low = mix(uPal[1], uPal[2], ss(-.5,.5,uv.y));
  vec3 high = mix(uPal[0]*.3, vec3(0.), ss(-.5,.5,uv.y));
  vec3 col = mix(low, high, ss(.2, .8, alt));
  // stars appear with altitude
  vec2 sp = uv*80.; vec2 sc = floor(sp);
  col += vec3(1.)*ss(.12,.0,length(fract(sp)-hash22(sc)))*step(.982, hash12(sc))*ss(.4,.9,alt)*(.7 + uHat*.6);
  // planet limb at the bottom
  float R = 3.2 - alt*1.2;
  float d = length(uv - vec2(0., -R - .35 + alt*.2)) - R;
  vec3 earth = mix(uPal[3], uPal[1]*.5, ss(-.4, 0., d)) + .15*fbm(uv*6. + uTime*.02);
  col = mix(col, earth, ss(.004, -.004, d));
  col += uPal[1]*exp(-abs(d)*25.)*.8*ss(.1,.6,alt); // atmosphere glow
  // clouds rushing down at low altitude
  float cl = fbm(vec2(uv.x*2., uv.y*1.2 + uTravel*.6));
  col = mix(col, vec3(1.), ss(.55,.8,cl)*(1. - ss(.1,.45,alt))*.8);
  // tether + climber
  float tether = ss(.004,.0,abs(uv.x))*(1. - ss(.8,1.,alt)*.3);
  col += uPal[4]*tether*.8;
  float cb = ss(.03,.02,length((uv - vec2(0.,.05))*vec2(1.,.6)));
  col = mix(col, uPal[4]*.6 + .2, cb);
  col += uPal[4]*exp(-length(uv - vec2(0.,.05))*10.)*(.3 + uKick*.8);
  // speed lines
  float a = abs(uv.x);
  col += uPal[4]*pow(noise(vec2(uv.x*60., uv.y*2. + uTravel*3.)), 10.)*(.3 + uDrop*1.5)*ss(.05,.5,a);
  col += vec3(1.)*uDropHit*.4;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#05030f', '#5fb7ff', '#c9e8ff', '#2a6b8f', '#ffd36b'],
  ['#0a0414', '#ff9ccf', '#ffe3c9', '#5a3a8f', '#7af0ff'],
  ['#02080a', '#7af0d0', '#e0fff6', '#1f5c5c', '#ff8a5c'],
]);

// ------------------------------------------------------------ 15. 電脳鳥居トンネル
export const torii = shaderTheme('torii', '電脳鳥居トンネル', 'Cyber Torii', 'ネオンの鳥居が連なる参道を進む。拍ごとに鳥居をくぐり抜ける。', /* glsl */ `
float bar(vec2 p, vec2 a, vec2 b, float w){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h) - w; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float h0 = -.02;
  vec3 col = mix(uPal[0]*1.2, uPal[0]*.2, ss(h0, .6, uv.y));
  col += uPal[1]*exp(-length(uv - vec2(0., h0))*3.)*.35;
  // stone path
  if(uv.y < h0){
    float z = .6/(h0 - uv.y);
    float x = uv.x*z;
    col = uPal[0]*.15 + .05*noise(vec2(x*2., z + uBeat*3.))*step(abs(x), 1.);
    col += uPal[1]*.12*step(abs(x), 1.)*exp(-z*.05);
  }
  float S = 3., trav = uBeat*S;
  for(int i=14;i>=0;i--){
    float k = floor(trav/S) + float(i) + 1.;
    float zr = k*S - trav;
    if(zr < .35) continue;
    float sc = .6/zr;
    vec2 p = (uv - vec2(0., h0))/sc; // gate space (units)
    float w = .09;
    float dd = 1e9;
    dd = min(dd, bar(p, vec2(-1.2, -1.), vec2(-1.15, 2.4), w));
    dd = min(dd, bar(p, vec2(1.2, -1.), vec2(1.15, 2.4), w));
    dd = min(dd, bar(p, vec2(-1.55, 2.25), vec2(1.55, 2.25), w*.7));          // nuki
    dd = min(dd, bar(p, vec2(-1.75, 2.62), vec2(1.75, 2.62), w*1.1));          // kasagi
    dd = min(dd, bar(p, vec2(-1.75, 2.62), vec2(-1.95, 2.8), w*.9));
    dd = min(dd, bar(p, vec2(1.75, 2.62), vec2(1.95, 2.8), w*.9));
    float fog = exp(-zr*.06);
    float passing = ss(1.2, .35, zr);
    vec3 gc = mix(uPal[2], uPal[3], hash11(k*1.3))*(1. + uKick*.8 + passing*1.5);
    col = mix(col, uPal[2]*.25*fog, ss(.0, -.01, dd)*fog);
    col += gc*exp(-max(dd, 0.)*6.)*.5*fog*sc;
    col += gc*ss(.04, .0, abs(dd))*fog;
  }
  // floating sparks
  vec2 sp = uv*vec2(24.,14.) + vec2(0., -uTime*.4);
  vec2 cc = floor(sp);
  col += uPal[3]*ss(.08,.0,length(fract(sp)-hash22(cc)))*step(.93, hash12(cc))*(.5 + uHat);
  col += uPal[2]*uDropHit*.3;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a0412', '#ff5a36', '#ff3d3d', '#ffb347', '#ffffff'],
  ['#05060f', '#ff4fa3', '#ff2a6d', '#7af0ff', '#ffffff'],
  ['#08050a', '#ff8a3d', '#e8383d', '#ffd36b', '#ffffff'],
]);

// ------------------------------------------------------------ 16. ホログラム地形
export const holoterrain = shaderTheme('holoterrain', 'ホログラム地形', 'Hologram Terrain', '画面いっぱいのワイヤー山脈。手前の稜線がスペクトラムになって揺れる。', /* glsl */ `
float H(float x, float z){
  float near = ss(6., 1., z);
  float sp = spec(clamp(abs(x)/3., 0., 1.));
  return fbm(vec2(x*.35, z*.35 + uTravel*.5))*1.6*(.6 + uEnergy*.6) + sp*1.4*near*uIntensity;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float h0 = .12;
  vec3 col = mix(uPal[0], uPal[0]*.2, ss(-.5, .6, uv.y));
  col += uPal[1]*exp(-abs(uv.y - h0)*6.)*.25;
  float camH = 1.4;
  // painter's algorithm: far rows first, nearer ridges cover them
  for(int r=33;r>=0;r--){
    float z = .8 + float(r)*.55;
    float x = uv.x*z/.9;
    float y = h0 + (H(x, z) - camH)/z*.9;
    float w = .0022 + .005/z;
    float fade = exp(-z*.07);
    if(uv.y < y) col = mix(uPal[0]*.25, uPal[0]*.08, ss(0., .3, y - uv.y));
    col += mix(uPal[2], uPal[3], float(r)/34.)*ss(w, 0., abs(uv.y - y))*fade*1.4*(1. + uKick*.5);
  }
  // vertical scan glow
  col += uPal[4]*ss(.01,.0,abs(fract(uv.x*.5 + uTime*.1)-.5)-.49)*.3;
  col += uPal[2]*uDropHit*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#02060f', '#3fd2ff', '#7af0ff', '#ff7ad9', '#ffffff'],
  ['#08020f', '#c45bff', '#ff8fe0', '#7af0ff', '#ffffff'],
  ['#020a06', '#38ffb0', '#b9ff6b', '#5fb7ff', '#ffffff'],
]);

// ------------------------------------------------------------ 17. プリズム結晶
export const prism = shaderTheme('prism', 'プリズム結晶', 'Prism Crystals', '回転する結晶が光を虹色に屈折させる。キックで光線、スネアで結晶が回る。', /* glsl */ `
vec3 rainbow(float x){ return .5 + .5*cos(6.2831*(x + vec3(0., .33, .67))); }
float sdHex(vec2 p, float r){ p = abs(p); return max(dot(p, normalize(vec2(1.,1.732))), p.x) - r; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = uPal[0]*(.6 + .4*ss(.8, 0., length(uv)));
  // incoming white beam from the left
  float beamY = .05*sin(uTime*.3);
  col += vec3(1.)*ss(.012,.0,abs(uv.y - beamY))*step(uv.x, 0.)*(.4 + uKick*.8);
  // dispersed rainbow fan to the right
  if(uv.x > 0.){
    float ang = atan(uv.y - beamY, uv.x);
    float spread = .35 + uKick*.15 + uDrop*.2;
    float u = (ang + spread)/(2.*spread);
    float inFan = step(0., u)*step(u, 1.);
    col += rainbow(u*.8)*inFan*(.35 + uEnergy*.5 + uKick*.6)*exp(-length(uv)*.6)*(.7 + .3*sin(u*80. + uTime*4.));
  }
  // crystals
  for(int i=0;i<6;i++){
    float fi = float(i);
    vec2 c = i == 0 ? vec2(0., beamY) : vec2((hash11(fi+uV[0]*5.)-.5)*2.2, (hash11(fi*3.+uV[1])-.5)*1.);
    float sz = i == 0 ? .16 : .04 + .06*hash11(fi*7.);
    float rot = uTime*.3*(hash11(fi)-.5) + floor(uBeat)*.0 + uSnare*.6*(i==0 ? 1. : .3) + uBeat*.05;
    vec2 p = uv - c;
    p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*p;
    float d = sdHex(p, sz);
    float facets = abs(sin(atan(p.y, p.x)*3.))*.5 + .5;
    vec3 cc = mix(uPal[1], rainbow(fi*.17 + uTime*.05), .35)*(.6 + .5*facets);
    col = mix(col, cc, ss(.003, -.003, d)*.8);
    col += vec3(1.)*ss(.006, .0, abs(d))*(.6 + uKick);
    col += uPal[2]*exp(-max(d,0.)*20.)*.15;
  }
  col += vec3(1.)*uDropHit*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#06060f', '#b9e6ff', '#ff9ccf', '#ffffff', '#ffffff'],
  ['#0a050f', '#e6d5ff', '#7af0ff', '#ffffff', '#ffffff'],
  ['#050a0a', '#d5fff4', '#ffd36b', '#ffffff', '#ffffff'],
]);

// ------------------------------------------------------------ 18. 夜明けの海
export const dawnsea = shaderTheme('dawnsea', '夜明けの海', 'Dawn Ocean', '波打つ海と、曲の進行とともに訪れる夜明け。低音が波を高くする。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float dawn = clamp(uProg*.9 + uDrop*.25, 0., 1.);
  float h0 = -.02;
  vec3 night = mix(uPal[0]*.4, uPal[0], ss(.6, -.1, uv.y));
  vec3 day = mix(uPal[2], uPal[1], ss(-.05, .5, uv.y));
  vec3 sky = mix(night, day, dawn);
  vec2 sunP = vec2(.25*(uV[0]-.5), h0 - .1 + dawn*.32);
  vec3 col = sky;
  col += uPal[3]*exp(-length(uv - sunP)*4.)*dawn*.8;
  col = mix(col, uPal[3]*1.3, ss(.06,.055,length(uv - sunP))*dawn);
  // stars fade out
  vec2 sp = uv*90.; vec2 sc = floor(sp);
  col += vec3(1.)*ss(.12,.0,length(fract(sp)-hash22(sc)))*step(.985, hash12(sc))*(1. - dawn)*step(h0, uv.y);
  if(uv.y < h0){
    float z = .4/(h0 - uv.y);
    vec2 wp = vec2(uv.x*z, z);
    float bass = (uBands[0] + uBands[1])*.5;
    float amp = .25 + bass*.9*uIntensity;
    float wv = 0.;
    wv += sin(wp.y*1.2 - uTravel*1.5 + sin(wp.x*.3))*.5;
    wv += sin(wp.y*2.3 + wp.x*.7 - uTravel*2.1)*.3;
    wv += fbm(wp*.6 + vec2(0., -uTravel*.5))*.6;
    float slope = cos(wp.y*1.2 - uTravel*1.5)*amp;
    vec3 water = mix(uPal[0]*.25, mix(uPal[0]*.6, uPal[2]*.6, dawn), ss(0., 1., wv*amp));
    // sun glitter path
    float path = exp(-pow((uv.x - sunP.x)*z*.6, 2.)*.8);
    float glit = pow(noise(wp*vec2(3., 6.) + uTravel), 8.)*6.;
    water += uPal[3]*path*glit*(.2 + dawn)*(1. + uKick);
    water += vec3(1.)*ss(.85, 1., wv*amp + slope*.2)*.25; // foam
    col = mix(water, sky, 1. - exp(-z*.02));
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#060a1f', '#ffd9b3', '#7aa8d8', '#ffb35c', '#ffffff'],
  ['#0a0618', '#ffe0ec', '#b48cd8', '#ff8f6b', '#ffffff'],
  ['#020c12', '#e8fff8', '#5fb7c8', '#ffd36b', '#ffffff'],
]);

// ------------------------------------------------------------ 19. ピクセル花火
export const fireworks = shaderTheme('fireworks', 'ピクセル花火', 'Pixel Fireworks', '夜空に打ち上がる花火。拍ごとに上がり、ドロップでは連発。ドット絵の時も。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float pix = step(.5, uV[0]);
  if(pix > .5) uv = floor(uv*90.)/90.;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[0]*.3, uPal[0], ss(.6, -.4, uv.y));
  float beatSec = 60./max(uBpm, 40.);
  float prob = .35 + uEnergy*.35 + uDrop*.3;
  for(int j=0;j<7;j++){
    float b = floor(uBeat) - float(j);
    float hb = hash11(b*1.37 + uV[1]*11.);
    if(hb > prob) continue;
    float age = (uBeat - b)*beatSec;           // seconds since launch
    vec2 c = vec2((hash11(b*2.1)-.5)*W*1.4, .05 + hash11(b*3.3)*.4);
    float launch = .35;
    vec3 fc = uPal[1 + int(mod(b, 3.))];
    if(age < launch){
      // rising trail
      vec2 rp = vec2(c.x, mix(-.6, c.y, age/launch));
      col += fc*ss(.012,.0,length(uv - rp))*1.2;
      col += fc*ss(.005,.0,abs(uv.x - rp.x))*step(uv.y, rp.y)*step(rp.y - .15, uv.y)*.4;
      continue;
    }
    float tt = age - launch;
    if(tt > 2.2) continue;
    float R = (1. - exp(-tt*2.2))*(.22 + .1*hash11(b*5.));
    vec2 p = uv - c;
    p.y += tt*tt*.06;                           // gravity droop
    float N = 36.;
    float ang = atan(p.y, p.x);
    float k = floor(ang/(6.2831/N) + .5);
    float ak = k*6.2831/N;
    vec2 pp = vec2(cos(ak), sin(ak))*R;
    float d = length(p - pp);
    float fade = exp(-tt*1.4);
    float tw = .7 + .3*sin(tt*40. + k);
    col += fc*ss(.012, .0, d)*fade*tw*1.6;
    // trail toward the centre
    float rr = length(p);
    col += fc*ss(.004,.0,abs(fract(ang/(6.2831/N) + .5) - .5)*rr*.3)*step(rr, R)*step(R*.6, rr)*fade*.5;
    col += fc*exp(-length(p)*6.)*fade*.25;
  }
  // skyline silhouette
  float bx = floor(uv.x*8. + uV[2]*20.);
  float bh = -.42 + .12*hash11(bx);
  col = mix(col, uPal[0]*.1, step(uv.y, bh));
  col += uPal[4]*step(uv.y, bh)*step(.85, hash12(floor(uv*vec2(80., 60.))))*.4;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#050818', '#ff4f8a', '#ffd23f', '#5fe3ff', '#ffb36b'],
  ['#0a0614', '#ff8fe0', '#b9ff6b', '#ffe066', '#ff8a5c'],
  ['#02080f', '#ff6f6f', '#ffffff', '#7af0ff', '#ffd36b'],
]);

// ------------------------------------------------------------ 20. 記憶のフィルム
export const film = shaderTheme('film', '記憶のフィルム', 'Memory Film', '自分の写真がフィルムになって流れる。拍でコマ送り、光漏れがにじむ。', /* glsl */ `
uniform sampler2D uAtlas;
vec3 photo(float idx, vec2 p){
  idx = mod(idx, 4.);
  vec2 o = vec2(mod(idx, 2.), floor(idx/2.))*.5;
  return texture(uAtlas, o + clamp(p, .005, .995)*.5).rgb;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = uPal[0]*.8;
  float tilt = -.08 + uV[0]*.16;
  vec2 q = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt))*uv;
  float stripH = .62;
  float fw = .78;
  float adv = floor(uBeat) + ss(0., .25, uBeatPhase);
  float x = q.x/fw + adv*.5 + uTime*.03;
  float fi = floor(x), fx = fract(x);
  if(abs(q.y) < stripH*.5){
    col = vec3(.06,.05,.05);
    // sprocket holes
    float hy = abs(q.y) - stripH*.5 + .045;
    float holes = step(abs(hy), .018)*step(.35, fract(q.x*12.))*step(fract(q.x*12.), .75);
    col = mix(col, uPal[0]*.9, holes);
    // frame
    vec2 fp = vec2(fx, (q.y + stripH*.5 - .085)/(stripH - .17));
    float inF = step(.04, fx)*step(fx, .96)*step(0., fp.y)*step(fp.y, 1.);
    vec3 ph = photo(fi, vec2((fx - .04)/.92, fp.y));
    ph = mix(ph, ph*uPal[1]*1.2, .25);                     // colour grade
    ph *= .85 + .3*hash11(fi*3.1 + floor(uTime*12.))*.3;    // flicker
    col = mix(col, ph, inF);
  }
  // light leaks
  vec2 lp = uv - vec2(sin(uTime*.2)*W*.4, .3*cos(uTime*.15));
  col += uPal[2]*exp(-length(lp)*2.2)*(.35 + uKick*.4);
  col += uPal[3]*exp(-length(uv + vec2(W*.45, .3))*2.5)*.3;
  // dust & scratches
  col += vec3(.8)*ss(.003,.0,abs(uv.x - (hash11(floor(uTime*8.))-.5)*W))*step(.7, hash11(floor(uTime*8.)+3.))*.3;
  vec2 dp = uv*40.; vec2 dc = floor(dp + floor(uTime*10.));
  col += vec3(.9)*ss(.06,.0,length(fract(dp)-hash22(dc)))*step(.97, hash12(dc))*.4;
  col *= 1. + uKick*.15;
  col += vec3(1.)*uDropHit*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#1a1410', '#ffd9a8', '#ff8f5c', '#ffd36b', '#ffffff'],
  ['#14101a', '#e8d6ff', '#ff8fbe', '#7af0ff', '#ffffff'],
  ['#101410', '#d8ffd6', '#ffb36b', '#ff6f91', '#ffffff'],
], (env) => ({ uAtlas: photoAtlas(env) }));
