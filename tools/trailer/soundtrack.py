"""Original 46-second industrial trailer cue; no sampled or licensed music."""
from pathlib import Path
import wave
import numpy as np

RATE = 48000
DURATION = 46
out = Path(__file__).resolve().parents[2] / "assets/trailer/industrial-cue.wav"
out.parent.mkdir(parents=True, exist_ok=True)
t = np.arange(RATE * DURATION) / RATE
rng = np.random.default_rng(9876)
left = np.zeros_like(t)
right = np.zeros_like(t)

# A restrained D minor drone, with slowly breathing harmonics.
for frequency, level, pan in [(36.708, .024, -.1), (73.416, .018, .15),
                               (110, .016, -.35), (146.832, .012, .4)]:
    tone = np.sin(2 * np.pi * frequency * t + .07 * np.sin(t * .6))
    tone *= level * (.65 + .35 * np.sin(t * .31) ** 2)
    left += tone * (1 - pan * .4)
    right += tone * (1 + pan * .4)

# Mechanical pulse: synthesized damped resonators and filtered noise.
beat = 60 / 96
for index, when in enumerate(np.arange(1.25, 43.5, beat)):
    start = int(when * RATE)
    u = np.arange(int(.7 * RATE)) / RATE
    accent = 1 if index % 4 == 0 else .58
    kick = np.sin(2 * np.pi * (46 * u + 7 * (1 - np.exp(-u * 28))))
    kick *= np.exp(-u * 12) * .22 * accent
    clang = (np.sin(2 * np.pi * 384 * u) + .4 * np.sin(2 * np.pi * 873 * u))
    clang *= np.exp(-u * 29) * .032 * accent
    noise = rng.standard_normal(len(u))
    noise = np.convolve(noise, np.ones(5) / 5, mode="same")
    noise *= np.exp(-u * 65) * .018
    pulse = kick + clang + noise
    end = min(len(t), start + len(u))
    left[start:end] += pulse[:end-start]
    right[start:end] += pulse[:end-start] * (.92 if index % 2 else 1)

# Soft rises connect the trailer's cuts; no loud impact stingers.
for when in [6.5, 11.5, 14, 16.5, 19, 21.5, 29.5, 36.5, 41.5]:
    start = int((when - .7) * RATE)
    length = int(1.2 * RATE)
    u = np.linspace(0, 1, length)
    wash = rng.standard_normal(length)
    wash = np.convolve(wash, np.ones(19) / 19, mode="same")
    wash *= np.sin(np.pi * u) ** 2 * .11
    left[start:start+length] += wash
    right[start:start+length] += np.roll(wash, 240)

fade = np.minimum(1, t / 1.2) * np.minimum(1, np.maximum(0, DURATION-t) / 2.2)
stereo = np.column_stack([left, right]) * fade[:, None]
stereo = np.tanh(stereo * 1.5)
stereo *= .45 / max(.001, np.max(np.abs(stereo)))
with wave.open(str(out), "wb") as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes((stereo * 32767).astype('<i2').tobytes())
print(out)
