extends SceneTree

var report={"removedTriangles":0,"removedLodTriangles":0,"surfaces":0,"unchangedVertexBuffers":true}
func _initialize():call_deferred("run")

func filter_indices(bytes: PackedByteArray,width: int,mask: PackedByteArray) -> PackedByteArray:
	var kept=PackedByteArray();kept.resize(bytes.size());var cursor=0
	for offset in range(0,bytes.size(),width*3):
		var selected=0
		for corner in 3:
			var index=bytes.decode_u16(offset+corner*width) if width==2 else bytes.decode_u32(offset+corner*width)
			selected+=mask[index]
		assert(selected in [0,3],"A triangle bridges the drone and character; cannot safely separate")
		if selected==0:
			for i in width*3:kept[cursor+i]=bytes[offset+i]
			cursor+=width*3
	kept.resize(cursor);return kept

func trimmed(source: ArrayMesh,joint: int,shadow=false) -> ArrayMesh:
	var surfaces=source.get("_surfaces").duplicate(true)
	for i in surfaces.size():
		var surface=surfaces[i];var arrays=source.surface_get_arrays(i)
		var mask=PackedByteArray();mask.resize(surface.vertex_count)
		var bones=arrays[Mesh.ARRAY_BONES];var weights=arrays[Mesh.ARRAY_WEIGHTS];var slots=bones.size()/surface.vertex_count
		for vertex in mask.size():
			var weight=0.0
			for slot in slots:
				if bones[vertex*slots+slot]==joint:weight+=weights[vertex*slots+slot]
			assert(weight<.001 or weight>.999,"Drone vertex has shared body weights")
			mask[vertex]=1 if weight>.999 else 0
		var width=surface.index_data.size()/surface.index_count
		var kept=filter_indices(surface.index_data,width,mask)
		if not shadow:report.removedTriangles+=(surface.index_data.size()-kept.size())/(width*3)
		surface.index_data=kept;surface.index_count=kept.size()/width
		for lod in range(1,surface.get("lods",[]).size(),2):
			kept=filter_indices(surface.lods[lod],width,mask)
			if not shadow:report.removedLodTriangles+=(surface.lods[lod].size()-kept.size())/(width*3)
			surface.lods[lod]=kept
		# Built-in GLB materials would be embedded again by ResourceSaver. Keep
		# this mesh geometry-only; runtime instances reuse the original materials.
		surface.erase("material")
		if not shadow:report.surfaces+=1
	var result=ArrayMesh.new();result.set("_surfaces",surfaces);result.resource_name="Sovereign body without baked drone"
	if source.shadow_mesh:result.shadow_mesh=trimmed(source.shadow_mesh,joint,true)
	return result

func run():
	var source=MMFAssets.scene(MMFEnemyModels.path("sovereign"))
	var body=MMFAssets.find_named(source,"sovereign_CombatBody");var joint=-1
	for i in body.skin.get_bind_count():
		if body.skin.get_bind_name(i)==&"equipment_0":joint=i
	assert(joint>=0,"Missing authored drone skin binding")
	var mesh=trimmed(body.mesh,joint)
	var art=MMFAssets.json("res://../assets/native-character-refinement/sovereign-manifest.json")
	if report.removedTriangles!=art.equipmentTriangles:
		push_error("Unexpected source topology: "+str(report));source.free();MMFAssets.cache.clear();quit(1);return
	var error=ResourceSaver.save(mesh,"res://art/sovereign-body.res",ResourceSaver.FLAG_COMPRESS)
	if error!=OK:
		push_error("Cannot save separated body mesh: "+error_string(error));source.free();MMFAssets.cache.clear();quit(1);return
	report.sourceSha256=FileAccess.get_sha256(MMFEnemyModels.path("sovereign"));report.godot=Engine.get_version_info().string
	var file=FileAccess.open("res://art/sovereign-body.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("SOVEREIGN_BODY ",report)
	source.free();MMFAssets.cache.clear();quit()
