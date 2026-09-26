# Cricket Chorus — project context

Phones act as cricket agents: listen → detect chirp → response rule →
chirp → refractory period. Every event is logged as JSON Lines.

- **People:** the concept is Alex Byrn's (he's on an iPhone and may
  not use GitHub). Noel owns the repo (`noelhefele/cricket-chorus`, public so that
  free GitHub Pages works; logs in `runs/` are public)
  and does most of the implementation. They work async.
- **Live app:** https://noelhefele.github.io/cricket-chorus/ (GitHub Pages
  from `main`, root). Every push to `main` deploys. Alex only ever
  uses this link, so keep `main` working.
- **Main target is iOS Safari.** Audio starts only from a tap. getUserMedia
  runs with echoCancellation, noiseSuppression and autoGainControl off. The
  screen is kept awake with the Wake Lock API. The silent switch can mute
  output.
- **No build step, no dependencies.** Plain ES modules: `app.js` (UI, log),
  `audio.js` (context, mic, chirp, scheduling), `detector-worklet.js`
  (band-pass + threshold detector, runs on the audio thread), `rules.js`
  (the swappable response rule).
- **Specs:** DESIGN.md is the living spec. PROTOCOL.md is the log format;
  bump `v` if it changes incompatibly. DECISIONS.md is append-only and dated:
  add an entry for any design decision, and never edit old entries.
- **Logs:** `runs/YYYY-MM-DD-<label>/` holds committed test logs plus a short
  `notes.md`. Merge them with `tools/merge.py`.
- **Timing:** `t_audio` is the precise per-device clock. `t_epoch` is for
  coarse cross-device merging only. Calibration measures each phone's
  loopback latency (output + input).
- Test the detector with `tests/detector.html` (OfflineAudioContext, runs in
  any browser).
- Work in small commits and push each one.
