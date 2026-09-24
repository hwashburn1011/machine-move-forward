"""Make the identity-space skinned export a scene root for portable glTF."""
import json
import struct


def root_skin(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + size])
    nodes = document['nodes']
    roots = document['scenes'][document.get('scene', 0)]['nodes']
    parents = {child: i for i, node in enumerate(nodes) for child in node.get('children', [])}
    for index, node in enumerate(nodes):
        if 'skin' not in node or index in roots:
            continue
        parent = parents[index]
        ancestor = parent
        while True:
            # The native compiler separately verifies inverse binds and mesh
            # coordinates. Never flatten a transformed source hierarchy here.
            if any(key in nodes[ancestor] for key in ('matrix', 'translation', 'rotation', 'scale')):
                raise ValueError('Expected identity ancestors around the original rig')
            if ancestor not in parents:
                break
            ancestor = parents[ancestor]
        nodes[parent]['children'].remove(index)
        roots.append(index)
    encoded = json.dumps(document, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    remaining = data[20 + size:]
    output = struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(remaining))
    output += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + remaining
    path.write_bytes(output)
