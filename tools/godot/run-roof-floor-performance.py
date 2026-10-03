"""Focused native performance acceptance after geometry changes; historical reports stay frozen."""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
HELPERS = runpy.run_path(str(ROOT / 'tools/godot/run-campaign-earned-soak.py'), run_name='evidence_helpers')
OUT = ROOT / 'test-results/roof-floor/performance'
SCENARIOS = ['travel', 'construction', 'furnished', 'combat', 'wake', 'foundry', 'array', 'orchard']


def inputs():
    fixtures = ['godot/tests/art200_performance.gd', 'godot/tests/deck_audio_performance.gd',
                'godot/tests/deck_freight_performance.gd', 'godot/tests/roof_floor_performance.gd',
                'godot/tests/roof_floor_freight_performance.gd',
                'tools/godot/run-campaign-earned-soak.py', 'tools/godot/run-roof-floor-performance.py']
    return {'source': HELPERS['source_fingerprint'](), 'assets': HELPERS['asset_manifest'](),
            'roof_collision': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                               for p in sorted((ROOT/'godot/data/site-roofs').glob('*.res'))},
            'fixtures': {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in fixtures}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenarios', nargs='+', default=SCENARIOS)
    parser.add_argument('--seconds', type=float, default=18)
    parser.add_argument('--skip-freight', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    before = inputs()
    (OUT/'inputs-start.json').write_text(json.dumps(before, indent=2)+'\n', encoding='utf-8')
    jobs = [(s, args.seconds, 'roof_floor_performance', 'roof-floor') for s in args.scenarios]
    if not args.skip_freight:
        jobs.append(('furnished', 45, 'roof_floor_freight_performance', 'connected-freight'))
    rows = []
    for scenario, seconds, script, label in jobs:
        name = f'{label}-{scenario}'
        report_path = OUT/(name+'.json')
        if report_path.exists():
            report_path.replace(OUT/(name+f'-previous-{time.time_ns()}.json'))
        command = [str(ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'),
                   '--path', str(ROOT/'godot'), '--script', f'tests/{script}.gd',
                   '--log-file', str(OUT/(name+'.log')), '--', f'--label={label}',
                   f'--scenario={scenario}', f'--seconds={seconds}']
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                    encoding='utf-8', errors='replace', timeout=seconds+180)
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or b''
            stderr = error.stderr or b''
            if isinstance(stdout, bytes): stdout = stdout.decode('utf-8', 'replace')
            if isinstance(stderr, bytes): stderr = stderr.decode('utf-8', 'replace')
            result = subprocess.CompletedProcess(command, 124, stdout, stderr+'\nFAIL Performance workload timed out\n')
        output = result.stdout+result.stderr
        (OUT/(name+'-output.txt')).write_text(output, encoding='utf-8')
        diagnostics = [line for line in output.splitlines()
                       if line.startswith(('ERROR:', 'SCRIPT ERROR:', 'WARNING:', 'FAIL '))]
        report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {}
        row = {'scenario': scenario, 'label': label, 'exit_code': result.returncode,
               'diagnostics': diagnostics, 'report_present': bool(report),
               'source_stable': HELPERS['source_fingerprint']() == before['source']}
        if report:
            row.update(frame_ms=report['metrics']['frame_ms'], gpu_ms=report['metrics']['gpu_ms'],
                       source_hash=report['source_hash'], draw_calls=report['metrics']['draw_calls']['median'])
            if scenario == 'furnished' and label == 'roof-floor' and report.get('furnishings') != 50:
                diagnostics.append('Furnished workload did not contain all 50 furnishings')
            if label == 'connected-freight':
                freight = next((e for e in report['events'] if e.get('kind') == 'connected_freight_hoist'), {})
                if freight.get('modules') != 3 or freight.get('deliveries', 0) < 2 or freight.get('cable_frames', 0) < 1:
                    diagnostics.append('Freight workload did not deliver grounded cargo through real cable collision')
            if report['metrics']['frame_ms']['p95'] > 16.667:
                diagnostics.append('1080p High workload exceeded 60 FPS frame budget at p95')
        row['passed'] = not result.returncode and not diagnostics and bool(report) and row['source_stable']
        rows.append(row)
        (OUT/'summary.json').write_text(json.dumps(rows, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(row), flush=True)
        if not row['passed']:
            return 1
    after = inputs()
    (OUT/'inputs-end.json').write_text(json.dumps(after, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'complete': True, 'workloads': len(rows), 'all_inputs_stable': before == after}), flush=True)
    return 0 if before == after else 1


if __name__ == '__main__':
    raise SystemExit(main())
