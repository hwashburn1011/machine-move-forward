"""Build the bounded paint contract from authored palette/manifest metadata. No art edits."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
palette = json.loads((ROOT / 'assets/art200/palette.json').read_text())['families']
families = {p['id']: p for p in palette}
pieces = {}
for cohort, prefix in [('art100', 'N100'), ('art200', 'N200')]:
    manifest = json.loads((ROOT / f'assets/{cohort}/machine/manifest.json').read_text())
    for key, spec in manifest.items():
        family = spec['color_family']
        pieces[key] = {f'{prefix}_{family}': {'source': families[family]['paint'], 'tone': 'paint'},
                       f'{prefix}_{family}_washed': {'source': families[family]['secondary'], 'tone': 'secondary'}}
        if cohort == 'art100':
            pieces[key][f'N100_fabric_{family}'] = {'source': families[family]['paint'], 'tone': 'paint'}
pieces['generator'] = {'Generator worn ivory': {'source_linear': [.43, .405, .32], 'tone': 'paint'}}
zones = {
    'lockers': {'name': 'Cargo locker enamel', 'anchor': 'NativeCargoLockers', 'materials': {
        'Locker worn enamel': {'source_linear': [.33, .315, .255], 'tone': 'paint'}}},
    'benches': {'name': 'Service bench enamel', 'anchor': 'NativeServiceBenches', 'materials': {
        'Bench worn mineral enamel': {'source_linear': [.21, .239, .218], 'tone': 'paint'}}},
}
out = {'format': 1, 'palette': families, 'pieces': pieces, 'zones': zones}
(ROOT / 'godot/data/nomad-personalization.json').write_text(json.dumps(out, indent=2) + '\n')
print(f'Paint contract: {len(pieces)} eligible definitions; {len(families)} muted colors; {len(zones)} machine zones')
