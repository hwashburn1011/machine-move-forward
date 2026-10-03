"""Seat the short Wake roof panel on its existing ribs; preserve all other bytes.

The input archive already contains the approved floor repair. Default emits
review candidates; --publish writes the two final GLBs after baseline capture.
"""
from pathlib import Path
import copy, json, hashlib, zipfile, sys
import numpy as np
from patch_wake_floor import ROOT, OUT, TARGETS, read, values, append, encode

LIFT = .1525


def components(positions, indices):
    """Connected faces after welding UV/normal splits at identical positions."""
    key_id = {}; weld = []; adjacency = {}
    for index, position in enumerate(positions):
        key = tuple(np.round(position, 5))
        weld.append(key_id.setdefault(key, len(key_id)))
    for face in indices:
        a,b,c = (weld[int(i)] for i in face)
        for x,y in ((a,b),(b,c),(c,a)):
            adjacency.setdefault(x,set()).add(y);adjacency.setdefault(y,set()).add(x)
    groups=[]
    while adjacency:
        pending=[next(iter(adjacency))]; group=set()
        while pending:
            value=pending.pop()
            if value in adjacency:group.add(value);pending.extend(adjacency.pop(value))
        groups.append(np.array([i for i,w in enumerate(weld) if w in group],dtype=int))
    return groups


def target_components(doc,binary,node,primitive):
    positions=values(doc,binary,primitive['attributes']['POSITION']).astype(float)+node.get('translation',[0,0,0])
    indices=values(doc,binary,primitive['indices']).reshape(-1,3)
    material=doc['materials'][primitive['material']]['name']
    targets=[]
    for group in components(positions,indices):
        lo=positions[group].min(axis=0);hi=positions[group].max(axis=0)
        if material=='ExpWreck_Rust' and np.allclose(lo,[-2,3.5125,-6.95],atol=2e-5) and np.allclose(hi,[4.8,3.5875,-5.25],atol=2e-5):targets.append(group)
        if material=='ExpWreck_Steel' and abs(lo[1]-3.435)<2e-5 and abs(hi[1]-3.565)<2e-5 and abs(lo[2]+6.99)<2e-5 and abs(hi[2]+5.21)<2e-5:targets.append(group)
    return targets


def patch(path,original):
    before,binary=read(original);doc=copy.deepcopy(before);blob=bytearray(binary)
    node=next(n for n in doc['nodes'] if n.get('name')=='Wreck_BrokenRoof_Geometry')
    mesh=doc['meshes'][node['mesh']]; changed=[]
    for primitive in mesh['primitives']:
        groups=target_components(before,binary,node,primitive)
        if not groups:continue
        name=doc['materials'][primitive['material']]['name']
        assert len(groups)==(1 if name=='ExpWreck_Rust' else 5)
        ai=primitive['attributes']['POSITION'];a=doc['accessors'][ai]
        positions=values(doc,binary,ai);selected=np.concatenate(groups)
        positions[selected,1]+=LIFT
        primitive['attributes']['POSITION']=append(doc,blob,positions,a['componentType'],a['type'],34962)
        changed.append({'material':name,'components':len(groups),'vertices':len(selected)})
    assert sum(x['components'] for x in changed)==6
    final=encode(doc,blob);after,final_bin=read(final)
    assert final_bin[:len(binary)]==binary
    for key in ('nodes','materials','textures','images','samplers','scenes','scene'):
        assert after.get(key)==before.get(key)
    candidate=OUT/('roof-final-live.glb' if path==TARGETS[0] else 'roof-final-staging.glb')
    candidate.write_bytes(final)
    if '--publish' in sys.argv:(ROOT/path).write_bytes(final)
    return {'path':path,'candidate':str(candidate.relative_to(ROOT)),'beforeSha256':hashlib.sha256(original).hexdigest(),
        'afterSha256':hashlib.sha256(final).hexdigest(),'liftM':LIFT,'changed':changed,
        'preserved':'All existing binary bytes, node transforms, textures/materials, floor repair, triangle indices and non-targeted vertices. Only two position accessors are extended.',
        'published':'--publish' in sys.argv}


if __name__=='__main__':
    with zipfile.ZipFile(OUT/'roof-before.zip') as archive: reports=[patch(p,archive.read(p)) for p in TARGETS]
    (OUT/'roof-preservation.json').write_text(json.dumps(reports,indent=2)+'\n')
    print(json.dumps(reports,indent=2))
