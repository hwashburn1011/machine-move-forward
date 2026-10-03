extends SceneTree

var game
var checks=0
var failures=[]
var observations={}

# A real engine worker deliberately finishes late. No live scene access or
# shared mutable state occurs on that thread.
class SlowFixture extends ResourceFormatLoader:
	func _get_recognized_extensions() -> PackedStringArray:return PackedStringArray(["encounterprobe"])
	func _handles_type(type: StringName) -> bool:return type==&"PackedScene"
	func _get_resource_type(_path: String) -> String:return "PackedScene"
	func _load(path: String,_original: String,_subthreads: bool,_cache: int):
		var other_status=ResourceLoader.load_threaded_get_status(path.replace("independent-sync","independent-background")) if path.contains("independent-sync") else ResourceLoader.THREAD_LOAD_INVALID_RESOURCE
		OS.delay_msec(350)
		if path.contains("wrong"):return Resource.new()
		var node=Node3D.new();node.name="WorkerFixture"
		var scene=PackedScene.new();scene.pack(node);node.free()
		scene.set_meta("worker",OS.get_thread_caller_id());scene.set_meta("pending_at_load",other_status);return scene

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-encounter-loading-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func wait_ready(nodes: Array):
	var start=Time.get_ticks_msec()
	while nodes.any(func(n):return not n.finished) and Time.get_ticks_msec()-start<20000:await process_frame
	check(nodes.all(func(n):return n.finished),"Preparation finishes within bounded timeout")
func helper(paths: Array):
	# These probes isolate request ownership after title material/tell preparation.
	# The real preparer's warm-up stages are checked separately in run().
	var node=MMFEncounterAssets.new();node.paths=paths;node.material_index=MMFEncounterAssets.MATERIALS.size();node.tells_prepared=true;node.roof_shape_index=MMFSiteRoofs.SHAPE_PATHS.size();root.add_child(node);return node
func fixture_path(label: String) -> String:
	var path=MMFSaves.DIRECTORY+label+".encounterprobe"
	var f=FileAccess.open(path,FileAccess.WRITE);f.store_string("test fixture");f.close();return path

