extends SceneTree

const OUTPUT="res://art/nomad-native.scn"
var copies={}
var source_files={}

func _initialize():call_deferred("run")

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
	# External textures/shaders remain shared files. Local imported meshes and
	# materials are detached from their obsolete GLB containers without changing
	# their stored arrays, LODs, shadow meshes or properties. Preserve sharing.
	if source.resource_path!="" and not source.resource_path.contains("::"):return source
	if copies.has(source):return copies[source]
	var result=source.duplicate(false);copies[source]=result
	for property in source.get_property_list():
		if property.usage&PROPERTY_USAGE_STORAGE and property.name not in ["resource_path","resource_scene_unique_id"]:
			var value=source.get(property.name)
			if value is Resource or value is Array or value is Dictionary:result.set(property.name,copy_value(value))
	result.resource_path=""
	# Each game instance needs its own mutable cloth/indicator uniforms. All
	# cabinets in one scene instance still share their single indicator material.
	if result is ShaderMaterial:result.resource_local_to_scene=true
	return result

func own(node: Node,owner_root: Node):
	if node!=owner_root:node.owner=owner_root
	node.scene_file_path=""
	for property in node.get_property_list():
		if property.usage&PROPERTY_USAGE_STORAGE:
			var value=node.get(property.name)
			if value is Resource or value is Array or value is Dictionary:node.set(property.name,copy_value(value))
	for child in node.get_children():own(child,owner_root)

func remember(path: String):
	if FileAccess.file_exists(path):
		# Git normalizes tracked text to LF. Ignore only checkout line endings;
		# geometry and binary assets always retain byte-for-byte source hashes.
		source_files[path]=FileAccess.get_file_as_string(path).replace("\r\n","\n").sha256_text() if path.get_extension() in ["gd","json","import"] else FileAccess.get_sha256(path)

func run():
	var full=MMFAssets.json("res://data/runtime.json")
	var world=MMFWorld.new();root.add_child(world);world.assemble_machine(full.colliders)
	var assembly=Node3D.new();assembly.name="NativeMachineAssembly";root.add_child(assembly)
	world.machine.reparent(assembly,false)
	var physics=Node3D.new();physics.name="Physics";assembly.add_child(physics)
	for child in world.get_children():
		assert(child is StaticBody3D,"Authoring recipe must contain only static machine collision beside the model")
		child.reparent(physics,false)
	for path in MMFAssets.cache:
		remember(path);remember(path+".import")
	for path in ["res://data/runtime.json","res://scripts/assets.gd","res://scripts/world.gd","res://tools/bake_machine.gd"]:remember(path)
	for name in DirAccess.get_files_at("res://scripts"):
		if name.begins_with("machine_") and name.ends_with(".gd"):remember("res://scripts/"+name)
	for name in DirAccess.get_files_at("res://art"):
		if name.begins_with("nomad-") and name.ends_with(".json") and name!="nomad-native-manifest.json":remember("res://art/"+name)
	own(assembly,assembly)
	var packed=PackedScene.new();assert(packed.pack(assembly)==OK)
	var saved=ResourceSaver.save(packed,OUTPUT,ResourceSaver.FLAG_COMPRESS)
	if saved!=OK:
		# A Windows sharing violation must fail the setup command, not leave a
		# headless engine waiting forever after a script assertion.
		push_error("Native machine could not be saved: "+error_string(saved))
		assembly.free();world.free();copies.clear();MMFAssets.cache.clear();call_deferred("quit",1);return
	var dependencies=ResourceLoader.get_dependencies(OUTPUT)
	assert(Array(dependencies).all(func(p):return not p.contains(".glb")),"Compiled machine must not pull obsolete GLB containers into memory")
	var compact=full.duplicate();compact.erase("colliders")
	var file=FileAccess.open("res://data/runtime-play.json",FileAccess.WRITE);file.store_string(JSON.stringify(compact,"",true,true));file.close()
	var report={"engine":Engine.get_version_info().string,"nodes":packed.get_state().get_node_count(),"embeddedResources":copies.size(),"bytes":FileAccess.get_file_as_bytes(OUTPUT).size(),"sha256":FileAccess.get_sha256(OUTPUT),"runtimePlaySha256":FileAccess.get_sha256("res://data/runtime-play.json"),"externalDependencies":Array(dependencies),"sources":source_files}
	file=FileAccess.open("res://art/nomad-native-manifest.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("NATIVE_MACHINE_BAKED ",{"nodes":report.nodes,"resources":report.embeddedResources,"bytes":report.bytes})
	assembly.free();world.free();copies.clear();MMFAssets.cache.clear();call_deferred("quit")
