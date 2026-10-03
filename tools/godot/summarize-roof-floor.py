"""Verify and freeze the roof/floor iteration's accepted evidence."""
from pathlib import Path
import hashlib
import json
import runpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'test-results/roof-floor'
HELPERS = runpy.run_path(str(ROOT/'tools/godot/run-campaign-earned-soak.py'), run_name='evidence_helpers')


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()


def accepted(folder):
    rows = read(f'test-results/roof-floor/{folder}/summary.json')
    corrected = OUT/(folder+'-corrected/summary.json')
    if corrected.exists():
        newer = {row['suite']: row for row in json.loads(corrected.read_text(encoding='utf-8'))}
        rows = [newer.pop(row['suite'], row) for row in rows]+list(newer.values())
    for row in rows:
        assert row['exit_code'] == 0 and not row['failures'], row
        assert row['source_hash'] == source == row['source_hash_end'], row['suite']
    return rows


source = HELPERS['source_fingerprint']()
regressions = accepted('regressions-final')
compiled = accepted('regressions-compiled-final')
required = {'floor_surfaces','site_roofs','compiled_machine','traversal','physical_expeditions',
            'workshop_first_visit','construction_spaces','construction_usability',
            'nomad_personalization','beta_crane_collision','construction_crane_delivery',
            'encounter_loading','playtest_checkpoints','campaign_flow','survivor_content',
            'machine_composition','integration'}
assert required <= {row['suite'] for row in regressions}
assert {'floor_surfaces','construction_spaces'} <= {row['suite'] for row in compiled}
for kind in ['author','compiled']:
    floor = read(f'test-results/roof-floor/floor-surfaces-{kind}.json')
    assert floor['passed'] and not floor['failures'] and floor['source_hash'] == source
    assert all(row['passed'] for row in floor['checks'])
geometry = read('test-results/roof-floor/machine-floor-geometry.json')
mesh = read('test-results/roof-floor/machine-floor-export-audit.json')
assert sha('godot/art/nomad-access.glb') == mesh['sha256'] and mesh['degenerate_triangles'] == 0
assert all(row['coverage_unchanged'] and row['after_overlap_area'] == 0 for row in geometry['decks'].values())
assert all(abs(row['coincident_upward_area_m2']) < 1e-8 for row in mesh['decks'].values())
roof = read('test-results/roof-floor/site-roofs-test.json')
assert roof['passed'] and not roof['failures']
for name in ['structural-validation','roof-structural-validation']:
    path = OUT/'wake'/(name+'.json')
    result = json.loads(path.read_text(encoding='utf-8'))
    assert result['checks'] and all(c['passed'] for c in result['checks']), name

before = read('test-results/roof-floor/before/capture.json')
# Wake was reproduced in a separate baseline run against the same frozen source.
wake_before = read('test-results/roof-floor/before/capture-wake-floor.json')
assert before['source_hash'] == wake_before['source_hash']
before['records'] += wake_before['records']
after = read('test-results/roof-floor/after/capture.json')
walking = read('test-results/roof-floor/after/capture-walking.json')
assert after['source_hash'] == walking['source_hash'] == source
assert len(before['records']) == len(after['records']) == 10
assert before['records'] == after['records'], 'Paired camera paths must match exactly'
assert len(walking['records']) == 4 and all(r['travelled'] > 5.5 for r in walking['records'])
for label, captures in [('before',before),('after',after),('after',walking)]:
    for row in captures['records']:
        base = OUT/label/row['id']
        assert len(list(base.glob('frame-*.jpg'))) == row['frames'], base
        assert base.with_suffix('.mp4').is_file(), base
roof_views = read('test-results/roof-floor/native-roofs/roof-captures.json')
assert roof_views['passed'] and not roof_views['failures'] and roof_views['sourceHash'] == source
assert {'foundry-high-roof','foundry-loading-entrance','foundry-player-interior',
        'foundry-torn-bay','foundry-eave-folds','foundry-seated-floor',
        'workshop-rear-canopy','workshop-player-aisle','workshop-clear-upper-bridge',
        'workshop-canopy-brackets','array-vault-seated-cap','array-vault-bearing-detail',
        'orchard-archive-cap','orchard-archive-bearing-detail','orchard-archive-title',
        'orchard-entry-lettering','meridian-garden-lettering'} <= {r['name'] for r in roof_views['images']}
assert roof_views['roofManifestSha256'] == sha('godot/data/site-roofs.json')
assert roof_views['roofGlbSha256'] == sha('godot/art/native-site-roofs.glb')
assert roof_views['foundrySha256'] == sha('godot/assets/models/authored/relay-foundry.glb')
for path, digest in roof_views['baseSiteGlbHashes'].items():
    assert digest == sha('godot/'+path.removeprefix('res://')), path
review = read('test-results/roof-floor/visual-review.json')
assert review['passed'] and review['source_hash'] == source
for row in review['images']:
    assert row['sha256'] == sha(row['path']), row['path']

start = read('test-results/roof-floor/performance/inputs-start.json')
end = read('test-results/roof-floor/performance/inputs-end.json')
performance = read('test-results/roof-floor/performance/summary.json')
assert start == end and start['source'] == source
assert start['assets'] == HELPERS['asset_manifest']()
for path, digest in start['roof_collision'].items():
    assert digest == sha(path)
assert len(performance) == 9 and all(row['passed'] and row['source_hash'] == source for row in performance)
historical = read('test-results/roof-floor/preceding-report-hashes.json')
assert all(sha(path) == digest for path,digest in historical.items())

report = {
    'passed': True, 'source_hash': source, 'runtime_assets_sha256': start['assets']['sha256'],
    'compiled_machine_sha256': sha('godot/art/nomad-native.scn'),
    'scope': 'Native machine floors, constructed floor presentation/physics, boardable-site floor audit, supported roofs and damaged-sheet collision.',
    'regressions': regressions, 'compiled_regressions': compiled,
    'duplicate_machine_floor_area_removed_m2': sum(r['removed_duplicate_area'] for r in geometry['decks'].values()),
    'machine_geometry_audit': mesh, 'roof_checks': roof['checks'],
    'paired_floor_clips': 10, 'actual_player_walk_clips': 4, 'new_roof_views': len(roof_views['images']),
    'visual_review': review, 'performance_workloads': performance,
    'worst_p95_frame_ms': max(r['frame_ms']['p95'] for r in performance),
    'worst_frame_ms': max(r['frame_ms']['max'] for r in performance),
    'frames_over_50ms': sum(r['frame_ms']['over50ms'] for r in performance),
    'prior_reports_unchanged': historical,
    'limits': 'Scripted native views and real controller/physics fixtures on this computer. No human visual acceptance, full earned campaign run or low-spec hardware claim. Initial failed/incomplete diagnostics remain separate.'
}
payload = json.dumps(report,indent=2)+'\n'
(OUT/'completion.json').write_text(payload,encoding='utf-8')
(ROOT/'docs/godot-port/results/roofs-floor-stability-2026-10-02.json').write_text(payload,encoding='utf-8')
print(json.dumps({k:report[k] for k in ['passed','source_hash','worst_p95_frame_ms','worst_frame_ms','frames_over_50ms']}))
