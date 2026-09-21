"""Authored surfaces matching the v3 runtime deck and exterior-stair contracts."""
import json
import math
from pathlib import Path
import bpy


def build_access(scene, root, profile, kit, game, source):
    sx, sz, sy = profile['scale']
    stairs = json.loads((Path(__file__).resolve().parents[3] / 'src/data/iron-nomad-side-stairs.json').read_text())
    module = kit.group('Gameplay_Decks_And_Access', parent=root)
    module['module'] = True
    def material(part):
        return next(m for m in bpy.data.materials if part.lower() in m.name.lower())
    steel, bare, brass = material('Charcoal_Steel'), material('Aged_BareMetal'), material('Worn_HandrailBrass')
    amber = material('Amber')

    def box(name, at, size, mat=steel, parent=module, bevel=.012):
        return kit.box(name, source(at), (size[0] / sx, size[2] / sy, size[1] / sz), mat, parent, bevel=bevel)
    def rod(name, a, b, radius=.025, mat=brass):
        return kit.cylinder(name, source(a), source(b), radius, mat, module, n=16)
    def rail(name, a, b, height=1.04):
        length = math.dist(a, b)
        count = max(1, math.ceil(length / 2))
        for i in range(count + 1):
            p = [a[j] + (b[j] - a[j]) * i / count for j in range(3)]
            rod(name + ' stanchion', p, (p[0], p[1] + height, p[2]), .032)
            box(name + ' mounting foot', (p[0], p[1] + .03, p[2]), (.16, .06, .16), bare)
        for h in [height * .48, height]:
            rod(name + ' handrail', (a[0], a[1] + h, a[2]), (b[0], b[1] + h, b[2]), .035)
    def slab(name, rect, y):
        x0, x1, z0, z1 = rect
        if x1 - x0 <= .001 or z1 - z0 <= .001:
            return
        box(name, ((x0 + x1) / 2, y - .09, (z0 + z1) / 2), (x1 - x0, .18, z1 - z0), steel, bevel=.012)
    def subtract(rect, cut):
        x0, x1, z0, z1 = rect
        a, b, c, d = cut
        if x1 <= a or x0 >= b or z1 <= c or z0 >= d:
            return [rect]
        parts = [(x0, min(x1, a), z0, z1), (max(x0, b), x1, z0, z1), (max(x0, a), min(x1, b), z0, min(z1, c)), (max(x0, a), min(x1, b), max(z0, d), z1)]
        return [part for part in parts if part[1] > part[0] and part[3] > part[2]]

    w, l = profile['deckHalfWidth'], profile['deckHalfLength']
    internal = profile['stairwell']
    cut_internal = (internal['minX'], internal['maxX'], internal['minZ'], internal['maxZ'])
    hole = (stairs['x'] - stairs['width'] / 2, stairs['x'] + stairs['width'] / 2, -stairs['openingHalfLength'], stairs['openingHalfLength'])
    for level in [-2, -1, 0]:
        y = profile['deckSurface'] + level * 3.6
        perimeter = profile['walkable']['upper' if level == 0 else 'wraparound']
        wx, wz = perimeter['halfWidth'], perimeter['halfLength']
        # Individual two-metre plates make the increase in usable area legible.
        for ix in range(round(w)):
            for iz in range(round(l)):
                rect = (-w + ix * 2, -w + (ix + 1) * 2, -l + iz * 2, -l + (iz + 1) * 2)
                for part in subtract(rect, cut_internal) if level > -2 else [rect]:
                    slab(f'Playable deck {level} plate', part, y)
        ring = [(-wx, -w, -wz, wz), (w, wx, -wz, wz), (-w, w, -wz, -l), (-w, w, l, wz)]
        for index, rect in enumerate(ring):
            for part in subtract(rect, hole) if level > -2 else [rect]:
                slab(f'Walkaround deck {level} strip {index}', part, y)
        if level < 0:
            bypass = stairs['flatBypass']
            for rect in [bypass, *bypass['connectors']]:
                slab('Port continuous bypass deck', (rect['xMin'], rect['xMax'], rect['zMin'], rect['zMax']), y)
            rail('Bypass outer guard', (bypass['xMin'], y, bypass['zMin']), (bypass['xMin'], y, bypass['zMax']))
            for z in [bypass['zMin'], bypass['zMax']]:
                rail('Bypass end guard', (bypass['xMin'], y, z), (bypass['xMax'], y, z))
            for z in [-3, 0, 3]:
                kit.beam('Bypass knee support', source((-10.8, y-1.5, z)), source((-14.8, y-.16, z)), .2, .25, steel, module)
        if level == 0:
            extension = stairs['upperExtension']
            slab('Upper external stair landing', (extension['xMin'], extension['xMax'], extension['zMin'], extension['zMax']), y)
        # Rail openings connect to the side flights instead of cutting through them.
        gap_min = min(-stairs['openingHalfLength'], stairs['upperExtension']['zMin']) if level == 0 else -5
        gap_max = max(stairs['openingHalfLength'], stairs['upperExtension']['zMax']) if level == 0 else 5
        for z0, z1 in [(-wz, gap_min), (gap_max, wz)]:
            rail(f'Port deck {level} guard', (-wx, y, z0), (-wx, y, z1))
        if level == 0:
            for z0, z1 in [(-wz, -1.15), (1.15, wz)]:
                rail('Upper starboard gate guard', (wx, y, z0), (wx, y, z1))
            extension = stairs['upperExtension']
            rail('Upper landing outer guard', (-13, y, extension['zMin']), (-13, y, extension['zMax']))
            end_z = max([extension['zMin'], extension['zMax']], key=abs)
            rail('Upper landing end guard', (-13, y, end_z), (-wx, y, end_z))
        else:
            rail(f'Starboard deck {level} guard', (wx, y, -wz), (wx, y, wz))
        rail(f'Fore deck {level} fishing guard', (-wx, y, -wz), (wx, y, -wz), .65 if level == -2 else 1.04)
        rail(f'Aft deck {level} guard', (-wx, y, wz), (wx, y, wz))
        for x in range(-int(w) + 1, int(w), 4):
            box('Recessed deck edge task marker', (x, y - .10, -wz - .025), (.46, .075, .025), amber, bevel=.005)
        for side in [-1, 1]:
            for z in range(-int(l) + 1, int(l), 4):
                kit.beam('Supported catwalk corbel', source((side * (w - .2), y - .75, z)), source((side * (wx - .15), y - .15, z)), .15, .18, steel, module)

        if level < 0:
            for step in range(24):
                top = y + (step + 1) * .15
                box(f'Internal stair {level} tread {step}', (-2, top - .04, -2.4 + (step + .5) * .2), (1.92, .08, .21), bare)
            for x in [-2.89, -1.11]:
                kit.beam('Internal boxed stair stringer', source((x, y - .13, -2.4)), source((x, y + 3.47, 2.4)), .11 / sx, .18 / sz, steel, module)
                rod('Internal sloping handrail', (x, y + .99, -2.4), (x, y + 4.59, 2.4))
                for step in [0, 8, 16, 23]:
                    z, top = -2.4 + (step + .5) * .2, y + (step + 1) * .15
                    rod('Internal stair safety post', (x, top, z), (x, top + .94, z))
        if level > -2:
            for x in [-3.05, -.95]:
                rail('Internal stairwell coaming', (x, y, -2.4), (x, y, 2.4))

    transfer_landings = set()
    for flight in [stairs['lowerToMiddle'], stairs['middleToUpper']]:
        level, start, end = flight['fromLevel'], flight['zStart'], flight['zEnd']
        y = profile['deckSurface'] + level * stairs['rise']
        direction = 1 if end > start else -1
        for step in range(24):
            top = y + (step + 1) * stairs['rise'] / 24
            z = start + (step + .5) * (end - start) / 24
            box(f'External flight {level} tread {step}', (stairs['x'], top - .04, z), (stairs['width'] - .12, .08, .265), bare)
            if step % 4 == 0:
                box('External stair amber nosing', (stairs['x'], top + .003, z + direction * .09), (1.66, .008, .035), amber, bevel=.002)
        for x in [stairs['x'] - .94, stairs['x'] + .94]:
            kit.beam('External boxed load stringer', source((x, y - .15, start)), source((x, y + stairs['rise'] - .15, end)), .15, .20, steel, module)
            rod('External continuous sloping handrail', (x, y + 1.04, start), (x, y + stairs['rise'] + 1.04, end), .032)
            for step in range(0, 25, 4):
                z, top = start + step / 24 * (end - start), y + step / 24 * stairs['rise']
                rod('External guard upright', (x, top, z), (x, top + 1.04, z), .028)
        # Horizontal landings join both levels to the wraparound without a lip.
        for z, deck, direction_out in [(start, y, -direction), (end, y + stairs['rise'], direction)]:
            key = (round(z, 3), round(deck, 3), direction_out)
            if key in transfer_landings:
                continue
            transfer_landings.add(key)
            center = z + direction_out * .65
            slab('External stair transfer landing', (stairs['x'] - 1, stairs['x'] + 1, center - .65, center + .65), deck)
    return module, box
