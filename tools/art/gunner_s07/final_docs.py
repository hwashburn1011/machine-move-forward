from pathlib import Path
p=Path('assets/gunner-s07/viewer/index.html');s=p.read_text(encoding='utf-8').replace('<title>', '<link rel="icon" href="data:,"><title>',1);p.write_text(s,encoding='utf-8')
p=Path('assets/gunner-s07/README.md');s=p.read_text(encoding='utf-8').replace('`fit.py`, `drape.py`, then `deliver.py`', '`fit.py`, `drape.py`, `cloth_thickness.py`, then `deliver.py`');p.write_text(s,encoding='utf-8')
