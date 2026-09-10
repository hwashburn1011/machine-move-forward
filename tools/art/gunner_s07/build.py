"""S-07: original reference-driven character. Run in isolated Blender 5.1.

No scene replacement occurs in the interactive Blender session. This builder
creates editable components, explicit skin weights, portable PBR maps and a
separate weapon. The user's single image is only used as a visual reference.
"""
import bpy, math, json, random, sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/gunner-s07'
for sub in ['source','exports','textures','preview']: (OUT/sub).mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)
rng=random.Random(707)
PARTS=[]; WEAPON=[]; BONES={}; M={}
scene=bpy.context.scene
character=bpy.data.collections.new('S07 • Tailoring, armor and equipment');scene.collection.children.link(character)
weapon_collection=bpy.data.collections.new('S07 • Belt-fed weapon');scene.collection.children.link(weapon_collection)
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
M['armor']=surface('S07_Charcoal_ChippedArmor','armor',(.16,.151,.131),(.58,.48,.34),2048,71)
M['tan']=surface('S07_FadedTan_Panels','armor',(.39,.32,.235),(.13,.125,.112),1024,92)
M['cloth']=surface('S07_DustCamouflage','cloth',(.135,.125,.099),(.37,.31,.225),2048,176)
M['scarf']=surface('S07_Weathered_WovenScarf','cloth',(.23,.175,.11),(.44,.34,.23),1024,117)
M['leather']=surface('S07_Leather_Webbing','leather',(.072,.062,.048),(.245,.19,.125),1024,43)
M['steel']=surface('S07_Worn_Gunmetal','metal',(.15,.163,.16),(.46,.44,.37),1024,832)
M['edge']=plain('S07_ExposedBevelSteel',(.285,.277,.239),.86,.39)
M['rubber']=plain('S07_Matte_Rubber',(.055,.06,.05),.05,.79)
M['black']=plain('S07_DeepRecess',(.008,.012,.014),.2,.48)
M['glass']=plain('S07_Smoked_Visor',(.009,.047,.084),.66,.115)
M['blue']=plain('S07_Cyan_Emitters',(.01,.59,1),.1,.21,5)
M['violet']=plain('S07_Violet_Plasma',(.49,.006,.94),.05,.24,5)
M['brass']=plain('S07_Ammunition_Brass',(.53,.355,.15),.78,.31)
M['copper']=plain('S07_Copper_Projectiles',(.46,.24,.115),.8,.33)
M['ink']=plain('S07_Faded_Stencil',(.65,.575,.432),.15,.84)
M['thread']=plain('S07_Exposed_ClothFibres',(.3,.23,.14),0,.93)

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
def sphere(name,at,size,mat,bone=None,segments=40,rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=at);o=bpy.context.object;o.scale=size
    return finish(o,name,mat,bone)
def cyl(name,a,b,r,mat,bone=None,r2=None,vertices=24):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)*.5)
    o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,bone,0,True)
def tube(name,points,r,mat,bone=None,bezier=True):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=r;c.bevel_resolution=2
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

print('Sculpting tailored under-suit and load-bearing frame',flush=True)
# Rest skeleton. All armor is explicitly weighted; cloth spans joints below.
def bone(name,head,tail,parent=None):BONES[name]=(Vector(head),Vector(tail),parent)
bone('root',(0,0,0),(0,0,.18));bone('pelvis',(0,0,.97),(0,0,1.13),'root')
bone('spine_01',(0,0,1.13),(0,0,1.38),'pelvis');bone('spine_02',(0,0,1.38),(0,0,1.65),'spine_01')
bone('neck_01',(0,0,1.65),(0,0,1.78),'spine_02');bone('head',(0,0,1.78),(0,0,2.08),'neck_01')
for s,side in [(-1,'r'),(1,'l')]:
    bone('clavicle_'+side,(0,0,1.61),(s*.345,0,1.61),'spine_02')
    bone('upperarm_'+side,(s*.345,0,1.61),(s*.49,-.015,1.30),'clavicle_'+side)
    bone('lowerarm_'+side,(s*.49,-.015,1.30),(s*.59,-.065,1.035),'upperarm_'+side)
    bone('hand_'+side,(s*.59,-.065,1.035),(s*.625,-.095,.925),'lowerarm_'+side)
    bone('thigh_'+side,(s*.15,0,1.01),(s*.18,-.016,.565),'pelvis')
    bone('calf_'+side,(s*.18,-.016,.565),(s*.19,.01,.15),'thigh_'+side)
    bone('foot_'+side,(s*.19,.01,.15),(s*.19,-.18,.095),'calf_'+side)
    bone('ball_'+side,(s*.19,-.18,.095),(s*.19,-.29,.08),'foot_'+side)
loft('Anatomical torso in patterned fabric',[(0,0,1.02),(0,0,1.15),(0,0,1.39),(0,0,1.58),(0,0,1.66)],[(.21,.15),(.215,.165),(.275,.18),(.29,.155),(.18,.12)],M['cloth'],'spine_02',.005,48,7)
loft('Flexible armored abdomen',[(0,-.002,1.01),(0,-.01,1.13),(0,-.015,1.30)],[(.22,.17),(.225,.177),(.247,.18)],M['rubber'],'spine_01',.005,48,6)
for z in np.linspace(1.08,1.25,5):
    plate('Overlapping abdominal armor',(0,-.175,float(z)),[(-.215,-.025),(.215,-.025),(.228,.021),(.11,.031),(-.14,.031),(-.228,.01)],.009,M['armor'],'spine_01',bow=.011)
