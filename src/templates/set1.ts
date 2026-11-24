import { shaderTheme } from './_make';

// ------------------------------------------------------------ 1. 雨上がりの水たまり
export const puddle = shaderTheme('puddle', '雨上がりの水たまり', 'Neon Puddles', 'ネオンを映す路面の水たまり。ハイハットで雨粒、キックで大きな波紋。', /* glsl */ `
float sdBox(vec2 p, vec2 b){ vec2 d=abs(p)-b; return length(max(d,0.))+min(max(d.x,d.y),0.); }
vec3 street(vec2 p){
  float W = uRes.x/uRes.y;
  vec3 c = mix(uPal[0]*.25, uPal[0]*.9, ss(-.1,.7,p.y));
  // distant building blocks
  float bx = floor(p.x*5. + uV[0]*30.);
  float bh = .05 + .3*hash11(bx);
  if(p.y < bh) c = uPal[0]*.12 + uPal[0]*.05*hash11(bx*3.);
  // neon signs
  for(int i=0;i<11;i++){
    float fi = float(i);
    vec2 cen = vec2((hash11(fi+uV[1]*10.)-.5)*W*1.3, .0 + hash11(fi*3.1+uV[2])*.36);
    vec2 sz = vec2(.03 + .1*hash11(fi*7.), .015 + .06*hash11(fi*5.3));
    if(hash11(fi*9.)<.4) sz = sz.yx*1.3;
    float d = sdBox(p - cen, sz);
    vec3 nc = uPal[1 + i%3];
    float on = (hash11(fi*2.7) < .3) ? step(.25, fract(uBeat*.5 + fi*.37)) : 1.;
    c += nc * (ss(.005,.0,abs(d))*2.4 + step(d,0.)*.35 + exp(-max(d,0.)*18.)*.7) * on * (.9 + uEnergy*.7);
  }
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float h0 = -.08 + uV[3]*.05;
  vec3 col;
  if(uv.y > h0) col = street(uv);
  else {
    float z = .55/(h0 - uv.y + .003);
    vec2 wp = vec2(uv.x*z, z + uTravel*.25);
    float pud = ss(.47, .53, fbm(wp*.28 + uV[4]*9.));
    // rain ripples
    float rip = 0.;
    for(int l=0;l<2;l++){
      vec2 gp = wp*(2.5 + float(l)*1.7) + float(l)*13.;
      vec2 cell = floor(gp), f = fract(gp);
      float hsh = hash12(cell + uV[5]*7.);
      float rate = 1.2 + hsh;
      float ph = fract(uTime*rate*.6 + hsh*9.);
      float on = step(hsh, .25 + uHat*.6);
      float d = length(f - hash22(cell)) - ph*.45;
      rip += sin(d*60.) * exp(-abs(d)*25.) * (1.-ph) * on;
    }
    // kick ripple
    float kr = length(vec2(uv.x, (uv.y - h0)*3.)) - uBeatPhase*1.4;
    rip += sin(kr*40.) * exp(-abs(kr)*10.) * uKick * 2.;
    vec2 ruv = vec2(uv.x + rip*.012, 2.*h0 - uv.y + rip*.02);
    vec3 refl = street(ruv) * vec3(.75,.8,.95);
    vec3 asphalt = vec3(.04,.042,.055) + .05*noise(wp*14.) + street(vec2(uv.x + noise(wp*3.)*.03, 2.*h0-uv.y))*.22;
    col = mix(asphalt, refl, pud*.95);
    col *= exp(-z*.008);
  }
  col *= 1. + uKick*.12;
  col += uPal[2]*uDropHit*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#120a24', '#ff4fa3', '#38e1ff', '#ffd23f', '#ffffff'],
  ['#0a1420', '#5fffd7', '#ff7a5c', '#b48cff', '#ffffff'],
  ['#160f08', '#ffb347', '#ff5f6d', '#7af0ff', '#ffffff'],
]);

// ------------------------------------------------------------ 2. 金魚すくいの夜
export const goldfish = shaderTheme('goldfish', '金魚すくいの夜', 'Goldfish Night', '提灯が映る水面を金魚が泳ぐ。キックで提灯が明滅し、盛り上がるほど金魚が増える。', /* glsl */ `
float fishSDF(vec2 p, float wig){
  p.y += sin(p.x*18. + wig)*.012*ss(.02,-.08,p.x);
  float body = length(vec2(p.x/.07, p.y/.032)) - 1.;
  float tx = -p.x - .06;
  float tail = max(tx - .07, abs(p.y) - (.008 + tx*.6));
  return min(body*.03, tail);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  // tub water
  vec3 col = mix(uPal[0], uPal[0]*1.6, ss(1., 0., length(uv*vec2(.7,1.))));
  float cau = pow(abs(sin(fbm(uv*4. + uTime*.15)*12.)), 8.);
  col += uPal[4]*cau*.08;
  // lantern reflections (warm blobs) flicker on kick
  for(int i=0;i<5;i++){
    float fi = float(i);
    vec2 c = vec2((hash11(fi+uV[0]*9.)-.5)*W*1.3, (hash11(fi*3.+uV[1])-.5)*.9);
    c += vec2(sin(uTime*.6+fi), cos(uTime*.5+fi*2.))*.015;
    float fl = .7 + .3*sin(uTime*7.+fi*3.) + uKick*.8*step(.5, hash11(fi*5.));
    float d = length((uv - c)*vec2(1., 1.6));
    col += uPal[1] * (exp(-d*d*60.)*.6 + exp(-d*7.)*.18) * fl;
  }
  // fish
  float n = 3. + uEnergy*6. + uDrop*2.;
  for(int i=0;i<10;i++){
    float fi = float(i);
    if(fi >= n) break;
    float sp = .15 + .1*hash11(fi*1.7);
    float a = uTravel*sp + fi*2.1 + uV[2]*6.;
    vec2 c = vec2(sin(a*1.1 + fi)*W*.42, sin(a*.8 + fi*1.7)*.38);
    vec2 v = vec2(cos(a*1.1+fi)*1.1*W*.42, cos(a*.8+fi*1.7)*.8*.38);
    float ang = atan(v.y, v.x);
    vec2 p = uv - c;
    p = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p;
    float sc = .8 + .5*hash11(fi*3.3);
    float d = fishSDF(p/sc, uTime*9. + fi);
    // shadow
    float ds = fishSDF((p + vec2(.012,.018))/sc, uTime*9.+fi);
    col *= 1. - .35*ss(.01, -.002, ds);
    vec3 fc = mix(uPal[2], uPal[3], step(.6, hash11(fi*7.)));
    fc = mix(fc, vec3(1.), step(.75, noise(p*60. + fi))*step(.5, hash11(fi*11.)));
    col = mix(col, fc*(1.1 + uKick*.3), ss(.004, -.002, d));
  }
  // surface ripples / highlights
  float r = fbm(uv*6. + vec2(uTime*.2, -uTime*.15));
  col += vec3(1.)*pow(r, 6.)*.25;
  // tub rim
  float rim = ss(.62, .64, length(uv*vec2(.55, 1.)));
  col = mix(col, uPal[4]*.15 + vec3(.02), rim);
  col += uPal[1]*uDropHit*.2;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0b2a4a', '#ffb24a', '#ff5a36', '#ffffff', '#cfe8ff'],
  ['#102b2b', '#ffcf6b', '#ff3d5a', '#ffe8d6', '#d6fff8'],
  ['#1a1438', '#ff9d5c', '#ff6f91', '#fff1f5', '#e6dcff'],
]);

