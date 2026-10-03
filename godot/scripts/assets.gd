class_name MMFAssets
extends RefCounted

static var cache: Dictionary = {}
static var scene_preparers: Array = []

static func json(path: String):
	return JSON.parse_string(FileAccess.get_file_as_string(path))

static func scene(path: String) -> Node3D:
	if not path.begins_with("res://"): path = "res://assets/" + path
	if not cache.has(path):
		# An immediate cold scene can need different textures while preparation
		# is still initializing render resources. Finish those owned requests
		# before another synchronous load; regular preparation stays asynchronous.
		for preparer in scene_preparers:
			if is_instance_valid(preparer) and preparer.pending!="":preparer.collect()
	if not cache.has(path):
		if not ResourceLoader.exists(path):
			push_error("Missing native asset: " + path)
			return Node3D.new()
		# Immediate save restores/tests can need an asset before preparation
		# finishes. Own a matching request and join it instead of racing a
		# synchronous load against the existing worker. Its original owner still
		# consumes its own result; this rare fallback remains synchronous.
		if ResourceLoader.load_threaded_get_status(path)!=ResourceLoader.THREAD_LOAD_INVALID_RESOURCE and ResourceLoader.load_threaded_request(path,"PackedScene")==OK:
			cache[path]=ResourceLoader.load_threaded_get(path)
		else:cache[path]=load(path)
	return cache[path].instantiate()

static func find_named(root: Node, wanted: String) -> Node:
	if String(root.name) == wanted: return root
	for child in root.get_children():
		var found = find_named(child, wanted)
		if found: return found
	return null

static func of_type(root: Node, type_name: String) -> Array:
	var result = []
	if root.is_class(type_name): result.append(root)
	for child in root.get_children(): result.append_array(of_type(child, type_name))
	return result

static func bounds(root: Node3D) -> AABB:
	var merged = AABB()
	var initialized = false
	for mesh in of_type(root, "MeshInstance3D"):
		if mesh.mesh == null: continue
		var transform_to_root = Transform3D.IDENTITY
		var node = mesh
		while node != root and node is Node3D:
			transform_to_root = node.transform * transform_to_root
			node = node.get_parent()
		var box = transform_to_root * mesh.get_aabb()
		merged = merged.merge(box) if initialized else box
		initialized = true
	return merged

static func v(raw) -> Vector3:
	if raw is Array: return Vector3(float(raw[0]), float(raw[1]), float(raw[2]))
	return Vector3(float(raw.get("x", 0)), float(raw.get("y", 0)), float(raw.get("z", 0)))

static func dict_v(value: Vector3) -> Dictionary:
	return {"x": value.x, "y": value.y, "z": value.z}

static func material(color: Color, emission: float = 0.0) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.8
	if emission > 0:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = emission
	return m

static func box(parent: Node3D, size: Vector3, at: Vector3, mat: Material = null, solid: bool = true) -> MeshInstance3D:
	var mesh = MeshInstance3D.new()
	var geometry = BoxMesh.new()
	geometry.size = size
	mesh.mesh = geometry
	mesh.material_override = mat
	mesh.position = at
	parent.add_child(mesh)
	if solid:
		var body = StaticBody3D.new()
		mesh.add_child(body)
		var collider = CollisionShape3D.new()
		var shape = BoxShape3D.new()
		shape.size = size
		collider.shape = shape
		body.add_child(collider)
	return mesh

static func collider(parent: Node3D, raw: Dictionary, index_ranges: Array = []) -> StaticBody3D:
	var body = StaticBody3D.new()
	parent.add_child(body)
	body.position = v(raw.get("position", {}))
	var q = raw.get("rotation", {"x": 0, "y": 0, "z": 0, "w": 1})
	body.quaternion = Quaternion(q.x, q.y, q.z, q.w)
	var col = CollisionShape3D.new()
	if raw.has("half"):
		var shape = BoxShape3D.new()
		shape.size = v(raw.half) * 2.0
		col.shape = shape
	elif raw.has("vertices"):
		var shape = ConcavePolygonShape3D.new()
		var faces = PackedVector3Array()
		var vertices = raw.vertices
		var indices = raw.get("indices", [])
		# Optional authored ranges remove complete obsolete components from a
		# shared frozen mesh. Other callers retain the original contiguous path.
		var ranges=index_ranges if not index_ranges.is_empty() else [[0,indices.size()]]
		var count=0
		for span in ranges:count+=int(span[1])-int(span[0])
		faces.resize(count)
		# This input is the frozen Three.js/Rapier bake, whose front faces use
		# counterclockwise winding. Godot needs clockwise triangles; retaining
		# the old order makes exterior surfaces collide from the inside.
		var order = [0,2,1]
		var cursor=0
		for span in ranges:
			for triangle in range(int(span[0]),int(span[1]),3):
				for corner in 3:
					var i = int(indices[triangle+order[corner]]) * 3
					faces[cursor+corner] = Vector3(vertices[i], vertices[i+1], vertices[i+2])
				cursor+=3
		shape.set_faces(faces)
		col.shape = shape
	else:
		var shape = CapsuleShape3D.new()
		shape.radius = raw.get("radius", 0.3)
		shape.height = raw.get("halfHeight", 0.6) * 2 + shape.radius * 2
		col.shape = shape
	body.add_child(col)
	return body
