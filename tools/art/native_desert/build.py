"""Original sparse desert kit. Run in a separate Blender, never reset the live MCP scene."""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/native-desert'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(240926)
roots = []

def material(name):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bs = nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .94
    color = nodes.new('ShaderNodeVertexColor'); color.layer_name = 'Weathering'
    links.new(color.outputs['Color'], bs.inputs['Base Color'])
    return mat

wood = material('Sun bleached woody fibres')
stone = material('Scoured sedimentary mineral')

def xyz(p): return Vector((p[0], -p[2], p[1]))

class Model:
    def __init__(self, name, mat, flexible=False):
        self.name, self.mat, self.flexible = name, mat, flexible
        self.vertices, self.faces, self.colors = [], [], []
    def add(self, vertices, faces, color):
        start = len(self.vertices)
        self.vertices.extend(xyz(p) for p in vertices)
        self.faces.extend(tuple(start+i for i in face) for face in faces)
        for p in vertices:
            variation = .87 + .20*noise.noise_vector(Vector(p)*17)[0]
            self.colors.append((*[max(.01, c*variation) for c in color], 1))
    def branch(self, points, radius, color, sides=8):
        """Curved tapered wood, joined rings, closed broken tip, no intersecting cylinders."""
        points = [Vector(p) for p in points]; vertices = []; faces = []
        if radius > .025:
            # Curved weathered limbs rather than a chain of angular cones.
            old=points;points=[]
            for j in range(len(old)-1):
                a,b,c,d=old[max(0,j-1)],old[j],old[j+1],old[min(len(old)-1,j+2)]
                for t in [0,.333333,.666667]:
                    points.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
            points.append(old[-1])
        for j, p in enumerate(points):
            t = j/(len(points)-1)
            tangent = (points[min(j+1,len(points)-1)]-points[max(j-1,0)]).normalized()
            u = tangent.cross(Vector((0,0,1)))
            if u.length < .01: u = tangent.cross(Vector((1,0,0)))
            u.normalize(); v = tangent.cross(u)
            r = radius*(1-.91*t)
            for i in range(sides):
                a = i*math.tau/sides
                vertices.append(p+(u*math.cos(a)+v*math.sin(a))*r*(1+.10*math.sin(a*5+t*.6)+.035*math.sin(a*11)))
        for j in range(len(points)-1):
            for i in range(sides):
                a=j*sides+i; b=j*sides+(i+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+i for i in range(sides))]
        self.add(vertices, faces, color)
    def finish(self):
        mesh=bpy.data.meshes.new(self.name);mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        obj=bpy.data.objects.new(self.name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(self.mat)
        colors=mesh.color_attributes.new(name='Weathering',type='FLOAT_COLOR',domain='POINT')
        for i,col in enumerate(self.colors):colors.data[i].color=col
        uv=mesh.uv_layers.new(name='RootFlex')
        for face in mesh.polygons:
            face.use_smooth=True
            for i in face.loop_indices:
                p=mesh.vertices[mesh.loops[i].vertex_index].co
                uv.data[i].uv=(p.x, max(0,p.z-.08)**1.6 if self.flexible else 0)
        roots.append(obj);return obj

def shrub(name, size, seed):
    local=random.Random(seed);m=Model(name,wood,True)
    for stem in range(9):
        angle=stem*2.399+local.random()*.6;length=local.uniform(.48,.98)*size
        tip=Vector((math.cos(angle)*length*.59,length,math.sin(angle)*length*.59))
        points=[Vector((0,-.08,0)).lerp(tip,t/6)+Vector((.08*math.sin(t*.55)*size,0,.04*math.sin(t)*size)) for t in range(7)]
        m.branch(points,.022*size,(.23,.17,.10),10)
        for split in range(2,6):
            base=points[split];a=angle+(-1 if split%2 else 1)*local.uniform(.5,1.3)
            reach=(.40-split*.04)*size
            twig=[base+Vector((math.cos(a)*reach*t,.21*size*t-.07*size*t*t,math.sin(a)*reach*t)) for t in [0,.25,.5,.75,1]]
            m.branch(twig,.008*size,(.35,.28,.17),7)
            for side in [-1,1]:
                b=twig[2];end=twig[-1]+Vector((math.cos(a+side)*.09*size,.07*size,math.sin(a+side)*.09*size))
                m.branch([b,b.lerp(end,.5),end],.0038*size,(.44,.35,.22),6)
    return m.finish()

shrub('DryBrushA',1.08,4)
shrub('DryBrushB',.80,17)
m=Model('RootSnag',wood)
m.branch([(0,-.08,0),(.04,.19,0),(.13,.39,.03),(.33,.49,.09),(.52,.54,.03),(.68,.51,.07)],.125,(.20,.18,.145),18)
for angle in [0,1.7,3.8,5.2]:
    m.branch([(0,.14,0),(math.cos(angle)*.30,.09,math.sin(angle)*.30),(math.cos(angle)*.65,-.09,math.sin(angle)*.65)],.06,(.20,.15,.10),12)
m.branch([(.08,.29,0),(-.01,.44,-.09),(.07,.64,-.16),(.02,.76,-.23)],.039,(.27,.23,.18),12)
m.branch([(.28,.47,.07),(.36,.63,.21),(.33,.68,.36),(.42,.72,.40)],.031,(.29,.25,.19),12)
m.branch([(.03,.16,-.02),(-.11,.23,.15),(-.21,.26,.19)],.044,(.20,.17,.13),12)
m.finish()
m=Model('WindTuft',wood,True)
for i in range(47):
    a=rng.random()*math.tau;h=rng.uniform(.27,.68);spread=rng.uniform(.12,.37)
    p=[(math.cos(a)*spread*t*t+.15*t*t,-.04+h*t,math.sin(a)*spread*t*t) for t in [0,.2,.4,.6,.8,1]]
    m.branch(p,rng.uniform(.003,.006),(.42,.34,.20),6)
m.finish()

def pebble(m, at, scale, seed):
    local=random.Random(seed);vertices=[];faces=[];rows=12;cols=24
    phases=[local.random()*math.tau for _ in range(3)]
    for j in range(rows+1):
        phi=math.pi*j/rows
        for i in range(cols):
            theta=math.tau*i/cols
            p=Vector((math.sin(phi)*math.cos(theta), math.cos(phi),math.sin(phi)*math.sin(theta)))
            n=noise.noise_vector(p*2.2+Vector(phases))[0]
            r=1+.14*n+.05*math.sin(theta*3+phi*2)
            p=Vector((p.x*scale[0]*r,p.y*scale[1]*(1+.08*n),p.z*scale[2]*r))+Vector(at)
            vertices.append(p)
    for j in range(rows):
        for i in range(cols):faces.append((j*cols+i,j*cols+(i+1)%cols,(j+1)*cols+(i+1)%cols,(j+1)*cols+i))
    base=(.23,.21,.18) if seed%2 else (.32,.28,.21)
    m.add(vertices,faces,base)
    # Layer bands follow the mineral, vertex baked into the exported colour.
    for i in range(len(m.vertices)-len(vertices),len(m.vertices)):
        p=m.vertices[i];band=.85+.12*math.sin(p.z*32+p.x*2.4)+.05*math.sin(p.z*91+p.y*4)
        col=m.colors[i];m.colors[i]=(col[0]*band,col[1]*band,col[2]*band,1)

for name,scale,seed in [('ScouredStoneA',(.75,.37,.46),30),('ScouredStoneB',(.47,.26,.67),35)]:
    m=Model(name,stone);pebble(m,(0,.17,0),scale,seed);m.finish()
m=Model('GravelFan',stone)
for i in range(15):
    a=rng.random()*math.tau;r=rng.random()**.65*.78;s=rng.uniform(.065,.17)
    pebble(m,(math.cos(a)*r,.018,math.sin(a)*r), (s,s*.45,s*.7),i+100)
m.finish()

# Origin sits slightly below the lowest visible root / rock so placement can
# bury it into the sampled dune rather than balance a bounding box on a point.
bpy.ops.object.select_all(action='DESELECT')
for obj in roots:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/desert-ground-life.glb'),export_format='GLB',use_selection=True,export_animations=False)
report={'originalAuthored':True,'units':'metres','assemblies':[]}
for obj in roots:
    obj.data.calc_loop_triangles()
    report['assemblies'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'height':round(obj.dimensions.z,3)})

# Review scene in native metre scale. Source render also uses the exported
# vertex colour, not a separate rich material that the game cannot reproduce.
for i,obj in enumerate(roots):obj.location=Vector(((i%4-1.5)*2.1,(i//4)*2.6,0))
bpy.ops.mesh.primitive_plane_add(size=200)
ground=bpy.context.object;ground.name='Review ground (not exported)'
ground_mat=bpy.data.materials.new('Neutral sand studio');ground_mat.diffuse_color=(.24,.21,.16,1);ground.data.materials.append(ground_mat);ground.location.z=-.06
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Desert studio');scene.world.color=(.18,.18,.18)
target=Vector((0,1,.35))
bpy.ops.object.camera_add(location=(6,-10,8));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=10;scene.camera=cam
for at,power,size in [((1,-4,7),1500,6),((-5,3,5),1100,5)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'desert-ground-life.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'DesertGroundLife.blend'))
(OUT/'manifest.json').write_text(json.dumps(report,indent=2))
bpy.ops.render.render(write_still=True)
print('DESERT_KIT_COMPLETE',json.dumps(report),flush=True)
