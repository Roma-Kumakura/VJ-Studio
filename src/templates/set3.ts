import type { RenderEnv } from '../core/template';
import { shaderTheme } from './_make';

// ------------------------------------------------------------ 21. 夏祭りの屋台通り
export const yatai = shaderTheme('yatai', '夏祭りの屋台通り', 'Festival Stalls', '提灯と屋台の灯りが続く夜道。キックで提灯が揺れ、ドロップで花火が上がる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  float h0 = -.02;
  vec3 col = mix(uPal[0]*1.4, uPal[0]*.3, ss(h0, .6, uv.y));
  // fireworks on drops
  float fw = uDrop;
  for(int j=0;j<3;j++){
    float fj = float(j);
    float b = floor(uBeat/2.) - fj;
    float age = (uBeat/2. - b)*.9;
    vec2 c = vec2((hash11(b*1.7)-.5)*W*1.2, .25 + hash11(b*2.9)*.2);
    float R = (1. - exp(-age*2.5))*.22;
    vec2 p = uv - c; p.y += age*age*.05;
    float a = atan(p.y, p.x); float k = floor(a/(6.2831/32.) + .5); vec2 pp = vec2(cos(k*6.2831/32.), sin(k*6.2831/32.))*R;
    col += uPal[3 + int(mod(b, 2.))]*ss(.01,.0,length(p - pp))*exp(-age*1.5)*fw*1.5;
  }
  // ground path
  if(uv.y < h0){
    float z = .6/(h0 - uv.y);
    col = uPal[0]*.25 + .04*noise(vec2(uv.x*z*3., z*2. + uTravel));
    col += uPal[1]*.15*exp(-abs(uv.x*z)*.8)*exp(-z*.05);
  }
  float S = 4., trav = uTravel*1.6;
  for(int i=12;i>=0;i--){
    float k = floor(trav/S) + float(i) + 1.;
    float zr = k*S - trav;
    if(zr < .5) continue;
    float sc = .6/zr;
    float fog = exp(-zr*.05);
    for(int s=-1;s<=1;s+=2){
      // stall box
      vec2 p = (uv - vec2(0., h0))/sc - vec2(float(s)*2.6, 0.);
      float stall = step(abs(p.x), 1.)*step(-1., p.y)*step(p.y, .6);
      vec3 sc1 = mix(uPal[1], uPal[2], hash11(k*3. + float(s)));
      col = mix(col, sc1*(.55 + .3*sin(p.x*12.))*fog, stall);
      // noren curtain stripes
      float noren = step(abs(p.x), 1.)*step(.3, p.y)*step(p.y, .6)*step(.5, fract(p.x*4.));
      col = mix(col, vec3(.9,.9,.85)*fog, noren*.7);
      // lantern string above
      for(int l=0;l<3;l++){
        float fl = float(l);
        vec2 lp = p - vec2(-.7 + fl*.7 + sin(uTime*2. + k + fl)*.06*(1. + uKick*3.), 1.25 + .05*sin(fl*2. + k));
        float d = length(lp*vec2(1., .8));
        vec3 lc = mod(fl + k, 2.) < 1. ? uPal[3] : vec3(1.,.95,.85);
        col = mix(col, lc*(1.2 + uKick*.8)*fog, ss(.2, .17, d));
        col += lc*exp(-d*3.)*.25*fog*sc*3.;
      }
    }
  }
  // yo-yo balloons drifting
  for(int b=0;b<5;b++){
    float fb = float(b);
    vec2 c = vec2((hash11(fb*4.)-.5)*W*.9, -.35 + .03*sin(uTime*1.5 + fb));
    float d = length(c - uv);
    vec3 bc = uPal[1 + b%4];
    col = mix(col, bc*(.8 + .4*ss(.05,.0,length(uv - c - vec2(-.015,.015)))), ss(.045,.04,d));
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a0616', '#ff8a3d', '#ffd36b', '#e8383d', '#ff9ccf'],
  ['#060a18', '#ffb347', '#7af0ff', '#ff3d5a', '#ffe066'],
  ['#100610', '#ff6f6f', '#ffcf6b', '#ff2a6d', '#c9a7ff'],
]);

