"""Reference mechs: original reference-driven character. Run in isolated Blender 5.1.

No scene replacement occurs in the interactive Blender session. This builder
creates editable components, explicit skin weights, portable PBR maps and a
separate weapon. The user's single image is only used as a visual reference.
"""
import bpy, math, json, random, sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/mech-enemies'
for sub in ['source','exports','textures','preview']: (OUT/sub).mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)
rng=random.Random(707)
PARTS=[]; WEAPON=[]; BONES={}; M={}
scene=bpy.context.scene
character=bpy.data.collections.new('MECH • Tailoring, armor and equipment');scene.collection.children.link(character)
weapon_collection=bpy.data.collections.new('MECH • Belt-fed weapon');scene.collection.children.link(weapon_collection)
current_collection=character

def srgb(c): return tuple((x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4) for x in c)
def noise(size,cells,seed):
    r=np.random.default_rng(seed);g=r.random((cells,cells),dtype=np.float32)
    t=np.arange(size,dtype=np.float32)*cells/size;i=t.astype(np.int32);f=t-i;f=f*f*(3-2*f)
    a=g[i[:,None]%cells,i[None,:]%cells];b=g[i[:,None]%cells,(i[None,:]+1)%cells]
    c=g[(i[:,None]+1)%cells,i[None,:]%cells];d=g[(i[:,None]+1)%cells,(i[None,:]+1)%cells]
    return (a*(1-f[None,:])+b*f[None,:])*(1-f[:,None])+(c*(1-f[None,:])+d*f[None,:])*f[:,None]
def save_image(name,data,color=False):
    # Write explicit 8-bit PNG samples, then reload as a file image. This avoids
    # generated-image color interpretation differing from exported PNG textures.
    import struct,zlib
    h,w=data.shape[:2];pixels=(np.clip(data,0,1)*255+.5).astype(np.uint8)[::-1]
    raw=b''.join(b'\x00'+row.tobytes() for row in pixels)
    def chunk(kind,value):return struct.pack('>I',len(value))+kind+value+struct.pack('>I',zlib.crc32(kind+value)&0xffffffff)
    path=OUT/'textures'/f'{name}.png'
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
    im=bpy.data.images.load(str(path),check_existing=False);im.name=name;im.colorspace_settings.name='sRGB' if color else 'Non-Color';im.pack();return im

