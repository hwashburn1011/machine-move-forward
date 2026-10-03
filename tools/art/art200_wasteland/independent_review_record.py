"""Cross-author visual observations plus independently measured Blender evidence."""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; OUT=ROOT/'assets/art200/fine-comb'
legacy=json.loads((ROOT/'assets/art100/legacy/manifest.json').read_text())
signs=json.loads((ROOT/'assets/art200/signs/manifest.json').read_text())['models']
geo=json.loads((OUT/'legacy-signs-geometry.json').read_text())
notes=[
'Hollow cab, dropped tailgate, spare wheel and cargo rails read coherently; headlamps and rims maintain scale.',
'Open rear medical door, hollow driving compartment and muted ceramic paint read clearly.',
'Mast, overhead guard and grounded forks are well separated; rear guard post overlaps counterweight and is not floating.',
'Solar wings and protected sample loom are supported; optical head and six wheel suspension give a clear research silhouette.',
'Brake cylinder, four flanged wheels and central swivel are legible; no major unsupported mass seen.',
'Open freight doors preserve true access; longitudinal container corrugation is appropriate to the substrate.',
'Grounded hitch support and attached tank straps; rear bumper requires real hangers.',
'Tyres, rack struts, caliper and kickstand are coherent; restrained tank color.',
'Open bore and expansion rings meet ground; inlet grate needs one local attachment correction.',
'Porcelain sheds, tank, oil return and radiator fins read as distinct manufactured surfaces.',
'LITRES and mechanical numerals are crisp, with a coherent nozzle holster and hose.',
'ISOLATE label and handles are readable; cabinet is grounded on the plinth.',
'RELAY plate, antennae and earth conductor are coherent; door and roof edges remain clear.',
'Twin fan grilles, contactor and pipe loops are connected, with correctly mounted support skids.',
'Dish rim, pivot and pedestal are convincing; painted fake dents are too conspicuous.',
'Mast, wheelbase and outrigger foot are legible at human scale; no major floating assembly seen.',
'Grounded machinery skids and three gauges; service plate sits ahead of its mounting surface.',
'Receiver, cooling heads and motor are distinct and visibly connected.',
'Grounded hydrant barrel, cap chains and broad mounting plate read correctly.',
'Tank saddles and access rail are coherent; the current BaseColor overstates painted dents.',
'Pallet runners carry the cases; FRAGILE and PARTS graphics are purpose appropriate.',
'Coiled cable, reel bolts and trailing connector are coherent, with the flange grounded.',
'Chamfered concrete and reflectors are legible; lifting loops sit in the barrier.',
'Wayfinding arrows are appropriate to an overhead road gantry; upper panel mounting tubes need ties.',
'Roof, bench, gutter and broken glass are supported; highway sign graphic is inappropriate as the stop map.'
]
specific={
'wreck-pickup':['Two seat groups have 28.5mm clearance from nearest support; add under-seat pedestals. Front grille has a27mm gap to body; add mounting tabs.'],
'wreck-ambulance':['Beacon/rail assembly is200mm from cab roof; add two roof saddles. Two seats have65mm floor clearance without pedestals. Oxygen cylinder/cradle groups have55mm body clearance; add wall/backing brackets. Roof edge begins~30mm above rear box wall; add perimeter seat/gasket.'],
'wreck-forklift':['Seat and belt group is95mm above engine deck; add a pedestal. Roller-chain link boxes stop30mm apart; add continuous inner chain strips with actual mast/sheave mounting.'],
'fuel-trailer':['Rear safety beam is60mm separated from chassis; add two welded rear hangers.'],
'culvert':['Leftmost collapsed inlet grate rod is102mm from the nearest concrete/grate component; embed its lower end in apron or add a connected grate crossbar.'],
'diesel-generator':['DIESEL /40 plate+letter group is49mm in front of housing; add short mounting posts or move onto the housing.'],
'signal-gantry':['Two upper panel mounting tubes have43.5mm separation from nearest panel/steel; add straps between mounting tubes and actual panel backs.'],
'bus-shelter':['Replace reused NORTH/CITY LIMIT highway arrow graphic with an original route/stop/destination panel; preserve highway graphics on the gantry.']}
shared_paint='BaseColor contains repeated directional triangular dent stamps in atlas tiles3,7,8,14, producing identical apparent damage across unrelated painted objects. Replace with subtle nondirectional coating variation and sparse chips while retaining real mesh damage. Cause: NeutralPaint_BaseColor.png multiplied by Art200Pigment; fine-grain Normal map is not the source.'
paint_ids={'wreck-pickup','wreck-ambulance','wreck-forklift','survey-rover','container-wagon','fuel-trailer','wreck-motorcycle','transformer','fuel-pump','utility-cabinet','telecom-cabinet','condenser','satellite-dish','light-tower','diesel-generator','air-compressor','bulk-fuel-tank','cargo-pallet','bus-shelter'}
sign_notes=[
'Truck icon and large MORROW brand suit vehicle service; twin lattice supports are legible.',
'Sunrise/bed motif, stacked lodge lettering and stepped cap read clearly.',
'Bottle icon and medallion surround are purpose appropriate; tripod stance is broad.',
'Grain motif and arched crest reinforce the seed cooperative identity.',
'Cooker silhouette is meaningful; missing corner removes initial brand letter intentionally as physical damage.',
'Drum motif and twin laundry medallions suit the wash/fold business.',
'Antenna motif, aerials and slender radio tower form are coherent.',
'Clinic cross and shade cap are coherent; cantilever compression brace reads clearly.',
'Tyre icon and triple-ring surround are coherent; missing first brand letter is a readable consequence of lost sheet.',
'Safe icon and bank name read clearly against muted denim; deco fins bound the panel.',
'Water drop icon is clear; cistern structure is visible from rear and tubular piers are coherent.',
'Paper plane icon and winged crest agree; damaged lower corner reveals genuine back bracing.',
'Parcel icon and freight wagon form agree; missing underframe crossmembers leave uprights unsupported.',
'Film reel graphic and arched crest are meaningful; detached decorative blades require ties.',
'Record grooves icon and circular surround suit the record library.',
'Spanner icon and supported cantilever suit a tool supplier.',
'Tin icon and enamel wings suit a provisions business.',
'Compass icon and swept header suit overland tours.',
'Scissors icon and suspended blade structure suit fabric/mending.',
'Pylon icon and bridge lintel agree with public power service.',
'Block motif, restrained limestone paint and rear raking props suit cement supply.',
'Bed icon and suspension header are coherent with bedding works.',
'Preserve jar graphic and faceted crown are meaningful and readable.',
'Exchange arrows and visibly broken/rebraced pier suit salvage.',
'Bus icon and deep highway truss suit transit; muted ochre contrasts enough for title legibility.'
]
records=[]
for i,s in enumerate(legacy):
 issues=list(specific.get(s['id'],[]))
 if s['id'] in paint_ids:issues.append(shared_paint)
 rt=geo[s['id']]['runtime'];lo=rt['bounds_blender']['min'];hi=rt['bounds_blender']['max']
 records.append(dict(id=s['id'],cohort='legacy25',review_image=f'assets/art200/legacy-touchup/review-{i//5+1}.jpg',
  inspected=['geometry/render silhouette','grounding and scale','surface palette and normals','graphics meaning and legibility','editable component bounds and source support relationships'],
  observation=notes[i],issues=[dict(priority=2,description=t,status='reported_to_owner') for t in issues],
  bounds_evidence='legacy-signs-geometry.json',ground_min_m=lo[2],dimensions_m=[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],
  geometry_status='changes_requested' if s['id'] in specific and s['id']!='bus-shelter' else 'no_major_defect_found',
  material_batches=s['materials']))
