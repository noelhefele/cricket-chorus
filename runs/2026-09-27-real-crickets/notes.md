# 2026-09-27 — First test with real crickets

**Who:** Alex Byrn, on his iPhone.

**What Alex reported** (by message to Noel, first report):

> Just tested with real crickets. It responds!

> We have leader following dynamics

This is the first real-world run, and the first time the app has run on
iOS. The detector picks up real cricket calls, and the phone answers them.

## Still to collect

- [ ] Alex's log file (Share log). It records the role, all settings, the
      app version and every detection and call.
- [ ] Species, and roughly how many crickets could be heard
- [ ] Indoors or outdoors, distance from phone to crickets
- [ ] **Temperature.** Cricket chirp rate depends strongly on temperature,
      so it's needed to compare runs.
- [ ] Who led: did the phone follow the crickets, did the crickets follow
      the phone, or did it switch?

## Things to check before interpreting "leader following"

- **Which role was running?** A Responder follows by design: it only calls
  after hearing a call. So following is only an emergent result in
  Chorister mode, or if the *crickets* follow the phone.
- **The log only shows the phone's side:** its own calls and the cricket
  calls it detected. Whether crickets shift their timing in response to
  the phone has to be read from the timing of their calls relative to the
  phone's calls. The phone can do that for us.
- **The detector can't tell crickets apart.** Several crickets calling
  close together can merge into one detection.
