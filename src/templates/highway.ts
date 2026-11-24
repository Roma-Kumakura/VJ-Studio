import { createShaderInstance } from '../core/gl';
import type { TemplateDef } from '../core/template';

// 夜の首都高 — driver's view on an elevated expressway at night.
const frag = /* glsl */ `
float glow(vec2 p, vec2 c, float r){ vec2 d=p-c; return exp(-dot(d,d)/(r*r)); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  // rumble
  uv.y += (noise(vec2(uTime*30., 1.))-.5)*.004*(1.+uKick*2.);
  float h0 = .04 + uV[0]*.06;
  float S = 9.;                       // lamp spacing (one lamp per beat)
  float travel = uBeat*S;
  float tun = uDrop * step(.25, uV[3]); // tunnel during drops (most seeds)
  vec3 lampC = uPal[2], tailC = vec3(1.,.12,.08), skyTop = uPal[0], skyBot = uPal[1];

  vec3 col = vec3(0.);
  if(uv.y > h0){
    float y = uv.y - h0;
    col = mix(skyBot*1.4, skyTop, ss(0., .5, y));
    // skyline
    float bx = uv.x*7. + uBeat*.02 + uV[1]*100.;
    float id = floor(bx);
    float bh = .03 + pow(hash11(id), 2.)*.22 + .05*hash11(id*3.1);
    float far = .5 + .5*sin(id);
    if(y < bh){
      vec3 bc = mix(skyBot*.25, skyTop*.4, far*.3);
      vec2 wg = vec2(fract(bx)*8., y*90.);
      vec2 wi = floor(wg);
      float lit = step(.62 - uEnergy*.25, hash12(wi + id*7.));
      float win = ss(.42, .3, abs(fract(wg.x)-.5)) * ss(.4, .25, abs(fract(wg.y)-.5));
      bc += uPal[3] * win * lit * (.55 + .3*hash12(wi+id));
      col = bc;
      // aviation lights
      col += vec3(1.,.1,.1) * glow(vec2(fract(bx), y), vec2(.5, bh), .012) * step(.75, hash11(id*5.)) * (.5+.5*sin(uTime*3.+id));
    }
    col += skyBot * .25 * ss(.2, 0., y);
  } else {
    // road plane
    float z = .9 / (h0 - uv.y);
    float x = uv.x * z;
    float wz = z + travel;
    vec3 asphalt = vec3(.025,.027,.035) + .02*noise(vec2(x*3., wz*2.));
    col = asphalt;
    float aa = fwidth(x)*1.5;
    // lane markings
    for(int i=-1;i<=1;i+=2){
      float lx = float(i)*1.7;
      float dash = step(.5, fract(wz/6.));
      col += vec3(.8) * ss(.08+aa, .08, abs(x-lx)) * dash * .5;
    }
    col += vec3(.9,.8,.5) * ss(.1+aa, .1, abs(abs(x)-4.)) * .5;
    // barrier walls
    float wall = ss(4.3, 4.35, abs(x));
    col = mix(col, vec3(.06,.06,.08) + lampC*.05, wall);
    col *= exp(-z*.012);
  }

  // street lamps passing on every beat (both sides) + wet road reflections
  float fl = 1. + uSnare*.8;
  for(int i=0;i<18;i++){
    float k = floor(travel/S) + float(i) + 1.;
    float zr = k*S - travel;
    if(zr < .6) continue;
    float lh = 1.9;
    for(int s=-1;s<=1;s+=2){
      float sx = float(s)*3.8 / zr * .9;
      float sy = h0 + (lh)/zr*.9;
      float r = .05/zr + .003;
      float g = glow(uv, vec2(sx, sy), r) * 1.6 + glow(uv, vec2(sx, sy), r*5.)*.25;
      col += lampC * g * fl * (1.-tun);
      if(uv.y < h0){
        float ry = h0 - (lh+.9)/zr*.9;
        float streak = exp(-pow((uv.x-sx)/(r*2.5),2.)) * exp(-abs(uv.y-ry)/(r*12.+.02));
        col += lampC * streak * .35 * fl * (1.-tun);
      }
    }
  }

  // tail lights of cars ahead
  for(int j=0;j<4;j++){
    float fj = float(j);
    float zc = 14. + fj*13. + 6.*sin(uTime*.23 + fj*2. + uV[2]*6.);
    float lane = (mod(fj, 3.) - 1.)*3.2 + 1.6;
    float cx = lane/zc*.9, cy = h0 - .7/zc*.9;
    float r = .03/zc + .002;
    float br = 1. + uKick*1.5;
    vec3 tl = tailC * br * (glow(uv, vec2(cx-.55/zc, cy), r) + glow(uv, vec2(cx+.55/zc, cy), r));
    tl += tailC * .15 * glow(uv, vec2(cx, cy), r*8.);
    col += tl;
    if(uv.y < cy) col += tailC*.2*exp(-pow((uv.x-cx)/(.9/zc),2.))*exp(-(cy-uv.y)*25.);
  }

  // tunnel (drop)
  if(tun > .001){
    vec2 d = uv - vec2(0., h0);
    float Wt = 4.6, Ht = 2.3, ch = .9;
    float zw = Wt/max(abs(d.x),1e-4);
    float zc = d.y > 0. ? Ht/max(d.y,1e-4) : ch/max(-d.y,1e-4);
    float zz = min(zw, zc)*.9;
    float wzz = zz + travel*1.0;
    vec3 tc = vec3(.03,.025,.02);
    float isCeil = step(zc, zw) * step(0., d.y);
    // ceiling sodium strips + side wall bands
    float strip = ss(.35, .0, abs(fract(wzz/ (S*.5)) - .5)*2.) ;
    vec3 sod = mix(vec3(1.,.55,.15), uPal[2], .35);
    tc += sod * isCeil * ss(.25, .0, abs(d.x*zz/Wt)) * pow(1.-abs(fract(wzz/(S*.5))-.5)*2., 12.) * 2.5;
    tc += sod * (1.-isCeil) * step(0., d.y) * .2 * strip;
    float band = step(.5, fract(wzz/3.)) * (1.-isCeil) * step(zw, zc);
    tc += uPal[3] * band * .06;
    tc *= exp(-zz*.02) * (1. + uKick*.6);
    // keep the road surface & cars visible in the lower part
    float roadMask = step(d.y, 0.) * step(zc, zw);
    col = mix(col, mix(tc, col + tc*.6, roadMask), tun);
  }

  // speed lines on drops
  vec2 dv = uv - vec2(0., h0);
  float a = atan(dv.y, dv.x);
  float sl = pow(noise(vec2(a*40., length(dv)*2. - uBeat*4.)), 8.) * ss(.2, 1., length(dv));
  col += uPal[4] * sl * (uDrop*.9 + uBuild*.4) * 1.5;

  // rain on windshield (hi-hats)
  vec2 rp = uv*vec2(14., 9.);
  rp.y += uTime*.05;
  vec2 rc = floor(rp); vec2 ro = hash22(rc + floor(uTime*.4 + hash12(rc)*3.));
  vec2 rq = fract(rp) - ro;
  float rr = .06 + .08*hash12(rc+3.);
  float drop = ss(rr, rr*.6, length(rq*vec2(1.,1.2)));
  float rainAmt = (.25 + uHat*.7) * (uV[4] > .3 ? 1. : .3);
  float showDrop = step(hash12(rc+5.), rainAmt);
  col = mix(col, col*.6 + skyBot*.25 + .06, drop*showDrop*.7);
  col += vec3(.9) * ss(.05, .0, length(rq - vec2(-rr*.3, rr*.3))) * showDrop * drop * .4;

  col += uPal[4] * uSnare * .08;
  col += uPal[4] * uDropHit * .4;
  fragColor = vec4(finish(col*1.2), 1.);
}
`;

export const highway: TemplateDef = {
  id: 'highway',
  name: '夜の首都高',
  nameEn: 'Night Drive',
  tagline: '街灯がビートごとに通過。スネアで閃光、ドロップでトンネルへ突入。',
  params: [],
  overlayDefault: true,
  create: (env) => createShaderInstance(env, {
    frag,
    palettes: [
      ['#05040f', '#2a1340', '#ffb86b', '#ffd37a', '#ff5fa2'],
      ['#02060f', '#0c2a4a', '#bfe6ff', '#9ff', '#6cf'],
      ['#0a0310', '#3b0f3f', '#ff8fd0', '#ffd0f0', '#b48cff'],
      ['#030608', '#123030', '#9effc8', '#e6ff9e', '#5fffd7'],
    ],
  }),
};