func asynchronous():
	var loader=SlowFixture.new();ResourceLoader.add_resource_format_loader(loader,true)
	var gate_path=fixture_path("opening-gate");var gate=helper([gate_path]);gate._process(0)
	var stage=game.cinematics.opening_stage;var actual_assets=stage.encounter_assets
	stage.encounter_assets=gate;stage.request()
	await process_frame;await process_frame
	check(not game.started and stage.requested and not stage.prepared(),"Immediate New Game stays at title while encounter resources are unfinished")
	stage.cancel();await wait_ready([gate])
	check(not game.started and not stage.requested,"Cancelling preparation does not launch the opening when resources finish")
	stage.encounter_assets=actual_assets;gate.free();MMFAssets.cache.erase(gate_path);DirAccess.remove_absolute(gate_path)
	var path=fixture_path("shared");var first=helper([path]);var second=helper([path])
	first._process(0);second._process(0)
	check(first.pending==path and second.pending==path,"Concurrent owners each retain one accepted request")
	var frames=0;var start=Time.get_ticks_msec()
	while not first.finished and Time.get_ticks_msec()-start<3000:
		await process_frame;frames+=1
	await wait_ready([first,second])
	check(frames>3,"Frames continue while actual engine worker delays loading")
	check(first.requests==1 and first.completed==1 and second.requests==1 and second.completed==1,"Both concurrent owners consume exactly one result")
	check(MMFAssets.cache[path].get_meta("worker")!=OS.get_thread_caller_id(),"Slow resource was built on an engine worker, not the scene thread")
	check(ResourceLoader.load_threaded_get_status(path)==ResourceLoader.THREAD_LOAD_INVALID_RESOURCE,"Shared engine request is fully released after both owners collect")
	var packed=MMFAssets.cache[path];var repeated=helper([path,path]);await wait_ready([repeated])
	check(repeated.requests==0 and repeated.completed==0 and MMFAssets.cache[path]==packed,"Cached repeated preparation keeps original resource without new work")
	var exit_path=fixture_path("shutdown");var leaving=helper([exit_path]);leaving._process(0);leaving.free()
	check(MMFAssets.cache[exit_path] is PackedScene and ResourceLoader.load_threaded_get_status(exit_path)==ResourceLoader.THREAD_LOAD_INVALID_RESOURCE,"Immediate teardown drains its unfinished request safely")
	var join_path="res://../test-results/godot-native/synchronous.encounterprobe"
	var join_file=FileAccess.open(join_path,FileAccess.WRITE);join_file.store_string("test fixture");join_file.close()
	var arriving=helper([join_path]);arriving._process(0)
	var model=MMFAssets.scene(join_path)
	check(model.name=="WorkerFixture" and MMFAssets.cache[join_path].get_meta("worker")!=OS.get_thread_caller_id(),"Immediate model use joins the existing worker and returns a complete scene")
	model.free();await wait_ready([arriving])
	check(arriving.completed==1 and arriving.failures.is_empty() and ResourceLoader.load_threaded_get_status(join_path)==ResourceLoader.THREAD_LOAD_INVALID_RESOURCE,"Synchronous fallback and original owner each consume their own request")
	var independent_background="res://../test-results/godot-native/independent-background.encounterprobe"
	var independent_sync="res://../test-results/godot-native/independent-sync.encounterprobe"
	for independent_path in [independent_background,independent_sync]:
		var independent_file=FileAccess.open(independent_path,FileAccess.WRITE);independent_file.store_string("test fixture");independent_file.close()
	var owners_before=MMFAssets.scene_preparers.size()
	var background=helper([independent_background]);background._process(0)
	check(background.pending==independent_background,"Unrelated preparation owns a real unfinished request")
	var independent_model=MMFAssets.scene(independent_sync)
	check(background.pending=="" and background.completed==1 and background.requests==1,"Immediate unrelated scene drains exactly the preparer's owned request")
	check(MMFAssets.cache[independent_sync].get_meta("pending_at_load")==ResourceLoader.THREAD_LOAD_INVALID_RESOURCE,"Different synchronous scene starts only after pending renderer resource load is collected")
	independent_model.free();background.free()
	check(MMFAssets.scene_preparers.size()==owners_before,"Freed preparer unregisters immediately without stale ownership")
	var wrong_path=fixture_path("wrong");var good_path=fixture_path("recovery")
	var recover=helper([wrong_path,good_path]);await wait_ready([recover])
	check(recover.failures==[wrong_path] and recover.completed==1 and not MMFAssets.cache.has(wrong_path),"Wrong resource type stays out of cache and does not block following assets")
	for node in [first,second,repeated,recover,arriving]:node.free()
	for item in [path,exit_path,wrong_path,good_path,join_path,independent_background,independent_sync]:
		MMFAssets.cache.erase(item)
		if FileAccess.file_exists(item):DirAccess.remove_absolute(item)
	ResourceLoader.remove_resource_format_loader(loader)
	observations.workerFrames=frames

func same_geometry(original: TorusMesh,baked: ArrayMesh,label: String):
	var before=original.surface_get_arrays(0);var after=baked.surface_get_arrays(0)
	var matches=true;var errors={}
	for channel in Mesh.ARRAY_MAX:
		if before[channel]==null or after[channel]==null:matches=matches and before[channel]==after[channel];continue
		if before[channel].size()!=after[channel].size():matches=false;continue
		var max_error=0.0
		for i in before[channel].size():
			var a=before[channel][i];var b=after[channel][i]
			if channel in [Mesh.ARRAY_NORMAL,Mesh.ARRAY_TANGENT]:
				var error=a.distance_to(b) if a is Vector3 else absf(a-b)
				max_error=maxf(max_error,error)
				# ArrayMesh stores these directions in Godot's packed format.
				# Max vector error .0002 is below 0.012 degrees; positions,
				# UVs and triangle indices must match exactly.
				matches=matches and error<.0002
			else:matches=matches and a==b
		errors[str(channel)]=max_error
	observations[label]=errors
	check(matches,label+": positions, UVs and winding are exact; packed directions remain within 0.012 degrees")
	check(original.get_aabb().is_equal_approx(baked.get_aabb()),label+": bounds remain unchanged")

