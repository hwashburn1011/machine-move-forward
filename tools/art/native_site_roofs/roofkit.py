"""Supported shelter details in game metres. Import only in isolated Blender.

The Foundry roof belongs to the existing foundry authoring recipe. The other
three assemblies are additive and never replace a destination's floor/anchors.
Collision is captured from structural parts before material batching; small
fasteners are visual details, and torn-away sheet area has no collision faces.
"""
import bpy, bmesh, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-site-roofs';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/graphics_v2'))
import hardsurface as h

def materials():
    names=['N200_steel','N200_machined_alloy','N200_slate','N200_celadon','N200_umber']
    missing=[name for name in names if not bpy.data.materials.get(name)]
    if missing:
        with bpy.data.libraries.load(str(ROOT/'assets/art200/machine/NomadLivingArchive.blend'),link=False) as (_,loaded):loaded.materials=missing
    return dict(zip(['steel','alloy','slate','green','umber'],[bpy.data.materials[name] for name in names]))

def root(name,parent=None):
    r=h.empty(name,parent=parent);r['siteRoofVersion']=1;return r

def finish(o,name,mat,parent,solid=True,pigment=1.0,bevel=0):
    bpy.context.view_layer.update()
    h.finish(o,name,mat,parent,0)
    if bevel>.004:
        # Millimetre-scale folds need only two bevel segments; long planar
        # faces retain weighted normals. This keeps exact collision compact.
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        modifier=o.modifiers.new('Eased roof fabrication edge','BEVEL');modifier.width=bevel;modifier.segments=2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for face in o.data.polygons:face.use_smooth=True
        weighted=o.modifiers.new('Roof planar normals','WEIGHTED_NORMAL');weighted.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=weighted.name);o.select_set(False)
    o['roof_collision']=solid
    color=o.data.color_attributes.new(name='RoofPigment',type='FLOAT_COLOR',domain='CORNER')
    for loop in color.data:loop.color=(pigment,pigment,pigment,1)
    o.data.color_attributes.active_color=color
    return o

def box(name,at,size,mat,parent,bevel=.006,solid=True,pigment=1.0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=h.gv(at));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,solid,pigment,bevel)

def beam(name,a,b,width,depth,mat,parent,solid=True):
    av,bv=h.gv(a),h.gv(b);d=bv-av
    bpy.ops.mesh.primitive_cube_add(size=1,location=(av+bv)/2);o=bpy.context.object
    o.dimensions=(width,depth,d.length);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,name,mat,parent,solid,1,.006)

def tube(name,a,b,r,mat,parent,solid=False,n=12):
    av,bv=h.gv(a),h.gv(b);d=bv-av
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(av+bv)/2);o=bpy.context.object
    o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,name,mat,parent,solid,1,0)

