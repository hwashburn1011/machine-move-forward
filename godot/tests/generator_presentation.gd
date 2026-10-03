extends SceneTree

var game
var checks=0
var failures=[]
var report={}
var review_camera: Camera3D

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-generator-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func sync():game.building.update(0)

func capture(name: String):
	if review_camera==null:return
	for i in 4:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/generator-state-"+name+".png"))

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var p=game.session.structures.filter(func(x):return x.definitionId=="generator")[0]
	var id=p.instanceId;var model=game.building.bodies[id];var art=game.building.generator_visuals[id]
	if DisplayServer.get_name()!="headless":
		DisplayServer.window_set_size(Vector2i(1600,1000));game.ui.root.hide();game.player.visual.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
		review_camera=Camera3D.new();game.add_child(review_camera);review_camera.fov=46;review_camera.current=true
		review_camera.position=model.position+Vector3(.9,1.35,-2.1);review_camera.look_at(model.position+Vector3(0,.77,0));review_camera.reset_physics_interpolation()
	var bounds=MMFAssets.bounds(model)
	check(bounds.position.y>=-.001 and bounds.position.y<.005,"Skids meet the deck plane")
	check(bounds.position.x>=-.851 and bounds.end.x<=.851 and bounds.position.z>=-.721 and bounds.end.z<=.721 and bounds.end.y<=1.301,"Refined geometry fits the unchanged collider envelope")
	var triangles=0;var surfaces=0;var textures=0
	for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
		for s in mesh.mesh.get_surface_count():
			surfaces+=1;var arrays=mesh.mesh.surface_get_arrays(s)
			triangles+=arrays[Mesh.ARRAY_INDEX].size()/3 if arrays[Mesh.ARRAY_INDEX].size()>0 else arrays[Mesh.ARRAY_VERTEX].size()/3
			var mat=mesh.get_active_material(s)
			if mat is StandardMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.roughness_texture:textures+=1
	check(triangles<=50000 and surfaces<=14,"Generator stays within 50k triangles and 14 material batches")
	check(textures>=3,"Paint, steel and tank carry portable colour, normal and roughness maps")
	var bodies=MMFAssets.of_type(model,"StaticBody3D");var shape=bodies[0].get_child(0)
	check(bodies.size()==1 and bodies[0].position.is_equal_approx(Vector3(0,.65,0)) and shape.shape.size.is_equal_approx(Vector3(1.7,1.3,1.44)),"Existing physical obstruction and hit target are retained")
	check(art.needle!=null and art.running!=null and art.reserve!=null and art.service!=null,"All instrument anchors survive GLB import")
	var port=MMFAssets.find_named(model,"FuelPort")
	check(port!=null and port.position.is_equal_approx(Vector3(.535,1.221,-.185)),"Fuel marker is located on the actual filler cap")
	var before=game.session.native_snapshot();var rng_before=game.session.rng.state
	for i in 100:sync()
	check(before==game.session.native_snapshot() and rng_before==game.session.rng.state,"Visual updates never mutate gameplay or consume gameplay randomness")
	var previous=-INF
	for fuel in [0.0,1.0,20.0,20.1,50.0,100.0]:
		game.session.fuel=fuel;sync()
		check(art.needle.rotation.z>previous,"Fuel dial advances monotonically at "+str(fuel)+" percent");previous=art.needle.rotation.z
		check(art.running.visible==(fuel>0) and art.reserve.visible==(fuel<=20) and not art.service.visible,"Run/reserve/condition lights match actual fuel at "+str(fuel)+" percent")
		if fuel in [0.0,100.0]:await capture(str(int(fuel)))
	check(is_equal_approx(art.needle.rotation.z,deg_to_rad(110)),"Full reserve reaches F tick")
	game.session.fuel=0;sync();check(is_equal_approx(art.needle.rotation.z,deg_to_rad(-110)),"Empty reserve reaches E tick")
	p.health=85;game.session.fuel=40;game.session.update_power();sync()
	check(art.service.visible and art.running.visible and is_equal_approx(game.session.capacity,8),"Damaged generator displays service need without changing proportional output")
	await capture("service")
	p.health=0;sync();check(not art.running.visible and art.service.visible,"Failed generator does not display RUN")
	p.health=170;game.session.update_power();sync();check(not art.service.visible,"Restored condition clears service lamp")
	# Exercise the real near/far refuel action, not a presentation-only setter.
	game.session.fuel=10;game.session.inventory.add("fuel",20)
	game.player.position=model.position+Vector3(5,0,0);game.service_piece(p);sync()
	check(game.session.fuel==10,"Distance check still prevents remote refuelling")
	game.player.position=model.position+Vector3(0,0,-1.5)
	var stock=game.session.inventory.count_item("fuel");game.service_piece(p);sync()
	check(is_equal_approx(game.session.fuel,minf(100,10+stock)) and game.player.equipment.refuel_left>0,"Physical refuel preserves transaction and canister gesture")
	check(is_equal_approx(art.needle.rotation.z,deg_to_rad(lerpf(-110,110,game.session.fuel/100))),"Physical refuel is reflected on the next visual update")
	var second=game.session.create_piece("generator",{"x":3,"y":0,"z":3},2,{},true);game.building.add_visual(second)
	var second_art=game.building.generator_visuals[second.instanceId]
	game.session.fuel=17;sync()
	check(is_equal_approx(art.needle.rotation.z,second_art.needle.rotation.z) and second_art.reserve.visible,"Multiple generators read the shared machine reserve")
	p.health=85;sync();check(art.service.visible and not second_art.service.visible,"Each unit has independent condition indication")
	game.building.choose("generator")
	check(MMFAssets.find_named(game.building.preview,"FuelNeedle")!=null and MMFAssets.of_type(game.building.preview,"MeshInstance3D").size()==MMFAssets.of_type(model,"MeshInstance3D").size(),"Placement preview uses the same detailed model")
	check(MMFAssets.of_type(game.building.preview,"StaticBody3D").is_empty(),"Placement ghost does not add colliders")
	game.building.cancel()
	# Model and cached instrumentation move together through the real placement path.
	var saved_cell=p.cell.duplicate();var saved_rotation=p.rotation
	var move_cell={"x":-3,"y":0,"z":-3};var destination=game.building.center(move_cell)
	if not game.building.floor_at(move_cell):
		var floor_piece=game.session.create_piece("floor",move_cell,0,{},true);game.building.add_visual(floor_piece)
	game.player.position=destination+Vector3(0,0,4)
	game.player.camera.global_position=destination+Vector3(0,3,4);game.player.camera.look_at(destination)
	game.building.choose("generator");game.building.moving=id;game.building.rotation_index=1;game.building.manual_level=0
	check(game.building.commit_placement() and p.cell==move_cell and p.rotation==1,"Real move placement preserves the generator's identity and rotates it")
	game.session.fuel=90;sync()
	check(art.needle.global_position.distance_to(model.to_global(art.needle.position))<.001 and art.needle.rotation.z>0,"Moved/rotated unit retains local instrument pivots")
	p.cell=saved_cell;p.rotation=saved_rotation;model.transform=game.building.piece_transform(p)
	game.session.fuel=13
	var payload={"session":game.session.native_snapshot(),"player":{"position":MMFAssets.dict_v(game.player.position),"yaw":0.0,"pitch":0.0}}
	game.load_payload(payload);sync()
	check(game.building.generator_visuals.size()==2 and game.session.fuel==13,"Loading an existing-format save rebuilds the generator cache and reserve")
	art=game.building.generator_visuals[id]
	check(art.reserve.visible and art.service.visible and is_equal_approx(art.needle.rotation.z,deg_to_rad(-81.4)),"Loaded fuel and damage are visible without a manual interaction")
	check(game.building.demolish(second.instanceId,true),"Generator destruction uses normal demolition handling")
	check(not game.building.generator_visuals.has(second.instanceId),"Demolished generator releases cached instrument references")
	for i in 4:await process_frame
	sync();check(game.building.generator_visuals.size()==1,"Visual updates remain valid after queued model deletion")
	report.geometry={"triangles":triangles,"surfaces":surfaces,"bounds":str(bounds)}
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean audio shutdown after refuel and load checks")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/generator-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