// ------------------------------------------------------------ 3. ブラウン管チャンネル
export const crt = shaderTheme('crt', 'ブラウン管チャンネル', 'CRT Channel Surf', '砂嵐とテストパターンのブラウン管。展開でチャンネルが変わり、スネアでノイズが走る。', /* glsl */ `
vec3 channel(float ch, vec2 p){
  ch = mod(ch, 5.);
  if(ch < 1.){ // colour bars
    float i = floor(p.x*7.);
    vec3 bars[7] = vec3[7](vec3(.75), vec3(.75,.75,0.), vec3(0.,.75,.75), vec3(0.,.75,0.), vec3(.75,0.,.75), vec3(.75,0.,0.), vec3(0.,0.,.75));
    vec3 c = bars[int(clamp(i,0.,6.))];
    if(p.y < .25) c = vec3(step(.5, fract(p.x*4.)))*.8;
    return c;
  } else if(ch < 2.){ // circle test pattern
    vec2 q = p - .5; q.x *= uRes.x/uRes.y;
    float g = max(step(.97, fract(p.x*16.)), step(.95, fract(p.y*12.)));
    float c = ss(.005,.0,abs(length(q)-.3)) + ss(.004,.0,abs(q.x))*step(length(q),.3) + ss(.004,.0,abs(q.y))*step(length(q),.3);
    return mix(vec3(.15), vec3(.9), max(g*.4, c)) + uPal[1]*step(length(q),.08);
  } else if(ch < 3.){ // spectrum bars channel
    float b = spec(p.x);
    return mix(uPal[0]*.3, mix(uPal[1], uPal[2], p.y), step(p.y, b*.9)) ;
  } else if(ch < 4.){ // gradient + moving sun (weather-like)
    vec3 c = mix(uPal[2], uPal[0], p.y);
    c += uPal[3]*ss(.15,.12,length((p - vec2(.5+.3*sin(uTime*.3), .55))*vec2(1.8,1.)));
    return c;
  }
  float s = hash12(floor(p*vec2(320.,240.)) + floor(uTime*30.)*3.);
  return vec3(s);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  // bezel & barrel distortion
  vec2 c = uv*2.-1.;
  float W = uRes.x/uRes.y;
  vec2 sc = c*vec2(1.08, 1.12);
  sc *= 1. + .08*dot(sc,sc);
  vec2 p = sc*.5+.5;
  float inside = step(0., p.x)*step(p.x, 1.)*step(0., p.y)*step(p.y, 1.);
  float roll = uSnare*.2*sin(uTime*3.);
  p.y = fract(p.y + roll);
  float ch = floor(uBar/8.) + uSection*3. + floor(uV[0]*5.);
  float sw = fract(uBar/8.);
  vec3 img = channel(ch, p);
  float stat = hash12(floor(p*vec2(400.,300.)) + floor(uTime*40.));
  float noiseAmt = .06 + uSnare*.5 + ss(.03,.0,sw)*1. + uDropHit*.6;
  img = mix(img, vec3(stat), clamp(noiseAmt, 0., 1.));
  // tracking line
  img += vec3(.3)*ss(.02,.0,abs(fract(p.y - uTime*.15)-.5))*.5;
  // scanlines + RGB mask
  float sl = .75 + .25*sin(gl_FragCoord.y*3.14159*.9);
  vec3 mask = vec3(1.) + .18*vec3(sin(gl_FragCoord.x*2.1), sin(gl_FragCoord.x*2.1+2.1), sin(gl_FragCoord.x*2.1+4.2));
  vec3 col = img*sl*mask*(1. + uKick*.3);
  col *= 1. - .5*dot(c*.7, c*.7);
  // bezel
  vec3 bezel = mix(vec3(.08,.08,.09), uPal[4]*.25, .3) + .05*noise(uv*200.);
  float edge = ss(.0,.015, min(min(p.x,1.-p.x), min(p.y,1.-p.y)));
  col = mix(bezel, col, inside*edge);
  col += uPal[1]*inside*exp(-length(c)*1.5)*.05;
  fragColor = vec4(finish(col*1.1), 1.);
}`, [
  ['#101018', '#ff4f8a', '#4fe3ff', '#ffe066', '#c9b8a8'],
  ['#0c1410', '#7cff6b', '#4fb3ff', '#ff9d3c', '#b8b8b8'],
  ['#180c14', '#ff6fd8', '#b388ff', '#fff36b', '#d8c8e8'],
]);

