/** English version of the About page, by block id (data-t). Inner HTML of each element. */
export const ABOUT_EN: Record<string, string> = {
  // header
  t46: 'Listening', t47: 'Visuals', t48: 'Structure', t49: 'Artificial life', t50: 'Export', t51: 'Open the app',
  // hero
  t1: 'How VJ STUDIO works',
  t24: `VJ STUDIO makes videos that move with your music — just load a song.<br>
      <b>It uses no AI (no machine-learning models) at all.</b> It runs on signal processing, procedural graphics and an artificial-life simulation.<br>
      Everything is computed inside your browser, so your song and images are never sent anywhere.`,
  t25: 'The graphs and visuals on this page are drawn by running the same code as the app on a demo song synthesized right here (a 174 BPM liquid-DnB-style track, 96 seconds; no sound is played).',
  t53: '🎵 Redraw with your own song',
  t45: 'Analyzing…',

  // 01 listening
  t2: '<span class="num">01</span>Listening',
  t26: 'First the song is cut into short slices, 100 per second. Each slice goes through a fast Fourier transform (FFT) to find out which pitches are sounding and how loudly. The result is summarized into 8 bands (from 20 Hz sub-bass to 11 kHz highs) and a 32-bar spectrum for display. Loudness (RMS) and brightness (spectral centroid) are measured at the same time.',
  t13: 'Top: loudness. Bottom: energy in the 8 bands (low at the bottom, high at the top). The background colors show the song structure detected later.',
  t7: 'Finding the hits',
  t27: 'The moment a sound “hits” shows up as a sudden rise in the spectrum. For each band, only the increases compared with the previous frame are added up (spectral flux). Hits in the low band are kicks, the mid band snares, the high band hi-hats. Only peaks clearly above their surroundings are kept, and each is turned into an “envelope” that decays gradually. These drive the motion in the visuals (bouncing on the kick, flashing on the snare, and so on).',
  t14: 'Eight seconds from the first drop. Gray is onset strength, <span class="c-kick">■kick</span><span class="c-snare">■snare</span><span class="c-hat">■hi-hat</span>. Vertical lines are the tracked beats (thick lines are the start of a bar).',
  t8: 'Choosing the tempo',
  t28: 'The onset curve is shifted step by step and laid over itself (autocorrelation). When it is shifted by exactly one beat period, the peaks line up neatly. To avoid being fooled by half-beat or two-beat candidates, overlaps at two and four times the period are added too (harmonic reinforcement). Finally a gentle “prior” centred on 120 BPM keeps extreme tempos out, and the tempo with the highest score wins.',
  t15: 'Score for each tempo candidate. The pink line is the chosen tempo; the dashed yellow line is double (or half) of it.',
  t29: 'In songs with a strong half-time feel — like liquid DnB, with the snare on beats 2 and 4 — half the real tempo (87 instead of 174) can come out stronger in the autocorrelation. That is exactly what happens with this demo song. Which one is “the” tempo also depends on how the listener feels it, so the app’s Song page has <b>÷2 / ×2</b> correction buttons. Pressing one re-runs beat tracking and structure detection.',
  t9: 'Following the beat',
  t30: 'Real songs (especially live playing or tracks made with Suno) drift slightly in tempo. So the app uses Ellis’s (2007) dynamic-programming beat tracker, the same method used in librosa. It has two conditions: <b>“the onset should be strong at each beat”</b> and <b>“the gap between beats should stay close to the tempo period”</b>. The sequence of beats that scores highest on both is found for the whole song at once. Because it is not a fixed grid, it follows tempo drift smoothly. Lyric timing and bar lines are all based on these tracked beats.',
  t44: 'Score of beats b₁…bₙ = Σ onset(bᵢ) − α · Σ ( log( (bᵢ − bᵢ₋₁) / period ) )²',
  t10: 'Reading the structure',
  t31: 'Loudness and the amount of bass are averaged over each four-bar phrase. Phrases that are relatively loud within the song become the “drop”, quiet ones the “intro / break”. Phrases rising just before a drop are the “build”, and everything after the last drop is the “outro”. How far the build has progressed, and the impact at the moment a drop starts (dropHit), are also used as signals to drive the visuals.',
  t16: '<span class="c-e">― loudness</span> <span class="c-b">― build</span> <span class="c-d">― drop</span>. Band colors: <span class="s0">■intro / break</span><span class="s1">■build</span><span class="s2">■drop</span><span class="s3">■outro</span>.',

  // 02 visuals
  t3: '<span class="num">02</span>Drawing the visuals',
  t32: 'Each of the 68 themes is a small program that runs on the GPU (a GLSL shader). Every one is <b>a pure function: the picture depends only on the time, the features of the sound at that moment and a seed</b>, and even the randomness is derived from the time. So the preview and the MP4 exported frame by frame look exactly the same at any given moment. On top come a glow (bloom), horizontal light streaks, color fringing and a zoom on the kick. Finally the HUD — icon, spectrum, lyrics, captions and so on — is layered over it.',
  t17: 'A still of every theme, rendered right now on this page at the moment of the demo song’s first drop.',

  // 03 structure
  t4: '<span class="num">03</span>Building the structure',
  t33: 'The theme changes with each section of the song. Long sections are split every 8–16 bars, and every switch lines up with the first beat of a bar from the tracked beats. Each theme has a “calm to wild” rating: wild themes tend to be chosen for drops and calm ones for intros and breaks. The same theme is never placed in two neighbouring scenes. The transition (cut, crossfade, flash, zoom, glitch, wipe) is also chosen to suit the section. You can swap or lock any scene afterwards.',
  t18: 'The scenes built automatically for the demo song. The redder the color, the wilder the theme.',
  t11: 'The slot machine',
  t34: 'The slot machine has nine reels: Mood, Theme, Color, Material, Layout, Font, Meters, Effects and Captions. The mood is drawn by weighted lottery from the song’s tempo, brightness, amount of bass and drop strength. For the layout, elements are placed as boxes that push each other apart little by little until they settle where they don’t overlap.',

  // 04 super slot
  t5: '<span class="num">04</span>Super Slot ― artificial life',
  t35: 'In Super Slot, the elements of the video are treated as <b>living things</b>: the themes and your photos and videos. Masks and whole-frame effects join as “organs” that never die. Nobody decides what appears on screen — the video <b>emerges</b> from how the creatures relate to each other and interact with the music.',
  t54: '🧬 Genes',
  t36: 'Which sounds it “listens” to (nine sensitivities: kick, snare, hats, loudness, bass, mids, highs, build, drop), the threshold at which it reacts, how fast it reacts, its lifespan and the energy it needs to reproduce. Themes also have a preferred intensity. And its look (blend mode, font, color, motion, crop). The ear has a total budget, so listening hard to one thing means hearing less of the rest. As a result, <b>specialists</b> and <b>generalists</b> appear.',
  t55: '🍙 Metabolism',
  t37: 'The music is the <b>food</b>. When a kick sounds, for example, the creatures listening to kicks share the food in proportion to their sensitivity (niche competition). Being prominent on screen burns more energy. A creature that runs out of energy starves; one that reaches its lifespan dies of old age.',
  t56: '🐣 Reproduction',
  t38: 'With enough energy, a creature splits. The child inherits half of the parent’s energy and <b>mutated</b> genes. If a strongly bonded partner of the same kind is around, their genes <b>cross over</b>. When the population is full, the child pushes out the weakest. A theme’s child can even <b>speciate into a different theme</b> when its preferred intensity mutates.',
  t57: '☄️ Mass extinction',
  t39: 'At every drop, the theme that ruled the screen and some of the photos die at once. The survivors get a flood of food, and their offspring fill the empty niches.',
  t58: '🕸️ Network',
  t40: 'The creatures are connected by excitatory and inhibitory links, inherited from their parents. Things that light up together bond more strongly (Hebbian learning), and links sometimes rewire on their own. What you see on screen is decided by the activity of this network. Positions follow simple physics too: friends attract, rivals repel, and kicks blow everything outward.',
  t59: '⏳ Irreversible',
  t41: 'The dead never come back. Mutations accumulate, and the network’s “temperature” (its restlessness) rises over time. The population keeps changing as it adapts to the song, so <b>the end of the song is a different world from its beginning</b>.',
  t19: 'The ecosystem record for the demo song. Top: population per kind (stacked), white line = mean generation, red lines = mass extinctions. Bottom: what the whole population is “listening” to. When the section changes, the food changes too, and you can see the population’s ears adapting.',
  t20: 'Family tree. Each horizontal line is one creature’s life (from birth to death); the thin slanted lines connect parents and children. <span class="c-kick">■themes</span><span class="c-snare">■photos & videos</span>',
  t21: 'The network (playing along with the demo song; no sound). Circle size is activity, lines are links (dashed = inhibitory). Rings are births; the red frame is a mass extinction.',
  t42: 'The simulation is computed ahead of time when the song is loaded, at 20 steps per second up to the end of the song. Randomness comes from a seed, so the same seed always produces the same evolution — seeking or exporting gives exactly the preview. Pressing “🌀 Spin the chaos” starts a different evolutionary history with a new seed.',

  // 05 export
  t6: '<span class="num">05</span>Export',
  t43: 'On export, the video is drawn frame by frame and compressed into H.264 video and AAC audio with the browser’s built-in WebCodecs, then packed into an MP4 file. Instead of recording in real time it advances the clock 1/30 of a second at a time, so no frames are dropped however fast or slow your computer is. Where WebCodecs is not available it falls back to recording the screen.',
  t12: 'References',
  t22: 'librosa (its beat_track implementation was used as a reference)',
  t23: 'Ideas from artificial life: C. Langton, T. Ray “Tierra”, K. Sims “Evolved Virtual Creatures”, and others',
  t52: 'Open VJ STUDIO →',
};