// ------------------------------------------------------------ 22. 浮世絵の大波
export const ukiyowave = shaderTheme('ukiyowave', '浮世絵の大波', 'Woodblock Wave', '木版画風の大波としぶき。低音で波が高くなり、スネアでしぶきが散る。', /* glsl */ `
float waveH(float x, float layer){
  float bass = (uBands[0] + uBands[1])*.5;
  float t = uTravel*(.3 + layer*.15);
  float A = (.12 + bass*.18*uIntensity)*(1. - layer*.25);
  return -.1 + layer*-.12 + A*(sin(x*2.2 + t) + .45*sin(x*4.7 - t*1.3) + .25*sin(x*9.1 + t*2.));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  // paper
  vec3 paper = uPal[0]*(.92 + .08*fbm(uv*30.)) - .04*noise(uv*vec2(300.,40.));
  vec3 col = paper;
  // red sun
  vec2 sp = uv - vec2(.45*(uV[0]-.3), .28);
  col = mix(col, uPal[3], ss(.13,.125,length(sp)));
  // clouds bands (flat)
  float cb = step(.6, fbm(vec2(uv.x*2. + uTravel*.05, uv.y*5.)))*step(.15, uv.y);
  col = mix(col, uPal[0]*.85, cb*.6);
  // three wave layers from back to front
  for(int l=2;l>=0;l--){
    float fl = float(l);
    float h = waveH(uv.x, fl);
    vec3 fill = mix(uPal[1], uPal[2], fl/2.);
    float inside = step(uv.y, h);
    // stripes inside the wave body (woodblock carving)
    float stripes = step(.5, fract((h - uv.y)*22. + sin(uv.x*6. + fl)*1.5));
    vec3 body = mix(fill, fill*1.25, stripes*.35*ss(.0,.15,h - uv.y));
    col = mix(col, body, inside);
    // outline
    col = mix(col, uPal[4], ss(.006,.0,abs(uv.y - h)));
    // foam claws on the crest
    vec2 fp = vec2(uv.x*40. + fl*7., (uv.y - h)*40.);
    vec2 fc = floor(fp);
    float foam = ss(.45,.3,length(fract(fp)-.5))*step(-.03, uv.y - h)*step(uv.y - h, .03 + uSnare*.04)*step(.35, hash12(fc + fl));
    col = mix(col, vec3(.98,.96,.9), foam);
  }
  // spray particles on snare
  vec2 sp2 = uv*vec2(30., 18.) + vec2(0., -uTime*1.5);
  vec2 sc2 = floor(sp2);
  col = mix(col, vec3(1.), ss(.2,.1,length(fract(sp2)-hash22(sc2)))*step(.9, hash12(sc2))*uSnare*step(-.1, uv.y));
  // print grain + border
  col *= .95 + .05*noise(gl_FragCoord.xy*.7);
  fragColor = vec4(finish(col*.95), 1.);
}`, [
  ['#efe4cf', '#24406e', '#3f6fa3', '#d64933', '#1b2236'],
  ['#ede0c8', '#1f4e5f', '#4f8f8f', '#c8553d', '#1b1b1b'],
  ['#f2e8d8', '#3b2f6b', '#6b5fa3', '#e07a5f', '#1d1a2e'],
]);

