"""Capture current Godot gameplay shots and retain compact high-quality edit masters."""
from pathlib import Path
import argparse, json, os, subprocess
from contextlib import contextmanager

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'assets/trailer/native-v1'
GODOT=ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'

@contextmanager
def movie_resolution():
    # MovieWriter fixes its dimensions before SceneTree initialization. A scoped
    # Godot override selects native 1080p without editing shipping project.godot.
    path=ROOT/'godot/override.cfg'
    if path.exists():raise RuntimeError('Preserving existing override.cfg; move it aside before capturing.')
    path.write_text('[display]\nwindow/size/window_width_override=1920\nwindow/size/window_height_override=1080\n',encoding='utf-8')
    try:yield
    finally:
        assert path.resolve().parent==(ROOT/'godot').resolve()
        path.unlink()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('shots',nargs='*',default=['walker','salvage','build','drone','explore','combat','guardian','home'])
    args=parser.parse_args();WORK.mkdir(parents=True,exist_ok=True)
    env=os.environ.copy();profile=Path(env['TEMP'])/'mmf-trailer-v1'
    for key,folder in [('APPDATA','Roaming'),('LOCALAPPDATA','Local')]:
        target=profile/folder;target.mkdir(parents=True,exist_ok=True);env[key]=str(target)
    for shot in args.shots:
        if shot not in ['walker','salvage','build','drone','explore','combat','guardian','home']:raise ValueError(shot)
        raw=WORK/f'{shot}-raw.avi';report=WORK/f'{shot}.json';log=WORK/f'{shot}.log'
        command=[str(GODOT),'--path',str(ROOT/'godot'),'--resolution','1920x1080','--fixed-fps','30','--write-movie',str(raw),'--script','tests/trailer_capture.gd','--','--shot='+shot,'--out='+str(report)]
        with log.open('w',encoding='utf-8') as stream:
            subprocess.run(command,cwd=ROOT,env=env,stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=600)
        text=log.read_text(encoding='utf-8')
        if 'SCRIPT ERROR:' in text or 'ERROR:' in text:raise RuntimeError(log)
        data=json.loads(report.read_text(encoding='utf-8'))
        events={e['id']:e['detail'] for e in data['events']}
        if shot=='salvage' and events.get('cargo_recovered',0)<=0:raise RuntimeError('No cargo recovered')
        if shot=='build' and events.get('placed') is not True:raise RuntimeError('Placement did not succeed')
        if shot=='drone' and not {'clear-side','raise','home','settle'} <= events.keys():raise RuntimeError('Drone cycle incomplete')
        if shot=='combat' and data['enemies_remaining']!=0:raise RuntimeError('Combat did not resolve')
        if shot=='guardian' and data['guardian_volleys']<1:raise RuntimeError('Guardian did not fire')
        result=WORK/f'{shot}.mp4'
        subprocess.run(['ffmpeg','-y','-v','error','-ss',str(data['start_frame']/30),'-i',str(raw),'-t',str(data['frames']/30),'-c:v','libx264','-preset','fast','-crf','15','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',str(result)],check=True)
        # Only this newly generated AVI is retired, after its compact master exists.
        assert raw.resolve().parent==WORK.resolve() and result.stat().st_size>100000
        raw.unlink()
        for second in [2,5,9]:
            subprocess.run(['ffmpeg','-y','-v','error','-ss',str(second),'-i',str(result),'-frames:v','1','-q:v','3',str(WORK/f'{shot}-{second:02d}.jpg')],check=True)
        print(json.dumps({'shot':shot,'master':str(result),'events':data['events'],'seconds':data['frames']/30}),flush=True)

if __name__=='__main__':
    with movie_resolution():main()
