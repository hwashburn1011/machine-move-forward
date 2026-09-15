"""Original small route discoveries, using the Quiet Array's original PBR palette."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/quiet-array'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'QuietArray.blend'))
def xyz(p):return Vector((p[0],-p[2],p[1]))
mats={n:bpy.data.materials[n] for n in ['Array_CharcoalSteel','Array_MachinedMetal','Array_HandrailBrass','Array_IvoryPaint','Array_OxidePaint','Array_ArchiveCyan','Array_ServiceAmber']}
steel=mats['Array_CharcoalSteel'];bare=mats['Array_MachinedMetal'];brass=mats['Array_HandrailBrass'];ivory=mats['Array_IvoryPaint'];red=mats['Array_OxidePaint'];cyan=mats['Array_ArchiveCyan'];amber=mats['Array_ServiceAmber']
def box(name,at,size,mat,parent=None,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,parent,bevel)
def finish(o,mat,parent,bevel):
    o.data.materials.append(mat);o.parent=parent
    if bevel:
        m=o.modifiers.new('Worn bevels','BEVEL');m.width=bevel;m.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons:p.use_smooth=True
    m=o.modifiers.new('Face normals','WEIGHTED_NORMAL');m.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=m.name)
    return o
def tube(name,a,b,r,mat,parent=None,segments=24):
    a,b=xyz(a),xyz(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=d.length,location=(a+b)*.5)
    o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,mat,parent,.012)
def empty(name,at=(0,0,0)):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(at);return o
reports=[]
for kind in ['water-cache','salvage-wreck','memorial']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    root=empty('Route_'+kind)
    box('Service deck',(0,-.24,0),(12,.48,10),steel,root,.09)
    for x in [-5,-3,-1,1,3,5]:
        for z in [-4,-2,0,2,4]:box('Grip plate',(x,.008,z),(1.96,.035,1.96),bare,root,.013)
    for x in [-5,5]:
        for z in [-4,4]:
            tube('Foundation legs',(x,-15,z),(x,-.45,z),.23,steel,root)
            for y in [-12,-8,-4]:tube('Foundation rings',(x,y-.09,z),(x,y+.09,z),.28,red,root)
        tube('Underdeck cross brace',(x,-6,-4),(x,-.5,4),.08,brass,root)
    for x in [-5.9,5.9]:
        for z in [-4,-2,2,4]:tube('Rail posts',(x,0,z),(x,1.2,z),.05,brass,root)
        for y in [.55,1.2]:
            for a,b in ([(-4.9,-1.2),(1.2,4.9)] if x<0 else [(-4.9,4.9)]):tube('Rail',(x,y,a),(x,y,b),.038,brass,root)
    for z in [-4.9,4.9]:
        for y in [.55,1.2]:tube('End rails',(-5.9,y,z),(5.9,y,z),.038,brass,root)
    gangway=empty('Gangway',(-6.5,-.08,0));gangway.parent=root
    box('Gangway tread',(0,0,0),(1,.16,2),bare,gangway,.02)
    for z in [-.93,.93]:
        tube('Gangway rail',(-.5,1,z),(.5,1,z),.04,brass,gangway)
        for x in [-.5,.5]:tube('Gangway posts',(x,.08,z),(x,1,z),.045,brass,gangway)
    box('Terminal pedestal',(-2,.55,1.5),(.9,1.1,.7),steel,root)
    reward=empty('Reward',(-2,1.2,1.5));reward.parent=root
    box('Cache access',(0,0,0),(.78,.16,.56),ivory,reward)
    box('Access display',(0,.085,-.08),(.46,.018,.3),cyan,reward,.006)
    for x in [-.25,.25]:box('Status light',(x,.09,.17),(.11,.02,.09),amber,reward,.004)
    if kind=='water-cache':
        for z in [-.65,.65]:
            tube('Sealed water vessel',(-.15,1.3,z),(3.15,1.3,z),.55,ivory,root,48)
            for x in [.1,1.5,2.9]:tube('Tank strap',(x-.045,1.3,z),(x+.045,1.3,z),.57,steel,root,40)
            tube('Fill coupler',(3.1,1.3,z),(3.5,1.3,z),.11,brass,root)
            for x in [.4,2.6]:box('Tank cradle',(x,.38,z),(.35,.76,1.05),steel,root)
        for x in [-.1,3.1]:tube('Water manifold',(x,.27,-.7),(x,.27,.7),.10,bare,root)
    elif kind=='salvage-wreck':
        box('Burned tender hull',(1.5,.5,0),(3.6,1,2.6),steel,root,.12)
        for x in [0,1.5,3]:
            tube('Hull frame',(x,.8,-1.1),(x,2.35,-1.1),.10,red,root)
            tube('Open roof rib',(x,2.35,-1.1),(x,2.35,1.1),.10,red,root)
        box('Torn engine housing',(2,1.6,.85),(1.3,1.1,.14),red,root)
        for x in [.4,.7,1,1.3]:tube('Engine cylinders',(x,.9,-.6),(x,1.8,-.6),.17,bare,root)
        for z in [-1.15,1.15]:tube('Scorched chassis',(-.1,.3,z),(3.3,.3,z),.11,bare,root)
        for x in [-3.5,-2.6,-1.7]:box('Stacked salvage',(x,.18,-2),(.7,.35,1.2),red,root)
    else:
        box('Memorial receiver',(1.5,1.1,0),(3.6,2.2,2.6),ivory,root,.1)
        for x in [.2,1.5,2.8]:
            box('Nameplate panel',(x,1.4,-1.32),(.95,1.55,.07),steel,root)
            for y in [.9,1.15,1.4,1.65,1.9]:box('Recorded name row',(x,y,-1.365),(.65,.025,.01),brass,root,.001)
        tube('Transmitter mast',(1.5,2.2,0),(1.5,6,0),.09,steel,root)
        for y in [4,5.1,5.8]:
            tube('Relay dipole',(.1,y,0),(2.9,y,0),.04,brass,root)
            for x in [.3,.9,1.5,2.1,2.7]:tube('Dipole crossbar',(x,y,-.5),(x,y,.5),.025,bare,root)
        box('Listening beacon',(1.5,6.05,0),(.2,.25,.2),amber,root)
    for x,z in [(-5.5,-4.5),(5.5,4.5)]:
        tube('Lamp pole',(x,0,z),(x,2.8,z),.065,steel,root)
        box('Lamp shade',(x,2.8,z),(.38,.23,.3),steel,root)
        box('Amber diffuser',(x,2.65,z),(.28,.04,.23),amber,root,.004)
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
        m=o.modifiers.new('Export triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=m.name)
    for parent in [root,gangway,reward]:
        for mat in mats.values():
            meshes=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
            if len(meshes)<2:continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in meshes:o.select_set(True)
            bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_'+mat.name
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/('route-'+kind+'.glb')),export_format='GLB',export_animations=False,export_tangents=True)
    bpy.ops.export_scene.fbx(filepath=str(OUT/'exports'/('route-'+kind+'.fbx')),use_selection=True,global_scale=1,apply_unit_scale=True,object_types={'MESH','EMPTY'},bake_anim=False,mesh_smooth_type='FACE',axis_forward='-Z',axis_up='Y')
    reports.append({'kind':kind,'meshes':sum(o.type=='MESH' for o in bpy.context.scene.objects),'triangles':sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')})
(OUT/'opportunity-models.json').write_text(json.dumps(reports,indent=2))
print('DISCOVERY MODELS COMPLETE',json.dumps(reports))