for i,s in enumerate(signs):
 issues=['Interior printed panels end at rearY=-.07 while rear rails beginY=-.01, leaving60mm gap; front captive fixings stopY=-.13. Add physical rear stand-off clips or connected rails/fixing shafts for every sheet.',
 'Tubular stanchions/backing spines startZ=.420; bolted sole plates endZ=.410. Extend stems into plates to remove10mm air gap.']
 if i==12:issues.append('Advertising car uprights atY=.75 stopZ1.2 between underframe rails centeredY=-.2/1.8. Add transverse chassis members beneath both uprights and connect into the longitudinal rails.')
 if i==13:issues.append('Theatre vertical blades atX±8.12 have545mm minimum clearance to other parts. Add top and bottom lateral ties into the billboard frame.')
 parts=geo[s['id']]['components'];mins=[min(p['bounds_blender']['min'][k] for p in parts) for k in range(3)];maxs=[max(p['bounds_blender']['max'][k] for p in parts) for k in range(3)]
 records.append(dict(id=s['id'],cohort='signs25',review_image=f'assets/art200/fine-comb/signs-review-{i//5+1}.jpg',
 inspected=['final25 phase2 renders','business-specific graphics and typography','physical panel loss and supports','editable Blender component coordinates','ground scale and muted palette'],
 observation=sign_notes[i],issues=[dict(priority=2,description=t,status='reported_to_owner') for t in issues],
 bounds_evidence='legacy-signs-geometry.json',ground_min_m=mins[2],dimensions_m=[maxs[0]-mins[0],maxs[2]-mins[2],maxs[1]-mins[1]],geometry_status='changes_requested'))
assert len(records)==50 and len({r['id'] for r in records})==50
result=dict(reviewer='Independent wasteland author; read-only review of root-owned legacy and billboard art',
 scope='25 prior legacy assemblies and25 new billboard assemblies; original masters were not modified',
 method='Every contact-sheet model visually inspected; all8218 editable component bounds examined with source-code attachment checks. AABB candidates are screening evidence, not proof of physical connection. Findings listed only when component gap also agrees with source geometry or visible render.',
 limitations='No gameplay collision or performance claim; root owns native runtime and final profiling. Closed form whole-model ground bounds do not prove every subcomponent supported.',
 sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['godot/art/art100-legacy.glb','godot/art/art200-signs.glb']},
 models_reviewed=50,models=records,status='Owner corrections requested; verify changed renders/geometry after repair')
(OUT/'legacy-signs-review.json').write_text(json.dumps(result,indent=2)+'\n')
print('INDEPENDENT_REVIEW_RECORDED',len(records))
