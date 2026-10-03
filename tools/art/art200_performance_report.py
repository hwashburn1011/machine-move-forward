"""Compare quiet native workload runs; keep worst frames visible."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'test-results/art200/performance'
scenarios=['travel','construction','furnished','combat','guardian','crane','drone','wake','foundry','array','orchard','meridian','berth']
rows=[];sources=set()
for scenario in scenarios:
    before=json.loads((OUT/f'baseline-{scenario}.json').read_text())
    after=json.loads((OUT/f'final-{scenario}.json').read_text())
    sources.add(after['source_hash'])
    b=before['metrics'];a=after['metrics'];f=a['frame_ms']
    row={'scenario':scenario,'before_frame_ms':b['frame_ms'],'after_frame_ms':f,
         'p95_delta_ms':round(f['p95']-b['frame_ms']['p95'],3),'median_frame_rate_equivalent':round(1000/f['median'],1),
         'after_gpu_ms':a['gpu_ms'],'after_draw_calls':a['draw_calls'],'after_primitives':a['primitives'],
         'after_video_memory_bytes':a['video_memory_bytes'],'after_static_memory_bytes':a['static_memory_bytes'],
         'startup_ms':after['startup_ms'],'checkpoint_launch_ms':after['checkpoint_launch_ms'],
         'action_times':after['action_times'],'slow_frames_over50ms':after['slow_frames_over50ms'],
         'workload':{'distance_travelled':after['distance_travelled'],'max_enemies':after['max_enemies'],'max_drones':after['max_drones'],'before_furnishings':before['furnishings'],'after_furnishings':after['furnishings']},
         'capture':f'test-results/art200/performance/final-{scenario}.png'}
    rows.append(row)
assert len(sources)==1
report={'scope':'Thirteen fresh-process scripted native workloads, real simulation, invulnerable player; 3s warmup and18s sample each. Site cameras orbit actual campaign locations. Renderer frame timings, streaming and autosave are distinct measurements.',
        'hardware':{'gpu':after['adapter'],'cpu':after['cpu'],'resolution':after['resolution'],'quality':after['quality'],'vsync':False,'frame_cap':0},
        'source_hash':sources.pop(),'baseline_source_hash':before['source_hash'],'scenarios':rows,
        'comparison_limits':['The final scene contains the expanded125-kind scenery library and final200-model art.','Furnished baseline uses25 available furnishings; the final fixture extends its side deck to place all50 legally. This is a larger workload, not identical content.','OS and driver caches are uncontrolled. Timings are samples on this computer, not a guarantee for all hardware or every long play session.'],
        'summary':{'worst_p95_ms':max(r['after_frame_ms']['p95'] for r in rows),'worst_frame_ms':max(r['after_frame_ms']['max'] for r in rows),'frames_over50ms':sum(r['after_frame_ms']['over50ms'] for r in rows),'construction_worst_before_ms':rows[1]['before_frame_ms']['max'],'construction_worst_after_ms':rows[1]['after_frame_ms']['max']}}
stream=OUT/'scenery-streaming.json'
if stream.exists():report['streaming']=json.loads(stream.read_text())
save=OUT/'autosave-profile.json'
if save.exists():report['autosave']=json.loads(save.read_text())
initial=OUT/'initial-expanded-run/final-summary.json'
if initial.exists():
    report['initial_expanded_run']={'path':str(initial.relative_to(ROOT)).replace('\\','/'),'results':json.loads(initial.read_text()),'findings':['Direct diagnostic timing attributed the repeated guardian-route stall to scenery collision: ambulance attachment82.282ms, including triangle extraction and shape creation.','Loading saved exact shapes reduced ambulance attachment to64.008ms;44.110ms of that was resource loading. This motivated background proximity preparation.','The initial new lounge display had one182.985ms frame despite a7.017ms choose call. An unchanged-code repeat did not reproduce that spike; its cause was not conclusively established. Furniture collection material setup and packing were subsequently moved into the existing preparation pass.']}
    report['initial_expanded_run']['findings'].append('Background loading of whole collision shapes still produced a66.209ms frame during native physics initialization. The final implementation partitions exact triangles into chunks of at most2048 and prepares one chunk per normal tick,72m ahead; an explicit immediate completion path protects contact within3m after relocation.')
collision=json.loads((ROOT/'godot/data/scenery-collision.json').read_text())
report['collision_preparation']={'models':len(collision['models']),'chunks':collision['total_chunks'],'max_triangles_per_chunk':collision['triangles_per_chunk'],'total_triangles':collision['total_triangles'],'bytes':collision['total_bytes'],'validation':'docs/godot-port/results/art200-scenery-collision-2026-10-02.json','targeted_guardian_worst_ms':json.loads((OUT/'chunk-probe-guardian.json').read_text())['metrics']['frame_ms']['max']}
(OUT/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['summary']))
