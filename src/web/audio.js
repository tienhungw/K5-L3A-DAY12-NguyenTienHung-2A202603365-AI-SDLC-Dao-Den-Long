// Sound for Đảo Đèn Lồng (browser only; headless never loads this).
// Files (provided by the author): background music lab11nen.mp3, Tỏa Sáng (F) lab11duoi.mp3, deposit (E) lab11sang.mp3.
// Other effects are synthesized with WebAudio oscillators (no extra assets).
export function createAudio(settings) {
  let ctx = null, master = null, musicGain = null, musicEl = null;
  const buffers = {};
  const FILES = { pulse: '/sounds/lab11duoi.mp3', deposit: '/sounds/lab11sang.mp3' };

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new AudioContext();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.45; musicGain.connect(master);
      setVolume(settings.volume);
      for (const [k, url] of Object.entries(FILES)) {
        fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { buffers[k] = buf; }).catch(() => {});
      }
      musicEl = new Audio('/sounds/lab11nen.mp3');
      musicEl.loop = true;
      ctx.createMediaElementSource(musicEl).connect(musicGain);
    } catch { ctx = null; }
  }
  function setVolume(v) { if (master) master.gain.value = v; }
  function play(name, vol = 1) {
    if (!ctx || !buffers[name]) return false;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name]; g.gain.value = vol;
    src.connect(g).connect(master); src.start();
    return true;
  }
  function tone(freq, dur, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.08, freq = 800) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.buffer = buf; src.connect(f).connect(g).connect(master); src.start();
  }
  return {
    unlock, setVolume,
    music(on) { if (!musicEl) return; if (on) musicEl.play().catch(() => {}); else musicEl.pause(); },
    pickup: (n) => tone(660 + n * 45, 0.1, { vol: 0.07, slide: 1.5 }),
    deposit: () => play('deposit') || tone(520, 0.2, { type: 'triangle', vol: 0.1, slide: 1.25 }),
    lit: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.07, delay: 0.25 + i * 0.09 })),
    pulse: () => play('pulse') || tone(300, 0.35, { type: 'sawtooth', vol: 0.05, slide: 3 }),
    hit: () => { tone(140, 0.4, { type: 'square', vol: 0.08, slide: 0.5 }); noise(0.25, 0.06, 300); },
    jump: () => tone(380, 0.12, { type: 'triangle', vol: 0.06, slide: 1.6 }),
    dash: () => noise(0.18, 0.09, 1600),
    shade: () => tone(110, 0.7, { type: 'sawtooth', vol: 0.04, slide: 0.7 }),
    steal: () => tone(900, 0.3, { type: 'sine', vol: 0.06, slide: 0.4 }),
    charm: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.25, { vol: 0.06, delay: i * 0.06 })),
    wind: () => noise(1.6, 0.07, 500),
    tick: (last) => tone(last ? 1320 : 990, 0.08, { type: 'square', vol: 0.05 }),
    win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.08, delay: i * 0.15 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.8, { type: 'sine', vol: 0.1, delay: i * 0.25 })),
  };
}
