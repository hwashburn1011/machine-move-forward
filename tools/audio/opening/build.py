"""Finite cinematic sound edit. Original deterministic foley and local SAPI line.
No alarm loop, loudness maximizer, external recording or runtime synthesis.
"""
from pathlib import Path
import numpy as np
import wave,json,hashlib
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
for at,gain in [(9.40,.030),(9.73,.026),(10.06,.019),(10.39,.014),(10.72,.008)]:
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
# Low, filtered synthetic pursuer line. Keep the original source for provenance.
with wave.open(str(ROOT/'assets/opening-memory/audio/pursuer-source.wav'),'rb') as w:
 rate=w.getframerate();channels=w.getnchannels();voice=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768;voice=voice.reshape(-1,channels).mean(axis=1)
voice=np.interp(np.arange(round(len(voice)/rate*RATE/.93))*rate*.93/RATE,np.arange(len(voice)),voice)
voice=low(voice,3400)-low(voice,160)
vt=np.arange(len(voice))/RATE;voice*=.97+.03*np.sin(vt*2*np.pi*49)
voice*=.30/max(np.max(abs(voice)),1e-9)
dialogue=np.zeros((round(4*RATE),2));place(dialogue,voice,.12,1,.18)
place(dialogue,voice,.165,.065,-.12)
reports=[write('paper-fire',fire),write('memory-and-escape',mix),write('memory-score',score[:round(13*RATE)]),write('pursuer-roof',dialogue)]
(ROOT/'assets/opening-memory/audio/manifest.json').write_text(json.dumps({'sources':'Original harmonic/noise foley; pursuer-source.wav synthesized locally with Microsoft David Desktop via System.Speech, rate -1. Filtered and mixed by this script.','dialogue':'There. On the roof.','dialogue_at_seconds':12.9,'files':reports},indent=2)+'\n')
print(json.dumps(reports))
