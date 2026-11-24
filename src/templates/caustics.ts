import { createShaderInstance } from '../core/gl';
import type { TemplateDef } from '../core/template';

// 水底のコースティクス — looking up from under the water surface.
const frag = /* glsl */ `
float voro(vec2 p, float t){
  vec2 i=floor(p), f=fract(p); float d1=8., d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y); vec2 o=hash22(i+g);
    o=.5+.42*sin(t+TAU*o);
    vec2 r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }
  }
  return sqrt(d2)-sqrt(d1);
}
float caustic(vec2 p, float t, float sharp){
  float e = voro(p, t);
  return pow(1.-ss(0., .32, e), sharp);
}
float bubbles(vec2 uv, float t, float scale, float dens, float seed){
  vec2 p = uv*scale; p.x += seed*13.;
  float cx = floor(p.x);
  float h = hash11(cx*1.7+seed);
  float spd = .35 + h*.5;
  float y = p.y - t*spd*scale*.25 - h*40.;
  float cy = floor(y);
  float h2 = hash12(vec2(cx, cy)+seed);
  if(h2 > dens) return 0.;
  vec2 c = vec2(cx+.5 + .25*sin(t*2.+cy+h*6.), cy+.5);
  vec2 q = vec2(p.x, y) - c;
  float r = .12 + .18*hash11(cy+cx*3.1);
  float d = length(q);
  float ring = ss(r, r-.05, d) * ss(r-.12, r-.04, d);
  float hl = ss(.06, .0, length(q - vec2(-r*.35, r*.35)));
  return ring*.8 + hl;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float t = uTravel*.45;
  float sub = (uBands[0]*.6 + uBands[1]*.4);
  float kick = uKick;

  // depth gradient: brighter towards the surface (top)
  float up = uv.y + .5;
  vec3 deep = uPal[0], mid = uPal[1], surf = uPal[2];
  vec3 col = mix(deep*.6, mid, pow(ss(-.1, 1.1, up), 1.6));

  // caustics projected on a tilted plane above
  vec2 p = uv * (2.6 + uV[0]*1.6);
  p.y *= 1.0 + (1.-up)*.6;
  p += vec2(uV[1], uV[2])*20.;
  vec2 w = vec2(fbm(p*.6 + t*.25), fbm(p*.6 - t*.22 + 7.)) - .5;
  p += w * (.45 + sub*1.1*uIntensity);
  float sharp = 3. + 3.*(1.-kick*.6);
  float c = caustic(p, t*1.3, sharp)*.7 + caustic(p*1.37 + 3.1, -t*1.1 + 2., sharp)*.6;
  c *= pow(ss(-.1, .9, up), 1.5);
  col += surf * c * (.35 + uEnergy*.9 + kick*.6) * (1.+uDrop*.5);

  // god rays from the surface
  vec2 sp = vec2((uV[3]-.5)*.8, .9);
  vec2 d = uv - sp;
  float ang = atan(d.x, -d.y);
  float rays = pow(noise(vec2(ang*9. + uV[4]*50., t*.15)), 3.) + .6*pow(noise(vec2(ang*23., -t*.2+4.)), 4.);
  rays *= ss(1.6, .0, length(d)) * (.25 + uEnergy*.7 + uDrop*.4);
  col += mix(surf, vec3(1.), .3) * rays * .55;

  // surface shimmer band
  col += surf * pow(ss(.25, .62, uv.y), 2.) * (.3 + .3*fbm(vec2(uv.x*3.+t, t)));

  // bubbles (hi-hats summon more)
  float dens = .08 + uHat*.35 + uDrop*.1;
  float b = bubbles(uv, uTime*uSpeed + t, 9., dens, uV[5]*10.)
          + .7*bubbles(uv, uTime*uSpeed*.8 + t, 16., dens*.8, uV[6]*10.+3.);
  col += mix(surf, vec3(1.), .6) * b * .7;

  // drifting particles (plankton)
  vec2 pp = uv*28. + vec2(t*.3, t*.5);
  vec2 cell = floor(pp); vec2 o = hash22(cell);
  float pd = length(fract(pp) - o);
  col += uPal[3] * ss(.06, .0, pd) * step(.82, hash12(cell+9.)) * (.4 + uHat);

  // kick pulse + drop flash
  col *= 1. + kick*.25;
  col += uPal[4] * uDropHit * .35 * ss(1.2, 0., length(uv - sp));
  fragColor = vec4(finish(col), 1.);
}
`;

export const caustics: TemplateDef = {
  id: 'caustics',
  name: '水底のコースティクス',
  nameEn: 'Caustic Drift',
  tagline: '水中から見上げる光の揺らぎ。低音で光が歪み、ハイハットで泡が湧く。',
  params: [],
  overlayDefault: true,
  create: (env) => createShaderInstance(env, {
    frag,
    palettes: [
      ['#02121f', '#0a4a6b', '#7ff3ff', '#bff', '#ffffff'],
      ['#0b0624', '#2c2a7a', '#9fd8ff', '#ffc6f5', '#ffe9ff'],
      ['#001a17', '#06695f', '#a8ffe1', '#e8ffb0', '#ffffff'],
      ['#120a2a', '#3e2c86', '#ffb3e6', '#a0f0ff', '#fff2fb'],
    ],
  }),
};