// ------------------------------------------------------------ 23. 霊峰と朝焼け
export const reiho = shaderTheme('reiho', '霊峰と朝焼け', 'Sacred Peak Dawn', '雲海に浮かぶ山と朝焼け。曲の進行で夜が明け、キックで光芒が差す。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float dawn = clamp(uProg*1.05 + uBuild*.1, 0., 1.);
  vec3 night = mix(uPal[0], uPal[0]*.3, ss(-.2,.6,uv.y));
  vec3 morn = mix(uPal[2], uPal[1], ss(-.15,.55,uv.y));
  vec3 col = mix(night, morn, dawn);
  vec2 sp = uv*90.; vec2 sc = floor(sp);
  col += vec3(1.)*ss(.12,.0,length(fract(sp)-hash22(sc)))*step(.986, hash12(sc))*(1. - dawn);
  // light rays from behind the mountain
  vec2 sun = vec2(.05 + .2*(uV[0]-.5), -.02 + dawn*.12);
  float a = atan(uv.y - sun.y, uv.x - sun.x);
  col += uPal[3]*pow(noise(vec2(a*12., uTime*.1)), 3.)*ss(-.05,.3,uv.y - sun.y)*(dawn*.4 + uKick*.6)*.7;
  // mountain silhouette (one broad cone + noise), snow cap
  float x = uv.x - .1*(uV[1]-.5);
  float m = .3 - abs(x)*.55 - .03*fbm1(x*8. + uV[2]*10.);
  m = min(m, .22 - abs(x)*.25*.0 + .0);
  float mt = .3 - abs(x)*.6;
  float ridge = max(mt + .02*fbm1(x*20.), -.12 + .06*fbm1(x*3. + 4.));
  if(uv.y < ridge){
    vec3 mc = mix(uPal[4]*.4, uPal[4]*.15, 1. - dawn);
    float snow = ss(ridge - .1, ridge - .08, uv.y)*step(.15, uv.y);
    mc = mix(mc, mix(vec3(.75,.8,.9), uPal[2]*1.2, dawn), snow*ss(.0,.2,uv.y));
    mc += uPal[3]*ss(.02,.0,ridge - uv.y)*dawn*.5;
    col = mc;
  }
  // sea of clouds
  float cy = -.15 + .05*fbm(vec2(uv.x*3. + uTravel*.05, 0.));
  if(uv.y < cy + .05){
    float z = .3/(cy + .06 - uv.y);
    float d = fbm(vec2(uv.x*z, z + uTravel*.2)*.8);
    vec3 cc = mix(mix(uPal[0]*.6, vec3(.95), dawn*.9), mix(uPal[2], vec3(1.), .4), d*dawn);
    col = mix(col, cc*(.6 + .6*d), ss(cy + .05, cy - .02, uv.y));
  }
  col += uPal[3]*uDropHit*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a0f2b', '#ffd9b8', '#ff9e7a', '#ffcf8a', '#3a3f5c'],
  ['#120a28', '#ffe0ec', '#ff8fab', '#ffd6a8', '#3d3350'],
  ['#061420', '#d8f0ff', '#8fc8ff', '#ffe8a8', '#2c3e50'],
]);

// ------------------------------------------------------------ 24. 竹林の月夜
export const bamboo = shaderTheme('bamboo', '竹林の月夜', 'Moonlit Bamboo', '月明かりの竹林が風に揺れる。帯域で竹がしなり、ハイハットでホタルが舞う。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[0]*1.3, uPal[0]*.3, ss(-.5,.6,uv.y));
  vec2 moon = vec2(.35*(uV[0]-.5)*W, .3);
  col += uPal[3]*exp(-length(uv - moon)*3.)*.5;
  col = mix(col, uPal[3]*1.2, ss(.07,.065,length(uv - moon)));
  // bamboo layers far -> near
  for(int l=3;l>=0;l--){
    float fl = float(l);
    float dens = 4. + fl*3.;
    float sway = (uBands[l] *.08 + .02*sin(uTime*.7 + fl))*(1. + uDrop*.5);
    float x = uv.x + sway*(uv.y + .6)*(uv.y + .6) + fl*1.7 + uV[1]*5.;
    float id = floor(x*dens);
    float fx = fract(x*dens);
    float wdt = .12 + .1*hash11(id + fl*9.);
    float stalk = ss(wdt, wdt*.8, abs(fx - .5));
    float nodes = ss(.03,.0,abs(fract(uv.y*(3. + fl) + hash11(id)) - .5) - .47);
    vec3 bc = mix(uPal[1], uPal[2], .3 + .7*(fx));
    bc *= .25 + .55*(1. - fl/4.)*(.6 + .4*ss(.5,.0,abs(fx - .35)));
    bc = mix(bc, bc*.5, nodes);
    float present = step(.25, hash11(id*3.1 + fl));
    col = mix(col, bc + uPal[3]*.05*(1.-fl/4.), stalk*present);
    // leaves
    vec2 lp = vec2(x*dens*3., uv.y*12. + fl*4.);
    vec2 lc = floor(lp);
    float leaf = ss(.3,.2,length((fract(lp) - .5)*vec2(1., 3.)))*step(.82, hash12(lc + fl))*ss(-.1,.3,uv.y);
    col = mix(col, uPal[1]*.3*(1.-fl/4.), leaf);
  }
  // fireflies
  for(int i=0;i<16;i++){
    float fi = float(i);
    vec2 p = vec2((hash11(fi*3.)-.5)*W, (hash11(fi*7.)-.5)*.8) + vec2(sin(uTime*.5 + fi), cos(uTime*.4 + fi*2.))*.08;
    float on = step(hash11(fi*5.), .3 + uHat*.7);
    float tw = .5 + .5*sin(uTime*3. + fi*5.);
    float d = length(uv - p);
    col += uPal[4]*(exp(-d*d*4000.)*1.5 + exp(-d*25.)*.25)*on*tw;
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#06101c', '#5f9e6e', '#a8d8a0', '#f4f1d8', '#e6ff8a'],
  ['#0a0a1a', '#4f8a7a', '#9fd8c0', '#ffe8c0', '#b9ff6b'],
  ['#08121a', '#6b9e5a', '#c8e8a0', '#d8e8ff', '#fff38a'],
]);