def surface(name,kind,base,chip,size=1024,seed=1):
    a=noise(size,7,seed);b=noise(size,31,seed+1);c=noise(size,123,seed+2);fine=noise(size,487,seed+3)
    n=.33*a+.32*b+.23*c+.12*fine
    randoms=np.random.default_rng(seed).random((size,size),dtype=np.float32)
    y,x=np.mgrid[:size,:size]/size
    if kind=='armor':
        wear=np.clip((.20*b+.48*c+.32*fine-.655)*18,0,1)
        wear=np.maximum(wear,(randoms>.9993).astype(np.float32)*.7)
        scratches=(np.sin(x*math.tau*221+2*b)>.999)*(a>.60)
        wear=np.maximum(wear,scratches*.8)
        rough=.43+.22*n+.13*wear;metal=.63-.30*wear;height=.08*n-.19*wear+.004*randoms
    elif kind=='cloth':
        wear=np.clip((.68*a+.32*b-.50)*5,0,1)
        wear=np.where((c>.71)&(a>.53),np.maximum(wear,.65),wear)
        if 'Scarf' in name:wear=np.clip(.20+.40*a+.15*b,0,1)
        rough=.87+.08*c;metal=np.zeros_like(a)
        weave=np.sin(x*math.tau*450)*np.sin(y*math.tau*450)
        height=.07*n+.055*weave+.013*randoms
    else:
        wear=np.clip((.5*b+.5*c-.56)*5,0,1)
        rough=.55+.22*n;metal=np.full_like(a,.05 if kind=='leather' else .88)
        height=.065*n+.022*randoms
    color=np.array(base)[None,None,:]*(1-wear[:,:,None])+np.array(chip)[None,None,:]*wear[:,:,None]
    color*= (.82+.31*n+.10*(randoms-.5))[:,:,None]
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*2.8;dy=(np.roll(height,-1,0)-np.roll(height,1,0))*2.8
    norm=np.stack([-dx,-dy,np.ones_like(a)],axis=2);norm/=np.linalg.norm(norm,axis=2)[:,:,None]
    mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.diffuse_color=(*srgb(base),1)
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bs=nodes.get('Principled BSDF')
    im=nodes.new('ShaderNodeTexImage');im.image=save_image(name+'_BaseColor',color,True);links.new(im.outputs['Color'],bs.inputs['Base Color'])
    im=nodes.new('ShaderNodeTexImage');im.image=save_image(name+'_Normal',norm*.5+.5);nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.65
    links.new(im.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    im=nodes.new('ShaderNodeTexImage');im.image=save_image(name+'_ORM',np.stack([np.ones_like(a),rough,metal],axis=2));sep=nodes.new('ShaderNodeSeparateColor');links.new(im.outputs[0],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    return mat
def plain(name,color,metal=0,rough=.5,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*srgb(color),1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*srgb(color),1);p.inputs['Emission Strength'].default_value=emission
    return m
print('Generating packed portable PBR materials',flush=True)
M['armor']=surface('MECH_Charcoal_ChippedArmor','armor',(.195,.20,.195),(.49,.455,.375),1024,71)
M['tan']=surface('MECH_FadedTan_Panels','armor',(.32,.30,.25),(.12,.128,.128),1024,92)
M['cloth']=surface('MECH_DustCamouflage','cloth',(.135,.125,.099),(.37,.31,.225),1024,176)
M['scarf']=surface('MECH_Weathered_WovenScarf','cloth',(.23,.175,.11),(.44,.34,.23),1024,117)
M['leather']=surface('MECH_Leather_Webbing','leather',(.072,.062,.048),(.245,.19,.125),1024,43)
M['steel']=surface('MECH_Worn_Gunmetal','metal',(.15,.163,.16),(.46,.44,.37),1024,832)
M['edge']=plain('MECH_ExposedBevelSteel',(.285,.277,.239),.86,.39)
M['rubber']=plain('MECH_Matte_Rubber',(.055,.06,.05),.05,.79)
M['black']=plain('MECH_DeepRecess',(.008,.012,.014),.2,.48)
M['glass']=plain('MECH_Smoked_Visor',(.009,.047,.084),.66,.115)
M['blue']=plain('MECH_Cyan_Emitters',(.01,.59,1),.1,.21,5)
M['violet']=plain('MECH_Violet_Plasma',(.49,.006,.94),.05,.24,5)
M['brass']=plain('MECH_Ammunition_Brass',(.53,.355,.15),.78,.31)
M['copper']=plain('MECH_Copper_Projectiles',(.46,.24,.115),.8,.33)
M['ink']=plain('MECH_Faded_Stencil',(.65,.575,.432),.15,.84)
M['thread']=plain('MECH_Exposed_ClothFibres',(.3,.23,.14),0,.93)

def deselect():
    for o in bpy.context.selected_objects:o.select_set(False)
def mesh_uv(o,tile=.32):
    uv=o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
    phase=((sum(map(ord,o.name))*17)%257)/257
    for p in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv=(v[axes[0]]/tile+phase,v[axes[1]]/tile+phase*.731)
def finish(o,name,mat,bone=None,bevel=0,smooth=True):
    o.name=name
    for col in list(o.users_collection):col.objects.unlink(o)
    current_collection.objects.link(o)
    deselect();o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.clear();o.data.materials.append(mat)
    if bevel:
        o.data.materials.append(M['edge']);b=o.modifiers.new('Manufactured edge radius','BEVEL');b.width=bevel;b.segments=3;b.material=1
        bpy.ops.object.modifier_apply(modifier=b.name)
    if smooth:
        for p in o.data.polygons:p.use_smooth=True
    if bevel:
        n=o.modifiers.new('Face-weighted manufacturing normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=50
        bpy.ops.object.modifier_apply(modifier=n.name)
    mesh_uv(o)
    if current_collection==character:
        PARTS.append(o)
        if bone:o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE');o['deformBone']=bone
    else:WEAPON.append(o)
    o.select_set(False);return o
def box(name,at,size,mat,bone=None,bevel=.004,rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.scale=size
    if rotation:o.rotation_euler=rotation
    return finish(o,name,mat,bone,bevel)
def sphere(name,at,size,mat,bone=None,segments=32,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=at);o=bpy.context.object;o.scale=size
    return finish(o,name,mat,bone)
def cyl(name,a,b,r,mat,bone=None,r2=None,vertices=24):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)*.5)
    o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,bone,0,True)
def tube(name,points,r,mat,bone=None,bezier=True):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=r;c.bevel_resolution=1
    if bezier:
        s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
        for bp,p in zip(s.bezier_points,points):bp.co=p;bp.handle_left_type=bp.handle_right_type='AUTO'
    else:
        s=c.splines.new('POLY');s.points.add(len(points)-1)
        for bp,p in zip(s.points,points):bp.co=(*p,1)
    o=bpy.data.objects.new(name,c);current_collection.objects.link(o);deselect();o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    return finish(o,name,mat,bone)
def frame(normal,up=(0,0,1)):
    n=Vector(normal).normalized();u=Vector(up)
    if abs(u.dot(n))>.99:u=Vector((0,1,0))
    u=(u-n*u.dot(n)).normalized();r=u.cross(n).normalized()
    return Matrix((r,u,n)).transposed()
def plate(name,center,outline,thickness,mat,bone,normal=(0,-1,0),bow=.008,bevel=.003):
    basis=frame(normal);c=Vector(center);n=len(outline)
    verts=[]
    for depth,scale in [(-thickness,1),(0,1),(bow,.65)]:
        verts.extend(c+basis@Vector((x*scale,z*scale,depth)) for x,z in outline)
    verts.append(c+basis@Vector((0,0,bow*1.15)))
    faces=[tuple(reversed(range(n)))]
    for ring in range(2):
        for i in range(n):j=(i+1)%n;faces.append((ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i))
    faces.extend((2*n+i,2*n+(i+1)%n,3*n) for i in range(n))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);current_collection.objects.link(o)
    return finish(o,name,mat,bone,bevel)
