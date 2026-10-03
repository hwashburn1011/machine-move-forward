"""Run affected native suites without replacing historical checked-in reports."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
reports = root / 'docs/godot-port/results'
output = root / 'test-results/recovery-regressions'
output.mkdir(parents=True, exist_ok=True)
original = {path: path.read_bytes() for path in reports.glob('*.json')}
results = []


def source_fingerprint():
    project = root / 'godot'
    paths = [project / 'project.godot']
    for folder in ['scripts', 'data', 'scenes', 'shaders']:
        paths.extend(path for path in (project / folder).rglob('*') if path.is_file() and path.suffix in {'.gd', '.json', '.tscn', '.gdshader'})
    files = sorted(('res://' + path.relative_to(project).as_posix(), path) for path in paths)
    payload = ''.join(name + '\n' + hashlib.sha256(path.read_bytes()).hexdigest() + '\n' for name, path in files)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


try:
    for suite in sys.argv[1:] or ['construction_usability', 'objective_guidance', 'pacing_contracts', 'integration', 'playtest_checkpoints', 'later_expeditions', 'autosave_worker']:
        log = output / f'{suite}.log'
        command = [str(root / 'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'), '--headless', '--path', str(root / 'godot'), '--fixed-fps', '60', '--script', f'tests/{suite}.gd', '--log-file', str(log)]
        source_hash = source_fingerprint()
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
        source_hash_end = source_fingerprint()
        text = result.stdout + result.stderr
        (output / f'{suite}-output.txt').write_text(text, encoding='utf-8')
        failures = [line for line in text.splitlines() if line.startswith(('FAIL ', 'ERROR:', 'SCRIPT ERROR:'))]
        if source_hash != source_hash_end:
            failures.append('Runtime source changed during the suite')
        entry = dict(suite=suite, exit_code=result.returncode, checks=len(re.findall(r'^PASS |^FAIL ', text, re.M)), failures=failures, source_hash=source_hash, source_hash_end=source_hash_end)
        results.append(entry)
        print(json.dumps(entry), flush=True)
        for path in reports.glob('*.json'):
            if path not in original or path.read_bytes() != original[path]:
                (output / f'{suite}-{path.name}').write_bytes(path.read_bytes())
                if path in original:
                    path.write_bytes(original[path])
finally:
    for path, content in original.items():
        path.write_bytes(content)
    (output / 'summary.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
sys.exit(1 if any(result['exit_code'] or result['failures'] for result in results) else 0)
