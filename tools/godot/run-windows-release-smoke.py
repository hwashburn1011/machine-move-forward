"""Verify the actual EXE launch, then exercise its unchanged exported PCK."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--godot',type=Path,default=ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe')
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists():
        parser.error('Choose a new output directory; previous evidence is retained.')
    out.mkdir(parents=True)
    base = Path(tempfile.mkdtemp(prefix='mmf-beta-standalone-')).resolve()
    payload = base/'game'
    payload.mkdir()
    work = base/'empty-working-directory'
    work.mkdir()
    with zipfile.ZipFile(args.archive) as archive:
        for item in archive.infolist():
            if not (payload/item.filename).resolve().is_relative_to(payload):
                raise ValueError('ZIP path leaves the extraction directory')
        archive.extractall(payload)
    checked = 0
    for line in (payload/'CHECKSUMS.sha256').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        path = (payload/name).resolve()
        if not path.is_relative_to(payload) or sha(path) != digest:
            raise ValueError('Extracted checksum mismatch: '+name)
        checked += 1
    env = os.environ.copy()
    for key, name in [('APPDATA','roaming'),('LOCALAPPDATA','local'),('XDG_DATA_HOME','xdg')]:
        folder = base/'isolated-user'/name
        folder.mkdir(parents=True)
        env[key] = str(folder)
    exe = payload/'MachineMoveForward.exe'
    helper = Path(__file__).with_name('windows-release-smoke.gd').resolve()
    report = {'archive':str(args.archive.resolve()),'archive_sha256':sha(args.archive),
              'executable_sha256':sha(exe),'pck_sha256':sha(payload/'MachineMoveForward.pck'),
              'extracted_checksums_verified':checked,'extraction':str(base),
              'helper_sha256':sha(helper),'build':json.loads((payload/'BUILD.json').read_text(encoding='utf-8'))['identity'],
              'instrumentation_engine_sha256':sha(args.godot),'instrumentation_limit':'Official templates disable external scripts. Only normal-boot uses the release EXE; new/resume use the matching engine and unchanged extracted PCK.',
              'runs':[],'passed':False}
    for phase in ['normal-boot','new','resume']:
        engine_log = out/(phase+'-engine.log')
        process_log = out/(phase+'-process.log')
        command = [str(exe),'--log-file',str(engine_log)]
        if phase == 'normal-boot':
            command += ['--quit-after','240']
        else:
            command = [str(args.godot.resolve()),'--path',str(work),'--main-pack',str(payload/'MachineMoveForward.pck'),'--log-file',str(engine_log),
                       '--script',str(helper),'--',f'--out={out}',f'--isolation-root={base / "isolated-user"}',f'--phase={phase}']
        start = time.monotonic()
        with process_log.open('w',encoding='utf-8') as stream:
            process = subprocess.Popen(command,cwd=work,env=env,stdout=stream,stderr=subprocess.STDOUT,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                code = process.wait(timeout=180)
            except subprocess.TimeoutExpired:
                process.kill();process.wait(timeout=15);code=124
        text = process_log.read_text(encoding='utf-8',errors='replace')
        if engine_log.is_file():text += '\n'+engine_log.read_text(encoding='utf-8',errors='replace')
        diagnostics = sorted(set(line.strip() for line in text.splitlines()
                                 if line.lstrip().startswith(('ERROR:','SCRIPT ERROR:','WARNING:','FAIL '))))
        result = {'phase':phase,'command':command,'cwd':str(work),'exit_code':code,
                  'wall_seconds':round(time.monotonic()-start,3),'diagnostics':diagnostics}
        if phase == 'normal-boot':
            result['passed'] = code == 0 and not diagnostics and 'MMF_NATIVE_READY' in text
        else:
            details = out/('smoke-'+phase+'.json')
            proof = json.loads(details.read_text(encoding='utf-8')) if details.is_file() else {}
            result['checks'] = len(proof.get('checks',[]))
            result['passed'] = code == 0 and not diagnostics and proof.get('passed',False) and proof.get('build') == report['build']
        report['runs'].append(result)
        write(out/'summary.json',report)
        print(json.dumps(result),flush=True)
        if not result['passed']:
            return 1
    report['passed'] = True
    if sha(payload/'MachineMoveForward.pck') != report['pck_sha256']:
        raise ValueError('The extracted pack changed during verification')
    write(out/'summary.json',report)
    print('Standalone download smoke passed: '+str(out),flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
