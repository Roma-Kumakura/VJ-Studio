import { shaderTheme } from './_make';

/* =====================================================================================
 * SET 4 — science fiction (10 themes)
 * ===================================================================================== */

// ------------------------------------------------------------ 39. ワープ航法
export const warp = shaderTheme('warp', 'ワープ航法', 'Hyperspace Warp', '星が光の筋になって流れる超空間。エネルギーで加速し、ドロップでトンネルに突入する。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(uv), a = atan(uv.y, uv.x);
  vec3 col = uPal[0]*.35;
  float speed = .6 + uEnergy*1.4 + uDrop*1.8;
  for(int L=0; L<3; L++){
    float fl = float(L), n = 70. + fl*50.;
    float k = floor((a/TAU + .5)*n);
    float ang = (k + .5)/n*TAU - PI;
    float h = hash11(k*7.31 + fl*31.7);
    float z = fract(h + uTravel*.07*speed*(1. + fl*.35));
    float head = pow(z, 2.2)*1.5;
    float len = (.015 + .3*speed*z*z)*(1. + uKick*.6);
    float da = abs(mod(a - ang + PI, TAU) - PI)*r;
    float streak = ss(.0035*(1. + z*3.), 0., da)*ss(head - len, head, r)*ss(head + .01, head, r);
    col += mix(uPal[1], uPal[2], h)*streak*(.5 + z*1.6);
  }
  col += uPal[3]*exp(-r*7.)*(.5 + uKick*.9 + uDropHit*1.5);
  float tun = (.5 + .5*sin(r*28. - uTravel*5.*speed))*ss(.05, .5, r)*exp(-r*1.2);
  col += uPal[4]*tun*uDrop*.35;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#02030c', '#9fd8ff', '#ffffff', '#7a8cff', '#4dfcff'],
  ['#08020f', '#ff9ef3', '#fff2b0', '#ff5fd2', '#9b7bff'],
  ['#010806', '#8fffd2', '#e6fff5', '#3ee6c4', '#5ab8ff'],
]);

// ------------------------------------------------------------ 40. 軌道ステーション
export const orbital = shaderTheme('orbital', '軌道ステーション', 'Orbital Station', '惑星の上をゆっくり回るリング型ステーション。キックで窓の明かりが点滅する。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = uPal[0]*.25;
  vec2 g = floor(uv*90.); float st = hash12(g);
  col += step(.986, st)*(.5 + .5*sin(uTime*2.5 + st*60.))*.8;
  // planet
  vec2 pc = vec2(0., -1.6); float pr = 1.32; float d = length(uv - pc) - pr;
  if(d < 0.){
    vec2 q = (uv - pc)/pr;
    float lon = atan(q.x, sqrt(max(0., 1. - dot(q, q)))) + uTime*.02, lat = q.y;
    float land = fbm(vec2(lon*3., lat*5.) + 3.);
    vec3 pcol = mix(uPal[1]*.55, uPal[2]*.8, ss(.47, .55, land));
    pcol = mix(pcol, vec3(1.), ss(.55, .78, fbm(vec2(lon*6. + uTime*.04, lat*9.)))*.7);
    pcol *= .3 + .9*ss(-.4, .7, q.x + .25);
    col = pcol;
  }
  col += uPal[3]*exp(-abs(d)*22.)*(.7 + uBands[1]*.8);
  // ring station
  vec2 sp = uv - vec2(.12*sin(uTime*.05), .22);
  vec2 e = sp*vec2(1., 3.1); float rr = length(e);
  float ring = ss(.014, .0, abs(rr - .4));
  float aa = atan(e.y, e.x) + uTime*.18;
  float modl = step(.82, fract(aa*12./TAU));
  float shade = .35 + .65*ss(-.4, .4, sp.x);
  col = mix(col, vec3(.72, .76, .84)*shade, ring*.9);
  col += uPal[4]*ring*modl*(.6 + uKick*2.5);
  float spoke = ss(.004, .0, abs(sp.y*3.1*cos(aa) - sp.x*sin(aa)))*step(rr, .4);
  col = mix(col, vec3(.5, .55, .62)*shade, spoke*.6);
  col = mix(col, vec3(.85), ss(.035, .025, length(sp)));
  // sun
  vec2 sun = vec2(W*.42, .38);
  col += uPal[3]*.5*exp(-length(uv - sun)*4.) + vec3(1.)*exp(-length(uv - sun)*28.);
  col += vec3(1.)*ss(.004, 0., abs((uv - sun).y))*exp(-abs((uv - sun).x)*2.)*.25*(1. + uDropHit*2.);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#01030a', '#1f5fa8', '#5aa86b', '#7ad0ff', '#ffd36b'],
  ['#05020a', '#7a3fa8', '#c06b5a', '#ff9ef3', '#7af0ff'],
  ['#020706', '#1b6f6a', '#d9b36b', '#8ff0e5', '#ff7a5a'],
]);

