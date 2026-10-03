extends SceneTree

var checks=0
var failures=[]
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-canopy-camera/";call_deferred("run")

func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var cloth=MMFAssets.find_named(game.world.canopy.root,"CanopyCanvas");var faces=PackedVector3Array()
	for v in cloth.mesh.get_faces():faces.append(cloth.global_transform*v)
	var geometries=[]
	for dy in [-.035,0,.035]:
		var shifted=PackedVector3Array()
		for v in faces:shifted.append(v+Vector3.UP*dy)
		var geometry=TriangleMesh.new();geometry.create_from_faces(shifted);geometries.append(geometry)
	var hits=[];var sample_count=0
	for at in [Vector3(-1,16.03,0),Vector3(4,16.03,0),Vector3(-1,16.03,4),Vector3(4,16.03,4)]:
		for pitch in [-.65,-.4,0,.35]:
			for yaw in [0,PI/2,PI,PI*1.5]:
				game.player.teleport(at);game.player.pitch=pitch;game.player.yaw=yaw
				for i in 3:game.player.update_camera(1);await physics_frame
				var a=game.player.pivot.global_position;var b=game.player.camera.global_position
				var contacts=0
				for geometry in geometries:
					var hit=geometry.intersect_segment(a,b);sample_count+=1
					if not hit.is_empty():contacts+=1;hits.append({"player":str(at),"pitch":pitch,"yaw":yaw,"camera":str(b),"hit":str(hit.position)})
				check(contacts==0,"Canopy clears the player camera at %s / %.2f / %.2f"%[at,pitch,yaw])
	var body=game.world.canopy.root.get_node("CanopyCameraOnly")
	check(body.collision_layer==32 and body.collision_mask==0 and (game.player.collision_mask&32)==0,"Fabric obstruction affects only the camera, not player movement")
	check((game.combat.nav.navigation_mesh.geometry_collision_mask&32)==0,"Enemy navigation excludes the camera-only fabric surface")
	var base=Vector3(1.5,17.8,2.5);var ray=game.raycast(base,base+Vector3.UP*3,[],1)
	check(ray.is_empty(),"Ordinary world queries and shooting still pass through canvas")
	check(not game.raycast(base,base+Vector3.UP*3,[],32).is_empty(),"Camera-only queries detect the fabric from underneath")
	if DisplayServer.get_name()!="headless":
		game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
		game.player.teleport(Vector3(4,16.03,4));game.player.pitch=-.65;game.player.yaw=PI*1.5
		for mode in ["before","after"]:
			game.player.arm.collision_mask=1 if mode=="before" else 1|MMFMachineCanopy.CAMERA_LAYER
			for i in 8:game.player.update_camera(1);await physics_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/canopy-camera-"+mode+".png"))
	var report={"checks":checks,"failures":failures,"views":64,"surfaceSamples":sample_count,"obstructed":hits}
	var file=FileAccess.open("res://../test-results/godot-native/canopy-camera-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("CANOPY_CAMERA_RESULT ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
