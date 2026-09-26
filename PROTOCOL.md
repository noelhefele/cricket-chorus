# Event log protocol (v1)

A log is a text file in **JSON Lines** format: one JSON object per line, one
line per event, UTF-8, `\n` line endings. File name:
`cricket-<device>-<YYYYMMDD-HHMMSS>.jsonl`.

## Fields on every event

| Field | Type | Meaning |
|---|---|---|
| `v` | int | Protocol version (`1`). |
| `event` | string | `config`, `detect`, `emit`, `refractory_start`, `refractory_end`, `calibration`, `run_end`. |
| `device` | string | Device name, set on screen. Defaults to a random `dev-xxxx` that the phone remembers. |
| `run` | string | Random id for one Start→Stop run on one device. |
| `role` | string | `emitter`, `responder` or `calibrate`. |
| `seq` | int | Per-device counter, increasing across runs. |
| `t_audio` | number | **Seconds on the device's audio clock** (`AudioContext.currentTime` timeline) at which the event actually happens. This is the precise clock within one device. For `detect` it is the detected onset. For `emit` it is the scheduled start of the sound. |
| `t_mono` | number | Milliseconds, `performance.now()` timeline (monotonic, high resolution), converted from `t_audio`. |
| `t_epoch` | number | Milliseconds since the Unix epoch, sub-millisecond, `performance.timeOrigin + t_mono`. **This is the merge key across phones.** |
| `wall` | string | ISO-8601 UTC wall-clock time from `Date` when the line was written. For people reading the log. |

Events are written as they happen, so a file is already in time order.
Future events, such as a scheduled call or the end of a refractory period,
are written when their time arrives.

## Event-specific fields

**`detect`**
- `level_db`: band level in dBFS at the onset block
- `threshold_db`: threshold in force
- `muted`: always `false` in v1. The phone does not listen during refractory
  periods, so nothing is detected then.
- `pending`: `true` if a response was already scheduled, so the rule ignored
  this detection

**`emit`**
- `cause`: `timer` (emitter), `response` (responder) or `calibration`
- `in_response_to`: `seq` of the triggering `detect`, or `null`
- `decided_t_audio`: audio time when the call was decided or scheduled
- `delay_ms`: the rule's chosen delay, for `cause = response`

**`refractory_start` / `refractory_end`**
- `duration_ms`: the refractory period

**`config`**: written at the start of every run, and again whenever a
setting changes during a run.
- `params`: all on-screen settings (see below)
- `device_info`: `user_agent`, `sample_rate`, `base_latency`,
  `output_latency`, `audio_session`, `mic_settings` (what the browser
  actually applied, from `MediaStreamTrack.getSettings()`)
- `calibration`: this device's last calibration result, or `null`

**`calibration`**
- `latencies_ms`: one loopback latency per test chirp (`null` if missed)
- `median_ms`, `min_ms`, `max_ms`, `n_ok`, `n_total`
- `level_db`: median detected level of the phone's own chirp

**`run_end`**
- `n_detect`, `n_emit`

## `params`

| Key | Unit | Default |
|---|---|---|
| `carrier_hz` | Hz | 4500 |
| `pulse_count` | — | 3 |
| `pulse_ms` | ms | 20 |
| `pulse_period_ms` | ms (start to start) | 40 |
| `volume` | 0–1 | 1.0 |
| `call_period_ms` | ms (emitter timer) | 2000 |
| `response_delay_ms` | ms | 400 |
| `refractory_ms` | ms | 250 |
| `threshold_db` | dBFS | −45 |
| `filter_q` | — | 6 |
| `rule` | name | `fixed_delay` |

## Merging logs from several phones

```sh
python3 tools/merge.py runs/2026-09-26-first-test/*.jsonl > merged.jsonl
```

This merges by `t_epoch`, which comes from each phone's network-synced clock.
Two phones usually agree to within a few tens of milliseconds. **Do not
compare `t_epoch` across phones at millisecond precision.** For precise
timing:

- Within one device, subtract `t_audio` values.
- Across devices, use the single-clock round trip on the emitter (see
  DESIGN.md → Timing and latency), or estimate the clock offset from matched
  emit→detect pairs.

Without Python: `cat *.jsonl | jq -s -c 'sort_by(.t_epoch)[]'`.
