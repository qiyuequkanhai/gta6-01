// WebAudio-synthesised sound for Vice Bay: no audio files, every effect is built
// from oscillators and filtered noise. All calls are safe before any user gesture
// (the context is created lazily and every method guards a missing context).
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let bassTimer = null;
  let bassStep = 0;
  const BASSLINE = [55, 0, 55, 65.41, 0, 55, 49, 58.27];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure()) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* audio is best-effort */ }
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch { engineOsc = null; }
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch { sirenOsc = null; }
  }

  function startBass() {
    if (!ensure() || bassTimer !== null) return;
    bassTimer = window.setInterval(() => {
      if (muted) return;
      const freq = BASSLINE[bassStep % BASSLINE.length];
      bassStep += 1;
      if (freq) tone(freq, 0.22, 'triangle', 0.16);
    }, 240);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      startBass();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    shoot() { noise(0.12, 0.35, 2600); tone(180, 0.08, 'square', 0.18, 60); },
    punch() { noise(0.08, 0.25, 500); },
    pickup() { tone(660, 0.1, 'sine', 0.2); tone(990, 0.14, 'sine', 0.18); },
    crash() { noise(0.3, 0.4, 700); },
    cash() { tone(880, 0.09, 'sine', 0.2); tone(1174, 0.09, 'sine', 0.2); tone(1568, 0.18, 'sine', 0.2); },
    busted() { tone(392, 0.25, 'sawtooth', 0.2, 196); tone(196, 0.5, 'sawtooth', 0.2, 98); },
    mission() { tone(523, 0.12, 'sine', 0.2); tone(659, 0.12, 'sine', 0.2); tone(784, 0.25, 'sine', 0.2); },
    engine(speed01, driving) {
      startEngine();
      if (engineGain && ctx) {
        const target = driving ? 0.05 + speed01 * 0.09 : 0.015;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 140, ctx.currentTime, 0.1);
      }
    },
    siren(active, dt) {
      if (active) {
        startSiren();
        sirenTimer += dt;
        if (sirenOsc) sirenOsc.frequency.value = sirenTimer % 1 < 0.5 ? 700 : 950;
      } else if (sirenOsc) {
        try { sirenOsc.stop(); } catch { /* already stopped */ }
        sirenOsc = null;
      }
    },
  };
}
