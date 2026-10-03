"""Run affected native suites without replacing historical checked-in reports."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import argparse

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-root', default='test-results/narrative-regressions')
parser.add_argument('--test-arg', action='append', default=[], help='Forward an argument after Godot -- (use --test-arg=--flag).')
parser.add_argument('--preserve-report-root', action='append', default=[], help='Additional folder of historical JSON reports to capture and restore after each suite (nonrecursive).')
parser.add_argument('suites', nargs='*')
args = parser.parse_args()
report_roots = [root / 'docs/godot-port/results', root / 'test-results/beta-next']
report_roots.extend(root / folder for folder in args.preserve_report_root)
output = root / args.output_root
output.mkdir(parents=True, exist_ok=True)
original = {path: path.read_bytes() for folder in report_roots for path in folder.glob('*.json')}
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
    for suite in args.suites or ['narrative_delivery', 'narrative_edge_cases', 'construction_usability', 'objective_guidance', 'pacing_contracts', 'integration', 'playtest_checkpoints', 'later_expeditions', 'autosave_worker', 'story_polish', 'survivor_content', 'scout_escape', 'controls_interactions', 'recovery_operations']:
        log = output / f'{suite}.log'
        command = [str(root / 'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'), '--headless', '--path', str(root / 'godot'), '--fixed-fps', '60', '--script', f'tests/{suite}.gd', '--log-file', str(log)]
        if args.test_arg:
            command.extend(['--', *args.test_arg])
        source_hash = source_fingerprint()
        try:
            result = subprocess.run(command, cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or b''
            stderr = error.stderr or b''
            if isinstance(stdout, bytes): stdout = stdout.decode('utf-8', 'replace')
            if isinstance(stderr, bytes): stderr = stderr.decode('utf-8', 'replace')
            result = subprocess.CompletedProcess(command, 124, stdout, stderr + '\nFAIL Suite exceeded 180 seconds\n')
        source_hash_end = source_fingerprint()
        text = result.stdout + result.stderr
        (output / f'{suite}-output.txt').write_text(text, encoding='utf-8')
        failures = [line for line in text.splitlines() if line.startswith(('FAIL ', 'ERROR:', 'SCRIPT ERROR:'))]
        if source_hash != source_hash_end:
            failures.append('Runtime source changed during the suite')
        checks = len(re.findall(r'^PASS |^FAIL ', text, re.M))
        for count in re.findall(r'^[A-Z0-9_]+\s+(\d+)\s+checks\b', text, re.M):
            checks = max(checks, int(count))
        for line in text.splitlines():
            if '{"checks"' in line:
                try: checks = max(checks, int(json.loads(line[line.index('{'):]).get('checks', 0)))
                except (ValueError, TypeError): pass
        entry = dict(suite=suite, exit_code=result.returncode, checks=checks, failures=failures, source_hash=source_hash, source_hash_end=source_hash_end)
        results.append(entry)
        print(json.dumps(entry), flush=True)
        for path in [path for folder in report_roots for path in folder.glob('*.json')]:
            if path not in original or path.read_bytes() != original[path]:
                (output / f'{suite}-{path.name}').write_bytes(path.read_bytes())
                if path in original:
                    path.write_bytes(original[path])
                else:
                    path.unlink()
finally:
    for path, content in original.items():
        path.write_bytes(content)
    (output / 'summary.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
sys.exit(1 if any(result['exit_code'] or result['failures'] for result in results) else 0)
