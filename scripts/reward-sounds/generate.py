# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy"]
# ///
"""The reward sounds, one set per Hex sound set, made reproducibly.

Run: uv run scripts/reward-sounds/generate.py   (rewrites src/assets/audio/reward/)

Every voice comes from Hex's feedback sounds (`hex_synth.py`, copied
unchanged from github.com/anomalyco/hex `scripts/sounds/synth.py`, MIT, see
LICENSE-hex), and so do Classic's two tones and Thock's key take. Hex plays a
dictation (start, stop, done); a reward plays five roles instead:

- hit: each line of the stack, sped up a step a line. Hex's start sound.
- heavy: a milestone's line. Hex's done sound, the set's ringing dyad.
- slam: the total. The chord Hex's success lands on, with no run-up.
- tick: each step of the count, many in a row. One short note of the voice.
- land: the ding the count lands on. The voice's top note, left to ring.

Each is leveled to its role's target (max momentary loudness, as Hex measures
it) so every set plays about as loud as the others and as the sets before
them, then written as a mono 44.1 kHz 64 kbps MP3.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hex_synth as h  # noqa: E402
from hex_synth import (  # noqa: E402
    SR, bar, block, faded, hz, keys, mix, synth, take_cut, first_hit_ms,
    tick, tine, varispeed, warm,
)

OUT = HERE.parents[1] / "src" / "assets" / "audio" / "reward"

# role -> target LUFS (max momentary), from the sets these replace
TARGETS = {"hit": -20.0, "heavy": -15.0, "slam": -13.0, "tick": -28.0, "land": -16.0}
CEILING = 10 ** (-1.0 / 20)
MAX_LIMIT_DB = 4.0


def signature():
    D5, Fs5, A5, B5, D6 = map(hz, ["D5", "F#5", "A5", "B5", "D6"])
    s = h.signature()
    chord = [(0, tine(D6, 0.85, 0.28))]
    for i, (f, a) in enumerate([(D5, 0.35), (Fs5, 0.3), (A5, 0.3), (B5, 0.32)]):
        chord.append((0.012 * i, a * tine(f, 0.85, 0.3, index=1.2, tick_amt=0)))
    return {
        "hit": s["start"],
        "heavy": s["done"],
        "slam": mix(chord, 0.86),
        "tick": tine(B5, 0.07, 0.02),
        "land": mix([(0, tine(D6, 0.5, 0.14)), (0.006, 0.35 * tine(A5, 0.5, 0.12, tick_amt=0))], 0.5),
    }


def click():
    s = h.click()
    press = tick(body=1500, thock=250, thock_amt=0.75, thock_tau=0.022, body_tau=0.005, dur=0.08)
    t = h.t_axis(0.35)
    ring = 0.12 * np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.07) * h.attack(len(t), 1)
    return {
        "hit": s["start"],
        "heavy": mix([(0, press), (0.014, 0.3 * tick(body=1100, noise_amt=0.5, dull=5000)),
                      (0.05, 0.8 * tick(body=2600, body_tau=0.004))], 0.13),
        "slam": mix([(0, press), (0, ring), (0.014, 0.3 * tick(body=1100, noise_amt=0.5, dull=5000))], 0.36),
        "tick": tick(body=2600, body_tau=0.0035, dur=0.04),
        "land": mix([(0, s["done"]), (0.055, 0.8 * ring)], 0.42),
    }


def soft():
    A5, Cs6, E6, A6 = map(hz, ["A5", "C#6", "E6", "A6"])
    s = h.soft()
    return {
        "hit": s["start"],
        "heavy": s["done"],
        "slam": mix([(0, warm(A6, 0.75, 0.22, bell=0.08, atk_ms=1.5)),
                     (0, 0.35 * warm(A5, 0.75, 0.25, atk_ms=1.5)),
                     (0, 0.25 * warm(E6, 0.75, 0.2, atk_ms=1.5)),
                     (0.006, 0.3 * warm(Cs6, 0.75, 0.2))], 0.76),
        "tick": warm(E6, 0.06, 0.018, atk_ms=1.0),
        "land": warm(A6, 0.45, 0.12, bell=0.08, atk_ms=1.5),
    }


def wood():
    B5, D6, G6 = map(hz, ["B5", "D6", "G6"])
    s = h.wood()
    roll = [(0.055 * i, a * bar(G6, 0.8 - 0.055 * i, 0.28, hardness=0.5))
            for i, a in enumerate([1.0, 0.55, 0.4, 0.3])]
    roll += [(0.008, 0.45 * bar(D6, 0.8, 0.3, hardness=0.3)),
             (0.016, 0.35 * bar(B5, 0.8, 0.3, hardness=0.3))]
    return {
        "hit": s["start"],
        "heavy": s["done"],
        "slam": mix(roll, 0.85),
        "tick": block(1400, 0.05, 0.01, dull=6000),
        "land": bar(G6, 0.45, 0.12, hardness=0.6),
    }


def analog():
    F5, A5, C6, E6, F6 = map(hz, ["F5", "A5", "C6", "E6", "F6"])
    s = h.analog()
    bloom = [(0, a * synth(f, 0.85, 0.28, open_=7, close=1.4, filter_tau=0.18, detune=9))
             for f, a in ((F5, 0.45), (A5, 0.4), (C6, 0.4), (E6, 0.35), (F6, 0.45))]
    return {
        "hit": s["start"],
        "heavy": s["done"],
        "slam": mix(bloom, 0.86),
        "tick": synth(C6, 0.06, 0.018),
        "land": synth(F6, 0.45, 0.12, filter_tau=0.06),
    }


def thock():
    take = h.decode_take("mech-key-thock.mp3")
    press = take_cut(take, first_hit_ms(take, 45, 60), 112, 40)
    release = take_cut(take, first_hit_ms(take, 145, 165), 60, 30)
    return {
        "hit": press,
        "heavy": keys([(0, 1.0, varispeed(press, -3)), (110, 0.7, varispeed(release, -3))]),
        "slam": keys([(0, 1.0, varispeed(press, -5)), (8, 0.6, varispeed(press, 3)),
                      (140, 0.8, varispeed(release, 3))]),
        "tick": faded(varispeed(press, 4), 45, 25),
        "land": keys([(0, 0.6, faded(varispeed(press, 7), 50, 25)), (70, 1.0, varispeed(release, 5))]),
    }


def read_wav(path):
    """A WAV as mono floats at SR, so it can be played faster or slower."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def classic():
    """The tones Hex first shipped, as Hex trimmed them (`classic/`)."""
    start = read_wav(HERE / "classic" / "start.wav")
    stop = read_wav(HERE / "classic" / "stop.wav")
    return {
        "hit": start,
        "heavy": varispeed(start, -4),
        "slam": keys([(0, 1.0, varispeed(start, -7)), (60, 0.8, stop)]),
        "tick": faded(varispeed(start, 5), 50, 25),
        "land": varispeed(stop, 4),
    }


