extends SceneTree
## Scheduled rendered fixture. Uses real workbench/trolley authorities and current
## game models/materials. Stock and a guardian receipt are explicit test setup.
const Fixture=preload("res://tests/nomad_personalization_fixture.gd")
var game
var review_camera: Camera3D
var captures=[]
var failures=[]
var layouts=[]
const OUT="res://../test-results/beta-next/native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://nomad-personalization-review/";call_deferred("run")

func frames(count: int=5):
	for i in count:await process_frame
	await RenderingServer.frame_post_draw

func capture(name: String):
	await frames()
	var path=OUT+name+".png";var error=root.get_texture().get_image().save_png(path)
	if error!=OK:failures.append("Capture failed: "+name)
	captures.append(name);print("PERSONALIZATION_CAPTURE ",name)

func require(ok: bool,label: String):
	if not ok:failures.append(label);push_error(label)

func show_model(node: Node3D,front: float=-1.0):
	game.close_menu();game.ui.root.hide()
	var bounds=MMFAssets.bounds(node);var center=node.to_global(bounds.get_center());var radius=maxf(.35,bounds.size.length()*.52)
	review_camera.fov=38;review_camera.position=center+Vector3(1.1,.65,front*1.5).normalized()*radius*3.1
	review_camera.look_at(center);review_camera.current=true;review_camera.reset_physics_interpolation()

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var parts=Fixture.prepare(game);await frames(12)
	review_camera=Camera3D.new();game.add_child(review_camera)
	Fixture.enter(game,parts.workbench)
	for size in [Vector2i(1440,810),Vector2i(1200,675)]:
		DisplayServer.window_set_size(size);await frames();game.ui.scroller.scroll_vertical=10000;await capture("patchcoat-workbench-unrestored-"+str(size.x))
	DisplayServer.window_set_size(Vector2i(1440,810));await frames()
	require(game.personalization.restore_tools(parts.workbench.instanceId),"Actual paid tool restoration")
	await capture("patchcoat-workbench-restored")
	for row in [["radio","petrol"],["board","stone"],["chair","oxblood"],["generator","slate"]]:
		var piece=parts[row[0]];var model=game.building.bodies[piece.instanceId]
		var front=-1.0 if row[0]=="generator" else 1.0
		show_model(model,front);await capture("patchcoat-"+row[0]+"-original")
		Fixture.enter(game,parts.trolley)
		require(game.personalization.paint_piece(parts.trolley.instanceId,piece.instanceId,row[1]),"Paid finish "+row[0])
		show_model(model,front);await capture("patchcoat-"+row[0]+"-painted")
	for zone in MMFNomadPersonalization.ZONES:
		var bank=game.personalization._zone_root(zone);var unit=bank.get_child(0)
		show_model(unit);await capture("patchcoat-"+zone+"-original")
		Fixture.enter(game,parts.trolley)
		require(game.personalization.paint_machine(parts.trolley.instanceId,zone,"denim" if zone=="lockers" else "celadon"),"Paid machine finish "+zone)
		show_model(unit);await capture("patchcoat-"+zone+"-painted")
	game.ui.root.show();Fixture.enter(game,parts.trolley)
	game.personalization.selection=parts.generator.instanceId;game.personalization.selected_finish="plum";game.ui.refresh()
	for size in [Vector2i(1440,810),Vector2i(1200,675)]:
		DisplayServer.window_set_size(size);await frames();game.ui.scroller.scroll_vertical=0;await capture("patchcoat-painter-palette-preview-"+str(size.x))
		var clip=game.ui.scroller.get_global_rect();var apply_visible=false;var preview_visible=false
		for b in game.ui.content.find_children("*","Button",true,false):
			if b.text.begins_with("APPLY FINISH"):apply_visible=clip.encloses(b.get_global_rect())
		for v in game.ui.content.find_children("*","SubViewportContainer",true,false):preview_visible=clip.encloses(v.get_global_rect())
		layouts.append({"window":str(size),"apply_visible_without_scroll":apply_visible,"preview_visible_without_scroll":preview_visible,"content_width":game.ui.content.size.x,"scroll_width":game.ui.scroller.size.x})
	# Capture a keepsake choice lower in the genuine scrollable console.
	game.ui.scroller.scroll_vertical=10000;await capture("patchcoat-painter-keepsakes")
	DisplayServer.window_set_size(Vector2i(1440,810));await frames()
	game.personalization.selection=parts.radio.instanceId;game.personalization.selected_finish="verdigris";game.ui.refresh();await frames();game.ui.scroller.scroll_vertical=0
	await capture("patchcoat-painter-furnishing-preview")
	game.session.facts.guardianOutcome="evaded"
	require(game.personalization.set_service_mark(parts.trolley.instanceId,"g01"),"Optional marker from fixture receipt")
	var locker=MMFAssets.find_named(game.world.machine,"CargoLocker1");show_model(locker);await capture("patchcoat-g01-service-mark")
	game.ui.root.show();game.open_menu("Helm");await capture("helm-journey-preparation-entry")
	for button in game.ui.content.find_children("*","Button",true,false):
		if button.text.begins_with("FUEL & JOURNEY PREPARATION"):button.pressed.emit();break
	await capture("helm-journey-preparation-record")
	var report={"captures":captures,"layouts":layouts,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name(),"stocked_fixture":true,"guardian_receipt":"synthetic evaded receipt; combat authority tested separately","native_transactions":true,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"human_acceptance":false}
	var file=FileAccess.open(OUT+"patchcoat-review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("PATCHCOAT_REVIEW ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