// ------------------------------------------------------------ 4. 夢の団地
export const danchi = shaderTheme('danchi', '夢の団地', 'Dream Danchi', '果てしなく続く団地の外壁。窓の灯りがスペクトラムに合わせて灯る。', /* glsl */ `
vec3 facade(vec2 p, float depth, float id){
  // p: wall coords; windows grid
  vec2 g = vec2(p.x*6., p.y*10.);
  vec2 cell = floor(g), f = fract(g);
  vec3 wall = mix(uPal[0], uPal[1], .35 + .3*hash11(id)) * (.75 + .25*f.y);
  float win = ss(.18,.22,f.x)*ss(.82,.78,f.x)*ss(.25,.3,f.y)*ss(.75,.7,f.y);
  float band = fract(cell.x*.137 + cell.y*.071 + id);
  float lit = step(.35, spec(band) * (.6 + uEnergy*.6) + hash12(cell+id)*.25);
  vec3 wc = mix(uPal[0]*.25, mix(uPal[2], uPal[3], hash12(cell*1.3+id)), lit);
  wc += uPal[2]*uKick*.25*lit;
  vec3 c = mix(wall, wc, win);
  // balcony rail
  c = mix(c, wall*.6, ss(.06,.0,abs(f.y-.12))*.8);
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 col = mix(uPal[4], uPal[3]*.8 + uPal[4]*.3, ss(-.5,.6,uv.y));
  // three layers of slabs at different depth, slowly drifting
  for(int l=2;l>=0;l--){
    float fl = float(l);
    float s = 1. + fl*.7;
    vec2 p = uv*s + vec2(uTravel*.04/(1.+fl) + fl*3.7 + uV[0]*10., .05*sin(uTravel*.03) - .1*fl);
    float bid = floor(p.x*.7);
    float bx = fract(p.x*.7);
    float top = .25 + .3*hash11(bid + fl*9.);
    float gap = step(.08, bx)*step(bx, .96);
    if(p.y < top && gap > .5){
      vec3 c = facade(vec2(bx/.7, p.y), fl, bid + fl*17.);
      c = mix(c, col, fl*.28);
      col = c;
    }
  }
  col *= 1. + uDrop*.1;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#d9d3c7', '#c6b8a6', '#ffd58a', '#ff9db0', '#9fc4e8'],
  ['#cfd6e0', '#b8c2d4', '#ffe7a8', '#9fe3ff', '#f7b4c8'],
  ['#e4d8e8', '#c9b8d8', '#fff1a8', '#ffb3d1', '#a9b8ff'],
]);

// ------------------------------------------------------------ 5. 放課後の教室
export const classroom = shaderTheme('classroom', '放課後の教室', 'After School', '夕陽が差し込む教室。ビルドで日が傾き、キックで光が脈打つ。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  float sun = clamp(.3 + uBuild*.5 + uProg*.3, 0., 1.);
  vec3 warm = mix(uPal[1], uPal[2], sun);
  // room: floor & wall
  float floorY = -.22;
  vec3 col = uv.y > floorY ? mix(uPal[0]*.9, uPal[0]*.6, ss(floorY, .5, uv.y)) : mix(uPal[3]*.5, uPal[3]*.3, ss(floorY, -.5, uv.y));
  if(uv.y < floorY) col *= .8 + .2*step(.5, fract((uv.x + (floorY-uv.y)*1.5)*6.));
  // chalkboard on the right
  vec2 cb = uv - vec2(W*.25, .12);
  float board = step(abs(cb.x), W*.18)*step(abs(cb.y), .16);
  col = mix(col, vec3(.08,.2,.15) + .03*noise(uv*40.), board);
  col += vec3(.8)*board*ss(.006,.0,abs(fract(cb.x*6.+cb.y*2.)-.5)-.48)*.08;
  // windows on the left
  float wx0 = -W*.5 + .05, wx1 = -W*.1;
  vec2 wq = vec2((uv.x - wx0)/(wx1 - wx0), (uv.y - .02)/.4);
  float win = step(0., wq.x)*step(wq.x, 1.)*step(0., wq.y)*step(wq.y, 1.);
  float frame = max(ss(.03,.0,abs(fract(wq.x*3.)-.5)-.47), ss(.04,.0,abs(wq.y-.5)-.47));
  vec3 skyc = mix(warm, uPal[4], wq.y);
  col = mix(col, mix(skyc*1.6, vec3(.15), frame), win);
  // curtains swaying
  float cx = wq.x*3.;
  float sway = fbm(vec2(wq.y*2., uTime*.4))*.3 + uKick*.05;
  float cur = step(fract(cx + .5) , .18 + sway*.3)*win;
  col = mix(col, uPal[3]*(.6 + .4*sin(cx*40.)), cur*.85);
  // god rays from the windows, falling to the right & down
  vec2 dir = normalize(vec2(1., -.55 - sun*.25));
  vec2 q = uv - vec2(wx0, .42);
  float along = dot(q, dir), across = dot(q, vec2(-dir.y, dir.x));
  float rays = ss(.0,.1,along)*exp(-along*.8) * (.5 + .5*step(.5, fract(across*7.5 + .2)))*ss(.35,.0,abs(across+.15));
  col += warm*rays*(.35 + uKick*.35 + uEnergy*.2);
  // dust motes in the beam
  vec2 dp = uv*22. + vec2(uTime*.2, -uTime*.15);
  vec2 dc = floor(dp);
  col += warm*ss(.06,.0,length(fract(dp)-hash22(dc)))*step(.9, hash12(dc))*rays*3.;
  col *= .85 + .3*sun;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#e9dcc5', '#ffb36b', '#ff7a45', '#a8805a', '#8fb8e8'],
  ['#e3e0d8', '#ffd28a', '#ff9d6b', '#8c7a6b', '#a7c8ff'],
  ['#efe2ea', '#ffc2a8', '#ff8aa0', '#9a8090', '#c3b6ff'],
]);

// ------------------------------------------------------------ 6. 深海のクラゲ
export const jellyfish = shaderTheme('jellyfish', '深海のクラゲ', 'Deep Jellyfish', '発光するクラゲが3Dで漂う深海。キックで傘を縮めて進む。', /* glsl */ `
vec3 jelly(vec2 p, float k, float seed){
  // bell
  float con = 1. - k*.28;
  vec2 b = p / vec2(.11*(1. + k*.1), .08*con);
  float r = length(b);
  float bell = ss(1., .9, r)*step(-.1, b.y);
  float rim = ss(.08,.0,abs(r-1.))*step(-.15, b.y);
  vec3 c = uPal[1 + int(mod(seed*3., 3.))];
  vec3 o = c*(bell*(.15 + .35*pow(r,3.)) + rim*.9);
  // tentacles
  for(int i=0;i<5;i++){
    float fi = float(i) - 2.;
    float x0 = fi*.035;
    float y = -p.y;
    if(y > 0. && y < .35){
      float x = x0 + sin(y*18. + uTime*2. + fi + seed*6.)*.015*(y*3.);
      o += c * ss(.006,.0,abs(p.x - x))*(1. - y/.35)*.7;
    }
  }
  return o;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[0]*.25, uPal[0], ss(-.6,.7,uv.y));
  col += uPal[0]*pow(fbm(uv*1.5 + uTime*.02), 3.)*.8;
  // marine snow
  for(int l=0;l<2;l++){
    vec2 sp = uv*(18. + float(l)*14.) + vec2(0., uTravel*(.4 + float(l)*.3));
    vec2 cc = floor(sp);
    col += vec3(.7,.85,1.)*ss(.08,.0,length(fract(sp)-hash22(cc)))*step(.85, hash12(cc))*.35;
  }
  // jellies at depths (far first)
  for(int i=0;i<7;i++){
    float fi = float(i);
    float z = .5 + 1.6*hash11(fi*3.1 + uV[0]*7.);
    float rise = fract(hash11(fi*7.) + uTravel*.03/z);
    vec2 c = vec2((hash11(fi*1.3+uV[1]*9.)-.5)*W*1.1 + sin(uTime*.2+fi)*.05, mix(-.75, .75, rise));
    float k = uKick*step(.4, hash11(fi*5.)) + uDropHit*.5;
    vec3 j = jelly((uv - c)*z, k, fi + uV[2]);
    col += j * (1.2/z) * (.6 + uEnergy*.6);
  }
  col *= 1. + uKick*.1;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#020d24', '#7af0ff', '#ff7ad9', '#b48cff', '#ffffff'],
  ['#05061a', '#9effc8', '#5fb7ff', '#ffd36b', '#ffffff'],
  ['#0d0420', '#ff9ccf', '#c9a7ff', '#7af0ff', '#ffffff'],
]);

