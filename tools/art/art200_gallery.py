"""Extend the established measured gallery workflow to eight25-model cohorts.

Uses its existing armature/widget handling and overlap/grounding assertions;
does not change the historical100-model gallery or its source script.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=(ROOT/'tools/art/art100_gallery.py').read_text(encoding='utf-8')
def replace(old,new):
    global source
    assert old in source,old
    source=source.replace(old,new)
replace("OUT=ROOT/'assets/art100'","OLD=ROOT/'assets/art100';OUT=ROOT/'assets/art200'")
for folder in ['legacy','wasteland','machine','story-robots']:
    replace("OUT/'"+folder+"/manifest.json'","OLD/'"+folder+"/manifest.json'")
replace("full_source=OUT/'story-robots/CompleteCharacterAssemblies.blend'","full_source=OLD/'story-robots/CompleteCharacterAssemblies.blend'")
extra='''
new_specs=[
 {'key':'art200-signs','title':'05  ROADSIDE ADVERTISEMENTS — 25','ids':[r['id'] for r in json.loads((OUT/'signs/manifest.json').read_text())['models']], 'source':'assets/art200/signs/Art200_Advertising-editable.blend','at':(0,145),'pitch':28.0},
 {'key':'art200-wasteland','title':'06  BUSINESSES & INDUSTRY — 25','ids':[r['id'] for r in json.loads((OUT/'wasteland/manifest.json').read_text())['models']], 'source':'assets/art200/wasteland/Art200Wasteland.blend','at':(175,145),'pitch':24.0},
 {'key':'art200-machine','title':'07  LIFE ABOARD — 25','ids':list(json.loads((OUT/'machine/manifest.json').read_text())), 'source':'assets/art200/machine/NomadLivingArchive.blend','at':(0,290),'pitch':4.0},
 {'key':'art200-story','title':'08  STORY EVIDENCE — 25','ids':[r['id'] for r in json.loads((OUT/'story/manifest.json').read_text())['models']], 'source':'assets/art200/story/Story200-editable.blend','at':(30,290),'pitch':5.0},
]
assert all(len(s['ids'])==25 for s in new_specs)
specs.extend(new_specs)
def runtime_filename(spec):
    return (spec['key'] if spec['key'].startswith('art200-') else 'art100-'+spec['key'])+'.glb'
'''
replace("review=bpy.data.collections.new(",extra+"\nreview=bpy.data.collections.new(")
replace('f\'art100-{spec["key"]}.glb\'','runtime_filename(spec)')
replace('f\'art100-{s["key"]}.glb\'','runtime_filename(s)')
replace('f\'godot/art/art100-{spec["key"]}.glb\'','"godot/art/"+runtime_filename(spec)')
replace('assert len(records)==100','assert len(records)==200')
replace("len(set(e['id'] for e in records))==100","len(set(e['id'] for e in records))==200")
replace('primitive_plane_add(size=300','primitive_plane_add(size=800')
replace("'whole_assembly_count':100","'whole_assembly_count':200")
replace("scene['ART100_whole_assembly_count']=100","scene['ART100_whole_assembly_count']=200")
source=source.replace('100-model review','200-model review').replace('ALL 100','ALL 200').replace('100 whole','200 whole').replace('ART100 REVIEW','ART200 REVIEW').replace('ART100_GALLERY_AUDIT','ART200_GALLERY_AUDIT').replace('Art100Review','Art200Review')
source=source.replace("scene['ART100_","scene['ART200_")
replace("'25 legacy + 25 wasteland + 25 machine + 19 story props + 6 complete characters'","'100 refined existing + 100 new; eight collections of25; six complete rigged characters'")
exec(compile(source,str(ROOT/'tools/art/art100_gallery.py'),'exec'))
