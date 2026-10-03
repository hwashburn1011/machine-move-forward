import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/beta-next'
native=json.loads((OUT/'combat-native/review.json').read_text())
tests={name:json.loads((OUT/(name+'.json')).read_text()) for name in ['enemy-tells','cordon-guardian-headless','enemy-combat-contract']}
files=['godot/scripts/cordon_guardian.gd','godot/scripts/gatekeeper_presentation.gd','godot/scripts/enemy_tells.gd','godot/scripts/enemy.gd','godot/scripts/raider_craft.gd','godot/scripts/audio.gd','godot/art/gatekeeper-service-kit.glb','assets/beta-next/gatekeeper/GatekeeperServiceKit-editable.blend','assets/beta-next/gatekeeper/GatekeeperCompleteReview.blend']
report={
 'scope':'Bounded combat readability and Gatekeeper encounter refinement. Original six enemy AI roles, body rigs, hull health and alternative resolutions retained.',
 'tests':{name:{'checks':data['checks'],'failures':data['failures']} for name,data in tests.items()},
 'headless_checks':sum(data['checks'] for data in tests.values()),
 'original_combat_contract_ticks':tests['enemy-combat-contract']['ticks'],
 'native_views':len(native['captures']),
 'human_playthrough':False,
 'contact_sheets':['test-results/beta-next/combat-native/contact-guardian.jpg','test-results/beta-next/combat-native/contact-enemy-tells.jpg'],
 'review':[
  'All 20 native views inspected: 10 real-checkpoint Guardian encounter/detail views and 10 paused representative states across six original enemy assemblies.',
  'Both moving shutters connect to physical hinge pins and expose the retained cyan optic. Every new gun-kit vertex stays within the actual weapon target in both tested closed/open states.',
  'The 82 authored hardware components are finite with no degenerate polygons or nearest-bounds support candidates. Whole-carrier source retained for fitted review.',
  'Native review caught downward arrow winding; reversed the three faces and added three front-face regression checks. Native arrows now clearly show fixed committed directions.',
  'Three-mark line and five-mark cross warnings stay fixed after player movement; each four-metre visible diameter matches its two-metre blast radius.',
  'All three legitimate resolutions persist their one-time cosmetic receipt. Decoy escape does not grant destroyed-carrier cargo.',
  'Enemy close views are controlled fixtures on an isolated supported floor, not natural combat difficulty evidence. Disabled-drone view retains the original falling-drone glow at the feet.'
 ],
 'gltf_validation':'assets/beta-next/gatekeeper/validation.json',
 'source_geometry_audit':'assets/beta-next/gatekeeper/source-geometry.json',
 'remaining_validation':'Root owns combined regression suite, final quiet performance review and user playtesting.',
 'frozen_files':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in files}
}
assert report['headless_checks']==168
assert report['native_views']==20
assert all(not row['failures'] for row in tests.values())
(OUT/'combat-completion.json').write_text(json.dumps(report,indent=2)+'\n')
print('Combat completion:',report['headless_checks'],'headless checks;',report['native_views'],'inspected native views')
