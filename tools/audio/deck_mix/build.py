"""Original finite score and mechanical sound recipes; NumPy + standard library.

The score is human-readable in score.json. All sound is generated from explicit
harmonic/filtered-noise instruments, with deterministic private seeds. No external
recordings, sampled instruments, model outputs, or network content are used.
"""
from pathlib import Path
import hashlib,json,wave
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'godot/assets/audio/deck';OUT.mkdir(parents=True,exist_ok=True)
REVIEW=ROOT/'assets/deck-audio';REVIEW.mkdir(parents=True,exist_ok=True)
RATE=44100
score=json.loads(Path(__file__).with_name('score.json').read_text())
rng=np.random.default_rng(761932) # Sound authoring only; never the game's RNG.
reports=[]

def smooth(value):
    value=np.clip(value,0,1);return value*value*(3-2*value)
def lowpass(x,hz,order=4):
    f=np.fft.rfftfreq(len(x),1/RATE)
    return np.fft.irfft(np.fft.rfft(x)*np.exp(-(f/hz)**order),n=len(x))
def noise(t,hz):
    x=lowpass(rng.standard_normal(len(t)),hz);return x/max(np.std(x),1e-9)
def envelope(t,duration,attack,decay):
    return smooth(t/attack)*np.exp(-t/decay)*smooth((duration-t)/min(.12,duration*.15))
def tone(t,hz,partials,decay):
    return sum(level*np.sin(2*np.pi*hz*(i+1)*t+.018*np.sin(t*3.1+i))*np.exp(-t/decay*(1+i*.5)) for i,level in enumerate(partials))
def stats(x):
    mono=x.mean(axis=1) if x.ndim==2 else x
    p=abs(np.fft.rfft(mono))**2;f=np.fft.rfftfreq(len(mono),1/RATE)
    return {'seconds':len(x)/RATE,'channels':x.shape[1] if x.ndim==2 else 1,'peak_dbfs':float(20*np.log10(max(np.max(abs(x)),1e-12))),'rms_dbfs':float(20*np.log10(max(np.sqrt(np.mean(x*x)),1e-12))),'energy_above_3000_hz_pct':float(100*p[f>3000].sum()/max(p.sum(),1e-12)),'spectral_energy_centroid_hz':float((f*p).sum()/max(p.sum(),1e-12))}
def write(id,x,peak=-11,rms=None):
    # A rounded transient can retain a small zero-frequency offset. Remove it
    # with an equally rounded support envelope, keeping silent file boundaries.
    t=np.arange(len(x))/RATE
    dc_window=smooth(t/.02)*smooth((len(x)/RATE-t)/.08)
    correction=x.mean(axis=0)/max(dc_window.mean(),1e-9)
    x-=dc_window[:,None]*correction if x.ndim==2 else dc_window*correction
    if rms is not None:x*=10**(rms/20)/max(np.sqrt(np.mean(x*x)),1e-9)
    if rms is None or np.max(abs(x))>10**(peak/20):x*=10**(peak/20)/max(np.max(abs(x)),1e-9)
    x[:max(1,int(RATE*.003))]*=smooth(np.arange(max(1,int(RATE*.003)))/max(1,int(RATE*.003)))[:,None] if x.ndim==2 else smooth(np.arange(max(1,int(RATE*.003)))/max(1,int(RATE*.003)))
    x[-max(1,int(RATE*.015)):]*=smooth(np.linspace(1,0,max(1,int(RATE*.015))))[:,None] if x.ndim==2 else smooth(np.linspace(1,0,max(1,int(RATE*.015))))
    path=OUT/(id+'.wav')
    with wave.open(str(path),'wb') as w:
        w.setnchannels(x.shape[1] if x.ndim==2 else 1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(np.rint(np.clip(x,-1,1)*32767).astype('<i2').tobytes())
    reports.append({'id':id,'path':path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),**stats(x)})
    return x

# Firearm body: rounded pressure transient, low resonator and restrained bolt.
for id,duration,f0,level,cutoff in [('rifle-bodied',.24,105,.19,1400),('shotgun-bodied',.42,84,.26,1150)]:
    t=np.arange(round(duration*RATE))/RATE
    pressure=noise(t,cutoff)*envelope(t,duration,.007,.031 if id.startswith('rifle') else .065)*.18
    phase=2*np.pi*(f0*.65*t+(f0*.35)*.027*(1-np.exp(-t/.027)))
    body=np.sin(phase)*envelope(t,duration,.01,.09 if id.startswith('rifle') else .15)*level
    metal=tone(t,235,[.035,.016,.003],.045)*smooth(t/.009)
    delayed=np.maximum(0,t-.065);bolt=tone(delayed,184,[.018,.006],.026)*(t>.065)*smooth(delayed/.006)
    write(id,pressure+body+metal+bolt,peak=-11 if id.startswith('rifle') else -10)

