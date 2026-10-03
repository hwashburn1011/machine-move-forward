"""Original repaired canvas canopy; run in isolated background Blender."""
import bpy,bmesh,math,json,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-canopy';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
POSTS=[Vector(p) for p in [(5.5,19.44666679,-1.04),(-3.025,20.03000076,-.78),(6.1875,18.69666711,5.98),(-2.475,19.11333537,6.5)]]
def xyz(p):return Vector((p[0],-p[2],p[1]))
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();kept=[];trim=[]
for old in ['Tailored_hanging_banner001_2','Bridge_maintenance_ladder_upright001','Bridge_maintenance_ladder_upright001_3']:
    obj=bpy.data.objects[old];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    chosen=set()
    for v in obj.data.vertices:
        p=Vector((v.co.x,v.co.z,-v.co.y))
        match=(-3.3<p.x<6.5 and 18.25<p.y<20.4 and -1.3<p.z<6.8) if old.startswith('Tailored') else (old.endswith('_3') or any(abs(p.x-a.x)<.10 and abs(p.z-a.z)<.10 and a.y-.04<p.y<a.y+.06 for a in POSTS))
        if match:chosen.add(v.index)
    assert chosen,old
    for f in obj.data.polygons:
        n=sum(i in chosen for i in f.vertices);assert n in [0,len(f.vertices)],(old,'partial face',f.index)
    before=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in chosen)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in chosen],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert sorted(tuple(v.co) for v in obj.data.vertices)==before
    name=('CanopyRetainedBanner' if old.startswith('Tailored') else 'CanopyRetainedServiceMetal') if before else ''
    obj.data.calc_loop_triangles();trim.append({'original':old,'replacement':name,'removedVertices':len(chosen),'keptVertices':len(before),'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(before).encode()).hexdigest()})
    if name:obj.name=name;kept.append(obj)
for o in list(bpy.context.scene.objects):
    if o not in kept:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedBannerAndServiceMetal.blend'),compress=True)
for o in kept:
    mat=bpy.data.materials.new('Shared_'+o.name);o.data.materials.clear();o.data.materials.append(mat)
    for f in o.data.polygons:f.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-canopy-retained.glb'),export_format='GLB',export_animations=False,export_tangents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0

def material(name,color,metal=0,rough=.85):
    m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;return m
cloth=material('CanopyCanvas',(.4,.32,.23));metal=material('Canopy scuffed hardware',(.20,.205,.18),.8,.53);rope_mat=material('Canopy braided lashing',(.18,.155,.115),0,.92)
nodes=cloth.node_tree.nodes;links=cloth.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Sheen Weight'].default_value=.15
n=1024;v,u=np.mgrid[0:n,0:n]/n;rng=np.random.default_rng(9907)
field=np.zeros((n,n))
for k in range(1,7):field+=np.sin(u*math.tau*(k*2)+.2*k)*np.cos(v*math.tau*(k+1)+.7*k)/(k*6)
edge=np.exp(-np.minimum.reduce([u,1-u,v,1-v])*23)
panels=np.floor(u*5);bleach=.015*np.sin(panels*1.7)
base=np.array([.36,.285,.194])[None,None,:]*(1+field[:,:,None]*.4+rng.normal(0,.014,(n,n,1)))
base+=bleach[:,:,None];base-=edge[:,:,None]*np.array([.06,.055,.044])
# Restrained irregular weather spots and faded run-off, baked into the full
# canvas atlas. Fine woven relief is sampled separately so it does not stretch.
for i in range(42):
    x,y=rng.uniform(.01,.99,2);rx,ry=rng.uniform(.004,.027,2)
    stain=np.exp(-((u-x)/rx)**2-((v-y)/ry)**2)*rng.uniform(.018,.065)
    base-=stain[:,:,None]*np.array([.9,.86,.7])
thread=np.sin(u*math.tau*256)*np.sin(v*math.tau*256)
height=thread*.015
tex={}
for channel in ['Base','ORM','Normal']:
    pixels=np.ones((n,n,4),dtype=np.float32)
    if channel=='Base':pixels[:,:,:3]=np.clip(base,0,1)
    elif channel=='ORM':pixels[:,:,1]=np.clip(.87+field*.09,0,1);pixels[:,:,2]=0
    else:
        pixels[:,:,0]=.5+(np.roll(height,1,1)-np.roll(height,-1,1))*3
        pixels[:,:,1]=.5+(np.roll(height,1,0)-np.roll(height,-1,0))*3;pixels[:,:,2]=.993
    im=bpy.data.images.new('CanopyCanvas '+channel,width=n,height=n);im.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';im.pixels.foreach_set(pixels.ravel());im.pack()
    t=nodes.new('ShaderNodeTexImage');t.image=im;tex[channel]=t
color=nodes.new('ShaderNodeVertexColor');color.layer_name='CanvasTint'
mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;links.new(tex['Base'].outputs['Color'],mix.inputs[1]);links.new(color.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],bsdf.inputs['Base Color'])
sep=nodes.new('ShaderNodeSeparateColor');links.new(tex['ORM'].outputs['Color'],sep.inputs[0]);links.new(sep.outputs[1],bsdf.inputs['Roughness'])
uv=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=24;links.new(uv.outputs['UV'],mapping.inputs[0]);links.new(mapping.outputs[0],tex['Normal'].inputs['Vector'])
normal=nodes.new('ShaderNodeNormalMap');links.new(tex['Normal'].outputs['Color'],normal.inputs['Color']);normal.inputs['Strength'].default_value=.28;links.new(normal.outputs[0],bsdf.inputs['Normal'])
root=bpy.data.objects.new('NomadCanvasCanopy',None);bpy.context.collection.objects.link(root)
center=sum(POSTS,Vector())/4
corners=[a+(Vector((center.x,a.y,center.z))-a).normalized()*.24 for a in POSTS]

def surface(u,v):
    p=corners[0].lerp(corners[1],u).lerp(corners[2].lerp(corners[3],u),v)
    # Catenary-like hems pull inward between anchors. Heavy canvas sags and
    # develops small diagonal wrinkles, rather than sharp cloth simulation folds.
    p.x+=.13*math.sin(v*math.pi)*(2*u-1)
    p.z+=.15*math.sin(u*math.pi)*(1-2*v)
    p.y-=.70*math.sin(u*math.pi)*math.sin(v*math.pi)
    p.y+=.055*math.sin(u*29+v*9)*math.sin(u*math.pi)*math.sin(v*math.pi)
    p.y+=.033*math.sin(v*36+u*7)*math.sin(u*math.pi)*math.sin(v*math.pi)
    return p
def wind(u,v):return min(1,min(math.hypot(u-a,v-b) for a,b in [(0,0),(0,1),(1,0),(1,1)])*7)
def mesh(name,verts,faces,mat,uvs=None,tint=(1,1,1),weights=None):
    m=bpy.data.meshes.new(name);m.from_pydata([xyz(p) for p in verts],[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.parent=root;o.data.materials.append(mat)
    for f in m.polygons:f.use_smooth=True
    if uvs:
        uv=m.uv_layers.new(name='UVMap');co=m.color_attributes.new(name='CanvasTint',type='FLOAT_COLOR',domain='CORNER')
        for f in m.polygons:
            for li in f.loop_indices:
                i=m.loops[li].vertex_index;uv.data[li].uv=uvs[i];co.data[li].color=(*tint,weights[i] if weights else wind(*uvs[i]))
    return o
def patch(name,ua,ub,va,vb,tint=(1,1,1),lift=0,nx=20,ny=12):
    verts=[];uvs=[];faces=[]
    for j in range(ny+1):
        for i in range(nx+1):
            u=ua+(ub-ua)*i/nx;v=va+(vb-va)*j/ny;p=surface(u,v);p.y+=lift;verts.append(p);uvs.append((u,v))
    for j in range(ny):
        for i in range(nx):k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
    return mesh(name,verts,faces,cloth,uvs,tint)
patch('Woven repaired canvas',0,1,0,1,nx=96,ny=80)
# The two-sided canvas has a 3 mm returned hem, not a thick solid rubber sheet.
for a,b,c,d in [(0,.010,0,1),(.990,1,0,1),(0,1,0,.012),(0,1,.988,1)]:patch('Folded perimeter webbing',a,b,c,d,(.67,.68,.66),.004,nx=64 if b-a>.5 else 2,ny=64 if d-c>.5 else 2)
for u in [.20,.40,.60,.80]:patch('Lap sewn canvas panel',u-.002,u+.0035,0,1,(.82,.84,.85),.003,nx=2,ny=80)
repairs=[(.24,.34,.60,.73,(.74,.80,.78)),(.68,.77,.22,.32,(1.12,1.08,.99)),(.42,.53,.37,.41,(.82,.72,.68))]
for ua,ub,va,vb,tint in repairs:patch('Hand repaired canvas patch',ua,ub,va,vb,tint,.007,nx=12,ny=12)
# Corner patches taper into the canvas and distribute the pull of the lashings.
for index,(u,v) in enumerate([(0,0),(1,0),(0,1),(1,1)]):
    su=1 if u==0 else -1;sv=1 if v==0 else -1;uvs=[];verts=[];faces=[];steps=14
    for row in range(steps+1):
        for col in range(steps+1-row):
            uv=(u+su*.095*col/steps,v+sv*.12*row/steps);p=surface(*uv);p.y+=.009;uvs.append(uv);verts.append(p)
    indices={};i=0
    for row in range(steps+1):
        for col in range(steps+1-row):indices[row,col]=i;i+=1
    for row in range(steps):
        for col in range(steps-row):
            faces.append((indices[row,col],indices[row,col+1],indices[row+1,col]))
            if col<steps-row-1:faces.append((indices[row,col+1],indices[row+1,col+1],indices[row+1,col]))
    mesh('Layered corner reinforcement',verts,faces,cloth,uvs,(.60,.63,.63))
def stitch_line(a,b):
    count=max(1,int((surface(*a)-surface(*b)).length/.040));verts=[];uvs=[];faces=[]
    for k in range(count):
        t=k/count;end=min(1,t+.019/max(.001,(surface(*a)-surface(*b)).length))
        u=a[0]+(b[0]-a[0])*t;v=a[1]+(b[1]-a[1])*t;u1=a[0]+(b[0]-a[0])*end;v1=a[1]+(b[1]-a[1])*end
        p=surface(u,v)+Vector((0,.012,0));q=surface(u1,v1)+Vector((0,.012,0));side=(q-p).cross(Vector((0,1,0))).normalized()*.0012
        base=len(verts);verts.extend([p-side,p+side,q+side,q-side]);uvs.extend([(u,v),(u,v),(u1,v1),(u1,v1)]);faces.append(tuple(base+i for i in range(4)))
    mesh('Canvas lock stitching',verts,faces,cloth,uvs,(1.35,1.37,1.37))
for u in [.007,.203,.403,.603,.803,.993]:stitch_line((u,.012),(u,.988))
for v in [.008,.992]:stitch_line((.014,v),(.986,v))
for ua,ub,va,vb,_ in repairs:
    for a,b in [((ua+.002,va+.003),(ub-.002,va+.003)),((ua+.002,vb-.003),(ub-.002,vb-.003)),((ua+.002,va+.003),(ua+.002,vb-.003)),((ub-.002,va+.003),(ub-.002,vb-.003))]:stitch_line(a,b)
def tube(name,a,b,r,mat=metal,n=24):
    a,b=xyz(a),xyz(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.name=name;o.parent=root;o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return o
def loop(name,center,radius,minor,normal=Vector((0,1,0)),mat=metal):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=minor,major_segments=32,minor_segments=8,location=xyz(center));o=bpy.context.object;o.name=name;o.parent=root;o.rotation_mode='QUATERNION';o.rotation_quaternion=xyz(normal).to_track_quat('Z','Y');o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=True
    return o
for i,p in enumerate(POSTS):
    corner=corners[i];along=(corner-p).normalized()
    tube('Fitted pole clamp',p-Vector((0,.045,0)),p+Vector((0,.05,0)),.071)
    loop('Clevis eye on clamp',p+along*.083+Vector((0,.005,0)),.023,.007,normal=Vector((-along.z,0,along.x)))
    # A visible webbing loop curls around a thimble at the corner. It does not
    # require punching a fictitious opaque hole into the sheet.
    loop('Corner lashing thimble',corner+Vector((0,.022,0)),.027,.006)
    uv=[(0,0),(1,0),(0,1),(1,1)][i];du=.025 if uv[0]==0 else -.025;dv=.027 if uv[1]==0 else -.027
    end=surface(uv[0]+du,uv[1]+dv);end.y+=.025
    # Folded webbing follows the cloth into a loop around the thimble. Both
    # ends lie on the corner patch rather than forming a floating straight rod.
    mid=(corner+end)/2;mid.y=surface(uv[0]+du*.5,uv[1]+dv*.5).y+.013
    width=Vector((-(end-corner).z,0,(end-corner).x)).normalized()*.020
    path=[end-Vector((0,.012,0)),mid,corner+Vector((0,.014,0)),corner-along*.028+Vector((0,.032,0)),corner+Vector((0,.051,0)),mid+Vector((0,.007,0)),end-Vector((0,.004,0))]
    vertices=[p+side*width for p in path for side in [-1,1]]
    mesh('Folded corner webbing loop',vertices,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(len(path)-1)],rope_mat)
    a=p+along*.108+Vector((0,.008,0));b=corner-along*.025+Vector((0,.022,0))
    tube('Captive threaded tensioner',a,b,.009)
    mid=(a+b)/2;tube('Tensioner hex barrel',mid-along*.032,mid+along*.032,.018,metal,6)
    for side in [-1,1]:loop('Tensioner locknut',mid+along*.040*side,.011,.004,normal=along)
    marker=bpy.data.objects.new('CanvasAnchor'+str(i+1),None);bpy.context.collection.objects.link(marker);marker.parent=root;marker.location=xyz(corner)

for o in list(root.children_recursive):
    if o.type!='MESH':continue
    if not o.data.uv_layers:
        uv=o.data.uv_layers.new(name='UVMap')
        for f in o.data.polygons:
            for li in f.loop_indices:
                p=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(p.x,p.y)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    if o.data.materials[0]==cloth:
        # Separate open patches can wind differently; the runtime cloth is
        # double-sided. Keep all studio-facing normals consistently upward.
        bm=bmesh.new();bm.from_mesh(o.data)
        for f in bm.faces:
            if f.normal.z<0:f.normal_flip()
        bm.to_mesh(o.data);bm.free()
    tri=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-10],context='FACES_ONLY');bm.to_mesh(o.data);bm.free();o.data.update()