// ------------------------------------------------------------ 25. 枯山水
export const karesansui = shaderTheme('karesansui', '枯山水', 'Zen Garden', '白砂の砂紋を真上から。低音で砂紋が波打ち、キックで同心円が広がる。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  // stones
  vec2 st[3] = vec2[3](vec2(-.45*W*.6, .12), vec2(.35*W*.5, -.15), vec2(.05, .25));
  float rs[3] = float[3](.09, .12, .06);
  float bass = (uBands[0] + uBands[1])*.5;
  float field = uv.y + .05*sin(uv.x*2. + uV[0]*6.);
  float nearest = 1e9; int ni = -1;
  for(int i=0;i<3;i++){
    vec2 s = st[i] + vec2(uV[i]-.5, uV[i+3]-.5)*.1;
    float d = length(uv - s);
    if(d < rs[i]*2.6 && d < nearest){ nearest = d; ni = i; }
  }
  float phase = (ni >= 0 ? nearest : field) * 70.;
  phase += bass*2.5*sin(uTime*1.5 + (ni >= 0 ? nearest : field)*6.);
  // kick rings expanding from the first stone
  vec2 s0 = st[0] + vec2(uV[0]-.5, uV[3]-.5)*.1;
  float rr = length(uv - s0) - uBeatPhase*.9;
  phase += uKick*sin(rr*40.)*exp(-abs(rr)*8.)*3.;
  float ridge = sin(phase);
  float shade = cos(phase);
  vec3 sand = uPal[0]*(.92 + .08*noise(uv*200.));
  vec3 col = sand*(.88 + .12*ridge) + uPal[1]*.05*shade;
  // stones on top
  for(int i=0;i<3;i++){
    vec2 s = st[i] + vec2(uV[i]-.5, uV[i+3]-.5)*.1;
    vec2 p = (uv - s)/rs[i];
    float d = length(p*vec2(1., 1.25)) - 1. + .12*fbm(p*3. + float(i));
    vec3 sc = mix(uPal[2], uPal[2]*.5, ss(-1.,.5,p.y)) + .1*noise(p*8.);
    col *= 1. - .35*ss(.35,.0,length((uv - s - vec2(.02,-.02))/rs[i]) - 1.); // shadow
    col = mix(col, sc, ss(.02,-.02,d));
    col = mix(col, uPal[3], ss(.08,.0,abs(d + .05))*step(0., p.y)*.6); // moss
  }
  // falling maple/sakura leaf on drops
  col += uPal[4]*uDropHit*.15;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#e8e2d4', '#8a8070', '#5a5650', '#6b8f4e', '#ffffff'],
  ['#e9e6df', '#7a8a90', '#4a4a50', '#5a7a4a', '#ffffff'],
  ['#efe6d8', '#a08870', '#6b5a50', '#7a9a5a', '#ffe8d0'],
]);

