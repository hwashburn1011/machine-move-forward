"""Collect final machine-space/audio evidence, retaining every initial diagnostic."""
from pathlib import Path
import hashlib
import json
import runpy
import shutil

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/deck-audio'
HELPERS = runpy.run_path(str(ROOT / 'tools/godot/run-campaign-earned-soak.py'), run_name='evidence_helpers')


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def main():
    source = HELPERS['source_fingerprint']()
    accepted = OUT / 'regressions-accepted'
    accepted.mkdir(exist_ok=True)
    suites = {}
    for folder in ['regressions-final', 'regressions-corrected']:
        for row in read(f'test-results/deck-audio/{folder}/summary.json'):
            # A misspelled invocation is retained as a diagnostic; the actual
            # enemy_combat_contract suite replaces that nonexistent script.
            if row['suite'] == 'combat_contract':
                continue
            suites[row['suite']] = (row, OUT / folder)
    crane = read('test-results/deck-audio/crane-ground-delivery.json')
    assert crane['passed'] and crane['source_hash'] == crane['source_hash_end'] == source
    assert all(r['captured'] and r['delivered'] and r['real_heavy_meshes'] for r in crane['checks'])
    assert all(r['passed'] for r in crane['contracts'])
    crane_checks = len(crane['checks']) + len(crane['contracts'])
    results = []
    for name, (row, folder) in suites.items():
        log = folder / f'{name}-output.txt'
        diagnostics = [line for line in log.read_text(encoding='utf-8').splitlines()
                       if line.startswith(('WARNING:', 'ERROR:', 'SCRIPT ERROR:', 'FAIL '))]
        assert row['exit_code'] == 0 and not row['failures'] and not diagnostics, (name, row, diagnostics)
        assert row['source_hash'] == row['source_hash_end'] == source, name
        row = {**row, 'diagnostics': diagnostics, 'evidence': log.relative_to(ROOT).as_posix()}
        if name == 'construction_crane_delivery':
            row['checks'] = crane_checks
            row['count_source'] = 'Four complete ground pickup/transfer cases plus five obstacle, dune, parking and compatibility contracts.'
        shutil.copy2(log, accepted / log.name)
        results.append(row)
    assert len(results) == 36
    (accepted / 'summary.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    compiled = read('test-results/deck-audio/compiled-spaces-final/summary.json')[0]
    assert not compiled['exit_code'] and not compiled['failures']
    assert compiled['source_hash'] == compiled['source_hash_end'] == source
    signal = read('assets/deck-audio/signal-validation.json')
    assert signal['passed'] and all(c['passed'] for c in signal['assertions'])

    performance = read('test-results/deck-audio/performance/deck-audio-summary.json')
    start = read('test-results/deck-audio/performance/inputs-start.json')
    end = read('test-results/deck-audio/performance/inputs-end.json')
    assert start == end and start['source'] == source
    assert len(performance) == 16 and all(r['passed'] and r['source_hash'] == source for r in performance)
    home = read('test-results/deck-audio/performance/painted-home-furnished.json')
    freight = read('test-results/deck-audio/performance/connected-freight-furnished.json')
    guardian = read('test-results/deck-audio/performance/beta-escalated-guardian.json')
    home_work = next(e for e in home['events'] if e.get('kind') == 'painted_home_three_drones')
    freight_work = next(e for e in freight['events'] if e.get('kind') == 'connected_freight_hoist')
    historical = {r['scenario']: r for r in read('test-results/beta-next/performance/beta-next-summary.json') if r['label'] == 'beta-next'}
    comparisons = []
    for row in performance:
        if row['label'] != 'deck-audio':
            continue
        old = historical[row['scenario']]
        comparisons.append({'scenario': row['scenario'], 'prior_p95_ms': old['frame_ms']['p95'],
                            'current_p95_ms': row['frame_ms']['p95'],
                            'p95_delta_ms': round(row['frame_ms']['p95'] - old['frame_ms']['p95'], 3),
                            'fixture_note': 'Fifty furnishings now use all three permanent decks; earlier exterior arrangement is not directly comparable.' if row['scenario'] == 'furnished' else 'Same scripted scenario, updated game assets and rules.'})

    composition = read('test-results/deck-audio/native/composition-captures.json')
    modules = read('test-results/deck-audio/native-recovered/recovered-module-captures.json')
    wrist = read('test-results/deck-audio/wrist/report.json')
    combat = read('test-results/deck-audio/combat-native/review.json')
    assert composition['passed'] and composition['sourceHash'] == source
    assert modules['passed'] and modules['sourceHash'] == source and modules['operation']['delivered']
    assert wrist['passed'] and wrist['source_hash'] == source
    assert combat['source_fingerprint'] == source
    assert modules['glbSha256'] == sha('godot/art/nomad-recovered-modules.glb')
    composition_closure = read('test-results/deck-audio/composition-visual-closure.json')
    assert composition_closure['compiledSceneSha256'] == sha('godot/art/nomad-native.scn')
    inspection = read('test-results/deck-audio/root-visual-review.json')
    assert inspection['passed'] and inspection['source_hash'] == source
    prior_unchanged = sha('test-results/beta-next/completion.json') == sha('test-results/deck-audio/previous-iteration-completion.json')
    assert prior_unchanged
    report = {
        'date': '2026-10-02', 'status': 'machine_spaces_audio_iteration_verified',
        'source_hash': source, 'asset_sha256': start['assets']['sha256'],
        'plan': 'docs/superpowers/plans/2026-10-02-machine-spaces-audio.md',
        'guide': 'docs/godot-port/machine-spaces-audio.md',
        'scope': ['Sparse purposeful fixed dressing and permanent-deck building',
                  'Three guided recovered-machine connections, refined authored models and working freight clearance',
                  'Lower gunfire, intermittent original music and physical enemy cues',
                  'Quiet, persistent story/activity records and equipment-specific wrist feedback'],
        'regressions': {'suites': len(results), 'checks': sum(r['checks'] for r in results),
                        'results': results, 'alternate_compiled_spaces': compiled,
                        'offline_audio_checks': signal['checks'], 'failures': [], 'engine_diagnostics': []},
        'initial_diagnostics': {
            'retained': ['regressions-initial', 'regressions-final', 'construction-regression-01',
                         'freight-preflight-hazard-diagnostic.log', 'crane-ground-delivery-before.json',
                         'performance-furnished-diagnostic'],
            'resolved': ['Old synchronous placement/undo fixtures now await actual readiness.',
                         'Failed action atomicity checks preserve all gameplay state and verify the intentional local receipt.',
                         'Narrative test shutdown defers quit until suspended fixture references unwind.',
                         'Scout scheduling asserts silence plus actual arrival instead of a retired advance warning.',
                         'Final Blender export required a final compiled-source manifest refresh.',
                         'Misspelled combat_contract invocation replaced by the real enemy_combat_contract suite.',
                         'Freight fixture uses legal inventory capacity; low-dune cables now ignore only the flat safety proxy and test actual dune height.',
                         'The obsolete exterior grid accepted only35/50 pieces under access rules; final furnishing stress validates all50 on the three permanent decks.']},
        'visuals': {'native_views': sum(len(r['captures']) for r in [composition, modules, wrist, combat]),
                    'human_acceptance': False, 'inspection': inspection,
                    'composition': 'test-results/deck-audio/composition-visual-closure.json',
                    'modules': 'test-results/deck-audio/recovered-module-visual-closure.json',
                    'wrist': 'test-results/deck-audio/wrist/report.json',
                    'combat': 'test-results/deck-audio/combat-native/review.json'},
        'audio': {'signal_validation': 'assets/deck-audio/signal-validation.json',
                  'weapon_peak_reduction_db': [7.641765204448584, 8.463029905504577],
                  'music': 'Three original finite phrases; 45s initial calm, 90/125/160s silent intervals, 4s fade envelope, separate volume.',
                  'listening_acceptance': False},
        'performance': {'hardware': {key: home[key] for key in ['adapter', 'cpu', 'resolution', 'quality', 'vsync', 'frame_cap']},
                        'workloads': performance, 'historical_comparison': comparisons,
                        'painted_home': {'metrics': home['metrics'], 'workload': home_work, 'distance_travelled': home['distance_travelled']},
                        'freight': {'metrics': freight['metrics'], 'workload': freight_work},
                        'guardian': {'metrics': guardian['metrics'], 'events': guardian['events']},
                        'scope': 'Sequential fresh native processes:13 ordinary18s workloads,45s escalated Guardian,45s actual grounded freight,180s all-three-deck home with50 furnishings and3drones.3s warmup. Funded invulnerable fixtures, uncapped1080pHigh; OS/driver caches uncontrolled. Historical timings are observational, not a controlled hardware benchmark.'},
        'compatibility': {'save_format': 1, 'player_structures_relocated_on_load': False,
                          'prior_completion_report_unchanged': prior_unchanged,
                          'save_scope': 'All harnesses use isolated save directories and test_mode; no earned whole-campaign or human acceptance claim.'},
        'remaining_acceptance': ['Player listening preference and an uncoached playthrough of the quieter guidance.',
                                 'Full later-campaign economy/encounter playtesting and low-spec hardware certification remain V1 work.',
                                 'At closure, the player requested the next roof-detail and machine/visitable-building floor-flicker iteration.']
    }
    (OUT / 'completion.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'docs/godot-port/results/machine-spaces-audio-2026-10-02.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'suites': len(results), 'regression_checks': report['regressions']['checks'],
                      'compiled_checks': compiled['checks'], 'audio_checks': signal['checks'],
                      'native_views': report['visuals']['native_views'], 'performance_workloads': len(performance)}))


if __name__ == '__main__':
    main()