SETS = {"signature": signature, "classic": classic, "click": click, "soft": soft,
        "wood": wood, "analog": analog, "thock": thock}


def level(x, target):
    """Trimmed and raised to `target`, its peaks softly limited under the
    ceiling. A click or a key reaches its target only by losing its attack, so
    the limiter takes at most MAX_LIMIT_DB and those play a little quieter."""
    x = h.trim_tail(x.astype(np.float64), SR)
    x[0] = 0.0
    gain = 10 ** ((target - h.max_momentary_lufs(x)) / 20)
    gain = min(gain, CEILING * 10 ** (MAX_LIMIT_DB / 20) / np.max(np.abs(x)))
    x *= gain
    return h.soft_limit(x, CEILING) if np.max(np.abs(x)) > CEILING * 0.7 else x


def write_mp3(path, x):
    with tempfile.NamedTemporaryFile(suffix=".f32") as raw:
        raw.write(np.clip(x, -1, 1).astype(np.float32).tobytes())
        raw.flush()
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
                        "-i", raw.name, "-ar", "44100", "-ac", "1", "-b:a", "64k",
                        "-map_metadata", "-1", str(path)], check=True)
    print(f"  {path.stem:16s} {len(x) / SR * 1000:5.0f} ms  {h.max_momentary_lufs(x):6.1f} LUFS  "
          f"peak {20 * np.log10(np.max(np.abs(x))):5.1f} dBFS")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.mp3"):
        old.unlink()
    for name, build in SETS.items():
        print(name)
        h.rng = np.random.default_rng(6)  # fixed seed per set: same noise every run
        for role, x in build().items():
            write_mp3(OUT / f"{name}-{role}.mp3", level(x, TARGETS[role]))


if __name__ == "__main__":
    main()
