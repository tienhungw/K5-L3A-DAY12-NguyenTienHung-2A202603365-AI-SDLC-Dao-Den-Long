// Tiny procedural sound effects (WebAudio oscillators, no asset files). Creative extra; browser only.
export function createAudio() {
  let ctx = null, on = true;
  const tone = (freq, dur, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) => {
    if (!ctx || !on) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  return {
    unlock() { if (!ctx) { try { ctx = new AudioContext(); } catch { /* no audio */ } } },
    toggle() { on = !on; },
    pickup: (n) => tone(660 + n * 90, 0.12, { vol: 0.08, slide: 1.5 }),
    deposit: () => tone(520, 0.2, { type: 'triangle', vol: 0.1, slide: 1.25 }),
    lit: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.08, delay: i * 0.09 })),
    pulse: () => tone(300, 0.35, { type: 'sawtooth', vol: 0.05, slide: 3 }),
    hit: () => tone(140, 0.4, { type: 'square', vol: 0.08, slide: 0.5 }),
    win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.08, delay: i * 0.15 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.8, { type: 'sine', vol: 0.1, delay: i * 0.25 })),
  };
}