for s,side in [(-1,'r'),(1,'l')]:
    upper='upperarm_'+side;lower='lowerarm_'+side;thigh='thigh_'+side;calf='calf_'+side
    loft('Wrinkled combat sleeve '+side,[(s*.335,0,1.60),(s*.40,0,1.49),(s*.46,-.01,1.37),(s*.49,-.015,1.29)],[(.12,.12),(.127,.128),(.112,.108),(.096,.098)],M['cloth'],upper,.012,40,7)
    loft('Gauntlet under-sleeve '+side,[(s*.49,-.015,1.30),(s*.54,-.04,1.17),(s*.59,-.065,1.035)],[(.097,.097),(.109,.103),(.074,.077)],M['cloth'],lower,.010,40,8)
    sphere('Elbow articulated under-layer '+side,(s*.49,-.015,1.30),(.09,.09,.095),M['rubber'],lower,32,20)
    loft('Cargo trousers tailored leg '+side,[(s*.14,0,1.06),(s*.16,.005,.92),(s*.18,-.006,.71),(s*.18,-.016,.565)],[(.135,.15),(.147,.148),(.127,.132),(.095,.105)],M['cloth'],thigh,.012,44,8)
    loft('Folded gaiter '+side,[(s*.18,-.016,.565),(s*.185,.02,.39),(s*.19,.01,.17)],[(.094,.102),(.11,.117),(.073,.083)],M['cloth'],calf,.009,40,8)
    # Feet are inferred from the cropped reference, with full tread and lacing.
    # Rounded boot last: broad toe, narrow heel, sloped vamp and soft ankle.
    outline=[(-.056,-.257),(.056,-.257),(.084,-.218),(.083,-.139),(.069,.057),(.046,.086),(-.046,.086),(-.069,.057),(-.083,-.139),(-.084,-.218)]
    verts=[];faces=[];nr=len(outline)
    for z,scale,ycompress in [(.045,1,1),(.068,1.01,1),(.11,.96,.98),(.151,.91,.86),(.20,.82,.45),(.245,.74,.30)]:
        for x,y in outline:verts.append((s*.19+x*scale,y*ycompress+.005,z))
    for j in range(5):
        for i in range(nr):k=j*nr+i;n=j*nr+(i+1)%nr;faces.append((k,n,n+nr,k+nr))
    faces.extend([tuple(reversed(range(nr))),tuple(range(5*nr,6*nr))])
    me=bpy.data.meshes.new('Anatomical boot last');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('Rounded combat boot '+side,me);current_collection.objects.link(ob)
    finish(ob,ob.name,M['leather'],'foot_'+side,.011)
    verts=[(s*.19+x*1.035,y+.005,z) for z in (.018,.056) for x,y in outline];faces=[tuple(reversed(range(nr))),tuple(range(nr,nr*2))]
    for i in range(nr):faces.append((i,(i+1)%nr,(i+1)%nr+nr,i+nr))
    me=bpy.data.meshes.new('Shaped rubber outsole');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('Rounded outsole '+side,me);current_collection.objects.link(ob);finish(ob,ob.name,M['rubber'],'foot_'+side,.006)
    for j in range(6):
        y=-.218+j*.051
        for dx in (-.051,.051):box('Offset sole lug '+side,(s*.19+dx,y,.017),(.052,.026,.019),M['rubber'],'foot_'+side,.006,rotation=(0,0,(-1 if dx<0 else 1)*.25))
    tube('Raised toe welt '+side,[(s*.19-.079,-.19,.09),(s*.19-.052,-.253,.092),(s*.19+.052,-.253,.092),(s*.19+.079,-.19,.09)],.009,M['rubber'],'foot_'+side)
    for j in range(5):
        y=-.163+j*.033;z=.167+j*.014
        tube('Crossed boot lace '+side,[(s*.19-.053,y,z),(s*.19+.05,y+.027,z)],.003,M['thread'],'foot_'+side,False)
        tube('Crossed boot lace '+side,[(s*.19+.053,y,z),(s*.19-.05,y+.027,z)],.003,M['thread'],'foot_'+side,False)

print('Building layered torso, shoulders and armored joints',flush=True)
chest=[(-.21,-.17),(.21,-.17),(.25,-.10),(.245,.095),(.18,.17),(.09,.178),(.055,.125),(-.055,.125),(-.09,.178),(-.18,.17),(-.245,.095),(-.25,-.1)]
plate('Ballistic carrier recessed backing',(0,-.18,1.47),[(x*1.07,z*1.05) for x,z in chest],.021,M['rubber'],'spine_02',bow=.015)
plate('Main formed chest cuirass',(0,-.20,1.47),chest,.022,M['armor'],'spine_02',bow=.023,bevel=.006)
for s in (-1,1):
    plate('Raised chest panel',(s*.115,-.231,1.47),[(-.083,-.12),(.083,-.12),(.082,.10),(.025,.13),(-.081,.09)],.012,M['tan'],'spine_02',bow=.009)
    for z in (1.365,1.445,1.54):screw((s*.18,-.252,z),(0,-1,0),'spine_02',.007)
    tube('Shoulder harness webbing',[(s*.18,.12,1.60),(s*.22,-.015,1.68),(s*.22,-.198,1.59),(s*.23,-.22,1.40),(s*.27,-.15,1.16)],.020,M['leather'],'spine_02')
    for z in (1.58,1.30):
        box('Harness buckle frame',(s*.245,-.227,z),(.069,.022,.071),M['steel'],'spine_02',.005)
        box('Harness buckle inset',(s*.245,-.241,z),(.046,.007,.046),M['black'],'spine_02',.003)
        box('Buckle tongue',(s*.245,-.247,z),(.011,.007,.038),M['edge'],'spine_02',.002)
    for j in range(4):
        z=1.365+j*.052
        tube('Side armor webbing',[(s*.245,-.13,z),(s*.28,0,z),(s*.25,.14,z)],.014,M['leather'],'spine_02')
        screw((s*.266,-.12,z),(s*.7,-.7,0),'spine_02',.006)
label('S-07  /  SUPPORT',(0,-.26,1.405),.015,M['ink'],'spine_02',font='plain')
box('Upper chest service module',(-.05,-.255,1.58),(.09,.027,.065),M['armor'],'spine_02',.006)
for i in range(3):box('Chest module status',(-.077+i*.023,-.272,1.59),(.012,.006,.004),M['blue'],'spine_02',.001)
for s,side in [(-1,'r'),(1,'l')]:
    upper='upperarm_'+side;lower='lowerarm_'+side
    normal=(s*.44,-.88,.15)
    outline=[(-.12,-.125),(.115,-.115),(.15,-.025),(.135,.084),(.055,.128),(-.06,.13),(-.14,.075),(-.16,-.005)]
    plate('Shoulder pad suspension '+side,(s*.364,-.031,1.59),[(x*1.1,z*1.08) for x,z in outline],.025,M['rubber'],upper,normal,.028,.006)
    plate('S07 overlapping shoulder shell '+side,(s*.375,-.059,1.606),outline,.02,M['armor'],upper,normal,.039,.006)
    basis=frame(normal);at=Vector((s*.375,-.059,1.606))
    for x,z in [(-.105,.073),(.107,.061),(-.108,-.081),(.09,-.077)]:screw(at+basis@Vector((x,z,.025)),normal,upper,.007)
    if s==-1:
        mark=at+basis@Vector((0,-.012,.056))
        for k,line in enumerate(['S-07','WE END','WHAT OTHERS','LEAVE BEHIND']):
            label(line,mark+basis@Vector((0,-k*.027,0)),.031 if k==0 else .018,M['ink'],upper,normal)
        # Construct the reference's angular branch insignia as inlaid metal.
        for sign in (-1,1):
            for j in range(3):
                local=[(sign*.008,.025+j*.017),(sign*(.022+j*.012),.062+j*.012),(sign*(.033+j*.012),.06+j*.012),(sign*.013,.012+j*.017)]
                plate('Branch insignia',at+basis@Vector((0,.028,.055)),local,.0007,M['ink'],upper,normal,0,0)
    for j in range(2):
        plate('Shoulder lower articulated lame '+side,(s*(.40+j*.027),-.083,1.46-j*.055),[(-.085,-.028),(.085,-.028),(.10,.025),(.04,.048),(-.08,.032)],.013,M['armor'],upper,(s*.32,-.9,0),.012,.003)
    plate('Elbow hard point '+side,(s*.49,.071,1.30),[(-.077,-.06),(.077,-.06),(.086,.025),(.038,.075),(-.05,.067)],.015,M['armor'],lower,(0,1,0),.023,.005)
    plate('Forearm bracer '+side,(s*.548,-.139,1.18),[(-.072,-.117),(.064,-.107),(.088,.095),(.06,.13),(-.055,.127),(-.09,.075)],.014,M['armor'],lower,(0,-1,.04),.015,.005)
    for j in range(3):
        box('Gauntlet reinforcement rib '+side,(s*.549,-.163,1.11+j*.055),(.123,.018,.017),M['steel'],lower,.004)
    for x in (-.052,.052):
        for z in (1.08,1.27):screw((s*.548+x,-.169,z),(0,-1,0),lower,.006)
    wrist=Vector((s*.59,-.065,1.043));axis=Vector((s*.1,-.05,-.265)).normalized()
    for j in range(3):ring('Wrist dust seal',wrist-axis*(j*.012),axis,.079,.006,M['rubber'],lower,32)

