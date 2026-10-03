"""Original wind-worn roadside machinery, authored in isolated Blender 5.1."""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
OUT=ROOT/'assets/native-atmosphere';OUT.mkdir(parents=True,exist_ok=True)
RUNTIME=ROOT/'godot/art';RUNTIME.mkdir(parents=True,exist_ok=True)
c.steel=c.flat('Worn blackened steel',(.11,.135,.13),.72,.58)
c.bare=c.flat('Scoured steel edges',(.38,.39,.34),.82,.42)
c.brass=c.flat('Weathered oxide',(.29,.12,.045),.5,.77)
c.ivory=c.flat('Faded safety paint',(.48,.42,.25),.12,.81)
c.dark=c.flat('Rubber and soot',(.017,.022,.021),.05,.87)
c.letter=c.flat('Old stencil',(.72,.7,.51),.15,.7)
clothmat=c.flat('Torn ochre canvas',(.35,.19,.07),0,.95)
amber=c.flat('Amber lens',(.95,.25,.022),.1,.27)
bs=amber.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.22,.01,1);bs.inputs['Emission Strength'].default_value=.65
roots=[]
def plate(at,w,d,p):
    x,y,z=at;c.box('Bolted foundation',(x,y+.025,z),(w,.05,d),c.steel,p,.025)
    for dx in [-w*.36,w*.36]:
        for dz in [-d*.36,d*.36]:
            c.tube('Rust washer',(x+dx,y+.055,z+dz),(x+dx,y+.067,z+dz),.038,c.brass,p,24)
            c.tube('Anchor bolt',(x+dx,y+.06,z+dz),(x+dx,y+.09,z+dz),.024,c.bare,p,6)
def ring(name,at,r,p,material=c.steel):
    bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=12,major_radius=r,minor_radius=.015,location=c.xyz(at),rotation=(math.pi/2,0,0))
    c.finish(bpy.context.object,name,material,p)
def cloth(parent):
    root=c.empty('WindCloth',parent=parent);verts=[];faces=[];uv=[];cols=24;rows=22
    for j in range(rows+1):
        t=j/rows
        for i in range(cols+1):
            s=i/cols
            # Ragged lower hem and curved folds; intact top seam remains pinned.
            edge=.10*math.sin(i*2.9)+(.16 if i in [4,5,17,18] else 0)
            y=3.1-t*(1.05-edge)
            verts.append(c.xyz((.12+s*1.15,y,.10*math.sin(s*9+t*6)*t)))
            uv.append((s,t))
    for j in range(rows):
        for i in range(cols):
            if j>rows-5 and i in [4,17]:continue
            if 9<j<13 and 16<i<19:continue
            n=j*(cols+1)+i;faces.append((n,n+1,n+cols+2,n+cols+1))
    mesh=bpy.data.meshes.new('Woven torn canvas');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('CanvasSurface',mesh);bpy.context.collection.objects.link(obj);obj.parent=root;mesh.materials.append(clothmat)
    uvs=mesh.uv_layers.new(name='UVMap')
    for f in mesh.polygons:
        f.use_smooth=True
        for index in f.loop_indices:uvs.data[index].uv=uv[mesh.loops[index].vertex_index]
    # Frayed lower strands are geometry rather than transparent cutout cards.
    for i in range(23):
        x=.15+i*.048;y=2.05+.1*math.sin(i*2.9)
        c.cable('Loose canvas thread',[(x,y,0),(x+.016,y-.06,.025),(x-.008,y-.11,.04)],.002,clothmat,root)
    return root
p=c.empty('WindMast');roots.append(p);plate((0,0,0),.65,.65,p)
c.tube('Flanged mast',(0,.07,0),(0,3.35,0),.065,c.steel,p,32)
for y in [.16,1.1,2.15,3.17]:c.tube('Mast clamp',(0,y-.025,0),(0,y+.025,0),.079,c.brass,p,32)
c.tube('Canvas crossbar',(-.12,3.13,0),(1.36,3.13,0),.029,c.bare,p,24)
for x,z in [(-.25,.25),(.25,-.25),(-.25,-.25)]:c.tube('Mast gusset',(x,.07,z),(0,.75,0),.026,c.brass,p,16)
c.cable('Tension lanyard',[(1.33,3.12,0),(.65,3.23,0),(0,3.33,0)],.009,c.dark,p)
cloth(p)
p=c.empty('WindVent');roots.append(p);plate((0,0,0),1.15,.72,p)
for x in [-.45,.45]:
    c.box('Vent cradle',(x,.45,.02),(.10,.84,.13),c.brass,p,.026)
    c.tube('Cradle brace',(x,.10,.30),(x,.86,.02),.036,c.steel,p,20)
rotor=c.empty('WindRotor',(0,1.20,0),p)
for z in [-.12,.16]:ring('Rolled cage lip',(0,1.2,z),.68,p,c.bare)
for i in range(12):
    a=i*math.tau/12;x=math.cos(a)*.68;y=1.2+math.sin(a)*.68
    c.tube('Protective cage wire',(x,y,-.12),(x,y,.16),.009,c.brass,p,10)
    c.tube('Radial guard',(math.cos(a)*.11,1.2+math.sin(a)*.11,-.16),(x,y,-.16),.009,c.steel,p,10)
