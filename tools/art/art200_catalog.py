"""Build the complete200-model review from current manifests and actual renders."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
# Reuse the established four collection adapters, including complete-character
# counting and native dimensions, without executing the old catalog writer.
old=(ROOT/'tools/art/art100_catalog.py').read_text(encoding='utf-8')
exec(compile(old.split('assert len(models)==100')[0],str(ROOT/'tools/art/art100_catalog.py'),'exec'))
OUT=ROOT/'docs/art/art200';OUT.mkdir(parents=True,exist_ok=True)
for m in models:m['original_status']=m['status'];m['status']='refined'
gallery=json.loads((ROOT/'assets/art200/gallery-audit.json').read_text())
for m in models:
    if not m['id'].startswith('enemy-'):continue
    kind=m['id'].removeprefix('enemy-')
    complete=next(r for r in gallery['records'] if r['id']==m['mesh_root'])
    m['image']=f'assets/art100/story-robots/review/blender-complete-{kind}-front.png'
    m['rear']=f'assets/art100/story-robots/review/blender-complete-{kind}-rear.png'
    m['dimensions']=complete['native_dimensions_m_godot'];m['triangles']=complete['triangles']
for r in read('assets/art200/signs/manifest.json')['models']:
    models.append(dict(id=r['id'],title=r['brand']+' / '+r['business'],group='Roadside advertisements',status='new',dimensions=r['dimensions_m'],triangles=r['triangles'],detail=r['features'],runtime=r['runtime'],image=relative(next((ROOT/'assets/art200/signs/renders').glob('*'+r['id']+'.png'))),source=r['source'],palette=r['palette_family']))
for r in read('assets/art200/wasteland/manifest.json')['models']:
    models.append(dict(id=r['id'],title=r['id'].replace('art200-','').replace('-',' ').title(),group='Roadside businesses and industry',status='new',dimensions=r['dimensions_m'],triangles=r['triangles'],detail=r['features'],runtime='Seeded desert districts. Measured footprints keep travel and docking lanes clear; nearby visible surfaces have physical collision.',image=relative(next((ROOT/'assets/art200/wasteland/renders').glob('*'+r['id']+'.png'))),source='assets/art200/wasteland/Art200Wasteland.blend',palette=r['palette_family']))
for id,r in read('assets/art200/machine/manifest.json').items():
    models.append(dict(id=id,title=r['name'],group='Life aboard the machine',status='new',dimensions=vec(r['bounds']['size']),triangles=r['bounds']['triangles'],detail=r['description'],runtime='Build → Decorations. Placement, movement, cutter refunds, undo and saved construction. Cosmetic; no invented functional upgrades.',image=f'assets/art200/machine/{id}.png',source='assets/art200/machine/NomadLivingArchive.blend',palette=r['color_family']))
for r in read('assets/art200/story/manifest.json')['models']:
    models.append(dict(id=r['id'],title=r['title'],group='Story evidence and dormant robots',status='new',dimensions=r['dimensions_m'],triangles=r['triangles'],detail=r['description'],runtime='Environmental storytelling at '+r['runtime_target']+'. Existing story interactions and approach paths remain usable.',image=f"assets/art200/story/review/{r['id']}.png",source=r['source'],palette=r['paint_family']))
assert len(models)==200 and len({m['id'] for m in models})==200
for i,m in enumerate(models):
    m['number']=i+1
    assert (ROOT/m['image']).exists(),m['image']
    assert (ROOT/m['source']).exists(),m['source']
manifest={'title':'Machine Move Forward / Art200','count':200,'new_this_iteration':100,'existing_refined':100,'native_only':True,'counting':'Complete assemblies only. Six existing characters include their complete bodies, rigs and fitted equipment; no separate counts for attachment parts or color variants.','models':models}
(ROOT/'assets/art200/catalog.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',18);small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',15);heading=ImageFont.truetype('C:/Windows/Fonts/seguisb.ttf',38)
for page in range(8):
    canvas=Image.new('RGB',(1800,2070),'#171D1D');d=ImageDraw.Draw(canvas)
    d.text((24,14),models[page*25]['group'].upper(),font=heading,fill='#EBE4CF')
    for j,m in enumerate(models[page*25:page*25+25]):
        x=j%5*360;y=85+j//5*395;im=ImageOps.contain(Image.open(ROOT/m['image']).convert('RGB'),(354,334));canvas.paste(im,(x+(360-im.width)//2,y+(334-im.height)//2))
        d.text((x+9,y+338),f"{m['number']:03d}  {m['title'][:32]}",font=font,fill='#EBE4CF')
        d.text((x+9,y+365),' × '.join(f'{v:.2f}' for v in m['dimensions'])+' m',font=small,fill='#92B6AD')
    canvas.save(OUT/f'collection-{page+1}.jpg',quality=94)
for offset,name in [(0,'refined-100'),(100,'new-100')]:
    sheet=Image.new('RGB',(2200,2710),'#171D1D');d=ImageDraw.Draw(sheet)
    d.text((26,16),'ART200 / '+('100 REFINED ASSEMBLIES' if offset==0 else '100 NEW ASSEMBLIES'),font=heading,fill='#EBE4CF')
    for i,m in enumerate(models[offset:offset+100]):
        x=i%10*220;y=110+i//10*258;im=ImageOps.contain(Image.open(ROOT/m['image']).convert('RGB'),(216,212));sheet.paste(im,(x+(220-im.width)//2,y+(212-im.height)//2))
        d.text((x+6,y+219),f"{m['number']:03d}  {m['title'][:23]}",font=small,fill='#EBE4CF')
    sheet.save(OUT/(name+'.jpg'),quality=94)
page=old.split("page=r'''",1)[1].split("'''.replace('PAYLOAD',payload)",1)[0]
page=page.replace('Art 100','Art 200').replace('art100','art200').replace('Art100Review','Art200Review')
page=page.replace('A world with<br><span>100 more reasons to look.</span>','100 new models.<br><span>A second look at all 200.</span>')
page=page.replace('<strong>59</strong>','<strong>100</strong>').replace('<strong>41</strong>','<strong>100</strong>').replace('<strong>4</strong>','<strong>8</strong>')
page=page.replace('100-model Blender gallery','200-model Blender gallery').replace('overview.jpg','new-100.jpg').replace('Full visual inventory','The new 100, at a glance').replace("+' of 100 assemblies'","+' of 200 assemblies'")
page=page.replace('in native idle poses','in their retained idle poses')
groups=list(dict.fromkeys(m['group'] for m in models))
start=page.index('<option>All collections</option>');end=page.index('</select>',start)
page=page[:start]+'<option>All collections</option>'+''.join('<option>'+g+'</option>' for g in groups)+page[end:]
page=page.replace('PAYLOAD',json.dumps(models).replace('</','<\\/'))
(OUT/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'count':len(models),'new':100,'refined':100,'catalog':str(OUT/'index.html')}))
