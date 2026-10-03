"""Authored lower storeys, in game metres. No edits to the finished upper sites.

Closed lower walls transfer every roof-level platform into broad caissons. The
runtime only seats the buried foundation/collars once; these crafted facades
retain their real dimensions, UVs and joints as the machine passes.
"""
import bpy,sys,json,hashlib,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(ROOT/'tools/art/native_site_roofs'))
import roofkit as k
OUT=ROOT/'assets/site-grounding';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
M=k.materials()
M['stone']=k.h.material('Grounding cast mineral','696960',0,.94,seed=72)
M['pale']=k.h.material('Grounding aged limestone','938e7a',0,.92,seed=79)
roots=[];models={};current=None

def box(name,at,size,mat='steel',solid=False,bevel=.018,pigment=1):
    o=k.box(name,at,size,M[mat],current,bevel,solid,pigment)
    if solid:models[current.name]['colliders'].append({'at':at,'size':size})
    return o
def beam(name,a,b,w=.13,mat='steel'):
    return k.beam(name,a,b,w,w,M[mat],current,False)
def pipe(name,a,b,r=.13,mat='alloy'):
    return k.tube(name,a,b,r,M[mat],current,False,16)
def start(name,half,style):
    global current
    current=k.root(name);roots.append(current)
    models[name]={'root':name,'half':half,'style':style,'colliders':[],'foundations':[],'top':-.16,'base':-12.2}
    return current
def foundation(cx,cz,sx,sz,mat='stone'):
    models[current.name]['foundations'].append({'center':[cx,cz],'size':[sx,sz],'material':mat,'top':-12.10})
def wallroom(cx,cz,sx,sz,mat='stone',levels=3,windows=True):
    """Closed lower room; blind windows read as boarded/opaque glazing, no fake door."""
    top=-.26;bottom=-12.20;mid=(top+bottom)/2;h=top-bottom
    foundation(cx,cz,sx+.06,sz+.06,mat)
    for x in [cx-sx/2+.19,cx+sx/2-.19]:box('Load bearing end wall',(x,mid,cz),(.38,h,sz),mat,True,.035)
    for z in [cz-sz/2+.19,cz+sz/2-.19]:box('Load bearing long wall',(cx,mid,z),(sx,h,.38),mat,True,.035)
    for y in [-.46,-4.25,-8.18,-12.03]:
        box('Continuous structural belt',(cx,y,cz),(sx+.10,.24,sz+.10),'steel',False,.025)
    for side in [-1,1]:
        z=cz+side*(sz/2+.025)
        for i in range(max(2,int(sx/3))):
            x=cx-sx/2+(i+.5)*sx/max(2,int(sx/3))
            for j in range(levels):
                y=-2.20-j*3.92
                if windows:
                    box('Recessed boarded window',(x,y,z),(1.26,1.33,.07),'steel',False,.035)
                    box('Captured window header',(x,y+.69,z+side*.04),(1.40,.085,.12),'alloy',False,.009)
                    box('Drip sill',(x,y-.69,z+side*.05),(1.44,.09,.20),'slate',False,.012)
                    box('Window mullion',(x,y,z+side*.05),(.075,1.32,.06),'slate',False,.007)
                else:
                    box('Service wall cassette',(x,y,z),(min(2.30,sx/3-.12),2.60,.08),'green' if j%2==0 else 'slate',False,.02,.80+.04*(i%3))
                    for offset in [-.8,-.4,0,.4,.8]:box('Captured ventilation blade',(x,y+offset,z+side*.085),(min(1.8,sx/3-.3),.075,.12),'steel',False,.006)
        for x in [cx-sx/2+.25,cx+sx/2-.25]:box('Corner weather binding',(x,mid,z),(.19,h,.13),'alloy',False,.012)
    # All water/service pipes are clamped to the wall and enter the underdeck.
    x=cx+sx/2-.65;z=cz+sz/2+.16
    pipe('Seated downpipe',(x,-.35,z),(x,-12.17,z),.11,'umber')
    for y in [-1.2,-4.9,-8.7,-11.7]:box('Pipe wall clamp',(x,y,z-.075),(.30,.09,.24),'steel')
