"""Second, model-specific art pass on 25 existing desert assemblies.

Reuses editable original geometry recipes, preserves original library files,
replaces inappropriate corrugation painted onto smooth metal, and adds service
hardware with physically connected supports. Z up in Blender, metres.
"""
import bpy, math, json, sys, random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art100/legacy';OUT.mkdir(parents=True,exist_ok=True)
(OUT/'renders').mkdir(exist_ok=True)
if '--export-only' in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'Art100_DesertRefinement.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for spec in json.loads((OUT/'manifest.json').read_text()):
        obj=bpy.data.objects[spec['id']];obj.location=(0,0,0);obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Portable tangent triangulation','TRIANGULATE')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art100-legacy.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,export_materials='EXPORT')
    sys.exit(0)
source=ROOT/'tools/art/desert_ruins/build.py'
api={'__file__':str(source),'__name__':'art100_original_geometry'}
exec(compile(source.read_text().split('for idx,(name,builder)')[0],str(source),'exec'),api)
scene=bpy.context.scene
f=api['refinement'];box=api['box'];rod=api['rod'];ring=api['ring'];tube=f.tube
IDS=['wreck-pickup','wreck-ambulance','wreck-forklift','survey-rover','rail-bogie',
     'container-wagon','fuel-trailer','wreck-motorcycle','culvert','transformer',
     'fuel-pump','utility-cabinet','telecom-cabinet','condenser','satellite-dish',
     'light-tower','diesel-generator','air-compressor','fire-hydrant','bulk-fuel-tank',
     'cargo-pallet','cable-spool','road-barrier','signal-gantry','bus-shelter']

def field(rng,n,size=512):
    a=rng.random((n,n));x=np.linspace(0,n-1,size)
    b=np.array([np.interp(x,np.arange(n),row) for row in a])
    return np.array([np.interp(x,np.arange(n),col) for col in b.T]).T