print('Articulating gloves and reinforced leg armor',flush=True)
for s,side in [(-1,'r'),(1,'l')]:
    hand='hand_'+side;thigh='thigh_'+side;calf='calf_'+side
    palm=Vector((s*.62,-.085,.983))
    glove=sphere('Sculpted glove palm '+side,palm,(.069,.037,.076),M['leather'],hand,32,20)
    plate('Glove metacarpal armor '+side,palm+Vector((0,-.038,.005)),[(-.052,-.043),(.05,-.04),(.056,.042),(.034,.058),(-.04,.052)],.007,M['armor'],hand,bow=.010,bevel=.004)
    for j,length in enumerate([.068,.087,.088,.072]):
        x=s*(.62+(j-1.5)*.028);p=Vector((x,-.086,.94));parent=hand
        points=[p,p+Vector((s*.002,-.003,-length*.44)),p+Vector((s*.003,-.014,-length*.78)),p+Vector((s*.002,-.027,-length))]
        for k in range(3):
            name=f'finger_{j+1:02}_{k+1:02}_{side}';bone(name,points[k],points[k+1],parent);parent=name
            cyl('Glove finger segment',points[k],points[k+1],.014-(k*.0015),M['leather'],name,r2=.012-(k*.001))
            sphere('Finger articulation',points[k],(.015,.015,.015),M['rubber'],name,16,10)
            plate('Segmented knuckle shield',points[k]+Vector((0,-.014,-.011)),[(-.011,-.013),(.011,-.013),(.012,.010),(-.011,.013)],.003,M['steel'],name,bow=.002,bevel=.002)
    points=[palm+Vector((-s*.062,0,.017)),palm+Vector((-s*.092,-.012,-.008)),palm+Vector((-s*.10,-.038,-.034))]
    for k in range(2):
        bn=f'thumb_{k+1:02}_{side}';bone(bn,points[k],points[k+1],hand if k==0 else f'thumb_01_{side}')
        cyl('Thumb glove',points[k],points[k+1],.021-k*.002,M['leather'],bn,r2=.018-k*.002)
        sphere('Thumb joint',points[k],(.022,.022,.022),M['rubber'],bn,20,12)
    plate('Thigh armor floating backing '+side,(s*.185,-.122,.824),[(-.108,-.19),(.09,-.17),(.118,.12),(.07,.18),(-.094,.168),(-.12,.09)],.017,M['rubber'],thigh,bow=.015,bevel=.004)
    plate('Formed thigh armor '+side,(s*.185,-.147,.824),[(-.096,-.175),(.078,-.165),(.11,.122),(.059,.16),(-.086,.148),(-.103,.09)],.021,M['armor'],thigh,bow=.025,bevel=.005)
    for z in (.72,.96):
        for x in (-.075,.075):screw((s*.185+x,-.182,z),(0,-1,0),thigh,.008)
    plate('Knee seal '+side,(s*.18,-.115,.566),[(-.091,-.099),(.091,-.099),(.109,.04),(.057,.105),(-.062,.098),(-.108,.038)],.016,M['rubber'],calf,bow=.021)
    plate('Patella impact plate '+side,(s*.18,-.145,.566),[(-.077,-.078),(.07,-.075),(.09,.036),(.044,.082),(-.051,.078),(-.093,.025)],.026,M['armor'],calf,bow=.029,bevel=.008)
    plate('Knee crown raised facet '+side,(s*.18,-.183,.581),[(-.048,-.025),(.045,-.025),(.041,.038),(-.043,.038)],.007,M['tan'],calf,bow=.004)
    for x in (-.092,.092):cyl('Knee hinge spindle',(s*.18+x*.8,0,.566),(s*.18+x*1.17,0,.566),.031,M['steel'],calf,vertices=24)
    plate('Tapered shin armor '+side,(s*.19,-.11,.325),[(-.071,-.14),(.073,-.14),(.101,.135),(.054,.175),(-.06,.17),(-.103,.12)],.021,M['armor'],calf,bow=.023,bevel=.005)
    plate('Shin medial rib '+side,(s*.19,-.143,.335),[(-.018,-.13),(.018,-.13),(.024,.115),(-.027,.14)],.008,M['steel'],calf,bow=.008,bevel=.003)
    for z in (.235,.44):
        for x in (-.059,.059):screw((s*.19+x,-.151,z),(0,-1,0),calf,.006)
    for j in range(5):
        z=.58+j*.014;tube('Rear knee flexible rib',[(s*.18-.07,.076,z),(s*.18,.096,z),(s*.18+.07,.076,z)],.005,M['rubber'],calf)
    # Double seams and individual reinforcement stitches.
    for dx in (-.119,.119):
        tube('Trouser double seam',[(s*.17+dx,.012,.97),(s*.18+dx*.9,.012,.81),(s*.18+dx*.75,.015,.64)],.0018,M['thread'],thigh)
    for j in range(16):
        z=.67+j*.018;tube('Tailoring stitch',[(s*.294,-.006,z),(s*.294,-.014,z+.007)],.0008,M['thread'],thigh,False)