def cap(half):
    x,z=half
    box('Underdeck transfer slab',(0,-.34,0),(2*x,.36,2*z),'steel',True,.035)
    for px in [-x+.18,x-.18]:box('Continuous deck edge channel',(px,-.70,0),(.28,.45,2*z),'slate',False,.024)
    for pz in [-z+.18,z-.18]:box('Continuous deck end channel',(0,-.70,pz),(2*x,.45,.28),'slate',False,.024)
    # Cantilever bracket below the retained docking tongue. Its top stays below
    # all legacy walking treads and it never becomes a second floor surface.
    for pz in [-.72,.72]:beam('Dock tongue knee',(-x+.9,-1.60,pz),(-x-.92,-.19,pz),.17)
def tower(cx,cz,sx,sz):
    foundation(cx,cz,sx+.4,sz+.4)
    for x in [cx-sx/2,cx+sx/2]:
        for z in [cz-sz/2,cz+sz/2]:
            box('Riveted tower leg',(x,-6.15,z),(.35,12.02,.35),'steel',True)
            for y in [-.75,-4.45,-8.45,-11.8]:box('Column splice plate',(x,y,z),(.46,.38,.46),'alloy',False,.013)
    for y in [-.5,-4.5,-8.5,-12.05]:box('Tower diaphragm',(cx,y,cz),(sx+.36,.22,sz+.36),'slate',True)
    for z in [cz-sz/2,cz+sz/2]:
        for a,b in [(-12,-8.5),(-8.5,-4.5),(-4.5,-.4)]:
            beam('Captured diagonal web',(cx-sx/2,a,z),(cx+sx/2,b,z),.14)
            beam('Captured reverse web',(cx+sx/2,a,z),(cx-sx/2,b,z),.11,'umber')
    for x in [cx-sx/2,cx+sx/2]:
        for a,b in [(-12,-8.5),(-8.5,-4.5),(-4.5,-.4)]:beam('End tower diagonal',(x,a,cz-sz/2),(x,b,cz+sz/2),.14)

# Story sites: silhouette, massing and material treatment follow their use.
start('WakeRelayPodium',[6,9],'Split weathered relay masonry with exposed end bracing');cap([6,9])
wallroom(-.3,0,10.6,14.8,'stone',3,True)
for z in [-8.1,8.1]:
    for x in [-4.9,4.9]:
        box('Relay external buttress',(x,-6.2,z),(.65,12.0,.6),'slate',True)
        foundation(x,z,.92,.95)
    beam('Relay end lattice',(-4.9,-10,z),(4.9,-.65,z),.18,'umber')

start('FoundryLowerWorks',[7,5],'Tall ribbed works hall and braced loading apron');cap([7,5])
wallroom(1.4,0,10.65,9.40,'stone',3,False)
for z in [-4.30,4.30]:
    tower(-5.9,z,1.1,.8)
    beam('Loading apron transfer web',(-5.9,-4.4,z),(-3.85,-.45,z),.24)
for x in [-2.6,1.4,5.4]:
    for z in [-4.82,4.82]:box('Foundry vertical stiffener',(x,-6.3,z),(.28,11.8,.24),'green')

start('ArrayServiceBunker',[9,10],'Three segmented receiver bunker masses and transfer ribs');cap([9,10])
for x in [-5.7,0,5.7]:wallroom(x,0,4.8,18.3,'stone',2,False)
for z in [-8,-4,0,4,8]:box('Array deck transfer girder',(0,-.82,z),(17.6,.80,.34),'alloy',True)