def atlas():
    """One packed PBR atlas; preserve original authored wayfinding graphics.

    Materials reflect their substrate. No corrugated pattern on flat castings,
    no arbitrary black scratches, and metalness is zero on corrosion/ceramic.
    """
    old=api['mat'];nodes=old.node_tree.nodes
    original={n.label:n.image for n in nodes if n.type=='TEX_IMAGE'}
    arrays={}
    for key in ['BaseColor','Normal','ORM']:
        im=original[key];w,h=im.size
        data=np.array(im.pixels[:],dtype=np.float32).reshape((h,w,4))
        arrays[key]=data[np.linspace(0,h-1,2048).astype(int)][:,np.linspace(0,w-1,2048).astype(int)].copy()
    palette={0:(.29,.285,.255),1:(.68,.66,.54),2:(.22,.105,.055),3:(.21,.29,.26),
             4:(.028,.032,.031),5:(.19,.215,.21),6:(.27,.14,.095),7:(.50,.48,.37),
             8:(.12,.22,.23),9:(.25,.17,.095),14:(.43,.29,.085)}
    metal={0:0,1:0,2:.16,3:.45,4:0,5:.78,6:0,7:.36,8:.40,9:0,14:.32}
    rough={0:.88,1:.51,2:.85,3:.63,4:.86,5:.49,6:.9,7:.70,8:.63,9:.89,14:.62}
    for tile,color in palette.items():
        rng=np.random.default_rng(261001+tile*811)
        broad=field(rng,9);fine=field(rng,77);grain=rng.random((512,512))
        variation=(broad-.5)*.12+(fine-.5)*.033+(grain-.5)*.013
        rgb=np.array(color)[None,None,:]*(1+variation[:,:,None])
        # Small irregular coating losses; kept sparse so silhouettes and joins read.
        worn=np.clip((field(rng,23)-.80)*6,0,1) if tile in [3,7,8,14] else np.zeros((512,512))
        rgb=rgb*(1-worn[:,:,None]*.6)+np.array((.17,.105,.065))[None,None,:]*worn[:,:,None]*.6
        if tile==9:
            # Longitudinal grain is limited to timber, where it belongs.
            lines=field(rng,50)*.4+grain*.1
            for i in range(5):lines=(lines+np.roll(lines,1,axis=0)+np.roll(lines,-1,axis=0))/3
            rgb*=.94+lines[:,:,None]*.16
        y=(3-tile//4)*512;x=tile%4*512
        arrays['BaseColor'][y:y+512,x:x+512,:3]=np.clip(rgb,0,1)
        arrays['ORM'][y:y+512,x:x+512,0]=1
        arrays['ORM'][y:y+512,x:x+512,1]=np.clip(rough[tile]+(fine-.5)*.08+worn*.12,0,1)
        arrays['ORM'][y:y+512,x:x+512,2]=metal[tile]*(1-worn*.8)
        gx=np.roll(fine,1,1)-np.roll(fine,-1,1);gy=np.roll(fine,1,0)-np.roll(fine,-1,0)
        arrays['Normal'][y:y+512,x:x+512,:3]=np.stack((.5+gx*.10,.5+gy*.10,np.ones_like(gx)),2)
    for key,data in arrays.items():
        im=bpy.data.images.new('Art100_Desert_'+key,width=2048,height=2048,alpha=False)
        im.colorspace_settings.name='sRGB' if key=='BaseColor' else 'Non-Color'
        im.pixels.foreach_set(data.ravel());im.filepath_raw=str(OUT/('Art100_Desert_'+key+'.png'));im.file_format='PNG';im.save();im.pack()
        next(n for n in nodes if n.type=='TEX_IMAGE' and n.label==key).image=im
    old.name='Art100 restrained substrate atlas'
    next(n for n in nodes if n.type=='NORMAL_MAP').inputs['Strength'].default_value=.35

def plate(label,at,w=.36,h=.13,tile=1):
    x,y,z=at;box('Recessed enamel service plate '+label,(x,y,z),(w,.018,h),5,.006)
    bpy.ops.object.text_add(location=(x,y-.012,z-h*.28));o=bpy.context.object
    o.name='Embossed '+label;o.data.body=label;o.data.align_x='CENTER';o.data.size=min(h*.58,w/max(1,len(label))*.95)
    o.data.extrude=.0007;o.data.resolution_u=2;o.rotation_euler=(math.pi/2,0,0)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.data.materials.append(api['mat']);api['uv_project'](o,tile);api['parts'].append(o)

def lug(at,r=.10):
    x,y,z=at;box('Welded lifting-eye foot',(x,y,z),(.22,.09,.06),5,.01)
    ring('Forged lifting eye',(x,y,z+r),r,.026,5)

DETAILS={}
def refine(name):
    if name=='wreck-pickup':
        for x in [-.89,.89]:
            tube('Cargo tie-down rail',[(x,.42,1.54),(x,.42,1.63),(x,2.34,1.63),(x,2.34,1.54)],.027,5)
            tube('Tailgate limit cable',[(x,2.41,1.33),(x,2.68,.62)],.012,5,8)
        box('Bed electrical toolbox',(0,.55,1.04),(1.68,.42,.45),8,.045)
        box('Toolbox overlapping rain lid',(0,.55,1.28),(1.74,.47,.045),5,.013)
        f.vent((0,-2.26,.94),.80,.18,rows=4);plate('FIELD / 12',(0,.327,1.06),.47)
        DETAILS[name]='Cargo rail weldments, tethered dropped tailgate, rain-lipped toolbox and inset cooling grille; smoother enamel and convincing exposed steel.'
    elif name=='wreck-ambulance':
        door=next(p for p in api['parts'] if p.name.startswith('open ambulance rear door'))
        door.location.x=1.08+.5*math.cos(.55);door.location.y=2.73+.5*math.sin(.55)
        for z in [1.1,2.25]:rod('Rear medical door hinge',(1.08,2.73,z-.09),(1.08,2.73,z+.09),.045,5,16)
        for x in [-.78,.78]:
            rod('Rear step bracket',(x,2.58,.71),(x,3.02,.39),.035,5)
        box('Anti-slip rear loading step',(0,2.99,.38),(1.75,.35,.07),5,.018)
        for x in [-.67,.67]:
            f.lathe('Emergency oxygen cylinder',(x,1.8,.82),[(0,.11),(.68,.11),(.76,.085),(.79,.03)],1,28)
            for z in [1.03,1.40]:ring('Oxygen retaining strap',(x,1.8,z),.119,.012,5,(0,0,0))
            box('Oxygen bottle wall cradle',(x,1.93,1.18),(.19,.15,.62),5,.015)
        plate('MED / 03',(0,-2.77,.75),.50,.11)
        DETAILS[name]='Supported stretcher loading step, strapped oxygen bottles and wall cradles; softened ceramic and medical enamel instead of corrugated surfaces.'
    elif name=='wreck-forklift':
        for x in [-.43,.43]:
            rod('Lift chain return sheave',(x-.045,-1.41,2.94),(x+.045,-1.41,2.94),.10,5,24)
            for z in np.arange(.94,2.86,.09):box('Paired roller chain link',(x,-1.52,float(z)),(.036,.024,.060),5,.005)
        box('Operator pedal',(0,-.53,.86),(.24,.20,.045),4,.015)
        tube('Seat belt', [(-.27,.25,1.34),(0,.15,1.35),(.27,.25,1.34)],.025,4,8)
        plate('LIFT 02',(0,1.361,.99),.5,.14)
        DETAILS[name]='Mast sheaves and roller chains, operator pedal and fitted restraint; matte rubber, forged fork steel and clean rounded counterweight.'
    elif name=='survey-rover':
        # The old grid was horizontal while its panel was tilted, and the
        # panel itself had no hinges. Keep every conductor on its own skin.
        for obj in list(api['parts']):
            if obj.name.startswith('solar panel grid'):
                api['parts'].remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
        for x in [-1.05,1.05]:
            angle=x*.2
            def wing(u,y,v=.027):return (x+u*math.cos(angle)+v*math.sin(angle),y,1.68-u*math.sin(angle)+v*math.cos(angle))
            for y in [-.8,-.4,0,.4,.8]:rod('Solar conductor seated on tilted wing',wing(-.27,y),wing(.27,y),.007,5,6)
            for y in [-.65,.65]:
                p=wing(-.12*(1 if x>0 else -1),y,-.025)
                box('Panel hinge shoe',(p[0],y,1.48),(.13,.17,.045),5,.01)
                rod('Supported solar hinge', (p[0],y,1.50),p,.029,5,16)
        for x in [-1,1]:
            for y in [-1.2,0,1.2]:rod('Suspension diagonal damper',(x*.85,y-.21,.64),(x*1.10,y,.43),.036,5,16)
        box('Sealed instrument junction enclosure',(0,-1.44,1.18),(.7,.14,.32),5,.035)
        for x in [-.26,0,.26]:rod('Cable gland',(x,-1.50,1.11),(x,-1.61,1.11),.035,4,16)
        tube('Sample arm protected loom',[(.45,-1.45,1.03),(.73,-1.75,.90),(1.04,-2.05,.50)],.023,4)
        plate('SURVEY / 06',(0,-1.519,1.22),.53,.10)
        DETAILS[name]='Six suspension dampers, weather-sealed junction enclosure and protected sampling-arm loom; subtle solar and optical housing wear.'
    elif name in ['rail-bogie','container-wagon']:
        for yy in ([0] if name=='rail-bogie' else [-2.8,2.8]):
            for x in [-.95,.95]:
                for y in [-.92,.92]:
                    rod('Continuous cast wheel web',(x-.025,y+yy,.43),(x+.035,y+yy,.43),.401,5,40)
            for x in [-.91,.91]:
                for y in [-.60,.60]:box('Curved brake shoe hanger',(x,y+yy,.57),(.14,.12,.26),2,.03,rot=(.17 if y<0 else -.17,0,0))
            rod('Pneumatic brake cylinder',(-.46,yy,.70),(.35,yy,.70),.11,5,24)
            tube('Air brake feed pipe',[(-.46,yy,.72),(-.58,yy-.3,.62),(-.58,yy-.9,.67)],.018,2)
        if name=='container-wagon':
            for obj in list(api['parts']):
                if obj.name.startswith(('open freight door','door locking bar')):
                    api['parts'].remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
            for side,angle in [(-1,-2.39),(1,2.54)]:
                hinge=Vector((side*1.16,-3.75,2.53));inside=-side
                center=hinge+Vector((inside*.60*math.cos(angle),inside*.60*math.sin(angle),0))
                box('Hinge-connected open freight door',center,(1.2,.09,2.17),3,.03,(0,0,angle))
                u=inside*.46;v=-.068
                x=center.x+u*math.cos(angle)-v*math.sin(angle);y=center.y+u*math.sin(angle)+v*math.cos(angle)
                rod('Locking bar follows door plane',(x,y,1.50),(x,y,3.50),.025,5,12)
                for z in [1.70,3.26]:rod('Frame-connected freight hinge',(hinge.x,hinge.y,z-.09),(hinge.x,hinge.y,z+.09),.047,5,16)
            for x in [-1.25,1.25]:
                for y in [-3.24,3.24]:tube('Freight access stirrup',[(x,y,1.18),(x,y,.81),(x,y+.30,.81),(x,y+.30,1.18)],.029,5)
            plate('CONVOY / 42',(0,3.81,2.54),.9,.20)
        DETAILS[name]='Physically linked pneumatic brakes, shoe hangers and protected feed pipes'+('; freight access stirrups and identification plaque.' if name=='container-wagon' else '; machined wheel flanges and cast frame material separation.')
    elif name=='fuel-trailer':
        for x in [-1.0,1.0]:
            tube('Safety tow tether',[(x*.6,-1.55,.49),(x*.45,-2.25,.24),(x*.15,-2.62,.46)],.019,5)
            box('Rear lamp mounting tab',(x*.70,1.69,.81),(.25,.10,.21),5,.02)
            box('Faded rear warning lens',(x*.70,1.748,.83),(.18,.018,.10),2,.016)
        box('Rear safety beam',(0,1.76,.49),(1.77,.10,.14),5,.025)
        plate('FUEL / 17',(0,-1.535,1.37),.5,.13)
        DETAILS[name]='Supported rear safety beam, inset warning lenses and hanging tow tethers; longitudinal tank coating without false corrugation.'
    elif name=='wreck-motorcycle':
        for y in [-.9,.94]:
            ring('Vented brake disc',(.115,y,.4),.21,.021,5,(0,math.pi/2,0))
            box('Brake caliper',(.13,y-.16,.46),(.12,.13,.14),5,.025)
        tube('Brake hydraulic cable',[(.36,-.62,1.24),(.23,-.65,1.05),(.15,-.89,.57)],.013,4,8)
        box('Rear rack platform',(0,.85,1.11),(.42,.34,.045),5,.012)
        for x in [-.16,.16]:rod('Rear rack strut',(x,.67,.71),(x,.97,1.08),.018,5)
        DETAILS[name]='Vented brake discs, calipers and curved brake line; supported luggage rack and restrained tank enamel.'
    elif name=='culvert':
        for x in [-1.6,1.6]:
            for y in [-1.8,-2.3]:rod('Wingwall drainage outlet',(x,y,.26),(x-.20*(1 if x>0 else -1),y,.26),.065,4,20)
        for x in [-.7,.1,.7]:tube('Bent exposed edge reinforcement',[(x,-2.49,2.31),(x,-2.68,2.28),(x+.10,-2.77,2.04)],.018,2)
        box('Cast footing at inlet',(0,-2.67,.07),(2.33,.40,.14),0,.045)
        DETAILS[name]='Drainage weep outlets, bent exposed reinforcement and a cast inlet apron; fine mineral aggregate instead of large mottled blobs.'
    elif name=='transformer':
        for x in [-.66,.66]:lug((x,-.45,1.91),.085)
        tube('Conservator oil return',[(-.70,.65,2.1),(-.85,.65,1.75),(-.77,.28,1.61)],.038,2)
        box('Sealed terminal inspection cover',(0,-.715,.87),(.49,.045,.34),5,.025)
        plate('GRID / T4',(0,-.746,.88),.40,.11)
        DETAILS[name]='Lifting eyes, connected conservator return and sealed inspection cover; porcelain, steel fins and enamel read as distinct materials.'
    elif name=='fuel-pump':
        box('Lower maintenance hatch',(0,-.342,.67),(.63,.024,.70),3,.05)
        for z in [.42,.90]:rod('Hatch captive hinge',(-.30,-.37,z-.045),(-.30,-.37,z+.045),.02,5,12)
        plate('LITRES',(0,-.393,2.045),.48,.10);plate('00 482',(0,-.420,1.854),.61,.15)
        ring('Nozzle parking escutcheon',(.50,-.35,1.60),.07,.018,5)
        DETAILS[name]='Readable mechanical meter numerals, hinged maintenance hatch and nozzle parking escutcheon; cast rounded housing with light coating wear.'
    elif name in ['utility-cabinet','telecom-cabinet']:
        box('Overhanging rain channel',(0,0,2.34),(1.53,.98,.06),5,.018)
        for x in [-.42,.42]:
            for z in [.22,.47]:ring('Conduit compression collar',(x,.60,z),.067,.016,5,(0,0,0))
        if name=='utility-cabinet':
            box('Isolator surround',(.36,-.50,1.82),(.48,.025,.32),5,.022)
            plate('ISOLATE',(0,-.497,2.08),.55,.11)
        else:
            tube('Protected external earth conductor',[(.86,.15,1.67),(.84,.4,.60),(.50,.57,.16)],.015,2)
            plate('RELAY / 8',(0,-.497,2.07),.57,.13)
        DETAILS[name]='Rain-shedding roof channel, compression fittings and '+('recessed isolator surround.' if name=='utility-cabinet' else 'external earth conductor and radio identity plate.')+' Smooth steel doors replace painted-on corrugation.'
    elif name=='condenser':
        for x in [-.68,.68]:
            for a in [0,math.pi/2,math.pi,math.pi*1.5]:rod('Fan grille radial support',(x,0,1.45),(x+.48*math.cos(a),.48*math.sin(a),1.45),.012,5)
        box('Fan contactor enclosure',(1.33,-.28,.95),(.12,.42,.34),8,.032)
        tube('Contactor conduit',[(1.35,-.3,.78),(1.46,-.3,.53),(1.10,-.3,.32)],.023,4)
        plate('AIR / 22',(0,-.747,1.22),.58,.11)
        DETAILS[name]='Supported fan grille spokes, separate contactor box and connected conduit; fine fin contrast and flat enclosure coating.'
    elif name=='satellite-dish':
        rod('Azimuth gearbox',(0,-.16,.96),(0,-.49,.96),.16,5,32)
        tube('Elevation adjustment linkage',[(0,-.18,1.19),(0,-.52,1.64),(0,-.13,2.19)],.035,5)
        for x in [-.22,.22]:rod('Elevation pivot pin',(x-.045,0,2.16),(x+.045,0,2.16),.105,5,28)
        plate('RX / 05',(0,-.189,.64),.27,.09)
        DETAILS[name]='Azimuth gear housing, elevation linkage and pivot pins give the reflector an understandable mount; smooth reflector coating.'
    elif name=='light-tower':
        rod('Mast hand-winch drum',(-.19,.13,1.73),(.19,.13,1.73),.12,5,24)
        tube('Hand winch crank',[(.22,.13,1.73),(.25,.13,1.91),(.39,.13,1.91)],.021,5)
        tube('Lift cable',[(0,.13,1.74),(0,.12,4.35),(0,.32,4.51)],.010,5,8)
        for x in [-.73,-.24,.24,.73]:tube('Floodlight yoke',[(x-.2,.3,6.09),(x-.2,.3,6.30),(x+.2,.3,6.30),(x+.2,.3,6.09)],.018,5)
        DETAILS[name]='Visible hand winch, continuous lift cable and individual lamp yokes; quieter lens material and scoured mast sections.'
    elif name=='diesel-generator':
        for x in [-.52,.52]:lug((x,.25,2.05),.10)
        box('Output breaker housing',(.55,-1.375,1.20),(.38,.07,.38),5,.028)
        for x in [.43,.62]:rod('Capped power connector',(x,-1.40,1.20),(x,-1.49,1.20),.05,4,20)
        plate('DIESEL / 40',(0,-1.407,1.87),.79,.13)
        DETAILS[name]='Forged lifting eyes and recessed breaker/output assembly; satin enamel, oily steel skid and properly recessed readable panel.'
    elif name=='air-compressor':
        for z in [1.69,1.87]:ring('Motor cooling band',(0,.50,z),.14,.015,5,(0,0,0))
        box('Pressure-switch box',(.40,-.64,1.42),(.25,.23,.20),8,.034)
        tube('Pressure switch sense line',[(.40,-.65,1.32),(.40,-.80,1.12),(.18,-.75,1.09)],.014,2)
        plate('AIR / 08',(0,-1.356,.91),.42,.12)
        DETAILS[name]='Pressure-switch housing and capillary sensing line, motor cooling details and receiver identity; brushed motor and painted tank separation.'
    elif name=='fire-hydrant':
        ring('Cast bonnet gasket',(0,0,.915),.231,.017,4,(0,0,0))
        for a in range(6):
            t=a*math.tau/6;rod('Bonnet captive stud',(.23*math.cos(t),.23*math.sin(t),.90),(.23*math.cos(t),.23*math.sin(t),.965),.022,5,6)
        rod('Front service outlet',(0,-.03,.59),(0,-.26,.59),.12,2,32)
        rod('Service outlet hex cap',(0,-.26,.59),(0,-.34,.59),.14,5,6)
        DETAILS[name]='Six-stud bonnet flange with a gasket and front service outlet; controlled cast-iron oxidation and machined cap edges.'
    elif name=='bulk-fuel-tank':
        for x in [-.44,.44]:box('Roof access walkway',(x,0,3.45),(.18,3.6,.05),5,.012)
        for x in [-.44,.44]:
            for y in [-1.65,1.65]:
                box('Welded walkway saddle stand-off',(x,y,3.35),(.13,.19,.16),5,.015)
        tube('Tank pressure vent',[(.45,.70,3.28),(.45,.70,3.86),(.45,.90,3.89)],.044,5)
        ring('Vent rain-cap lip',(.45,.90,3.89),.08,.02,5,(0,0,0))
        plate('RESERVE / 06',(0,-3.113,1.91),.96,.18)
        DETAILS[name]='Supported maintenance walkway, pressure breather and vessel ID; believable large smooth tank skin with fine roughness variation.'
    elif name=='cargo-pallet':
        for x in [-.43,.38]:
            for y in [-.46,.46]:box('Packing-band tensioner',(x-.08,y-.03,1.087),(.19,.085,.045),5,.012)
        plate('FRAGILE',(-.43,-.546,.89),.49,.10);plate('PARTS',(.38,-.546,.89),.44,.10)
        for x in [-.74,.73]:box('Timber fork bearing block',(x,0,.13),(.18,.48,.23),9,.023)
        DETAILS[name]='Tensioned band ratchets, handling plaques and timber fork bearing blocks; restrained wood grain and separate metal shipping cases.'
    elif name=='cable-spool':
        for a in range(8):
            t=a*math.tau/8
            rod('Reel tie rod',(.72*math.cos(t),.72*math.sin(t),.15),(.72*math.cos(t),.72*math.sin(t),1.32),.018,5,10)
        box('Cable end connector',(1.60,.51,.095),(.22,.12,.11),5,.026)
        rod('Connector strain-relief',(1.48,.51,.095),(1.61,.51,.095),.051,4,20)
        DETAILS[name]='Full-depth flange tie rods and a supported cable-end connector with strain relief; fine wood and rubber surface detail.'
    elif name=='road-barrier':
        for y in [-1.40,1.40]:
            box('Coupler load spreader',(0,y,.38),(.19,.11,.46),5,.018)
        for y in [-.9,.9]:box('Safety reflector mounting pad',(-.235,y,.57),(.05,.32,.22),5,.012,rot=(0,-.48,0))
        for y in [-.9,.9]:box('Faded safety reflector',(-.268,y,.58),(.02,.26,.14),14,.008,rot=(0,-.48,0))
        # The cast concrete profile previously had completely razor-sharp edges.
        o=next(p for p in api['parts'] if p.name.startswith('chipped jersey barrier'))
        m=o.modifiers.new('Cast chamfered concrete arris','BEVEL');m.width=.017;m.segments=2
        DETAILS[name]='Chamfered concrete arrises, coupling load spreaders and backed reflectors on both faces; granular mineral finish.'
    elif name=='signal-gantry':
        for x in [-2,1.5]:
            for dx in [-.9,.9]:
                tube('Maintenance light bracket',[(x+dx,-.3,5.20),(x+dx,-.83,5.20),(x+dx,-.88,5.08)],.032,5)
                box('Shielded sign lamp',(x+dx,-.87,5.11),(.32,.20,.10),5,.026)
        tube('Connected sign electrical conduit',[(4,.15,.45),(4,.15,5.45),(1.5,.15,5.45),(-2,.15,5.45)],.020,4)
        box('Gantry junction box',(4,-.01,1.34),(.29,.30,.49),8,.04)
        DETAILS[name]='Bracket-mounted sign lights, continuous electrical conduit and junction housing; original wayfinding graphics preserved.'
    elif name=='bus-shelter':
        for x in [-1.10,1.10]:
            tube('Bench cast armrest',[(x,-.05,.70),(x,-.05,.95),(x,.39,.95),(x,.39,.70)],.028,5)
        tube('Roof gutter', [(-2.22,-.94,2.78),(2.22,-.94,2.78),(2.22,-.94,2.56)],.034,5)
        tube('Shelter drainpipe',[(2.22,-.94,2.57),(2.12,-.67,2.42),(2.12,-.67,.17)],.027,5)
        plate('ROUTE / 07',(-1.46,.618,2.39),.85,.18)
        DETAILS[name]='Bench armrests, connected roof gutter and downpipe, readable route plaque; weathered slats and satin roof enamel.'

atlas();builders=dict(api['BUILDERS']);library=[];report=[]
before={r['name']:r for r in json.loads((ROOT/'assets/desert-ruins/source/model-report.json').read_text())}
for name in IDS:
    random.seed(271828+IDS.index(name))
    api['parts']=[];builders[name]();original_parts=len(api['parts']);refine(name)
    originals=list(api['parts']);coll=bpy.data.collections.new(name+' editable components');scene.collection.children.link(coll)
    for o in originals:
        # Bevel facets need interpolated normals; weighted broad faces remain
        # planar. Without this, a smooth manufactured corner reads as steps.
        if o.type=='MESH' and any(m.type=='BEVEL' for m in o.modifiers):
            for face in o.data.polygons:face.use_smooth=True
            for modifier in o.modifiers:
                if modifier.type=='BEVEL':modifier.harden_normals=True
        for owner in list(o.users_collection):owner.objects.unlink(o)
        coll.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in originals:o.select_set(True)
    bpy.context.view_layer.objects.active=originals[0];bpy.ops.object.duplicate();bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
    joined=bpy.context.object;joined.name=name
    scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for owner in list(joined.users_collection):owner.objects.unlink(joined)
    scene.collection.objects.link(joined);coll.hide_render=True;coll.hide_viewport=True
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mod=joined.modifiers.new('Portable tangent triangulation','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Ground each editable assembly and runtime mesh consistently at zero.
    low=min(v.co.z for v in joined.data.vertices)
    for v in joined.data.vertices:v.co.z-=low
    for o in originals:o.location.z-=low
    joined.data.calc_loop_triangles();coords=[v.co for v in joined.data.vertices]
    lo=[min(v[k] for v in coords) for k in range(3)];hi=[max(v[k] for v in coords) for k in range(3)]
    report.append({'id':name,'status':'refined','theme':'desert legacy','detail':DETAILS[name],
       'source_model':name,'source_triangles':before[name]['triangles'],'original_parts':original_parts,
       'editable_parts':len(originals),'triangles':len(joined.data.loop_triangles),'materials':1,
       'dimensions_m':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],
       'bounds_godot':{'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]},
       'collision':'Distant streamed scenery; excluded from traversable machine and docking corridor.',
       'runtime':'Overrides matching MMFDesertLayout vehicle/utility prototype without increasing instance count.'})
    library.append(joined);print('REFINED',name,report[-1]['triangles'],flush=True)

bpy.ops.object.select_all(action='DESELECT')
for o in library:o.select_set(True)
bpy.context.view_layer.objects.active=library[0]
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art100-legacy.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,export_materials='EXPORT')
(OUT/'manifest.json').write_text(json.dumps(report,indent=2))
floor_mat=bpy.data.materials.new('Neutral sand review ground');floor_mat.diffuse_color=(.19,.18,.16,1)
bpy.ops.mesh.primitive_plane_add(size=100);floor=bpy.context.object;floor.data.materials.append(floor_mat);floor.location.z=-.025
bpy.ops.object.light_add(type='AREA',location=(-6,-8,12));bpy.context.object.data.energy=2200;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=9
bpy.ops.object.light_add(type='AREA',location=(7,3,9));bpy.context.object.data.energy=1800;bpy.context.object.data.size=8
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=720;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for i,o in enumerate(library):
    for other in library:other.hide_render=other!=o
    bpy.context.view_layer.update();lo=Vector(report[i]['bounds_godot']['min']);hi=Vector(report[i]['bounds_godot']['max'])
    center=Vector(((lo.x+hi.x)/2,-(lo.z+hi.z)/2,(lo.y+hi.y)/2));span=max(o.dimensions)
    camera.location=center+Vector((1.15,-1.5,.95))*span
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=max(1.4,span*1.42)
    scene.render.filepath=str(OUT/'renders'/(o.name+'.png'));bpy.ops.render.render(write_still=True)
    print('REVIEWED',o.name,flush=True)
for i,o in enumerate(library):o.hide_render=False;o.location=((i%5)*13,(i//5)*13,0)
floor.scale=(2,2,2);floor.location=(26,26,-.025)
camera.location=(77,-47,70);camera.rotation_euler=(Vector((26,26,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=94
scene.render.resolution_x=1600;scene.render.resolution_y=1300
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Art100_DesertRefinement.blend'))
print('ART100_LEGACY_COMPLETE',len(report),flush=True)