// ------------------------------------------------------------ 41. ダイソン球
export const dyson = shaderTheme('dyson', 'ダイソン球', 'Dyson Swarm', '恒星を取り囲むパネルの輪。スペクトラムに合わせてパネルが光る。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(uv);
  vec3 col = uPal[0]*.2 + step(.99, hash12(floor(uv*100.)))*.5;
  col += uPal[1]*exp(-r*4.5)*(1.3 + uKick*.6);
  col += vec3(1., .92, .75)*ss(.075, .06, r)*(1. + uKick*.4);
  col += uPal[2]*fbm(vec2(atan(uv.y, uv.x)*3., r*8. - uTime*.6))*exp(-r*3.)*.9;
  for(int i=0; i<10; i++){
    float fi = float(i);
    float R = .17 + fi*.033;
    float tilt = .22 + hash11(fi)*.5, rot = hash11(fi*3.1)*TAU;
    mat2 m = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    vec2 p = m*uv; p.y /= tilt;
    float rr = length(p);
    float a = atan(p.y, p.x) + uTime*.25/(R*3.)*(1. + uEnergy);
    float seg = fract(a*(14. + fi*2.)/TAU);
    float panel = ss(.007, .0, abs(rr - R))*step(.35, seg);
    float back = step(0., p.y)*ss(.1, .0, length(uv) - .07);
    float lit = .35 + spec(fi/10.)*2.2;
    col += mix(uPal[3], uPal[4], hash11(fi*7.))*panel*lit*(1. - back*.8);
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#020108', '#ffb347', '#ff6a3d', '#7af0ff', '#ffe066'],
  ['#010309', '#7ad0ff', '#4d6bff', '#ffffff', '#ff7ad9'],
  ['#060208', '#ff5f7a', '#ffcf6b', '#c9a7ff', '#8ff0e5'],
]);

// ------------------------------------------------------------ 42. 二つの太陽の砂漠
export const twinsun = shaderTheme('twinsun', '二つの太陽の砂漠', 'Twin Sun Dunes', '二つの太陽が沈む異星の砂丘。キックで陽炎がゆれ、低音で砂丘がうねる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = mix(uPal[1], uPal[0], ss(-.1, .6, uv.y));
  vec2 s1 = vec2(-.32, .17 - uProg*.08), s2 = vec2(.26, .29);
  col += uPal[2]*exp(-length(uv - s1)*4.5)*.8 + vec3(1., .95, .85)*ss(.07, .065, length(uv - s1));
  col += uPal[3]*exp(-length(uv - s2)*7.)*.6 + vec3(1., .9, .82)*ss(.045, .04, length(uv - s2));
  float shim = sin(uv.y*90. + uTime*7.)*.003*(uKick + .2);
  for(int l=3; l>=0; l--){
    float fl = float(l);
    float x = uv.x*(1. + fl*.45) + uTravel*.04*(4. - fl) + fl*7.;
    float h = -.08 + fl*.07 + .07*sin(x*2. + fl) + .05*fbm(vec2(x*1.5, fl)) + (l == 0 ? (uBands[0] + uBands[1])*.03 : 0.);
    if(uv.y + shim < h){
      float ridge = ss(.0, .05, h - uv.y);
      vec3 dc = mix(uPal[4], uPal[1]*.45, fl/4.);
      dc *= .55 + .45*ridge + .15*sin(x*30. + uv.y*80.)*(1. - ridge);
      col = dc*(1. - fl*.1) + uPal[2]*.06*fl;
    }
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#2a1838', '#e8915a', '#ffd9a0', '#ff7a5a', '#c47a4a'],
  ['#0e1a33', '#5a8fd8', '#ffe9b0', '#a6e3ff', '#7a6a8a'],
  ['#2b0f1a', '#d85a7a', '#ffd0a0', '#ff9ef3', '#9a4a5a'],
]);

