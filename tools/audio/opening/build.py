"""Finite cinematic sound edit. Original foley and selected local Qwen performance.
No alarm loop, loudness maximizer, external recording or runtime synthesis.
"""
from pathlib import Path
import numpy as np
import wave,json,hashlib
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'godot/assets/audio/opening';OUT.mkdir(parents=True,exist_ok=True)
RATE=44100;DURATION=36.2;rng=np.random.default_rng(71301)
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def low(x,hz):
 f=np.fft.rfftfreq(len(x),1/RATE);return np.fft.irfft(np.fft.rfft(x)*np.exp(-(f/hz)**4),n=len(x))
def noise(seconds,hz):
 x=low(rng.normal(0,1,round(seconds*RATE)),hz);return x/max(np.std(x),1e-8)
def place(dest,x,at,gain=1,pan=0):
 i=round(at*RATE);n=min(len(x),len(dest)-i)
 if n>0:dest[i:i+n]+=x[:n,None]*gain*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])
def thud(seconds=.8,hz=52):
 t=np.arange(round(seconds*RATE))/RATE;env=smooth(t/.012)*np.exp(-t/.16)*smooth((seconds-t)/.12)
 return (np.sin(2*np.pi*(hz*t+1.2*(1-np.exp(-t*15))))*.7+noise(seconds,700)*.15)*env
def write(name,x):
 x-=x.mean(axis=0);x*=smooth(np.arange(len(x))/RATE/.05)[:,None]*smooth((len(x)-np.arange(len(x)))/RATE/.16)[:,None]
 assert np.max(abs(x))<.85
 p=OUT/(name+'.wav')
 with wave.open(str(p),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(np.rint(x*32767).astype('<i2').tobytes())
 return {'path':str(p.relative_to(ROOT)),'seconds':len(x)/RATE,'peak_dbfs':float(20*np.log10(max(np.max(abs(x)),1e-9))),'rms_dbfs':float(20*np.log10(max(np.sqrt(np.mean(x*x)),1e-9))),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
mix=np.zeros((round(DURATION*RATE),2));score=np.zeros_like(mix);t=np.arange(len(mix))/RATE
# Factory air, a soft belt-drive and a bowed low note, each resolving into silence.
air=noise(DURATION,550)*.006*smooth(t/1.4)*(1-smooth((t-11.8)/2))
air+=noise(DURATION,850)*.008*smooth((t-12)/3)*(1-smooth((t-34.2)/2))
place(mix,air,0)
for hz,level in [(55,.012),(82.41,.006),(110,.002)]:
 tone=np.sin(t*2*np.pi*hz+.015*np.sin(t*.6))*level*smooth(t/2.6)*(1-smooth((t-9.8)/2.8));place(score,tone,0)
for at in [1.1,2.5,3.9]:place(mix,thud(.6,68),at,.07,-.45)
# The disconnect throws, but power does not return. A single contact, not an alarm.
place(mix,thud(.35,172),7.34,.14,.2)
# Canvas shifts, the grip tightens, then one heavy body/cart contact rings out.
for at,length,gain in [(5.73,.5,.009),(6.50,.22,.012),(7.12,.35,.017),(8.28,.35,.010)]:
 ft=np.arange(round(length*RATE))/RATE
 place(mix,noise(length,1400)*np.sin(np.pi*ft/length)**2,at,gain,.25)
for at,pan in [(10.23,-.45)]:
 place(mix,thud(1.2,47),at,.29,pan)
 metal_t=np.arange(round(.55*RATE))/RATE
 metal=sum(np.sin(metal_t*2*np.pi*f)*a for f,a in [(183,.05),(397,.018),(711,.008)])*smooth(metal_t/.006)*np.exp(-metal_t/.14)
 place(mix,metal,at+.08,.6,pan)
for at,gain in [(10.39,.060),(10.77,.045),(11.03,.017),(11.29,.006)]:
 place(mix,thud(.25,231),at,gain,-.55)
# Short retreating footfalls and a soft scuff establish the worker's escape.
for at,gain in [(10.69,.030),(11.02,.026),(11.35,.019),(11.68,.014),(12.01,.008)]:
 place(mix,thud(.22,108),at,gain,-.60)
# Nearby pursuer footfalls give way to the larger, slower Nomad cadence.
for at in [12.7,13.25,14.15,14.8]:place(mix,thud(.55,115),at,.09,.6)
for at in [14.8,16.5,18.2,19.9,21.6,23.3,25.0,26.7,28.4,30.1,31.8,33.5]:
 place(mix,thud(1.3,42),at,.12*smooth((at-13)/4),-.18)
place(mix,thud(1.4,62),28.9,.15,0)
for at in [18.34,21.60,22.40,23.20,24.00,24.80]:place(mix,thud(.24,128),at,.033,.35)
# Fingers catch the coping, then two staggered landings on the roof.
for at,gain,hz in [(22.15,.045,188),(22.47,.04,167),(25.00,.065,79),(25.32,.06,92)]:
 place(mix,thud(.35,hz),at,gain,.30)
# A finite, restrained paper ignition; no voice or score under the letter.
fire_seconds=6.0;ft=np.arange(round(fire_seconds*RATE))/RATE
fire=np.zeros((len(ft),2))
fenv=smooth(ft/.7)*(1-smooth((ft-4.8)/1.0))
place(fire,noise(fire_seconds,1400)*fenv,0,.028)
for at in [.18,.59,1.10,1.61,2.02,2.38,2.84,3.20,3.69,4.22,4.73]:
 tick=noise(.085,2200)*np.exp(-np.arange(round(.085*RATE))/RATE*65)
 place(fire,tick,at,.012,-.4+.8*rng.random())
# Preserve the selected performance and its existing subtle metallic treatment.
# Resampling changes neither pitch nor pacing. The old SAPI source stays archived.
selection=json.loads((ROOT/'assets/opening-memory/audio/voice-selection.json').read_text(encoding='utf-8'))
source=ROOT/selection['source']
assert hashlib.sha256(source.read_bytes()).hexdigest()==selection['source_sha256'],'Selected voice has changed'
voice,rate=sf.read(source,dtype='float64');assert voice.ndim==1 and np.isfinite(voice).all()
factor=gcd(RATE,rate);voice=resample_poly(voice,RATE//factor,rate//factor)
seconds=selection['lead_seconds']+len(voice)/RATE+selection['subtitle_hold_seconds']
dialogue=np.zeros((round(seconds*RATE),2))
place(dialogue,voice,selection['lead_seconds'],10**(selection['mix_gain_db']/20),selection['pan'])
reports=[write('paper-fire',fire),write('memory-and-escape',mix),write('memory-score',score[:round(13*RATE)]),write('pursuer-roof',dialogue)]
cue={'voice_id':selection['voice_id'],'text':selection['text'],'cue_seconds':selection['cue_seconds'],'lead_seconds':selection['lead_seconds'],'source_seconds':len(voice)/RATE,'subtitle_hold_seconds':selection['subtitle_hold_seconds'],'stream_seconds':reports[-1]['seconds'],'sha256':reports[-1]['sha256']}
(ROOT/'godot/data/opening-voice.json').write_text(json.dumps(cue,indent=2)+'\n')
(ROOT/'assets/opening-memory/audio/manifest.json').write_text(json.dumps({'sources':'Original harmonic/noise foley; selected original Qwen3-TTS VoiceDesign B performance generated locally. See voice-selection.json for immutable sources and mix settings. Legacy Microsoft David source retained but unused.','dialogue':selection['text'],'dialogue_at_seconds':selection['cue_seconds'],'voice_selection':selection,'files':reports},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(reports))