start('OrchardServiceVault',[9,10],'Paired lower growing-service vaults and central bridge');cap([9,10])
for x in [-5,5]:wallroom(x,0,6.8,18.6,'pale',3,True)
for z in [-8,-4,0,4,8]:box('Garden bridge cross girder',(0,-1.0,z),(17.0,1.20,.32),'green',True)
for x in [-8.2,8.2]:
    for z in [-8,0,8]:box('Vault corner pilaster',(x,-6.2,z),(.35,11.8,.5),'green')

start('MeridianCivicBase',[9,10],'Maintained civic storeys with strong perimeter buttresses');cap([9,10])
wallroom(0,0,16.6,18.6,'pale',3,True)
for x in [-7.8,-3.9,0,3.9,7.8]:
    for z in [-9.55,9.55]:
        box('Civic stone pilaster',(x,-6.35,z),(.45,11.8,.45),'stone',True)
        foundation(x,z,.8,.8,'pale')

start('FuelPumpHouse',[6,5],'Sealed lower pump room with protected twin tank risers');cap([6,5])
wallroom(1.1,0,8.2,8.4,'stone',2,False)
for z in [-3.5,3.5]:
    tower(-4.7,z,1.1,1.1)
    pipe('Fuel riser',(-4.7,-11.9,z),(-4.7,-.45,z),.36,'green')
    for y in [-2.1,-5.8,-9.5]:pipe('Riser collar',(-4.7,y-.09,z),(-4.7,y+.09,z),.41)

start('SalvageDepotBase',[6,5],'Scorched cargo-store with external crossed trusses');cap([6,5])
wallroom(0,0,10.8,8.4,'stone',2,False)
for z in [-4.5,4.5]:
    for x in [-5.3,5.3]:
        for y in [-12,-6.4,-.7]:box('Depot brace wall cleat',(x,y,z*.97),(.42,.40,.54),'steel',False,.01)
    for a,b in [(-12,-6.4),(-6.4,-.7)]:
        beam('Depot external crossbrace',(-5.3,a,z),(5.3,b,z),.24,'umber')
        beam('Depot reverse crossbrace',(5.3,a,z),(-5.3,b,z),.18)

start('MemorialListeningPlinth',[6,5],'Stepped stone listening plinth with quiet recessed bands');cap([6,5])
wallroom(0,0,8.6,7.8,'pale',0,False)
for y in [-2.5,-5.5,-8.5,-11.5]:box('Memorial shadow course',(0,y,0),(9,.18,8.2),'slate')
for x in [-5.2,5.2]:
    box('Memorial wing buttress',(x,-6.2,0),(.8,11.9,7.6),'stone',True);foundation(x,0,1.1,7.8)

start('RepairBayBlock',[6,5],'Lower service workshops with three closed shutter bays');cap([6,5])
wallroom(0,0,10.8,8.8,'stone',1,True)
for x in [-3.4,0,3.4]:
    box('Closed maintenance shutter',(x,-8.2,-4.46),(2.55,5.7,.10),'green')
    for y in [-10.7+i*.35 for i in range(16)]:box('Shutter interlocking slat',(x,y,-4.54),(2.50,.055,.06),'steel',False,.007)
    for side in [-1,1]:box('Captured shutter track',(x+side*1.32,-8.2,-4.53),(.12,5.8,.18),'alloy')

start('RefugeResidentialBase',[6,5],'Three occupied-looking lower storeys with shuttered windows');cap([6,5])
wallroom(0,0,10.9,8.9,'pale',3,True)
for z in [-4.6,4.6]:
    for x in [-3.7,0,3.7]:box('Sunshade over boarded window',(x,-1.3,z),(2.3,.11,.62),'green')