# Belt, individual padded pouches and hanging retention hardware.
ring('Load-bearing waist belt',(0,0,1.115),(0,0,1),.224,.023,M['leather'],'pelvis',64).scale.y=.77
for x in (-.25,-.13,0,.13,.25):
    y=-.18 if abs(x)<.20 else -.112
    box('Padded ammunition pouch',(x,y-.042,1.09),(.105,.096,.173),M['cloth'],'pelvis',.014)
    plate('Pouch folded storm flap',(x,y-.095,1.147),[(-.049,-.035),(.048,-.035),(.053,.034),(-.05,.037)],.008,M['leather'],'pelvis',bow=.006,bevel=.004)
    box('Pouch retention webbing',(x,y-.099,1.066),(.024,.009,.105),M['leather'],'pelvis',.003)
    screw((x,y-.111,1.101),(0,-1,0),'pelvis',.006)
    tube('Stitched pouch margin',[(x-.046,y-.103,1.035),(x-.046,y-.103,1.126),(x+.046,y-.103,1.126),(x+.046,y-.103,1.035)],.0012,M['thread'],'pelvis',False)
for s in (-1,1):
    ring('Equipment D ring',(s*.262,-.12,1.0),(0,-1,0),.022,.004,M['steel'],'pelvis',24)
    tube('Hanging quick release tether',[(s*.26,-.11,1.04),(s*.29,-.09,.91),(s*.31,-.065,.95)],.009,M['leather'],'pelvis')

print('Tailoring folded scarf and actual torn cloth surfaces',flush=True)
def cloth_object(name,verts,faces,bone_name,thickness=.0018):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);current_collection.objects.link(o)
    deselect();o.select_set(True);bpy.context.view_layer.objects.active=o
    sol=o.modifiers.new('Woven cloth thickness','SOLIDIFY');sol.thickness=thickness;bpy.ops.object.modifier_apply(modifier=sol.name)
    return finish(o,name,M['scarf'],bone_name)
verts=[];faces=[];N=112;K=18
for j in range(K):
    v=j/(K-1)
    for i in range(N):
        a=math.tau*i/N;rad=.016*math.sin(v*math.tau*3+a*1.7)+.009*math.cos(a*7+v*4)
        verts.append(((.225+rad)*math.sin(a),-(.166+rad)*math.cos(a),1.74+(v-.5)*.15-.065*(1+math.cos(a))/2+.012*math.sin(a*3+v*7)))
for j in range(K-1):
    for i in range(N):a=j*N+i;b=j*N+(i+1)%N;faces.append((a,b,b+N,a+N))
cloth_object('Layered folded neck scarf',verts,faces,'neck_01')
U=85;V=48;verts=[];faces=[]
def cape(u,v):
    rag=(.025*math.sin(u*109)+.043*math.sin(u*53+.6))*(v**12)
    return ((u-.5)*(.57+.49*v)+.93*v**1.30,-.025+.14*v+.085*math.sin(u*math.tau*3+v*5)*(.3+v)+.13*v*v,1.74-.62*v+.033*math.sin(u*21+v*4)*v+rag)
for j in range(V):
    for i in range(U):verts.append(cape(i/(U-1),j/(V-1)))
holes=[(.10,.82,.025,.08),(.75,.87,.035,.06),(.41,.94,.017,.10),(.95,.61,.035,.09),(.65,.96,.022,.12)]
for j in range(V-1):
    for i in range(U-1):
        u=(i+.5)/(U-1);v=(j+.5)/(V-1)
        if any(((u-x)/rx)**2+((v-y)/ry)**2<1 for x,y,rx,ry in holes):continue
        if v>.88 and math.sin(u*183)> .92:continue
        k=j*U+i;faces.append((k,k+1,k+1+U,k+U))
cloth_object('Wind-shaped shredded shoulder cloak',verts,faces,'spine_02')
for i in range(82):
    u=(i+.25)/82;p=Vector(cape(u,1));end=p+Vector((rng.uniform(-.012,.048),rng.uniform(-.013,.012),-rng.uniform(.013,.08)))
    tube('Frayed cape fibre',[p,p.lerp(end,.5)+Vector((.009,0,0)),end],rng.uniform(.00045,.001),M['thread'],'spine_02')
for s in (-1,1):
    verts=[];faces=[];nx=26;nz=39
    for j in range(nz):
        v=j/(nz-1)
        for i in range(nx):
            u=i/(nx-1);x=s*.20+(u-.5)*(.22-.05*v)+s*.035*v
            z=1.10-.53*v+(.014*math.sin(u*37)+.028*math.sin(u*81))*v**12
            y=-.215-.03*math.sin(v*math.pi)+.013*math.sin(u*math.tau*2+v*8)
            verts.append((x,y,z))
    for j in range(nz-1):
        for i in range(nx-1):
            if j>nz-8 and (i%11==0 or i%17==0):continue
            k=j*nx+i;faces.append((k,k+1,k+nx+1,k+nx))
    cloth_object('Torn hip tabard '+str(s),verts,faces,'pelvis')
    for j in range(18):
        p=Vector(verts[(nz-1)*nx+min(nx-1,j+3)]);tube('Hip-cloth worn hem',[p,p+Vector((.008,0,-.028-rng.random()*.035))],.00065,M['thread'],'pelvis',False)
    if s==-1:
        for j,line in enumerate(['SAME','DUST','DIFFERENT','WAR']):label(line,(-.219,-.266,.883-j*.034),.030 if j!=2 else .024,M['black'],'pelvis')

print('Constructing backpack, plasma reserves, cables and antenna',flush=True)
box('Backpack structural case',(0,.205,1.39),(.405,.203,.53),M['armor'],'spine_02',.035)
plate('Backpack removable service cover',(0,.318,1.39),[(-.16,-.22),(.16,-.22),(.18,.18),(.11,.24),(-.14,.24),(-.18,.17)],.014,M['tan'],'spine_02',(0,1,0),.007,.005)
for x in (-.225,.225):
    tube('Exposed backpack exoframe',[(x,.145,1.08),(x,.28,1.13),(x,.31,1.65),(x,.16,1.70)],.018,M['steel'],'spine_02')
    for z in (1.19,1.56):
        box('Backpack frame clamp',(x,.30,z),(.057,.057,.04),M['armor'],'spine_02',.006);screw((x,.332,z),(0,1,0),'spine_02')
