"""Download official pinned weights; synthesis itself runs with networking disabled."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / "test-results/qwen3-tts"
os.environ["HF_HOME"] = str(RUNTIME / "huggingface")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"
from huggingface_hub import HfApi, snapshot_download

parser = argparse.ArgumentParser()
parser.add_argument("--base", action="store_true", help="Download the optional continuity model after a voice is chosen.")
args = parser.parse_args()
settings = json.loads(Path(__file__).with_name("settings.json").read_text(encoding="utf-8"))
model = "Qwen/Qwen3-TTS-12Hz-1.7B-Base" if args.base else settings["model"]
record = RUNTIME / ("base-download.json" if args.base else "design-download.json")
if args.base:
    revision = json.loads(record.read_text())["revision"] if record.exists() else HfApi().model_info(model).sha
else:
    revision = settings["revision"]
destination = RUNTIME / "models" / model.split("/")[-1]
print(f"Downloading {model} at {revision} to {destination}", flush=True)
snapshot_download(repo_id=model, revision=revision, local_dir=destination, max_workers=2)
record.write_text(json.dumps({"model": model, "revision": revision, "path": str(destination)}, indent=2) + "\n")
print("DOWNLOAD_COMPLETE", flush=True)
