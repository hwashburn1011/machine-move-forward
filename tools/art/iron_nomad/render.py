"""Reference review studio: renders never overwrite the editable asset master."""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/iron-nomad'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'source/IronNomad_Master.blend'))
scene=bpy.context.scene
scene.name='Iron Nomad - reference review'
stage=bpy.data.collections.new('REVIEW ONLY - sand lights smoke');scene.collection.children.link(stage)
def link(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    stage.objects.link(o);return o
def material(name,color,rough=.8):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
sand=material('Review warm desert',(.25,.155,.082),.94)
nodes,links=sand.node_tree.nodes,sand.node_tree.links
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4.5;noise.inputs['Detail'].default_value=3
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.55;bump.inputs['Distance'].default_value=.12
links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes['Principled BSDF'].inputs['Normal'])
bpy.ops.mesh.primitive_grid_add(x_subdivisions=160,y_subdivisions=160,size=2400,location=(0,0,-.12))
floor=link(bpy.context.object);floor.name='Review desert floor';floor.data.materials.append(sand)
for v in floor.data.vertices:
    x,y=v.co.x,v.co.y
    fade=min(1,max(0,(abs(x)+abs(y)-24)/30))
    v.co.z+=fade*(math.sin(x*.12+y*.09)*.8+math.sin(y*.28-x*.07)*.3)
for p in floor.data.polygons:p.use_smooth=True
world=bpy.data.worlds.new('Desert late afternoon');world.use_nodes=True;scene.world=world
n=world.node_tree.nodes;l=world.node_tree.links
sky=n.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=.18;sky.sun_rotation=2.6;sky.altitude=.3;sky.air_density=1.2;sky.aerosol_density=2.0
l.new(sky.outputs['Color'],n['Background'].inputs['Color']);n['Background'].inputs['Strength'].default_value=.22
path=n.new('ShaderNodeLightPath');camera_bg=n.new('ShaderNodeBackground');camera_bg.inputs['Color'].default_value=(.28,.31,.34,1);camera_bg.inputs['Strength'].default_value=.55;mix=n.new('ShaderNodeMixShader');l.new(path.outputs['Is Camera Ray'],mix.inputs[0]);l.new(n['Background'].outputs[0],mix.inputs[1]);l.new(camera_bg.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],n['World Output'].inputs['Surface'])
def light(name,kind,at,energy,color,size=1,target=(0,0,13)):
    d=bpy.data.lights.new(name,kind);d.energy=energy;d.color=color
    if kind=='AREA':d.shape='DISK';d.size=size
    elif kind=='POINT':d.shadow_soft_size=size
    o=bpy.data.objects.new(name,d);stage.objects.link(o);o.location=at
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
light('Warm sunset key','AREA',(8,-32,33),12000,(1,.70,.43),18)
light('Cool sky fill','AREA',(-30,-10,27),9000,(.53,.72,1),24)
light('Sun rim','AREA',(15,27,23),18000,(1,.67,.32),15)
for x in [-5,0,5]:
    for y in [-7,-1,4]:light('Interior warm worklight','POINT',(x,y,16.95),65,(1,.42,.12),.16)
for x,y,z in [(-6.2,-10.7,20),(-3.65,-10.8,16),(9.8,-7,14),(9.8,4,14)]:light('Blue emissive spill','POINT',(x,y,z),32,(.05,.52,1),.18)

