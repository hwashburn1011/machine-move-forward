"""Surgical GLB seam replacement; all pre-existing buffer bytes are retained.

Run after wake_floor.py. Patches shipping and full-quality staging GLBs without
round-tripping any body mesh, anchor, material, or embedded texture.
"""
from pathlib import Path
import copy
import hashlib
import json
import struct
import zipfile
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'test-results/roof-floor/wake'
TARGETS = ('godot/assets/models/authored/expedition-wreck.glb', 'assets/graphics-v2/staging/expedition-wreck.glb')
LONGITUDINAL = (-5., -2.5, 0., 2.5, 5.)
CROSS = (-6., -3., 3., 6.)
DTYPES = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read(data):
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    start = 20 + size
    size = struct.unpack_from('<I', data, start)[0]
    return doc, data[start+8:start+8+size]


def values(doc, blob, index):
    acc = doc['accessors'][index]; view = doc['bufferViews'][acc['bufferView']]
    dtype = np.dtype(DTYPES[acc['componentType']]); components = COMPONENTS[acc['type']]
    return np.ndarray((acc['count'], components), dtype=dtype, buffer=blob,
        offset=view.get('byteOffset', 0)+acc.get('byteOffset', 0),
        strides=(view.get('byteStride', components*dtype.itemsize), dtype.itemsize)).copy()


def append(doc, blob, data, component_type, kind, target=None):
    blob.extend(b'\0' * (-len(blob) % 4))
    view = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': data.nbytes}
    if target is not None: view['target'] = target
    blob.extend(data.tobytes())
    vi = len(doc['bufferViews']); doc['bufferViews'].append(view)
    acc = {'bufferView': vi, 'componentType': component_type, 'count': len(data), 'type': kind}
    if kind == 'VEC3':
        acc['min'] = data.min(axis=0).tolist(); acc['max'] = data.max(axis=0).tolist()
    ai = len(doc['accessors']); doc['accessors'].append(acc)
    return ai


def encode(doc, blob):
    doc['buffers'][0]['byteLength'] = len(blob)
    raw = json.dumps(doc, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4); blob.extend(b'\0' * (-len(blob) % 4))
    return (struct.pack('<III', 0x46546C67, 2, 28+len(raw)+len(blob))
        + struct.pack('<II', len(raw), 0x4E4F534A)+raw
        + struct.pack('<II', len(blob), 0x004E4942)+blob)


def footprint(v):
    x, z = v[..., 0], v[..., 2]
    return (((np.abs(z) <= 8.80002) & np.logical_or.reduce([np.abs(x-c) <= .00902 for c in LONGITUDINAL]))
            | ((np.abs(x) <= 5.80002) & np.logical_or.reduce([np.abs(z-c) <= .00902 for c in CROSS])))


def patch(path, original, seam_doc, seam_bin):
    before, binary = read(original); doc = copy.deepcopy(before); blob = bytearray(binary)
    node = next(n for n in doc['nodes'] if n.get('name') == 'Wreck_HullStructure_Geometry')
    assert not any(k in node for k in ('rotation', 'scale', 'matrix'))
    mesh = doc['meshes'][node['mesh']]
    dark = next(i for i, m in enumerate(doc['materials']) if m['name'] == 'ExpWreck_Dark')
    matches = [(i, p) for i, p in enumerate(mesh['primitives']) if p['material'] == dark]
    assert len(matches) == 1
    pi, primitive = matches[0]
    positions = values(doc, binary, primitive['attributes']['POSITION']).astype(float)
    world_positions = positions + np.array(node.get('translation', (0, 0, 0)))
    old_indices = values(doc, binary, primitive['indices']).reshape(-1, 3)
    triangles = world_positions[old_indices]
    mask = ((triangles[..., 1] >= -.00601) & (triangles[..., 1] <= .00001) & footprint(triangles)).all(axis=1)
    assert int(mask.sum()) == 108, f'{path}: seam triangle count {mask.sum()}'
    kept = old_indices[~mask].reshape(-1, 1)
    ct = doc['accessors'][primitive['indices']]['componentType']
    primitive['indices'] = append(doc, blob, kept.astype(DTYPES[ct]), ct, 'SCALAR', 34963)
    source_primitive = seam_doc['meshes'][0]['primitives'][0]
    new = {'attributes': {}, 'material': dark}
    for name, accessor in source_primitive['attributes'].items():
        a = seam_doc['accessors'][accessor]; data = values(seam_doc, seam_bin, accessor)
        if name == 'POSITION': data -= np.array(node.get('translation', (0, 0, 0)), dtype=np.float32)
        new['attributes'][name] = append(doc, blob, data, a['componentType'], a['type'], 34962)
    a = seam_doc['accessors'][source_primitive['indices']]
    index_data = values(seam_doc, seam_bin, source_primitive['indices'])
    new['indices'] = append(doc, blob, index_data, a['componentType'], a['type'], 34963)
    mesh['primitives'].append(new)
    result = encode(doc, blob)
    after, after_bin = read(result)
    assert after_bin[:len(binary)] == binary, 'All original attribute and texture bytes must remain untouched'
    for key in ('nodes', 'materials', 'textures', 'images', 'samplers', 'scenes', 'scene'):
        assert after.get(key) == before.get(key), key
    for mi, old_mesh in enumerate(before['meshes']):
        for pj, old_primitive in enumerate(old_mesh['primitives']):
            changed = after['meshes'][mi]['primitives'][pj]
            if mi == node['mesh'] and pj == pi:
                assert changed['attributes'] == old_primitive['attributes']
                assert np.array_equal(values(after, after_bin, changed['indices']).ravel(), kept.ravel())
            else: assert changed == old_primitive
    # Write only after all preservation assertions succeed.
    (ROOT/path).write_bytes(result)
    return {'path': path, 'beforeSha256': hashlib.sha256(original).hexdigest(),
        'afterSha256': hashlib.sha256(result).hexdigest(), 'removedFlushTriangles': int(mask.sum()),
        'newTriangles': int(index_data.size/3), 'existingBinaryBytesPreserved': len(binary),
        'unchanged': ['all existing vertex attributes', 'all other triangle indices', 'nodes', 'materials', 'textures', 'images', 'samplers', 'scenes'],
        'newSurface': 'One connected dark formed seam network, Y0..0.008, 1 mm edge radius'}


if __name__ == '__main__':
    seam_doc, seam_bin = read((OUT/'seam-network.glb').read_bytes())
    assert len(seam_doc['nodes']) == 1 and seam_doc['nodes'][0] == {'mesh': 0, 'name': 'Wake seated deck seam network'}
    with zipfile.ZipFile(OUT/'before.zip') as archive:
        reports = [patch(p, archive.read(p), seam_doc, seam_bin) for p in TARGETS]
    (OUT/'patch-preservation.json').write_text(json.dumps({'assets': reports}, indent=2)+'\n')
    print(json.dumps(reports, indent=2))
