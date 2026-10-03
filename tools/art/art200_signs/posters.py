"""Original fictional advertising artwork for the Art200 billboard assemblies."""
from pathlib import Path
import json, math, random, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art200/signs';(OUT/'textures').mkdir(parents=True,exist_ok=True)
PALETTE=json.loads((ROOT/'assets/art200/palette.json').read_text())['families']
# Each design has its own structural silhouette and fictional brand voice.
SPECS=[
 ('morrow-motors','MORROW','MOTOR WORKS','A good engine deserves another road.','SERVICE / NEXT EXIT','twin-truss',12,6,18,'petrol','roadside-services'),
 ('last-light-lodging','LAST LIGHT','MOTOR LODGE','There is still a room for you.','VACANCY / 24 ROOMS','stepped-pylon',6,10,22,'oxblood','roadside-services'),
 ('brindle-bottling','BRINDLE','BOTTLING COMPANY','A little fizz. A longer afternoon.','RETURN THE BOTTLE','round-crown',7,7,16,'denim','roadside-services'),
 ('grainward-coop','GRAINWARD','SEED COOPERATIVE','Every mile begins with a seed.','GROW SOMETHING WORTH KEEPING','arched-grain',13,5,17,'olive','growing-belt'),
 ('copperline-cookers','COPPERLINE','HOME COOKERS','The warmth that brings you home.','CERAMIC / MADE TO LAST','shield-tripod',8,7,17,'clay','residential'),
 ('seven-mile-laundry','SEVEN MILE','WASH / DRY / FOLD','Leave the dust with us.','OPEN UNTIL THE LAST LOAD','stacked-discs',6,10,18,'celadon','roadside-services'),
 ('merit-radio','MERIT','LONG-RANGE RADIO','A familiar voice, farther away.','KEEP IN TOUCH','radio-lattice',6,10,23,'plum','survey'),
 ('solace-clinic','SOLACE','TRAVEL CLINIC','Good hands. Along the way.','WALK IN / REST A WHILE','offset-canopy',11,5,17,'verdigris','roadside-services'),
 ('open-road-retreads','OPEN ROAD','RETREAD WORKS','Another thousand miles in them.','TYRES / BALANCE / REPAIR','tyre-ring',8,8,17,'umber','transport'),
 ('northstar-bank','NORTHSTAR','TRAVELLERS BANK','Keep a little for tomorrow.','DEPOSITS / CREDIT / EXCHANGE','deco-fin',7,9,21,'slate','residential'),
 ('dewpoint-water','DEWPOINT','WATER SERVICE','Good water. Nothing added.','REFILL / FILTER / CARRY ON','tank-sign',10,6,17,'petrol','growing-belt'),
 ('paperbird-post','PAPERBIRD','POST & PARCEL','Somebody is waiting to hear.','LETTERS FIND A WAY','swept-roof',12,6,19,'rose','roadside-services'),
 ('parcel-plain','PARCEL PLAIN','FREIGHT EXCHANGE','A place for everything you carry.','WEIGH / WRAP / SEND','rail-sled',12,5,10,'ochre','transport'),
 ('sunbreak-cinema','SUNBREAK','OPEN-AIR CINEMA','Stay for the second feature.','TONIGHT / A WORLD AWAY','cinema-crown',14,7,21,'heather','residential'),
 ('hush-hour-records','HUSH HOUR','RECORD LIBRARY','A good song has no expiry.','BORROW THE EVENING','record-medallion',8,8,18,'oxblood','residential'),
 ('workday-tools','WORKDAY','TOOL SUPPLY','Built for hands that build.','REPAIR / RENT / RETURN','cantilever',10,5,18,'denim','industry'),
 ('pantry-union','PANTRY UNION','PROVISIONS','A full shelf is a kind of comfort.','TINS / GRAINS / GOOD COMPANY','v-frame',12,5,18,'celadon','roadside-services'),
 ('sandglass-tours','SANDGLASS','OVERLAND TOURS','There is more beyond the ridge.','SEE A LITTLE FURTHER','winged',9,7,19,'clay','survey'),
 ('starlit-fabric','STARLIT','FABRIC & MENDING','Keep the things that fit your life.','PATCHES / THREAD / PATIENCE','hanging-blade',6,10,22,'plum','residential'),
 ('electrovale-grid','ELECTROVALE','PUBLIC POWER','A little light goes a long way.','SERVICE DEPOT / LINE 04','portico',12,6,20,'verdigris','industry'),
 ('cairn-cement','CAIRN','MASONRY SUPPLY','For the things that must remain.','LIME / SAND / STONE','inclined-girders',12,5,17,'stone','industry'),
 ('goodnight-mattress','GOODNIGHT','BEDDING WORKS','Put the miles down for a while.','SPRINGS / LINEN / REST','suspended',10,6,18,'heather','roadside-services'),
 ('winterfruit-preserves','WINTERFRUIT','PRESERVING HOUSE','A little summer, saved for later.','ORCHARD / JARS / PANTRY','hexagon',8,7,17,'rose','growing-belt'),
 ('kindred-salvage','KINDRED','SALVAGE EXCHANGE','Someone can use what you leave.','PARTS / METAL / SECOND CHANCES','broken-cant',11,6,20,'umber','scrapyard'),
 ('amberline-transit','AMBERLINE','OVERLAND TRANSIT','We will get there together.','NEXT STOP / SOMEWHERE NEW','portal-gantry',13,5,20,'ochre','transport')]

