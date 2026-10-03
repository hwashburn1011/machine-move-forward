extends SceneTree
## Offline only: create exact portable roof shapes, without renderer readback.
const SOURCE="res://../assets/native-site-roofs/"
const DEST="res://data/site-roofs/"

func _initialize():call_deferred("run")

func digest(bytes: PackedByteArray) -> String:
	var hash=HashingContext.new();hash.start(HashingContext.HASH_SHA256);hash.update(bytes);return hash.finish().hex_encode()

func wake_source():
	var path="res://assets/models/authored/expedition-wreck.glb"
	var model=MMFAssets.scene(path);root.add_child(model)
	var roof=MMFAssets.find_named(model,"Wreck_BrokenRoof_Geometry")
	assert(roof!=null)
	var faces=[];var parts=[];var bounds=AABB();var initialized=false
	for mesh in MMFAssets.of_type(roof,"MeshInstance3D"):
		var transform=model.global_transform.affine_inverse()*mesh.global_transform
		var source=mesh.mesh.get_faces()
		for point in source:
			var v=transform*point;faces.append([v.x,v.y,v.z])
			if initialized:bounds=bounds.expand(v)
			else:bounds=AABB(v,Vector3.ZERO);initialized=true
		parts.append({"name":str(mesh.name),"triangles":source.size()/3})
	var raw={"id":"wreck-one","visualRoot":"Wreck_BrokenRoof_Geometry","triangles":faces.size()/3,"collisionTriangles":faces.size()/3,"parts":parts,"faces":faces,"bounds":{"min":[bounds.position.x,bounds.position.y,bounds.position.z],"max":[bounds.end.x,bounds.end.y,bounds.end.z]},"visualPath":path,"visualSha256":FileAccess.get_sha256(path)}
	var file=FileAccess.open(SOURCE+"wreck-one-collision.json",FileAccess.WRITE);file.store_string(JSON.stringify(raw));file.close();model.free()

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DEST))
	wake_source()
	var manifest={"version":1,"sites":{},"visualPath":MMFSiteRoofs.PATH,"visualSha256":FileAccess.get_sha256(MMFSiteRoofs.PATH),"foundryPath":"res://assets/models/authored/relay-foundry.glb","foundrySha256":FileAccess.get_sha256("res://assets/models/authored/relay-foundry.glb"),"collisionPolicy":"Exact authored structural faces. Tiny fasteners excluded. Torn-away sheets add no faces; no box spans the torn bay."}
	for id in MMFSiteRoofs.SITES:
		var path=SOURCE+id+"-collision.json";var raw=MMFAssets.json(path)
		var faces=PackedVector3Array()
		for v in raw.faces:faces.append(Vector3(v[0],v[1],v[2]))
		assert(faces.size()==int(raw.collisionTriangles)*3 and not faces.is_empty())
		var shape=ConcavePolygonShape3D.new();shape.backface_collision=true;shape.set_faces(faces)
		var target=DEST+id+".res";var status=ResourceSaver.save(shape,target,ResourceSaver.FLAG_COMPRESS)
		assert(status==OK)
		manifest.sites[id]={"path":target,"shapeSha256":FileAccess.get_sha256(target),"sourceSha256":FileAccess.get_sha256(path),"facesSha256":digest(faces.to_byte_array()),"triangles":faces.size()/3,"visualTriangles":raw.triangles,"bounds":raw.bounds,"parts":raw.parts,"source":path}
		if raw.has("visualPath"):
			manifest.sites[id].visualPath=raw.visualPath;manifest.sites[id].visualSha256=raw.visualSha256
		print("SITE_ROOF_BAKED ",id," ",faces.size()/3," exact triangles")
	var file=FileAccess.open(MMFSiteRoofs.DATA,FileAccess.WRITE);file.store_string(JSON.stringify(manifest,"\t"));file.close()
	MMFAssets.cache.clear();print("SITE_ROOF_BAKE_COMPLETE");quit()
