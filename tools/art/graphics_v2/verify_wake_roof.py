"""Verify real roof lap support, preserved coverage, and unchanged remainder."""
import json,zipfile
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
from patch_wake_floor import ROOT,OUT,TARGETS,read,values
from patch_wake_roof import target_components,LIFT

checks=[]
def check(label,ok,detail=None):checks.append({'name':label,'passed':bool(ok),'detail':detail})
def tris(doc,blob,node,p):
    v=values(doc,blob,p['attributes']['POSITION']).astype(float)+node.get('translation',[0,0,0])
    return v[values(doc,blob,p['indices']).reshape(-1,3)]
def flat(triangles,y,up=True):
    normal=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
    mask=(np.abs(triangles[:,:,1]-y).max(axis=1)<2e-6)&((normal[:,1]>1e-9) if up else (normal[:,1]<-1e-9))
    return [Polygon(t[:,[0,2]]) for t in triangles[mask]]
with zipfile.ZipFile(OUT/'roof-before.zip') as z:
    for path in TARGETS:
        old,old_bin=read(z.read(path));doc,blob=read((ROOT/path).read_bytes())
        node=next(n for n in old['nodes'] if n.get('name')=='Wreck_BrokenRoof_Geometry')
        old_mesh=old['meshes'][node['mesh']];mesh=doc['meshes'][node['mesh']]
        rust=next(p for p in mesh['primitives'] if doc['materials'][p['material']]['name']=='ExpWreck_Rust')
        rust_old=next(p for p in old_mesh['primitives'] if old['materials'][p['material']]['name']=='ExpWreck_Rust')
        new_rust=tris(doc,blob,node,rust);before_rust=tris(old,old_bin,node,rust_old)
        lower=unary_union(flat(new_rust,3.5875))
        for y in [3.5875,3.74]:
            polys=flat(new_rust,y);duplicate=sum(p.area for p in polys)-unary_union(polys).area
            check(path+': no coplanar upward rust at '+str(y),duplicate<1e-6,{'areaM2':duplicate})
        before_coverage=unary_union(flat(before_rust,3.5875))
        after_coverage=unary_union(flat(new_rust,3.5875)+flat(new_rust,3.74))
        check(path+': original torn roof coverage retained',before_coverage.symmetric_difference(after_coverage).area<1e-6,{'areaM2':after_coverage.area})
        count=0
        for p0,p in zip(old_mesh['primitives'],mesh['primitives']):
            groups=target_components(old,old_bin,node,p0)
            if not groups:continue
            new_positions=values(doc,blob,p['attributes']['POSITION']).astype(float)+node.get('translation',[0,0,0])
            indices=values(doc,blob,p['indices']).reshape(-1,3)
            for group in groups:
                mask=np.isin(indices,group).all(axis=1);t=new_positions[indices[mask]]
                thickness=float(new_positions[group,1].max()-new_positions[group,1].min())
                check(path+': moved component retains solid thickness',abs(thickness-(.075 if len(groups)==1 else .13))<2e-6,{'thicknessM':thickness})
                cross=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
                check(path+': moved component finite nondegenerate',np.isfinite(t).all() and (np.linalg.norm(cross,axis=1)>1e-9).all())
                if len(groups)>1:
                    contact=lower.intersection(unary_union(flat(t,3.5875,False))).area
                    count+=1
                    check(path+': rib '+str(count)+' visibly seated on lower sheet',contact>.02,{'contactAreaM2':contact,'undersideY':float(new_positions[group,1].min())})
            if len(groups)>1:
                steel=tris(doc,blob,node,p)
                for y in [3.565,3.7175]:
                    polys=flat(steel,y);dup=sum(p.area for p in polys)-unary_union(polys).area
                    check(path+': no overlapping steel rib top at '+str(y),dup<1e-6,{'areaM2':dup})
        check(path+': all five lap ribs have support',count==5)
        check(path+': floor repair and all other meshes untouched',all(a==b for i,(a,b) in enumerate(zip(old['meshes'],doc['meshes'])) if i!=node['mesh']))
report={'checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),
        'collision':'Previously visual-only roof. Matching roof-only native shape is being added by site_roofs owner; validate actual native shape separately.',
        'rayProbes':{'raisedSheetTop':[0,3.74,-5.6],'raisedSheetUnderside':[0,3.665,-5.6],'oldSheetTop':[0,3.5875,-8],'tornGap':[0,4,0]}}
(OUT/'roof-structural-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']:raise SystemExit(1)