def mesh(name,verts,faces,mat,parent,solid=True,pigment=1):
    data=bpy.data.meshes.new(name);data.from_pydata([h.gv(v) for v in verts],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    return finish(o,name,mat,parent,solid,pigment)

def corrugation(x):
    # Broad flat lands and narrow pressed crowns, not an inflated sine wave.
    t=(x/.18)%1
    return .027*max(0,1-abs(t-.5)/.24)

def sheet(name,x0,x1,z0,z1,height,mat,parent,pigment=1,torn=False):
    """Closed folded plate. The torn edge curls but stays attached at its spine."""
    nx=max(12,int(math.ceil((x1-x0)/.18))*4);rows=4 if torn else 2
    verts=[]
    for row in range(rows):
        t=row/(rows-1)
        for col in range(nx+1):
            x=x0+(x1-x0)*col/nx
            tear=(.13*math.sin(col*1.71)+.055*math.sin(col*.73)) if torn else 0
            edge=z0+tear
            z=edge+(z1-edge)*t
            curl=(1-t)**7*(.10+.08*math.sin(col*.41)) if torn else 0
            verts.append((x,height(z)+corrugation(x)+curl,z))
    count=len(verts);verts.extend([(x,y-.012,z) for x,y,z in verts])
    faces=[]
    for row in range(rows-1):
        for col in range(nx):
            i=row*(nx+1)+col;f=(i,i+1,i+nx+2,i+nx+1)
            faces.extend([f,tuple(v+count for v in reversed(f))])
    border=list(range(nx+1))+[row*(nx+1)+nx for row in range(1,rows)]+list(range((rows-1)*(nx+1)+nx-1,(rows-1)*(nx+1)-1,-1))+[row*(nx+1) for row in range(rows-2,0,-1)]
    for a,b in zip(border,border[1:]+border[:1]):faces.append((a,b,b+count,a+count))
    return mesh(name,verts,faces,mat,parent,True,pigment)

def fastener(at,normal,mat,parent):
    p=Vector(at);n=Vector(normal).normalized()
    tube('Captured sheet washer',p-n*.006,p+n*.004,.030,mat,parent,n=12)
    tube('Hex sheet screw',p+n*.002,p+n*.014,.017,mat,parent,n=6)

def foundry(parent):
    m=materials();r=root('FoundryRoof',parent)
    # New loads bear on existing 4.8 m gantry columns/chords. The suspended
    # workshop rail and chain remain below, with their original transforms.
    pitch=.16
    def top(z):return 5.76-abs(z)*pitch
    for x in [-3.8,1.4,6.75]:
        beam('Tie beam on original gantry',(x,4.81,-4.86),(x,4.81,4.86),.17,.13,m['steel'],r)
        for side in [-1,1]:
            beam('Pitched truss upper chord',(x,4.93,side*4.86),(x,5.70,0),.16,.14,m['steel'],r)
            for za,zb in [(4.77,3.25),(1.60,3.25),(1.60,0)]:
                beam('Roof truss captured web',(x,4.83,side*za),(x,top(side*zb)-.06,side*zb),.060,.060,m['steel'],r)
            box('Seated eave cleat',(x,4.845,side*4.86),(.29,.15,.32),m['alloy'],r)
            for dz in [-.085,.085]:fastener((x,4.925,side*4.86+dz),(0,1,0),m['alloy'],r)
        beam('King post',(x,4.83,0),(x,5.70,0),.085,.085,m['steel'],r)
    purlins=[-4.86,-3.25,-1.52,0,1.52,3.25,4.86]
    for z in purlins:
        beam('Continuous roof purlin',(-3.99,top(z)-.048,z),(6.96,top(z)-.048,z),.10,.10,m['steel'],r)
    widths=[-3.99+i*1.095 for i in range(11)]
    for side in [-1,1]:
        for i,(x0,x1) in enumerate(zip(widths,widths[1:])):
            torn=side==-1 and i>=5
            edge=-1.82-(i%3)*.10 if torn else -5.09
            a,b=(edge,-.025) if side==-1 else (.025,5.09)
            paint=m['green'] if i not in [2,7] else m['slate']
            sheet('Wind-torn retained roof sheet' if torn else 'Pressed roof sheet',x0+.012,x1-.012,a,b,top,paint,r,.82+(i%4)*.045,torn)
            # Standing side return caps are seated into the sheet land. The
            # missing outer portion of each torn panel remains genuinely open.
            for x in [x0+.013,x1-.013]:
                beam('Folded sheet side return',(x,top(a)+.004,a),(x,top(b)+.004,b),.020,.055,m['steel'],r)
            for z in purlins:
                if a+.16<z<b-.10:
                    for x in [x0+.22,x1-.22]:
                        fastener((x,top(z)+corrugation(x),z),(0,1,side*pitch),m['alloy'],r)
    # Ridge cap overlaps both slopes; its turned edges are closed solid strips.
    for side in [-1,1]:
        box('Ridge weather cover',(1.485,5.778,side*.09),(11.09,.026,.19),m['slate'],r)
        box('Ridge cover rolled edge',(1.485,5.756,side*.182),(11.09,.042,.030),m['steel'],r)
    for z in [-5.105,5.105]:
        box('Eave folded fascia',(1.49,top(z)-.06,z),(11.02,.13,.10),m['umber'],r)
        box('Eave gutter bottom',(1.49,top(z)-.135,z),(11.02,.022,.18),m['steel'],r)
        box('Eave gutter captured outer lip',(1.49,top(z)-.092,z+math.copysign(.088,z)),(11.02,.098,.018),m['steel'],r)
        for x in [-3.8,1.4,6.75]:
            beam('Bolted eave gutter hanger',(x,top(z)-.06,math.copysign(4.86,z)),(x,top(z)-.13,z),.045,.075,m['steel'],r)
    # Knee ties terminate inside the existing boundary column envelopes.
    for x in [-3.8,6.75]:
        for side in [-1,1]:beam('Gantry roof knee',(x,4.30,side*4.85),(x,4.81,side*4.15),.085,.085,m['steel'],r)
    r['minimumNewHeadroom']=4.25;r['tornOpeningProbe']=[4.6,6,-3.5]
    return r

def workshop():
    m=materials();r=root('WorkshopCanopy')
    def top(z):return 4.24+(-z-1.5)*.13
    for x in [-1.8,1.8,5.5]:
        box('Wall cap saddle',(x,3.58,-4.7),(.35,.18,.34),m['alloy'],r)
        beam('Wall seated canopy standard',(x,3.56,-4.70),(x,4.63,-4.70),.14,.14,m['steel'],r)
        beam('Canopy cantilever rafter',(x,top(-4.82)-.06,-4.82),(x,top(-1.5)-.06,-1.5),.15,.15,m['steel'],r)
        beam('Cantilever knee brace',(x,3.65,-4.7),(x,top(-3.25)-.08,-3.25),.080,.080,m['steel'],r)
        for z in [-4.7,-3.25]:fastener((x,top(z)+.015,z),(0,1,.13),m['alloy'],r)
    for z in [-4.74,-3.25,-1.58]:
        beam('Canopy captured purlin',(-2.82,top(z)-.04,z),(5.90,top(z)-.04,z),.11,.10,m['steel'],r)
    for i in range(8):
        x0=-2.82+i*1.09;x1=x0+1.09
        sheet('Workshop pitched shelter panel',x0+.01,x1-.01,-4.93,-1.45,top,m['umber'] if i in [0,5] else m['slate'],r,.90+.025*(i%4))
        for x in [x0+.012,x1-.012]:beam('Shelter folded seam',(x,top(-4.93)+.004,-4.93),(x,top(-1.45)+.004,-1.45),.020,.052,m['steel'],r)
        for z in [-4.74,-3.25,-1.58]:
            for x in [x0+.21,x1-.21]:fastener((x,top(z)+corrugation(x),z),(0,1,.13),m['alloy'],r)
    for z in [-4.95,-1.43]:
        box('Shelter end fold',(1.54,top(z)-.028,z),(8.78,.100,.070),m['steel'],r)
    # Closed drip pan under the low edge, with an outlet attached to its end.
    box('Workshop gutter pan',(1.54,4.061,-1.36),(8.81,.022,.15),m['umber'],r)
    for z in [-1.425,-1.295]:box('Workshop gutter folded wall',(1.54,4.112,z),(8.81,.11,.018),m['steel'],r)
    for x in [-2.865,5.945]:box('Workshop gutter end stop',(x,4.112,-1.36),(.018,.11,.15),m['umber'],r)
    tube('Workshop gutter outlet',(5.85,4.10,-1.36),(5.85,3.93,-1.36),.035,m['steel'],r,True,16)
    r['minimumNewHeadroom']=3.49;r['clearUpperBridgeZMin']=4.0
    return r

def cap_details(name,center,cap_size,cap_top,cap_bottom,shell_top,seat_xs,seat_zs):
    m=materials();r=root(name);cx,cz=center;sx,sz=cap_size
    for x in seat_xs:
        for z in seat_zs:
            box('Canopy bearing seat',(x,(shell_top+cap_bottom)/2,z),(.26,cap_bottom-shell_top+.15,.26),m['steel'],r)
        beam('Continuous canopy support',(x,cap_bottom-.027,cz-sz/2+.12),(x,cap_bottom-.027,cz+sz/2-.12),.12,.10,m['steel'],r)
    for side in [-1,1]:
        x=cx+side*(sx/2-.03)
        beam('Archive cap side folded binding',(x,cap_top-.025,cz-sz/2+.015),(x,cap_top-.025,cz+sz/2-.015),.065,.12,m['slate'],r)
        z=cz+side*(sz/2-.03)
        box('Archive cap end folded binding',(cx,cap_top-.025,z),(sx,.12,.065),m['slate'],r)
    for i in range(1,int(sx)):
        x=cx-sx/2+sx*i/int(sx)
        beam('Seated standing roof seam',(x,cap_top+.012,cz-sz/2+.06),(x,cap_top+.012,cz+sz/2-.06),.020,.036,m['steel'],r)
        for z in [cz-sz/2+.20,cz+sz/2-.20]:fastener((x,cap_top+.026,z),(0,1,0),m['alloy'],r)
    r['minimumNewHeadroom']=shell_top-.075
    return r

def array_vault():return cap_details('ArrayVaultRoof',(3,3),(5,5),3.83,3.67,3.55,[1.40,4.60],[1.40,4.60])
def orchard_archive():return cap_details('OrchardArchiveRoof',(5,-7),(6.2,4.5),4.29,4.11,4.05,[2.7,7.3],[-8.5,-5.5])

def meridian_sign():
    m=materials();r=root('MeridianGardenSign')
    # Original text is centered at Z=-3.43. Its 2 mm extrusion sits on the
    # +Z face of this board; post clamps transfer the load to existing uprights.
    box('Garden sign backing',(-5,2.79,-3.466),(5.08,.69,.070),m['steel'],r,.018)
    for y in [2.465,3.115]:box('Garden sign captured edge',(-5,y,-3.437),(5.09,.040,.065),m['green'],r,.006)
    for x in [-7.5,-2.5]:
        box('Garden upright capture clamp',(x,2.88,-3.50),(.22,.53,.20),m['steel'],r,.012)
        for y in [2.66,3.075]:fastener((x,y,-3.396),(0,0,1),m['alloy'],r)
    r['minimumNewHeadroom']=2.445
    return r

def prepare(root):
    bpy.context.view_layer.update()
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Portable roof triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-10],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free()
        planar_uv(obj)

