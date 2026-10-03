"""Offline structural regression for the loaded Wake floor, not a screenshot proxy."""
import json
import zipfile
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
from patch_wake_floor import ROOT, OUT, TARGETS, read, values, footprint
from patch_wake_roof import target_components, LIFT

checks = []


def check(name, condition, details=None):
    checks.append({'name': name, 'passed': bool(condition), 'details': details})


def hull(doc, binary):
    node = next(n for n in doc['nodes'] if n.get('name') == 'Wreck_HullStructure_Geometry')
    return node, doc['meshes'][node['mesh']]


def triangles(doc, binary, node, primitive):
    vertices = values(doc, binary, primitive['attributes']['POSITION']).astype(float) + node.get('translation', [0,0,0])
    return vertices[values(doc, binary, primitive['indices']).reshape(-1,3)]


def upward_at(tris, y):
    normal = np.cross(tris[:,1]-tris[:,0], tris[:,2]-tris[:,0])
    mask = (np.abs(tris[:,:,1]-y).max(axis=1)<2e-6) & (normal[:,1]>1e-9)
    return [Polygon(t[:,[0,2]]) for t in tris[mask]]


with zipfile.ZipFile(OUT/'before.zip') as archive:
    for path in TARGETS:
        before, old_bin = read(archive.read(path))
        doc, binary = read((ROOT/path).read_bytes())
        node, mesh = hull(doc, binary); old_node, old_mesh = hull(before, old_bin)
        check(path+': old binary attribute/image bytes preserved', binary[:len(old_bin)] == old_bin)
        for key in ('nodes','materials','textures','images','samplers','scenes','scene'):
            check(path+': '+key+' unchanged', doc.get(key)==before.get(key))
        check(path+': one added surface', len(mesh['primitives'])==len(old_mesh['primitives'])+1)
        new = mesh['primitives'][-1]; seam = triangles(doc, binary, node, new)
        normals = np.cross(seam[:,1]-seam[:,0], seam[:,2]-seam[:,0])
        check(path+': finite nondegenerate new faces', np.isfinite(seam).all() and (np.linalg.norm(normals,axis=1)>1e-10).all())
        check(path+': portable explicit tangents', 'TANGENT' in new['attributes'])
        check(path+': retained original dark material', doc['materials'][new['material']]['name']=='ExpWreck_Dark')
        check(path+': seam seated, contained, 8 mm tall', abs(seam[:,:,1].min())<2e-6 and abs(seam[:,:,1].max()-.008)<2e-6 and np.abs(seam[:,:,0]).max()<6 and np.abs(seam[:,:,2]).max()<9)
        floor = []
        for primitive in mesh['primitives']: floor.extend(upward_at(triangles(doc,binary,node,primitive),0))
        duplicate = sum(p.area for p in floor)-unary_union(floor).area
        check(path+': no competing upward floor triangles at Y0', duplicate<1e-6, {'duplicateAreaM2':duplicate})
        top = upward_at(seam,.008)
        duplicate = sum(p.area for p in top)-unary_union(top).area
        check(path+': seam crossings do not overlap', duplicate<1e-6, {'duplicateAreaM2':duplicate})
        edge_count, adjacency = {}, {}
        for tri in seam:
            v = [tuple(np.round(p,5)) for p in tri]
            for a,b in zip(v,v[1:]+v[:1]):
                key=tuple(sorted((a,b)));edge_count[key]=edge_count.get(key,0)+1
                adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
        components=0
        while adjacency:
            components+=1;pending=[next(iter(adjacency))]
            while pending:
                point=pending.pop()
                if point in adjacency:pending.extend(adjacency.pop(point))
        check(path+': one connected closed manifold', components==1 and all(n==2 for n in edge_count.values()), {'components':components})
        # In the sole changed old surface, keep exactly the old non-seam index
        # sequence. All other geometry is required to be byte-identical.
        changes=0;roof_changes=0
        roof_node=next(n for n in before['nodes'] if n.get('name')=='Wreck_BrokenRoof_Geometry')
        for mi,old in enumerate(before['meshes']):
            for pi,p in enumerate(old['primitives']):
                now=doc['meshes'][mi]['primitives'][pi]
                if p==now:continue
                if mi==roof_node['mesh']:
                    roof_changes+=1
                    groups=target_components(before,old_bin,roof_node,p)
                    original_positions=values(before,old_bin,p['attributes']['POSITION'])
                    expected=original_positions.copy();expected[np.concatenate(groups),1]+=LIFT
                    actual=values(doc,binary,now['attributes']['POSITION'])
                    remaining={k:v for k,v in p['attributes'].items() if k!='POSITION'}
                    kept_attrs={k:v for k,v in now['attributes'].items() if k!='POSITION'}
                    check(path+': intentional supported roof lap only '+before['materials'][p['material']]['name'],
                        np.array_equal(actual,expected) and p['indices']==now['indices'] and remaining==kept_attrs and p['material']==now['material'])
                    continue
                changes+=1
                t=triangles(before,old_bin,old_node,p)
                remove=((t[:,:,1]>=-.00601)&(t[:,:,1]<=.00001)&footprint(t)).all(axis=1)
                kept=values(before,old_bin,p['indices']).reshape(-1,3)[~remove].ravel()
                check(path+': only original nine seam boxes removed', int(remove.sum())==108 and np.array_equal(kept,values(doc,binary,now['indices']).ravel()) and p['attributes']==now['attributes'])
        check(path+': only one existing primitive changed',changes==1)
        check(path+': two intentional roof position accessors changed',roof_changes==2)

report={'checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),
        'nativeMotionReviewRequired':True,'note':'LOD/shadows/materials/collision remain enabled and unchanged. Native before/after clips evaluate appearance separately.'}
(OUT/'structural-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']:raise SystemExit(1)