// ------------------------------------------------------------ 7. 桜吹雪トンネル
export const sakura = shaderTheme('sakura', '桜吹雪トンネル', 'Sakura Tunnel', '花びらが舞うトンネルを駆け抜ける。BPMで速度、ドロップで花吹雪が爆発。', /* glsl */ `
float petal(vec2 p, float r){
  p.x = abs(p.x);
  float d = length(p*vec2(1.6, 1.)) - r;
  d = max(d, -(length(p - vec2(0., r*1.05)) - r*.35)); // notch
  return d;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float a = atan(uv.y, uv.x), r = length(uv);
  float speed = uBeat*.35;
  // tunnel walls: pink fog, brighter towards the end of the tunnel
  float depth = .25/(r + .02) + speed*4.;
  vec3 col = mix(uPal[0], uPal[1], ss(.9, .0, r));
  col += uPal[2]*pow(ss(.5,.0,r), 2.)*(.8 + uEnergy*.6);
  col += uPal[1]*.15*pow(noise(vec2(a*6., depth*.5)), 3.);
  // branches silhouettes
  col *= 1. - .35*step(.7, noise(vec2(a*3. + 1.7, depth*.3)))*ss(.2,.6,r);
  // petals on concentric layers
  float burst = uDropHit*1.5 + uDrop*.3;
  for(int l=0;l<14;l++){
    float fl = float(l);
    float z = fract(hash11(fl*7.13) - speed*(.08 + .02*hash11(fl)));
    float rad = mix(.04, 1.3, z*z)*(1. + burst*.6*z);
    float ang = a + fl*.9 + uTime*.15*(hash11(fl*3.)-.5);
    float cells = 7. + floor(hash11(fl*5.)*6.);
    float ca = fract(ang/6.2831*cells) - .5;
    vec2 p = vec2(ca*rad*6.2831/cells, r - rad);
    float rot = uTime*(1. + hash11(fl)) + fl;
    p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*p;
    float sz = .012 + .03*z;
    float d = petal(p, sz);
    float alpha = ss(.0,.15,z)*ss(1.,.85,z);
    vec3 pc = mix(uPal[3], uPal[4], hash11(fl*11.));
    col = mix(col, pc*(1.1 + uKick*.3), ss(.002,-.002,d)*alpha);
  }
  col += vec3(1.)*uDropHit*.3*ss(.6,0.,r);
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#2a0f2a', '#ff9ec7', '#ffe3ef', '#ffc2da', '#ffffff'],
  ['#1a1030', '#ffb7d5', '#fff0f6', '#ff8fbf', '#fff7fb'],
  ['#0f1428', '#ffc6e0', '#e6f0ff', '#ffd6e8', '#ffffff'],
]);

// ------------------------------------------------------------ 8. ワイヤーフレーム都市
export const wirecity = shaderTheme('wirecity', 'ワイヤーフレーム都市', 'Wireframe City', 'レトロなグリッド都市を飛ぶ。帯域ごとにビルの高さが伸び縮みする。', /* glsl */ `
float line(float d, float w){ return ss(w, 0., abs(d)); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float h0 = .0 + uV[0]*.06;
  float S = 6., trav = uBeat*S*.5;
  vec3 col = mix(uPal[0], uPal[0]*.3, ss(h0, .6, uv.y));
  // sun with stripes
  vec2 sp = uv - vec2(0., h0 + .18);
  float sun = ss(.2, .195, length(sp)) * step(0., sp.y + .02);
  sun *= step(.5, fract(sp.y*40. - uTime*.5)) + step(.06, sp.y);
  col = mix(col, mix(uPal[2], uPal[1], ss(-.02,.2,sp.y)), sun);
  col += uPal[1]*exp(-length(sp)*3.)*.4;
  // floor grid
  if(uv.y < h0){
    float z = .5/(h0 - uv.y);
    float x = uv.x*z;
    float gz = fract((z + trav)*.5), gx = fract(x*.5);
    float gw = fwidth(z + trav)*1.2, gxw = fwidth(x)*1.2;
    float g = max(ss(gw*.5, 0., min(gz, 1.-gz)*2.), ss(gxw*.5, 0., min(gx, 1.-gx)*2.));
    col = uPal[0]*.15 + uPal[3]*g*exp(-z*.06)*(1. + uKick*.6);
  }
  // wire buildings on both sides
  for(int i=0;i<16;i++){
    float k = floor(trav/S) + float(i) + 1.;
    float zr = k*S - trav;
    if(zr < .8) continue;
    for(int s=-1;s<=1;s+=2){
      float bandH = uBands[int(mod(k + float(s+1), 8.))];
      float bh = (1.2 + 3.5*hash11(k*1.7 + float(s))) * (.6 + bandH*.9);
      float xa = float(s)*3.2, xb = float(s)*(3.2 + 1.6 + hash11(k)*1.2);
      float sx0 = xa/zr*.5, sx1 = xb/zr*.5;
      float yb = h0 - .5/zr, yt = h0 + (bh - 1.)*.5/zr;
      float lo = min(sx0, sx1), hi = max(sx0, sx1);
      float inX = step(lo, uv.x)*step(uv.x, hi), inY = step(yb, uv.y)*step(uv.y, yt);
      float w = .0025 + .006/zr;
      float edges = (line(uv.x - lo, w) + line(uv.x - hi, w))*inY + (line(uv.y - yt, w) + line(uv.y - yb, w))*inX;
      float floors = line(fract((uv.y - yb)/(.25/zr)) - .5, .04)*inX*inY*.35;
      vec3 bc = mix(uPal[3], uPal[4], hash11(k*3.));
      col = mix(col, uPal[0]*.2, inX*inY*.7);
      col += bc*(min(edges, 1.) + floors)*exp(-zr*.03)*(.9 + uEnergy*.5);
    }
  }
  col += uPal[1]*uDropHit*.3;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0d0221', '#ff2a6d', '#ffd319', '#05d9e8', '#d1f7ff'],
  ['#08061a', '#ff6ec7', '#ffb86b', '#7a5cff', '#8ff0ff'],
  ['#020b14', '#00ffa3', '#e6ff6b', '#00b3ff', '#ffffff'],
]);

