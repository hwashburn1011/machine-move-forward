"""Original native firearm presentation kit. Isolated Blender process only.

Fictional game meshes, preserving the existing compact rifle/shotgun roles and
metre-scale silhouettes. No gameplay definitions or original assets are edited.
"""
import bpy, math, json, sys, struct, re
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-weapons';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c

def wear_material(name,base,metal,rough,seed):
    """Packed portable PBR maps, with readable coating loss and oxide islands."""
    rng=np.random.default_rng(seed);size=512;v,u=np.mgrid[0:size,0:size]/size
    field=np.zeros((size,size));amp=1;total=0
    for grid in [5,11,23,47]:
        cells=rng.random((grid+1,grid+1));x=u*grid;y=v*grid
        ix=x.astype(int);iy=y.astype(int);fx=x-ix;fy=y-iy
        fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
        field+=amp*((1-fy)*((1-fx)*cells[iy,ix]+fx*cells[iy,ix+1])+fy*((1-fx)*cells[iy+1,ix]+fx*cells[iy+1,ix+1]));total+=amp;amp*=.48
    field/=total;grain=rng.random((size,size));chips=np.clip((field-.57)*11,0,1)
    scratch=np.zeros((size,size))
    for i in range(380):
        x,y=rng.integers(0,size,2);length=rng.integers(2,24)
        for k in range(length):scratch[(y+k//4)%size,(x+k)%size]=rng.uniform(.4,1)
    mat=c.flat(name,base,metal,rough);nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
    maps={}
    for channel in ['Base','ORM','Normal']:
        pixels=np.ones((size,size,4),dtype=np.float32)
        if channel=='Base':
            coating=np.array(base)[None,None,:]*(.77+.4*field[:,:,None]+.1*grain[:,:,None])
            exposed=np.array([.27,.235,.18])[None,None,:]*(.6+.5*grain[:,:,None])
            pixels[:,:,:3]=coating*(1-chips[:,:,None])+exposed*chips[:,:,None]
            pixels[:,:,:3]=np.clip(pixels[:,:,:3]+scratch[:,:,None]*.055,0,1)
        elif channel=='ORM':
            pixels[:,:,0]=1;pixels[:,:,1]=np.clip(rough+(field-.5)*.27+chips*.10-scratch*.08,.22,.96);pixels[:,:,2]=metal*(1-chips*.45)
        else:
            height=(field*.5+grain*.055+chips*.12-scratch*.1)
            dx=(np.roll(height,1,1)-np.roll(height,-1,1))*.55;dy=(np.roll(height,1,0)-np.roll(height,-1,0))*.55
            pixels[:,:,0]=.5+dx;pixels[:,:,1]=.5+dy;pixels[:,:,2]=1
        img=bpy.data.images.new(name+'_'+channel,width=size,height=size)
        img.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';img.pixels.foreach_set(pixels.ravel());img.pack()
        node=nodes.new('ShaderNodeTexImage');node.image=img;maps[channel]=node
    links.new(maps['Base'].outputs['Color'],bs.inputs['Base Color'])
    sep=nodes.new('ShaderNodeSeparateColor');links.new(maps['ORM'].outputs['Color'],sep.inputs[0]);links.new(sep.outputs[1],bs.inputs['Roughness']);links.new(sep.outputs[2],bs.inputs['Metallic'])
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65;links.new(maps['Normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
    return mat

steel=wear_material('Nomad blackened steel',(.065,.076,.071),.75,.63,301)
paint=wear_material('Nomad faded olive',(.19,.20,.145),.50,.72,302)
ochre=wear_material('Nomad worn ochre',(.28,.18,.09),.46,.73,303)
rubber=wear_material('Nomad grip rubber',(.028,.032,.029),.03,.90,304)
edge=c.flat('Scoured metal edges',(.27,.28,.255),.85,.48)
black=c.flat('Recess and bore',(.008,.012,.011),.15,.82)
letter=c.flat('Faded ceramic stencil',(.52,.49,.39),0,.84)
lamp=c.flat('Small status phosphor',(.025,.3,.38),.1,.4)
lamp.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.02,.55,.8,1)
lamp.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.5
roots=[]

def box(name,at,size,mat,p,bevel=.003):return c.box(name,at,size,mat,p,bevel)
def pipe(name,y,start,end,r,p,mat=steel,inner=None):
    """Open bore, with real front annulus rather than a painted solid cap."""
    inner=inner or r*.66;vertices=[];faces=[];n=40
    for z,rad in [(start,r),(end,r),(end,inner),(start,inner)]:
        for i in range(n):
            a=i*math.tau/n;vertices.append(c.xyz((math.cos(a)*rad,y+math.sin(a)*rad,z)))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);c.finish(obj,name,mat,p)
    return obj
def bolt(at,p):
    x,y,z=at;side=1 if x>0 else -1
    c.tube('Recessed fastener washer',(x,y,z),(x+side*.0018,y,z),.006,black,p,16)
    c.tube('Hex socket head',(x+side*.0019,y,z),(x+side*.004,y,z),.0042,edge,p,6)
def text(text_value,at,size,p):
    bpy.ops.object.text_add(location=c.xyz(at));obj=bpy.context.object;obj.name='Stamped '+text_value;obj.parent=p
    obj.data.body=text_value;obj.data.size=size;obj.data.extrude=.0001
    obj.rotation_euler=(math.pi/2,0,math.pi/2);obj.data.materials.append(letter);bpy.ops.object.convert(target='MESH')

for shotgun in [False,True]:
    name='NativeShotgun' if shotgun else 'NativeRifle';root=c.empty(name);roots.append(root);coat=ochre if shotgun else paint
    muzzle=.80 if shotgun else .73
    box('Forged receiver',(0,.094,.095),(.082,.105,.25),steel,root,.008)
    box('Dust-sealed top cover',(0,.153,.09),(.078,.017,.24),coat,root,.004)
    for side in [-1,1]:
        box('Replaceable receiver cheek',(side*.044,.095,.08),(.010,.075,.20),coat,root,.003)
        for y in [.069,.126]:
            for z in [-.006,.17]:bolt((side*.05,y,z),root)
        box('Raised service seam',(side*.052,.083,.083),(.0015,.002,.13),edge,root,.0003)
    box('Ejection recess',(.051,.117,.101),(.003,.022,.078),black,root,.001)
    box('Visible sliding bolt',(.054,.121,.105),(.004,.013,.064),edge,root,.001)
    c.tube('Charging stem',(.05,.132,.054),(.072,.132,.054),.004,steel,root,12)
    box('Charging tab',(.073,.132,.054),(.014,.012,.025),rubber,root,.002)
    grip=box('Contoured pistol grip',(0,-.013,0),(.065,.129,.061),rubber,root,.009)
    for i in range(6):box('Grip traction rib',(0,-.057+i*.017,-.031),(.049,.004,.003),steel,root,.001)
    c.cable('Bent trigger guard',[(-.027,.014,.035),(-.027,-.063,.052),(-.027,-.06,.10),(-.027,.024,.115)],.004,edge,root)
    c.cable('Trigger',[(0,.024,.047),(0,-.012,.06),(0,-.035,.05)],.0045,steel,root)
    box('Short recoil stock',(0,.090,-.087),(.06,.062,.078),steel,root,.005)
    box('Worn stock heel',(0,.09,-.139),(.083,.105,.022),rubber,root,.007)
    for y in [.055,.075,.095,.115]:box('Stock heel grooves',(0,y,-.151),(.065,.004,.002),black,root,.0005)
    box('Optic mounting base',(0,.168,.085),(.04,.019,.21),steel,root,.003)
    for i in range(11):box('Rail serration',(0,.181,-.012+i*.019),(.05,.009,.010),edge,root,.001)
    # Open reflex hood; keeps the sight readable without an opaque square.
    for x in [-.022,.022]:box('Sight hood side',(x,.211,.015),(.005,.041,.028),steel,root,.002)
    box('Sight hood crown',(0,.234,.015),(.05,.006,.03),steel,root,.002)
    box('Sight emitter',(0,.191,.028),(.006,.006,.007),lamp,root,.001)
    pipe('Hollow barrel',.117,.215,muzzle,.024 if shotgun else .017,root,edge)
    pipe('Muzzle collar',.117,muzzle-.047,muzzle,.032 if shotgun else .026,root,steel,.024 if shotgun else .017)
    c.empty('GripOrigin',parent=root);c.empty('Muzzle',(0,.117,muzzle),root)
    c.empty('MuzzleMount',(0,.117,muzzle-.015),root)
    c.empty('BodyMount',(.064,.075,.105),root)
    c.empty('SupportGrip',(.022,.052,.235),root)
    pipe('Front sight collar',.117,muzzle-.073,muzzle-.044,.029 if shotgun else .023,root,steel,.024 if shotgun else .017)
    box('Front sight saddle',(0,.142,muzzle-.06),(.043,.011,.021),steel,root,.002)
    for side in [-1,1]:
        box('Front sight ear',(side*.018,.158,muzzle-.06),(.005,.035,.012),steel,root,.001)
    box('Front sight bead',(0,.164,muzzle-.06),(.005,.024,.006),edge,root,.001)
    if shotgun:
        pipe('Magazine tube',.061,.21,.68,.023,root,steel)
        pump=c.empty('Pump',parent=root)
        box('Pump body',(0,.060,.29),(.091,.065,.22),coat,pump,.01)
        for z in [.20,.23,.26,.29,.32,.35,.38]:box('Rounded pump knurl',(0,.062,z),(.102,.072,.009),rubber,pump,.003)
        for z in [.01,.06,.11]:
            c.tube('Side saddle shell',(-.060,.071,z),(-.060,.137,z),.013,ochre,root,20)
            c.tube('Shell rim',(-.060,.135,z),(-.060,.14,z),.014,edge,root,20)
        text('DUNE / 12',(.053,.075,.14),.013,root)
    else:
        # Four real open vent bays around an inner barrel; no painted black squares.
        box('Handguard spine',(0,.16,.325),(.066,.012,.23),coat,root,.003)
        box('Lower handguard',(0,.072,.325),(.066,.014,.23),rubber,root,.003)
        for z in [.22,.272,.324,.376,.43]:
            for side in [-1,1]:box('Vent bridge',(side*.034,.118,z),(.010,.082,.009),coat,root,.002)
        pipe('Exposed heat sleeve',.117,.225,.428,.025,root,black,.017)
        c.tube('Gas return', (0,.154,.42),(0,.154,.62),.007,steel,root,20)
        magazine=c.empty('Magazine',parent=root)
        box('Detachable magazine',(0,-.090,.13),(.065,.202,.084),coat,magazine,.006)
        for side in [-1,1]:
            for z in [.11,.15]:box('Magazine pressed rib',(side*.034,-.09,z),(.003,.16,.006),steel,magazine,.001)
        box('Magazine shoe',(0,-.194,.13),(.075,.016,.096),rubber,magazine,.003)
        text('S-07 / SCRAPLINE',(.053,.071,.155),.010,root)
    for z in [-.11,.185]:
        c.tube('Sling attachment',(-.041,.04,z),(-.061,.04,z),.008,steel,root,16)

# Smart UV projection gives every physical part a usable map before batching.
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
    triangulate=obj.modifiers.new('Portable tangent triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=triangulate.name)
for root in roots:
    parents=[root]+[o for o in root.children if o.type=='EMPTY' and o.name.split('.')[0] in ['Magazine','Pump']]
    for parent in parents:
        for mat in list(bpy.data.materials):
            meshes=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
            if not meshes:continue
            bpy.ops.object.select_all(action='DESELECT')
            for obj in meshes:obj.select_set(True)
            bpy.context.view_layer.objects.active=meshes[0]
            if len(meshes)>1:bpy.ops.object.join()
            bpy.context.object.name=parent.name+'_'+mat.name
report={'assemblies':[]}
for root in roots:
    descendants=list(root.children_recursive);bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for obj in descendants:obj.select_set(True)
    path=ROOT/'godot/art'/('native-shotgun.glb' if 'Shotgun' in root.name else 'native-rifle.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
    # Blender requires unique names across the studio, but each independent
    # export must expose the same semantic anchors to the game.
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
    for node in doc['nodes']:node['name']=re.sub(r'\.\d+$','',node.get('name',''))
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);tail=raw[20+length:]
    path.write_bytes(struct.pack('<4sIIII',b'glTF',2,20+len(encoded)+len(tail),len(encoded),0x4E4F534A)+encoded+tail)
    meshes=[o for o in descendants if o.type=='MESH']
    for obj in meshes:obj.data.calc_loop_triangles()
    report['assemblies'].append({'name':root.name,'triangles':sum(len(o.data.loop_triangles) for o in meshes),'meshes':len(meshes),'bytes':path.stat().st_size})
# Keep studio arrangement out of the exports.
roots[0].location=c.xyz((-.24,0,0));roots[1].location=c.xyz((.24,0,0))
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Neutral weapon studio');scene.world.color=(.12,.12,.12)
bpy.ops.object.camera_add(location=(1.7,-1.7,1.1));cam=bpy.context.object;target=c.xyz((0,.06,.31));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.42;scene.camera=cam
for at,power,size in [((1,0,2),140,2),((-1,-1,1),90,1.5)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'native-weapons.png');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadWeapons.blend'))
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));bpy.ops.render.render(write_still=True);print('NATIVE_WEAPONS_COMPLETE',json.dumps(report),flush=True)
