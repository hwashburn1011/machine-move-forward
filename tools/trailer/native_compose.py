"""Edit normal-speed native gameplay into the 56-second Windows beta trailer."""
from pathlib import Path
import hashlib, json, subprocess

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'assets/trailer/native-v1'
MEDIA=ROOT/'docs/media'
# shot, source in-point, frame count, restrained on-screen copy
EDIT=[
    ('walker',0,200,'KEEP MOVING.'),
    ('salvage',.4,120,'SALVAGE WHAT REMAINS.'),
    ('build',.6,160,'BUILD A HOME THAT MOVES.'),
    ('drone',0,240,''),
    ('explore',.2,160,'FOLLOW WHAT WAS LEFT BEHIND.'),
    ('combat',.1,120,'DEFEND WHAT KEEPS YOU ALIVE.'),
    ('guardian',2,240,''),
    ('home',2,120,'MAKE IT YOURS.'),
    ('walker',5.2,320,'MACHINE\nMOVE FORWARD'),
]

def run(args):
    subprocess.run(args,cwd=ROOT,check=True)

def escaped(path):return str(path).replace('\\','/').replace(':','\\:')

def main():
    MEDIA.mkdir(parents=True,exist_ok=True)
    outputs=[];decisions=[];frame=0
    font=escaped('C:/Windows/Fonts/bahnschrift.ttf')
    for i,(shot,start,frames,title) in enumerate(EDIT):
        duration=frames/30
        source=WORK/f'{shot}.mp4'
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-of','json',str(source)]))
        assert start+duration <= float(probe['format']['duration'])+.02, (shot,'source too short')
        output=WORK/f'edit-{i:02d}.mp4'
        vf=['setsar=1','fps=30','eq=contrast=1.025:saturation=0.96']
        if title:
            textpath=WORK/f'title-{i}.txt';textpath.write_text(title,encoding='utf-8')
            if i==len(EDIT)-1:
                vf+=['drawbox=x=0:y=0:w=iw:h=ih:color=black@0.26:t=fill',
                     'drawbox=x=100:y=650:w=100:h=4:color=0xc8a276:t=fill',
                     f"drawtext=fontfile='{font}':text='MACHINE':fontsize=94:fontcolor=0xeee8dc:x=98:y=690:alpha='min(1,t/0.6)'",
                     f"drawtext=fontfile='{font}':text='MOVE FORWARD':fontsize=94:fontcolor=0xeee8dc:x=98:y=800:alpha='min(1,t/0.6)'",
                     f"drawtext=fontfile='{font}':text='WINDOWS BETA':fontsize=26:fontcolor=0xc8a276:x=103:y=940:alpha='min(1,t/0.6)'"]
            else:
                vf+=['drawbox=x=0:y=918:w=iw:h=162:color=black@0.40:t=fill',
                     'drawbox=x=72:y=961:w=3:h=46:color=0xc8a276:t=fill',
                     f"drawtext=fontfile='{font}':textfile='{escaped(textpath)}':fontsize=42:fontcolor=0xeee8dc:x=96:y=960:alpha='min(1,t/0.25)'"]
        if i==0:vf+=['fade=t=in:st=0:d=0.6']
        if i==len(EDIT)-1:vf += [f'fade=t=out:st={duration-1}:d=1']
        run(['ffmpeg','-y','-v','error','-ss',str(start),'-i',str(source),'-t',str(duration),
             '-vf',','.join(vf),'-af',f'afade=t=in:d=0.045,afade=t=out:st={duration-.08}:d=0.08',
             '-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','192k',str(output)])
        outputs.append(output)
        print('Edited '+shot,flush=True)
        decisions.append({'shot':shot,'source_in':start,'timeline_frame':frame,'frames':frames,'title':title})
        frame+=frames
    assert frame==1680
    listing=WORK/'native-concat.txt'
    listing.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in outputs),encoding='utf-8')
    final=MEDIA/'machine-move-forward-trailer.mp4'
    # Keep the native engine, tool and weapon sounds; a restrained original cue sits beneath.
    run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-i',str(WORK/'native-score.wav'),
         '-filter_complex','[0:a]volume=0.55[game];[1:a]volume=0.72[music];[game][music]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=54:d=2,loudnorm=I=-17:TP=-1.5:LRA=9,aresample=48000[a]',
         '-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-t','56','-movflags','+faststart',str(final)])
    assert final.stat().st_size < 95*1024*1024
    run(['ffmpeg','-y','-v','error','-ss','3.5','-i',str(final),'-frames:v','1','-q:v','2',str(MEDIA/'trailer-poster.jpg')])
    receipts={name:json.loads((WORK/f'{name}.json').read_text(encoding='utf-8')) for name in {row[0] for row in EDIT}}
    report={'type':'native-gameplay-trailer','runtime_fingerprint':receipts['walker']['source_hash'],'duration':56,'width':1920,'height':1080,'fps':30,'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'bytes':final.stat().st_size,'edit':decisions,'captures':receipts,'notes':['Normal-speed moving game footage throughout; no intro sequence or still-image shots.','Prepared gameplay checkpoints and camera staging; actor invulnerable; HUD hidden.','Fixed-rate capture is not a performance benchmark.','Original NumPy score mixed with recorded native game audio.']}
    (MEDIA/'capture-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'output':str(final),'bytes':report['bytes'],'sha256':report['sha256']}))

if __name__=='__main__':main()
