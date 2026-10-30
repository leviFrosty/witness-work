# Reward sounds

The hits, slam and count-up a reward plays (`playRewardSound` in
`src/lib/audio.ts`), in seven sets the User picks in Settings → Rewards. They
are Hex's feedback sound sets (github.com/anomalyco/hex, MIT, © 2026
Christopher Langton; license in `scripts/reward-sounds/LICENSE-hex`), recut for
a reward's five roles.

Don't edit these by hand. `scripts/reward-sounds/generate.py` makes all of
them from Hex's own synthesis script (`hex_synth.py`, copied unchanged), Hex's
Classic tones (`classic/`) and its Thock key take (`thock/`):

```sh
uv run scripts/reward-sounds/generate.py
```

| Role    | Plays                              | Made from                                      |
| ------- | ---------------------------------- | ---------------------------------------------- |
| `hit`   | each line, a step higher each time | Hex's start sound                              |
| `heavy` | a milestone's line                 | Hex's done sound (Thock, Click: a heavier key) |
| `slam`  | the total                          | the chord Hex's success lands on, no run-up    |
| `tick`  | each step of the count             | one short note or click of the set's voice     |
| `land`  | the ding the count lands on        | the set's top note, left to ring               |

| Set         | Sounds like                        |
| ----------- | ---------------------------------- |
| `signature` | a kalimba motif in D major         |
| `classic`   | the tones Hex first shipped with   |
| `click`     | mechanical key clicks              |
| `soft`      | warm sine blips in A major         |
| `wood`      | marimba and hollow wood blocks     |
| `analog`    | a mellow analogue synth in F major |
| `thock`     | one deep mechanical keyboard key   |

Each is mono, 44.1 kHz, 64 kbps, and levelled to its role's loudness (the
same in every set, matching the sets these replaced), with at most 4 dB of
soft limiting, so clicks and keys keep their attack and play a little quieter.
