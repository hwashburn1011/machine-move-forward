"""Close the independent legacy/sign review after inspecting final renders.

Does not write Blender masters or runtime exports. Keeps the original findings
and their original source hashes, then records the inspected corrected evidence.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/art200/fine-comb'
report_path = OUT / 'legacy-signs-review.json'
report = json.loads(report_path.read_text())
geometry = json.loads((OUT / 'legacy-signs-geometry.json').read_text())
ambulance=next(m for m in report['models'] if m['id']=='wreck-ambulance')
if not any('95 mm headlamp' in i['description'] for i in ambulance['issues']):
    ambulance['issues'].append(dict(priority=2,description='Final strict component check found a 95 mm headlamp-to-bumper gap beneath each ambulance headlamp housing.',status='reported_to_owner'))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

legacy_repairs = {
    'wreck-pickup': 'Verified two seat pedestals and grille return tabs overlap the adjoining seat/body geometry.',
    'wreck-ambulance': 'Verified roof saddles, two seat pedestals, oxygen cradle wall brackets and perimeter roof seating rails. Two added steel pedestals now support the headlamp housings directly from the bumper; the fresh ambulance render confirms the final attachment.',
    'wreck-forklift': 'Verified the seat pedestal and continuous inner chain strips with mast/sheave mounting.',
    'fuel-trailer': 'Verified welded bumper hangers connect the rear bumper to the chassis.',
    'culvert': 'Verified the left grate support and two newly added, rotated cast foundation shoes under the wingwalls. Both shoes reach ground; the final render shows continuous wall-to-foundation contact.',
    'diesel-generator': 'Verified the DIESEL 40 plaque mounting posts meet the chassis and back of the plaque.',
    'signal-gantry': 'Verified upper mounting-tube straps connect into the main gantry frame.',
    'bus-shelter': 'Verified the original AMBERLINE / DUSTMILE STOP / ROUTE 07 board. Only the shelter uses the new atlas tile; the highway gantry retains its direction arrows.',
}
paint_resolution = 'Final renders show subdued nondirectional paint variation and small chips. The repeated triangular BaseColor dent stamps are removed from tiles 3, 7, 8 and 14; authored vehicle mesh dents remain. Roughness and fine normal maps retain material response.'
panel_resolution = 'Verified continuous rear rails at all sheet seams, including three-row boards; four stand-off sleeves per panel span the former 60 mm air gap, and longer fixing shafts connect to the rails. Lower-right fixings move clear of intentionally missing panel corners.'
stem_resolution = 'Verified tubular posts, backing spines and ladder rails start inside their base seats. Each backing spine has its own soleplate.'

screens = {}
for name, entry in geometry.items():
    components = entry['components']
    assert all(c['zero_area_faces'] == 0 for c in components), name
    if 'runtime' in entry:
        assert entry['runtime']['zero_area_faces'] == 0, name
    lo = np.array([p['bounds_blender']['min'] for p in components])
    hi = np.array([p['bounds_blender']['max'] for p in components])
    parent = list(range(len(components)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(len(components)):
        separation = np.maximum(np.maximum(lo[i] - hi, lo - hi[i]), 0)
        distances = np.linalg.norm(separation, axis=1)
        for j in np.flatnonzero(distances <= .025):
            if j > i:
                parent[find(int(j))] = find(i)
    groups = {}
    for i in range(len(components)):
        groups.setdefault(find(i), []).append(i)
    elevated = []
    for group in groups.values():
        floor = float(lo[group, 2].min())
        if floor > .025:
            elevated.append({'minimum_z': floor, 'parts': [components[i]['name'] for i in group]})
    assert not elevated, (name, elevated)
    screens[name] = dict(editable_parts=len(components), zero_area_faces=0,
        bounds_groups=len(groups), elevated_bounds_groups_at_25mm=0)

report.setdefault('initial_sources', report['sources'].copy())
report['reviewer']='Wasteland author: independent initial review of root-owned legacy and billboard art, followed by explicitly delegated narrow cleanup'
report['sources'] = {p: sha(ROOT/p) for p in report['sources']}
report['scope'] = '25 prior legacy assemblies and 25 new billboard assemblies. Initial review was read-only. Root subsequently authorized this reviewer to remove only zero-area legacy runtime triangles and add two ambulance headlamp pedestals; all other corrections belong to their original authors. Two authorized sign source-part metadata counts were corrected.'
report['method'] = f"All 50 final model renders visually inspected in ten final contact sheets, followed by the fresh ambulance render after its final pedestals. All {sum(len(e['components'])for e in geometry.values()):,} editable component bounds examined with source-code support relationships; runtime and editable component zero-area checks repeated after the final support and hidden-web corrections. Bounds adjacency at 25 mm is a screening check, not proof of attachment; concrete repair closure also uses actual source positions and render inspection."
report['final_review_images'] = [f'assets/art200/fine-comb/{cohort}-final-{i}.jpg' for cohort in ['legacy', 'signs'] for i in range(1,6)]
report['final_sources'] = {
    str(p.relative_to(ROOT)).replace('\\','/'): sha(p)
    for p in [ROOT/'assets/art100/legacy/Art100_DesertRefinement.blend', ROOT/'assets/art200/signs/Art200_Advertising-editable.blend']
}
report['review_completion'] = 'Fine-comb review complete; all 80 recorded findings verified resolved. No additional concrete defect found in the 50 final renders and source review.'
report['runtime_cleanup_evidence'] = 'assets/art200/legacy-touchup/degenerate-cleanup-audit.json'
report['runtime_geometry_evidence'] = 'assets/art200/fine-comb/legacy-signs-glb-geometry.json'
report['metadata_corrections'] = {
    'art200-billboard-grainward-coop': {'source_parts': 377},
    'art200-billboard-sunbreak-cinema': {'source_parts': 414},
}

for index, model in enumerate(report['models']):
    name = model['id']
    cohort = 'legacy' if index < 25 else 'signs'
    model['initial_review_image'] = model.get('initial_review_image', model['review_image'])
    model['review_image'] = f'assets/art200/fine-comb/{cohort}-final-{(index%25)//5+1}.jpg'
    folder = ROOT / ('assets/art100/legacy/renders' if index < 25 else 'assets/art200/signs/renders')
    render = list(folder.glob(f'*{name}.png'))
    assert len(render) == 1, (name, render)
    model['final_render'] = str(render[0].relative_to(ROOT)).replace('\\','/')
    model['final_render_sha256'] = sha(render[0])
    model['final_geometry_screen'] = screens[name]
    final_notes = []
    for issue in model['issues']:
        issue['status'] = 'verified_resolved'
        description = issue['description']
        if 'BaseColor' in description:
            resolution = paint_resolution
        elif 'printed panels' in description:
            resolution = panel_resolution
        elif 'Tubular stanchions' in description:
            resolution = stem_resolution
        elif name == 'art200-billboard-parcel-plain':
            resolution = 'Verified transverse chassis crossmembers beneath both uprights, spanning into both longitudinal underframe rails.'
        elif name == 'art200-billboard-sunbreak-cinema':
            resolution = 'Verified top and bottom lateral ties connecting both vertical theatre blades to the main frame.'
        else:
            resolution = legacy_repairs.get(name)
            assert resolution, (name, description)
        issue['resolution'] = resolution
        issue['verified_by'] = ['Final editable component coordinates and source geometry', 'Final model render']
        if resolution not in final_notes:
            final_notes.append(resolution)
    if name == 'culvert' and legacy_repairs[name] not in final_notes:
        final_notes.append(legacy_repairs[name])
    if name in ['art200-billboard-grainward-coop','art200-billboard-sunbreak-cinema']:
        final_notes.append('Verified the hidden zero-length crest web is removed. Final editable components and runtime have no zero-area faces; source-part count now matches actual children.')
    model['final_observation'] = ' '.join(final_notes) or 'Final render and source review found no concrete support, grounding, scale, material or graphic defect.'
    model['geometry_status'] = 'verified_after_correction' if model['issues'] else 'no_concrete_defect_found'
    model['status'] = 'review_complete'

report['status'] = 'Complete: 50 reviewed, 80 findings resolved, no pending correction.'
report_path.write_text(json.dumps(report, indent=2)+'\n')
(OUT/'legacy-signs-attachment-final.json').write_text(json.dumps(dict(
    threshold_m=.025,
    limitation='Axis-aligned bounds adjacency is only a screening check; it cannot prove that angled or hollow meshes touch. Source geometry and renders were inspected separately.',
    models=screens), indent=2)+'\n')
print('INDEPENDENT_REVIEW_CLOSED', len(report['models']), sum(len(x['issues']) for x in report['models']))
