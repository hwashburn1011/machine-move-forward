"""Local original-voice auditions. Never writes into the game's runtime assets."""
import argparse
import hashlib
import importlib.metadata
import json
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / "test-results/qwen3-tts"
os.environ.update(HF_HOME=str(RUNTIME / "huggingface"), HF_HUB_OFFLINE="1",
                  TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                  GRADIO_ANALYTICS_ENABLED="False", TOKENIZERS_PARALLELISM="false")
import numpy as np
import soundfile as sf
import torch
from scipy.signal import butter, sosfilt
from qwen_tts import Qwen3TTSModel


def active_rms(x, rate):
    width = max(1, rate // 100)
    padded = np.pad(x, (0, (-len(x)) % width)).reshape(-1, width)
    levels = np.sqrt(np.mean(padded ** 2, axis=1))
    selected = padded[levels > max(float(levels.max()) * 0.06, 1e-7)]
    return float(np.sqrt(np.mean(selected ** 2))) if selected.size else 0.0


def level(x, rate, config):
    gain = 10 ** (config["target_active_rms_dbfs"] / 20) / max(active_rms(x, rate), 1e-9)
    gain = min(gain, 10 ** (config["peak_ceiling_dbfs"] / 20) / max(float(np.max(np.abs(x))), 1e-9))
    return (x * gain).astype(np.float32)


def prepare(raw, rate, config):
    x = np.asarray(raw, dtype=np.float32).reshape(-1)
    if not np.isfinite(x).all() or not 0.6 < len(x) / rate < config.get("max_audio_seconds", 13):
        raise ValueError("Invalid or unexpectedly long/short generation; audition needs another take.")
    x = x - np.mean(x)
    active = np.flatnonzero(np.abs(x) > max(float(np.max(np.abs(x))) * 0.003, 1e-5))
    if not active.size:
        raise ValueError("Silent generation")
    start = max(0, int(active[0]) - round(rate * 0.04))
    end = min(len(x), int(active[-1]) + round(rate * 0.18))
    x = x[start:end].copy()
    fade = min(round(rate * 0.005), len(x) // 2)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    return level(x, rate, config), {"trim_start_samples": start, "trim_end_sample": end}


def metallic(clean, rate, config):
    x = sosfilt(butter(2, [config["highpass_hz"], min(config["lowpass_hz"], rate * 0.45)],
                       fs=rate, btype="bandpass", output="sos"), clean)
    phase = np.arange(len(x), dtype=np.float64) / rate
    wet = config["ring_modulation_wet"]
    y = x * (1 - wet + wet * np.cos(2 * np.pi * config["ring_modulation_hz"] * phase))
    y = np.pad(y, (0, round(rate * 0.08)))
    for milliseconds, gain in zip(config["delays_ms"], config["delay_gains"]):
        delay = round(rate * milliseconds / 1000)
        y[delay:delay + len(x)] += x * gain
    return level(y, rate, config)


def describe(path, x, rate):
    return {"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "seconds": round(len(x) / rate, 4), "sample_rate": rate,
            "peak_dbfs": round(20 * np.log10(max(float(np.max(np.abs(x))), 1e-9)), 2),
            "active_rms_dbfs": round(20 * np.log10(max(active_rms(x, rate), 1e-9)), 2),
            "clipped_samples": int(np.count_nonzero(np.abs(x) >= 1))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--settings", type=Path, default=Path(__file__).with_name("settings.json"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--voice", help="One voice id; default generates all three.")
    parser.add_argument("--text", help="Optional future dialogue. Design alone does not lock speaker identity.")
    parser.add_argument("--clone-reference", type=Path, help="A chosen CLEAN audition; uses the separately downloaded Base model.")
    parser.add_argument("--reference-text", default="There. On the roof.")
    args = parser.parse_args()
    settings = json.loads(args.settings.read_text(encoding="utf-8"))
    voices = [v for v in settings["voices"] if not args.voice or v["id"] == args.voice]
    if not voices or (args.clone_reference and len(voices) != 1):
        parser.error("Choose a valid --voice; clone mode requires exactly one.")
    output = args.out.resolve()
    if output == ROOT / "godot" or ROOT / "godot" in output.parents:
        parser.error("Audition generation must not write into the Godot project.")
    output.mkdir(parents=True, exist_ok=True)
    if any((output / (v["id"] + "-raw.wav")).exists() for v in voices):
        parser.error("Use a new output folder to preserve existing auditions.")
    if not torch.cuda.is_available():
        raise RuntimeError("The installed CUDA runtime cannot access the GPU.")
    torch.set_num_threads(4)
    torch.backends.cudnn.benchmark = False
    torch.backends.cuda.matmul.allow_tf32 = False
    record = json.loads((RUNTIME / ("base-download.json" if args.clone_reference else "design-download.json")).read_text())
    print("Loading local model", record["model"], flush=True)
    model = Qwen3TTSModel.from_pretrained(record["path"], device_map="cuda:0", dtype=torch.bfloat16,
                                         attn_implementation=settings["attention"], local_files_only=True,
                                         low_cpu_mem_usage=True)
    report = {"created_utc": datetime.now(timezone.utc).isoformat(), "model": record,
              "networking": "HF_HUB_OFFLINE=1; TRANSFORMERS_OFFLINE=1; local_files_only=True",
              "gpu": torch.cuda.get_device_name(), "settings": settings,
              "packages": {p: importlib.metadata.version(p) for p in ["qwen-tts", "torch", "torchaudio", "transformers", "accelerate", "numpy", "scipy", "soundfile"]},
              "auditions": []}
    text = args.text or settings["text"]
    reference = None
    if args.clone_reference:
        reference = model.create_voice_clone_prompt(ref_audio=str(args.clone_reference.resolve()), ref_text=args.reference_text)
        report["clone_reference"] = {"path": str(args.clone_reference), "text": args.reference_text,
                                     "sha256": hashlib.sha256(args.clone_reference.read_bytes()).hexdigest()}
    for voice in voices:
        seed = voice["seed"]
        random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
        torch.cuda.reset_peak_memory_stats()
        started = time.perf_counter()
        print("Generating", voice["id"], flush=True)
        with torch.inference_mode():
            if reference:
                wavs, rate = model.generate_voice_clone(text=text, language=settings["language"], voice_clone_prompt=reference, **settings["generation"])
            else:
                wavs, rate = model.generate_voice_design(text=text, language=settings["language"], instruct=voice["instruct"], non_streaming_mode=True, **settings["generation"])
        raw = np.asarray(wavs[0], dtype=np.float32)
        clean, edits = prepare(raw, rate, settings["processing"])
        metal = metallic(clean, rate, settings["processing"])
        pair = np.concatenate([clean, np.zeros(round(rate * 0.85)), metal])
        take = {"id": voice["id"], "label": voice["label"], "seed": seed, "text": text,
                "instruct": voice["instruct"], "mode": "clone" if reference else "design",
                "generation_seconds": round(time.perf_counter() - started, 2),
                "gpu_peak_allocated_mb": round(torch.cuda.max_memory_allocated() / 2**20, 1),
                "edits": edits, "files": {}}
        for kind, samples in [("raw", raw), ("clean", clean), ("metallic", metal), ("comparison", pair)]:
            path = output / (voice["id"] + "-" + kind + ".wav")
            sf.write(path, samples, rate, subtype="FLOAT" if kind == "raw" else "PCM_24")
            take["files"][kind] = describe(path, samples, rate)
        report["auditions"].append(take)
        (output / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"id": voice["id"], "seconds": take["files"]["clean"]["seconds"], "generation_seconds": take["generation_seconds"], "peak_gpu_mb": take["gpu_peak_allocated_mb"]}), flush=True)
        torch.cuda.empty_cache()
    print("AUDITIONS_COMPLETE", output, flush=True)


if __name__ == "__main__":
    main()