# Dense, noise-modulated volume lofts create wind-blown plumes. They are review FX;
# the portable model exports Exhaust_A/B anchors for the engine's particle system.
smoke=bpy.data.materials.new('Review industrial exhaust volume');smoke.use_nodes=True
n=smoke.node_tree.nodes;n.clear();l=smoke.node_tree.links
out=n.new('ShaderNodeOutputMaterial');vol=n.new('ShaderNodeVolumePrincipled');vol.inputs['Color'].default_value=(.055,.043,.033,1);vol.inputs['Anisotropy'].default_value=.2
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3.0;noise.inputs['Detail'].default_value=5;noise.inputs['Roughness'].default_value=.7
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.30;ramp.color_ramp.elements[0].color=(0,0,0,1);ramp.color_ramp.elements[1].position=.72;ramp.color_ramp.elements[1].color=(1.2,1.2,1.2,1)
l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs['Color'],vol.inputs['Density']);l.new(vol.outputs['Volume'],out.inputs['Volume'])
# Fade each turbulent billow to transparent at its ellipsoidal boundary.
coord=n.new('ShaderNodeTexCoord');dist=n.new('ShaderNodeVectorMath');dist.operation='DISTANCE';dist.inputs[1].default_value=(.5,.5,.5)
l.new(coord.outputs['Generated'],dist.inputs[0]);edge=n.new('ShaderNodeMapRange');edge.inputs['From Min'].default_value=.24;edge.inputs['From Max'].default_value=.50;edge.inputs['To Min'].default_value=1;edge.inputs['To Max'].default_value=0
l.new(dist.outputs['Value'],edge.inputs['Value']);density=n.new('ShaderNodeMath');density.operation='MULTIPLY';l.new(ramp.outputs['Color'],density.inputs[0]);l.new(edge.outputs['Result'],density.inputs[1]);l.new(density.outputs[0],vol.inputs['Density'])
noise.inputs['Scale'].default_value=6.5
vol.inputs['Color'].default_value=(.02,.017,.013,1)
for j in range(2):
    base=25.72 if j==0 else 24.82;yy=3 if j==0 else 7.1
    for i in range(16):
        t=i/15;r=.95+2.1*t
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=1,location=(3.8-7*t*t+math.sin(i*1.3)*.32,yy+1.7*t+math.cos(i*1.1)*.28,base+.7+i*.53))
        o=link(bpy.context.object);o.name='Review turbulent smoke billow';o.scale=(r*(1+.12*math.sin(i*1.3)),r,r*.85);o.data.materials.append(smoke)

camera_data=bpy.data.cameras.new('Reference camera');camera=bpy.data.objects.new('Reference camera',camera_data);stage.objects.link(camera);scene.camera=camera
views={
 'hero':((56,-49,16),(0,0,14),52,(1440,1800)),
 'front':((1,-37,19),(0,-2,17),54,(1600,1300)),
 'banner':((30,-8,20),(5,0,16),54,(1500,1400)),
 'leg':((21,-24,9),(7.7,-6.4,5.7),58,(1400,1600)),
 'rear':((-34,41,23),(0,0,13.5),54,(1440,1800)),
 'top':((25,-27,36),(0,0,18),52,(1600,1300)),
}
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hero'
position,target,lens,res=views[mode];camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=lens
scene.render.engine='CYCLES';scene.cycles.samples=64 if mode=='hero' else 48;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.cycles.max_bounces=7;scene.cycles.volume_bounces=1
scene.render.resolution_x=res[0];scene.render.resolution_y=res[1];scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'preview'/f'{mode}.png')
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.05
ng=bpy.data.node_groups.new('Nomad review compositor','CompositorNodeTree');ng.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');scene.compositing_node_group=ng;n=ng.nodes;l=ng.links
rl=n.new('CompositorNodeRLayers');glare=n.new('CompositorNodeGlare');glare.inputs['Type'].default_value='Fog Glow';glare.inputs['Quality'].default_value='High';glare.inputs['Threshold'].default_value=2.0;glare.inputs['Strength'].default_value=.3
comp=n.new('NodeGroupOutput');l.new(rl.outputs['Image'],glare.inputs['Image']);l.new(glare.outputs['Image'],comp.inputs['Image'])
bpy.context.preferences.filepaths.save_version=0
if mode=='hero':bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/IronNomad_Review.blend'))
bpy.ops.render.render(write_still=True)
print('IRON NOMAD RENDER COMPLETE',mode,flush=True)
