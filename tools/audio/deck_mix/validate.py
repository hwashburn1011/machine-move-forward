"""Measure PCM files and create reviewable before/after and score auditions.

Metrics describe digital signal levels, not perceived loudness, realism or taste.
The preview files use the default 0.7 master and 0.35 music settings; they are not
loudness-normalized, because that would conceal the actual mix change.
"""
from pathlib import Path
import hashlib,json,wave
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/deck-audio'
RATE=44100
checks=[]

def check(ok,label):
    checks.append({'passed':bool(ok),'label':label})
    print(('PASS ' if ok else 'FAIL ')+label)

def read(path):
    with wave.open(str(path),'rb') as source:
        channels=source.getnchannels();rate=source.getframerate()
        assert source.getsampwidth()==2
        x=np.frombuffer(source.readframes(source.getnframes()),dtype='<i2').astype(float).reshape(-1,channels)/32768
    if rate!=RATE:
        t=np.arange(round(len(x)*RATE/rate))/RATE
        x=np.column_stack([np.interp(t,np.arange(len(x))/rate,x[:,i]) for i in range(channels)])
    return np.repeat(x,2,axis=1) if channels==1 else x

def stats(x):
    mono=x.mean(axis=1);power=abs(np.fft.rfft(mono))**2;freq=np.fft.rfftfreq(len(mono),1/RATE)
    db=lambda x:float(20*np.log10(max(x,1e-12)))
    return {'seconds':len(x)/RATE,'peak_dbfs':db(abs(x).max()),'rms_dbfs':db(np.sqrt(np.mean(x*x))),
            'dc_offset':float(abs(x.mean(axis=0)).max()),'energy_above_3000_hz_percent':float(100*power[freq>3000].sum()/power.sum()),
            'energy_centroid_hz':float((freq*power).sum()/power.sum())}

def smooth(x):
    x=np.clip(x,0,1);return x*x*(3-2*x)

def write(name,x):
    path=OUT/name
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE)
        out.writeframes(np.rint(np.clip(x,-1,1)*32767).astype('<i2').tobytes())
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),**stats(x)}

manifest=json.loads((OUT/'manifest.json').read_text())
assets={}
for entry in manifest['sounds']:
    path=ROOT/entry['path'];x=read(path);assets[entry['id']]=x;stat=stats(x)
    check(hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],entry['id']+': file matches authored manifest')
    check(np.isfinite(x).all() and abs(x).max()<.4 and stat['dc_offset']<.001,entry['id']+': finite PCM with headroom and negligible DC')
    check(abs(x[0]).max()==0 and abs(x[-1]).max()==0,entry['id']+': starts and ends on digital silence')
    check(stat['energy_above_3000_hz_percent']<.001,entry['id']+': restrained high-frequency energy')

comparison=[];segments=[];position=0
weapon=np.zeros((14*RATE,2))
for name,old_id,new_id,start,spacing,gain in [('Rifle','rifle','rifle-bodied',.5,.3,.55),('Shotgun','shotgun','shotgun-bodied',7.5,.85,.6)]:
    original=read(ROOT/f'godot/assets/audio/{old_id}.wav')*.7
    revised=assets[new_id]*.7*gain
    before=stats(original);after=stats(revised)
    check(after['peak_dbfs']<before['peak_dbfs']-6,name+': default-mix peak reduced by at least 6 dB')
    check(after['energy_above_3000_hz_percent']<before['energy_above_3000_hz_percent']*.01,name+': high-frequency energy fraction reduced by over 99 percent')
    comparison.append({'weapon':name,'before':before,'after':after,'peak_change_db':after['peak_dbfs']-before['peak_dbfs']})
    for label,x,offset in [('original',original,start),('revised',revised,start+3)]:
        for shot in range(3):
            at=round((offset+spacing*shot)*RATE);weapon[at:at+len(x)]+=x
        segments.append({'start_seconds':offset,'label':name+' '+label,'shots':3,'spacing_seconds':spacing})
weapon_preview=write('weapon-comparison.wav',weapon)
weapon_preview['segments']=segments

# Full phrase excerpts receive the exact controller fade/gain. Each selection is
# followed by two seconds of empty PCM; the real game instead waits90–160 sec.
music_parts=[];segments=[];position=0
score=json.loads((ROOT/'tools/audio/deck_mix/score.json').read_text())
for piece in score['pieces']:
    x=assets['music-'+piece['id']].copy();t=np.arange(len(x))/RATE
    x*=np.minimum(smooth(t/4),smooth((len(x)/RATE-t)/4))[:,None]*.7*.35
    excerpt=x[:12*RATE].copy();excerpt*=smooth((12-np.arange(len(excerpt))/RATE)/1.5)[:,None]
    segments.append({'start_seconds':position,'label':piece['title'],'excerpt_seconds':12,'master':.7,'music_volume':.35})
    music_parts.extend([excerpt,np.zeros((2*RATE,2))]);position+=14
    check(len(piece['notes'])>=6 and len({n[1] for n in piece['notes']})>=4 and len(piece['chords'])>=3,piece['id']+': authored changing harmony and distinct melodic phrase, not one looping test tone')
music_preview=write('original-score-preview.wav',np.concatenate(music_parts));music_preview['segments']=segments

report={'checks':len(checks),'passed':all(c['passed'] for c in checks),'assertions':checks,'weapon_comparison':comparison,
        'auditions':[weapon_preview,music_preview],
        'limits':'Offline digital signal measurements and structural score review. Perceived loudness, realism, taste and clarity on individual speakers require listening; no human listening approval is implied.',
        'preview_note':'Default runtime gains. Weapon original then revised, rifle first then shotgun. Score contains three12-second excerpts with2-second gaps; normal play has45-second initial calm silence and90/125/160-second stopped intervals.'}
(OUT/'signal-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'checks':len(checks),'passed':report['passed'],'weapon_comparison':comparison,'auditions':[p['path'] for p in report['auditions']]},indent=2))
raise SystemExit(0 if report['passed'] else 1)
