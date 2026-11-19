// Tiny WebAudio synth: no audio files, just oscillators and a noise buffer shaped into
// blips, chimes, thuds and a two-tone siren. The context is created lazily on the first
// user gesture (browsers refuse it sooner), and M mutes everything.

export function createSound() {
  let context = null;
  let master = null;
  let muted = false;
  let sirenNodes = null;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
  }

  function tone(freq, freqEnd, seconds, type, volume, delay = 0) {
    if (context === null || muted) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume, delay = 0) {
    if (context === null || muted) return;
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master !== null) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.setSiren(false, 0);
      return muted;
    },
    pickup() { tone(660, 990, 0.12, 'square', 0.16); },
    deliver() { tone(523, 523, 0.1, 'triangle', 0.2); tone(784, 784, 0.14, 'triangle', 0.2, 0.09); },
    success() { tone(523, 523, 0.1, 'triangle', 0.22); tone(659, 659, 0.1, 'triangle', 0.22, 0.09); tone(784, 784, 0.18, 'triangle', 0.24, 0.18); },
    fail() { tone(220, 110, 0.35, 'sawtooth', 0.14); },
    crash(strength) { noise(0.16 + strength * 0.2, 0.12 + strength * 0.25); tone(90, 45, 0.2, 'sine', 0.3); },
    theft() { tone(880, 660, 0.09, 'square', 0.14); tone(880, 660, 0.09, 'square', 0.14, 0.12); },
    busted() { tone(392, 392, 0.16, 'square', 0.18); tone(311, 311, 0.16, 'square', 0.18, 0.17); tone(233, 196, 0.4, 'square', 0.18, 0.34); },
    /** A warbling two-tone siren while the law is close; level 0..1 by nearness. */
    setSiren(active, level) {
      if (context === null || muted) active = false;
      if (active && sirenNodes === null) {
        const osc = context.createOscillator();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        const gain = context.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 715;
        lfo.type = 'square';
        lfo.frequency.value = 1.4;
        lfoGain.gain.value = 165;
        gain.gain.value = 0;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        lfo.start();
        sirenNodes = { osc, lfo, gain };
      }
      if (sirenNodes !== null) {
        const target = active ? 0.015 + level * 0.05 : 0;
        sirenNodes.gain.gain.setTargetAtTime(target, context.currentTime, 0.2);
        if (!active) {
          const nodes = sirenNodes;
          sirenNodes = null;
          window.setTimeout(() => { try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already gone */ } }, 700);
        }
      }
    },
  };
}
