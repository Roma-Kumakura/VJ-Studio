import { shaderTheme } from './_make';

/* =====================================================================================
 * SET 5 — free concepts (20 themes): lo-fi, retro media, graphic art, dreamy light, night scenes
 * ===================================================================================== */

// ------------------------------------------------------------ 49. ローファイの窓辺
export const lofiwindow = shaderTheme('lofiwindow', 'ローファイの窓辺', 'Lo-fi Window', '雨の夜、部屋の窓から見える街のボケ。ハットで雨粒が増え、キックでデスクライトがゆらぐ。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = uPal[0]*.28;
  vec2 wc = vec2(.12, .08), ws = vec2(.55, .36);
  vec2 wp = uv - wc;
  if(abs(wp.x) < ws.x && abs(wp.y) < ws.y){
    vec3 o = mix(uPal[1]*.55, uPal[0]*.45, ss(-.3, .3, wp.y));
    for(int i=0; i<18; i++){
      float fi = float(i);
      vec2 bp = vec2((hash11(fi)-.5)*1.1, (hash11(fi*2.)-.62)*.5) + wc;
      float rad = .025 + hash11(fi*3.)*.05;
      o += mix(uPal[2], uPal[3], hash11(fi*5.))*ss(rad, rad*.55, length(uv - bp))*.5*(.7 + .3*sin(uTime*.5 + fi) + uBands[3]*.5);
    }
    vec2 g = vec2(wp.x*28., wp.y*7. + uTime*.5*(.6 + uHat));
    vec2 id = floor(g); float h = hash12(id);
    vec2 f = fract(g) - .5;
    float drop = ss(.16, .0, length(vec2(f.x, (f.y + fract(h*7. + uTime*.3) - .5)*.45)))*step(.66 - uHat*.15, h);
    o += vec3(.65, .72, .85)*drop*.55;
    col = o;
    col = mix(col, uPal[0]*.15, max(ss(.012, .006, abs(wp.x)), ss(.012, .006, abs(wp.y))));
  }
  float frame = step(abs(wp.x), ws.x + .03)*step(abs(wp.y), ws.y + .03)*(1. - step(abs(wp.x), ws.x)*step(abs(wp.y), ws.y));
  col = mix(col, uPal[0]*.12, frame);
  vec2 lp = uv - vec2(-W*.5 + .24, -.3);
  col += uPal[4]*exp(-length(lp)*3.2)*(.55 + uKick*.25);
  col = mix(col, uPal[0]*.2 + uPal[4]*.08, ss(-.36, -.385, uv.y));
  // a mug on the desk
  vec2 mg = uv - vec2(.55, -.41);
  col = mix(col, uPal[0]*.08, step(abs(mg.x), .04)*step(abs(mg.y), .05));
  col += vec3(.7)*ss(.01, .0, abs(fract(mg.x*0. + mg.y*3. + uTime*.3) - .5))*step(abs(mg.x - .0), .02)*step(.06, mg.y)*step(mg.y, .14)*.08;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0d0a14', '#2a3a6a', '#ffcf8a', '#ff8a9a', '#ffb36b'],
  ['#080d12', '#1f4a5a', '#a6e3ff', '#ffd9a0', '#ffcf6b'],
  ['#120a10', '#4a2f5a', '#ff9ef3', '#ffe0a0', '#ff9a5a'],
]);

// ------------------------------------------------------------ 50. ヴェイパー・サンセット
export const vaporgrid = shaderTheme('vaporgrid', 'ヴェイパー・サンセット', 'Vapor Sunset', '縞模様の夕陽とネオンのグリッド、ヤシの木のシルエット。低音でグリッドが光る。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = mix(uPal[1], uPal[0], ss(-.05, .55, uv.y));
  vec2 sc = uv - vec2(0., .12); float sr = length(sc);
  float stripes = sc.y > 0. ? 1. : step(.5 + sc.y*2., fract((sc.y + uTime*.02)*26.));
  col = mix(col, mix(uPal[2], uPal[3], ss(.25, -.2, sc.y)), ss(.27, .265, sr)*stripes);
  col += uPal[3]*exp(-sr*3.)*.3*(1. + uKick*.6);
  if(uv.y < -.05){
    float z = .4/(-.05 - uv.y);
    vec2 g = vec2(uv.x*z, z + uTravel*1.5);
    vec2 gf = abs(fract(g) - .5);
    float grid = ss(.05, .0, min(gf.x, gf.y)/max(z*.15, .2));
    col = uPal[0]*.3 + uPal[4]*grid*(.8 + (uBands[0] + uBands[1])*.8)*exp(-z*.04)*1.3;
  }
  for(int i=0; i<2; i++){
    float s = i == 0 ? -1. : 1.;
    vec2 pp = uv - vec2(s*.62, -.05);
    float trunk = ss(.012, .007, abs(pp.x + .05*s*pp.y*pp.y*3.))*step(0., pp.y)*step(pp.y, .42);
    float fr = 0.;
    for(int k=0; k<7; k++){
      float ang = float(k)/6.*PI + sin(uTime*.7 + float(k))*.06;
      vec2 d = pp - vec2(.0, .42);
      vec2 dir = vec2(cos(ang), sin(ang)*.45);
      float t = clamp(dot(d, dir)/dot(dir, dir), 0., .24);
      fr = max(fr, ss(.016, .006, length(d - dir*t + vec2(0., t*t*1.6))));
    }
    col = mix(col, uPal[0]*.12, max(trunk, fr));
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#1a0b33', '#ff6ec7', '#ffe066', '#ff3d7f', '#00e5ff'],
  ['#0b1033', '#7a5cff', '#ffb36b', '#ff5f7a', '#ff6ec7'],
  ['#160622', '#ff8a5a', '#fff2a0', '#ff3d9a', '#7af0ff'],
]);