editable=sum(o.type=='MESH' for o in root.children_recursive)
scene=bpy.context.scene;scene.name='Nomad tensioned canvas';scene.world=bpy.data.worlds.new('Canopy studio');scene.world.color=(.18,.18,.18)
target=xyz((1.5,18.9,2.5));bpy.ops.object.camera_add(location=xyz((12,26,13)));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=13;scene.camera=cam
for pos,energy,size in [((8,29,5),7000,8),((-8,24,-3),5000,7)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(pos));o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'canopy-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadCanvasCanopy.blend'),compress=True);bpy.ops.render.render(write_still=True)
cam.location=xyz((7,21,1));target=xyz(corners[0]+Vector((-.55,0,.55)));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=2.6;scene.render.filepath=str(OUT/'canopy-detail.png');bpy.ops.render.render(write_still=True)
for mat in [cloth,metal,rope_mat]:
    meshes=[o for o in root.children_recursive if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=mat.name.replace(' ','_')
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-canopy.glb'),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True,export_vertex_color='NAME',export_vertex_color_name='CanvasTint',export_all_vertex_colors=False)
meshes=[o for o in root.children_recursive if o.type=='MESH']
for o in meshes:o.data.calc_loop_triangles()
report={'trim':trim,'posts':[list(p) for p in POSTS],'corners':[list(p) for p in corners],'minimumCanvasY':min(surface(i/96,j/80).y for i in range(97) for j in range(81)),'deckY':16.03,'editableParts':editable,'batches':len(meshes),'triangles':sum(len(o.data.loop_triangles) for o in meshes),'bytes':(ART/'nomad-canopy.glb').stat().st_size,'provenance':'Original Blender geometry and procedural canvas maps. Practical construction references: Sailrite canvas repair and boom-tent tutorials; no downloaded assets or branding.'}
# A modest grid follows the shape for camera sweeps only. Offset below the
# cloth includes maximum downward wind travel and interpolation tolerances.
camera={'columns':24,'rows':20,'points':[list(surface(i/24,j/20)-Vector((0,.05,0))) for j in range(21) for i in range(25)]}
(ART/'nomad-canopy-camera.json').write_text(json.dumps(camera,separators=(',',':')))
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));(ART/'nomad-canopy.json').write_text(json.dumps(report,indent=2));print('CANOPY_COMPLETE',json.dumps(report),flush=True)
