extends SceneTree

var game
var checks=0
var failures=[]
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-receiver-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames(count=2):
	for i in count:await physics_frame
func tap_use():
	var event=InputEventKey.new();event.physical_keycode=KEY_E;event.keycode=KEY_E;event.pressed=true;Input.parse_input_event(event);await process_frame
	event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await process_frame
func refresh():game.world.update(0);game.story_art.update(0)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.settings.bindings={};game.configure_input();game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);await frames()
	var s=game.session;var receiver=game.world.receiver_model;var origin=receiver.root.global_position
	check(origin.is_equal_approx(Vector3(1,16.03,-9.8)),"Receiver remains at its original upper-deck site")
	var meshes=MMFAssets.of_type(receiver.root,"MeshInstance3D");var triangles=0;var collapsed=0;var textured=0;var points=[]
	for mesh in meshes:
		var old_collapsed=collapsed
		var transform=receiver.root.global_transform.affine_inverse()*mesh.global_transform
		for surface in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(surface);var vertices=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
			triangles+=indices.size()/3
			for vertex in vertices:points.append(transform*vertex)
			for i in range(0,indices.size(),3):
				if (vertices[indices[i+1]]-vertices[indices[i]]).cross(vertices[indices[i+2]]-vertices[indices[i]]).length_squared()<1e-18:collapsed+=1
			var material=mesh.get_active_material(surface)
			if material is StandardMaterial3D and material.albedo_texture and material.normal_texture:textured+=1
		if collapsed>old_collapsed:print("RECEIVER_DEGENERATES ",mesh.name," ",collapsed-old_collapsed)
	# Earned mounts are not part of the imported 15-batch receiver budget.
	var source=MMFAssets.scene("res://art/nomad-receiver.glb")
	check(MMFAssets.of_type(source,"MeshInstance3D").size()==15 and triangles<85000,"Receiver and retained optional rewards stay within bounded mesh/triangle budgets")
	source.free()
	var archive_part=game.story_art.part("ArchiveConsole")
	check(archive_part.transform.is_equal_approx(Transform3D.IDENTITY),"Shared archive part keeps its original local transform for existing destination consoles")
	archive_part.free()
	check(collapsed==0 and textured>=2,"Imported receiver retains PBR textures with no collapsed triangles")
	check(points.all(func(p):return p.x>=-.4501 and p.x<=.4501 and p.z>=-.2801 and p.z<=.2801),"Final receiver and reward vertices fit the unchanged walking footprint")
	check(MMFAssets.of_type(receiver.root,"Light3D").is_empty(),"Receiver adds no light sources")
	check(receiver.status.global_basis.z.dot(Vector3.BACK)>.999 and receiver.status.global_position.z>origin.z,"Physical screen faces the main aisle instead of the front railing")
	check(not receiver.status.no_depth_test and not receiver.status.double_sided and receiver.status.billboard==BaseMaterial3D.BILLBOARD_DISABLED,"Screen remains attached, depth-tested and readable only from its real face")
	var body=game.world.receiver_body
	refresh();check(not receiver.root.visible and body.collision_layer==0,"Unrecovered radio has neither visible model nor phantom collision")
	s.salvage_reward();s.update_power();refresh()
	check(receiver.root.visible and body.collision_layer==1,"Real first salvage exposes the receiver and enables its original collision")
	check(not receiver.module.visible and receiver.contacts.visible and receiver.status.text.contains("MODULE REQUIRED"),"Recovered unrepaired radio exposes its electrical bay and missing-module instruction")
	check(body.get_child(0).shape.size.is_equal_approx(Vector3(.9,1.44,.56)),"Unupgraded receiver keeps the original solid envelope")
	game.player.teleport(origin+Vector3(0,.02,1));await frames();check(game.interaction_target().get("kind")=="receiver","Aisle approach still presents the existing receiver prompt")
	await tap_use();check(game.menu_open and game.ui.page=="Signal","Actual E input opens the existing Signal page from the aisle")
	game.close_menu();game.player.teleport(origin+Vector3(0,.005,1.15));await frames()
	for i in 24:game.player.velocity=Vector3(0,0,-3);game.player.move_and_slide();await physics_frame
	check(game.player.position.z>origin.z+.61,"Actual walking cannot enter the receiver stand or controls")
	var ray=game.raycast(origin+Vector3(0,1.17,1),origin+Vector3(0,1.17,0),[],1)
	check(not ray.is_empty() and ray.collider==body,"Receiver face still blocks gameplay rays")
	s.inventory.add("scanner-replacement-module",1);check(s.install_scanner(),"Existing replacement module installs through session validation")
	refresh();check(receiver.module.visible and not receiver.contacts.visible and receiver.status.text.contains("READY TO SCAN"),"Installed cartridge replaces exposed contacts and reports scan readiness")
	check(s.start_scan(game.aboard()),"Existing powered scan starts without new requirements")
	s.tick(90,true,true);refresh()
	check(s.scanner.phase=="scanning" and is_equal_approx(s.scanner.elapsedS,90) and receiver.status.text.contains("50% COHERENCE"),"Physical readout matches actual half-complete scan")
	check(receiver.progress.visible and is_equal_approx(receiver.progress.scale.x,.5),"Progress bar fills to the actual value from its fixed left edge")
	var before=s.native_snapshot();refresh();check(s.native_snapshot()==before,"Presentation cannot advance scanning or mutate gameplay state")
	s.fuel=0;s.update_power();var elapsed=s.scanner.elapsedS;s.tick(3,true,true);refresh()
	check(s.scanner.elapsedS==elapsed and not receiver.progress.visible and not receiver.lamp.visible and receiver.status.text.contains("NO POWER") and receiver.status.shaded,"Real power loss pauses scanning, darkens the readout and disables the luminous meter")
	s.fuel=60;s.update_power();s.attack_recent=5;s.tick(1,true,true);refresh()
	check(s.scanner.elapsedS==elapsed and receiver.status.text.contains("PAUSED / THREAT"),"Attack interruption retains coherence and explains the actual pause")
	s.attack_recent=0;game.player.teleport(Vector3(20,20,30));s.tick(1,true,false);refresh()
	check(s.scanner.elapsedS==elapsed and receiver.status.text.contains("SCAN PAUSED"),"Leaving the machine cannot continue scanning or advertise active progress")
	game.player.teleport(origin+Vector3(0,.02,1));s.tick(1,true,true);refresh()
	check(s.scanner.elapsedS>elapsed and receiver.status.text.contains("SCANNING"),"Returning aboard resumes the existing scan")
	check(game.save_game("receiver-mid-scan"),"Native save stores the real unfinished scanner state")
	s.scanner.elapsedS=0;s.scanner.phase="awaiting-module";refresh();game.load_game("receiver-mid-scan")
	game.set_physics_process(false);game.player.set_physics_process(false);s=game.session;refresh()
	check(receiver.module.visible and s.scanner.phase=="scanning" and s.scanner.elapsedS>90 and receiver.status.text.contains("COHERENCE"),"Native load restores cartridge and progress without separate display save data")
	s.story.uniques=["annika-archive-shard","human-seed-bank"];refresh()
	check(game.story_art.archive.visible and game.story_art.seeds.visible and game.story_art.archive.global_basis.z.normalized().dot(Vector3.FORWARD)>.999 and game.story_art.seeds.global_basis.z.normalized().dot(Vector3.FORWARD)>.999,"Existing earned archive and seeds face the same aisle as the receiver")
	check(body.get_child(0).shape.size.y>=1.85,"Earned hardware retains its existing taller collision coverage")
	game.open_menu("Pause");var text=receiver.status.text;elapsed=s.scanner.elapsedS;await create_timer(.08).timeout
	check(receiver.status.text==text and s.scanner.elapsedS==elapsed,"Paused menu freezes scanner state and presentation together")
	game.close_menu();s.scanner.elapsedS=179;s.scanner.phase="scanning";s.attack_recent=0;s.tick(1,true,true);refresh()
	check(s.scanner.phase=="contact-ready" and receiver.status.text.contains("STABILIZING"),"Real 100 percent transition shows contact stabilization")
	s.tick(3,true,true);refresh();check(s.scanner.phase=="consumed" and game.cinematic=="signal" and receiver.status.text.contains("CONTACT ACQUIRED"),"Existing scanner signal still activates the original battle cinematic")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	receiver=null;MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Receiver test releases audio resources cleanly")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"trianglesIncludingEarnedModels":triangles,"collapsedTriangles":collapsed}
	var file=FileAccess.open("res://../test-results/godot-native/receiver-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("RECEIVER_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