// ------------------------------------------------------------ 51. シティポップの海岸線
export const citypop = shaderTheme('citypop', 'シティポップの海岸線', 'City Pop Coast', '80年代のポスターのような夕暮れの海と道路。キックでガードレールが流れ、海がきらめく。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = mix(uPal[2], uPal[1], ss(-.05, .5, uv.y));
  for(int i=0; i<4; i++){
    float fi = float(i);
    vec2 cp = uv - vec2(fract(hash11(fi) + uTime*.006*(1. + fi*.3))*2. - 1., .25 + fi*.06);
    col = mix(col, vec3(1.), ss(.4, .7, fbm(cp*vec2(3., 12.) + fi))*ss(.08, .0, abs(cp.y))*.5);
  }
  vec2 sun = uv - vec2(.25, .02);
  col = mix(col, uPal[3], ss(.12, .115, length(sun)));
  col += uPal[3]*exp(-length(sun)*4.)*.35;
  if(uv.y < 0.){
    float z = .3/(-uv.y + .01);
    vec3 sea = mix(uPal[4], uPal[0], ss(0., -.4, uv.y));
    float glit = step(.9, noise(vec2(uv.x*z*8., z*2. + uTime*2.)))*ss(.25, .0, abs(uv.x - .25)*(1. + z*.1));
    sea += uPal[3]*glit*(1. + uKick + uHat)*1.2;
    sea += vec3(1.)*step(.96, noise(vec2(uv.x*40., z*3. - uTime)))*.2;
    col = sea;
  }
  // road and guardrail in the foreground
  float road = ss(-.3, -.31, uv.y + uv.x*.12);
  col = mix(col, uPal[0]*.6, road);
  float rail = ss(.006, .0, abs(uv.y + .27 + uv.x*.12));
  col = mix(col, vec3(.95), rail);
  float post = step(fract(uv.x*6. + uTravel*2.), .06)*step(-.32 - uv.x*.12, uv.y)*step(uv.y, -.27 - uv.x*.12);
  col = mix(col, vec3(.9), post);
  col += vec3(1.)*ss(.003, .0, abs(uv.y + .42 + uv.x*.12))*step(.5, fract(uv.x*4. + uTravel*3.))*.6;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#1a2a5a', '#ff9ec4', '#ffd0a0', '#ffe066', '#3a8ad8'],
  ['#0f1f4a', '#a6c8ff', '#ffb3c8', '#fff2b0', '#4ac8d8'],
  ['#2a1a4a', '#ffb36b', '#ff9ef3', '#ffe9b0', '#5a7ad8'],
]);

// ------------------------------------------------------------ 52. 水彩のにじみ
export const watercolor = shaderTheme('watercolor', '水彩のにじみ', 'Watercolor Bloom', '紙の上に水彩絵の具がにじんで広がる。小節ごとに新しい色が落ちる。', /* glsl */ `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = vec3(.96, .94, .9)*(.92 + .08*fbm(uv*40.));
  for(int i=0; i<7; i++){
    float fi = float(i);
    float k = floor(uBeat/4.) - fi;
    float age = uBeat/4. - k;
    vec2 c = vec2(hash11(k*1.31)*W, hash11(k*2.71));
    float R = (.08 + .26*(1. - exp(-age*1.3)))*(.8 + hash11(k)*.6)*(1. + uBands[0]*.1);
    float d = length(uv - c) + fbm(uv*4. + k)*.14 - R;
    vec3 pig = uPal[1 + int(mod(k, 4.))];
    float body = ss(.02, -.06, d)*(.55 + .35*fbm(uv*10. + k));
    float edge = ss(.018, .0, abs(d))*.75;
    float a = exp(-age*.14);
    col *= mix(vec3(1.), pig*pig, clamp((body + edge)*a*1.4, 0., 1.));
  }
  col *= 1. - uKick*.04;
  fragColor = vec4(finish(col*1.05), 1.);
}`, [
  ['#ffffff', '#4a8ad8', '#e05a8a', '#e8b030', '#4ab88a'],
  ['#ffffff', '#6a5ad8', '#ff6a5a', '#3ab8c8', '#e08a3a'],
  ['#ffffff', '#2a6ad8', '#c84a8a', '#7ac84a', '#f07a2a'],
]);

