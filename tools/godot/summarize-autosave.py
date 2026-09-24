"""Retain compact, reproducible evidence from native frame traces."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
local = root / 'test-results/godot-native'
output = root / 'docs/godot-port/results'

def stats(values):
    ordered = sorted(values)
    return dict(median=ordered[len(ordered)//2], p95=ordered[int(len(ordered)*.95)],
                p99=ordered[int(len(ordered)*.99)], maximum=ordered[-1], samples=len(ordered))

report = {'scope': '65-second matched native travel traces, RTX 3070, 1920x1080, high Forward+/Vulkan, 4x MSAA, no VSync. Main loop is instrumented in test-owned script copies only.'}
for label, name in [('baseline', 'travel-stages'), ('background', 'travel-autosave-after'), ('final', 'travel-autosave-final')]:
    source = json.loads((local / (name+'.json')).read_text())
    frames = source['frames']
    ticks = source['ticks']
    tick = min(ticks, key=lambda row: abs(row['time'] - 60.0166666666645))
    frame = next(row for row in frames if row['frame'] == tick['frame'])
    report[label] = dict(source=name+'.json', allFramesMs=source['frameMs'],
                         afterThreeSecondsFrameMs=stats([f['ms'] for f in frames if f['time'] > 3]),
                         afterThreeSecondsMaxMainMs=max(t['ms'] for t in ticks if t['time'] > 3),
                         autosaveTick=tick, autosaveFrame=frame,
                         finalDistance=frames[-1]['distance'])
report['baselineAttribution'] = 'The old inline save branch was not separately stamped in the baseline. Its time falls in the following world.update stage. The full main-tick and frame intervals remain valid; a separate world wrapper rules out world update as the source.'
report['finalCode'] = 'The first background trace preceded an additional backup-validation check in the worker. The final trace includes that check. Other code is unchanged between these after runs.'
output.mkdir(parents=True, exist_ok=True)
(output/'autosave-travel.json').write_text(json.dumps(report, indent=2)+'\n')
for name in ['autosave-profile', 'player-motion-audit']:
    (output/(name+'.json')).write_text((local/(name+'.json')).read_text())
print(json.dumps({k:{'frame':v['autosaveFrame']['ms'], 'main':v['autosaveTick']['ms'], 'warmMax':v['afterThreeSecondsFrameMs']['maximum']} for k,v in report.items() if isinstance(v,dict)}))
