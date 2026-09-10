"""Render-led corrections to the second assembly. Run on S07_Gunner.blend once."""
import bpy,math,json,random,sys
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07';scene=bpy.context.scene
script=(ROOT/'tools/art/gunner_s07/build.py').read_text()
old={m.name:m for m in bpy.data.materials};M={}
exec(script[script.index('def srgb'):script.index("print('Generating packed")])
exec(script[script.index("M['armor']=surface"):script.index('\ndef deselect():')])
print('PBR files regenerated',flush=True)
for m in M.values():
    name=m.name.rsplit('.',1)[0] if m.name[-4:-3]=='.' else m.name
    if name in old:old[name].user_remap(m);bpy.data.materials.remove(old[name]);m.name=name
for im in list(bpy.data.images):
    if im.users==0:bpy.data.images.remove(im)
# These construction helpers also preserve the original explicit bone bindings.
character=bpy.data.collections.get('S07 • Tailoring, armor and equipment');current_collection=character;PARTS=[];WEAPON=[]
exec(script[script.index('def deselect():'):script.index("print('Sculpting tailored")])
rig=bpy.data.objects['S07_Rig'];rig.data.pose_position='REST';bpy.context.view_layer.update()
# Conform insignia and stencil geometry directly onto the manufactured shoulder.
from mathutils.bvhtree import BVHTree
shell=bpy.data.objects['S07 overlapping shoulder shell r'];tree=BVHTree.FromPolygons([v.co for v in shell.data.vertices],[list(p.vertices) for p in shell.data.polygons]);n=Vector((-.44,-.88,.15)).normalized()
for o in list(bpy.data.objects):
    if o.type!='MESH' or o.get('deformBone')!='upperarm_r' or not (o.name.startswith('Marking') or o.name.startswith('Branch insignia')):continue
    for v in o.data.vertices:
        p=o.matrix_world@v.co
        if o.name.startswith('Branch insignia'):
            pivot=Vector((-.375,-.059,1.606));p=pivot+(p-pivot)*.80
        origin=shell.matrix_world.inverted()@(p+n*.15);direction=shell.matrix_world.to_3x3().inverted()@(-n)
        loc,normal,face,distance=tree.ray_cast(origin,direction)
        if loc is not None:v.co=o.matrix_world.inverted()@(shell.matrix_world@loc+n*(.00065+(v.co.z if o.name.startswith('Marking') else 0)*.001))
print('Surface markings conformed',flush=True)
# Replace the approximate floating hose corrugations with measured curve samples.
for o in list(bpy.data.objects):
    if o.name.startswith(('Helmet respirator loop','Breathing hose corrugation')):bpy.data.objects.remove(o,do_unlink=True)
for s in (-1,1):
    p0=Vector((s*.215,-.012,1.917));p1=Vector((s*.207,-.100,1.84));p2=Vector((s*.132,-.144,1.816))
    def p(t):return p0*(1-t)**2+2*p1*t*(1-t)+p2*t*t
    tube('Corrugated helmet respirator', [p(i/36) for i in range(37)],.011,M['rubber'],'head',False)
    for j in range(19):
        t=(j+.4)/19;axis=2*(1-t)*(p1-p0)+2*t*(p2-p1);ring('Seated hose corrugation',p(t),axis,.012,.002,M['steel'],'head',24)
print('Hose correction complete',flush=True)
# Keep crown fasteners seated on their accessory brackets.
for o in list(bpy.data.objects):
    if o.type!='MESH' or o.get('deformBone')!='head' or not o.name.startswith(('Captive hex','Fastener drive')):continue
    if o.location.z>2.10:o.location.z-=.007
# Additional mechanical eyebrows and asymmetric service details echo the image.
for s in (-1,1):
    box('Brow visor mounting lug',(s*.137,-.136,2.014),(.03,.028,.043),M['armor'],'head',.004,rotation=(0,s*.27,0))
    screw((s*.14,-.153,2.013),(s*.3,-.95,0),'head',.0055)
    for j in range(4):box('Crown service vent',(s*.08,.07+j*.013,2.079-j*.005),(.026,.006,.007),M['black'],'head',.001)