// ------------------------------------------------------------ 9. 星座ネットワーク
export const constellation = shaderTheme('constellation', '星座ネットワーク', 'Constellation Net', '星と星が線で結ばれて星座になる。音の立ち上がりごとに線がつながる。', /* glsl */ `
vec2 starPos(vec2 cell){ return cell + .2 + .6*hash22(cell + uV[0]*31.); }
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float rot = uTime*.01;
  uv = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*uv;
  vec3 col = uPal[0]*.6 + uPal[1]*pow(fbm(uv*1.4 + uV[1]*9.), 3.)*.6 + uPal[2]*pow(fbm(uv*2.3 + 5.), 4.)*.35;
  // background dust stars
  vec2 bp = uv*90.; vec2 bc = floor(bp);
  col += vec3(.8,.9,1.)*ss(.12,.0,length(fract(bp)-hash22(bc)))*step(.985, hash12(bc))*.6;
  // main stars on a grid
  vec2 g = uv*5.;
  vec2 cell = floor(g);
  float beatStep = floor(uBeat/2.);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 c = cell + vec2(x,y);
    vec2 sp = starPos(c);
    float tw = .7 + .3*sin(uTime*3. + hash12(c)*40.) + uHat*.6;
    float d = length(g - sp);
    float big = .5 + hash12(c+7.);
    col += mix(vec3(1.), uPal[3], .4) * (exp(-d*d*800./big)*1.5 + exp(-d*10.)*.08) * tw;
    // links to right and up neighbours
    for(int k=0;k<2;k++){
      vec2 nc = c + (k==0 ? vec2(1.,0.) : vec2(0.,1.));
      if(k==0 && hash12(c + .5) > .6) nc = c + vec2(1.,1.);
      float act = step(hash12(c*1.7 + nc + beatStep*.37 + uV[2]), .25 + uEnergy*.35 + uDrop*.2);
      if(act < .5) continue;
      float ld = segD(g, sp, starPos(nc));
      float grow = ss(0., .35, uBeatPhase + .3);
      col += uPal[3]*ss(.035, .0, ld)*.8*grow*(1. + uKick*.6);
      col += uPal[3]*exp(-ld*18.)*.12;
    }
  }
  col += uPal[4]*uDropHit*.2;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#030616', '#2b2e7a', '#6b2b7a', '#9fd8ff', '#ffffff'],
  ['#070312', '#4a1f6b', '#1f4a6b', '#ffd6a8', '#ffffff'],
  ['#020a10', '#0f3b5c', '#3b0f5c', '#b5ffe6', '#ffffff'],
]);

// ------------------------------------------------------------ 10. 液晶のにじみ
export const lcd = shaderTheme('lcd', '液晶のにじみ', 'LCD Bleed', '液晶の画素を超拡大。低音で画面が歪み、ドロップで画素が崩れ落ちる。', /* glsl */ `
vec3 picture(vec2 p){
  // plasma-ish image driven by the music
  float t = uTime*.3;
  float v = sin(p.x*3. + t) + sin(p.y*4. - t*1.3) + sin((p.x + p.y)*2.5 + t*.7) + fbm(p*2. + t)*2.;
  vec3 c = .5 + .5*cos(6.2831*(v*.15 + vec3(0., .33, .67) + uV[0]));
  c = mix(c, mix(uPal[1], uPal[2], c.r), .5);
  float bars = step(p.y*.5 + .5, spec(fract(p.x*.25 + .5))*.9);
  return mix(c, uPal[3], bars*.35);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float bass = (uBands[0] + uBands[1])*.5;
  vec2 w = uv*(1. + .25*bass*sin(length(uv)*8. - uTime*3.));
  float cellsY = 34. - uDrop*8.;
  vec2 g = w*cellsY;
  vec2 cell = floor(g), f = fract(g);
  // pixel collapse on drops: columns fall
  float fall = uDropHit*uDropHit*hash11(cell.x*1.3)*12.;
  cell.y += floor(fall); f.y = fract(f.y + fract(fall));
  vec3 img = picture(cell/cellsY + .5);
  // subpixels: R | G | B vertical stripes with gaps
  float sx = f.x*3.;
  int si = int(floor(sx));
  float sub = ss(.08,.18,fract(sx))*ss(.92,.82,fract(sx))*ss(.06,.14,f.y)*ss(.94,.86,f.y);
  vec3 m = si==0 ? vec3(1.,0.,0.) : si==1 ? vec3(0.,1.,0.) : vec3(0.,0.,1.);
  vec3 col = img*m*sub*2.2;
  // bloom-ish bleed between pixels
  col += img*.18*(1. + uKick*.6);
  col *= 1. + uKick*.15;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#05050a', '#ff4fa3', '#38e1ff', '#ffd23f', '#ffffff'],
  ['#050a08', '#7cff6b', '#4fb3ff', '#ff9d3c', '#ffffff'],
  ['#0a0510', '#c9a7ff', '#ff8fbe', '#9effc8', '#ffffff'],
]);
