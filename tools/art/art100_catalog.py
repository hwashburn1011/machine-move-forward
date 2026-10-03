"""Build a searchable, local review catalogue from the 100 actual model renders."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import json, html, hashlib

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/art/art100';OUT.mkdir(parents=True,exist_ok=True)
ASSETS=ROOT/'assets/art100'
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))
def relative(path):return str(Path(path).relative_to(ROOT)).replace('\\','/')
def vec(raw):return [raw[k] for k in ['x','y','z']] if isinstance(raw,dict) else raw
models=[]
for row in read('assets/art100/legacy/manifest.json'):
    models.append(dict(id=row['id'],title=row['id'].replace('-',' ').title(),group='Desert refinements',status='refined',
        dimensions=row['dimensions_m'],triangles=row['triangles'],detail=row['detail'],runtime=row['runtime'],
        image=f"assets/art100/legacy/renders/{row['id']}.png",source='assets/art100/legacy/Art100_DesertRefinement.blend'))
for row in read('assets/art100/wasteland/manifest.json')['models']:
    image=next((ASSETS/'wasteland/renders').glob('*-'+row['id']+'.png'))
    models.append(dict(id=row['id'],title=row['id'].replace('wasteland-','').replace('-',' ').title(),group='Wasteland landmarks',status=row['status'],
        dimensions=row['dimensions_m'],triangles=row['triangles'],detail=row['features'],runtime='Seeded desert scenery; themed districts and foreground shuffle. Travel and docking corridors stay clear.',
        image=relative(image),source='assets/art100/wasteland/art100-wasteland.blend'))
for id,row in read('assets/art100/machine/manifest.json').items():
    models.append(dict(id=id,title=row['name'],group='Machine furnishings',status='new',dimensions=vec(row['bounds']['size']),
        triangles=row['bounds']['triangles'],detail=row['description'],runtime='Build → Decorations. Existing placement, movement, cutter, undo and save paths. '+', '.join(f'{v} {k}' for k,v in row['cost'].items())+'.',
        image=f'assets/art100/machine/{id}.png',source='assets/art100/machine/NomadFurnishings.blend'))
native=read('assets/art100/story-robots/native-validation.json')
for row in read('assets/art100/story-robots/manifest.json')['models']:
    refined=row['status']=='refined';kind=row.get('runtime_target','').split(':')[-1]
    dimensions=row['dimensions_m'];triangles=row['triangles']
    if refined:
        dimensions=vec(native['complete_character_assemblies'][kind]['idle']['refined_complete_assembly']['dimensions_m'])
        triangles=row['complete_assembly_triangles']
    entry=dict(id=('enemy-'+kind) if refined else row['id'],mesh_root=row['id'],title=row['title'],group='Story and robots',status=row['status'],
        dimensions=dimensions,triangles=triangles,
        detail=('Existing complete character refined with fitted torso equipment, controlled surface finish and preserved rig/animations. This is an art refinement; no new enemy AI.' if refined else 'Purpose-built story equipment with manufactured edges, readable panels and connected service hardware.'),
        runtime=('Existing '+kind+' combat appearances. Idle, walk and attack fits reviewed.' if refined else 'Playable Meridian receiving berth; selected equipment also appears at earlier expedition sites.'),
        image=f'assets/art100/story-robots/review/native-{kind}-idle.png' if refined else f"assets/art100/story-robots/review/{row['id']}.png",
        source=row.get('complete_assembly_source',row['source']))
    if refined:entry['before']=f'assets/art100/story-robots/review/native-{kind}-before.png';entry['rear']=f'assets/art100/story-robots/review/native-{kind}-rear.png';entry['authored_attachment_triangles']=row['triangles']
    models.append(entry)
assert len(models)==100 and len({m['id'] for m in models})==100
assert sum(m['status']=='new' for m in models)==59
for i,m in enumerate(models):
    m['number']=i+1
    assert (ROOT/m['image']).exists(),m['image']
    assert (ROOT/m['source']).exists(),m['source']
manifest={'title':'Machine Move Forward · Art 100','count':100,'new':59,'refined':41,
 'counting':'100 complete assemblies. Six refined existing enemies count as six complete characters, with their added hardware included; neither individual parts nor texture variants count separately.',
 'native_only':True,'models':models}
(ASSETS/'catalog.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',18)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',15)
heading=ImageFont.truetype('C:/Windows/Fonts/seguisb.ttf',42)
# All 100 shown exactly once in the visual inventory, with names/numbers.
sheet=Image.new('RGB',(2200,2710),(23,29,29));draw=ImageDraw.Draw(sheet)
draw.text((26,16),'MACHINE MOVE FORWARD / ART 100',font=heading,fill='#ebe4cf')
draw.text((28,77),'59 new assemblies · 41 refinements · actual Blender and native Godot renders',font=font,fill='#92b6ad')
for i,m in enumerate(models):
    x=(i%10)*220;y=120+(i//10)*258
    im=Image.open(ROOT/m['image']).convert('RGB');im=ImageOps.contain(im,(216,212))
    sheet.paste(im,(x+(220-im.width)//2,y+(212-im.height)//2))
    label=f"{i+1:03d}  {m['title']}"
    while draw.textlength(label,font=small)>208:label=label[:-2]
    draw.text((x+6,y+218),label,font=small,fill='#ebe4cf')
    draw.text((x+6,y+239),m['status'].upper(),font=small,fill='#92b6ad')
sheet.save(OUT/'overview.jpg',quality=93)
# Four large pages are useful for exhaustive visual review at readable scale.
for page in range(4):
    canvas=Image.new('RGB',(1800,2070),(23,29,29));d=ImageDraw.Draw(canvas)
    d.text((24,14),models[page*25]['group'].upper(),font=heading,fill='#ebe4cf')
    for i,m in enumerate(models[page*25:page*25+25]):
        x=i%5*360;y=85+i//5*395
        im=ImageOps.contain(Image.open(ROOT/m['image']).convert('RGB'),(354,334));canvas.paste(im,(x+(360-im.width)//2,y+(334-im.height)//2))
        d.text((x+9,y+338),f"{m['number']:03d}  {m['title'][:33]}",font=font,fill='#ebe4cf')
        d.text((x+9,y+365),' × '.join(f'{v:.2f}' for v in m['dimensions'])+' m',font=small,fill='#92b6ad')
    canvas.save(OUT/f'collection-{page+1}.jpg',quality=94)
payload=json.dumps(models).replace('</','<\\/')
page=r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Art 100 · Machine Move Forward</title>
<style>
:root{font:16px/1.5 'Segoe UI',sans-serif;color:#e9e4d5;background:#131b1c;--muted:#9aada8;--line:#344543;--accent:#d8ab6b}*{box-sizing:border-box}body{margin:0}header,main{max-width:1500px;margin:auto;padding:38px 36px}header{padding-bottom:22px}.eyebrow{font-size:12px;letter-spacing:.19em;color:var(--accent)}h1{font-size:clamp(42px,7vw,80px);font-weight:400;line-height:1.08;margin:20px 0}h1 span{color:var(--accent)}.lead{max-width:800px;color:var(--muted);font-size:18px}.stats{display:flex;gap:38px;margin:24px 0}.stats strong{font-size:30px;font-weight:400}.stats small{display:block;color:var(--muted)}a{color:var(--accent)}.toolbar{position:sticky;top:0;z-index:3;display:flex;gap:10px;flex-wrap:wrap;background:#131b1cf5;padding:15px 0;border-block:1px solid var(--line)}input,select,button{font:inherit;background:#202b2b;color:inherit;border:1px solid #455a56;border-radius:4px;padding:10px 14px}input{flex:1;min-width:220px}button{cursor:pointer}button:hover{border-color:var(--accent)}#count{font-size:13px;color:var(--muted);margin:15px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:20px}.card{border:1px solid var(--line);background:#1b2525;cursor:pointer;padding:0;text-align:left;overflow:hidden}.card img{width:100%;aspect-ratio:1;object-fit:contain;background:#252e2d;display:block}.info{padding:17px}.number{color:var(--accent);font-size:12px;letter-spacing:.08em}.card h2{font-size:17px;font-weight:500;margin:8px 0}.dims{color:var(--muted);font-size:12px}.tag{font-size:10px;border:1px solid #566860;border-radius:20px;padding:3px 8px;float:right;text-transform:uppercase}.note{font-size:13px;color:var(--muted);max-width:960px;margin:28px 0}dialog{width:min(1150px,95vw);max-height:94vh;background:#172020;color:inherit;border:1px solid #566860;padding:24px}dialog::backdrop{background:#000b}.detail{display:grid;grid-template-columns:1.35fr 1fr;gap:28px}.detail img{width:100%;max-height:70vh;object-fit:contain;background:#263130}.detail h2{font-size:30px;line-height:1.15;font-weight:400}#close{float:right;padding:6px 14px;margin-bottom:14px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.detail p{color:#bac6bf}dl{display:grid;grid-template-columns:105px 1fr;gap:8px;font-size:13px}dt{color:var(--muted)}dd{margin:0}.footer{border-top:1px solid var(--line);padding-top:24px;font-size:13px;color:var(--muted)}@media(max-width:750px){header,main{padding:22px 18px}.detail{grid-template-columns:1fr}.stats{gap:20px}.grid{grid-template-columns:repeat(2,1fr);gap:10px}.info{padding:11px}.card h2{font-size:14px}.dims{font-size:10px}.tag{float:none;display:inline-block;margin-left:5px}}
</style>
<header><div class="eyebrow">MACHINE MOVE FORWARD / V1 ART ITERATION</div><h1>A world with<br><span>100 more reasons to look.</span></h1><p class="lead">Manufactured edges, connected hardware, quiet surface wear, and a consistent sense of scale. Inspect every complete assembly from this art pass.</p><div class="stats"><div><strong>59</strong><small>New assemblies</small></div><div><strong>41</strong><small>Existing refinements</small></div><div><strong>4</strong><small>Curated collections</small></div></div><p><a href="../../../assets/art100/Art100Review.blend">Open the 100-model Blender gallery</a> · <a href="overview.jpg">Full visual inventory</a> · <a href="../../../assets/art100/catalog.json">Model manifest</a></p></header>
<main><div class="toolbar"><input id="search" type="search" placeholder="Search models, hardware, or story locations…" aria-label="Search models"><select id="group" aria-label="Collection"><option>All collections</option><option>Desert refinements</option><option>Wasteland landmarks</option><option>Machine furnishings</option><option>Story and robots</option></select><select id="status" aria-label="Status"><option value="all">New + refined</option><option value="new">New</option><option value="refined">Refined</option></select></div><div id="count" role="status"></div><div class="grid" id="grid"></div><p class="note">Dimensions are width × height × depth in metres. Robot cards show complete assembled characters in native idle poses; their added hardware is included in the six refinements. Furnishings are cosmetic build pieces. Story equipment preserves existing interactions and progression. Distant desert scenery keeps the established travel and docking clearances. This iteration targets the native Godot game.</p><div class="footer">All previews are renders of the actual models. Editable per-collection Blender masters and reproducible build scripts are retained alongside the runtime assets.</div></main>
<dialog id="dialog"><button id="close" aria-label="Close model details">Close ×</button><div class="detail"><div><img id="large" alt=""><div id="views" class="actions"></div></div><div id="text"></div></div></dialog>
<script>const models=PAYLOAD;const $=s=>document.querySelector(s),base='../../../';const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const dims=m=>m.dimensions.map(v=>v.toFixed(2)).join(' × ')+' m';
function show(m){$('#large').src=base+m.image;$('#large').alt=m.title;$('#text').innerHTML=`<div class="number">${String(m.number).padStart(3,'0')} / ${escape(m.group)}</div><h2>${escape(m.title)}</h2><p>${escape(m.detail)}</p><dl><dt>Dimensions</dt><dd>${dims(m)}</dd><dt>Geometry</dt><dd>${m.triangles.toLocaleString()} triangles${m.authored_attachment_triangles?' · complete source assembly':''}</dd><dt>State</dt><dd>${m.status}</dd><dt>In the game</dt><dd>${escape(m.runtime)}</dd></dl><p><a href="${base+m.source}">Editable Blender source</a> · <a href="${base+m.image}" target="_blank" rel="noopener">Full render</a></p>`;$('#views').replaceChildren();[['Current',m.image],['Before',m.before],['Rear',m.rear]].forEach(([name,path])=>{if(!path)return;const b=document.createElement('button');b.textContent=name;b.onclick=()=>$('#large').src=base+path;$('#views').append(b)});$('#dialog').showModal()}
function render(){const q=$('#search').value.toLowerCase(),group=$('#group').value,status=$('#status').value;const list=models.filter(m=>(group==='All collections'||m.group===group)&&(status==='all'||m.status===status)&&[m.title,m.id,m.detail,m.runtime].join(' ').toLowerCase().includes(q));$('#count').textContent=list.length+' of 100 assemblies';$('#grid').replaceChildren();list.forEach(m=>{const b=document.createElement('button');b.className='card';b.innerHTML=`<img loading="lazy" src="${base+m.image}" alt="${escape(m.title)}"><div class="info"><span class="number">${String(m.number).padStart(3,'0')}</span><span class="tag">${m.status}</span><h2>${escape(m.title)}</h2><div class="dims">${dims(m)}</div></div>`;b.onclick=()=>show(m);$('#grid').append(b)})}['#search','#group','#status'].forEach(s=>$(s).addEventListener('input',render));$('#close').onclick=()=>$('#dialog').close();$('#dialog').onclick=e=>{if(e.target===$('#dialog'))$('#dialog').close()};render();</script></html>'''.replace('PAYLOAD',payload)
(OUT/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'models':len(models),'new':59,'refined':41,'html':str(OUT/'index.html')}))