for z in np.linspace(1.42,1.59,7):box('Backpack heat-exchanger louver',(0,.341,float(z)),(.25,.024,.012),M['black'],'spine_02',.002)
label('FIELD RESERVE',(0,.34,1.285),.025,M['ink'],'spine_02',(0,1,0));label('S-07',(0,.34,1.23),.04,M['ink'],'spine_02',(0,1,0))
for z0 in (1.11,1.49):
    x=-.305;y=.23;z1=z0+.285
    cyl('Violet reserve luminous core',(x,y,z0+.022),(x,y,z1-.024),.028,M['violet'],'spine_02',vertices=32)
    for z in (z0,z1):
        cyl('Canister end cap',(x,y,z-.022),(x,y,z+.022),.038,M['armor'],'spine_02',vertices=24)
        ring('Reservoir locking collar',(x,y,z),(0,0,1),.040,.004,M['steel'],'spine_02',32)
    for j in range(8):ring('Plasma containment segmentation',(x,y,z0+.036+j*.028),(0,0,1),.03,.002,M['edge'],'spine_02',32)
    for a in (.5,2.6,4.4):
        off=Vector((math.cos(a)*.037,math.sin(a)*.037,0));cyl('Canister protective cage',Vector((x,y,z0))+off,Vector((x,y,z1))+off,.004,M['steel'],'spine_02',vertices=12)
    tube('Canister braided power line',[(x,y+.02,z1),(x-.065,y+.035,z1+.005),(x-.075,y+.04,z0-.04),(x+.035,y+.035,z0-.055)],.008,M['rubber'],'spine_02')
    tube('Canister auxiliary feed',[(x,y,z0),(x-.043,y-.03,z0-.06),(-.19,.24,z0-.075)],.003,M['violet'],'spine_02')
cyl('Radio antenna mounting shaft',(-.19,.28,1.65),(-.21,.28,1.93),.021,M['armor'],'spine_02')
cyl('Radio antenna mast',(-.21,.28,1.90),(-.26,.29,2.155),.008,M['steel'],'spine_02',r2=.006)
for z in (1.90,1.93,1.96):ring('Antenna compression rings',(-.213,.28,z),(0,0,1),.016,.003,M['rubber'],'spine_02',20)
tube('Backpack trunk cable',[(-.20,.31,1.57),(-.28,.36,1.35),(-.28,.30,1.13),(-.18,.13,.99)],.011,M['rubber'],'spine_02')

print('Building reference helmet, visor seals and respirator',flush=True)
sphere('Smooth ballistic helmet shell',(0,.013,1.941),(.175,.173,.185),M['armor'],'head',64,40)
# Separate curved crown segments instead of a low-sided helmet primitive.
for amin,amax in [(-2.90,-1.78),(-1.63,-.58),(.58,1.63),(1.78,2.90)]:
    verts=[];faces=[];na=20;nv=14
    for j in range(nv):
        phi=.19+j/(nv-1)*1.04
        for i in range(na):
            a=amin+(amax-amin)*i/(na-1)
            verts.append((.181*math.sin(phi)*math.sin(a),.013-.18*math.sin(phi)*math.cos(a),1.941+.191*math.cos(phi)))
    for j in range(nv-1):
        for i in range(na-1):k=j*na+i;faces.append((k,k+1,k+1+na,k+na))
    me=bpy.data.meshes.new('Crown tile');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Layered curved helmet crown',me);current_collection.objects.link(o);finish(o,o.name,M['tan'],'head')
for s in (-1,1):
    # Temple pods are concentric mechanical assemblies with an open perimeter.
    a=(s*.155,.005,1.94);b=(s*.205,.005,1.94)
    cyl('Helmet communications pod',a,b,.075,M['rubber'],'head',vertices=40)
    cyl('Helmet pod machined housing',(s*.191,.005,1.94),(s*.216,.005,1.94),.064,M['armor'],'head',vertices=40)
    cyl('Helmet pod inset disc',(s*.216,.005,1.94),(s*.222,.005,1.94),.043,M['steel'],'head',vertices=32)
    ring('Pod perimeter retaining ring',(s*.223,.005,1.94),(1,0,0),.053,.004,M['edge'],'head',40)
    for j in range(12):
        angle=math.tau*j/12;y=.005+math.sin(angle)*.059;z=1.94+math.cos(angle)*.059
        cyl('Helmet pod radial rib',(s*.207,y,z),(s*.226,y,z),.006,M['steel'],'head',vertices=8)
    for j in range(6):
        angle=math.tau*j/6;screw((s*.23,.005+math.sin(angle)*.035,1.94+math.cos(angle)*.035),(s,0,0),'head',.0048)
    box('Temple cyan indicator',(s*.202,-.049,1.962),(.014,.008,.021),M['blue'],'head',.002)
    tube('Helmet respirator loop',[(s*.214,-.012,1.917),(s*.208,-.080,1.858),(s*.142,-.138,1.816)],.013,M['rubber'],'head')
    for j in range(7):
        p=Vector((s*.209,-.026-j*.014,1.902-j*.011));ring('Breathing hose corrugation',p,(0,-.75,-.6),.014,.0024,M['steel'],'head',20)
    box('Helmet top accessory bracket',(s*.12,.004,2.086),(.047,.083,.021),M['steel'],'head',.004,rotation=(0,s*.33,0))
    for y in (-.020,.029):screw((s*.125,y,2.108),(0,0,1),'head',.005)
plate('Forehead brow retaining plate',(0,-.135,2.065),[(-.131,-.025),(.126,-.025),(.12,.025),(.052,.044),(-.07,.046),(-.13,.02)],.014,M['tan'],'head',(0,-.85,.52),.006,.004)
label('S-07',(.025,-.165,2.073),.033,M['ink'],'head',(0,-.90,.43))
for x in (-.107,.104):screw((x,-.16,2.064),(0,-.86,.50),'head',.007)
# Curved panoramic visor with angular corner lift. Its seals/emitter segments
# follow the same measured surface, so they remain attached in profile.
def visor(a,t,offset=0):
    top=1.997-.012*abs(a)**2;bottom=1.87+.026*abs(a)**1.5
    return Vector(((.168+offset)*math.sin(a),-.005-(.204+offset)*math.cos(a),bottom+(top-bottom)*t))
verts=[];faces=[];na=58;nv=8
for j in range(nv):
    for i in range(na):verts.append(visor(-1.16+2.32*i/(na-1),j/(nv-1)))
for j in range(nv-1):
    for i in range(na-1):k=j*na+i;faces.append((k,k+1,k+1+na,k+na))
me=bpy.data.meshes.new('Panoramic visor');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Deep blue panoramic armored visor',me);current_collection.objects.link(o);finish(o,o.name,M['glass'],'head')
for t in (0,1):
    points=[visor(-1.17+2.34*i/64,t,.003) for i in range(65)];tube('Visor perimeter ballistic bezel',points,.010,M['steel'],'head',False)
for a in (-1.17,1.17):tube('Visor corner impact guard',[visor(a,t,.004) for t in (0,.15,.85,1)],.011,M['armor'],'head',False)
for amin,amax,t in [(-1.11,-.88,.96),(-.82,-.51,.96),(.52,.84,.96),(.89,1.1,.96),(-.88,-.60,.045),(.58,.85,.045)]:
    tube('Inset cyan visor light',[visor(amin+(amax-amin)*i/10,t,.013) for i in range(11)],.0025,M['blue'],'head',False)