// ------------------------------------------------------------ 43. コックピットHUD
export const cockpit = shaderTheme('cockpit', 'コックピットHUD', 'Cockpit HUD', '宇宙船のコックピット。レーダーと照準が拍に反応し、ドロップで赤い警報になる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = uPal[0]*.15;
  for(int i=0; i<2; i++){
    float fi = float(i);
    vec2 g = uv*(28. + fi*40.) + vec2(0., uTravel*(1.5 + fi));
    col += step(.97, hash12(floor(g)))*ss(.18, .0, length(fract(g) - .5))*.8;
  }
  col += uPal[1]*ss(.02, 0., abs(length(uv - vec2(.6, -1.05)) - .95))*.7;
  vec3 hud = uPal[3];
  float roll = sin(uTime*.3)*.08 + (uBands[1] - .5)*.05;
  vec2 q = mat2(cos(roll), -sin(roll), sin(roll), cos(roll))*uv;
  for(int k=-3; k<=3; k++){
    float y = float(k)*.12 + fract(uTime*.05)*.12;
    float w = k == 0 ? .5 : .15;
    col += hud*ss(.0025, .0, abs(q.y - y))*step(abs(q.x), w)*step(.06, abs(q.x))*.7;
  }
  float r = length(uv);
  col += hud*ss(.004, .0, abs(r - .08*(1. + uKick*.35)));
  col += hud*ss(.003, .0, abs(r - .16))*step(.3, abs(sin(atan(uv.y, uv.x)*2. + uTime)))*.8;
  vec2 rp = uv - vec2(-W*.5 + .27, -.28); float rr = length(rp);
  float sweep = mod(atan(rp.y, rp.x) - uTime*2., TAU);
  col += hud*ss(.2, .19, rr)*exp(-sweep*2.)*.55 + hud*ss(.003, .0, abs(rr - .2));
  col += uPal[4]*step(.994, hash12(floor(rp*40.)))*ss(.2, .19, rr)*(1. + uSnare*3.);
  vec2 sp = uv - vec2(W*.5 - .32, -.36);
  if(sp.x > 0. && sp.x < .24 && sp.y > 0.){ float b = floor(sp.x*50.); col += hud*step(sp.y, spec(b/12.)*.25)*step(.3, fract(sp.x*50.))*.8; }
  float strut = ss(.035, .0, abs(abs(uv.x) - (.92 + uv.y*.55)*W*.52));
  col = mix(col, vec3(.03), strut);
  col = mix(col, vec3(.02), ss(-.4, -.43, uv.y));
  col += uPal[2]*ss(.004, .0, abs(uv.y + .43))*.6;
  col = mix(col, col*vec3(1.5, .35, .35) + vec3(.15, 0., 0.)*(.5 + .5*sin(uTime*10.)), uDrop*.5);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#01040a', '#2a6fb0', '#3ee6c4', '#7af0ff', '#ff5f7a'],
  ['#060300', '#b07a2a', '#ffcf6b', '#ffb347', '#ff3d5a'],
  ['#030106', '#6a3fb0', '#ff7ad9', '#c9a7ff', '#7af0ff'],
]);