# Source-located hardware sounds. They communicate motion, not abstract alarms.
t=np.arange(round(.42*RATE))/RATE
servo=tone(t,112,[.14,.035,.012,.003],.3)*smooth(t/.035)*smooth((.42-t)/.10)
servo+=noise(t,850)*envelope(t,.42,.035,.16)*.025
write('servo-load',servo,peak=-16)
t=np.arange(round(.65*RATE))/RATE
vent=noise(t,1050)*envelope(t,.65,.065,.22)*.12+tone(t,96,[.025,.012],.25)*smooth(t/.06)
write('pressure-release',vent,peak=-18)
t=np.arange(round(.24*RATE))/RATE
contact=tone(t,205,[.12,.023,.008],.04)*smooth(t/.01)
u=np.maximum(0,t-.075);contact+=tone(u,158,[.07,.02],.055)*(t>.075)*smooth(u/.014)
write('receiver-contact',contact,peak=-20)

def instrument(pitch,duration,kind):
    t=np.arange(round(duration*RATE))/RATE;hz=440*2**((pitch-69)/12)
    if kind=='felt':
        x=tone(t,hz,[1,.27,.075,.025,.009],duration*.48)*smooth(t/.07)*smooth((duration-t)/.4)
        x+=noise(t,380)*envelope(t,duration,.035,.065)*.008
    elif kind=='pluck':
        x=tone(t,hz,[1,.22,.11,.045,.01],duration*.30)*smooth(t/.028)*smooth((duration-t)/.32)
    else:
        x=sum(level*np.sin(2*np.pi*hz*(i+1)*t+.012*np.sin(t*2.2+i)) for i,level in enumerate([1,.14,.034,.009]))
        x*=smooth(t/2.4)*smooth((duration-t)/2.6)*(.93+.07*np.sin(t*.6))
    return lowpass(x,1400)
def place(buffer,x,when,gain,pan):
    start=round(when*RATE);count=min(len(x),len(buffer)-start)
    if count<=0:return
    buffer[start:start+count,0]+=x[:count]*gain*np.sqrt((1-pan)/2)
    buffer[start:start+count,1]+=x[:count]*gain*np.sqrt((1+pan)/2)

for piece in score['pieces']:
    length=piece['duration'];mix=np.zeros((round(length*RATE),2))
    for when,duration,pitches in piece['chords']:
        for i,pitch in enumerate(pitches):place(mix,instrument(pitch,duration,'bow'),when,.065 if i==0 else .025,(i-1)*.25)
    for when,pitch,duration,gain,pan in piece['notes']:place(mix,instrument(pitch,duration,'felt'),when,gain*.20,pan)
    for when,pitch,duration,gain,pan in piece['plucks']:place(mix,instrument(pitch,duration,'pluck'),when,gain*.16,pan)
    # Small dark room reflections, not a continuous drone or wash.
    dry=mix.copy()
    for delay,amount in [(.093,.09),(.181,.055),(.327,.035)]:
        offset=round(delay*RATE);mix[offset:,0]+=dry[:-offset,1]*amount;mix[offset:,1]+=dry[:-offset,0]*amount
    t=np.arange(len(mix))/RATE;mix*= (smooth(t/3.2)*smooth((length-t)/4.2))[:,None]
    write('music-'+piece['id'],mix,peak=-10,rms=-23)

manifest={'authorship':score['authorship'],'sample_rate':RATE,'format':'16-bit PCM WAV; runtime streams are finite and non-looping','score':'tools/audio/deck_mix/score.json','recipe':'tools/audio/deck_mix/build.py','sounds':reports,'runtime_music_schedule':{'initial_calm_seconds':45,'silence_after_piece_seconds':[90,125,160],'fade_in_seconds':4,'fade_out_seconds':4,'interrupt_fade_seconds':2,'default_music_gain':.35},'audition_note':'Sound assets are intended to be auditioned at the documented runtime gains; source WAVs are louder than their in-game mix.'}
(REVIEW/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({r['id']:{k:round(r[k],3) for k in ['seconds','peak_dbfs','rms_dbfs','energy_above_3000_hz_pct','spectral_energy_centroid_hz']} for r in reports},indent=2))
