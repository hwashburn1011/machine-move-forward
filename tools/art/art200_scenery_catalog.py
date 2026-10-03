"""Derive native scenery sizes from actual exported metre dimensions."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
signs=json.loads((ROOT/'assets/art200/signs/manifest.json').read_text())['models']
waste=json.loads((ROOT/'assets/art200/wasteland/integration.json').read_text())['models']
themes={
 'residential':['brasswell-teller-bank','dustmile-motel-office','thimble-laundrette','emberside-bakery','drylight-pharmacy','threadbare-tailor'],
 'roadside-services':['parcel-post-depot','cinder-auto-lift','lastcall-exchange','crosswind-compressor-house'],
 'industry':['borewell-pumpjack','reclaimer-trommel','ceramic-kiln','sandglass-cyclone','ventstack-catwalk'],
 'growing-belt':['ochre-icehouse','sinter-grain-elevator','pivot-irrigator'],
 'transport':['rook-ticket-booth','switchback-weighbridge','lattice-truss-bridge','rail-water-crane','ballast-loader'],
 'survey':['desert-ambulatory'], 'scrapyard':['demolition-cutter'], 'open-desert':[]}
groups={k:['art200-'+id for id in ids] for k,ids in themes.items()}
for row in signs:groups[row['theme']].append(row['id'])
rows=waste+signs
assert len(rows)==50 and len(set(r['id'] for r in rows))==50
specs=[[r['id'],round(max(r['dimensions_m'][0],r['dimensions_m'][2]),5)] for r in rows]
out='class_name MMFArt200Scenery\nextends RefCounted\n\n# Generated from measured GLB dimensions; no hand-estimated sign widths.\n'
out+='const SPECS='+json.dumps(specs,separators=(',',':'))+'\n'
out+='const THEMES='+json.dumps(groups,separators=(',',':'))+'\n'
out+='\nstatic func is_billboard(id: String) -> bool:\n\treturn id.begins_with("art200-billboard-")\n'
(ROOT/'godot/scripts/art200_scenery.gd').write_text(out)
print('ART200_SCENERY_CATALOG',len(rows))