c.tube('Hub bearing',(0,0,-.08),(0,0,.13),.13,c.steel,rotor,48)
c.tube('Machined boss',(0,0,-.12),(0,0,-.075),.085,c.bare,rotor,32)
for i in range(7):
    a=i*math.tau/7;verts=[]
    for j in range(9):
        t=j/8;r=.12+.50*t;theta=a+t*.35
        for sign in [-1,1]:
            phi=theta+sign*(.16+.08*t)
            verts.append(c.xyz((math.cos(phi)*r,math.sin(phi)*r,sign*.04*t)))
    faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(8)]
    mesh=bpy.data.meshes.new('Swept blade');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('Bent turbine vane',mesh);bpy.context.collection.objects.link(o);o.parent=rotor;mesh.materials.append(c.ivory)
    sol=o.modifiers.new('Rolled vane thickness','SOLIDIFY');sol.thickness=.014
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
    for f in o.data.polygons:f.use_smooth=True
c.box('Missing motor mount',(0,.24,.06),(.40,.27,.32),c.steel,p,.032)
c.cable('Severed power conduit',[(.1,.26,.2),(.4,.2,.28),(.52,.08,.3)],.021,c.dark,p)
c.label('Old fan stencil','AIR / 04',(0,.28,-.112),.055,p)
p=c.empty('RoadBeacon');roots.append(p);plate((0,0,0),.62,.58,p)
c.box('Battered battery case',(0,.23,0),(.42,.38,.33),c.steel,p,.05)
c.box('Service door',(0,.23,-.18),(.35,.29,.022),c.ivory,p,.015)
for x in [-.14,.14]:
    for y in [.12,.34]:c.tube('Door fastener',(x,y,-.194),(x,y,-.21),.014,c.bare,p,8)
c.tube('Beacon neck',(0,.44,0),(0,1.28,0),.07,c.brass,p,32)
c.tube('Lamp collar',(0,1.02,0),(0,1.075,0),.16,c.steel,p,40)
lens=c.empty('BeaconLens',parent=p)
c.tube('Fresnel lamp lens',(0,1.08,0),(0,1.27,0),.14,amber,lens,48)
for y in [1.10,1.14,1.18,1.22,1.26]:c.tube('Lens prism ridge',(0,y-.008,0),(0,y+.008,0),.15,amber,lens,48)
c.tube('Lamp cap',(0,1.28,0),(0,1.32,0),.17,c.steel,p,40)
c.box('Cracked solar housing',(0,1.38,0),(.56,.055,.42),c.bare,p,.019)
c.box('Dark photovoltaic glass',(0,1.413,0),(.51,.015,.37),c.dark,p,.012)
for x in [-.16,0,.16]:c.box('Solar cell divider',(x,1.423,0),(.006,.005,.34),c.bare,p,.001)
c.label('Hazard stencil','LIVE BUS',(0,.19,-.205),.041,p)
preserve=[o for o in bpy.context.scene.objects if o.type=='EMPTY']
for parent in preserve:
    for mat in list(bpy.data.materials):
        meshes=[o for o in parent.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
        if len(meshes)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_'+mat.name
for obj in bpy.context.scene.objects:
    if obj.type=='MESH' and obj.parent and obj.parent.name=='WindCloth':
        layer=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        for poly in obj.data.polygons:
            for index in poly.loop_indices:
                co=obj.data.vertices[obj.data.loops[index].vertex_index].co
                layer.data[index].uv=((co.x-.12)/1.15,max(0,min(1.2,(3.1-co.z)/1.05)))
bpy.ops.export_scene.gltf(filepath=str(RUNTIME/'wind-worn-props.glb'),export_format='GLB',export_animations=False)
# Source studio shader; the runtime uses the corresponding native triplanar wear shader.
for mat in [c.steel,c.bare,c.brass,c.ivory]:
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;surface=nodes.get('Principled BSDF');base=tuple(surface.inputs['Base Color'].default_value)
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=18;noise.inputs['Detail'].default_value=3
    ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.46;ramp.color_ramp.elements[0].color=base
    ramp.color_ramp.elements[1].position=.72;ramp.color_ramp.elements[1].color=(.23,.075,.025,1)
    links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],surface.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=.012
    links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],surface.inputs['Normal'])
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'WindWornProps.blend'))
for i,p in enumerate(roots):p.location=c.xyz(((i-1)*2.6,0,0))
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Dust studio');scene.world.color=(.18,.18,.18)
bpy.ops.object.camera_add(location=(4,8,3.3));cam=bpy.context.object;target=Vector((0,0,1.6));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=8.2;scene.camera=cam
for at,power in [((0,2,6),1100),((-4,-3,4),1600)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=5;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'wind-worn-props.png');bpy.ops.render.render(write_still=True)
report={'assemblies':[p.name for p in roots],'meshes':sum(o.type=='MESH' for o in scene.objects),'triangles':sum(len(o.data.loop_triangles) for o in scene.objects if o.type=='MESH')}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('ATMOSPHERE_COMPLETE',report)
