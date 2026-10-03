"""Original late-campaign equipment and recovery platform. Blender 5.1, metres."""
import bpy, sys, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
OUT=ROOT/'assets/native-expedition-equipment';OUT.mkdir(parents=True,exist_ok=True)
steel=c.flat('Expedition worn charcoal',(.085,.095,.075),.25,.9)
alloy=c.flat('Expedition scoured alloy',(.25,.27,.21),.35,.86)
paint=c.flat('Expedition faded ochre',(.33,.205,.055),.1,.92)
dark=c.flat('Expedition insulation',(.025,.031,.025),0,.96)
green=c.flat('Expedition service glass',(.07,.33,.15),.1,.66)
roots=[]
def box(n,p,d,m,r,b=.015):return c.box(n,p,d,m,r,b)
def tube(n,a,b,rad,m,r):return c.tube(n,a,b,rad,m,r,12)
def bolts(r,y,w=.55,d=.5):
    for x in [-w,w]:
        for z in [-d,d]:tube('Foot anchor',(x,y,z),(x,y+.04,z),.05,alloy,r)
def plate(r,text,at):
    box('Legend backing',at,(.5,.15,.018),dark,r,.006)
    c.label('Equipment legend',text,(at[0],at[1]-.025,at[2]-.015),.05,r)
r=c.empty('salvage-crane');roots.append(r)
box('Bolted foot',(0,.07,0),(1.35,.14,1.25),steel,r);bolts(r,.14)
tube('Slew bearing',(0,.15,0),(0,.32,0),.43,alloy,r)
box('Counterweight',(0,.62,.35),(.95,.57,.5),paint,r,.045)
for x in [-.22,.22]:
    tube('Mast rail',(x,.3,0),(x,1.75,0),.095,steel,r)
    tube('Lift ram',(x,.65,.27),(x,1.85,-.42),.058,alloy,r)
    tube('Jib',(x,1.6,0),(x,2.2,-.7),.075,paint,r)
tube('Winch drum',(-.34,.82,-.2),(.34,.82,-.2),.19,alloy,r)
for x in [-.25,-.15,-.05,.05,.15,.25]:tube('Cable winding',(x-.012,.82,-.2),(x+.012,.82,-.2),.20,dark,r)
tube('Jib axle',(-.33,2.2,-.68),(.33,2.2,-.68),.09,alloy,r)
c.cable('Reeved cable',[(0,.95,-.2),(0,1.65,-.05),(0,2.25,-.65)],.024,dark,r)
box('Control console',(.49,.95,.05),(.28,.3,.2),paint,r)
plate(r,'HOIST / 04',(.49,1,.05-.11))
r=c.empty('battery-bank');roots.append(r)
box('Service plinth',(0,.07,0),(1.35,.14,1.25),steel,r);bolts(r,.14)
for x in [-.38,0,.38]:
    box('Sealed cell',(x,.67,0),(.33,1.02,.91),paint,r,.04)
    for y in [.35,.8,1.05]:box('Compression band',(x,y,0),(.35,.045,.94),steel,r,.005)
    tube('Cell contact',(x,1.19,-.2),(x,1.29,-.2),.05,alloy,r)
for x in [-.38,0]:tube('Bus bar',(x,1.28,-.2),(x+.38,1.28,-.2),.025,alloy,r)
box('Breaker face',(0,.88,-.5),(.47,.29,.1),dark,r)
for x in [-.13,0,.13]:box('Charge lens',(x,.9,-.56),(.055,.065,.02),green,r,.005)
plate(r,'RESERVE / 120',(0,.36,-.5))
r=c.empty('quiet-drive');roots.append(r)
box('Isolated base',(0,.08,0),(1.35,.16,1.25),steel,r);bolts(r,.16)
for x in [-.4,.4]:
    tube('Damped coupling',(x,.22,-.43),(x,.22,.43),.14,dark,r)