def font(size,bold=False,serif=False):
    name='georgiab.ttf' if serif else ('bahnschrift.ttf' if bold else 'segoeui.ttf')
    return ImageFont.truetype('C:/Windows/Fonts/'+name,size)

def fit(draw,text,width,size=106,serif=False):
    while draw.textbbox((0,0),text,font=font(size,True,serif))[2]>width:size-=1
    return font(size,True,serif)

def centered(draw,text,y,width=900,size=100,fill='#B7B09F',serif=False):
    f=fit(draw,text,width,size,serif);draw.text((512,y),text,font=f,anchor='mt',fill=fill,stroke_width=0)

def symbol(draw,index,c,ink):
    x,y=c;r=65
    # Each business has an appropriate drawn symbol, rather than cycling a
    # shared set of unrelated emblems across the different advertisements.
    shape=index
    if shape==0:
        draw.rounded_rectangle((x-r,y-35,x+r,y+36),10,outline=ink,width=9)
        for xx in [x-36,x+36]:draw.ellipse((xx-14,y+21,xx+14,y+49),outline=ink,width=7)
        draw.line((x-31,y-39,x-20,y-61,x+27,y-61,x+39,y-39),fill=ink,width=8)
    elif shape==1:
        draw.arc((x-r,y-r,x+r,y+r),205,335,fill=ink,width=10)
        draw.line((x-r,y+24,x+r,y+24),fill=ink,width=8)
        for k in range(-2,3):draw.line((x+k*24,y-11,x+k*24,y+12),fill=ink,width=5)
    elif shape==2:
        draw.rounded_rectangle((x-25,y-24,x+25,y+60),12,outline=ink,width=8)
        draw.rectangle((x-13,y-62,x+13,y-21),outline=ink,width=6)
        draw.line((x-25,y+8,x+25,y+8),fill=ink,width=6)
    elif shape==3:
        draw.line((x,y+60,x,y-60),fill=ink,width=7)
        for k in range(4):
            yy=y-45+k*24
            draw.ellipse((x-37,yy-12,x,yy+12),outline=ink,width=7)
            draw.ellipse((x,yy-24,x+37,yy),outline=ink,width=7)
    elif shape==4:
        draw.rounded_rectangle((x-r,y-28,x+r,y+50),14,outline=ink,width=8)
        draw.arc((x-32,y-61,x+32,y+1),180,360,fill=ink,width=7)
        draw.line((x-r+8,y-2,x+r-8,y-2),fill=ink,width=5)
    elif shape==5:
        for r2 in [60,39,15]:draw.ellipse((x-r2,y-r2,x+r2,y+r2),outline=ink,width=6)
    elif shape==6:
        for r2 in [62,38]:draw.arc((x-r2,y-r2,x+r2,y+r2),215,325,fill=ink,width=8)
        draw.polygon([(x,y-15),(x-35,y+60),(x+35,y+60)],outline=ink,width=6)
    elif shape==7:
        draw.line((x-50,y,x+50,y),fill=ink,width=21)
        draw.line((x,y-50,x,y+50),fill=ink,width=21)
        draw.arc((x-72,y-72,x+72,y+72),25,155,fill=ink,width=6)
    elif shape==8:
        for rr in [63,42]:draw.ellipse((x-rr,y-rr,x+rr,y+rr),outline=ink,width=8)
        for k in range(8):
            a=k*math.tau/8
            draw.line((x+47*math.cos(a),y+47*math.sin(a),x+59*math.cos(a+.12),y+59*math.sin(a+.12)),fill=ink,width=5)
    elif shape==9:
        draw.rounded_rectangle((x-62,y-62,x+62,y+62),12,outline=ink,width=8)
        draw.ellipse((x-30,y-30,x+30,y+30),outline=ink,width=7)
        for k in range(4):
            a=k*math.pi/2;draw.line((x,y,x+42*math.cos(a),y+42*math.sin(a)),fill=ink,width=6)
        draw.rectangle((x-53,y-13,x-44,y+13),fill=ink)
    elif shape==10:
        draw.polygon([(x,y-68),(x-41,y-5),(x-44,y+29),(x-28,y+53),(x,y+62),(x+28,y+53),(x+44,y+29),(x+41,y-5)],outline=ink,width=8)
        draw.arc((x-27,y-9,x+27,y+43),10,105,fill=ink,width=6)
    elif shape==11:
        draw.polygon([(x-70,y-5),(x+70,y-55),(x+10,y+55),(x-5,y+10)],outline=ink,width=8)
        draw.line((x-5,y+10,x+70,y-55),fill=ink,width=6)
    elif shape==12:
        draw.rounded_rectangle((x-56,y-49,x+56,y+49),15,outline=ink,width=7)
        draw.line((x-56,y-9,x+56,y-9),fill=ink,width=6)
        draw.line((x,y-49,x,y+49),fill=ink,width=8)
    elif shape==13:
        draw.ellipse((x-67,y-67,x+67,y+67),outline=ink,width=7)
        for k in range(4):
            a=k*math.pi/2;xx=x+37*math.cos(a);yy=y+37*math.sin(a)
            draw.ellipse((xx-13,yy-13,xx+13,yy+13),outline=ink,width=6)
        draw.ellipse((x-6,y-6,x+6,y+6),fill=ink)
        draw.line((x+35,y+57,x+78,y+72),fill=ink,width=7)
    elif shape==14:
        for rr in [67,57,46,23]:draw.ellipse((x-rr,y-rr,x+rr,y+rr),outline=ink,width=5)
        draw.ellipse((x-5,y-5,x+5,y+5),fill=ink)
    elif shape==15:
        draw.line((x-40,y+50,x+30,y-25),fill=ink,width=20)
        draw.arc((x+3,y-65,x+64,y-4),-40,250,fill=ink,width=13)
        draw.ellipse((x-50,y+40,x-30,y+60),outline=ink,width=7)
    elif shape==16:
        draw.rounded_rectangle((x-49,y-53,x+49,y+55),10,outline=ink,width=8)
        draw.ellipse((x-49,y-63,x+49,y-41),outline=ink,width=7)
        draw.line((x-44,y+32,x+44,y+32),fill=ink,width=5)
        draw.line((x,y+14,x,y-21),fill=ink,width=5)
        draw.arc((x-26,y-27,x,y+2),180,350,fill=ink,width=5)
        draw.arc((x,y-35,x+26,y-6),185,355,fill=ink,width=5)
    elif shape==17:
        draw.ellipse((x-65,y-65,x+65,y+65),outline=ink,width=6)
        draw.polygon([(x+28,y-51),(x+9,y+9),(x-28,y+51),(x-9,y-9)],outline=ink,width=7)
        draw.line((x-55,y,x-43,y),fill=ink,width=5);draw.line((x+43,y,x+55,y),fill=ink,width=5)
    elif shape==18:
        draw.line((x-39,y+60,x+38,y-61),fill=ink,width=7)
        draw.ellipse((x+19,y-60,x+32,y-38),outline=ink,width=4)
        draw.arc((x-63,y-42,x+7,y+28),30,320,fill=ink,width=6)
        draw.arc((x-19,y-5,x+57,y+54),170,455,fill=ink,width=6)
    elif shape==19:
        draw.polygon([(x,y-65),(x-44,y+65),(x+44,y+65)],outline=ink,width=7)
        for yy,span in [(y-26,56),(y+11,70)]:draw.line((x-span,yy,x+span,yy),fill=ink,width=7)
        draw.line((x-28,y+20,x+25,y+57,x-25,y+57,x+28,y+20),fill=ink,width=5)
    elif shape==20:
        for row in range(3):
            yy=y-50+row*35;shift=18 if row%2 else 0
            for col in range(3):
                xx=x-66+col*44+shift
                if xx+39>x+75:continue
                draw.rectangle((xx,yy,xx+39,yy+29),outline=ink,width=5)
    elif shape==21:
        draw.line((x-67,y-42,x-67,y+58),fill=ink,width=9)
        draw.line((x+67,y+6,x+67,y+58),fill=ink,width=9)
        draw.rounded_rectangle((x-60,y-13,x+63,y+30),9,outline=ink,width=7)
        draw.rounded_rectangle((x-54,y-30,x-6,y-5),8,outline=ink,width=5)
    elif shape==22:
        draw.rounded_rectangle((x-48,y-35,x+48,y+61),19,outline=ink,width=7)
        draw.rectangle((x-46,y-58,x+46,y-36),outline=ink,width=7)
        draw.ellipse((x-19,y-6,x+19,y+32),outline=ink,width=6)
        draw.line((x,y-6,x+7,y-22,x+22,y-23),fill=ink,width=5)
    elif shape==23:
        draw.line((x,y-65,x,y-28),fill=ink,width=9)
        draw.ellipse((x-13,y-27,x+13,y-1),outline=ink,width=7)
        draw.line((x-10,y-6,x-57,y+16,x-34,y+57),fill=ink,width=9)
        draw.line((x+10,y-6,x+57,y+16,x+34,y+57),fill=ink,width=9)
        draw.rectangle((x-19,y+25,x+19,y+61),outline=ink,width=6)
    elif shape==24:
        draw.rounded_rectangle((x-61,y-58,x+61,y+48),18,outline=ink,width=8)
        draw.rectangle((x-45,y-41,x+45,y+2),outline=ink,width=6)
        draw.line((x,y-39,x,y),fill=ink,width=5)
        for xx in [x-36,x+36]:
            draw.ellipse((xx-8,y+19,xx+8,y+35),fill=ink)
            draw.line((xx,y+45,xx,y+63),fill=ink,width=12)

