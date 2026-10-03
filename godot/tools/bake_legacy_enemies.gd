extends SceneTree

# Replace only presentation resources. The old native node graph, skeleton,
# animation libraries and their keys remain the authoritative gameplay rig.
var copies={}
var textures={}
func _initialize():
	create_timer(30).timeout.connect(func():quit(1));call_deferred("run")
func copy_value(value):
	if value is Resource:return copy_resource(value)
	if value is Array:
		var result=value.duplicate()
		for i in result.size():result[i]=copy_value(result[i])
		return result
	if value is Dictionary:
		var result=value.duplicate()
		for key in result:result[key]=copy_value(result[key])
		return result
	return value
func copy_resource(source: Resource) -> Resource:
	if source is Texture2D and FileAccess.file_exists(source.resource_path):
		var hash=FileAccess.get_sha256(source.resource_path)
		if textures.has(hash):return textures[hash]
		textures[hash]=source
	if source.resource_path!="" and not source.resource_path.contains("::"):return source
	if copies.has(source):return copies[source]
	var result=source.duplicate(false);copies[source]=result
	for property in source.get_property_list():
		if property.usage&PROPERTY_USAGE_STORAGE and property.name not in ["resource_path","resource_scene_unique_id"]:
			var value=source.get(property.name)
			if value is Resource or value is Array or value is Dictionary:result.set(property.name,copy_value(value))
	result.resource_path="";return result
func own(node: Node,owner_root: Node):
	if node!=owner_root:node.owner=owner_root
	node.scene_file_path=""
	for property in node.get_property_list():
		if property.usage&PROPERTY_USAGE_STORAGE:
			var value=node.get(property.name)
			if value is Resource or value is Array or value is Dictionary:node.set(property.name,copy_value(value))
	for child in node.get_children():own(child,owner_root)
func run():
	var report={"engine":Engine.get_version_info().string,"models":{}}
	for kind in ["raider","scavenger"]:
		copies.clear()
		var old_path="res://assets/models/authored/"+kind+".glb";var new_path="res://art/legacy-"+kind+".glb"
		var original=load(old_path).instantiate();var refined=load(new_path).instantiate()
		var body=MMFAssets.find_named(original,kind+"_CraftedSkin");var replacement=MMFAssets.find_named(refined,kind+"_RefinedSkin")
		assert(body!=null and replacement!=null,"Both models must expose their intended skinned body")
		assert(body.skin.get_bind_count()==replacement.skin.get_bind_count(),"New skin must preserve the complete original binding count")
		var compatible=true
		for i in body.skin.get_bind_count():
			compatible=compatible and body.skin.get_bind_name(i)==replacement.skin.get_bind_name(i) and body.skin.get_bind_pose(i).is_equal_approx(replacement.skin.get_bind_pose(i))
		assert(compatible,"Refinement must preserve bone names, bind order and inverse bind matrices")
		assert(body.transform.is_equal_approx(replacement.transform),"Refined body must use the original mesh coordinate frame")
		var original_height=MMFAssets.bounds(original).size.y
		original.set_meta("original_fit_height",original_height)
		body.mesh=replacement.mesh
		# Keep the original Skin object and skeleton path. Matching bind order
		# above establishes that all new vertex weights target the same joints.
		own(original,original);var packed=PackedScene.new();assert(packed.pack(original)==OK)
		var output="res://art/legacy-"+kind+".scn";assert(ResourceSaver.save(packed,output,ResourceSaver.FLAG_COMPRESS)==OK)
		var dependencies=Array(ResourceLoader.get_dependencies(output))
		assert(dependencies.all(func(path):return not path.contains(".glb")),"Compiled enemy must not retain obsolete mesh containers")
		report.models[kind]={"originalSha256":FileAccess.get_sha256(old_path),"refinedSha256":FileAccess.get_sha256(new_path),"compiledSha256":FileAccess.get_sha256(output),"originalFitHeight":original_height,"bytes":FileAccess.get_file_as_bytes(output).size(),"dependencies":dependencies}
		print("LEGACY_ENEMY_BAKED ",kind," ",report.models[kind])
		original.free();refined.free()
	var file=FileAccess.open("res://art/legacy-enemies.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	copies.clear();textures.clear();call_deferred("quit")