// ------------------------------------------------------------ 26. 新幹線の夜
export const shinkansen = shaderTheme('shinkansen', '新幹線の夜', 'Night Bullet Train', '夜の高架を光の帯になって駆け抜ける列車。ドロップでトンネルへ。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[0]*1.2, uPal[0]*.3, ss(-.3,.6,uv.y));
  // city lights bokeh far away
  vec2 bp = uv*vec2(14., 10.) + vec2(uTravel*.2, 0.);
  vec2 bc = floor(bp);
  col += mix(uPal[2], uPal[3], hash12(bc))*ss(.3,.15,length(fract(bp)-hash22(bc)))*step(.6, hash12(bc+3.))*step(uv.y, .05)*.25;
  // viaduct
  float deck = -.18;
  col = mix(col, uPal[0]*.15, step(uv.y, deck)*step(deck - .06, uv.y));
  for(int i=-6;i<7;i++){
    float px = float(i)*.45 - mod(uTravel*.6, .45);
    col = mix(col, uPal[0]*.12, ss(.03,.02,abs(uv.x - px))*step(uv.y, deck - .06));
  }
  // catenary poles every beat
  float D = W*.6;
  float lp = mod(uv.x + uBeat*D, D) - D*.5;
  col = mix(col, uPal[0]*.08, ss(.012,.006,abs(lp))*step(deck, uv.y)*step(uv.y, .2));
  col = mix(col, uPal[0]*.1, ss(.003,.0,abs(uv.y - .18 + .02*cos(lp*3.))));
  // the train: a long light band with windows, passing every 2 bars
  float cyc = fract(uBar/2.);
  float head = mix(W*.9, -W*3., cyc);
  float tx = uv.x - head;
  float body = step(0., tx)*step(tx, W*2.2)*step(deck, uv.y)*step(uv.y, deck + .09);
  float nose = ss(.0,.06,tx)*step(uv.y, deck + .09*ss(-.0,.12,tx));
  vec3 tc = mix(vec3(.92,.94,1.), uPal[1], ss(deck + .03, deck + .02, uv.y)*ss(deck + .045, deck + .055, uv.y));
  float win = step(.4, fract(tx*20.))*step(deck + .05, uv.y)*step(uv.y, deck + .075);
  tc = mix(tc, uPal[3]*1.4, win);
  col = mix(col, tc*(1. + uKick*.3), body*nose);
  col += vec3(.9,.95,1.)*exp(-abs(uv.y - deck - .045)*30.)*body*.15;
  // motion streaks behind
  col += uPal[1]*step(tx, 0.)*exp(tx*3.)*ss(.05,.0,abs(uv.y - deck - .04))*step(-W*2., tx)*.6;
  // tunnel on drops
  float tun = uDrop;
  if(tun > .01){
    float r = length(uv*vec2(.8, 1.));
    vec3 tcol = vec3(.02);
    float rings = pow(1. - abs(fract(.3/(r + .05) + uTravel*1.5) - .5)*2., 18.);
    tcol += uPal[3]*rings*ss(.2,.6,r)*1.4;
    col = mix(col, tcol + col*.3*step(r, .15), tun);
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#050818', '#3a7bff', '#ffd36b', '#ff8a3d', '#ffffff'],
  ['#08060f', '#2fb8ff', '#ff7ad9', '#ffb347', '#ffffff'],
  ['#020a0a', '#00c2a8', '#ffe066', '#ff6f6f', '#ffffff'],
]);

