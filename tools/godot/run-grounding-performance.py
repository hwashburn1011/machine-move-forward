"""Measure grounded destinations from side views; retain earlier performance evidence."""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HELPERS = runpy.run_path(str(ROOT/'tools/godot/run-campaign-earned-soak.py'), run_name='evidence_helpers')


def inputs():
    return {'source': HELPERS['source_fingerprint'](), 'assets': HELPERS['asset_manifest'](),
            'native_shapes': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in sorted((ROOT/'godot/data').rglob('*.res'))},
            'fixtures': {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in [
                'godot/tests/art200_performance.gd', 'godot/tests/deck_audio_performance.gd',
                'godot/tests/site_grounding_performance.gd', 'tools/godot/run-grounding-performance.py']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT/'test-results/site-grounding/performance')
    parser.add_argument('--scenarios', nargs='+', default=['travel', 'combat', 'wake', 'foundry', 'array', 'orchard', 'meridian', 'berth'])
    parser.add_argument('--seconds', type=float, default=18)
    args = parser.parse_args()
    out = args.out.resolve()
    # Fixture uses this exact evidence location; do not silently redirect only logs.
    if out != ROOT/'test-results/site-grounding/performance':
        parser.error('The fixture output and wrapper must use the same performance directory.')
    out.mkdir(parents=True, exist_ok=True)
    if (out/'summary.json').exists():
        parser.error('Existing evidence is retained. Archive this run explicitly before repeating it.')
    before = inputs()
    (out/'inputs-start.json').write_text(json.dumps(before, indent=2)+'\n', encoding='utf-8')
    rows = []
    for scenario in args.scenarios:
        name = 'grounded-'+scenario
        report_path = out/(name+'.json')
        if report_path.exists():
            raise FileExistsError(report_path)
        command = [str(ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'),
                   '--path', str(ROOT/'godot'), '--script', 'tests/site_grounding_performance.gd',
                   '--log-file', str(out/(name+'.log')), '--', '--label=grounded',
                   '--scenario='+scenario, '--seconds='+str(args.seconds)]
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=args.seconds+180)
        text = result.stdout+result.stderr
        (out/(name+'-output.txt')).write_text(text, encoding='utf-8')
        issues = [line for line in text.splitlines() if line.startswith(('ERROR:', 'SCRIPT ERROR:', 'WARNING:', 'FAIL '))]
        report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {}
        stable = HELPERS['source_fingerprint']() == before['source']
        row = {'scenario': scenario, 'exit_code': result.returncode, 'diagnostics': issues,
               'report_present': bool(report), 'source_stable': stable}
        if report:
            row.update(frame_ms=report['metrics']['frame_ms'], gpu_ms=report['metrics']['gpu_ms'],
                       source_hash=report['source_hash'], draw_calls=report['metrics']['draw_calls']['median'])
            if report['metrics']['frame_ms']['p95'] > 16.667:
                issues.append('1080p High p95 exceeded the 60 FPS frame budget')
        row['passed'] = result.returncode == 0 and not issues and bool(report) and stable
        rows.append(row)
        (out/'summary.json').write_text(json.dumps(rows, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(row), flush=True)
        if not row['passed']:
            return 1
    after = inputs()
    (out/'inputs-end.json').write_text(json.dumps(after, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'complete': True, 'workloads': len(rows), 'all_inputs_stable': before == after}), flush=True)
    return 0 if before == after else 1


if __name__ == '__main__':
    raise SystemExit(main())