// ------------------------------------------------------------ 53. 溶岩ランプ
export const lavalamp = shaderTheme('lavalamp', '溶岩ランプ', 'Lava Lamp', 'ゆっくり昇り降りする溶岩ランプの塊。低音で動きが速くなり、キックで光る。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float f = 0.;
  for(int i=0; i<9; i++){
    float fi = float(i);
    float sp = (.12 + hash11(fi)*.2)*(1. + (uBands[0] + uBands[1])*.6);
    vec2 c = vec2((hash11(fi*3.) - .5)*.3 + sin(uTime*.2 + fi)*.05, sin(uTime*sp + fi*2.)*.36);
    float r = .055 + hash11(fi*5.)*.06 + uKick*.008;
    vec2 dd = uv - c;
    f += r*r/(dot(dd, dd) + 1e-4);
  }
  vec3 col = mix(uPal[0]*.25, uPal[0]*.55, ss(-.5, .5, uv.y));
  float w = .27 - .09*uv.y;
  float inside = step(abs(uv.x), w)*step(abs(uv.y), .44);
  vec3 lava = mix(uPal[1], uPal[2], ss(1., 3., f));
  col = mix(col, uPal[3]*.4, inside);
  col = mix(col, lava*(1.15 + uKick*.3), inside*ss(.9, 1.1, f));
  col += uPal[1]*exp(-length(uv*vec2(1.6, .8))*2.)*.3*(1. + uKick*.6);
  col += vec3(1.)*inside*ss(.012, .0, abs(uv.x + w*.7))*.12;
  float cap = step(.44, abs(uv.y))*step(abs(uv.y), .56)*step(abs(uv.x), w + .04);
  col = mix(col, vec3(.1, .1, .12) + uPal[4]*.15*step(0., uv.y), cap);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#120614', '#ff5a3d', '#ffb347', '#ff2a6d', '#c9a7ff'],
  ['#060c14', '#3dffb0', '#a6ff5a', '#2a8aff', '#7af0ff'],
  ['#100410', '#ff6ec7', '#ffd0f0', '#7a3dff', '#ffe066'],
]);

// ------------------------------------------------------------ 54. ステンドグラス
export const stainedglass = shaderTheme('stainedglass', 'ステンドグラス', 'Stained Glass', '光が差し込むステンドグラス。スペクトラムに合わせて一枚ずつガラスが輝く。', /* glsl */ `
void main(){
  vec2 p = gl_FragCoord.xy/uRes.y*6.;
  vec2 ip = floor(p), fp = fract(p);
  float md = 8., md2 = 8.; vec2 mid = vec2(0.);
  for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = .5 + .35*sin(uTime*.15 + TAU*hash22(ip + g));
    vec2 r = g + o - fp; float d = dot(r, r);
    if(d < md){ md2 = md; md = d; mid = ip + g; } else if(d < md2) md2 = d;
  }
  float edge = sqrt(md2) - sqrt(md);
  float h = hash12(mid);
  vec3 c = uPal[1 + int(h*3.99)];
  float lightv = .45 + .9*spec(h) + uKick*.35*step(.8, h);
  vec3 col = c*lightv*(.7 + .3*fbm(p*3.));
  col = mix(vec3(.02), col, ss(.04, .08, edge));
  vec2 uv = gl_FragCoord.xy/uRes;
  col += uPal[4]*.12*ss(.3, 1., uv.y)*(.5 + .5*sin(uv.x*18. + uTime*.3));
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#000000', '#d8343d', '#2a5ad8', '#f0b030', '#2aa86a'],
  ['#000000', '#8a3dd8', '#3dc8d8', '#ff7a9a', '#ffe066'],
  ['#000000', '#d86a2a', '#5a2ad8', '#3dd88a', '#ffcf6b'],
]);

// ------------------------------------------------------------ 55. オプアート
export const opart = shaderTheme('opart', 'オプアート', 'Op Art', '目がくらむモアレの縞模様。低音で縞がゆがみ、キックで色が差す。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float r = length(uv), a = atan(uv.y, uv.x);
  vec2 c2 = uv - vec2(.25*sin(uTime*.3), .15*cos(uTime*.4));
  float s1 = sin(r*60. - uTravel*4. + sin(a*3. + uTime)*(uBands[0] + uBands[1])*2.);
  float s2 = sin(length(c2)*62. + uTime);
  float m = step(0., s1*s2);
  vec3 col = mix(uPal[0], uPal[4], m);
  col = mix(col, uPal[2], ss(.85, 1., abs(s1))*(uKick*.7 + uDropHit*.5));
  col = mix(col, uPal[3], ss(.92, 1., abs(s2))*uSnare*.5);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#050505', '#ffffff', '#ff3d5a', '#00e5ff', '#f2f2f2'],
  ['#0b0620', '#ffffff', '#ffe066', '#ff6ec7', '#e6e0ff'],
  ['#001410', '#ffffff', '#ff7a3d', '#7af0ff', '#e0fff5'],
]);

// ------------------------------------------------------------ 56. ネオン管アート
export const neontube = shaderTheme('neontube', 'ネオン管アート', 'Neon Tubes', 'レンガの壁に光るネオン管の図形。拍ごとに灯り、ハットでちらつく。', /* glsl */ `
float sdTri(vec2 p, float r){
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r/k;
  if(p.x + k*p.y > 0.) p = vec2(p.x - k*p.y, -k*p.x - p.y)/2.;
  p.x -= clamp(p.x, -2.*r, 0.);
  return -length(p)*sign(p.y);
}
vec3 tube(float d, vec3 c, float on){ return c*(ss(.012, .004, abs(d))*1.6 + exp(-abs(d)*22.)*.5)*on; }
float flick(float i){ return step(.07, hash11(floor(uTime*20.) + i*13.))*(1. - uHat*.35*step(.5, hash11(floor(uTime*30.) + i*3.))); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec2 b = uv*vec2(7., 14.); b.x += step(1., mod(floor(b.y), 2.))*.5;
  vec2 bf = fract(b);
  vec3 col = uPal[0]*.28*(.8 + .2*hash12(floor(b)))*(1. - .55*max(ss(.07, .0, bf.y), ss(.035, .0, bf.x)));
  float st = mod(floor(uBeat), 4.);
  float on1 = flick(1.)*(.6 + uKick*.6), on2 = flick(2.)*(st >= 1. ? 1. : .25), on3 = flick(3.)*(st >= 2. ? 1. : .25);
  col += tube(length(uv - vec2(-.52, .08)) - .2, uPal[1], on1);
  col += tube(sdTri(uv - vec2(.5, .05), .19), uPal[2], on2);
  float wv = uv.y + .3 - .045*sin(uv.x*18. + uTime*3.);
  col += tube(max(abs(wv), abs(uv.x) - .75) , uPal[3], on3);
  float zz = abs(fract(uv.x*5. + .25) - .5)*.18 - .045;
  col += tube(max(abs(uv.y - .36 - zz), abs(uv.x) - .3), uPal[4], flick(4.)*(st >= 3. ? 1. : .2) + uSnare*.5);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#140a0a', '#ff3d7f', '#00e5ff', '#ffe066', '#7aff9a'],
  ['#0a0a14', '#ff6ec7', '#7af0ff', '#ff9a3d', '#c9a7ff'],
  ['#0e0a06', '#ff5a3d', '#3dffd0', '#ff3d9a', '#ffd36b'],
]);