func same_material(actual: StandardMaterial3D,color: Color,energy: float,label: String):
	var expected=MMFAssets.material(color,energy);var matches=true
	for property in expected.get_property_list():
		if property.usage&PROPERTY_USAGE_STORAGE and property.name not in ["resource_name","resource_path","resource_local_to_scene","script"]:
			matches=matches and actual.get(property.name)==expected.get(property.name)
	check(matches,label+": every stored material setting matches original")
func warnings():
	var ring=TorusMesh.new();ring.inner_radius=.6;ring.outer_radius=.64
	same_geometry(ring,MMFEnemy.TACTICAL_RING,"Enemy warning")
	var shell=TorusMesh.new();shell.inner_radius=.65;shell.outer_radius=.72;shell.rings=32;shell.ring_segments=6
	same_geometry(shell,MMFEffects.SHELL_RING,"Shell warning")
	same_material(MMFEnemy.WARNING_READY,Color(1,.16,.04),2,"Ready")
	same_material(MMFEnemy.WARNING_DANGER,Color(1,.24,.06),2,"Danger")
	same_material(MMFEnemy.WARNING_VULNERABLE,Color(.25,1,.55),2,"Vulnerable")
	same_material(MMFEffects.SHELL_WARNING,Color(1,.12,.02),1,"Shell")
	var a=game.effects.warning_ring(Vector3(2,16,2));var b=game.effects.warning_ring(Vector3(-2,16,2))
	check(a!=b and a.mesh==b.mesh and a.material_override==b.material_override,"Shells own separate nodes with shared immutable geometry/material")
	check(a.position.is_equal_approx(Vector3(2,16.05,2)) and a.cast_shadow==GeometryInstance3D.SHADOW_CASTING_SETTING_OFF,"Shell offset and shadow behavior are unchanged")
	a.position.x=8;a.queue_free();await process_frame
	check(is_instance_valid(b) and b.position.is_equal_approx(Vector3(-2,16.05,2)),"Moving/freeing one shell leaves the other warning untouched")
	b.queue_free()
	game.started=true;game.session.opening_done=true;game.close_menu();game.player.teleport(Vector3(50,16.05,2))
	MMFAssets.box(game,Vector3(24,1,24),Vector3(50,15.5,0));await physics_frame
	var bastion=game.combat.spawn("bastion",Vector3(50,16.05,0));var sword=game.combat.spawn("revenant",Vector3(53,16.05,0))
	for e in [bastion,sword]:e.set_physics_process(false);e.cooldown=100;e.mission="assault"
	check(bastion.tactical_marker.mesh==sword.tactical_marker.mesh and not bastion.tactical_marker.visible,"Enemies share ring geometry and retain initially hidden warnings")
	bastion.phase="vent";sword.phase="telegraph";bastion._physics_process(0);sword._physics_process(0)
	check(bastion.tactical_marker.visible and sword.tactical_marker.visible and bastion.tactical_marker.material_override==MMFEnemy.WARNING_VULNERABLE and sword.tactical_marker.material_override==MMFEnemy.WARNING_DANGER,"Real enemy ticks show simultaneous independent vent and sword warnings")
	bastion.timer=2;bastion._physics_process(0)
	check(not bastion.tactical_marker.visible and sword.tactical_marker.visible and sword.tactical_marker.material_override==MMFEnemy.WARNING_DANGER,"Vent expiry does not alter another enemy warning")
	check(MMFEnemy.WARNING_READY.albedo_color.is_equal_approx(Color(1,.16,.04)) and MMFEnemy.WARNING_VULNERABLE.albedo_color.is_equal_approx(Color(.25,1,.55)),"State changes never mutate shared source materials")
	bastion.queue_free();sword.queue_free();game.combat.enemies.clear();await process_frame

