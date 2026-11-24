import { createShaderInstance } from '../core/gl';
import type { TemplateDef } from '../core/template';

// 雲上の空 — above a sea of clouds, anime-style sky light.
const frag = /* glsl */ `
float glow(vec2 p, vec2 c, float r){ vec2 d=p-c; return exp(-dot(d,d)/(r*r)); }
float cloudD(vec2 p){
  float f = fbm(p);
  f += .5*fbm(p*2.3 + 5.);
  return f/1.5;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  float W = uRes.x/uRes.y;
  float h0 = -.08 + uV[0]*.1;
  float t = uTravel*.08;

  // colour temperature from spectral centroid (bright tone -> cooler, airy)
  float temp = clamp(uCentroid, 0., 1.);
  vec3 zen = mix(uPal[0], uPal[0]*vec3(.8,.9,1.2), temp);
  vec3 hor = mix(uPal[1], uPal[1]*vec3(1.1,1.0,.85), 1.-temp);
  vec3 sunC = uPal[2];

  vec2 sun = vec2((uV[1]-.5)*W*.6, h0 + .1 + uV[2]*.22);
  float sunI = .45 + uEnergy*.4 + uDrop*.2;

  vec3 col;
  if(uv.y > h0){
    float y = uv.y - h0;
    col = mix(hor, zen, pow(ss(0., .7, y), .7));
    col += sunC * glow(uv, sun, .35) * .5 * sunI;
    // cirrus / high clouds
    vec2 cp = vec2(uv.x*1.2 + t*.6, y*4.);
    float ci = ss(.45, .85, fbm(cp*vec2(1.,3.) + uV[3]*20.)) * ss(.05, .3, y);
    col = mix(col, mix(col*1.25, sunC, .25) + .05, ci*.55);
    // distant cumulus bank at horizon
    float bank = fbm(vec2(uv.x*2.5 + uV[4]*30. + t*.1, 0.))*.18;
    float inBank = ss(bank, bank-.02, y);
    vec3 bankC = mix(hor*1.15, sunC, .3*ss(.8, .0, abs(uv.x-sun.x)));
    col = mix(col, bankC, inBank*.85);
  } else {
    // sea of clouds (perspective plane)
    float z = .35 / (h0 - uv.y + .002);
    vec2 wp = vec2(uv.x*z, z + t*6.)*.6;
    float d = cloudD(wp + uV[5]*10.);
    vec2 sd = normalize(vec2(sun.x, 1.)) * .15;
    float d2 = cloudD(wp + sd + uV[5]*10.);
    float light = clamp((d - d2)*9. + .45, 0., 1.);
    vec3 shadow = mix(uPal[3], hor*.6, .4);
    vec3 lit = mix(vec3(1.), sunC, .35);
    col = mix(shadow, lit, light);
    col *= .55 + .7*d;
    // forward scattering near the sun direction
    col += sunC * .35 * ss(.9, .0, abs(uv.x - sun.x)) * ss(-.6, h0, uv.y) * sunI;
    // haze toward horizon
    col = mix(col, hor*1.05, 1.-exp(-z*.025));
  }

  // sun disk
  col += sunC * ss(.035, .02, length(uv - sun)) * 1.5 * sunI;
  col += vec3(1.) * ss(.02, .0, length(uv - sun));

  // crepuscular rays
  vec2 dv = uv - sun;
  float a = atan(dv.y, dv.x);
  float rays = pow(noise(vec2(a*14. + uV[6]*40., uTime*.05)), 2.5);
  col += sunC * rays * ss(1.2, .05, length(dv)) * (.05 + uEnergy*.12 + uDrop*.1);

  // lens flare (kick)
  vec2 axis = -sun;
  float fl = .25 + uKick*1.2 + uDropHit*1.5;
  for(int i=0;i<5;i++){
    float k = .35 + float(i)*.42;
    vec2 c = sun + axis*k;
    float r = .02 + .035*hash11(float(i)+uV[7]*10.);
    float ring = ss(r, r*.75, length(uv-c)) * .25 + ss(r*1.2, r*1.1, length(uv-c))*ss(r*1.0,r*1.1,length(uv-c))*.6;
    vec3 fc = i==1 ? vec3(.4,.8,1.) : i==3 ? vec3(1.,.5,.9) : sunC;
    col += fc * ring * fl * .35;
  }
  // anamorphic streak
  col += mix(sunC, vec3(.6,.8,1.), .5) * exp(-abs(uv.y-sun.y)*120.) * ss(1.2, 0., abs(uv.x-sun.x)) * fl * .25;

  // sparkles drifting up
  vec2 sp = uv*vec2(20.,12.) + vec2(0., -uTime*.3);
  vec2 sc = floor(sp);
  float sh = hash12(sc + 11.);
  float tw = .5 + .5*sin(uTime*4. + sh*30.);
  col += vec3(1.,.95,.9) * ss(.08, 0., length(fract(sp)-hash22(sc))) * step(.9, sh) * tw * (.3 + uHat*1.2);

  col *= 1. + uKick*.08;
  col += vec3(1.) * uDropHit * .25;
  fragColor = vec4(finish(col*.8), 1.);
}
`;

export const sky: TemplateDef = {
  id: 'sky',
  name: '雲上の空',
  nameEn: 'Above the Clouds',
  tagline: '雲海の上の光。音色の明るさで空の色温度が変わり、キックでフレアが走る。',
  params: [],
  overlayDefault: true,
  create: (env) => createShaderInstance(env, {
    frag,
    palettes: [
      ['#2b5fb8', '#ffc6a8', '#ffd890', '#7a7fb8'],
      ['#1d1a5a', '#ff9db5', '#ffcf8a', '#5a4a8f'],
      ['#3a8ee6', '#d9f1ff', '#fff6d8', '#8aa5c9'],
      ['#2a1f55', '#f7a072', '#ffb45e', '#4b3b7a'],
    ],
  }),
};
