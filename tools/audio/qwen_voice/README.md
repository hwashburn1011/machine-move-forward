# Local Qwen robot voice auditions

These tools create original hunter-robot performances from written direction using the official [Qwen3-TTS VoiceDesign](https://github.com/QwenLM/Qwen3-TTS) model. The audition generator does not modify the game. The player subsequently chose **B — Warden**; its subtle metallic version is now integrated through `tools/audio/opening/build.py`, with the clean B take retained as the reference. Selection, hashes and mix settings are in `assets/opening-memory/audio/voice-selection.json`. The existing lunge/interception and blue sword work remains in place.

## Environment

Verified host: i9-11900KF, RTX 3070 8 GB, 16 GB system RAM. Python 3.12.13 and packages are isolated under `test-results/qwen3-tts/`. CUDA PyTorch 2.9.1, Qwen TTS 0.1.1, BF16 and PyTorch SDPA are used; no FlashAttention compiler or system Python changes are required. Model weights and dependency caches also stay in that ignored directory, outside the game export.

From the repository root (requires the already-installed `uv`):

```powershell
& tools/audio/qwen_voice/setup.ps1
& test-results/qwen3-tts/venv/Scripts/python.exe tools/audio/qwen_voice/generate.py --out assets/voice-auditions/qwen3-tts/new-takes
```

Setup downloads official packages and weights; generation then runs locally with Hugging Face and Transformers offline modes and local-only model loading. There are no paid services, API keys, remote inference calls, or voice uploads. `settings.json` pins the VoiceDesign model revision. `requirements.lock.txt` records the installed package versions. Each output manifest records prompts, seeds, generation options, package versions, processing, hashes and measured GPU use.

## Comparing takes

Each voice has four WAVs: raw model output, clean level-matched audition, subtly metallic version, and a comparison playing clean then metallic with an 850 ms gap. The exact transcript is **There. On the roof.** Clean processing only removes DC/outer silence, fades the first/last 5 ms and adjusts gain. It does not pitch-shift or time-stretch the performance. Metallic processing adds a modest band limit, 5.5% ring modulation and quiet sub-24 ms reflections; gain is matched to the same active speech RMS with a -3 dBFS peak ceiling. No limiter is used.

Raw float WAVs are retained. Auditions and their manifest live under `assets/voice-auditions/`, separate from `godot/assets/audio/`. Use a new output directory for another iteration; the generator rejects overwriting an existing raw take.

## Keeping the chosen identity for future dialogue

Repeating a VoiceDesign prompt/seed is useful for reproducing a take, but does not guarantee speaker identity across different text. Retain the chosen **clean** reference and exact transcript. Qwen's documented design-then-clone workflow uses its Base model to condition later lines on that recording. The Base model is optional and is not needed for these auditions.

After choosing a voice, download it once with `setup.ps1 -DownloadBase`. The first resolved Base revision is recorded in `test-results/qwen3-tts/base-download.json` and reused thereafter. A future line can then be generated locally as follows (example chooses A):

```powershell
& test-results/qwen3-tts/venv/Scripts/python.exe tools/audio/qwen_voice/generate.py `
  --voice a-tracker `
  --clone-reference assets/voice-auditions/qwen3-tts/2026-10-04/a-tracker-clean.wav `
  --reference-text 'There. On the roof.' `
  --text 'You cannot stay ahead forever.' `
  --out assets/voice-auditions/qwen3-tts/future-dialogue
```

Clone mode is prepared but is not part of the initial audition validation. Short references constrain speaker consistency; review a longer chosen-voice reference before producing a full dialogue set. Exact output can vary across hardware/library versions, so preserve the accepted audio files as the authoritative performance. Keep the Base revision record with any future dialogue release.

## Audition validation

The 4 October takes generated in about 5 seconds each, peaking at 4,067 MiB of allocated GPU memory. The clean durations are 2.080, 2.399 and 2.360 seconds. All six clean/metallic files passed finite-sample, mono, checksum and no-clipping checks. A local CPU Whisper tiny.en transcription recovered the four requested words in all six without a prompt. pYIN estimates the clean median voiced pitches at 87.8, 74.1 and 89.6 Hz; measured internal quiet intervals are 0.73–0.82 seconds. These measurements do not substitute for the player's judgment of performance or preferred voice.

`verification.json` records that all 331 protected existing game/audio/animation files remained byte-identical. The generator's optional FlashAttention and SoX import warnings did not prevent VoiceDesign synthesis; this audition pipeline uses SDPA and SciPy processing instead. The requirements lock includes the small local ASR QA tool. Re-run technical/transcript checks with:

```powershell
& test-results/qwen3-tts/venv/Scripts/python.exe tools/audio/qwen_voice/verify.py assets/voice-auditions/qwen3-tts/2026-10-04
```

QA downloads a pinned Whisper tiny.en checkpoint once, then transcribes locally on the CPU. The protected-file baseline is local session evidence in `test-results/qwen3-tts/preservation-before.json`, not a portable test fixture. The recorded audition reports remain useful if that cache is later removed.

The Qwen package and official VoiceDesign weights are published under Apache-2.0; see the [package license](https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE) and [model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign). No real person's recording is used to design these auditions.