ret=visor(.35,.52,.007)
ring('Visor small aiming reticle',ret,(.25,-1,0),.009,.00065,M['blue'],'head',32)
for a in (0,math.pi/2,math.pi,math.pi*1.5):
    d=Vector((math.cos(a),0,math.sin(a)));tube('Reticle tick',[ret+d*.010,ret+d*.015],.0005,M['blue'],'head',False)
plate('Angular respirator jaw',(0,-.117,1.826),[(-.119,-.055),(.115,-.053),(.138,.016),(.085,.047),(-.077,.047),(-.139,.009)],.055,M['armor'],'head',(0,-1,-.10),.025,.007)
for s in (-1,1):
    n=Vector((s*.44,-.90,-.07));p=Vector((s*.109,-.154,1.824))
    cyl('Respirator side filter',p-n*.015,p+n*.025,.044,M['rubber'],'head',vertices=32)
    cyl('Respirator knurled filter cap',p+n*.020,p+n*.039,.037,M['armor'],'head',vertices=24)
    ring('Filter steel retaining rim',p+n*.04,n,.031,.003,M['edge'],'head',32)
    basis=frame(n)
    for j in range(5):
        q=p+n*.044+basis@Vector(((j-2)*.01,0,0));tube('Filter face slots',[q+basis@Vector((0,-.022,0)),q+basis@Vector((0,.022,0))],.002,M['black'],'head',False)
plate('Mouth grille surround',(0,-.205,1.827),[(-.028,-.049),(.028,-.049),(.039,.040),(-.039,.042)],.012,M['steel'],'head',bow=.006,bevel=.003)
for j in range(7):box('Respirator central grille slot',((j-3)*.0085,-.220,1.824),(.004,.005,.066-abs(j-3)*.005),M['black'],'head',.001)
box('Lower visor service lamp',(.051,-.194,1.865),(.018,.01,.004),M['blue'],'head',.001)

print('Machining the separate belt-fed support weapon',flush=True)
current_collection=weapon_collection
box('Monolithic receiver',(0,.045,0),(.176,.40,.184),M['armor'],bevel=.014)
box('Receiver lower reinforcement',(0,.020,-.095),(.184,.355,.025),M['steel'],bevel=.005)
box('Receiver top service housing',(0,.025,.102),(.125,.28,.062),M['armor'],bevel=.008)
box('Stock recoil tube housing',(0,.301,.0),(.114,.154,.132),M['steel'],bevel=.009)
for z in (-.041,.041):cyl('Stock hydraulic damper',(0,.30,z),(0,.455,z),.023,M['steel'])
box('Stock armored cheek rest',(0,.397,.064),(.108,.17,.045),M['armor'],bevel=.012)
box('Buttplate',(0,.482,-.017),(.115,.031,.205),M['rubber'],bevel=.012)
for j in range(9):box('Buttplate traction',(0,.500,-.09+j*.019),(.095,.009,.007),M['steel'],bevel=.001)
box('Primary pistol grip',(0,.167,-.176),(.066,.083,.145),M['leather'],bevel=.011,rotation=(.16,0,0))
for j in range(5):box('Grip traction ridge',(0,.126,-.130-j*.023),(.068,.009,.011),M['rubber'],bevel=.003)
tube('Trigger guard',[(-.036,.15,-.103),(-.037,.035,-.124),(-.035,.032,-.201),(-.033,.143,-.205)],.009,M['steel'],bezier=False)
tube('Trigger lever',[(0,.082,-.09),(0,.066,-.134),(0,.089,-.149)],.006,M['edge'])
box('Forward supporting grip',(0,-.238,-.162),(.055,.069,.123),M['rubber'],bevel=.011,rotation=(.10,0,0))
for j in range(4):box('Forward grip stipple rib',(0,-.270,-.125-j*.022),(.058,.009,.008),M['leather'],bevel=.002)
# Rails are individual teeth, with visible undercuts and fastening hardware.
box('Full-length upper rail spine',(0,-.241,.11),(.057,.903,.026),M['steel'],bevel=.004)
for j in range(31):box('Picatinny tooth',(0,.181-j*.027,.133),(.079,.014,.018),M['armor'],bevel=.002)
for s in (-1,1):
    n=(s,0,0)
    panel=[(-.155,-.061),(.149,-.061),(.169,-.028),(.148,.057),(-.148,.063),(-.168,.035)]
    plate('Receiver removable side cover',(s*.091,.045,.007),panel,.011,M['armor'],None,n,.005,.004)
    for y in (-.084,.15):
        for z in (-.038,.048):screw((s*.106,y,z),n,None,.007)
    box('Receiver illuminated recess',(s*.105,-.024,.060),(.013,.112,.025),M['black'],bevel=.005)
    box('Receiver cyan charge indicator',(s*.113,-.024,.062),(.005,.083,.009),M['blue'],bevel=.002)
    cyl('Charging handle pivot',(s*.088,.106,.01),(s*.147,.106,.01),.018,M['steel'])
    cyl('Charging handle knurled end',(s*.14,.079,.01),(s*.14,.143,.01),.016,M['rubber'])
    for j in range(6):box('Receiver cooling fin',(s*.098,-.073+j*.026,-.051),(.018,.015,.018),M['steel'],bevel=.002)
# A large feed box below the breech, independent of the flexible belt.
box('Ammunition feed cassette',(.077,-.086,-.253),(.132,.183,.259),M['armor'],bevel=.015,rotation=(.13,0,-.10))
for s in (-1,1):
    for j in range(6):box('Feed cassette embossed rib',(.077+s*.069,-.080,-.147-j*.041),(.012,.136,.012),M['steel'],bevel=.002)
box('Feed cassette latch',(.077,.014,-.195),(.087,.016,.043),M['tan'],bevel=.004)
# Long vented shroud is built from rails and spars: openings are real voids.
for x in (-.067,.067):
    for z in (-.067,.060):box('Handguard structural rail',(x,-.464,z),(.021,.550,.026),M['armor'],bevel=.004)
for y in (-.207,-.38,-.58,-.716):
    box('Handguard top bridge',(0,y,.08),(.171,.038,.025),M['armor'],bevel=.005)
    box('Handguard bottom bridge',(0,y,-.087),(.161,.029,.020),M['steel'],bevel=.003)
    for s in (-1,1):box('Handguard side spar',(s*.081,y,-.005),(.023,.036,.155),M['armor'],bevel=.004);screw((s*.095,y,.038),(s,0,0),None,.006)
for s in (-1,1):
    for j in range(9):
        y=-.257-j*.050
        box('Open shroud angled vent support',(s*.079,y,-.020),(.020,.014,.090),M['steel'],bevel=.003,rotation=(.28,0,0))
    plate('Weapon identity side plaque',(s*.096,-.42,.013),[(-.174,-.039),(.163,-.039),(.174,.03),(-.151,.055),(-.18,.027)],.009,M['armor'],None,(s,0,0),.006,.004)
    # The text plane follows the side plate's local long axis.
    label('AFTERMATH',(s*.108,-.419,.030),.029,M['ink'],normal=(s,0,0))
    label('STILL OURS',(s*.108,-.419,-.001),.023,M['ink'],normal=(s,0,0))
    for y in (-.561,-.277):screw((s*.113,y,.025),(s,0,0),None,.006)
