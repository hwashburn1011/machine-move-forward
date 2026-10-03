"""Connected, seated Wake floor seams. Used by the recipe and narrow repair."""
import bpy
import bmesh
from mathutils import Vector

LONGITUDINAL = (-5.0, -2.5, 0.0, 2.5, 5.0)
CROSS = (-6.0, -3.0, 3.0, 6.0)
HALF_WIDTH = .009
HEIGHT = .008


def in_footprint(x, z, epsilon=1e-6):
    return ((abs(z) <= 8.8 + epsilon and any(abs(x - c) <= HALF_WIDTH + epsilon for c in LONGITUDINAL))
            or (abs(x) <= 5.8 + epsilon and any(abs(z - c) <= HALF_WIDTH + epsilon for c in CROSS)))


def create_seams(material, parent):
    """Extrude one grid union: shared crossings, no intersecting top faces."""
    xs = sorted({-5.8, 5.8, *(c + d for c in LONGITUDINAL for d in (-HALF_WIDTH, HALF_WIDTH))})
    zs = sorted({-8.8, 8.8, *(c + d for c in CROSS for d in (-HALF_WIDTH, HALF_WIDTH))})
    cells = {(i, j) for i in range(len(xs)-1) for j in range(len(zs)-1)
             if in_footprint((xs[i]+xs[i+1])/2, (zs[j]+zs[j+1])/2)}
    vertices, faces, indices = [], [], {}

    def vertex(i, j, upper):
        key = (i, j, upper)
        if key not in indices:
            indices[key] = len(vertices)
            vertices.append((xs[i], -zs[j], HEIGHT if upper else 0.0))
        return indices[key]

    for i, j in sorted(cells):
        corners = ((i, j), (i+1, j), (i+1, j+1), (i, j+1))
        bottom = [vertex(a, b, False) for a, b in corners]
        top = [vertex(a, b, True) for a, b in corners]
        faces.extend((tuple(bottom), tuple(reversed(top))))
        for edge, neighbor in enumerate(((i,j-1),(i+1,j),(i,j+1),(i-1,j))):
            if neighbor not in cells:
                n = (edge+1) % 4
                faces.append((bottom[edge], top[edge], top[n], bottom[n]))
    mesh = bpy.data.meshes.new('Wake joined seam network')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(len(e.link_faces) == 2 for e in bm.edges), 'Seams must be closed and manifold'
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new('Wake seated deck seam network', mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bevel = obj.modifiers.new('Formed seam edge 1 mm', 'BEVEL')
    bevel.width = .001; bevel.segments = 2; bevel.limit_method = 'ANGLE'
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Stable metre-scale planar charts. The existing dark PBR material is reused.
    uv = mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        axes = (0, 1) if abs(face.normal.z) > .5 else ((0, 2) if abs(face.normal.y) > .5 else (1, 2))
        for loop in face.loop_indices:
            co = mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv = (co[axes[0]], co[axes[1]])
    obj['deckSeamHeightM'] = HEIGHT
    obj['deckSeamSupportY'] = 0.0
    obj['deckSeamTreatment'] = 'Connected formed steel strips, seated on intact structural floor'
    obj.select_set(False)
    return obj


def repair_master():
    """Remove only the nine old flush seam boxes from the joined source mesh."""
    obj = bpy.data.objects['Wreck_HullStructure_Geometry']
    mesh = obj.data
    dark_slots = {i for i, mat in enumerate(mesh.materials) if mat.name == 'ExpWreck_Dark'}
    bm = bmesh.new(); bm.from_mesh(mesh)
    old = []
    for face in bm.faces:
        if face.material_index not in dark_slots:
            continue
        coords = [obj.matrix_world @ v.co for v in face.verts]
        if all(-.00601 <= p.z <= .00001 and in_footprint(p.x, -p.y, 2e-5) for p in coords):
            old.append(face)
    assert len(old) == 54, f'Expected six faces on each of nine seam boxes; found {len(old)}'
    old_vertices = set(v for face in old for v in face.verts)
    bmesh.ops.delete(bm, geom=old, context='FACES_ONLY')
    unused = [v for v in old_vertices if not v.link_faces]
    assert len(unused) == 72
    bmesh.ops.delete(bm, geom=unused, context='VERTS')
    bm.to_mesh(mesh); bm.free(); mesh.update()
    return create_seams(bpy.data.materials['ExpWreck_Dark'], bpy.data.objects['Wreck_HullStructure'])


if __name__ == '__main__':
    from pathlib import Path
    import sys
    root = Path(__file__).resolve().parents[3]
    source = root / 'assets/blender/graphics-v2/expedition-wreck.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    seam = repair_master()
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    # Export ONLY the new network. The binary patcher retains all existing
    # materials/images/attributes instead of round-tripping the complete wreck.
    bpy.ops.object.select_all(action='DESELECT'); seam.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(root / 'test-results/roof-floor/wake/seam-network.glb'),
        export_format='GLB', use_selection=True, export_apply=True,
        export_materials='NONE', export_texcoords=True, export_normals=True,
        export_tangents=True, export_yup=True, export_cameras=False, export_lights=False)