# Subtle actual stitched ridges and loose fibres improve the scarf close-up.
for row in (.22,.38,.76):
    points=[]
    for i in range(96):
        a=math.tau*i/95;rad=.016*math.sin(row*math.tau*3+a*1.7)+.009*math.cos(a*7+row*4)
        points.append(((.226+rad)*math.sin(a),-(.167+rad)*math.cos(a),1.74+(row-.5)*.15-.065*(1+math.cos(a))/2+.012*math.sin(a*3+row*7)))
    tube('Scarf woven seam',points,.0009,M['thread'],'neck_01',False)
for j in range(45):
    a=-1.25+j*.059;v=.96;rad=.016*math.sin(v*math.tau*3+a*1.7)+.009*math.cos(a*7+v*4)
    p=Vector(((.225+rad)*math.sin(a),-(.166+rad)*math.cos(a),1.74+(v-.5)*.15-.065*(1+math.cos(a))/2+.012*math.sin(a*3+v*7)))
    tube('Collar edge loose fibre',[p,p+Vector((math.sin(a)*.008,-math.cos(a)*.008,.006+random.Random(j).random()*.009))],.0004,M['thread'],'neck_01',False)
# Lift the windward edge so the broad cloak is visible above the weapon.
for o in bpy.data.objects:
    if o.type=='MESH' and o.name.startswith(('Wind-shaped shredded','Frayed cape fibre')):
        for v in o.data.vertices:
            p=o.matrix_world@v.co;f=max(0,min(1,(1.74-p.z)/.62));p.z+=.17*f;p.y-=.06*f;v.co=o.matrix_world.inverted()@p
for o in PARTS:
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world;mod=o.modifiers.new('S07 skeletal deformation','ARMATURE');mod.object=rig
rig.data.pose_position='POSE';bpy.context.view_layer.update()
# Seamless curved studio floor instead of a visible distant horizon line.
floor=bpy.data.objects.get('Neutral studio floor');mat=floor.data.materials[0];bpy.data.objects.remove(floor,do_unlink=True)
profile=[(-20,-.018),(2,-.018)]+[(2+3*math.sin(i*math.pi/40),-.018+3*(1-math.cos(i*math.pi/40))) for i in range(1,21)]+[(5,20)]
verts=[(x,y,z) for x in (-25,25) for y,z in profile];nn=len(profile);faces=[(i,i+1,i+1+nn,i+nn) for i in range(nn-1)]
me=bpy.data.meshes.new('Curved cyclorama');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Neutral studio cyclorama',me);bpy.data.collections['S07 • Review studio (excluded from exports)'].objects.link(o);o.data.materials.append(mat)
for p in me.polygons:p.use_smooth=True
# Readily accessible, packed reference in the editable Blender file.
col=bpy.data.collections.new('S07 • Original image reference');scene.collection.children.link(col);im=bpy.data.images.load(str(OUT/'reference/gunner.png'));im.pack();ref=bpy.data.objects.new('Reference • supplied gunner image',None);col.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=im;ref.empty_display_size=2.1;ref.location=(2.45,.5,1.1);ref.rotation_euler=(math.pi/2,0,0);ref.hide_render=True;ref.hide_set(True)
scene.camera=bpy.data.objects['01 • Reference three-quarter'];scene.camera.location=(-2.8,-5.5,2.32);scene.camera.rotation_euler=(Vector((.18,-.08,1.075))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
# Save poseable source with textures packed; cameras and studio are isolated.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/S07_Gunner.blend'))
scene.render.resolution_x=1080;scene.render.resolution_y=1440;scene.render.resolution_percentage=85;scene.cycles.samples=64;scene.render.filepath=str(OUT/'preview/iteration_03.png');bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['04 • Helmet study'];scene.render.resolution_x=1080;scene.render.resolution_y=1080;scene.render.filepath=str(OUT/'preview/helmet_polished.png');bpy.ops.render.render(write_still=True)
print('POLISH PASS COMPLETE',flush=True)
