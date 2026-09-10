from pathlib import Path
p=Path('tools/art/gunner_s07/polish.py');s=p.read_text();s=s.replace("shell=bpy.data.objects['S07 overlapping shoulder shell r'];n=", "from mathutils.bvhtree import BVHTree\nshell=bpy.data.objects['S07 overlapping shoulder shell r'];tree=BVHTree.FromPolygons([v.co for v in shell.data.vertices],[list(p.vertices) for p in shell.data.polygons]);n=")
s=s.replace('hit,loc,normal,_=shell.ray_cast(origin,direction)\n        if hit:', 'loc,normal,face,distance=tree.ray_cast(origin,direction)\n        if loc is not None:')
s=s.replace("for m in M.values():", "print('PBR files regenerated',flush=True)\nfor m in M.values():")
s=s.replace("# Replace the approximate", "print('Surface markings conformed',flush=True)\n# Replace the approximate")
s=s.replace("# Keep crown", "print('Hose correction complete',flush=True)\n# Keep crown")
p.write_text(s)
