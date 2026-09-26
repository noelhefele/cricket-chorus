// Audio engine: context, microphone, detector, chirp synthesis and
// sample-accurate scheduling. Knows nothing about roles or the UI.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.detector = null;
    this.sources = new Set();
    this.onDetect = () => {};
    this.onMeter = () => {};
    this.onStateChange = () => {};
    this.offsets = []; // recent samples of performance.now() - currentTime*1000
  }

  // Must be called from a tap handler (iOS only starts audio from a gesture).
  async start(params) {
    // Everything that needs the tap (context creation, resume, mic request)
    // is started synchronously, before the first await, or iOS refuses it.
    let moduleReady = null;
    if (!this.ctx) {
      // Ask iOS for a record+play session so the silent switch doesn't
      // treat the chirp as muteable "ambient" audio.
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch {}
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.ctx.onstatechange = () => this.onStateChange(this.ctx.state);
      moduleReady = this.ctx.audioWorklet.addModule('detector-worklet.js');
    }
    const resumed = this.ctx.resume();
    const mic = this.stream ? null : navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    await Promise.all([moduleReady, resumed]);

    if (!this.stream) {
      this.stream = await mic;
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.detector = new AudioWorkletNode(this.ctx, 'chirp-detector', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: this.detectorParams(params),
      });
      this.detector.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'detect') this.onDetect(m);
        else if (m.type === 'meter') this.onMeter(m);
      };
      // Keep the worklet pulled by the graph; its output is silent.
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      src.connect(this.detector).connect(sink).connect(this.ctx.destination);
    }
    this.setParams(params);
    if (!this.clockTimer) {
      // currentTime is erratic while a new context starts up; let it settle
      // before trusting it for the audio -> performance.now() mapping.
      await new Promise(r => setTimeout(r, 300));
      this.offsets = [];
      this.sampleClock();
      this.clockTimer = setInterval(() => this.sampleClock(), 50);
    }
  }

  detectorParams(p) {
    return {
      carrierHz: p.carrier_hz,
      q: p.filter_q,
      thresholdDb: p.threshold_db,
      holdMs: chirpDurationMs(p) + 30,
    };
  }

  setParams(p) {
    this.params = p;
    this.buffer = renderChirp(this.ctx.sampleRate, p);
    if (this.detector) this.detector.port.postMessage({ type: 'set', params: this.detectorParams(p) });
  }

  // Schedule a chirp at audio time `when` (seconds). Returns the actual start.
  chirpAt(when) {
    const t = Math.max(when, this.ctx.currentTime + 0.005);
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.connect(this.ctx.destination);
    s.start(t);
    this.sources.add(s);
    s.onended = () => this.sources.delete(s);
    return t;
  }

  mute(from, until) {
    this.detector.port.postMessage({ type: 'mute', from, until });
  }

  stopAll() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear();
    if (this.detector) this.detector.port.postMessage({ type: 'clearMutes' });
  }

  get now() { return this.ctx.currentTime; }

  // Map between the audio clock and performance.now(). currentTime advances
  // in steps, so the smallest recent offset is the tightest estimate.
  sampleClock() {
    if (!this.ctx) return;
    this.offsets.push(performance.now() - this.ctx.currentTime * 1000);
    if (this.offsets.length > 40) this.offsets.shift();
  }

  audioToMono(tAudio) {
    return tAudio * 1000 + Math.min(...this.offsets);
  }

  // Wait until audio time `t` (approximately), for logging future events.
  delayUntil(t) {
    return Math.max(0, (t - this.ctx.currentTime) * 1000);
  }

  deviceInfo() {
    const track = this.stream && this.stream.getAudioTracks()[0];
    return {
      user_agent: navigator.userAgent,
      sample_rate: this.ctx.sampleRate,
      base_latency: this.ctx.baseLatency ?? null,
      output_latency: this.ctx.outputLatency ?? null,
      audio_session: navigator.audioSession ? navigator.audioSession.type : null,
      mic_settings: track ? track.getSettings() : null,
    };
  }
}

export function chirpDurationMs(p) {
  return (p.pulse_count - 1) * p.pulse_period_ms + p.pulse_ms;
}

// Pulse train on a sine carrier with 2 ms raised-cosine ramps.
export function renderChirp(sr, p) {
  const len = Math.ceil(sr * (chirpDurationMs(p) + 5) / 1000);
  const ctxBuf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
  const d = ctxBuf.getChannelData(0);
  const pulse = Math.round(sr * p.pulse_ms / 1000);
  const ramp = Math.min(Math.round(sr * 0.002), pulse >> 1);
  const w = 2 * Math.PI * p.carrier_hz / sr;
  for (let k = 0; k < p.pulse_count; k++) {
    const start = Math.round(sr * k * p.pulse_period_ms / 1000);
    for (let i = 0; i < pulse && start + i < len; i++) {
      let env = 1;
      if (i < ramp) env = 0.5 - 0.5 * Math.cos(Math.PI * i / ramp);
      else if (i >= pulse - ramp) env = 0.5 - 0.5 * Math.cos(Math.PI * (pulse - i) / ramp);
      d[start + i] = p.volume * env * Math.sin(w * i);
    }
  }
  return ctxBuf;
}
