#!/usr/bin/env python3
"""Merge cricket-chorus JSONL logs from several phones into one timeline.

    python3 tools/merge.py runs/2026-09-27-first-test/*.jsonl > merged.jsonl
    python3 tools/merge.py --summary runs/2026-09-27-first-test/*.jsonl

Sorts by t_epoch (coarse: phone clocks agree only to tens of ms). Drops
exact duplicate lines, so sharing the same log twice is harmless. See
PROTOCOL.md for fields and for precise cross-device timing.
"""
import json
import statistics
import sys


def load(paths):
    seen, events = set(), []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            for n, line in enumerate(f, 1):
                line = line.strip()
                if not line or line in seen:
                    continue
                seen.add(line)
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    print(f"{path}:{n}: skipped unreadable line", file=sys.stderr)
    events.sort(key=lambda e: (e.get("t_epoch", 0), e.get("device", ""), e.get("seq", 0)))
    return events


def summary(events):
    """Per device: calibration, and emitter single-clock round trips."""
    by_dev = {}
    for e in events:
        by_dev.setdefault(e["device"], []).append(e)
    for dev, evs in by_dev.items():
        roles = sorted({e["role"] for e in evs})
        cal = [e for e in evs if e["event"] == "calibration"]
        print(f"{dev}: roles {', '.join(roles)}; {len(evs)} events")
        if cal:
            c = cal[-1]
            print(f"  loopback latency {c['median_ms']} ms ({c['n_ok']}/{c['n_total']})")
        # Round trip on the emitter's own clock: timer emit -> next detect.
        rt = []
        emits = [e for e in evs if e["event"] == "emit" and e.get("cause") == "timer"]
        dets = [e for e in evs if e["event"] == "detect"]
        for em in emits:
            later = [d for d in dets if d["run"] == em["run"] and d["t_audio"] > em["t_audio"]]
            if later and later[0]["t_audio"] - em["t_audio"] < 5:
                rt.append((later[0]["t_audio"] - em["t_audio"]) * 1000)
        if rt:
            print(f"  round trip (emit -> reply heard): n={len(rt)} "
                  f"median {statistics.median(rt):.1f} ms, "
                  f"min {min(rt):.1f}, max {max(rt):.1f}")


def main(argv):
    if "--summary" in argv:
        argv = [a for a in argv if a != "--summary"]
        summary(load(argv))
        return
    if not argv:
        sys.exit(__doc__)
    for e in load(argv):
        print(json.dumps(e, separators=(",", ":")))


if __name__ == "__main__":
    main(sys.argv[1:])
