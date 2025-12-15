// Simple audio helpers using WebAudio API. Generates tones to avoid external assets.
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensureContext() {
    if (!this.ctx && typeof AudioContext !== 'undefined') {
      this.ctx = new AudioContext();
    }
  }

  beep({ duration = 0.1, freq = 440, type = 'sine', vol = 0.2 } = {}) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  thud() {
    this.beep({ duration: 0.25, freq: 80, type: 'square', vol: 0.35 });
  }

  danger() {
    this.beep({ duration: 0.4, freq: 360, type: 'sawtooth', vol: 0.25 });
  }

  confirm() {
    this.beep({ duration: 0.15, freq: 520, type: 'triangle', vol: 0.2 });
  }
}

const audioSystem = new AudioSystem();