def planar_uv(obj):
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        normal=obj.matrix_world.to_3x3()@poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
        for index in poly.loop_indices:
            p=obj.matrix_world@obj.data.vertices[obj.data.loops[index].vertex_index].co;uv.data[index].uv=(p[axes[0]],p[axes[1]])

def collision(root,site_id):
    bpy.context.view_layer.update();faces=[];parts=[];bounds=[];triangles=0
    for o in root.children_recursive:
        if o.type!='MESH':continue
        vertices=[o.matrix_world@v.co for v in o.data.vertices]
        bounds.extend([[v.x,v.z,-v.y] for v in vertices]);triangles+=len(o.data.polygons)
        if not o.get('roof_collision',False):continue
        o.data.calc_loop_triangles();n=0
        for tri in o.data.loop_triangles:
            p=[vertices[i] for i in tri.vertices]
            if (p[1]-p[0]).cross(p[2]-p[0]).length_squared<1e-16:continue
            faces.extend([[v.x,v.z,-v.y] for v in p]);n+=1
        parts.append({'name':o.name,'triangles':n})
    spec={'id':site_id,'visualRoot':root.name,'triangles':triangles,'collisionTriangles':len(faces)//3,'parts':parts,'faces':faces,'bounds':{'min':[min(p[i] for p in bounds) for i in range(3)],'max':[max(p[i] for p in bounds) for i in range(3)]}}
    (OUT/(site_id+'-collision.json')).write_text(json.dumps(spec,separators=(',',':'))+'\n')
    return {k:v for k,v in spec.items() if k not in ['faces','parts']}

def merge(root):
    for parent in [root]+[o for o in root.children_recursive if o.type=='EMPTY']:
        groups={}
        for o in list(parent.children):
            if o.type=='MESH':groups.setdefault(o.data.materials[0],[]).append(o)
        for mat,objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            bpy.context.object.name=parent.name+'_'+mat.name

def save_foundry_editable(scene_root,source_path):
    r=next(o for o in scene_root.children_recursive if o.name=='FoundryRoof')
    # The original scene retains its established join/triangulation order.
    # Only the new roof receives this portable pre-batch geometry treatment.
    prepare(r)
    for obj in scene_root.children_recursive:
        if obj.type=='MESH':planar_uv(obj)
    info=collision(r,'relay-foundry')
    (OUT/'foundry-roof-manifest.json').write_text(json.dumps(info,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path),compress=True)

def export_additions():
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
    bpy.context.scene.unit_settings.system='METRIC';roots=[workshop(),array_vault(),orchard_archive(),meridian_sign()];ids=['rooftop-workshop','quiet-array','glass-orchard','last-garden-meridian']
    info=[]
    for r,id in zip(roots,ids):prepare(r);info.append(collision(r,id))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'SiteRoofs.blend'),compress=True)
    for r in roots:merge(r)
    path=ROOT/'godot/art/native-site-roofs.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_extras=True,export_tangents=True,export_vertex_color='NAME',export_vertex_color_name='RoofPigment',export_all_vertex_colors=False)
    manifest={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'models':info,'source':'assets/native-site-roofs/SiteRoofs.blend'}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('SITE_ROOF_ADDITIONS_COMPLETE',json.dumps(manifest),flush=True)

if __name__=='__main__':export_additions()
