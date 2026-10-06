# Three optional story performances

Annika is an original VoiceDesign character: measured, mature, low alto, practical and compassionate. Wake is her clean reference. Array uses Qwen3-TTS Base with that exact clean reference and its transcript; repeating a VoiceDesign prompt alone would not reliably preserve identity. The berth is a separate understated original machine voice, using the audition's restrained metallic version. Neither character is based on a real person.

The shipped recordings use the existing canonical story text. Wake: 7.920 seconds; Array: 13.128 seconds; berth: 11.440 seconds. Master volume multiplies playback by 0.8; source active RMS is approximately -23 dBFS. Annika remains clean. No model weights, Python environment or inference engine ship in the game.

## Reproduction

Use `test-results/qwen3-tts/venv/Scripts/python.exe`. `tools/audio/qwen_voice/setup.ps1` creates the isolated environment; `tools/audio/qwen_voice/download.py --base` additionally fetches the official continuity model. The original download records pin VoiceDesign `5ecdb67327fd37bb2e042aab12ff7391903235d3` and Base `fd4b254389122332181a7c3db7f27e918eec64e3`. Generation itself is offline.

Run `tools/audio/story_voice/generate.py --out assets/voice-auditions/story/NEW-TAKE` with that Python. It retains raw, clean, processed and comparison files, prompts, seeds, model provenance and hashes. Existing takes are protected from overwrite. For later Annika dialogue, invoke the shared generator's `--clone-reference assets/voice-auditions/story/2026-10-04/wake/annika-clean.wav`, `--reference-text` with the exact Wake script, `--voice annika`, these settings and the new `--text`. Keep the original reference instead of successively cloning previous generated lines.

`build.py` packages the explicitly selected October 4 takes as mono PCM16 and computes sentence cues using the local tiny.en ASR model. The take directory is deliberately fixed so packaging never silently selects a later audition. To select a future take, review it and change that source explicitly. Review `verification.json`: ASR recognizes the complete dialogue but transcribes the possessive Foundry's as Foundry, S-07 as S-007 and traveller as traveler. Those are review flags; automated transcription is not human listening approval. No lines were rewritten to match ASR.

## Runtime contract

`MMFStoryVoice.play(beat_id)` returns false unless the optional local reader is reached, its story fact is known, no combat/death/cinematic blocks it, and volume is enabled. Array additionally requires its existing comparison action; berth requires the completed transmitter. Playback never triggers automatically from notifications. Listen/replay, pause/resume and stop are local controls. Closing the reader, changing chapter/session/control, losing authorization, muting or rewinding state stops and releases playback. The complete transcript stays readable; current sentence follows clip time. Existing menu audio ownership already silences/pauses ambient music while reading, so no persistent bus ducking is added.

Run Godot with `--headless --path godot --script res://tests/story_voice.gd` for isolated lifecycle assertions, and `--path godot --script res://tests/story_voice_review.gd` for prepared native reader captures. These are fixtures, not an earned campaign playthrough.