box('Insulated shroud',(0,.7,0),(1.15,.85,1.0),paint,r,.08)
for x in [-.44,-.22,0,.22,.44]:box('Cooling fin',(x,.7,.52),(.06,.66,.10),alloy,r,.006)
for z in [-.38,.38]:tube('Tie strap',(-.54,1.1,z),(.54,1.1,z),.045,steel,r)
box('Selector',(0,.84,-.55),(.36,.24,.11),dark,r)
tube('Switch',(-.08,.84,-.63),(.08,.84,-.63),.055,alloy,r)
plate(r,'LOW SIGNATURE',(0,.43,-.53))
r=c.empty('heavy-cargo');roots.append(r)
box('Load skid',(0,.055,0),(1.3,.11,.86),steel,r)
box('Sealed load',(0,.48,0),(1.18,.76,.78),paint,r,.04)
for x in [-.4,.4]:box('Cargo strap',(x,.5,0),(.055,.88,.84),alloy,r,.005)
for z in [-.3,.3]:tube('Lifting eye',(-.12,.89,z),(.12,.89,z),.048,alloy,r)
plate(r,'HEAVY / WINCH',(0,.52,-.401))
r=c.empty('recovery-platform');roots.append(r)
box('Elevated service deck',(0,-.12,0),(12,.24,8),steel,r,.025)
box('Dock lip',(-6.5,-.08,0),(1,.16,2),paint,r)
for x in [-4,-2,0,2,4]:box('Deck joint',(x,.008,0),(.024,.015,7.8),alloy,r,.002)
for z in [-3.9,3.9]:
    tube('Edge rail',(-5.9,1,z),(5.9,1,z),.055,paint,r)
    for x in [-5.9,-3,0,3,5.9]:tube('Rail post',(x,0,z),(x,1,z),.045,steel,r)
tube('Far edge',(5.9,1,-3.9),(5.9,1,3.9),.055,paint,r)
for z in [-2.6,2.6]:
    tube('Entry side',(-5.9,1,z-1.3),(-5.9,1,z+1.3),.055,paint,r)
for x in [-5.2,5.2]:
    tube('Building pier',(x,-16,-2.8),(x,-.2,-2.8),.38,steel,r)
    tube('Diagonal support',(x,-3,-2.8),(0,-.2,2.8),.16,alloy,r)
box('Isolator cabinet',(-1.8,.6,-2),(1.2,1.2,.9),paint,r)
plate(r,'ISOLATE',(-1.8,.85,-1.54))
box('Release control',(.2,.5,2),(.6,1,.5),steel,r)
plate(r,'RELEASE',(.2,.85,1.735))
for x in [2,3]:box('Recovery dock foot',(x,.12,-1.6),(.13,.24,1.5),alloy,r)
# Batch static pieces per material within each independently instanced root.
for root in roots:
    for mat in [steel,alloy,paint,dark,green,c.letter]:
        parts=[o for o in root.children if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        if len(parts)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for part in parts:part.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=root.name+'_'+mat.name
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for part in root.children_recursive:part.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/expedition-equipment.glb'),export_format='GLB',use_selection=True,export_animations=False)
manifest={root.name:sum(len(p.vertices)-2 for o in root.children if o.type=='MESH' for p in o.data.polygons) for root in roots}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
# Save editable assemblies at their independent origins, then stage copies for review.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'expedition-equipment.blend'),compress=True)
roots[-1].hide_render=True
for part in roots[-1].children_recursive:part.hide_render=True
for i,root in enumerate(roots[:-1]):root.location=c.xyz(((i-1.5)*2.25,0,0))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world=bpy.data.worlds.new('Equipment review');scene.world.color=(.23,.23,.23)
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(c.flat('Review ground',(.20,.18,.13)))
bpy.ops.object.camera_add(location=c.xyz((6,6,-9)));camera=bpy.context.object
camera.rotation_euler=(c.xyz((0,.8,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=11;scene.camera=camera
for at,energy in [((2,7,-5),1600),((-5,5,2),1100)]:
    bpy.ops.object.light_add(type='AREA',location=c.xyz(at));light=bpy.context.object;light.data.energy=energy;light.data.size=6
    light.rotation_euler=(c.xyz((0,.5,0))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1500;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'equipment-review.png');bpy.ops.render.render(write_still=True)
print('EXPEDITION_EQUIPMENT',json.dumps(manifest))
