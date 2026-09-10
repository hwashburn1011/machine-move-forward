from pathlib import Path
p=Path('tools/art/gunner_s07/drape.py');s=p.read_text(encoding='utf-8');s=s[:s.index('bpy.ops.wm.save_as_mainfile')]+"\nprint('Final cloak clearance applied to the live review scene')\n";Path('tools/art/gunner_s07/update_live_review.py').write_text(s,encoding='utf-8')
