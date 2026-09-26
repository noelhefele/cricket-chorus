# Cricket Chorus — Design (living spec)

**Concept:** Noel's colleague, who originated the idea. **Implementation help:** Noel.
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

## Roadmap

- v0: two phones, emitter + responder, calibration, logs shared by text or email.
- v1: every phone is a responder with a spontaneous-call timer (a free-running
  rhythm reset by detections). This is the classic phase-reset model for
  synchrony or alternation.
- v2: 3+ phones, rule comparison, automatic log merging and plots.

## Open questions

- Are iOS output and input latency stable across runs, or does each run need
  its own calibration? The logs will show this.
- Detection range and threshold outdoors versus indoors.
- Should the refractory period start at the detection or at the call? (v0:
  at the call.)
