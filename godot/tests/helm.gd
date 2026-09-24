extends SceneTree

var game
var checks=0
var failures=[]
var report={}

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-helm-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count=2):
	for i in count:await physics_frame
func use():
	var event=InputEventKey.new();event.physical_keycode=KEY_E;event.keycode=KEY_E;event.pressed=true;Input.parse_input_event(event);await process_frame
	event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await process_frame

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	await frames();await process_frame
	var helm=game.world.helm_model;var s=game.session;var origin=helm.root.global_position
	check(origin.is_equal_approx(Vector3(-3,16.03,-9)),"Refined helm preserves its real upper-deck service site")
	# A transformed batch AABB overestimates the merged sloping controls.
	# Use actual imported vertices when checking their physical envelope.
	var bounds=AABB();var initialized=false
	for mesh in MMFAssets.of_type(helm.root,"MeshInstance3D"):
		var placement=helm.root.global_transform.affine_inverse()*mesh.global_transform
		for surface in mesh.mesh.get_surface_count():
			for vertex in mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]:
				var point=placement*vertex
				if not initialized:bounds=AABB(point,Vector3.ZERO);initialized=true
				else:bounds=bounds.expand(point)
	print("HELM_VERTEX_BOUNDS ",bounds," conservative ",MMFAssets.bounds(helm.root))
	check(bounds.position.y>-.001 and absf(bounds.position.y)<.001,"Continuous isolation seal sits on the real deck")
	check(bounds.position.x>=-.6001 and bounds.end.x<=.6001 and bounds.position.z>=-.3751 and bounds.end.z<=.3751 and bounds.end.y<=1.3501,"Every model part remains inside the unchanged helm collision envelope")
	var meshes=MMFAssets.of_type(helm.root,"MeshInstance3D");var triangles=0;var collapsed=0;var textured=0
	for mesh in meshes:
		for surface in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(surface);var vertices=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
			triangles+=indices.size()/3
			for i in range(0,indices.size(),3):
				if (vertices[indices[i+1]]-vertices[indices[i]]).cross(vertices[indices[i+2]]-vertices[indices[i]]).length_squared()<1e-18:collapsed+=1
			var material=mesh.get_active_material(surface)
			if material is StandardMaterial3D and material.albedo_texture and material.normal_texture:textured+=1
	check(meshes.size()==17 and triangles<70000,"259 editable Blender parts are batched within the native mesh budget")
	check(collapsed==0,"Imported model has no collapsed render triangles")
	check(textured>=2,"Native model retains its original portable PBR paint and steel maps")
	check(MMFAssets.of_type(helm.root,"Light3D").is_empty() and MMFAssets.of_type(helm.root,"CollisionObject3D").is_empty(),"Presentation adds no lights, physics bodies or per-part processes")
	var mount=MMFAssets.find_named(helm.root,"HelmDialMount")
	check((helm.root.global_transform.affine_inverse()*mount.global_transform).origin.distance_to(Vector3(-.17,1.276,.01))<.0001 and is_equal_approx(mount.rotation.x,.41),"Earned bearing hardware retains its exact pivot and instrument angle")
	check(MMFAssets.find_named(game.world.machine,"EarnedNavigationHardware")==null,"Frozen earned dial is removed so runtime hardware appears only once")
	var body=null
	for child in game.world.get_children():
		if child is StaticBody3D and child.position.distance_to(Vector3(-3,16.705,-9))<.001:body=child
	check(body!=null and body.get_child(0).shape is BoxShape3D and body.get_child(0).shape.size.is_equal_approx(Vector3(1.2,1.35,.75)),"Original body collider, position and size are unchanged")
	var ray=game.raycast(origin+Vector3(0,.7,1.1),origin+Vector3(0,.7,0),[],1)
	check(not ray.is_empty() and ray.collider==body,"Front service face still blocks physical rays")
	game.player.teleport(origin+Vector3(0,.005,1.15));await frames()
	for i in 20:game.player.velocity=Vector3(0,0,-3);game.player.move_and_slide();await physics_frame
	check(game.player.position.z>origin.z+.69,"Actual walking cannot enter the refined console")
	# Reproduce the former dead zone at the visible operator position.
	game.player.teleport(origin+Vector3(-.2,.02,1));await frames()
	check(game.player.position.distance_to(Vector3(0,16.03,-10))>3 and game.interaction_target().get("kind")=="helm","Visible helm approach outside the old trigger now gives the helm prompt")
	await use();check(game.menu_open and game.ui.page=="Helm" and paused,"The displayed physical E action opens the existing Helm menu and pauses aboard")
	game.close_menu();s.facts.salvage=true
	game.player.teleport(Vector3(-.1,16.05,-8.3));await frames()
	check(game.interaction_target().get("kind")=="receiver","Closer receiver wins at the former phantom helm trigger")
	await use();check(game.menu_open and game.ui.page=="Signal","Receiver prompt executes the receiver menu at that same position")
	game.close_menu();game.player.teleport(origin+Vector3(0,.02,1));await frames()
	check(game.interaction_target().get("kind")=="helm","Recovered receiver does not steal the actual helm approach")
	game.player.teleport(origin+Vector3(0,-3.6,1));await frames()
	check(game.interaction_target().get("kind")!="helm","The deck below cannot operate the helm through its ceiling")
	s.story.uniques=[];s.update_power();game.world.sync_progress();helm.refresh(s)
	check(not helm.gyro.visible and helm.cover.visible and helm.bearing_cover.visible and game.world.bearing_needle==null,"Unrecovered gyro uses matching physical blank covers and no live bearing needle")
	check(helm.displayed==0 and not helm.lamp.emission_enabled,"An unfitted helm does not advertise gyro power")
	var before=s.native_snapshot();helm.refresh(s)
	check(s.native_snapshot()==before,"Visual status changes do not grant progression, alter fuel or spend inventory")
	s.story.uniques=["course-gyro"];s.update_power();game.world.sync_progress()
	check(helm.gyro.visible and not helm.cover.visible and not helm.bearing_cover.visible and game.world.bearing_needle!=null,"Recovered gyro swaps its cover for the detailed cartridge and live dial")
	check(helm.displayed==2 and helm.lamp.emission_enabled,"Powered gyro shows its restrained green status lens")
	var original_course=s.course;s.course=18;game.world.update(.3)
	check(is_equal_approx(game.world.bearing_needle.rotation.y,-deg_to_rad(18)),"Existing live bearing needle still follows course")
	s.course=original_course;s.fuel=0;s.update_power();helm.update(.3,s)
	check(helm.displayed==1 and helm.lamp.emission.r>helm.lamp.emission.g,"A real power shortage turns the fitted gyro lamp amber")
	s.fuel=60;s.update_power();helm.update(.3,s)
	check(helm.displayed==2,"Restored generation returns the gyro lamp to green")
	s.story.uniques=["course-gyro","course-actuator","vector-governor","meridian-solution"];s.update_power();game.world.sync_progress()
	var host=MMFAssets.find_named(game.world.machine,"HelmRoot");var hardware=MMFAssets.find_named(host,"NativeProgressHardware")
	for name in ["HelmActuator","HelmGovernor","HelmMeridian","HelmBearingNeedle"]:check(MMFAssets.find_named(hardware,name)!=null,"Existing earned upgrade remains visible: "+name)
	var instance=hardware.get_instance_id();game.world.sync_progress()
	check(hardware.get_instance_id()==instance and host.get_children().filter(func(n):return n.name=="NativeProgressHardware").size()==1,"Unchanged progress does not duplicate the earned assembly")
	game.player.teleport(origin+Vector3(0,.02,1));await frames()
	check(game.save_game("helm-upgrades"),"Fully fitted helm state saves through the native game")
	s.story.uniques=[];game.world.sync_progress()
	check(not helm.gyro.visible and game.world.bearing_needle==null,"Restoring an earlier progress state removes cartridge and needle")
	game.load_game("helm-upgrades");game.set_physics_process(false);game.player.set_physics_process(false);game.world.update(0)
	check(helm.gyro.visible and game.world.bearing_needle!=null and "meridian-solution" in game.session.story.uniques,"Save load restores all earned helm hardware")
	game.open_menu("Pause");var course=game.world.bearing_needle.rotation.y;var state=helm.displayed
	await create_timer(.08).timeout
	check(game.world.bearing_needle.rotation.y==course and helm.displayed==state,"Paused menus hold the helm's visual state steady")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	helm=null
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Helm test releases native audio cleanly")
	report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"triangles":triangles,"collapsedTriangles":collapsed,"materialBatches":meshes.size()}
	var file=FileAccess.open("res://../test-results/godot-native/helm-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("HELM_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