// ------------------------------------------------------------ 57. ASCIIの雨
export const ascii = shaderTheme('ascii', 'ASCIIの雨', 'ASCII Rain', '記号の列が降り注ぐ端末画面。列の明るさがスペクトラムに反応する。', /* glsl */ `
void main(){
  vec2 px = gl_FragCoord.xy;
  float cs = uRes.y/38.;
  vec2 cell = floor(px/cs), f = fract(px/cs);
  float cid = cell.x;
  float speed = (.5 + hash11(cid*1.7)*1.4)*(1. + uEnergy*.8);
  float trail = fract(-cell.y/38.*1.3 + uTime*speed*.18 + hash11(cid*7.3));
  float head = pow(trail, 7.);
  float g = hash12(vec2(cid, floor(cell.y + uTime*speed*3.)));
  vec2 gp = floor(f*vec2(5., 6.));
  float bit = step(.52, hash12(gp + g*91.7));
  float inglyph = step(.12, f.x)*step(f.x, .88)*step(.1, f.y)*step(f.y, .9);
  float cols = uRes.x/cs;
  float v = spec(cid/cols);
  vec3 col = uPal[0]*.15 + mix(uPal[1], uPal[2], head)*bit*inglyph*(trail*.85 + .05)*(.55 + v*1.4);
  col += uPal[3]*bit*inglyph*head*uKick*.8;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#000400', '#3dff6a', '#e6ffe6', '#a6ff5a', '#3dff6a'],
  ['#000208', '#3dc8ff', '#e6f5ff', '#7af0ff', '#3dc8ff'],
  ['#080002', '#ff3d7f', '#ffe6f0', '#ffb3c8', '#ff3d7f'],
]);

// ------------------------------------------------------------ 58. 回転多面体
export const polyhedra = shaderTheme('polyhedra', '回転多面体', 'Wire Polyhedra', '入れ子になったワイヤーフレームの立方体と八面体が回転する。キックで膨らむ。', /* glsl */ `
float segd(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.); return length(pa - ba*h); }
vec2 proj(vec3 v){ return v.xy/(v.z + 3.2)*2.4; }
mat3 rotm(float a, float b){
  mat3 ry = mat3(cos(a), 0., sin(a), 0., 1., 0., -sin(a), 0., cos(a));
  mat3 rx = mat3(1., 0., 0., 0., cos(b), -sin(b), 0., sin(b), cos(b));
  return ry*rx;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = uPal[0]*.3;
  mat3 R = rotm(uTime*.35 + uTravel*.05, uTime*.23);
  float s = .38*(1. + uKick*.12 + uDropHit*.2);
  float dc = 9.;
  for(int i=0; i<8; i++){
    vec3 a = vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1))*2. - 1.;
    for(int j=0; j<3; j++){
      int k = i ^ (1 << j);
      if(k < i) continue;
      vec3 b = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1))*2. - 1.;
      dc = min(dc, segd(uv, proj(R*a*s), proj(R*b*s)));
    }
  }
  mat3 R2 = rotm(-uTime*.5, uTime*.4 + uBeat*.1);
  float s2 = .62*(1. + uSnare*.1);
  float doc = 9.;
  for(int i=0; i<6; i++){
    vec3 a = vec3(0.); a[i/2] = (i % 2 == 0) ? 1. : -1.;
    for(int j=0; j<6; j++){
      if(j/2 == i/2 || j < i) continue;
      vec3 b = vec3(0.); b[j/2] = (j % 2 == 0) ? 1. : -1.;
      doc = min(doc, segd(uv, proj(R2*a*s2), proj(R2*b*s2)));
    }
  }
  col += uPal[1]*(ss(.006, .0, dc)*1.4 + exp(-dc*40.)*.5);
  col += uPal[2]*(ss(.005, .0, doc)*1.2 + exp(-doc*35.)*.35);
  col += uPal[3]*exp(-length(uv)*4.)*.25*(1. + uEnergy);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#020208', '#7af0ff', '#ff6ec7', '#9b8cff', '#ffffff'],
  ['#060200', '#ffcf6b', '#ff5a3d', '#ff9a3d', '#ffffff'],
  ['#000604', '#7affc8', '#c9a7ff', '#3ee6c4', '#ffffff'],
]);

