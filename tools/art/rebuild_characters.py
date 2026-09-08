import sys
from pathlib import Path
sys.path.insert(0, str(Path('tools/art').resolve()))
from build_assets import clear, make_character, save_asset
for stem, robot in [('scavenger', True), ('raider', False)]:
    clear()
    make_character(robot)
    save_asset(stem, True)