manifest=[]
for i,spec in enumerate(SPECS):
    slug,brand,business,tagline,footer,form,w,h,top,family,theme=spec
    p=next(p for p in PALETTE if p['id']==family)
    height=round(1024*h/w)
    im=Image.new('RGB',(1024,height),p['paint']);d=ImageDraw.Draw(im)
    serif=i in [3,9,13,18,21,22];ink=p['letter'];secondary=p['secondary']
    # Distinct editorial proportions, with a quiet paper/pigment palette.
    d.rectangle((22,22,1002,height-22),outline=secondary,width=4)
    d.line((42,height*.85,982,height*.85),fill=ink,width=3)
    glyph=Image.new('RGBA',(256,256));symbol(ImageDraw.Draw(glyph),i,(128,128),ink)
    if height>1250:
        centered(d,'THE ROAD REMEMBERS',height*.064,850,42,secondary)
        gsize=round(min(350,height*.23));glyph=glyph.resize((gsize,gsize),Image.Resampling.LANCZOS)
        im.paste(glyph,(512-gsize//2,round(height*.25)-gsize//2),glyph)
        words=brand.split();line_height=height*.14 if len(words)>1 else 0
        for row,word in enumerate(words):centered(d,word,height*.38+row*line_height,860,220,ink,serif)
        centered(d,business,height*.68,870,54,secondary)
        for row,line in enumerate(textwrap.wrap(tagline,35)):centered(d,line,height*.74+row*42,850,34,ink,True)
    elif height>600:
        gsize=round(height*.24);glyph=glyph.resize((gsize,gsize),Image.Resampling.LANCZOS)
        im.paste(glyph,(512-gsize//2,round(height*.20)-gsize//2),glyph)
        centered(d,brand,height*.37,918,115,ink,serif)
        centered(d,business,height*.55,900,55,secondary)
        centered(d,tagline,height*.74,875,34,ink,True)
    else:
        gsize=round(height*.54);glyph=glyph.resize((gsize,gsize),Image.Resampling.LANCZOS)
        im.paste(glyph,(140-gsize//2,round(height*.44)-gsize//2),glyph)
        d.line((270,height*.14,270,height*.75),fill=secondary,width=3)
        f=fit(d,brand,656,round(height*.26),serif);d.text((635,height*.30),brand,font=f,anchor='mm',fill=ink)
        f=fit(d,business,654,round(height*.10));d.text((635,height*.52),business,font=f,anchor='mm',fill=secondary)
        f=fit(d,tagline,654,round(height*.070),True);d.text((635,height*.70),tagline,font=f,anchor='mm',fill=ink)
    centered(d,footer,height*.89,894,min(35,round(height*.07)),ink)
    # Faded ink, panel-edge corrosion and long gravity streaks are localized.
    a=np.array(im).astype(np.float32);rng=np.random.default_rng(2200+i)
    y,x=np.mgrid[:height,:1024];grain=rng.normal(0,1.2,(height,1024))
    field=np.array(Image.fromarray(rng.integers(0,255,(24,32),dtype=np.uint8)).resize((1024,height),Image.Resampling.BICUBIC)).astype(float)/255
    a=a*(.95+.05*field[:,:,None])+grain[:,:,None]
    edge=np.minimum(np.minimum(x,1023-x),np.minimum(y,height-1-y))
    rust=np.clip((22-edge)/22,0,1)*(.2+.65*field)
    cols=6 if w>9 else 4;rows=3 if h>8 else 2
    seam_x=np.minimum(x%(1024/cols),1024/cols-x%(1024/cols))
    seam_y=np.minimum(y%(height/rows),height/rows-y%(height/rows))
    seams=np.minimum(seam_x,seam_y)
    # Corrosion starts at actual sheet joints. Different exposure histories
    # change its spread; the centre of the printed brand stays readable.
    spread=7 if i in [3,11,13,17,20,23] else 3.5
    rust=np.maximum(rust,np.clip(1-seams/spread,0,1)*(.28+.62*field))
    for col in range(cols+1):
        for row in range(rows):
            xx=col*1024/cols+rng.uniform(-4,4);yy=row*height/rows+8
            length=rng.uniform(25,95);width=rng.uniform(1.5,5)
            streak=np.clip(1-np.abs(x-xx)/width,0,1)*np.clip(1-(y-yy)/length,0,1)*(y>=yy)
            rust=np.maximum(rust,streak*.72)
    for j in range(18):
        xx=int(rng.integers(35,990));yy=int(rng.choice([20,height-55]));length=int(rng.integers(25,155))
        streak=np.maximum(0,1-np.abs(x-xx)/float(rng.integers(1,5)))*np.clip(1-(y-yy)/length,0,1)*(y>=yy)
        rust=np.maximum(rust,streak*.6)
    rustcolor=np.array([87,62,47]);a=a*(1-rust[:,:,None])+rustcolor*rust[:,:,None]
    # Sparse irregular chips expose old primer rather than bright white pixels.
    im=Image.fromarray(np.uint8(np.clip(a,0,255)));d=ImageDraw.Draw(im);rr=random.Random(930+i)
    for j in range(210):
        xx=rr.randrange(25,997);yy=rr.randrange(25,height-25);rad=rr.choice([1,1,2,3])
        d.line([(xx,yy),(xx+rr.randrange(2,12),yy+rr.randrange(-2,3))],fill='#635448',width=rad)
    dest=OUT/'textures'/f'{slug}.png';im.save(dest)
    manifest.append(dict(id='art200-billboard-'+slug,brand=brand,business=business,tagline=tagline,footer=footer,form=form,width=w,panel_height=h,top=top,palette_family=family,theme=theme,texture=dest.relative_to(ROOT).as_posix(),status='new'))
(OUT/'designs.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Created {len(manifest)} original fictional advertisement textures')
