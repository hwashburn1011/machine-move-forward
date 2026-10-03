extends SceneTree
## Offline exact collision bake. Library order mirrors MMFWorld.setup_environment:
## later art collections replace earlier prototypes with the same node name.
const SOURCES=["res://assets/models/props/ruins/desert-ruins.glb","res://art/art100-legacy.glb","res://art/art100-wasteland.glb","res://art/art200-wasteland.glb","res://art/art200-signs.glb"]
const DIRECTORY="res://data/scenery-collision/"
const MANIFEST="res://data/scenery-collision.json"
const TRIANGLES_PER_CHUNK=2048

func _initialize():call_deferred("run")

func digest(bytes: PackedByteArray) -> String:
	var context=HashingContext.new();context.start(HashingContext.HASH_SHA256);context.update(bytes)
	return context.finish().hex_encode()

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIRECTORY))
	var prototypes={};var owners=[];var provenance={};var sources={}
	for path in SOURCES:
		var kit=load(path).instantiate();owners.append(kit);sources[path]=FileAccess.get_sha256(path)
		for node in MMFAssets.of_type(kit,"MeshInstance3D"):
			if path==SOURCES[0] and "__lod" in node.name:continue
			prototypes[String(node.name)]=node;provenance[String(node.name)]=path
	assert(prototypes.size()==125,"Expected all 125 final scenery prototypes")
	var manifest={"format":2,"method":"Exact imported Mesh.get_faces() order and float32 values, partitioned into contiguous triangle chunks; no simplification", "backface_collision":true,"triangles_per_chunk":TRIANGLES_PER_CHUNK,"sources_sha256":sources,"models":{}}
	var keys=prototypes.keys();keys.sort();var total_triangles=0;var total_bytes=0;var total_chunks=0
	for kind in keys:
		var mesh: Mesh=prototypes[kind].mesh
		var faces=mesh.get_faces()
		var directory=DIRECTORY+String(kind).validate_filename()+"/"
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
		var chunks=[];var joined=PackedVector3Array();var model_bytes=0
		for begin in range(0,faces.size(),TRIANGLES_PER_CHUNK*3):
			var portion=faces.slice(begin,mini(begin+TRIANGLES_PER_CHUNK*3,faces.size()))
			var shape=ConcavePolygonShape3D.new();shape.set_faces(portion);shape.backface_collision=true
			var path=directory+"chunk-%03d.res"%chunks.size()
			shape.set_meta("landmark_kind",kind);shape.set_meta("chunk_index",chunks.size())
			shape.set_meta("source_sha256",sources[provenance[kind]])
			shape.set_meta("faces_sha256",digest(portion.to_byte_array()))
			assert(ResourceSaver.save(shape,path,ResourceSaver.FLAG_COMPRESS)==OK,"Cannot save "+path)
			var restored=ResourceLoader.load(path,"ConcavePolygonShape3D",ResourceLoader.CACHE_MODE_IGNORE)
			assert(restored is ConcavePolygonShape3D and restored.backface_collision,"Invalid restored shape "+kind)
			assert(restored.get_faces().to_byte_array()==portion.to_byte_array(),kind+": saved chunk changed exact faces")
			joined.append_array(restored.get_faces())
			var bytes=FileAccess.get_file_as_bytes(path).size();model_bytes+=bytes
			chunks.append({"path":path,"shape_sha256":FileAccess.get_sha256(path),"faces_sha256":digest(portion.to_byte_array()),"first_triangle":begin/3,"triangles":portion.size()/3,"bytes":bytes})
		assert(joined.to_byte_array()==faces.to_byte_array(),kind+": ordered compound collision lost or changed faces")
		total_triangles+=faces.size()/3;total_bytes+=model_bytes;total_chunks+=chunks.size()
		manifest.models[kind]={"chunks":chunks,"source":provenance[kind],"source_sha256":sources[provenance[kind]],"faces_sha256":digest(faces.to_byte_array()),"triangles":faces.size()/3,"bytes":model_bytes}
	manifest.models_count=keys.size();manifest.total_triangles=total_triangles;manifest.total_bytes=total_bytes;manifest.total_chunks=total_chunks
	var file=FileAccess.open(MANIFEST,FileAccess.WRITE);file.store_string(JSON.stringify(manifest,"\t"));file.close()
	for kit in owners:kit.free()
	owners.clear();prototypes.clear()
	print("SCENERY_COLLISION_BAKED ",keys.size()," exact models; chunks=",total_chunks,"; triangles=",total_triangles,"; compressed bytes=",total_bytes,"; manifest_sha256=",FileAccess.get_sha256(MANIFEST))
	call_deferred("quit")