// ------------------------------------------------------------ 27. 墨と和紙
export const sumi = shaderTheme('sumi', '墨と和紙', 'Sumi Ink', '和紙に墨の筆致がにじんで広がる。音の立ち上がりで筆が走り、低音でにじむ。', /* glsl */ `
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
vec2 strokeP(float k, float u){
  float W = uRes.x/uRes.y;
  vec2 a = vec2((hash11(k*1.3)-.5)*W*1.2, (hash11(k*2.7)-.5)*.8);
  vec2 b = a + vec2((hash11(k*3.1)-.5)*1.2, (hash11(k*4.9)-.5)*.6);
  vec2 c = mix(a, b, .5) + vec2((hash11(k*6.1)-.5), (hash11(k*7.3)-.5))*.5;
  return mix(mix(a, c, u), mix(c, b, u), u);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  // washi
  vec3 col = uPal[0]*(.95 + .05*fbm(uv*12.));
  col -= .05*pow(noise(uv*vec2(40., 400.) + 3.), 6.);
  col -= .04*pow(noise(uv*vec2(300., 30.)), 8.);
  float bleed = .004 + (uBands[0] + uBands[1])*.006*uIntensity;
  float beatSec = 60./max(uBpm, 40.);
  for(int j=0;j<7;j++){
    float k = floor(uBeat/2.) - float(j);
    float age = (uBeat/2. - k)*beatSec*2.;
    float prog = clamp(age/.5, 0., 1.);
    float fade = exp(-float(j)*.35);
    float d = 1e9; float uAt = 0.;
    vec2 prev = strokeP(k, 0.);
    for(int s=1;s<=14;s++){
      float u = float(s)/14.;
      if(u > prog + .07) break;
      vec2 cur = strokeP(k, u);
      float sd = segD(uv, prev, cur);
      if(sd < d){ d = sd; uAt = u; }
      prev = cur;
    }
    float width = (.012 + .03*sin(uAt*3.1416)*(.6 + hash11(k)*.8))*(1. - uAt*.4);
    float edge = fbm(uv*60. + k)*bleed*6.;
    float ink = ss(width + edge, width*.6, d);
    float dry = step(.35, noise(uv*vec2(200., 30.) + k))*ss(.6, 1., uAt);
    vec3 inkc = mix(uPal[1], uPal[2], float(j)/7.);
    col = mix(col, inkc, ink*fade*(1. - dry*.5));
  }
  // red seal
  vec2 sp = uv - vec2(uRes.x/uRes.y*.42, -.36);
  float seal = step(abs(sp.x), .035)*step(abs(sp.y), .035);
  float carve = step(.5, noise(sp*80. + uV[0]*9.))*step(abs(sp.x), .026)*step(abs(sp.y), .026);
  col = mix(col, uPal[3], seal*(1. - carve*.8)*(.85 + uKick*.15));
  fragColor = vec4(finish(col*1.02), 1.);
}`, [
  ['#f1ebdd', '#121212', '#5a5a5a', '#c0392b', '#ffffff'],
  ['#efe6d6', '#1a1f2e', '#5a6680', '#b03a2e', '#ffffff'],
  ['#f4eee6', '#20150f', '#6b5040', '#d1453b', '#ffffff'],
]);

