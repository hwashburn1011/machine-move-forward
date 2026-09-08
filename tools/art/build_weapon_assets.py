"""Original compact scrap firearms with an explicit grip origin and +Z bore."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_assets import bpy, clear, empty, box, cylinder, merge_static_by_parent, save_asset


for shotgun in [False, True]:
    clear()
    stem = 'scrap-shotgun' if shotgun else 'scrap-rifle'
    root = empty('MMF_' + stem)
    root['authoredPalette'], root['gripOrigin'], root['forwardAxis'] = True, True, '+Z'
    # Short rear pad sits ahead of the chest rather than passing through the torso.
    box('Receiver', (0, .095, .13), (.095, .12, .34), 'Dark_Steel', root, bevel=.018)
    box('Grip', (0, -.012, .035), (.075, .14, .085), 'Canvas_Dark', root, bevel=.014)
    box('Rear pad', (0, .083, -.054), (.09, .15, .035), 'Rubber', root, bevel=.008)
    box('Top rail', (0, .168, .17), (.06, .023, .32), 'Bare_Steel', root, bevel=.004)
    box('Rear sight', (0, .20, .04), (.055, .055, .028), 'Dark_Steel', root, bevel=.004)
    length = .88 if shotgun else .81
    radius = .026 if shotgun else .017
    cylinder('Barrel', (0, .12, .28), (0, .12, length), radius, 'Bare_Steel', root, vertices=12)
    cylinder('Muzzle sleeve', (0, .12, length - .06), (0, .12, length), radius * 1.45, 'Dark_Steel', root)
    box('Front sight', (0, .17, length - .08), (.025, .09, .023), 'Dark_Steel', root, bevel=.003)
    if shotgun:
        cylinder('Magazine tube', (0, .055, .25), (0, .055, .73), .025, 'Dark_Steel', root)
        box('Pump slide', (0, .055, .32), (.12, .105, .23), 'Paint_Ochre', root, bevel=.017)
        for z in [.24, .28, .32, .36, .40]:
            box('Pump rib', (0, .053, z), (.125, .11, .018), 'Canvas_Dark', root, bevel=.004)
        for z in [.02, .08, .14]:
            cylinder('Spare shell', (.065, .035, z), (.065, .13, z), .017, 'Paint_Raider', root, vertices=8)
    else:
        box('Heat shroud', (0, .12, .39), (.09, .10, .31), 'Paint_Teal', root, bevel=.012)
        for z in [.29, .35, .41, .47]:
            box('Shroud vent', (.046, .13, z), (.003, .035, .025), 'Dark_Steel', root, bevel=0)
        box('Box magazine', (0, -.075, .17), (.074, .22, .11), 'Paint_Ochre', root, bevel=.013)
        box('Magazine heel', (0, -.185, .17), (.085, .02, .12), 'Dark_Steel', root, bevel=.004)
        cylinder('Gas piston', (0, .17, .41), (0, .17, .69), .010, 'Dark_Steel', root, vertices=8)
    box('Trigger guard base', (0, -.065, .096), (.065, .017, .07), 'Bare_Steel', root, bevel=.004)
    merge_static_by_parent()
    save_asset(stem)
print('MMF_WEAPONS_COMPLETE')