// ------------------------------------------------------------ 59. シャボン玉
export const bubbles = shaderTheme('bubbles', 'シャボン玉', 'Soap Bubbles', '虹色の膜をまとったシャボン玉がふわふわ昇る。キックで少し揺れる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[1], uPal[0], ss(-.6, .6, uv.y));
  col += uPal[2]*.15*fbm(uv*2. + uTime*.03);
  for(int i=0; i<16; i++){
    float fi = float(i);
    float R = .035 + hash11(fi*3.)*.1;
    float y = fract(hash11(fi) + uTime*.035*(1. + hash11(fi*7.)))*1.5 - .75;
    vec2 c = vec2((hash11(fi*2.) - .5)*W + sin(uTime*.6 + fi)*.05 + uKick*.01*sin(fi), y);
    vec2 d = uv - c; float r = length(d);
    if(r < R){
      float t = r/R;
      vec3 film = .5 + .5*cos(TAU*(t*1.6 + vec3(0., .33, .67) + uTime*.08 + fi));
      float rim = ss(.5, 1., t)*.9 + .1;
      col = mix(col, col*.7 + film*.9, rim);
      col += vec3(1.)*ss(.04, .0, abs(t - .97))*.5;
      col += vec3(1.)*ss(.25, .0, length(d/R - vec2(-.4, .4)))*.7;
    }
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#2a4a8a', '#8ab8f0', '#ffd6f0', '#ffffff', '#ffffff'],
  ['#101a33', '#3a4a7a', '#a6e3ff', '#ffffff', '#ffffff'],
  ['#4a2a5a', '#e88ab8', '#ffe0c0', '#ffffff', '#ffffff'],
]);

// ------------------------------------------------------------ 60. スピーカーコーン
export const speaker = shaderTheme('speaker', 'スピーカーコーン', 'Speaker Cone', '低音で揺れるウーファーとツイーター。キックでコーンが押し出され、空気の輪が広がる。', /* glsl */ `
vec3 driver(vec2 p, float R, float push, vec3 c1, vec3 c2){
  float r = length(p)/R;
  if(r > 1.12) return vec3(-1.);
  float cone = ss(.0, 1., r);
  vec3 col = mix(c1*.35, c1*.12, cone);
  col += vec3(.06)*sin(r*40.)*.2;
  col *= 1. + push*(1. - r)*1.4;
  col = mix(col, c2*(.35 + push*1.6), ss(.27, .25, r));
  col = mix(col, vec3(.08), ss(.97, 1., r));
  col += vec3(.25)*ss(1.06, 1.03, r)*ss(.98, 1.01, r);
  col = mix(col, vec3(.05), ss(1.08, 1.12, r));
  return col;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = uPal[0]*.25*(.8 + .2*hash12(floor(uv*200.)));
  float bass = (uBands[0] + uBands[1])*.5;
  float push = uKick*.6 + bass*.4;
  vec2 c = vec2(-.18, 0.);
  float sc = 1. + push*.04;
  for(int i=0; i<4; i++){
    float fi = float(i);
    float age = fract(uBeat - fi*.25);
    col += uPal[3]*ss(.012, .0, abs(length(uv - c) - (.4 + age*.6)))*(1. - age)*uKick*.8;
  }
  vec3 w = driver((uv - c)/sc, .36, push, uPal[1], uPal[2]);
  if(w.x >= 0.) col = w;
  vec3 tw = driver((uv - vec2(.42, .18))/(1. + uHat*.05), .1, uHat, uPal[4], uPal[2]);
  if(tw.x >= 0.) col = tw;
  col += uPal[2]*exp(-length(uv - c)*5.)*.12*(1. + uDropHit*2.);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a0a0c', '#6a6a7a', '#7af0ff', '#7af0ff', '#9a9aa8'],
  ['#0c0806', '#7a5a3a', '#ffb347', '#ffcf6b', '#a8907a'],
  ['#08060c', '#5a4a7a', '#ff6ec7', '#ff6ec7', '#9a8ab0'],
]);

// ------------------------------------------------------------ 61. カセットテープ
export const cassette = shaderTheme('cassette', 'カセットテープ', 'Cassette Tape', 'テンポに合わせてリールが回るカセットテープ。曲が進むとテープが巻き取られていく。', /* glsl */ `
float box(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  uv *= 1. + uKick*.015;
  vec3 col = mix(uPal[0]*.4, uPal[0]*.15, length(uv));
  float sh = box(uv - vec2(.02, -.03), vec2(.62, .4), .04);
  col *= 1. - .5*ss(.06, -.02, sh);
  float body = box(uv, vec2(.62, .4), .04);
  if(body < 0.){
    col = uPal[1]*(.85 + .1*uv.y);
    float label = box(uv - vec2(0., .1), vec2(.52, .22), .02);
    if(label < 0.){
      col = vec3(.95, .93, .88);
      col = mix(col, uPal[2], step(abs(uv.y - .27), .025));
      col = mix(col, uPal[3], step(abs(uv.y - .22), .012));
      col = mix(col, uPal[4], step(abs(uv.y - .19), .006));
    }
    float win = box(uv - vec2(0., .05), vec2(.3, .085), .03);
    if(win < 0.){
      col = vec3(.1, .1, .12);
      for(int s=0; s<2; s++){
        float sx = s == 0 ? -1. : 1.;
        vec2 rp = uv - vec2(sx*.2, .05);
        float amt = s == 0 ? 1. - uProg : uProg;
        float tape = .05 + .07*amt;
        col = mix(col, vec3(.22, .15, .1), ss(tape, tape - .005, length(rp)));
        float ang = atan(rp.y, rp.x) + uBeat*PI*.5*sx;
        float spokes = step(.6, fract(ang*3./TAU))*ss(.04, .035, length(rp))*ss(.015, .02, length(rp));
        col = mix(col, vec3(.95), ss(.042, .038, length(rp))*(1. - spokes)*ss(.012, .016, length(rp)));
      }
    }
    col = mix(col, uPal[1]*.6, ss(.004, .0, abs(box(uv - vec2(0., -.3), vec2(.36, .07), .02))));
    for(int h=0; h<4; h++){ col = mix(col, vec3(.15), ss(.018, .012, length(uv - vec2(-.24 + float(h)*.16, -.3)))); }
  }
  col += uPal[3]*ss(.008, .0, abs(body))*.3*(1. + uSnare);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#1a1a24', '#e8e4dc', '#ff5a3d', '#ffb347', '#3a7ad8'],
  ['#120c1a', '#2a2a30', '#ff6ec7', '#7af0ff', '#ffe066'],
  ['#0c1416', '#7ad0c8', '#ff7a5a', '#ffe0a0', '#2a5a8a'],
]);

