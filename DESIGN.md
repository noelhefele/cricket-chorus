# Cricket Chorus — Design (living spec)

**Concept:** Alex Byrn, who originated the idea. **Implementation help:** Noel.
Edit this file as the design changes; record the *why* of each change in
[DECISIONS.md](DECISIONS.md).

## The concept

A distributed artificial chorus system where each phone acts as an autonomous
cricket agent, continuously listening, detecting calls, timestamping them, and
emitting its own call based on a programmable response rule with a refractory
period. The first prototype will implement a two-phone system where one device
plays a synthetic call, and the other detects it, waits a specified delay, and
responds, while logging all events. This creates the foundation for scaling to
multi-phone choruses and testing whether specific interaction rules generate
emergent patterns like synchrony or alternation.

## One agent, several roles

Every phone runs the same agent loop:

1. **Listen** — the microphone runs continuously through a band-pass filter
   centred on the carrier frequency.
2. **Detect** — a call is detected when the band level rises above a
   threshold. After a detection the detector holds off for the length of one
   call, so a multi-pulse chirp counts once.
3. **Decide** — a *response rule* (one small function in `rules.js`) turns a
   detection into "call after N ms" or "stay silent".
4. **Emit** — the chirp is scheduled on the audio clock, so its timing is
   sample-accurate relative to the detection.
5. **Refractory** — from the moment it calls, the agent ignores its
   microphone for a refractory period. This models the cricket's refractory
   period and also stops the phone from hearing itself.

The roles in v0 are presets of this loop:

| Role | Emits when | Responds to detections |
|---|---|---|
| Emitter | on a fixed timer (call period) | no — but it still listens and logs what it hears |
| Responder | a detection, via the response rule | yes |
| Chorister | its own jittered rhythm, adjusted by the coupling rule | yes, by shifting its rhythm |
| Calibrate | a short fixed test sequence | no — measures its own latency |

Because the emitter also listens, its log records the responder's reply on
the emitter's own clock. That gives a round trip measured on one clock, which
avoids needing the two phones' clocks to agree.

## Chirp

A pulse train on a sine carrier, pre-rendered to an audio buffer:

- carrier frequency (default 4500 Hz; real field crickets are roughly 4–5 kHz)
- pulse count (default 3)
- pulse length (default 20 ms), with 2 ms raised-cosine ramps to avoid clicks
- pulse period, start to start (default 40 ms)
- volume (0–1)

## Timing and latency

Every event has three clocks (see [PROTOCOL.md](PROTOCOL.md)). The audio
clock (`t_audio`) is the precise one within a device.

Each phone has a hidden **loopback latency** `L = output latency + input
latency`: the time from "code schedules a chirp" to "the same code's detector
sees it". Calibration mode measures `L` per phone with the phone's own
microphone.

For the two-phone test, on the emitter's clock:

```
reply_detected − call_emitted = L_emitter + L_responder + response_delay + 2 × acoustic travel
```

Acoustic travel is about 3 ms per metre. With both phones calibrated,
anything beyond that identity is behaviour, not hardware.

Calibration measures the *sum* of output and input latency. A single phone
cannot split the two by itself. The identity above only needs the sums.

## Response rule interface

```js
// detection: { t_audio, level_db, seq }
// state:     { pending, lastEmitAudio, ... }
// params:    the on-screen settings
// returns:   delay in ms before calling back, or null to stay silent
export function respond(detection, state, params)
```

v0 rule: while no response is pending, call back after `response_delay_ms`.

## Chorister: rhythm plus coupling

Each chorister is a noisy oscillator. When left alone, it calls every
`call_period_ms`, and each interval is jittered by ±`jitter_pct`. Every
phone runs the same code, and none of them is in charge.

- **Effector window** (`effector_ms`): a call is locked in this long before
  it sounds. Nothing heard after that point can stop it. This models the
  delay between a cricket's decision to call and the sound.
- **Coupling** (`coupling`, in `rules.js`), when a neighbour is heard outside
  the refractory period:
  - `reset`: inhibitory resetting (Greenfield & Roizen 1993). Hearing a call
    restarts the countdown, and the next call comes `reset_delay_ms`
    (jittered) after the detected onset.
  - `none`: the control condition. The phone ignores neighbours.
- A random starting phase stops phones that start together from being "in
  sync" by accident.

`chorister.js` holds the timing logic without any audio, so the app and the
simulation (`tests/chorus-sim.html`) run the same code.

**What the simulation predicts** (2 phones, period 2000 ms, jitter 5%,
refractory 250 ms, about 43 ms from speaker to detector):

| Reset delay | Effector 50 ms | Effector 200 ms |
|---|---|---|
| 800–1400 ms (0.4–0.7 × period) | alternation | alternation |
| 2000 ms (= period) | unstable | **synchrony** |
| 2400 ms (> period) | one phone silenced | mostly one silenced |
| no coupling (control) | depends on start | depends on start |

Two lessons for real runs:

1. **Always run the control.** Over a few minutes, uncoupled phones with the
   same period barely drift. They can look locked at whatever phase they
   started in. A real effect gives the same pattern from different starts.
2. **Synchrony needs an effector window longer than the hearing delay**
   (speaker + air + microphone). Otherwise the leading phone keeps resetting
   the other. This is why the calibration latency matters.

Defaults (reset delay = period, effector 200 ms) should give synchrony.
Changing the reset delay to 1000 ms should give alternation.

## Roadmap

- v0: two phones, emitter + responder, calibration, logs shared by text or email.
- v1 (done, app 0.2.0): the Chorister role, a free-running rhythm reset by
  detections. See above.
- v2: 3+ phones, rule comparison, automatic log merging and plots.
- **Future (Alex):** "Ultimately the program space becomes huge and we
  want the agents to evolve their own parameters." Each agent's settings
  work as its genome: they're already logged per phone and per run, and the
  rules are pluggable. Open questions: what counts as fitness (for example,
  being heard, leading, or matching a target pattern)? Does evolution happen
  within a run or between runs? Do phones copy settings from the neighbours
  they hear?

## Open questions

- Are iOS output and input latency stable across runs, or does each run need
  its own calibration? The logs will show this.
- Detection range and threshold outdoors versus indoors.
- Should the refractory period start at the detection or at the call? (v0:
  at the call.)
