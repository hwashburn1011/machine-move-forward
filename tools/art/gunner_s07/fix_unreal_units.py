from pathlib import Path
p=Path('tools/art/gunner_s07/import_unreal.py');s=p.read_text().replace('t.replace_existing=True;t.save=True','t.replace_existing=True;t.replace_existing_settings=True;t.save=True');s=s.replace('data.import_uniform_scale=1.0','data.import_uniform_scale=1.0;data.convert_scene=True;data.convert_scene_unit=True')
s=s.replace("entry['size_cm']=[b.box_extent.x*2,b.box_extent.y*2,b.box_extent.z*2]", "entry['size_cm']=[b.box_extent.x*2,b.box_extent.y*2,b.box_extent.z*2]\n                assert (190<entry['size_cm'][2]<250) if skeletal else (150<max(entry['size_cm'])<200),entry")
p.write_text(s)