// ------------------------------------------------------------ 62. レコード盤
export const vinyl = shaderTheme('vinyl', 'レコード盤', 'Vinyl Spin', '回り続けるレコードと溝の光。キックでトーンアームが震え、ラベルが光る。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = uPal[0]*.35;
  vec2 c = vec2(-.1, 0.);
  vec2 p = uv - c; float r = length(p), a = atan(p.y, p.x);
  float spin = uTime*TAU*(33.3/60.);
  col *= 1. - .45*ss(.5, .4, length(p - vec2(.02, -.02)));
  if(r < .44){
    float groove = .5 + .5*sin(r*420. + hash11(floor(r*60.))*6.);
    vec3 v = vec3(.04)*(.6 + .4*groove);
    float sheen = pow(abs(cos(a - .8)), 24.) + pow(abs(cos(a + 2.3)), 24.);
    v += uPal[4]*sheen*.35*(.5 + groove*.5)*ss(.15, .2, r);
    v += vec3(.08)*ss(.004, .0, abs(r - .3)) + vec3(.06)*ss(.004, .0, abs(r - .2));
    col = v;
    if(r < .15){
      float la = a - spin;
      vec3 lab = mix(uPal[1], uPal[2], step(.5, fract(la/TAU*2.)));
      lab *= 1. + uKick*.35;
      lab = mix(lab, vec3(.95), ss(.004, .0, abs(r - .11))*.6);
      col = lab;
      col = mix(col, vec3(.1), ss(.012, .008, r));
    }
  }
  vec2 piv = vec2(.48, .32);
  float arm = atan(.0 - piv.y, -.08 - piv.x) + .18 + uKick*.01*sin(uTime*60.);
  vec2 dir = vec2(cos(arm), sin(arm));
  float t = clamp(dot(uv - piv, dir), 0., .52);
  col = mix(col, vec3(.75, .76, .8), ss(.008, .004, length(uv - piv - dir*t)));
  col = mix(col, vec3(.6), ss(.035, .03, length(uv - piv)));
  col += uPal[3]*exp(-length(uv - piv - dir*.52)*40.)*(.4 + uHat);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#2a1f1a', '#ff5a3d', '#ffe0a0', '#ffb347', '#ffffff'],
  ['#14141c', '#3a7ad8', '#ffffff', '#7af0ff', '#c9e6ff'],
  ['#1a1420', '#ff6ec7', '#1a1a1a', '#ff9ef3', '#ffd6f0'],
]);

// ------------------------------------------------------------ 63. ミラーボール
export const discoball = shaderTheme('discoball', 'ミラーボール', 'Mirror Ball', '回るミラーボールと、フロアを走る光の粒。キックで光線が強くなる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = uPal[0]*.25;
  float spin = uTime*.6*(1. + uEnergy*.5);
  vec2 bc = vec2(0., .3);
  for(int i=0; i<5; i++){
    float fi = float(i);
    float ang = -PI*.5 + (fi - 2.)*.32 + sin(uTime*.4 + fi)*.2;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 d = uv - bc;
    float along = dot(d, dir), perp = abs(d.x*dir.y - d.y*dir.x);
    col += uPal[1 + i % 4]*ss(.02 + along*.12, .0, perp)*step(0., along)*.18*(.5 + uKick*1.2);
  }
  vec2 fp = uv*vec2(1., 2.5);
  vec2 g = fp*7. + vec2(spin*1.5, 0.);
  vec2 id = floor(g);
  float spot = ss(.25, .0, length(fract(g) - .5 + (hash22(id) - .5)*.4))*step(.45, hash12(id));
  col += uPal[1 + int(hash12(id)*3.99)]*spot*.7*(.6 + uHat*.8);
  float r = length(uv - bc);
  if(r < .12){
    vec3 n = vec3((uv - bc)/.12, 0.); n.z = sqrt(max(0., 1. - dot(n.xy, n.xy)));
    float lon = atan(n.x, n.z) + spin, lat = asin(clamp(n.y, -1., 1.));
    vec2 tile = vec2(lon*8./PI, lat*8./PI);
    vec2 tid = floor(tile);
    float bright = pow(hash12(tid + floor(uTime*4.)), 6.);
    col = vec3(.25)*(.4 + .6*n.z) + vec3(1.)*bright*(.6 + uKick);
    col *= .6 + .4*step(.08, fract(tile.x))*step(.08, fract(tile.y));
  }
  col = mix(col, vec3(.4), ss(.004, .0, abs(uv.x))*step(.42, uv.y));
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a0614', '#ff6ec7', '#7af0ff', '#ffe066', '#c9a7ff'],
  ['#060a14', '#ffffff', '#7a8cff', '#ff5fd2', '#3ee6c4'],
  ['#140806', '#ffb347', '#ff3d7f', '#fff2a0', '#ff7ad9'],
]);