// ------------------------------------------------------------ 28. 紅葉の渓流
export const momiji = shaderTheme('momiji', '紅葉の渓流', 'Maple Stream', '紅葉が流れる渓流と木漏れ日。エネルギーで流れが速まり、ハイハットで葉が舞う。', /* glsl */ `
float leaf(vec2 p, float s){
  float a = atan(p.y, p.x), r = length(p)/s;
  float lobes = .55 + .45*pow(abs(cos(a*2.5)), .6);
  return r - lobes;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  float flow = uTravel*(.25 + uEnergy*.4);
  // banks (stones / moss) and water channel
  float cx = .15*sin(uv.y*2. + uV[0]*6.);
  float wdt = .55 + .1*sin(uv.y*3.);
  float inWater = ss(wdt, wdt - .03, abs(uv.x - cx));
  vec3 bank = mix(uPal[3], uPal[3]*.5, fbm(uv*8.)) ;
  vec2 wp = vec2((uv.x - cx)*3., uv.y*1.5 + flow);
  float streaks = fbm(vec2(wp.x*2., wp.y*.6)) + .3*noise(vec2(wp.x*8., wp.y*3.));
  vec3 water = mix(uPal[0], uPal[0]*1.6, streaks) + vec3(1.)*pow(noise(vec2(wp.x*6., wp.y*2.)), 6.)*.4;
  vec3 col = mix(bank, water, inWater);
  // dappled sunlight
  float dap = pow(fbm(uv*3. + vec2(uTime*.05, 0.)), 3.)*3.;
  col *= .7 + .6*dap*(.6 + uKick*.4);
  // floating leaves along the flow
  for(int i=0;i<14;i++){
    float fi = float(i);
    float y = fract(hash11(fi*2.3) - flow*.25*(.7 + hash11(fi)*.6))*1.4 - .7;
    vec2 c = vec2(cx + (hash11(fi*5.)-.5)*wdt*1.6 + .03*sin(uTime + fi), -y);
    vec2 p = uv - c;
    float rot = uTime*.6*(hash11(fi*7.)-.5)*2. + fi;
    p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*p;
    float d = leaf(p, .035 + .02*hash11(fi*3.));
    vec3 lc = mix(uPal[1], uPal[2], hash11(fi*9.));
    col *= 1. - .3*ss(.05,.0,leaf(p + vec2(.01,-.01), .04));
    col = mix(col, lc*(.9 + uKick*.2), ss(.02, -.02, d));
  }
  // leaves fluttering down (hats)
  for(int i=0;i<8;i++){
    float fi = float(i);
    float t = fract(uTime*.15 + hash11(fi*4.));
    vec2 c = vec2((hash11(fi*6.)-.5)*W + sin(t*12. + fi)*.08, .6 - t*1.3);
    float on = step(hash11(fi*3.3), .3 + uHat*.7);
    float d = leaf((uv - c)*mat2(cos(t*9.), sin(t*9.), -sin(t*9.), cos(t*9.)), .03);
    col = mix(col, uPal[2]*1.1, ss(.02,-.02,d)*on);
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#1f4a5a', '#e8432d', '#ff9a3c', '#3f5f2f', '#ffffff'],
  ['#1a3f4f', '#d6283a', '#ffc04a', '#4a5f35', '#ffffff'],
  ['#25475a', '#ff6b3d', '#ffd36b', '#5a6b3a', '#ffffff'],
]);

// ------------------------------------------------------------ 29. 電気街ネオン
const SIGNS = ['ミライデンキ', 'ネオンドウ', 'ピコピコ堂', 'メモリー館', 'ホシゾラ無線', 'ユメノパーツ', 'ヨルノゲーム', 'カクテル電脳'];
function signAtlas(_env: RenderEnv) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  SIGNS.forEach((name, i) => {
    const chars = [...name];
    const size = Math.min(110, 1000 / chars.length);
    g.font = `900 ${size}px "Dela Gothic One", "Hiragino Sans", "Noto Sans JP", sans-serif`;
    chars.forEach((ch, j) => g.fillText(ch, i * 128 + 64, 512 - (chars.length - 1) * size * 0.5 + j * size));
  });
  return c;
}
export const denkigai = shaderTheme('denkigai', '電気街ネオン', 'Neon Electric Town', 'カタカナのネオン看板が並ぶ路地（店名は架空）。拍で看板が点滅し、スネアでちらつく。', /* glsl */ `
uniform sampler2D uSigns;
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float h0 = -.05;
  vec3 col = mix(uPal[0]*1.5, uPal[0]*.3, ss(h0, .6, uv.y));
  if(uv.y < h0){
    float z = .5/(h0 - uv.y);
    col = uPal[0]*.2 + .03*noise(vec2(uv.x*z*4., z*2. + uTravel));
  }
  float S = 3.2, trav = uTravel*1.4;
  for(int i=12;i>=0;i--){
    float k = floor(trav/S) + float(i) + 1.;
    float zr = k*S - trav;
    if(zr < .6) continue;
    float sc = .55/zr;
    float fog = exp(-zr*.05);
    for(int s=-1;s<=1;s+=2){
      vec2 p = (uv - vec2(0., h0))/sc - vec2(float(s)*1.9, 2.2);
      // wall
      float wall = step(1.6, abs(p.x + float(s)*1.9)) ;
      // vertical sign box
      float sx = abs(p.x), sy = abs(p.y);
      float box = step(sx, .32)*step(sy, 1.6);
      float idx = mod(k*2. + float(s+1)/2., 8.);
      vec3 nc = uPal[1 + int(mod(k + float(s), 4.))];
      float blink = step(.25, fract(uBeat*.5 + hash11(k*3. + float(s))))*(1. - uSnare*step(.5, hash11(k + float(s) + floor(uTime*20.)))*.8);
      vec2 tuv = vec2((idx + .5 + p.x/.64)/8., .5 + p.y/3.2*.98);
      float txt = texture(uSigns, tuv).a;
      col = mix(col, uPal[0]*.25*fog, box);
      col += nc*txt*box*blink*(1.4 + uKick*.6)*fog;
      col += nc*exp(-max(max(sx - .32, sy - 1.6), 0.)*3.)*.18*blink*fog*sc*4.;
      col += nc*ss(.04,.0,abs(max(sx - .32, sy - 1.6)))*fog*blink;
    }
  }
  // wires overhead
  col = mix(col, uPal[0]*.1, ss(.003,.0,abs(uv.y - .42 - .03*cos(uv.x*2.)))*.8);
  col += uPal[2]*uDropHit*.25;
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#07050f', '#ff2a6d', '#05d9e8', '#ffd319', '#b48cff'],
  ['#05080f', '#ff6ec7', '#7af0ff', '#ff9d3c', '#9effc8'],
  ['#0a0508', '#ff4f4f', '#ffe066', '#4fe3ff', '#ff8fe0'],
], (env) => ({ uSigns: signAtlas(env) }));

