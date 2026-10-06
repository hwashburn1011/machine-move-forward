"""Focused native travel profiling; each run has a short isolated shader profile."""
from pathlib import Path
import argparse, hashlib, json, os, runpy, subprocess, tempfile, time
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-id',required=True)
parser.add_argument('--seconds',type=float,default=18)
parser.add_argument('--prepared-title',action='store_true')
parser.add_argument('--profile',type=Path,help='Reuse an explicitly named diagnostic profile for warm comparison')
args=parser.parse_args()
out=ROOT/'test-results/v1-hitch-20261005'/args.run_id;out.mkdir(parents=True,exist_ok=False)
profile=args.profile or Path(tempfile.mkdtemp(prefix='mmfh-'))
env=os.environ.copy()
for key,name in [('APPDATA','r'),('LOCALAPPDATA','l'),('XDG_DATA_HOME','x')]:
    folder=profile/name;folder.mkdir(parents=True,exist_ok=True);env[key]=str(folder)
helper=runpy.run_path(str(ROOT/'tools/godot/run-campaign-earned-soak.py'),run_name='helpers')
before=helper['source_fingerprint']()
command=[str(ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'),'--path',str(ROOT/'godot'),'--script','tests/v1_travel_hitch_profile.gd','--',f'--seconds={args.seconds}',f'--output={(out/"profile.json").as_posix()}']
if args.prepared_title:command.append('--prepared-title')
start=time.monotonic()
with (out/'process.log').open('w',encoding='utf8') as stream:
    process=subprocess.Popen(command,cwd=ROOT,env=env,stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
    try:code=process.wait(timeout=args.seconds+120)
    except subprocess.TimeoutExpired:
        subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True);code=124
text=(out/'process.log').read_text(encoding='utf8',errors='replace')
report=json.loads((out/'profile.json').read_text()) if (out/'profile.json').exists() else {}
diagnostics=[line for line in text.splitlines() if line.startswith(('ERROR:','SCRIPT ERROR:','WARNING:'))]
summary={'source_before':before,'source_after':helper['source_fingerprint'](),'profile':str(profile),'seconds':args.seconds,'exit_code':code,'diagnostics':diagnostics,'wall_seconds':time.monotonic()-start,'frame_ms':report.get('frameMs',{}),'report_present':bool(report),'test_sha256':hashlib.sha256((ROOT/'godot/tests/v1_travel_hitch_profile.gd').read_bytes()).hexdigest(),'command':command,'scope':'Separate fresh shader profile; OS/driver caches uncontrolled; instrumented checkpoint, not earned play'}
summary.update(source_stable=summary['source_before']==summary['source_after'],fresh_shader_profile=args.profile is None,prepared_title=args.prepared_title,title_prepare_ms=report.get('title_wait_ms',0))
summary['scope']='Instrumented checkpoint, not earned play; shader profile '+('fresh' if args.profile is None else 'explicitly reused')+'; OS/driver caches uncontrolled.'
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary),flush=True)
raise SystemExit(code or int(bool(diagnostics) or not report))