// ------------------------------------------------------------ 44. ブラックホール
export const blackhole = shaderTheme('blackhole', 'ブラックホール', 'Event Horizon', '光を曲げるブラックホールと降着円盤。キックで光子リングが輝く。', /* glsl */ `
void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(p);
  vec2 lp = p*(1. + .05/max(r*r, .012));
  vec3 col = uPal[0]*.3 + vec3(step(.986, hash12(floor(lp*70.))))*.7;
  float spin = uTime*.35*(1. + uEnergy);
  vec2 d = vec2(p.x, p.y/.27); float dr = length(d);
  float a = atan(d.y, d.x);
  float swirl = fbm(vec2(a*3. + spin*2. - log(max(dr, .01))*6., dr*6.));
  float dop = .55 + .65*cos(a);
  vec3 dc = mix(uPal[1], uPal[2], ss(.2, .6, dr))*(.45 + swirl)*dop*(1. + (uBands[0] + uBands[1])*.4);
  float disk = ss(.17, .2, dr)*ss(.64, .38, dr);
  vec2 b = vec2(p.x, p.y/.9); float br = length(b);
  float arc = ss(.035, .0, abs(br - .22 - .03*swirl))*step(0., p.y);
  col += mix(uPal[1], uPal[2], .4)*arc*(1. + uKick)*.9;
  col *= ss(.145, .17, r);
  col += dc*disk*(p.y < 0. ? 1.4 : ss(.17, .21, r)*1.2);
  col += uPal[3]*ss(.006, .0, abs(r - .172))*(1.3 + uKick*2.5);
  col += uPal[4]*exp(-abs(r - .18)*28.)*.3*(1. + uDropHit*3.);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#000000', '#ff8a3d', '#ffe6a0', '#ffffff', '#ff5f2a'],
  ['#000003', '#5ab8ff', '#e6f5ff', '#ffffff', '#7a8cff'],
  ['#020001', '#ff5fa2', '#ffd0f0', '#ffffff', '#c9a7ff'],
]);

// ------------------------------------------------------------ 45. 雨の巨大都市
export const megacity = shaderTheme('megacity', '雨の巨大都市', 'Rain Megacity', '雨に濡れた超高層の未来都市。ホログラム広告がキックで光り、スネアで稲妻が走る。', /* glsl */ `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[0]*.5, uPal[1]*.3, uv.y);
  for(int l=3; l>=0; l--){
    float fl = float(l);
    float x = uv.x*(2.5 + fl*1.8) + uTravel*.02*(4. - fl) + fl*13.;
    float id = floor(x), fx = fract(x);
    float h = .3 + hash11(id + fl*7.)*.6 - fl*.1;
    if(uv.y < h && fx > .08 && fx < .92){
      vec3 b = mix(uPal[0]*.25, uPal[1]*.45, fl*.28);
      b += uPal[1]*.25*ss(.012, .0, abs(uv.y - h))*(1. - fl*.2);
      vec2 wnd = vec2(fx*8., uv.y*(40. + fl*12.)); vec2 wi = floor(wnd);
      float lit = step(.62, hash12(wi + id*3.))*step(.25, fract(wnd.x))*step(.3, fract(wnd.y));
      b += mix(uPal[2], uPal[3], hash12(wi))*lit*(.45 + .3*sin(uTime + hash12(wi)*20.))*(1. - fl*.2);
      float ad = step(.72, hash11(id*1.3 + fl))*step(abs(fx - .5), .3)*step(abs(uv.y - (h - .1)), .05);
      b = mix(b, uPal[4]*(.8 + uKick*1.6)*(.7 + .3*step(.5, fract(uv.y*60.))), ad);
      col = b;
    }
    col = mix(col, uPal[1]*.35, .07);
  }
  for(int i=0; i<6; i++){
    float fi = float(i), y = .5 + hash11(fi)*.4;
    float sp = (.25 + hash11(fi*2.)*.5)*(mod(fi, 2.) < 1. ? 1. : -1.);
    float x = fract(hash11(fi*5.) + uTime*sp*.08)*W*1.2 - .1;
    col += mix(uPal[3], uPal[4], mod(fi, 2.))*ss(.004, .0, abs(uv.y - y))*ss(.09, .0, abs(uv.x - x))*1.4;
  }
  vec2 rp = vec2(uv.x*70. + uv.y*14., uv.y*5. + uTime*9.);
  col += vec3(.6, .7, .9)*step(.93, hash12(floor(rp)))*ss(.5, .0, abs(fract(rp.x) - .5))*.25*(.5 + uHat);
  col += vec3(.75, .8, 1.)*uSnare*step(.9, hash11(floor(uTime*8.)))*.45;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#04030c', '#2a3a6a', '#ffcf6b', '#7af0ff', '#ff3d9a'],
  ['#020806', '#1b4a4a', '#e6ff9a', '#3ee6c4', '#ff7a3d'],
  ['#08020a', '#4a1f5a', '#ffd9a0', '#c9a7ff', '#00e5ff'],
]);

