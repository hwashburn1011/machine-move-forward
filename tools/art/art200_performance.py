"""Run sequential fresh-process native workloads; never alter personal saves."""
from pathlib import Path
import argparse,json,subprocess,time,hashlib
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--label',required=True);p.add_argument('--seconds',default=18,type=float);p.add_argument('--scenarios',nargs='*');a=p.parse_args()
out=ROOT/'test-results/art200/performance';out.mkdir(parents=True,exist_ok=True)
def assets():
    paths=sorted((ROOT/'godot/art').glob('art100-*.glb'))+sorted((ROOT/'godot/art').glob('art200-*.glb'))+[ROOT/'godot/art/refined-bastion.glb',ROOT/'godot/art/refined-bastion.scn']
    paths+=sorted((ROOT/'godot/data/scenery-collision').rglob('*.res'))
    return {p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
asset_hashes=assets()
(out/(a.label+'-asset-hashes.json')).write_text(json.dumps(asset_hashes,indent=2)+'\n')
results=[]
for scenario in a.scenarios or ['travel','construction','furnished','combat','guardian','crane','drone','wake','foundry','array','orchard','meridian','berth']:
    name=f'{a.label}-{scenario}'
    cmd=[str(ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'),'--path',str(ROOT/'godot'),'--script','tests/art200_performance.gd','--log-file',str(out/(name+'.log')),'--',f'--label={a.label}',f'--scenario={scenario}',f'--seconds={a.seconds}']
    proc=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
    log=proc.stdout+proc.stderr;(out/(name+'-output.txt')).write_text(log,encoding='utf-8')
    diagnostics=[line for line in log.splitlines() if line.startswith(('ERROR:','SCRIPT ERROR:','FAIL ','WARNING:'))]
    result={'scenario':scenario,'exit_code':proc.returncode,'diagnostics':diagnostics}
    if (out/(name+'.json')).exists():
        data=json.loads((out/(name+'.json')).read_text());result.update(frame_ms=data['metrics']['frame_ms'],gpu_ms=data['metrics']['gpu_ms'],source_hash=data['source_hash'],draw_calls=data['metrics']['draw_calls']['median'])
    results.append(result);print(json.dumps(result),flush=True)
    (out/(a.label+'-summary.json')).write_text(json.dumps(results,indent=2)+'\n')
    if proc.returncode or diagnostics:raise SystemExit(1)
    if assets()!=asset_hashes:raise SystemExit('Runtime art changed during the performance run')
print(json.dumps({'label':a.label,'scenarios':len(results),'complete':True}))
