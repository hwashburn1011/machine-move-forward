"""Original 90 BPM desert-industrial trailer cue. No samples or external APIs."""
from pathlib import Path
import wave
import numpy as np

RATE = 48000
DURATION = 56
ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'assets/trailer/native-v1'

def compose():
    rng = np.random.default_rng(7007)
    mix = np.zeros((RATE * DURATION, 2), dtype=np.float64)

    def add(signal, start, gain=1, pan=0):
        first = int(start * RATE)
        count = min(len(signal), len(mix) - first)
        if count <= 0: return
        mix[first:first+count, 0] += signal[:count] * gain * np.sqrt((1-pan)/2)
        mix[first:first+count, 1] += signal[:count] * gain * np.sqrt((1+pan)/2)

    def tone(freq, length, attack=.02, decay=1.8):
        t = np.arange(int(length*RATE))/RATE
        envelope = (1-np.exp(-t/attack))*np.exp(-t/decay)
        envelope *= np.minimum(1, (length-t)/.15)
        return (np.sin(2*np.pi*freq*t) + .18*np.sin(2*np.pi*freq*2*t) + .06*np.sin(2*np.pi*freq*3*t))*envelope

    # Four suspended, restrained voicings; the last phrase resolves to D minor.
    chords = [[146.832,220,329.628], [130.813,196,293.665], [116.541,174.614,261.626], [146.832,174.614,220]]
    for bar in range(12):
        start = bar*16/3
        chord = chords[bar % 4]
        for j,freq in enumerate(chord):
            s = tone(freq, 8, .9, 5.2)
            add(s, start, .055, (j-1)*.48)
            add(s, start+.23, .019, -(j-1)*.48)
        # A distant repeating pluck, leaving space around game sounds.
        for beat in range(4):
            freq = chord[[0,2,1,2][beat]]*2
            start_note = start+beat*4/3
            add(tone(freq, 2.4, .006, .48),start_note,.075,(-.3 if beat%2 else .3))
            add(tone(freq, 2.4, .01, .6),start_note+.333,.022,(-.45 if not beat%2 else .45))
    for beat in range(96):
        start = beat*2/3
        if start < 5.3 or start >= 48: continue
        intensity = .45 if start < 29.3 else (1 if start < 41.3 else .55)
        if beat%2 == 0:
            t=np.arange(int(.45*RATE))/RATE
            kick=np.sin(2*np.pi*(43*t + 32*.055*(1-np.exp(-t/.055))))*np.exp(-t*9)
            add(kick,start,.20*intensity)
            add(tone([73.416,65.406,58.270,73.416][int(start/(16/3))%4],.55,.008,.25),start,.11*intensity)
        if beat%4==2:
            t=np.arange(int(.19*RATE))/RATE
            noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(9)/9,mode='same')
            add(noise*np.exp(-t*28),start,.16*intensity,.15)
        if start >= 29.3:
            t=np.arange(int(.09*RATE))/RATE
            metal=(np.sin(2*np.pi*730*t)+.35*np.sin(2*np.pi*1127*t))*np.exp(-t*65)
            add(metal,start+.333,.016*intensity,-.35)
    # Quiet transitions, shaped rather than hard white-noise sweeps.
    for at in [16,29.333,41.333,45.333]:
        t=np.arange(int(1.8*RATE))/RATE
        noise=np.convolve(rng.normal(0,1,len(t)),np.ones(100)/100,mode='same')
        add(noise*np.sin(np.pi*t/1.8)**2,at-1.4,.18)
    # Short stereo room tails; preserve a dry center for the native effects.
    for delay,gain in [(.119,.10),(.239,.075),(.413,.05)]:
        n=int(delay*RATE);mix[n:] += mix[:-n,::-1].copy()*gain
    t=np.arange(len(mix))/RATE
    mix *= (np.minimum(1,t/2)*np.minimum(1,(DURATION-t)/2))[:,None]
    mix *= .58/max(.58,float(np.max(np.abs(mix))))
    WORK.mkdir(parents=True,exist_ok=True)
    with wave.open(str(WORK/'native-score.wav'),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE)
        out.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())

if __name__=='__main__': compose()
