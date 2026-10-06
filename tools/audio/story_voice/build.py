"""Package original local performances and derive sentence cues from local ASR.

ASR is evidence for review, not a replacement for listening. Nothing is generated
or uploaded here. This script never touches the opening voice.
"""
import hashlib
import json
import os
import re
from pathlib import Path
from difflib import SequenceMatcher
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[3]
os.environ['HF_HUB_OFFLINE'] = '1'
SOURCE = ROOT / 'assets/voice-auditions/story/2026-10-04'
DEST = ROOT / 'godot/assets/audio/story'
DEST.mkdir(parents=True, exist_ok=True)
DATA = {
    'wake-dispatch': ('wake/annika-clean.wav', "I kept the civilian line open. Someone is replacing its bearings with obstruction reports. The Foundry's service reader can identify the routing mark."),
    'array-false-corridor': ('array/annika-clean.wav', 'The advertised civilian corridor leads into the patrol line. S-07 carried passengers before this war. You are one of many we tried to help, not an assignment. There are seeds and family records at the Orchard. Carry them if you choose.'),
    'berth-keep-the-channel': ('berth/berth-metallic.wav', 'Seed enclosure stable. Archive copy verified. A place is ready for the next traveller. No one has promised who will arrive; the channel can still be kept open.')
}
model = WhisperModel(str(ROOT / 'test-results/qwen3-tts/models/faster-whisper-tiny.en'), device='cpu', compute_type='int8', cpu_threads=4)
catalog, review = {}, {}
def tokens(text):
    return re.findall(r"[a-z0-9']+", text.lower().replace('s-07', 's zero seven'))
for key, (source, script) in DATA.items():
    audio, rate = sf.read(SOURCE / source, dtype='float32')
    assert np.isfinite(audio).all() and np.max(np.abs(audio)) < 1
    output = DEST / (key + '.wav')
    sf.write(output, audio, rate, subtype='PCM_16')
    segments, info = model.transcribe(resample_poly(audio, 2, 3) if rate == 24000 else audio, language='en', beam_size=5, word_timestamps=True, vad_filter=False)
    segments = list(segments)
    words = [word for segment in segments for word in segment.words]
    heard = ' '.join(segment.text.strip() for segment in segments)
    recognized, timed = [], []
    for word in words:
        for token in tokens(word.word):
            recognized.append(token); timed.append(word)
    expected = tokens(script)
    matcher = SequenceMatcher(None, expected, recognized, autojunk=False)
    aligned = {}
    for a, b, size in matcher.get_matching_blocks():
        for offset in range(size): aligned[a + offset] = b + offset
    cues, offset = [], 0
    for sentence in re.findall(r'[^.!?]+[.!?]', script):
        sentence = sentence.strip(); count = len(tokens(sentence))
        indices = [aligned[i] for i in range(offset, offset + count) if i in aligned]
        assert indices, f'No alignment for {sentence}'
        cues.append({'start': round(timed[min(indices)].start, 3), 'end': round(timed[max(indices)].end, 3), 'text': sentence})
        offset += count
    for index in range(len(cues)-1): cues[index]['end'] = cues[index+1]['start']
    cues[-1]['end'] = len(audio)/rate
    catalog[key] = {'file': 'res://assets/audio/story/' + output.name, 'seconds': len(audio)/rate, 'text': script, 'cues': cues, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
    review[key] = {'source': source, 'transcript': heard, 'expected': script, 'token_similarity': matcher.ratio(), 'peak_dbfs': float(20*np.log10(np.max(np.abs(audio)))), 'seconds': len(audio)/rate, 'clipped_samples': int(np.count_nonzero(np.abs(audio)>=1))}
    print(key, json.dumps(review[key]), flush=True)
(ROOT/'godot/data/story-voice.json').write_text(json.dumps(catalog, indent=2)+'\n')
(SOURCE/'verification.json').write_text(json.dumps(review, indent=2)+'\n')