# Twin reinforced barrels with concentric collars, flutes and recessed bores.
for x,z in [(-.046,.015),(.044,-.092)]:
    cyl('Long barrel core',(x,-.17,z),(x,-1.163,z),.029,M['steel'],vertices=40)
    for y in (-.22,-.31,-.64,-.751,-.93,-1.09):
        cyl('Barrel machined collar',(x,y+.014,z),(x,y-.014,z),.038,M['armor'],vertices=32)
        ring('Collar bright lip',(x,y-.016,z),(0,1,0),.035,.0025,M['edge'],major_segments=32)
    for j in range(6):
        a=j*math.tau/6;dx=math.cos(a)*.030;dz=math.sin(a)*.030
        cyl('Barrel longitudinal rib',(x+dx,-.78,z+dz),(x+dx,-1.06,z+dz),.0038,M['black'],vertices=8)
    cyl('Muzzle brake base',(x,-1.14,z),(x,-1.215,z),.043,M['steel'],vertices=40)
    ring('Muzzle crown',(x,-1.217,z),(0,-1,0),.032,.009,M['armor'],major_segments=40)
    cyl('Deep muzzle bore',(x,-1.212,z),(x,-1.221,z),.023,M['black'],vertices=32)
    for j in range(6):
        a=j*math.tau/6
        box('Muzzle side recessed port',(x+math.cos(a)*.04,-1.180,z+math.sin(a)*.04),(.011,.031,.009),M['black'],bevel=.002,rotation=(0,-a,0))
# Recoil module and heat pipes run under the shroud.
for s in (-1,1):
    tube('External heat-exchanger pipe',[(s*.055,-.19,-.10),(s*.062,-.28,-.136),(s*.062,-.63,-.132),(s*.048,-.78,-.08)],.012,M['steel'])
    for j in range(7):ring('Heat pipe union',(s*.062,-.29-j*.048,-.133),(0,1,0),.014,.003,M['brass'],major_segments=20)
box('Rear reflex sight pedestal',(0,.005,.17),(.076,.091,.055),M['armor'],bevel=.004)
for x in (-.032,.032):box('Reflex sight guard',(x,-.010,.21),(.012,.077,.08),M['steel'],bevel=.003)
box('Reflex sight roof',(0,-.01,.252),(.070,.077,.012),M['steel'],bevel=.003)
box('Reflex dark optical lens',(0,-.039,.21),(.049,.006,.05),M['glass'],bevel=.002)
box('Optic reticle emitter',(0,-.044,.211),(.006,.002,.006),M['blue'],bevel=.001)
box('Front sight base',(0,-.665,.148),(.058,.053,.031),M['armor'],bevel=.004)
for x in (-.023,.023):box('Front sight fork',(x,-.67,.181),(.009,.024,.057),M['steel'],bevel=.002)
box('Front sight post',(0,-.67,.175),(.006,.009,.037),M['edge'],bevel=.001)
# The freely hanging cartridge belt uses linked solid rounds, not a flat texture.
for j in range(28):
    t=j/27;ang=math.pi*t
    x=-.143-.032*math.sin(ang);y=-.085-.148*math.sin(ang);z=-.054-.487*math.sin(ang*.94)
    axis=Vector((1,.1*math.sin(t*5),-.08*math.cos(t*5))).normalized();p=Vector((x,y,z))
    cyl('Linked cartridge brass casing',p-axis*.014,p+axis*.057,.0105,M['brass'],vertices=16)
    cyl('Cartridge tapered projectile',p+axis*.057,p+axis*.087,.0104,M['copper'],r2=.002,vertices=16)
    ring('Cartridge rim',p-axis*.012,axis,.0106,.0018,M['brass'],major_segments=16)
    ring('Steel ammunition link',p+axis*.020,axis,.012,.0025,M['steel'],major_segments=16)
    if j:
        tube('Belt hinge link',[prev,p],.005,M['steel'],bezier=False)
    prev=p.copy()
label('07 / HEAVY SUPPORT',(0,.243,.037),.014,M['ink'],normal=(0,1,0),font='plain')

print('Binding explicit armor and articulated glove weights',flush=True)
rig_data=bpy.data.armatures.new('S07 • 50 bone skeleton');rig=bpy.data.objects.new('S07_Rig',rig_data);scene.collection.objects.link(rig)
deselect();rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in BONES.items():
    b=rig_data.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=rig_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;rig_data.display_type='STICK'
for o in PARTS:
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world
    mod=o.modifiers.new('S07 skeletal deformation','ARMATURE');mod.object=rig
# Soft torso weights bridge the lumbar region while each armor plate stays rigid.
for o in PARTS:
    if o.name.startswith('Anatomical torso'):
        o.vertex_groups.clear()
        gs={n:o.vertex_groups.new(name=n) for n in ['pelvis','spine_01','spine_02']}
        for v in o.data.vertices:
            z=(o.matrix_world@v.co).z;t=max(0,min(1,(z-1.12)/.26))
            gs['spine_01'].add([v.index],1-t,'REPLACE');gs['spine_02'].add([v.index],t,'REPLACE')
# Weapon origin is the breech center. Named grip/muzzle transforms export with it.
weapon_root=bpy.data.objects.new('S07_Weapon',None);weapon_collection.objects.link(weapon_root);weapon_root.empty_display_type='ARROWS';weapon_root.empty_display_size=.20
for o in WEAPON:
    world=o.matrix_world.copy();o.parent=weapon_root;o.matrix_world=world
