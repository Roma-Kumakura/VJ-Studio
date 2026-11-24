import { createShaderInstance } from '../core/gl';
import type { TemplateDef } from '../core/template';

// 星屑の夜行列車 — looking out of a night train window.
const frag = /* glsl */ `
float glow(vec2 p, vec2 c, float r){ vec2 d=p-c; return exp(-dot(d,d)/(r*r)); }
float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
vec3 outside(vec2 uv, float W){
  float tr = uTravel;
  // sky
  vec3 col = mix(uPal[1], uPal[0], ss(-.3, .5, uv.y));
  // milky way
  float mw = fbm(vec2(uv.x*1.5 + uv.y*.8, uv.y*2.) + uV[0]*20.);
  col += uPal[2] * pow(mw, 3.) * .5 * ss(-.1, .4, uv.y + uv.x*.3);
  // stars (twinkle on hats)
  for(int l=0;l<2;l++){
    float sc = l==0 ? 70. : 140.;
    vec2 sp = uv*sc + vec2(tr*.02*float(l+1), 0.);
    vec2 c = floor(sp);
    float h = hash12(c + float(l)*17. + uV[1]*50.);
    float tw = .5 + .5*sin(uTime*(2.+h*4.) + h*40.);
    col += vec3(1.,.97,.9) * ss(.15, .0, length(fract(sp)-hash22(c))) * step(.975, h) * (.4 + tw*.6*(1.+uHat*1.5));
  }
  // moon
  vec2 mp = vec2((uV[2]-.5)*W*.7, .2 + uV[3]*.15);
  col += uPal[3] * glow(uv, mp, .18) * .35;
  col = mix(col, uPal[3]*1.3, ss(.045, .04, length(uv - mp)));
  // shooting star on drops
  float sst = 1. - uDropHit;
  vec2 s0 = vec2(-.2 + uV[4]*.5, .38);
  vec2 s1 = s0 + vec2(.6, -.25)*sst;
  vec2 pa = uv - s0, ba = s1 - s0;
  float hh = clamp(dot(pa,ba)/max(dot(ba,ba),1e-5), 0., 1.);
  col += vec3(1.) * exp(-length(pa - ba*hh)*300.) * hh * uDropHit * 1.5;

  // far mountains
  float mx = uv.x + tr*.03;
  float m1 = -.08 + .18*fbm1(mx*.9 + uV[5]*30.);
  if(uv.y < m1) col = mix(uPal[0]*.5, uPal[1]*.55, .3);
  // town lights along the foot of the mountains
  float tx = uv.x + tr*.12;
  vec2 tp = vec2(tx*60., (uv.y + .12)*60.);
  vec2 tc = floor(tp);
  float dens = .05 + uEnergy*.25 + uDrop*.1;
  float on = step(1.-dens, hash12(tc + 3.)) * ss(-.22, -.1, uv.y) * ss(-.02, -.12, uv.y);
  vec3 lc = mix(vec3(1.,.75,.4), uPal[4], step(.7, hash12(tc+9.)));
  col += lc * ss(.3, .0, length(fract(tp)-.5)) * on * (.8 + .4*sin(uTime*2.+tc.x));
  col += lc * .05 * on;
  // near hills + trees (fast parallax)
  float nx = uv.x + tr*.6;
  float m2 = -.2 + .07*fbm1(nx*2. + uV[6]*20.) + .06*pow(abs(sin(nx*9. + noise1(nx*3.)*3.)), 6.)*step(.4, noise1(nx*1.3));
  if(uv.y < m2) col = uPal[0]*.08;
  return col;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  // train rumble
  vec2 shake = vec2(0., (noise(vec2(uTime*14., 3.))-.5)*.006 + uKick*.004*sin(uTime*60.));
  vec2 wuv = uv + shake;
  vec3 col = outside(wuv, W);

  // utility poles: one per beat
  float D = W*1.1;
  float ph = uBeat * D;
  float local = mod(wuv.x + ph + D*.5, D);
  float poleW = .018 + uSpeed*.004;
  float pole = ss(poleW, poleW*.6, abs(local - D*.5)) * step(wuv.y, .55);
  // cross arm
  pole = max(pole, ss(.008, .004, abs(wuv.y - .42)) * ss(.09, .085, abs(local - D*.5)));
  // wires (catenary)
  float s = local / D;
  for(int i=0;i<3;i++){
    float top = .42 - float(i)*.035 + .005;
    float wy = top - .09*4.*(s-.5)*(s-.5)*-1. - .09;
    wy = top - .09*(1. - 4.*(s-.5)*(s-.5));
    pole = max(pole, ss(.0035, .0015, abs(wuv.y - wy)) * .9);
  }
  col = mix(col, uPal[0]*.03, pole);

  // bridge truss during drops
  float truss = step(.5, uV[7]) * uDrop;
  if(truss > .01){
    float bx = mod(wuv.x + uBeat*D*2., .5);
    float diag = min(abs(bx - (wuv.y+.3)*.8), abs(bx - (.5 - (wuv.y+.3)*.8)));
    float beam = ss(.012, .006, diag) * step(-.3, wuv.y) * step(wuv.y, .35);
    beam = max(beam, ss(.015, .01, abs(wuv.y - .35)));
    beam = max(beam, ss(.015, .01, abs(wuv.y + .3)));
    col = mix(col, uPal[0]*.05, beam*truss);
  }

  // window frame
  vec2 wb = vec2(W*.5 - .07, .42);
  float d = sdRoundBox(uv - vec2(0., .02), wb, .09);
  vec3 inter = mix(vec3(.10,.07,.06), uPal[4]*.15, .3);
  inter *= .6 + .4*ss(.5, -.5, uv.y);
  inter += vec3(1.,.8,.5)*.06*glow(uv, vec2(0., .55), .5);
  // glass reflection
  col += inter * .25 + vec3(1.,.85,.6)*.03*(1.+uKick*.5);
  col = mix(col, inter, ss(0., .004, d));
  col += vec3(.7,.6,.5)*.15*ss(.012, .0, abs(d - .006));

  col += uPal[3] * uDropHit * .15;
  fragColor = vec4(finish(col*1.15), 1.);
}
`;

export const train: TemplateDef = {
  id: 'train',
  name: '星屑の夜行列車',
  nameEn: 'Starlight Train',
  tagline: '車窓を電柱がビートごとに通過。ハイハットで星が瞬き、エネルギーで街の灯りが増える。',
  params: [],
  overlayDefault: true,
  create: (env) => createShaderInstance(env, {
    frag,
    palettes: [
      ['#060a1f', '#1b2a5c', '#7b6cff', '#fff2c9', '#ff9ccf'],
      ['#0b0618', '#3a1f4f', '#ff8cc6', '#ffe6f4', '#8fd6ff'],
      ['#030b14', '#123a52', '#57d6ff', '#e8fbff', '#ffd27a'],
    ],
  }),
};