func run():
	DirAccess.make_dir_recursive_absolute(MMFSaves.DIRECTORY)
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var snapshot=game.session.native_snapshot().duplicate(true);var rng=game.session.rng.state
	var prep=game.get_node("EncounterAssets");await wait_ready([prep])
	check(MMFEncounterAssets.PATHS.all(func(path):return MMFAssets.cache.get(path) is PackedScene),"Actual title prepares six enemy scenes, commander drone, stairs, both furnishing collections and Gatekeeper hardware")
	check(prep.tells_prepared and MMFEnemyTells.arrow_mesh!=null and MMFEnemyTells.direction_mesh()==MMFEnemyTells.arrow_mesh,"Actual title prepares the single shared direction mesh before an enemy needs it")
	check(MMFArt100Decor._models.size()==25 and MMFArt200Decor._models.size()==25,"Title preparation finishes all fifty independent furnishing preview scenes")
	check(MMFSiteRoofs._models.size()==MMFSiteRoofs.ROOTS.size() and MMFSiteRoofs._shapes.size()==MMFSiteRoofs.SITES.size() and prep.roof_shape_index==MMFSiteRoofs.SITES.size(),"Title prepares every shared roof/sign assembly and exact site collision")
	check(MMFSiteGrounding._models.size()==MMFSiteGrounding._data.models.size() and MMFSiteGrounding.ROOTS.values().all(func(id):return MMFSiteGrounding._models.has(id)),"Title prepares all lower-building roots and both buried foundation templates")
	check(MMFRoadsideOutposts.models.size()==MMFRoadsideOutposts.ROOTS.size() and not is_instance_valid(game.roadside.tower),"Title prepares both tower models without creating guards or an encounter")
	check(MMFArt100Story.parts.has("WardenRangefinder"),"Title prepares the guard's fitted rangefinder before the first roadside reveal")
	var grounded_models=MMFSiteGrounding._models.duplicate();var outpost_models=MMFRoadsideOutposts.models.duplicate()
	MMFSiteGrounding.prepare_models();MMFRoadsideOutposts.prepare_models()
	check(grounded_models==MMFSiteGrounding._models and outpost_models==MMFRoadsideOutposts.models,"Repeated lower-building and tower preparation retains the same shared resources")
	var roof_models=MMFSiteRoofs._models.duplicate();var roof_shapes=MMFSiteRoofs._shapes.duplicate()
	MMFSiteRoofs.prepare_models()
	for i in MMFSiteRoofs.SITES.size():MMFSiteRoofs.prepare_shape(i)
	check(roof_models==MMFSiteRoofs._models and roof_shapes==MMFSiteRoofs._shapes,"Repeated roof preparation retains packed geometry and native collision resources")
	var cached_old=MMFArt100Decor._models.duplicate();var cached_new=MMFArt200Decor._models.duplicate()
	MMFArt100Decor.prepare_models();MMFArt200Decor.prepare_models()
	check(cached_old==MMFArt100Decor._models and cached_new==MMFArt200Decor._models,"Repeated preparation retains the same packed resources without rebuilding collections")
	check(prep.requests<=MMFEncounterAssets.PATHS.size() and prep.completed==prep.requests and prep.failures.is_empty() and not prep.is_processing(),"Real preparation is bounded, successful and stops when finished")
	check(snapshot==game.session.native_snapshot() and rng==game.session.rng.state and game.combat.enemies.is_empty(),"Title preparation does not advance session, consume encounter RNG or spawn actors")
	await asynchronous()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	await warnings()
	var f=FileAccess.open("res://../test-results/godot-native/encounter-loading-tests.json",FileAccess.WRITE);f.store_string(JSON.stringify({"checks":checks,"failures":failures,"observations":observations},"\t"));f.close()
	print("ENCOUNTER_LOADING_RESULT ",checks," checks, ",failures.size()," failures")
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)