for name,loc in [('Muzzle',(-.037,-1.224,-.015)),('Grip.R',(0,.166,-.135)),('Grip.L',(0,-.238,-.133))]:
    o=bpy.data.objects.new(name,None);weapon_collection.objects.link(o);o.parent=weapon_root;o.location=loc;o.empty_display_type='ARROWS';o.empty_display_size=.08
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
rig['description']='Reference-driven S-07. Original skeleton in meters. Rest A pose; Gun_Ready action. Rigid armor, segmented gloves and weighted undersuit.'
weapon_root['description']='Separate original belt-fed support weapon. Breech-centered origin; +Y stock, -Y muzzle, +Z top.'
# Save the rest source before the presentation pose; this is also a safe restart.
scene['reference']='../reference/gunner.png';scene['authoring']='Procedural Blender geometry and original tileable PBR materials. Hidden surfaces inferred from single supplied view.'
text=bpy.data.texts.new('START HERE • S07');text.write('S07 REFERENCE MODEL\nMeters, front -Y, up +Z. Select S07_Rig and enter Pose Mode.\nRest A pose: clear pose transforms or use Armature > Rest Position.\nGun_Ready is a static reference pose, not a motion-capture animation.\nCharacter and weapon are independent. Named Muzzle / Grip.R / Grip.L sockets.\nMaterials use packed BaseColor, tangent Normal and ORM PNGs.\nOriginal reference lives beside the source file. Back and boots are inferred.\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/'S07_Gunner.blend'))

print('Posing the rig for reference comparison',flush=True)
from mathutils import Euler
weapon_root.rotation_euler=Euler((math.radians(20),0,math.radians(35)))
weapon_root.location=(-.03,-.28,1.375);bpy.context.view_layer.update()
def orient_bone(name,head,tail):
    pb=rig.pose.bones[name];rest=rig.data.bones[name]
    q=(rest.tail_local-rest.head_local).rotation_difference(Vector(tail)-Vector(head))@rest.matrix_local.to_quaternion()
    pb.matrix=Matrix.Translation(Vector(head))@q.to_matrix().to_4x4();bpy.context.view_layer.update()
def arm_pose(side,wrist,pole,hand_direction):
    S=rig.pose.bones['upperarm_'+side].head.copy();W=Vector(wrist);L1=(BONES['upperarm_'+side][1]-BONES['upperarm_'+side][0]).length;L2=(BONES['lowerarm_'+side][1]-BONES['lowerarm_'+side][0]).length
    d=W-S;dist=min(d.length,L1+L2-.004);direction=d.normalized();W=S+direction*dist
    a=(L1*L1-L2*L2+dist*dist)/(2*dist);h=math.sqrt(max(0,L1*L1-a*a));pole=Vector(pole)-S;v=(pole-direction*pole.dot(direction)).normalized();E=S+direction*a+v*h
    orient_bone('upperarm_'+side,S,E);orient_bone('lowerarm_'+side,E,W)
    orient_bone('hand_'+side,W,W+Vector(hand_direction).normalized()*.12)
# A wider, flexed-knee stance has a grounded weight-bearing silhouette.
rig.pose.bones['pelvis'].matrix=Matrix.Translation((0,0,-.055))@rig.data.bones['pelvis'].matrix_local
bpy.context.view_layer.update()
for side,sign,y in [('r',-1,-.07),('l',1,.09)]:
    S=rig.pose.bones['thigh_'+side].head.copy();W=Vector((sign*.255,y,.15));L1=rig.data.bones['thigh_'+side].length;L2=rig.data.bones['calf_'+side].length;d=W-S;dist=d.length;direction=d.normalized();a=(L1*L1-L2*L2+dist*dist)/(2*dist);h=math.sqrt(max(0,L1*L1-a*a));pole=Vector((sign*.20,-.55,.51))-S;v=(pole-direction*pole.dot(direction)).normalized();E=S+direction*a+v*h
    orient_bone('thigh_'+side,S,E);orient_bone('calf_'+side,E,W);orient_bone('foot_'+side,W,W+Vector((sign*.025,-.188,-.055)))
arm_pose('r',weapon_root.matrix_world@Vector((-.008,.17,-.055)),(-.7,-.13,1.28),(0,.13,-1))
arm_pose('l',weapon_root.matrix_world@Vector((.025,-.218,-.083)),(.66,-.17,1.30),(-.8,-.1,.18))
# A deliberate, modest closed-hand pose can be adjusted in Pose Mode.
for pb in rig.pose.bones:
    pb.rotation_mode='QUATERNION'
    if pb.name.startswith('finger_'):
        part=int(pb.name.split('_')[2]);pb.rotation_mode='XYZ';pb.rotation_euler.x=math.radians(-30 if part==1 else -48)
for pb in rig.pose.bones:
    pb.keyframe_insert(data_path='location',frame=1);pb.keyframe_insert(data_path='rotation_quaternion' if pb.rotation_mode=='QUATERNION' else 'rotation_euler',frame=1);pb.keyframe_insert(data_path='scale',frame=1)
rig.animation_data.action.name='Gun_Ready'
scene.frame_set(1)

print('Lighting comparison studio',flush=True)
studio=bpy.data.collections.new('S07 • Review studio (excluded from exports)');scene.collection.children.link(studio)
def put_studio(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    studio.objects.link(o)
def camera(name,at,target,lens=58):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=at;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_start=.02;d.clip_end=100;return o
def area(name,at,energy,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=at;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.018));floor=bpy.context.object;floor.name='Neutral studio floor';put_studio(floor);floor.data.materials.append(plain('Studio warm graphite',(.18,.155,.123),.0,.87))
area('Large warm key',(-3,-4,5),1050,(1,.78,.55),4,(0,0,1.1))
area('Cool soft fill',(3,-2,3),680,(.56,.72,1),3,(0,0,1.3))
area('Warm shoulder rim',(1,3,4),1500,(1,.53,.23),2.5,(0,0,1.4))
area('Visor reflection strip',(-1,-2,3),85,(.45,.75,1),1.5,(0,-.1,1.95))
world=bpy.data.worlds.new('S07 neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.11,.13,.16,1);world.node_tree.nodes['Background'].inputs[1].default_value=.3;scene.world=world
hero_cam=camera('01 • Reference three-quarter',(-2.65,-5.2,2.30),(.12,-.08,1.08),72)
front_cam=camera('02 • Neutral front',(0,-5,1.4),(0,0,1.07),65)
back_cam=camera('03 • Back equipment',(2.7,5,2.7),(0,0,1.13),65)
head_cam=camera('04 • Helmet study',(-.9,-1.5,2.15),(0,-.04,1.93),85)
scene.camera=hero_cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception as e:print('Cycles CPU fallback',e,flush=True)
scene.render.resolution_x=1080;scene.render.resolution_y=1440;scene.render.resolution_percentage=85
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
# Save an immediately useful camera view in the editable project.
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.clip_end=100
            ar.spaces.active.shading.type='MATERIAL'
deselect();rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/'S07_Gunner.blend'))
scene.render.filepath=str(OUT/'preview'/'01_reference_draft.png');bpy.ops.render.render(write_still=True)
# Object/triangle inventory remains transparent about the detail cost.
def stats(objects):
    vertices=triangles=0
    for o in objects:
        if o.type=='MESH':o.data.calc_loop_triangles();vertices+=len(o.data.vertices);triangles+=len(o.data.loop_triangles)
    return dict(meshes=len(objects),vertices=vertices,triangles=triangles)
(OUT/'source'/'build_manifest.json').write_text(json.dumps({'character':stats(PARTS),'weapon':stats(WEAPON),'bones':len(BONES),'blender':bpy.app.version_string,'status':'First reference render; exports follow visual refinement'},indent=2))
print('REFERENCE DRAFT COMPLETE',flush=True)
