# Reward sounds

The hits, slam and count-up a reward plays (`playRewardSound` in
`src/lib/audio.ts`), in three sets the User picks in Settings → Rewards. Every
source is CC0 (public domain): no attribution is required.

- **Juhani Junkala**, "The Essential Retro Video Game Sound Effects
  Collection" (OpenGameArt, CC0).
- **Kenney**, "Interface Sounds" (kenney.nl, CC0).

| File          | Made from                                                            |
| ------------- | -------------------------------------------------------------------- |
| `punch-hit`   | Junkala `impact6`, with a synthesized sub thump (150 → 48 Hz)        |
| `punch-heavy` | Junkala `impact15`, a sub thump (190 → 40 Hz) and Kenney `bong_001`  |
| `punch-slam`  | Junkala `impact12`, a sub thump (200 → 38 Hz) and Kenney `glass_001` |
| `punch-tick`  | Kenney `pluck_001`                                                   |
| `punch-land`  | Kenney `confirmation_002`                                            |
| `retro-hit`   | Junkala `impact7`                                                    |
| `retro-heavy` | Junkala `impact12`                                                   |
| `retro-slam`  | Junkala `impact15` and `powerup15`                                   |
| `retro-tick`  | Junkala `menu_move4`                                                 |
| `retro-land`  | Junkala `sound_bling`                                                |
| `soft-hit`    | Kenney `drop_001`                                                    |
| `soft-heavy`  | Kenney `bong_001` and `drop_002`                                     |
| `soft-slam`   | Kenney `maximize_006`                                                |
| `soft-tick`   | Kenney `tick_004`                                                    |
| `soft-land`   | Kenney `glass_001`                                                   |

Each is mono, 44.1 kHz, 64 kbps, trimmed with a short fade, and levelled with
ffmpeg (`volume`, then `alimiter`) so the sets play about as loud as each other
at the same player volume.
