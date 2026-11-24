import { createShaderInstance } from '../core/gl';
import type { TemplateDef } from '../core/template';

// スペクトル・オーロラ — the spectrum as aurora curtains over a mirror lake.
const frag = /* glsl */ `
vec3 sky(vec2 uv, float W, float hl){
  float y = uv.y - hl;
  vec3 col = mix(uPal[0]*1.4, uPal[0]*.35, ss(0., .7, y));
  // stars
  vec2 sp = uv*90.; vec2 sc = floor(sp);
  float h = hash12(sc + uV[0]*99.);
  float tw = .55 + .45*sin(uTime*3. + h*50.);
  col += vec3(.9,.95,1.) * ss(.12, .0, length(fract(sp)-hash22(sc))) * step(.985, h) * tw * (.6 + uHat*.8);
  // aurora curtains
  float x = uv.x / W + .5;
  for(int i=0;i<4;i++){
    float fi = float(i);
    float base = hl + .2 + fi*.06 + uV[1]*.06;
    float s = spec(abs(fract(x*.8 + fi*.21 + uV[2])*2.-1.));
    float cy = base + .12*(fbm1(uv.x*1.3 + uTime*.04*(1.+fi*.3) + fi*7. + uV[3]*20.)-.5) + s*.05;
    float d = uv.y - cy;
    float height = (.02 + s*s*.09*uIntensity + uDrop*.02);
    float curtain = d > 0. ? exp(-d/height) : exp(d*90.);
    float stri = .55 + .45*noise(vec2(uv.x*60. + fi*10., uTime*.6 + fi));
    stri *= .7 + .3*noise(vec2(uv.x*7., uTime*.2));
    vec3 c = mix(uPal[1+i%3], uPal[(2+i)%4 + 1], ss(0., height*2.5, d));
    col += c * curtain * stri * (.25 + uEnergy*.35 + uHat*.2) * (1. - fi*.18) * (1. + 2.*exp(-abs(d)*80.));
  }
  return col;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  float hl = -.22 + uV[4]*.08;
  vec3 col;
  // mountains silhouette
  float m = hl + .06 + .16*fbm1(uv.x*1.2 + uV[5]*30.) * (.6 + .4*sin(uv.x*.8 + uV[6]*6.));
  if(uv.y >= hl){
    col = sky(uv, W, hl);
    if(uv.y < m){
      col = mix(uPal[0]*.15, uPal[0]*.3, ss(hl, m, uv.y));
      col += vec3(.7,.8,1.)*.08*ss(m-.01, m, uv.y); // snow rim
    }
  } else {
    // lake reflection with kick ripples
    float dy = hl - uv.y;
    vec2 ruv = vec2(uv.x, hl + dy);
    float rr = length(vec2(uv.x*.6, dy*3.));
    float ripple = sin(rr*60. - uTime*6.) * exp(-rr*3.) * (uKick*.012 + uDropHit*.02);
    ruv.x += (noise(vec2(uv.x*4., dy*40. + uTime*.4))-.5)*.02 + ripple;
    ruv.y += ripple;
    col = sky(ruv, W, hl);
    float mr = hl + .06 + .16*fbm1(ruv.x*1.2 + uV[5]*30.) * (.6 + .4*sin(ruv.x*.8 + uV[6]*6.));
    if(ruv.y < mr) col = uPal[0]*.15;
    col *= .55;
    col = mix(col, uPal[0]*.2, ss(0., .4, dy));
  }
  col += uPal[2] * uDropHit * .3;
  fragColor = vec4(finish(col), 1.);
}
`;

export const aurora: TemplateDef = {
  id: 'aurora',
  name: 'スペクトル・オーロラ',
  nameEn: 'Spectrum Aurora',
  tagline: '周波数帯域がそのままオーロラの帯に。湖面はキックで波紋を描く。',
  params: [],
  overlayDefault: true,
  create: (env) => createShaderInstance(env, {
    frag,
    palettes: [
      ['#040a1c', '#38ffb0', '#3fd2ff', '#c45bff', '#ff6fb5'],
      ['#0a0518', '#ff7ad9', '#9b7bff', '#5fe3ff', '#ffe08a'],
      ['#020b10', '#7dffda', '#b9ff6b', '#5fb7ff', '#ffffff'],
    ],
  }),
};
