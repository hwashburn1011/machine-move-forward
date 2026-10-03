extends "res://tests/floor_surface_review.gd"
## One paused world and identical camera path; only the base asset's filter changes.

func material_state(material: BaseMaterial3D) -> Dictionary:
	var state={}
	for property in material.get_property_list():
		if int(property.usage)&PROPERTY_USAGE_STORAGE and property.name!="texture_filter":
			state[property.name]=material.get(property.name)
	return state

func run():
	if DisplayServer.get_name()=="headless":push_error("Native renderer required");quit(1);return
	label="filter-sampling"
	DisplayServer.window_set_size(Vector2i(1280,720));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.apply_quality();game.invulnerable=true
	camera=Camera3D.new();root.add_child(camera);camera.fov=65;camera.near=.08;camera.far=1800
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	await prepare("foundry")
	var site=game.campaign.destination
	var base=MMFAssets.find_named(site,"FoundryRoot")
	assert(base!=null)
	var materials=[];var snapshots=[];var old_filters=[]
	for mesh in MMFAssets.of_type(base,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(surface)
			if material is BaseMaterial3D and material not in materials:
				materials.append(material);snapshots.append(material_state(material));old_filters.append(material.texture_filter)
	var filters=[BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS,BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC]
	for mode in 2:
		for material in materials:material.texture_filter=filters[mode]
		await clip("foundry-"+(["trilinear","anisotropic"][mode]),site.to_global(Vector3(-4,.62,3.8)),site.to_global(Vector3(0,0,-.4)),Vector3(1.8,0,-.4))
	var unchanged=true
	for i in materials.size():
		unchanged=unchanged and material_state(materials[i])==snapshots[i]
		materials[i].texture_filter=old_filters[i]
	var file=FileAccess.open(output+label+"/capture.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"records":records,"only_texture_filter_changed":unchanged,"materials":materials.size(),"renderer":RenderingServer.get_video_adapter_name(),"note":"Same paused loaded scene, camera path, high Forward+ 4x MSAA, default LOD/shadows. No normal, roughness, vertex color, texture or palette changes. Native appearance comparison, not performance timing."},"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	materials.clear();snapshots.clear();MMFAssets.cache.clear();await drain.finish(self,refs)
	print("SAMPLING_REVIEW_COMPLETE unchanged_other_properties=",unchanged)
	quit(0 if unchanged else 1)