// ------------------------------------------------------------ 64. 流体マーブル
export const marble = shaderTheme('marble', '流体マーブル', 'Fluid Marble', '絵の具を流したようなマーブル模様が、曲に合わせてうねり続ける。', /* glsl */ `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes.y*2.2;
  float t = uTime*.06 + uTravel*.02;
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv + 3.*q + vec2(1.7, 9.2) + t*1.5 + (uBands[0] + uBands[1])*.2), fbm(uv + 3.*q + vec2(8.3, 2.8) - t));
  float f = fbm(uv + 3.5*r);
  vec3 col = mix(uPal[0], uPal[1], ss(.2, .6, f));
  col = mix(col, uPal[2], ss(.5, .9, length(q)));
  col = mix(col, uPal[3], ss(.55, 1., r.x)*.8);
  col += uPal[4]*ss(.008, .0, abs(f - .5))*(.4 + uKick*.8);
  col *= .85 + .3*f;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a0a2a', '#ff6ec7', '#7af0ff', '#ffe0a0', '#ffffff'],
  ['#1a0a0a', '#e8b07a', '#2a5a8a', '#f2ece0', '#ffd36b'],
  ['#0a1a14', '#3ee6c4', '#9b7bff', '#ffd0f0', '#ffffff'],
]);

// ------------------------------------------------------------ 65. 天使のはしご
export const godrays = shaderTheme('godrays', '天使のはしご', 'Crepuscular Rays', '雲の切れ間から差し込む光の筋。キックで光が強まり、雲がゆっくり流れる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec2 sun = vec2(.1, .34);
  vec3 col = mix(uPal[0], uPal[1], ss(-.5, .5, uv.y));
  float cl = fbm(uv*vec2(2., 4.) + vec2(uTime*.02, 0.));
  float cloud = ss(.45, .7, cl)*ss(-.2, .3, uv.y);
  vec2 d = uv - sun; float a = atan(d.y, d.x);
  float rays = .5 + .5*noise(vec2(a*14., uTime*.15)) + .3*noise(vec2(a*40., uTime*.3));
  rays = pow(rays, 3.)*ss(-.2, .1, -d.y)*exp(-length(d)*1.2);
  col += uPal[3]*rays*(.5 + uKick*.6 + uDrop*.4)*(1. - cloud*.7);
  col = mix(col, mix(uPal[2], uPal[4], ss(.5, .9, cl)), cloud*.85);
  col += uPal[3]*exp(-length(d)*6.)*.6;
  col += vec3(1.)*ss(.04, .0, length(d))*.4;
  col = mix(col, uPal[0]*.6, ss(-.33, -.36, uv.y + .03*sin(uv.x*3.)));
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#2a2a4a', '#ffb38a', '#c8a0b0', '#fff2c8', '#fff0e6'],
  ['#1a3a5a', '#a6d0ff', '#e6eef8', '#ffffff', '#ffffff'],
  ['#3a1a2a', '#ff9a6a', '#d88aa0', '#ffe0a0', '#ffd0c0'],
]);

// ------------------------------------------------------------ 66. 夜の観覧車
export const ferris = shaderTheme('ferris', '夜の観覧車', 'Night Ferris Wheel', '夜の水辺で回る観覧車。拍ごとに電飾のパターンが切り替わり、水面に映る。', /* glsl */ `
vec3 wheel(vec2 uv){
  vec3 col = vec3(0.);
  vec2 c = vec2(.15, .12); float R = .33;
  vec2 p = uv - c; float r = length(p), a = atan(p.y, p.x);
  float rot = uTime*.12;
  float pat = mod(floor(uBeat), 4.);
  float ring = ss(.006, .0, abs(r - R)) + ss(.004, .0, abs(r - R*.92));
  float bulbs = step(.5, fract((a + rot)*48./TAU + (pat == 1. ? uBeat : 0.)));
  float chase = pat == 2. ? step(.6, fract((a + rot)*6./TAU - uBeat)) : 1.;
  col += mix(uPal[1], uPal[2], .5 + .5*sin(a*3. + uBeat))*ring*(bulbs*chase*1.2 + .2)*(1. + uKick*.6);
  float sp = abs(fract((a + rot)*16./TAU) - .5)*r;
  col += uPal[3]*ss(.004, .0, sp)*step(r, R)*.5*(pat == 3. ? 1.5 : .6);
  for(int i=0; i<16; i++){
    float ga = float(i)/16.*TAU - rot;
    vec2 gp = c + vec2(cos(ga), sin(ga))*R - vec2(0., .025);
    col += uPal[4]*ss(.016, .012, length((uv - gp)*vec2(1., .8)))*(.6 + .4*step(.5, hash11(float(i) + floor(uBeat))));
  }
  col += uPal[2]*ss(.008, .0, abs(uv.x - c.x - (uv.y - c.y)*.35))*step(uv.y, c.y)*step(-.2, uv.y)*.3;
  col += uPal[2]*ss(.008, .0, abs(uv.x - c.x + (uv.y - c.y)*.35))*step(uv.y, c.y)*step(-.2, uv.y)*.3;
  return col;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = mix(uPal[0]*.6, uPal[0]*.2, ss(-.2, .5, uv.y)) + step(.992, hash12(floor(uv*120.)))*.4;
  float horizon = -.2;
  if(uv.y > horizon){
    col += wheel(uv);
    float sky = step(uv.y, horizon + .05 + .05*hash11(floor(uv.x*20.)))*step(abs(uv.x + .4), .45);
    col = mix(col, uPal[0]*.1, sky);
  } else {
    vec2 m = vec2(uv.x + .01*sin(uv.y*80. + uTime*2.), 2.*horizon - uv.y);
    col = uPal[0]*.15 + wheel(m)*.45*ss(-.5, horizon, uv.y);
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#060a1a', '#ff6ec7', '#7af0ff', '#ffe066', '#ffb347'],
  ['#0a0612', '#ffcf6b', '#ff5a3d', '#ffffff', '#ff9ef3'],
  ['#040c10', '#3ee6c4', '#c9a7ff', '#ffe0a0', '#7af0ff'],
]);

// ------------------------------------------------------------ 67. 心電図モニター
export const ecg = shaderTheme('ecg', '心電図モニター', 'Heart Monitor', '拍ごとに脈打つ心電図。キックで波形が跳ね、残光が尾を引く。', /* glsl */ `
float beatWave(float x){
  float b = fract(x);
  float p = .08*exp(-pow((b - .15)/.04, 2.));
  float q = -.06*exp(-pow((b - .27)/.012, 2.));
  float rr = .5*exp(-pow((b - .3)/.012, 2.));
  float s = -.15*exp(-pow((b - .33)/.012, 2.));
  float t = .14*exp(-pow((b - .55)/.06, 2.));
  return p + q + rr + s + t;
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 g = abs(fract(gl_FragCoord.xy/uRes.y*vec2(10., 10.)) - .5);
  vec2 g2 = abs(fract(gl_FragCoord.xy/uRes.y*vec2(50., 50.)) - .5);
  vec3 col = uPal[0]*.2 + uPal[1]*.08*ss(.48, .5, max(g.x, g.y)) + uPal[1]*.03*ss(.46, .5, max(g2.x, g2.y));
  float beats = 3.;
  float head = fract(uBeat/beats);
  float x = uv.x;
  float since = fract(head - x);
  float bx = (uBeat - since*beats);
  float amp = .7 + uKick*.6 + uDrop*.3;
  float y = .5 + beatWave(bx)*.55*amp + (noise(vec2(x*80., uTime))*.01);
  float d = abs(uv.y - y)*uRes.y;
  float fade = exp(-since*3.5);
  col += uPal[2]*(ss(2.5, .0, d)*1.4 + exp(-d*.15)*.25)*fade;
  col += uPal[3]*exp(-length((uv - vec2(head, y))*vec2(uRes.x/uRes.y, 1.))*60.)*1.2;
  col += uPal[4]*ss(.02, .0, abs(uv.x - fract(head + .02)))*.08;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#000402', '#1f6f3a', '#3dff7a', '#e6ffe6', '#3dff7a'],
  ['#020206', '#1f3a6f', '#3dc8ff', '#e6f5ff', '#3dc8ff'],
  ['#060002', '#6f1f3a', '#ff3d7f', '#ffe6f0', '#ff3d7f'],
]);

// ------------------------------------------------------------ 68. ドット絵の夕暮れ
export const pixeltown = shaderTheme('pixeltown', 'ドット絵の夕暮れ', 'Pixel Dusk Town', 'ドット絵で描いた夕暮れの街。窓の明かりがスペクトラムで灯り、雲がゆっくり流れる。', /* glsl */ `
void main(){
  float PX = 150.;
  vec2 cell = floor(gl_FragCoord.xy/uRes.y*PX);
  vec2 uv = cell/PX;
  float W = uRes.x/uRes.y;
  float dith = hash12(cell)*.06;
  float band = floor((uv.y + dith)*8.)/8.;
  vec3 col = mix(uPal[1], uPal[0], band);
  vec2 sun = vec2(W*.68, .36);
  if(length(uv - sun) < .07) col = uPal[3];
  else if(length(uv - sun) < .085 && mod(cell.x + cell.y, 2.) < 1.) col = uPal[3];
  for(int i=0; i<3; i++){
    float fi = float(i);
    vec2 cp = uv - vec2(fract(hash11(fi) + uTime*.006*(1. + fi))*(W + .4) - .2, .6 + fi*.08);
    if(abs(cp.y) < .025 && abs(cp.x) < .12 + .04*sin(fi) && noise(cp*vec2(30., 60.) + fi) > .35) col = mix(col, vec3(1.), .8);
  }
  for(int l=1; l>=0; l--){
    float fl = float(l);
    float bx = floor((uv.x + uTravel*.003*(2. - fl))*(10. - fl*3.));
    float h = .18 + hash11(bx + fl*9.)*(.22 + fl*.06) + fl*.06;
    if(uv.y < h){
      col = l == 1 ? uPal[0]*.55 + uPal[2]*.08 : uPal[0]*.3;
      vec2 wc = floor(uv*PX/3.);
      float lit = step(.55, hash12(wc + fl*7.))*step(.6, spec(hash11(bx)));
      if(mod(wc.x, 2.) < 1. && mod(wc.y, 2.) < 1. && uv.y < h - .02) col = mix(col, uPal[4], lit + .12);
    }
  }
  if(uv.y < .06) col = uPal[0]*.2;
  col *= 1. + uKick*.08;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#1a1438', '#ff8a5a', '#ff5a7a', '#ffe066', '#ffcf6b'],
  ['#0e1a33', '#ff9ec4', '#7a5aff', '#fff2b0', '#7af0ff'],
  ['#20102a', '#ffb347', '#d85a3d', '#ffd0a0', '#ffe066'],
]);
