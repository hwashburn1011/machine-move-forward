"""Record independent visual coverage and support evidence, never invent QA."""
from pathlib import Path
import json,hashlib,sys
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/art200/fine-comb'
geometry=json.loads((OUT/'story-geometry.json').read_text())
issues={
 'CourierChargeCradle':'Three terminal groups lacked35mm feed-through connections.',
 'FoundryPowerBus':'Three circuit digits needed physically seated number plates.',
 'Story2ServoPress':'The gauge assembly was229mm away from its vessel and needed a pressure tap.',
 'Story2DeadPatrolTorso':'The retained head needed a25mm neck spindle.',
 'BastionSiegeRadiator':'Two thin slivers adjacent to the original head require source confirmation.'}
observations={
 'Story2PassengerBaggageTrolley':'Two large axle-mounted wheels and two square standing toes are intentional; confirmed with source names and owner, not missing casters.',
 'Story2ClimateBellChamber':'Faceted transparent cover retains visible internal supports and a sealed base rim.',
 'Story2FerriteTuningBench':'Coils and instruments have their own support structure; rounded coil silhouette remains readable.',
 'BerthSeedEnclosure':'Title and seed numbering repositioned to sit visibly on enclosure surfaces.',
 'IsolatorCabinet':'Header spacing corrected to avoid crowding the display.',
 'SeedVault':'Meter seated on the cabinet door.',
 'SovereignComms':'Complete rig, crown, cape and separate drone retained; radio finish is subdued. Original functional eye/halo emission retained.',
 'WardenRangefinder':'Complete weapon, sight, rangefinder and field clothing retain readable contrasting substrates.',
 'RevenantPulseRack':'Complete articulated body and weapons retained; rear paired reservoir attachment follows the back silhouette.',
 'RaiderRecoveryPack':'Retained body/clothing contrasts with muted clay recovery pack; brackets and straps visible.',
 'ScavengerSurveyPack':'Retained articulated survey robot has restrained petrol service equipment and visible hose routing.'}
rows=[]
for collection,folder in [('art100','story-robots'),('art200','story')]:
    manifest=json.loads((ROOT/'assets'/collection/folder/'manifest.json').read_text())
    for row in manifest['models']:
        id=row['id'];character=row['status']=='refined'
        if character:
            kind=row['runtime_target'].split(':')[1]
            views=[f'assets/art100/story-robots/review/blender-complete-{kind}-{side}.png' for side in ['front','rear']]
        else:views=[f'assets/{collection}/{folder}/review/{id}.png']
        record={'id':id,'complete_assembly':True,'views':views,'inspected':['silhouette and manufactured edges','muted material separation','graphics placement and meaning','grounding and visible component attachment'],
                'observation':observations.get(id,'Reviewed the whole assembly in the final collection sheet; no additional visual issue identified beyond the support evidence below.'),
                'issues':([{'description':issues[id],'status':'reported_to_owner'}] if id in issues else [])}
        if not character:
            g=geometry[id];record['source_geometry']={'finite':g['finite'],'degenerate_faces':g['degenerate_faces'],'parts':len(g['parts']),'unsupported_candidates':len(g['unsupported_bounds_candidates'])}
        record['status']='changes_requested' if record['issues'] else 'reviewed'
        rows.append(record)
report={'reviewer':'Root independent review of story-agent output','models_reviewed':50,'method':'Viewed all44 prop entries across five contact sheets and all12 front/rear complete-character images. Evaluated every editable prop component in Blender; bounds adjacency is screening evidence, not an exact intersection proof. Four prop gaps confirmed against source by the author. Original rig widgets excluded from character geometry. Native interaction/collision and performance are separate final checks.',
        'sources':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['godot/art/art100-story-robots.glb','godot/art/art200-story.glb']},'models':rows}
if '--close' in sys.argv:
    assert all(g['finite'] and g['degenerate_faces']==0 and not g['unsupported_bounds_candidates'] for g in geometry.values())
    resolutions={'CourierChargeCradle':'Added three real feed-through mounts; individually rerendered and inspected.',
                 'FoundryPowerBus':'Added seated circuit number plates; individually rerendered and inspected.',
                 'Story2ServoPress':'Moved gauge onto the vessel with an actual pressure tap; individually rerendered and inspected.',
                 'Story2DeadPatrolTorso':'Added neck spindle under the retained head; individually rerendered and inspected.',
                 'BastionSiegeRadiator':'Original cranial antennae had a14.6mm gap. Added two head-bound sockets, baked their local transforms, then recompiled with unchanged gameplay rig. New native checks cover absolute body bounds in idle/walk/attack; final front/rear images inspected.'}
    for r in rows:
        for issue in r['issues']:
            issue['status']='corrected_and_independently_verified';issue['resolution']=resolutions[r['id']]
        if r['issues']:r['status']='corrected_and_independently_verified'
    report['summary']={'models_reviewed':50,'corrected_and_independently_verified':5,'outstanding_findings':0}
    report['final_prop_geometry']='story-geometry.json'
    report['retained_character_validator_warning']='Bastion original identity-parent skin hierarchy: NODE_SKINNED_MESH_NON_ROOT;0 errors. Native pose/position checks are the relevant integration evidence.'
(OUT/'story-review.json').write_text(json.dumps(report,indent=2)+'\n')
print('STORY_REVIEW',len(rows))