start('WorkshopLowerShop',[6,5],'Framed repair shop below open rooftop work area');cap([6,5])
wallroom(0,0,10.9,8.9,'stone',3,False)
for z in [-4.6,4.6]:
    for x in [-5.2,0,5.2]:box('Workshop frame upright',(x,-6.2,z),(.23,11.9,.24),'green',True)
    beam('Shop panel knee',(-5.2,-4.3,z),(0,-.5,z),.15)
    beam('Shop panel knee',(5.2,-4.3,z),(0,-.5,z),.15)
# Raised archive overhang remains connected via its original diagonal supports.

start('RecoveryLoadingTower',[6,4],'Freight lift tower with rear equipment/service shaft');cap([6,4])
wallroom(2.8,0,4.9,6.6,'stone',2,False)
tower(-2.8,0,4.7,6.4)
for z in [-3.5,3.5]:box('Freight lift guide',(-3,-6.2,z),(.18,11.9,.22),'alloy')

start('DispatchStoreBase',[6,5],'Supplies-store lower block with long captured cladding bands');cap([6,5])
wallroom(0,0,10.9,8.9,'stone',2,False)
for z in [-4.55,4.55]:
    for y in [-2,-6,-10]:box('Dispatch fascia band',(0,y,z),(10.6,.32,.12),'umber')

start('QuietWatchBase',[6,5],'Shielded listening post with paired narrow instrumentation towers');cap([6,5])
wallroom(0,0,8.9,8.9,'stone',3,False)
for x in [-5.1,5.1]:tower(x,0,.65,7.8)

start('ReceivingCaisson',[6,7],'Paired receiving caissons with tied steel transfer frame');cap([6,7])
for x in [-3.5,3.5]:wallroom(x,0,4.3,12.2,'pale',2,False)
for z in [-5.8,0,5.8]:box('Receiving deep transfer beam',(0,-2.0,z),(11.4,1.0,.38),'green',True)

# A single shared closed foundation template and a compact cast grade collar.
start('FoundationUnit',[.5,.5],'Runtime scales only buried closed foundations')
box('Closed buried foundation',(0,.5,0),(1,1,1),'stone',False,0)
start('GradeCollar',[.5,.5],'Broad terrain seated cast footing collar')
box('Cast collar',(0,.5,0),(1,1,1),'pale',False,.02)
# Existing distant city already has full height towers; its berm alone needs a
# continuous buried side beneath its y=0 bottom, not another tall building.
start('HorizonBermSkirt',[46,16],'Existing city berm extended into dune field')
foundation(0,0,91.9,31.9);models[current.name]['foundations'][0]['top']=.10

for r in roots:k.prepare(r)
from finish_source import clean
clean(roots,models)
# Preserve editable individual beams, plates, windows and joints before batching.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'SiteGrounding.blend'),compress=True)
for r in roots:
    tris=0;verts=[]
    for o in r.children_recursive:
        if o.type=='MESH':
            o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
            verts += [[p.x,p.z,-p.y] for p in [o.matrix_world@v.co for v in o.data.vertices]]
    models[r.name]['triangles']=tris
    if verts:models[r.name]['bounds']={'min':[min(p[i] for p in verts) for i in range(3)],'max':[max(p[i] for p in verts) for i in range(3)]}
    k.merge(r)
    models[r.name]['batches']=len([o for o in r.children_recursive if o.type=='MESH'])
path=ROOT/'godot/art/native-site-grounding.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_extras=True,export_tangents=True,export_vertex_color='NAME',export_vertex_color_name='RoofPigment',export_all_vertex_colors=False)
manifest={'version':1,'path':'res://art/native-site-grounding.glb','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':'assets/site-grounding/SiteGrounding.blend','models':models,'terrainBound':[-6.5,6.5],'embeddedBottom':-6.7,'floorChange':0,'note':'Original upper assets untouched. Measured added architecture top is -0.12527 m, seated inside the original platform underside.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ROOT/'godot/data/site-grounding.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print('SITE_GROUNDING_EXPORT_COMPLETE',path.stat().st_size,sum(x['triangles'] for x in models.values()),flush=True)
