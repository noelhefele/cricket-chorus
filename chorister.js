// A chorister: an agent with its own rhythm that the coupling rule adjusts
// when it hears a neighbour. Pure timing logic, no audio, so the app and the
// simulation test (tests/chorus-sim.html) run exactly the same code.
// All times are audio-clock seconds.
import { couple } from './rules.js';

export class Chorister {
  constructor(params, now, rand = Math.random) {
    this.params = params;
    this.rand = rand;
    this.lastCall = null;
    // Random starting phase, so phones started together are not in sync
    // by accident.
    this.nextCall = now + 0.3 + rand() * params.call_period_ms / 1000;
    this.nextInterval = null; // interval that led to nextCall, ms
  }

  jitter(ms) {
    return ms * (1 + (2 * this.rand() - 1) * this.params.jitter_pct / 100);
  }

  // Commit the next call once it is inside the effector window (from then
  // on nothing heard can stop it). Returns { t, interval_ms } or null.
  due(now) {
    if (this.nextCall - now > this.params.effector_ms / 1000) return null;
    const call = { t: this.nextCall, interval_ms: this.nextInterval };
    this.lastCall = call.t;
    this.nextInterval = this.jitter(this.params.call_period_ms);
    this.nextCall = call.t + this.nextInterval / 1000;
    return call;
  }

  // A neighbour's call was detected. Returns { from, to, interval_ms } if
  // the rule moved the next call, else null.
  hear(detection) {
    const d = couple(detection, { nextCall: this.nextCall, lastCall: this.lastCall }, this.params);
    if (d == null) return null;
    const from = this.nextCall;
    this.nextInterval = this.jitter(d);
    this.nextCall = detection.t_audio + this.nextInterval / 1000;
    return { from, to: this.nextCall, interval_ms: this.nextInterval };
  }
}
