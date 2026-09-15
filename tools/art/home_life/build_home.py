"""Original Nomad furnishings, in metres; shared weathered industrial palette."""
import sys, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
import bpy
c.OUT=ROOT/'assets/home-life';c.OUT.mkdir(exist_ok=True);(c.OUT/'exports').mkdir(exist_ok=True)
root=c.empty('NomadHome')
fabric=c.flat('Home_WovenCanvas',(.15,.105,.065),rough=.94)
weave=bpy.data.images.new('Home_WovenNormal',width=256,height=256)
pixels=[]
for y in range(256):
    for x in range(256):
        dx=.24*math.cos(x*math.pi/2)*(.65+.35*math.sin(y*math.pi/8))
        dy=.24*math.cos(y*math.pi/2)*(.65+.35*math.sin(x*math.pi/8))
        pixels.extend((.5+dx,.5+dy,.93,1))
weave.pixels.foreach_set(pixels);weave.pack();weave.colorspace_settings.name='Non-Color'
tex=fabric.node_tree.nodes.new('ShaderNodeTexImage');tex.image=weave
normal=fabric.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.28
fabric.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
fabric.node_tree.links.new(normal.outputs['Normal'],fabric.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
padding=c.flat('Home_SeatLeather',(.065,.035,.021),rough=.81)
paper=c.flat('Home_SavedPaper',(.51,.40,.24),rough=.98)
chair=c.empty('HomeChair',parent=root)
for x in [-.29,.29]:
    for z in [-.27,.27]:
        c.tube('Tubular leg',(x,.04,z),(x,.57,z),.028,c.bare,chair)
        c.box('Bolted foot',(x,.035,z),(.11,.06,.10),c.steel,chair,.014)
    c.tube('Armrest support',(x,.47,-.22),(x,.80,-.22),.022,c.brass,chair)
    c.tube('Armrest',(x,.80,-.26),(x,.80,.23),.033,c.bare,chair)
    c.tube('Back frame',(x,.40,.26),(x,1.11,.35),.031,c.bare,chair)
c.box('Seat pan',(0,.50,0),(.66,.085,.64),c.steel,chair,.06)
c.box('Recovered cushion',(0,.57,0),(.58,.11,.56),padding,chair,.046)
c.box('Padded back',(0,.91,.30),(.54,.36,.09),padding,chair,.04)
for x in [-.255,.255]:
    c.cable('Hand stitched seam',[(x,.632,-.23),(x,.635,0),(x,.632,.23)],.003,paper,chair)
for x in [-.12,.12]:
    c.tube('Back securing rivet',(x,.95,.238),(x,.95,.248),.011,c.brass,chair)
c.box('Repair relay',(0,.22,.26),(.30,.14,.10),c.ivory,chair,.018)
c.cable('Low voltage repair lead',[(0,.28,.28),(.22,.32,.30),(.25,.46,.29)],.012,c.dark,chair)
c.box('Service indicator',(.09,.24,.20),(.026,.018,.008),c.cyan,chair,.003)
table=c.empty('HomeTable',parent=root)
c.box('Reused machine hatch',(0,.78,0),(1.25,.10,.79),c.ivory,table,.045)
c.box('Steel table apron',(0,.70,0),(1.10,.10,.65),c.steel,table,.02)
for x in [-.49,.49]:
    for z in [-.25,.25]:c.tube('Braced table leg',(x,.025,z),(x,.73,z),.036,c.bare,table)
    c.tube('Cross brace',(x,.20,-.25),(x,.57,.25),.018,c.brass,table)
for x in [-.52,.52]:
    for z in [-.30,.30]:c.tube('Hatch bolt',(x,.83,z),(x,.84,z),.018,c.brass,table)
c.box('Folded route map',(-.12,.838,.02),(.50,.006,.35),paper,table,.001)
for i in range(5):
    c.tube('Map route',(-.32+i*.08,.843,-.10),(-.30+i*.08,.843,.15),.0025,c.red,table,8)
c.tube('Enamel cup',(.40,.84,.12),(.40,.95,.12),.06,c.ivory,table,24)
c.tube('Cup dark opening',(.40,.951,.12),(.40,.952,.12),.049,c.dark,table,24)
c.cable('Cup handle',[(.455,.93,.12),(.49,.94,.12),(.49,.865,.12),(.455,.865,.12)],.010,c.ivory,table)
rug=c.empty('HomeRug',parent=root)
c.box('Layered patched blanket',(0,.025,0),(1.30,.032,1.65),fabric,rug,.013)
for x in [-.57,.57]:c.box('Woven border',(x,.044,0),(.065,.006,1.50),c.red,rug,.002)
for z in [-.71,.71]:c.box('Woven end border',(0,.044,z),(1.17,.006,.065),c.red,rug,.002)
for i in range(28):
    x=-.59+i*.044
    for s in [-1,1]:c.cable('Knotted fringe',[(x,.03,s*.78),(x+.005,.024,s*.86),(x-.01,.018,s*.89)],.0035,paper,rug)
for i in range(13):
    z=-.58+i*.093
    c.tube('Weft stitch',(-.48,.046,z),(.48,.046,z),.0017,paper,rug,6)
c.box('Mended corner',(.34,.046,.46),(.26,.009,.22),padding,rug,.008)
shelf=c.empty('HomeShelf',parent=root)
for x in [-.52,.52]:
    c.box('Perforated upright',(x,.79,.15),(.055,1.55,.045),c.steel,shelf,.008)
    for y in [.18,.62,1.07,1.50]:
        c.tube('Shelf rivet',(x,y,.116),(x,y,.12),.012,c.brass,shelf,12)
for y in [.15,.62,1.08,1.50]:
    c.box('Folded metal shelf',(0,y,0),(1.14,.05,.43),c.ivory,shelf,.018)
    c.box('Rolled shelf lip',(0,y+.025,-.21),(1.12,.065,.02),c.bare,shelf,.005)
c.tube('Diagonal back stay',(-.5,.2,.2),(.5,1.46,.2),.018,c.brass,shelf)
for i in range(6):
    c.box('Preserved archive cassette',(-.42+i*.081,.35,.025),(.060,.32,.25),c.red if i%3==0 else c.steel,shelf,.012)
    c.box('Cassette paper label',(-.42+i*.081,.36,-.104),(.045,.11,.005),paper,shelf,.002)
c.box('Linen covered memory box',(.25,.80,.03),(.42,.28,.32),fabric,shelf,.025)
c.box('Memory box clasp',(.25,.79,-.141),(.075,.068,.009),c.brass,shelf,.006)
c.box('Frame surround',(0,1.27,-.01),(.52,.32,.035),c.brass,shelf,.013)
c.box('Memory display face',(0,1.27,-.034),(.46,.265,.008),c.dark,shelf,.003)
display=c.empty('KeepsakeLit',parent=shelf)
c.box('Preserved waveform',(0,1.27,-.041),(.405,.012,.005),c.cyan,display,.002)
for i in range(18):
    x=-.18+i*.021;h=.025+.085*abs(math.sin(i*1.7))
    c.box('Waveform bar',(x,1.27,-.042),(.006,h,.006),c.cyan,display,.002)
c.label('Home plaque','KEEP WHAT MATTERS',(0,1.46,-.217),.046,shelf)
for node,piece in [(chair,'chair'),(table,'table'),(rug,'rug'),(shelf,'shelf')]:node['pieceId']=piece
# Small furnishings own a 512px palette. Prefixing prevents these compact maps
# from replacing the larger shared Array textures used by entire destinations.
for material in bpy.data.materials:
    if material.name.startswith('Array_'):material.name=material.name.replace('Array_','Home_',1)
for image in bpy.data.images:
    if max(image.size)>512:image.scale(512,512);image.pack()
c.export('home-furnishings',root,[chair,table,rug,shelf,display])
