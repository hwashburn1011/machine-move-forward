"""Collect this iteration's completed, frozen verification without hiding diagnostics."""
from pathlib import Path
import json
import runpy
import shutil

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'test-results/beta-next'
HELPERS = runpy.run_path(str(ROOT/'tools/godot/run-campaign-earned-soak.py'), run_name='evidence_helpers')


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))


def main():
    source = HELPERS['source_fingerprint']()
    initial = read('test-results/beta-next/regressions-initial/summary.json')
    corrections = read('test-results/narrative-regressions/summary.json')
    suites = {row['suite']: row for row in initial}
    suites.update({row['suite']: row for row in corrections})
    regressions = []
    archive = OUT/'regressions-final'
    archive.mkdir(exist_ok=True)
    for name, row in suites.items():
        log = ROOT/f'test-results/narrative-regressions/{name}-output.txt'
        diagnostics = [line for line in log.read_text(encoding='utf-8').splitlines()
                       if line.startswith(('WARNING:', 'ERROR:', 'SCRIPT ERROR:', 'FAIL '))]
        row = {**row, 'diagnostics': diagnostics}
        assert not row['exit_code'] and not row['failures'] and not diagnostics, row
        assert row['source_hash'] == row['source_hash_end'] == source, row
        shutil.copy2(log, archive/log.name)
        regressions.append(row)
    (archive/'summary.json').write_text(json.dumps(regressions, indent=2)+'\n')
    performance = read('test-results/beta-next/performance/beta-next-summary.json')
    inputs_start = read('test-results/beta-next/performance/inputs-start.json')
    inputs_end = read('test-results/beta-next/performance/inputs-end.json')
    assert inputs_start == inputs_end and inputs_start['source'] == source
    assert len(performance) == 15 and all(row['passed'] and row['source_hash'] == source for row in performance)
    baseline = {row['scenario']: row for row in read('test-results/art200/performance/final-summary.json')}
    comparison = []
    for row in performance:
        if row['label'] != 'beta-next':
            continue
        prior = baseline[row['scenario']]
        comparison.append({'scenario': row['scenario'], 'before_frame_ms': prior['frame_ms'],
                           'after_frame_ms': row['frame_ms'],
                           'p95_delta_ms': round(row['frame_ms']['p95']-prior['frame_ms']['p95'], 3)})
    home = read('test-results/beta-next/performance/painted-home-furnished.json')
    home_work = next(e for e in home['events'] if e.get('kind') == 'painted_home_three_drones')
    guardian = read('test-results/beta-next/performance/beta-escalated-guardian.json')
    earned_path = 'test-results/campaign-earned-soak/acceptance-wake-01'
    earned_runner = read(earned_path+'/runner-summary.json')
    earned = read(earned_path+'/report.json')
    assert earned_runner['passed'] and earned_runner['source_hash'] == source
    assert earned_runner['asset_sha256'] == inputs_start['assets']['sha256']
    native = read('test-results/beta-next/native/patchcoat-review.json')
    assert native['passed'] and native['source_hash'] == source
    save = read('test-results/beta-next/save-profile/report.json')
    assert save['source_hash'] == source and all(s['validCampaign'] for s in save['scenarios'].values())
    report = {
        'date': '2026-10-02', 'status': 'first_playable_delivery_verified', 'source_hash': source,
        'asset_sha256': inputs_start['assets']['sha256'],
        'plan': 'docs/superpowers/plans/2026-10-02-beta-progression-ownership-combat.md',
        'guide': 'docs/godot-port/beta-progression-ownership-combat.md',
        'scope': ['Inventory-based opening guidance and practical fuel/upgrade advice',
                  'Earned Patchcoat tools, 14 finishes, 50 furnishings plus generators and two machine zones, three keepsakes and relocation access',
                  'Six enemy-role tells, fitted Gatekeeper hardware, cross-salvo escalation and persistent service-mark entitlement'],
        'regressions': {'suites': len(regressions), 'checks': sum(r['checks'] for r in regressions),
                        'failures': [], 'engine_diagnostics': [], 'results': regressions},
        'corrected_test_contracts': [
            'Functional paint trolley description supersedes its former decorative-only description.',
            'Sword caption/direction checks retain the original attack timing assertions.',
            'Compiled-machine comparison recursively checks resource metadata and sharing; six adversarial checks added.',
            'Loader probes isolate request ownership after title preparation; real direction-mesh warm-up is checked.',
            'Guardian fixture awaits cold title resources and defers shutdown; cleanup diagnostics no longer occur.'
        ],
        'visuals': {'native_views': len(native['captures'])+20, 'human_acceptance': False,
                    'paint_report': 'test-results/beta-next/native/patchcoat-review.json',
                    'paint_inspection': 'test-results/beta-next/native/patchcoat-visual-closure.json',
                    'combat_report': 'test-results/beta-next/combat-native/review.json',
                    'combat_inspection': 'test-results/beta-next/combat-completion.json'},
        'earned_campaign': {'runner': earned_runner, 'report_path': earned_path+'/report.json',
                            'actor_summary': earned, 'scope': 'One default-seed opening-through-Wake run, normal clock/damage, ordinary paid resources. First crate rolled58 scrap and8 fuel; not a lower-percentile economy sample or human playtest.'},
        'performance': {'hardware': {key: home[key] for key in ['adapter', 'cpu', 'resolution', 'quality', 'vsync', 'frame_cap']},
                        'workloads': performance, 'historical_comparison': comparison,
                        'painted_home': {'metrics': home['metrics'], 'workload': home_work, 'furnishings': home['furnishings'], 'distance_travelled': home['distance_travelled']},
                        'escalated_guardian': {'metrics': guardian['metrics'], 'events': guardian['events']},
                        'scope': 'Sequential native fresh processes: thirteen comparable18s workloads,45s late Guardian and180s painted home with three drones.3s warmup, invulnerable prepared fixtures. OS/driver caches uncontrolled; not low-spec certification.'},
        'save_profile': save,
        'remaining_gates': ['Uncoached story comprehension and difficulty/chill-balance testing',
                            'Uninterrupted later-campaign earned economy and pacing',
                            'Broader player-built drone route layouts and lower-spec hardware'],
        'evidence_notes': ['Initial failing regression logs are retained under regressions-initial; corrected suites replaced only their own final entries.',
                           'The first dense home fixture held cargo at obstructed landing pads. Its failed result is retained under performance/blocked-home. The corrected rendering fixture keeps all50 furnishings and adds three legal pads with clear cargo space; only that workload was rerun.',
                           'One earlier historical objective-guidance report was recovered from its last retained cached report, not exact pre-iteration bytes; see historical-report-recovery.json.',
                           'The transient failed paint-review diagnostic is reconstructed and labeled as such in the native review records; its raw log had already been overwritten.']
    }
    for target in [OUT/'completion.json', ROOT/'docs/godot-port/results/beta-next-2026-10-02.json']:
        target.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'source_hash': source, 'suites': len(regressions),
                      'checks': report['regressions']['checks'], 'native_views': report['visuals']['native_views'],
                      'performance_workloads': len(performance), 'output': str(OUT/'completion.json')}))


if __name__ == '__main__':
    main()
