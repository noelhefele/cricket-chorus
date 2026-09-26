# Test runs

One folder per test session, named `YYYY-MM-DD-<short-label>`, for example
`2026-09-27-first-two-phone`.

Each folder holds:

- the raw `.jsonl` logs exactly as the phones shared them (don't edit them)
- `notes.md`: who was there, which phones, the room, the distance between
  phones, and anything odd that happened
- optionally `merged.jsonl` from `python3 tools/merge.py *.jsonl > merged.jsonl`