// ------------------------------------------------------------ 46. 量子回路
export const circuit = shaderTheme('circuit', '量子回路', 'Quantum Circuit', '基板の回路をパルスが駆け抜ける。キックでチップが光り、ハットでビアが瞬く。', /* glsl */ `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes.y*12. + vec2(uTravel*.25, 0.);
  vec2 id = floor(uv), f = fract(uv) - .5;
  float h = hash12(id);
  vec3 col = uPal[0]*.3;
  float hl = step(.4, h)*ss(.045, .02, abs(f.y));
  float vl = step(.6, hash12(id + 7.))*ss(.045, .02, abs(f.x));
  col += uPal[1]*.25*max(hl, vl);
  float ph = fract(uv.x*.25 - uTime*.5*(1. + uEnergy) + h);
  float pv = fract(uv.y*.25 - uTime*.4 + hash12(id + 3.));
  col += uPal[2]*hl*ss(.08, .0, abs(ph - .5))*2.2 + uPal[3]*vl*ss(.08, .0, abs(pv - .5))*2.2;
  col += uPal[2]*ss(.13, .08, length(f))*step(.85, h)*(.4 + uHat*1.5);
  vec2 cid = floor(uv/4.), cf = fract(uv/4.) - .5;
  float ch = hash12(cid + 11.);
  if(ch > .68){
    float box = step(max(abs(cf.x), abs(cf.y)), .22);
    col = mix(col, uPal[0]*.7, box);
    col += uPal[4]*ss(.012, .0, abs(max(abs(cf.x), abs(cf.y)) - .22))*(1. + uKick*2.5);
    col += uPal[4]*box*.35*spec(ch)*2.;
    float pins = step(.22, max(abs(cf.x), abs(cf.y)))*step(max(abs(cf.x), abs(cf.y)), .27)*step(.5, fract(max(cf.x, cf.y)*30.));
    col += uPal[1]*pins*.6;
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#010806', '#1f6f4a', '#7affc8', '#3ee6c4', '#ffe066'],
  ['#020310', '#2a3f8a', '#7af0ff', '#9b8cff', '#ff7ad9'],
  ['#0a0402', '#8a4a1f', '#ffcf6b', '#ff8a3d', '#7af0ff'],
]);

// ------------------------------------------------------------ 47. テラフォーミング惑星
export const planet = shaderTheme('planet', 'テラフォーミング惑星', 'Terraformed World', '海と雲と夜の街明かりがある惑星と、その周りを回る月。キックで街が明るくなる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(uv), R = .36*(1. + uKick*.01);
  vec3 col = uPal[0]*.15 + vec3(step(.99, hash12(floor(uv*90.))))*.6;
  float ma = uTime*.3; vec2 mp = vec2(cos(ma)*.56, sin(ma)*.12); float front = sin(ma);
  float md = length(uv - mp);
  bool moon = md < .04;
  if(moon && front > 0.) col = vec3(.75)*(.25 + .75*ss(.04, -.04, (uv - mp).x + .015));
  if(r < R){
    vec3 n = vec3(uv/R, sqrt(max(0., 1. - dot(uv, uv)/(R*R))));
    float lon = atan(n.x, n.z) + uTime*.08, lat = asin(clamp(n.y, -1., 1.));
    vec2 sp = vec2(lon*2., lat*3.);
    float land = fbm(sp + 5.);
    vec3 sc = mix(uPal[1]*.75, uPal[2], ss(.5, .56, land));
    sc = mix(sc, vec3(.95), ss(.95, 1.2, abs(lat)*1.25));
    sc = mix(sc, vec3(1.), ss(.55, .75, fbm(sp*2. + vec2(uTime*.05, 0.)))*.8);
    vec3 L = normalize(vec3(.7, .3, .6));
    float dif = max(dot(n, L), 0.);
    vec3 night = uPal[4]*step(.56, land)*step(.72, hash12(floor(sp*40.)))*(1. - ss(0., .25, dif))*(.6 + uKick*1.5);
    col = sc*(.07 + dif) + night;
    col += uPal[3]*pow(1. - n.z, 3.)*.8;
    col += uPal[3]*ss(.8, 1., abs(lat)/1.57)*(.2 + uBands[2]*.8)*(.5 + .5*sin(lon*6. + uTime*2.));
  }
  col += uPal[3]*exp(-abs(r - R)*40.)*.5;
  if(moon && front <= 0. && r > R) col = vec3(.75)*(.25 + .75*ss(.04, -.04, (uv - mp).x + .015));
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#01020a', '#1f4fa8', '#5a9a5a', '#7ad0ff', '#ffcf6b'],
  ['#05010a', '#3a2fa8', '#c07a5a', '#ff9ef3', '#7af0ff'],
  ['#010605', '#1b6a7a', '#c9b36b', '#8ff0e5', '#ff7a5a'],
]);

// ------------------------------------------------------------ 48. 次元ゲート
export const portal = shaderTheme('portal', '次元ゲート', 'Dimension Gate', '渦巻くエネルギーのリングに粒子が吸い込まれる。ドロップで稲妻が走り、ゲートが広がる。', /* glsl */ `
void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(p), a = atan(p.y, p.x);
  float R = .3*(1. + uKick*.05 + uDropHit*.18);
  vec3 col = uPal[0]*.3;
  if(r < R){
    float sw = fbm(vec2(a*2. + uTime*.8 + log(r + .01)*3., r*6. - uTime));
    col = mix(uPal[1], uPal[2], sw)*(.35 + .9*sw)*(1. - r/R*.3);
    col += uPal[3]*exp(-r*8.)*(.5 + uEnergy);
  }
  col += uPal[3]*ss(.016, .0, abs(r - R))*(1.5 + uKick*2.);
  col += uPal[1]*exp(-abs(r - R)*18.)*.6;
  col += uPal[4]*ss(.006, .0, abs(r - R - .04))*step(.5, fract(a*24./TAU + uTime*.2))*.8;
  for(int i=0; i<24; i++){
    float fi = float(i);
    float t = fract(hash11(fi) + uTime*.22*(1. + uEnergy));
    float rr = mix(1.2, R, t), aa = hash11(fi*3.)*TAU + t*4.;
    col += uPal[4]*exp(-length(p - vec2(cos(aa), sin(aa))*rr)*110.)*(1. - t)*1.6;
  }
  float arc = uSnare*.6 + uDrop*.5;
  if(r > R && r < R + .28){
    float n = noise(vec2(a*8., uTime*10.));
    col += vec3(.8, .9, 1.)*ss(.035, .0, abs(r - R - .08 - n*.12))*step(.72, noise(vec2(a*3., floor(uTime*8.))))*arc;
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#02010a', '#4a2fff', '#ff5fd2', '#a6e3ff', '#ffe066'],
  ['#000604', '#00a88a', '#7affc8', '#e6fff5', '#ff7ad9'],
  ['#0a0200', '#ff5a1f', '#ffcf6b', '#fff2d0', '#7af0ff'],
]);
