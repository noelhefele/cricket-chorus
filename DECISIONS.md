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

## 2026-09-26 — Repo made public

- **The repo is public.** This supersedes "private repo" from the project
  start. GitHub's free plan only serves Pages from public repos. The app is a
  website, so its code is visible anyway. The repo holds no secrets.
  **Consequence: committed run logs in `runs/` are public.** They contain
  device names, timestamps and the phone's browser user agent. Name phones
  by role, such as `alex-iphone`, not by anything more personal.
- **GitHub Pages serves `main` from the repo root.** Every push deploys.

## 2026-09-26 — Logs record the app version

- **Every `config` event carries `app: {version, commit, built}`.** The live
  app changes on every push, so a log must say which code produced it.
  `version` is bumped by hand when behaviour changes. `commit` and `built`
  are stamped automatically.
- **Pages now deploys through a GitHub Actions workflow**
  (`.github/workflows/pages.yml`) instead of straight from the branch. This
  supersedes "GitHub Pages serves `main` from the repo root" (entry above).
  The workflow is what writes the commit into `app.js`. There is still no
  build step to run locally.
- The version also shows next to the title in the app, so Alex can tell
  which build he has.
- Caveat: Safari can serve cached files for up to 10 minutes after a deploy.
  During that window the stamp can be one deploy old.

## 2026-09-26 — Chorister role (app 0.2.0)

- **A fourth role, Chorister**, gives each phone its own jittered rhythm that
  a coupling rule adjusts when it hears a neighbour. The first rule is
  inhibitory resetting (Greenfield & Roizen 1993). `none` is the control. The
  existing roles are unchanged.
- **Timing logic lives in `chorister.js`, separate from audio**, so the
  simulation test runs the same code as the app.
- **The effector window defaults to 200 ms, not 50.** The simulation showed
  that synchrony needs this window to be longer than the speaker-to-detector
  delay. At 50 ms the leading phone keeps resetting the other.
- **A random starting phase, plus a mandatory control condition.**
  Uncoupled phones with the same period can look locked for minutes, so a
  pattern only counts if it recurs from different starts and is absent under
  `coupling = none`.
- **Future direction noted (Alex):** agents evolving their own parameters.
  Not built. The design keeps every behaviour parameterised and logged so
  this stays possible.

## 2026-09-26 — Cache-busting on deploy

- **At deploy, every `.js`/`.css` reference is tagged with `?v=<commit>`.**
  The workflow does this. Straight after the 0.2.0 deploy, a browser loaded
  a cached old `rules.js` alongside the new `chorister.js`, and the app
  failed to start. Tagging the references makes each deploy load as one
  consistent set. It is still possible to see the previous version for a
  few minutes, because `index.html` itself is cached, but not a broken mix.
- New files must be referenced with a quoted `.js`/`.css` path so the
  workflow's rewrite catches them.
