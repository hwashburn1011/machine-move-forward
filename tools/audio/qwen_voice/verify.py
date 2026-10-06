"""Local technical QA, unbiased ASR spot-check, and protected game-file hashes."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / "test-results/qwen3-tts"
os.environ.update(HF_HOME=str(RUNTIME / "huggingface"), HF_HUB_DISABLE_TELEMETRY="1", HF_HUB_DISABLE_XET="1")
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from huggingface_hub import HfApi, snapshot_download
from faster_whisper import WhisperModel

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
args = parser.parse_args()
directory = args.directory.resolve()
model_id = "Systran/faster-whisper-tiny.en"
record_path = RUNTIME / "asr-download.json"
revision = json.loads(record_path.read_text())["revision"] if record_path.exists() else HfApi().model_info(model_id).sha
model_path = RUNTIME / "models/faster-whisper-tiny.en"
snapshot_download(model_id, revision=revision, local_dir=model_path,
                  allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"], max_workers=2)
record_path.write_text(json.dumps({"model": model_id, "revision": revision}, indent=2) + "\n")
os.environ["HF_HUB_OFFLINE"] = "1"
asr = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
report = {"asr_model": model_id, "asr_revision": revision, "asr_scope": "Local CPU transcription without a text prompt; does not assess acting or voice preference.", "takes": []}
for take in manifest["auditions"]:
    for kind in ["clean", "metallic"]:
        path = directory / take["files"][kind]["file"]
        x, rate = sf.read(path)
        # Feed decoded samples directly; avoid PyAV's optional file-decoding API.
        speech = resample_poly(x, 16000, rate).astype(np.float32)
        segments, _ = asr.transcribe(speech, language="en", beam_size=5, temperature=0,
                                     condition_on_previous_text=False, word_timestamps=True, vad_filter=False)
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments)
        words = [{"word": w.word.strip(), "start": w.start, "end": w.end} for s in segments for w in (s.words or [])]
        item = {"id": take["id"], "kind": kind, "transcript": text,
                "exact_words": re.findall(r"[a-z]+", text.lower()) == ["there", "on", "the", "roof"],
                "words": words, "finite": bool(np.isfinite(x).all()), "mono": x.ndim == 1,
                "sample_rate": rate, "clipped_samples": int(np.count_nonzero(abs(x) >= 1)),
                "sha256_matches": hashlib.sha256(path.read_bytes()).hexdigest() == take["files"][kind]["sha256"]}
        report["takes"].append(item)
        print(json.dumps(item), flush=True)
before = json.loads((RUNTIME / "preservation-before.json").read_text())
changed = [p for p, digest in before.items() if not (ROOT / p).exists() or hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != digest]
report["protected_game_files"] = len(before)
report["changed_game_files"] = changed
report["technical_passed"] = not changed and all(t["finite"] and t["mono"] and t["clipped_samples"] == 0 and t["sha256_matches"] for t in report["takes"])
report["all_transcripts_match"] = all(t["exact_words"] for t in report["takes"])
(directory / "verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("QA_COMPLETE", report["technical_passed"], report["all_transcripts_match"], flush=True)
