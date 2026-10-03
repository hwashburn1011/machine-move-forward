"""Record the independent all-50 visual and geometry review, retaining fix status."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/art200/fine-comb'
old_notes=[
 'Open ruined diner, window sills and entry steps read clearly; reverse view exposes unsupported interior furniture and upper trim.',
 'Broken glazing remains intentional and ribs are legible; central raised bed needs feet onto the foundation.',
 'Open hemisphere, receiver cradle, service room and stair access are proportionate and supported in the reviewed views.',
 'Coach glazing openings, wheel rims and DUSTLINE lettering are readable; interior seats and several end fittings need supports.',
 'Canopy piers, pump islands, hoses and grounded service cabinet are coherent; rear fascia needs short mount brackets.',
 'Broken shell, angled base supports and pump pier read correctly; several independent rubble pieces need individual grounding.',
 'Tracks, boom pivot, hydraulic lines and contacting bucket form a coherent excavator silhouette.',
 'Array tilt and cell grids are consistent, but the reverse view exposes raised feet, tank supports and independent cell tiles.',
 'Arch thickness and handrails are readable; unsupported fracture rods, floating road paint and one rubble fragment need correction.',
 'Broken mast and fallen rotor remain grounded, with visible mast flange and cable connections.',
 'Hollow rim, welded bands, ladder standoffs and outlet give the cistern a clear scale and supported silhouette.',
 'Rail profiles, sleepers, tie plates and throw lever form a supported track assembly.',
 'Cut-open side portal retains negative space, with grounded threshold, bunk and cabinet.',
 'Six wheels, canopy braces and sample gantry are connected and proportionate.',
 'Peaked truss, ladder, piers and three pendant signal heads show consistent supporting structure.',
 'Transformer fin banks, mounted service plate and seated bushings remain connected to the plinth.',
 'Pipe flanges, supports, bonnet and spoked handwheel meet as a coherent valve assembly.',
 'Guided platen, bearing collars, hydraulic frame and ground skid retain open mechanical spaces.',
 'Guy anchors, mast collar and camera arm have visible connection paths.',
 'Drum coil, timber cradle and knee-braced lifting portal are grounded and mechanically readable.',
 'Tracked carrier, webbed rollers, rear crossbar and lowered blade remain connected.',
 'Fan frames, coil banks, bottle receivers and drain manifold have supported joints.',
 'Wheel webs and bolster are connected; two low transverse brake beams need hangers.',
 'Barrier pivot, far rest saddle, STOP plaque and ground pads read as a complete gate.',
 'Vault threshold, recessed door, hinge barrels and wheel handle are clearly supported.',
]
new_notes=[
 'Teller island, pneumatic piping and supported sign form a coherent drive-up bank; lettering remains readable.',
 'Butterfly roof columns and motel sign hangers are connected; entry threshold has believable scale.',
 'Sawtooth roof, attached PARCEL POST sign, roller-bed legs and steps have supported joints.',
 'Washer bodies and folding shelf are grounded; rear wash manifold needs attachment to the wall or feeds.',
 'Oven, chimney, side-mounted label and serving ledge form a complete ruined bakery.',
 'Pharmacy counter, DRYLIGHT REMEDIES sign hangers and roof are connected, with a consistent muted plum family.',
 'Lift towers, pivot arms and compressor connect to the floor and canopy structure.',
 'Curved booth roof, ticket counter, turnstile pivot and queue rail are supported.',
 'Weighbridge deck, raised strips, ramps and operator hut meet with a coherent vehicle scale.',
 'Three exchange booths retain interior recesses and supported receivers, with legible common signage.',
 'Cold-room door, hinges, handles, compressor enclosure and entry steps are grounded.',
 'Sewing table, corrected drive belt, dress form and attached repair sign have visible support.',
 'Compressor flywheel spokes, cylinders, tank legs and roof columns are connected.',
 'Silo legs, tapered discharges, elevator housing and feed pipes have continuous support paths.',
 'Pumpjack A-frame, crank pivot, drive link and polished rod meet at believable joints.',
 'Truss silhouette and broken approach read clearly; both side trusses need bearing ties to the deck.',
 'Open sieve lattice, corrected roller supports, frame and feed hopper are mechanically readable.',
 'Crane column, arm brace and hose meet correctly; handwheel spindle stops short of the wheel.',
 'Hopper, grizzly and four columns read clearly, but the hopper group needs column crossheads.',
 'Corrected kiln hatch hinges, chimney, cradle and ware shelves remain attached and grounded.',
 'Curved field-care roof, door, stair rails and attached sign form a complete small clinic.',
 'Cutter blade, pivot, carriage and rail feet are connected; concrete workpiece is grounded.',
 'Cyclone cone, receiver bin, pipe and braced frame have readable joints and muted colors.',
 'Stack flange, platform, guardrail and ladder cage are connected and proportionate.',
 'Irrigation span, wheel towers, diagonal ties and suspended emitters have consistent supports.',
]
issues={
 'wasteland-diner':[
  {'code':'old-diner-supports','detail':'Eight seat/back assemblies float about330mm above the floor; counter slab lacks a pedestal; rear fascia is132mm from roof rib; right rib100mm from upright; signpost base69mm above slab.','fix':'Add seating/counter pedestals, roof connections and a grounded signpost shoe.'}],
 'wasteland-greenhouse':[{'code':'old-bed-supports','detail':'Central raised-bed frame begins105mm above the foundation without feet.','fix':'Add feet between raised-bed frame and foundation.'}],
 'wasteland-passenger-coach':[{'code':'old-coach-supports','detail':'Twelve seats float about350mm above chassis; end wall80mm above chassis; broken roof rib82mm clear of upright; upper boarding steps36mm clear of connected structure.','fix':'Add seat pedestals, end-wall ties, rib cleats and boarding-step riser brackets.'}],
 'wasteland-service-station':[{'code':'old-canopy-fascia','detail':'Rear canopy fascia is30mm clear of roof edge.','fix':'Add fascia mount brackets.'}],
 'wasteland-cooling-tower':[{'code':'old-rubble-grounding','detail':'Five disconnected loose rubble pieces have lowest vertices52–136mm above ground.','fix':'Ground each independent rubble piece.'}],
 'wasteland-solar-farm':[{'code':'old-array-grounding','detail':'Reverse view shows main array feet262–273mm above ground, tank feet212mm high and controller200mm high. Independent cell tiles lack a common backing/support.','fix':'Ground each intended upright subassembly, seat fallen panels and connect cells with correctly tilted backing or battens.'}],
 'wasteland-tunnel':[{'code':'old-tunnel-fracture','detail':'Reverse view confirms fracture rods suspended in missing arch gap; two centreline paint strips bridge missing floor; one rubble piece begins110mm above ground.','fix':'Anchor each rod in surviving concrete, clip/remove paint in voids and ground loose rubble.'}],
 'wasteland-freight-bogie':[{'code':'old-brake-beams','detail':'Two transverse beams atX±1.13,Y.33–.43 are130mm clear of axle or connected body.','fix':'Add brake-beam suspension hangers.'}],
 'art200-thimble-laundrette':[{'code':'new-wash-manifold','detail':'Wash manifold has133mm clearance from rear wall and riser bases are270mm above floor.','fix':'Add wall clamps or connected supply feeds.'}],
 'art200-lattice-truss-bridge':[{'code':'new-truss-bearing','detail':'Both side trusses are35mm outside deck edge and have no transverse bearing tie.','fix':'Add actual transverse ties/bearings connecting trusses and deck.'}],
 'art200-rail-water-crane':[{'code':'new-valve-spindle','detail':'Spindle endsZ.72, wheel and spokes beginZ.7525, leaving32.5mm unsupported gap.','fix':'Extend spindle into wheel hub.'}],
 'art200-ballast-loader':[{'code':'new-hopper-support','detail':'Hopper/grizzly group has40mm minimum gap to column envelope.','fix':'Add support crossheads from four columns to hopper lip.'}],
}
records=[]
for pack,notes in [('art100',old_notes),('art200',new_notes)]:
 manifest=json.loads((ROOT/f'assets/{pack}/wasteland/manifest.json').read_text())
 audit=json.loads((OUT/f'{pack}-wasteland-geometry.json').read_text())
 for i,(entry,note) in enumerate(zip(manifest['models'],notes),1):
  key=entry['id'];a=audit[key];problems=issues.get(key,[])
  records.append({'id':key,'collection':pack,'status':'awaiting_owner_fix' if problems else 'reviewed_no_concrete_defect_found','render':f'assets/{pack}/wasteland/renders/{i:02}-{key}.png','contact_sheet':f'assets/{pack}/wasteland/contact-sheet-{(i-1)//5+1}.png','dimensions_m':entry['dimensions_m'],'visual_review':note,'geometry_review':{'triangle_count':a['triangle_count'],'ground_minimum_m':a['minimum_y'],'zero_area_faces':a['zero_area_faces'],'nonfinite_vertices':a['nonfinite_vertices'],'inverted_closed_components':a['inverted_closed_components'],'bounds_screen_clusters':len(a['unsupported_bounds_clusters'])},'issues':problems,'reverse_view':f'assets/art200/fine-comb/{key}-reverse.png' if (OUT/f'{key}-reverse.png').exists() else None})
report={'reviewer':'art100_machine — independent of wasteland author','review_phase':'Separate second fine-comb after phase2, 2026-10-01','models_reviewed':len(records),'coverage':{'individual_model_renders':50,'contact_sheets':10,'editable_Blender_masters':2,'additional_reverse_views':6},'method':'Inspected every model render/contact sheet for silhouette, support, muted material colors, scale and lettering; opened both editable Blender masters read-only for connected-component, finite-coordinate, degenerate-face, signed-volume and grounding audits; reviewed six reverse views and source coordinates for support candidates.','limitations':'Bounds adjacency is a conservative screening aid, not proof of physical mesh contact. Signed-volume checks detect wholly inverted closed components, not every possible local shading defect. Open ruin shells and label planes are intentional. No source assets changed by reviewer.','summary':{'no_concrete_defect_found':sum(not r['issues']for r in records),'awaiting_owner_fix':sum(bool(r['issues'])for r in records)},'models':records}
(OUT/'wasteland-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(report['summary'])
