"""Sequential native rendering checks against frozen runtime and art inputs."""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
HELPERS = runpy.run_path(str(ROOT / 'tools/godot/run-campaign-earned-soak.py'), run_name='evidence_helpers')
OUT = ROOT / 'test-results/deck-audio/performance'
SCENARIOS = ['travel', 'construction', 'furnished', 'combat', 'guardian', 'crane', 'drone',
             'wake', 'foundry', 'array', 'orchard', 'meridian', 'berth']


def asset_stat():
    return {p.relative_to(ROOT).as_posix(): [p.stat().st_size, p.stat().st_mtime_ns]
            for folder in ['art', 'assets'] for p in (ROOT/'godot'/folder).rglob('*') if p.is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenarios', nargs='+', default=SCENARIOS)
    parser.add_argument('--seconds', type=float, default=18)
    parser.add_argument('--home-seconds', type=float, default=180)
    parser.add_argument('--skip-home', action='store_true')
    parser.add_argument('--only-home', action='store_true', help='Retain previously passing ordinary workloads and rerun only the home fixture.')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    before = {'source': HELPERS['source_fingerprint'](), 'assets': HELPERS['asset_manifest']()}
    initial_asset_stat = asset_stat()
    fixtures = ['godot/tests/art200_performance.gd', 'godot/tests/deck_audio_performance.gd',
                'godot/tests/deck_home_performance.gd', 'godot/tests/deck_guardian_performance.gd',
                'godot/tests/deck_freight_performance.gd',
                'godot/tests/beta_home_performance.gd', 'godot/tests/beta_guardian_performance.gd',
                'tools/godot/run-campaign-earned-soak.py',
                'tools/godot/run-deck-audio-performance.py']
    fixture_hashes = {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in fixtures}
    (OUT/'inputs-start.json').write_text(json.dumps({**before, 'fixtures': fixture_hashes}, indent=2)+'\n')
    rows = []
    if args.only_home:
        rows = [row for row in json.loads((OUT/'deck-audio-summary.json').read_text()) if row['label'] != 'painted-home']
        if not all(row['passed'] and row['source_hash'] == before['source'] for row in rows):
            raise SystemExit('Previous workloads must pass on the same runtime before a home-only rerun')
    workloads = [(s, args.seconds, 'deck_audio_performance', 'deck-audio') for s in args.scenarios]
    if not args.skip_home:
        workloads.append(('guardian', 45, 'deck_guardian_performance', 'beta-escalated'))
        workloads.append(('furnished', 45, 'deck_freight_performance', 'connected-freight'))
        workloads.append(('furnished', args.home_seconds, 'deck_home_performance', 'painted-home'))
    if args.only_home:
        workloads = [('furnished', args.home_seconds, 'deck_home_performance', 'painted-home')]
    for scenario, seconds, script, label in workloads:
        name = f'{label}-{scenario}'
        report_path = OUT/(name+'.json')
        # A stale diagnostic can never satisfy a fresh run.
        if report_path.exists():
            report_path.replace(OUT/(name+f'-previous-{time.time_ns()}.json'))
        command = [str(ROOT/'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe'),
                   '--path', str(ROOT/'godot'), '--script', f'tests/{script}.gd',
                   '--log-file', str(OUT/(name+'.log')), '--', f'--label={label}',
                   f'--scenario={scenario}', f'--seconds={seconds}']
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=seconds+180)
        output = result.stdout+result.stderr
        (OUT/(name+'-output.txt')).write_text(output, encoding='utf-8')
        diagnostics = [line for line in output.splitlines()
                       if line.startswith(('ERROR:', 'SCRIPT ERROR:', 'WARNING:', 'FAIL '))]
        report = json.loads(report_path.read_text()) if report_path.exists() else {}
        row = {'scenario': scenario, 'label': label, 'exit_code': result.returncode,
               'diagnostics': diagnostics, 'report_present': bool(report),
               'source_stable': HELPERS['source_fingerprint']() == before['source'],
               'asset_stat_stable': asset_stat() == initial_asset_stat}
        if report:
            row.update(frame_ms=report['metrics']['frame_ms'],
                       gpu_ms=report['metrics']['gpu_ms'], source_hash=report['source_hash'],
                       draw_calls=report['metrics']['draw_calls']['median'])
            if label == 'beta-escalated' and not any(event.get('cross_observed') for event in report['events']):
                diagnostics.append('Escalated fixture did not observe a live cross salvo')
            if label == 'painted-home':
                home = next((event for event in report['events'] if event.get('kind') == 'painted_home_three_drones'), {})
                moving = any(phase != 'idle' and samples > 0 for phase, samples in home.get('phase_samples', {}).items())
                if report.get('furnishings') != 50 or home.get('docks') != 3 or home.get('painted_pieces', 0) < 51 or home.get('received_items', 0) <= 0 or not moving:
                    diagnostics.append('Home fixture did not exercise all furnishings and actual drone recovery')
                if seconds >= 90 and home.get('music_starts', 0) < 1:
                    diagnostics.append('Calm home fixture did not actually enter its scheduled music')
            if label == 'connected-freight':
                freight = next((event for event in report['events'] if event.get('kind') == 'connected_freight_hoist'), {})
                if freight.get('modules') != 3 or freight.get('deliveries', 0) < 2 or freight.get('cable_frames', 0) < 1:
                    diagnostics.append('Freight fixture did not render all modules and deliver actual grounded loads')
        row['passed'] = not result.returncode and not diagnostics and bool(report) and row['source_stable'] and row['asset_stat_stable']
        rows.append(row)
        (OUT/'deck-audio-summary.json').write_text(json.dumps(rows, indent=2)+'\n')
        print(json.dumps(row), flush=True)
        if not row['passed']:
            return 1
    after = {'source': HELPERS['source_fingerprint'](), 'assets': HELPERS['asset_manifest']()}
    final_fixture_hashes = {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in fixtures}
    (OUT/'inputs-end.json').write_text(json.dumps({**after, 'fixtures': final_fixture_hashes}, indent=2)+'\n')
    stable = before == after and fixture_hashes == final_fixture_hashes
    print(json.dumps({'complete': True, 'workloads': len(rows), 'all_inputs_stable': stable}), flush=True)
    return 0 if stable else 1


if __name__ == '__main__':
    raise SystemExit(main())
