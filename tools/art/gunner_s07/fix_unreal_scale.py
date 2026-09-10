from pathlib import Path
p=Path('tools/art/gunner_s07/import_unreal.py');s=p.read_text().replace("DEST='/Game/S07'", "DEST='/Game/S07_Ready'").replace('data.import_uniform_scale=1.0;data.convert_scene=True;data.convert_scene_unit=True','data.import_uniform_scale=100.0;data.convert_scene=True;data.convert_scene_unit=False');p.write_text(s)