def screw(at,normal,bone=None,r=.008):
    p=Vector(at);n=Vector(normal).normalized();cyl('Captive hex fastener',p-n*.003,p+n*.004,r,M['edge'],bone,vertices=6)
    basis=frame(n);tube('Fastener drive slot',[p+n*.004+basis@Vector((a,0,0)) for a in (-r*.53,r*.53)],r*.10,M['black'],bone,False)
def label(text,at,size,mat,bone=None,normal=(0,-1,0),up=(0,0,1),font='stencil'):
    c=bpy.data.curves.new(text,'FONT');c.body=text;c.size=size;c.align_x='CENTER';c.align_y='CENTER';c.extrude=.00016;c.space_character=1.04
    try:c.font=bpy.data.fonts.load('C:/Windows/Fonts/STENCIL.TTF' if font=='stencil' else 'C:/Windows/Fonts/bahnschrift.ttf')
    except:pass
    o=bpy.data.objects.new('Marking • '+text,c);current_collection.objects.link(o);o.location=at;o.rotation_euler=frame(normal,up).to_euler()
    deselect();o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return finish(o,'Marking • '+text,mat,bone,0,False)
def ring(name,at,axis,r,minor,mat,bone=None,major_segments=40):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=minor,major_segments=major_segments,minor_segments=8,location=at)
    o=bpy.context.object;o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();return finish(o,name,mat,bone)
def loft(name,points,radii,mat,bone,folds=.004,segments=36,steps=5):
    # Smooth cloth envelope with clustered joint folds; no primitive joints.
    pts=[];rs=[]
    for i in range(len(points)-1):
        for j in range(steps):
            t=j/steps;pts.append(Vector(points[i]).lerp(Vector(points[i+1]),t));rs.append(tuple((1-t)*a+t*b for a,b in zip(radii[i],radii[i+1])))
    pts.append(Vector(points[-1]));rs.append(radii[-1]);verts=[];faces=[]
    axis=(pts[-1]-pts[0]).normalized();right=axis.cross(Vector((0,1,0))).normalized();depth=right.cross(axis).normalized()
    for j,(p,(rx,ry)) in enumerate(zip(pts,rs)):
        t=j/(len(pts)-1)
        envelope=math.sin(math.pi*t)**2
        for i in range(segments):
            a=math.tau*i/segments;f=folds*envelope*(.65*math.sin(t*math.tau*6+math.sin(a*2)*1.8)+.35*math.sin(t*math.tau*11+a*3))
            verts.append(p+right*((rx+f)*math.cos(a))+depth*((ry+f)*math.sin(a)))
    for j in range(len(pts)-1):
        for i in range(segments):k=j*segments+i;l=j*segments+(i+1)%segments;faces.append((k,l,l+segments,k+segments))
    faces.extend([tuple(reversed(range(segments))),tuple(range((len(pts)-1)*segments,len(pts)*segments))])
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);current_collection.objects.link(o)
    return finish(o,name,mat,bone)

