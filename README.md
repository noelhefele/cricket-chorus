# Cricket Chorus

Phones that behave like crickets. Each phone listens for a short chirp and
answers with a chirp of its own, following a simple rule. We start with two
phones: one calls, the other answers. Later we want many phones calling
together, to see whether patterns appear, such as chirping in sync or taking
turns.

The idea is Noel's colleague's. Noel is helping build it. The details are in
[DESIGN.md](DESIGN.md).

## What you need

- An iPhone (or any phone) with Safari or Chrome.
- A quiet room.
- The link: **https://noelhefele.github.io/cricket-chorus/**

You don't need to install anything or create an account.

## Before you start (every time)

1. Turn the **ringer/silent switch to ring** (on iPhones with an Action
   button, make sure Silent mode is off). Silent mode can mute the chirps.
2. Turn the **volume all the way up**.
3. Take off headphones and disconnect Bluetooth speakers.
4. Keep the page open and on screen while a test runs.

## Step 1: Calibrate (once per phone, about 10 seconds)

This measures how long your phone takes to play a sound and hear it again,
so we don't mistake your phone's delay for cricket behaviour.

1. Open the link.
2. Type a name for your phone, for example `Anna-iPhone`.
3. Tap **Calibrate**, then **Start**. When asked, **allow the microphone**.
4. The phone chirps 6 times by itself. Stay quiet.
5. The screen shows a result such as `Loopback latency: 38 ms (6/6)`.
   - If it says fewer than 6/6, tap **Auto-set threshold** in a silent room
     and try again.

## Step 2: Run the two-phone test

Put the two phones about 1 metre apart, speakers facing each other.

**Phone A (the caller):** tap **Emitter**, then **Start**.
It chirps every 2 seconds.

**Phone B (the answerer):** tap **Responder**, then **Start**.
Each time it hears phone A, it waits a moment and chirps back.

Let it run for about 1 minute, then tap **Stop** on both phones.

If phone B never answers, tap **Auto-set threshold** on phone B while the
room is quiet, then start again.

## Step 3: Send the log

Tap **Share log**. Your phone's share menu opens. Choose Messages or Mail
and send the file to Noel. That's it.

If sharing doesn't work, tap **Copy log** and paste it into a message
instead.

## Settings

Tap **Settings** to change the chirp (pitch, number of pulses, length),
the timing (how often the caller chirps, how long the answerer waits, how
long it ignores sound after chirping) and the detection threshold. Every
setting is saved in the log, so you don't need to note them down.

---

## For developers

- Plain static files, no build step: [index.html](index.html),
  [app.js](app.js), [audio.js](audio.js),
  [detector-worklet.js](detector-worklet.js), [rules.js](rules.js).
- The response rule lives in [rules.js](rules.js). Swap it to try new rules.
- Run locally: `python3 -m http.server 8000` and open
  `http://localhost:8000` (browsers allow the microphone on localhost). To
  test on a phone, use the GitHub Pages link, which provides HTTPS.
- Detector self-test: open `/tests/detector.html`.
- The log format is in [PROTOCOL.md](PROTOCOL.md). Merge logs with
  `python3 tools/merge.py a.jsonl b.jsonl`.
- Test logs go in [runs/](runs/), one folder per dated run.
- Every push to `main` deploys to GitHub Pages.
