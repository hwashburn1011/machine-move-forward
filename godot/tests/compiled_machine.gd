extends SceneTree

var checks=0
var failures=[]

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-compiled-machine-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func cached_material_contract():
	var Contract=preload("res://tests/machine_resource_contract.gd")
	var material=StandardMaterial3D.new();material.albedo_color=Color(.3,.4,.5);material.roughness=.72
	var equivalent=material.duplicate()
	var source=Node3D.new();source.name="CachedPaint"
	var compiled=Node3D.new();compiled.name="CachedPaint"
	source.set_meta("nomad_original_finish_materials",{0:material})
	compiled.set_meta("nomad_original_finish_materials",{0:equivalent})
	var same=Contract.new();same.compare(source,compiled)
	check(same.differences.is_empty() and same.links.get(material)==equivalent,"Cached paint metadata compares equivalent independent materials and records their sharing relation")
	check(same.equal_value({"nested":[{0:material},material]},{"nested":[{0:equivalent},equivalent]}),"Nested dictionaries and arrays preserve previously mapped cached material references")
	same.clear()
	var split=Contract.new()
	check(not split.equal_value({"slots":[material,material]},{"slots":[equivalent,equivalent.duplicate()]}),"Cached material contract rejects splitting one shared material into independent copies")
	split.clear()
	var merged=Contract.new()
	check(not merged.equal_value({"slots":[material,material.duplicate()]},{"slots":[equivalent,equivalent]}),"Cached material contract rejects merging independent materials into one shared copy")
	merged.clear()
	var modified=equivalent.duplicate();modified.roughness=.31
	compiled.set_meta("nomad_original_finish_materials",{0:modified})
	var changed=Contract.new();changed.compare(source,compiled)
	check(changed.differences.size()==1 and "metadata/nomad_original_finish_materials" in changed.differences[0],"Cached metadata still detects changed material properties rather than omitting the cache")
	changed.clear()
	var shape=Contract.new()
	check(not shape.equal_value({0:material},{1:equivalent}) and not shape.equal_value([material],[equivalent,equivalent]) and not shape.equal_value({0:material},[equivalent]),"Cached contract rejects changed keys, array lengths and container types")
	shape.clear();source.free();compiled.free()

func run():
	cached_material_contract()
	var manifest=MMFAssets.json("res://art/nomad-native-manifest.json");var stale=[]
	for path in manifest.sources:
		var hash=FileAccess.get_file_as_string(path).replace("\r\n","\n").sha256_text() if path.get_extension() in ["gd","json","import"] else FileAccess.get_sha256(path)
		if hash!=manifest.sources[path]:stale.append(path)
	check(stale.is_empty(),"Compiled machine is current with every source GLB, import recipe, assembly script and manifest: "+str(stale))
	check(FileAccess.get_sha256("res://art/nomad-native.scn")==manifest.sha256 and FileAccess.get_sha256("res://data/runtime-play.json")==manifest.runtimePlaySha256,"Generated binary and compact gameplay data match their recorded content hashes")
	check(Engine.get_version_info().string==manifest.engine,"Compiled scene matches the current engine version")
	check(Array(ResourceLoader.get_dependencies("res://art/nomad-native.scn")).all(func(p):return not p.contains(".glb")),"Compiled scene loads external textures/shaders without obsolete GLB containers")
	var full=MMFAssets.json("res://data/runtime.json");full.erase("colliders")
	check(full==MMFAssets.json("res://data/runtime-play.json"),"Compact play data preserves every non-machine contract exactly")
	set_meta("author_machine",true)
	var source=load("res://scenes/main.tscn").instantiate();root.add_child(source)
	remove_meta("author_machine")
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for instance in [source,game]:instance.set_physics_process(false);instance.player.set_physics_process(false)
	var compare=preload("res://tests/machine_resource_contract.gd").new()
	compare.compare(source.world.machine,game.world.machine)
	var a=source.world.get_children().filter(func(n):return n is StaticBody3D)
	var b=game.world.get_children().filter(func(n):return n is StaticBody3D)
	check(a.size()==b.size(),"Compiled world installs the same static collision bodies at the world root")
	if a.size()==b.size():
		for i in a.size():compare.compare(a[i],b[i])
	check(compare.differences.is_empty(),"All node properties, mesh buffers, LODs, shadow meshes, materials, collision shapes and sharing match: "+str(compare.differences))
	var contract={"nodes":compare.node_count,"resourceUses":compare.resource_count,"sharedResources":compare.links.size(),"differences":compare.differences.duplicate()};compare.clear()
	check(game.world.native_access!=null and game.world.native_dressing!=null and game.world.native_intake!=null and game.world.rotor!=null,"Existing gameplay and presentation bindings find their authored nodes")
	var another=MMFAssets.scene("res://art/nomad-native.scn");root.add_child(another)
	var other_canvas=MMFAssets.find_named(another,"CanopyCanvas").material_override
	var other_indicators=MMFAssets.find_named(another,"SwitchgearIndicators").material_override
	check(other_canvas!=game.world.canopy.fabric and other_indicators!=game.world.switchgear.indicators,"Separate game instances get independent animated shader state")
	var indicator_meshes=MMFAssets.of_type(game.world.switchgear.root,"MeshInstance3D").filter(func(n):return n.name=="SwitchgearIndicators")
	check(indicator_meshes.size()==2 and indicator_meshes.all(func(n):return n.material_override==game.world.switchgear.indicators),"Both retained cabinets within one game retain their shared status material")
	game.world.canopy.update(.5,.7);game.session.capacity=16;game.session.demand=19;game.world.switchgear.update(1,game.session)
	check(is_equal_approx(game.world.canopy.fabric.get_shader_parameter("cloth_time"),.5) and other_canvas.get_shader_parameter("cloth_time")!=.5,"Compiled canopy responds to simulation time without changing another instance")
	check(game.world.switchgear.indicators.get_shader_parameter("status_bits")==Vector3(1,1,0) and other_indicators.get_shader_parameter("status_bits")!=Vector3(1,1,0),"Compiled indicators display real power status without changing another instance")
	another.free();other_canvas=null;other_indicators=null;indicator_meshes.clear()
	for pose in [[0.0,0.0],[3.3,0.0],[17.0,2.5],[88.0,-7.0],[700.0,180.0]]:
		source.world.gait.update(pose[0],pose[1]);game.world.gait.update(pose[0],pose[1]);var same=true
		for i in 4:
			for joint in ["upper","lower","foot"]:same=same and source.world.gait.joints[i][joint].transform.is_equal_approx(game.world.gait.joints[i][joint].transform)
		check(same,"Compiled four-leg articulation preserves the complete original pose at travel "+str(pose))
	for open in [true,false]:
		source.world.set_dock_open(open);game.world.set_dock_open(open)
		check(a.size()==b.size() and range(a.size()).all(func(i):return a[i].collision_layer==b[i].collision_layer),"Dock safety gates retain their world-root collision lifecycle: "+str(open))
	var refs=[]
	for instance in [source,game]:
		instance.open_menu("Pause");while instance.combat.nav.is_baking():await create_timer(.02).timeout
		refs.append_array(preload("res://tests/audio_drain.gd").capture(instance.audio));instance.queue_free()
	while is_instance_valid(source) or is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Both authoring and compiled game instances release cleanly")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"contract":contract,"staleSources":stale}
	var file=FileAccess.open("res://../test-results/godot-native/compiled-machine-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("COMPILED_MACHINE_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
