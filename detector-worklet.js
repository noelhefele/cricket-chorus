// Chirp detector, running on the audio thread.
//
// Band-pass (two cascaded RBJ biquads, 4th order) around the carrier -> per-block level in dBFS ->
// rising-edge threshold crossing with hysteresis. After a detection it holds
// off for `holdMs` so one multi-pulse chirp counts once. Mute windows
// (refractory periods) are sent from the main thread in audio-clock seconds.
//
// Everything is timestamped in audio-clock frames, so detections are
// sample-accurate relative to scheduled emissions.

class DetectorCore {
  constructor(sr, params) {
    this.sr = sr;
    this.z = new Float64Array(8); // biquad state: x1 x2 y1 y2 for each stage
    this.armed = true;
    this.holdUntil = -Infinity;
    this.mutes = []; // [[fromSec, untilSec], ...]
    this.buf = new Float32Array(128);
    this.set({ carrierHz: 4500, q: 6, thresholdDb: -45, hysteresisDb: 6, holdMs: 150, ...params });
  }

  set(p) {
    Object.assign(this, p);
    const w0 = 2 * Math.PI * this.carrierHz / this.sr;
    const alpha = Math.sin(w0) / (2 * this.q);
    const a0 = 1 + alpha;
    // Constant 0 dB peak gain band-pass.
    this.b0 = alpha / a0; this.b2 = -alpha / a0;
    this.a1 = -2 * Math.cos(w0) / a0; this.a2 = (1 - alpha) / a0;
  }

  mute(from, until) {
    this.mutes.push([from, until]);
  }

  isMuted(t) {
    this.mutes = this.mutes.filter(m => m[1] > t - 1);
    return this.mutes.some(m => t >= m[0] && t < m[1]);
  }

  // Process one block of mono samples whose first sample is frame `startFrame`.
  // Returns { level, det } where det is null or { frame, t, level }.
  process(input, startFrame) {
    const n = input.length;
    if (this.buf.length < n) this.buf = new Float32Array(n);
    const y = this.buf;
    const z = this.z;
    const { b0, b2, a1, a2 } = this;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = input[i];
      const u = b0 * x + b2 * z[1] - a1 * z[2] - a2 * z[3];
      z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = u;
      const v = b0 * u + b2 * z[5] - a1 * z[6] - a2 * z[7];
      z[5] = z[4]; z[4] = u; z[7] = z[6]; z[6] = v;
      y[i] = v;
      sum += v * v;
    }

    const level = 10 * Math.log10(sum / n + 1e-12);
    const t = startFrame / this.sr;
    if (level < this.thresholdDb - this.hysteresisDb) this.armed = true;

    let det = null;
    if (this.armed && level >= this.thresholdDb && t >= this.holdUntil && !this.isMuted(t)) {
      // Refine the onset: first sample whose magnitude reaches the peak
      // amplitude of a sine at the threshold level.
      const amp = Math.SQRT2 * Math.pow(10, this.thresholdDb / 20);
      let k = 0;
      while (k < n - 1 && Math.abs(y[k]) < amp) k++;
      const frame = startFrame + k;
      det = { frame, t: frame / this.sr, level };
      this.armed = false;
      this.holdUntil = det.t + this.holdMs / 1000;
    }
    return { level, det };
  }
}

if (typeof registerProcessor === 'function') {
  class ChirpDetector extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.core = new DetectorCore(sampleRate, (options && options.processorOptions) || {});
      this.meterBlocks = Math.max(1, Math.round(sampleRate * 0.05 / 128));
      this.blocks = 0; this.peak = -120; this.sum = 0;
      this.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'set') this.core.set(m.params);
        else if (m.type === 'mute') this.core.mute(m.from, m.until);
        else if (m.type === 'clearMutes') this.core.mutes = [];
      };
    }

    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      if (!ch) return true;
      const { level, det } = this.core.process(ch, currentFrame);
      if (det) {
        this.port.postMessage({ type: 'detect', tAudio: det.t, level: det.level, threshold: this.core.thresholdDb });
      }
      if (level > this.peak) this.peak = level;
      this.sum += level;
      if (++this.blocks >= this.meterBlocks) {
        this.port.postMessage({ type: 'meter', peak: this.peak, mean: this.sum / this.blocks, tAudio: currentFrame / sampleRate });
        this.blocks = 0; this.peak = -120; this.sum = 0;
      }
      return true;
    }
  }
  registerProcessor('chirp-detector', ChirpDetector);
}
