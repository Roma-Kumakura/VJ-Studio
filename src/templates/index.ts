import type { TemplateDef } from '../core/template';
import { caustics } from './caustics';
import { highway } from './highway';
import { sky } from './sky';
import { aurora } from './aurora';
import { nebula } from './nebula';
import { y2k } from './y2k';
import { train } from './train';
import { jacket } from './jacket';
import { puddle, goldfish, crt, danchi, classroom, jellyfish, sakura, wirecity, constellation, lcd } from './set1';
import { kaleido, ink, rainglass, elevator, torii, holoterrain, prism, dawnsea, fireworks, film } from './set2';
import { yatai, ukiyowave, reiho, bamboo, karesansui, shinkansen, sumi, momiji, denkigai, yukiguni } from './set3';
import { warp, orbital, dyson, twinsun, cockpit, blackhole, megacity, circuit, planet, portal } from './set4';
import { lofiwindow, vaporgrid, citypop, watercolor, lavalamp, stainedglass, opart, neontube, ascii, polyhedra, bubbles, speaker, cassette, vinyl, discoball, marble, godrays, ferris, ecg, pixeltown } from './set5';

export const TEMPLATES: TemplateDef[] = [
  caustics, highway, sky, aurora, nebula, y2k, train, jacket,
  puddle, goldfish, crt, danchi, classroom, jellyfish, sakura, wirecity, constellation, lcd,
  kaleido, ink, rainglass, elevator, torii, holoterrain, prism, dawnsea, fireworks, film,
  yatai, ukiyowave, reiho, bamboo, karesansui, shinkansen, sumi, momiji, denkigai, yukiguni,
  warp, orbital, dyson, twinsun, cockpit, blackhole, megacity, circuit, planet, portal,
  lofiwindow, vaporgrid, citypop, watercolor, lavalamp, stainedglass, opart, neontube, ascii, polyhedra,
  bubbles, speaker, cassette, vinyl, discoball, marble, godrays, ferris, ecg, pixeltown,
];
