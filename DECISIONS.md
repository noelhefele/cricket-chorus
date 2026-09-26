# Decisions

Append-only. Newest at the bottom. Never edit or delete an old entry. If a
decision changes, add a new entry that supersedes it and refer back to the
old one.

---

## 2026-09-26 — Project start

- **The concept is Alex Byrn's.** Noel is helping build it. See
  [DESIGN.md](DESIGN.md).
- **Web app, not a native app.** Both phones just open a URL. No install, no
  App Store.
- **iOS Safari is the main target**, because Alex uses an iPhone.
- **You only need a link to take part.** Alex may not have a GitHub
  account. He must be able to open the link, run a test, and send the log.
  Noel holds the repo. Alex can join it later.
- **Hosting is GitHub Pages under Noel's account.** It provides the HTTPS
  that browsers need before they allow microphone access.
- **This is its own repo** (`cricket-chorus`). It is not part of any other
  project.
- **The log format is JSON Lines**, one event per line, as defined in
  [PROTOCOL.md](PROTOCOL.md). Logs from two phones merge by concatenating and
  sorting.
- **Refractory period starts when the phone calls.** It also stops a phone
  from detecting its own call.
- **Output and input latency are measured with the phone's own microphone**
  (calibration mode), so hardware latency is never mistaken for chorus
  behaviour.
- **No build step, no dependencies.** The app is plain HTML, CSS and
  JavaScript served as static files, so anyone can read or change it.
- **The detector runs in an AudioWorklet** with its own band-pass filter. It
  timestamps detections on the audio clock to within one sample.
- **The emitter also listens.** It logs replies on its own clock, which gives
  a single-clock round-trip measurement.
- **iOS microphone setup:** echoCancellation, noiseSuppression and
  autoGainControl are all off. Audio starts only from a tap. The screen is
  kept awake during a run with the Wake Lock API.
