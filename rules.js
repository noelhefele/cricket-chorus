// Rules for what an agent does when it hears a call.
//
//   detection: { seq, t_audio, level_db }
//   state:     role-specific (see below)
//   params:    the on-screen settings
//   returns:   delay in ms, or null to do nothing
//
// To try a new rule, add it here and pick it in Settings.

// Responder rules: delay before calling back.
//   state: { pending: bool, lastEmitAudio: seconds | null }
export const rules = {
  // v0: answer every call after a fixed delay, unless already about to call.
  fixed_delay(detection, state, params) {
    if (state.pending) return null;
    return params.response_delay_ms;
  },
};

export function respond(detection, state, params) {
  const rule = rules[params.rule] || rules.fixed_delay;
  return rule(detection, state, params);
}

// Chorister couplings: how hearing a neighbour changes the agent's own
// rhythm. The return value is the delay, from the detected onset, to the
// agent's next call (jitter is added by the caller); null leaves the rhythm
// alone. A call already inside the effector window is never cancelled.
//   state: { nextCall: seconds, lastCall: seconds | null }
export const couplings = {
  // Control condition: ignore neighbours; the rhythm free-runs.
  none() {
    return null;
  },
  // Inhibitory resetting (Greenfield & Roizen 1993): hearing a neighbour
  // restarts the countdown to the next call.
  reset(detection, state, params) {
    return params.reset_delay_ms;
  },
};

export function couple(detection, state, params) {
  const rule = couplings[params.coupling] || couplings.reset;
  return rule(detection, state, params);
}
