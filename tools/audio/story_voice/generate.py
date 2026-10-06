"""Reproduce all three local story performances into a NEW audition directory.

Run with the isolated Qwen environment. Models must already be downloaded via
../qwen_voice/download.py (VoiceDesign and --base). Never downloads during speech.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
settings = Path(__file__).with_name('settings.json')
generator = ROOT / 'tools/audio/qwen_voice/generate.py'
wake = json.loads(settings.read_text())['text']
def generate(folder, voice, text, *extra):
    subprocess.run([sys.executable, str(generator), '--settings', str(settings), '--out', str(args.out / folder), '--voice', voice, '--text', text, *extra], check=True)
generate('wake', 'annika', wake)
generate('array', 'annika', 'The advertised civilian corridor leads into the patrol line. S-07 carried passengers before this war. You are one of many we tried to help, not an assignment. There are seeds and family records at the Orchard. Carry them if you choose.', '--clone-reference', str(args.out / 'wake/annika-clean.wav'), '--reference-text', wake)
generate('berth', 'berth', 'Seed enclosure stable. Archive copy verified. A place is ready for the next traveller. No one has promised who will arrive; the channel can still be kept open.')