// ------------------------------------------------------------ 30. 雪国の夜
export const yukiguni = shaderTheme('yukiguni', '雪国の夜', 'Snow Country Night', 'しんしんと雪が降る里と窓の灯り。エネルギーで雪が増え、ドロップで吹雪に。', /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  vec3 col = mix(uPal[0]*1.5, uPal[0]*.4, ss(-.3,.6,uv.y));
  vec2 moon = vec2(-.3*W*(uV[0]-.3), .32);
  col += uPal[3]*exp(-length(uv - moon)*4.)*.35;
  col = mix(col, uPal[3], ss(.05,.045,length(uv - moon)));
  // far mountains
  float m1 = -.02 + .12*fbm1(uv.x*1.2 + uV[1]*10.);
  col = mix(col, mix(uPal[1]*.7, uPal[0]*.8, .4), step(uv.y, m1));
  // snowy hills
  float m2 = -.2 + .06*sin(uv.x*1.5 + uV[2]*6.) + .03*fbm1(uv.x*4.);
  vec3 snowc = mix(uPal[1]*.9, uPal[1]*.6, ss(m2, m2 - .4, uv.y));
  if(uv.y < m2) col = snowc;
  // houses with warm windows and snow roofs
  for(int i=0;i<7;i++){
    float fi = float(i);
    float hx = (hash11(fi*3.+uV[3]*7.)-.5)*W*1.4;
    float base = -.2 + .06*sin(hx*1.5 + uV[2]*6.) + .03*fbm1(hx*4.) - .01;
    float s = .07 + .04*hash11(fi*5.);
    vec2 p = (uv - vec2(hx, base))/s;
    float wall = step(abs(p.x), 1.)*step(0., p.y)*step(p.y, .9);
    float roof = step(p.y, .9 + (1.3 - abs(p.x))*.75)*step(.9, p.y)*step(abs(p.x), 1.3);
    col = mix(col, uPal[0]*.35, wall);
    col = mix(col, uPal[1]*1.05, roof);
    vec2 wq = abs(p - vec2(.35*(hash11(fi)>.5 ? 1. : -1.), .45));
    float win = step(wq.x, .22)*step(wq.y, .2);
    float lit = .8 + .2*sin(uTime*2. + fi) + uKick*.4;
    col = mix(col, uPal[2]*lit, win*wall);
    col += uPal[2]*exp(-length(p - vec2(0.,.45))*1.2)*.12*lit;
  }
  // snowfall: 3 depth layers; amount = energy; drop = blizzard
  float amt = .25 + uEnergy*.5 + uDrop*.3;
  float wind = .2 + uDrop*2.5;
  for(int l=0;l<3;l++){
    float fl = float(l);
    float sc = 10. + fl*12.;
    vec2 sp = uv*sc + vec2(uTime*wind*(1. + fl*.5), uTime*(1.2 + fl*.6));
    sp.x += sin(sp.y*.3 + fl)*.5;
    vec2 cell = floor(sp);
    float on = step(hash12(cell + fl*31.), amt);
    float d = length(fract(sp) - hash22(cell));
    col += vec3(1.)*ss(.12 - fl*.03, .0, d)*on*(.9 - fl*.2);
  }
  fragColor = vec4(finish(col), 1.);
}`, [
  ['#0a1430', '#dfe8f5', '#ffb35c', '#f5f1dc', '#ffffff'],
  ['#120f2a', '#e6e2f5', '#ffc27a', '#ffeccc', '#ffffff'],
  ['#061a24', '#d8f0f0', '#ff9d5c', '#e8fff8', '#ffffff'],
]);
