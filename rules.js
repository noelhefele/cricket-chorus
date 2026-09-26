// Response rules. Each rule decides what an agent does when it detects a call.
//
//   detection: { seq, t_audio, level_db }
//   state:     { pending: bool, lastEmitAudio: seconds | null }
//   params:    the on-screen settings
//   returns:   delay in ms before calling back, or null to stay silent
//
// To try a new rule, add it here and pick it in Settings (`rule`).

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
