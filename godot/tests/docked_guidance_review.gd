extends SceneTree

# Prepared UI fixtures, NOT earned progression or human discovery evidence.
# Run rendered only after the shared GPU review/profile window is available.
const OUT="res://../test-results/v1-docked-guidance-2026-10-05/visual/"
var game
var checks=0
var failures=[]
var captures=[]
var source=""
var prefix=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://docked-guidance-visual-fixtures/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int=8):
	for i in n:await process_frame

func button_named(text: String) -> Button:
	for node in MMFAssets.of_type(game.ui.content,"Button"):
		if node.text==text:return node
	return null

func capture(name: String):
	await frames()
	await RenderingServer.frame_post_draw
	var path=OUT+prefix+"-"+name+".png"
	check(root.get_texture().get_image().save_png(path)==OK,"Capture written: "+prefix+"-"+name)
	captures.append({"path":ProjectSettings.globalize_path(path),"page":game.ui.page,"engineering_view":game.engineering.view,"story_phase":game.session.story.phase,"mode":game.session.operations.mode,"window_size":str(DisplayServer.window_get_size()),"viewport_size":str(root.get_visible_rect().size),"scroll":game.ui.scroller.scroll_vertical})

func review_page(name: String,required_buttons: Array=[]):
	var ui=game.ui
	await frames()
	check(ui.panel.visible and ui.panel.get_parent()==ui.root,name+" uses existing local instrument panel")
	check(Rect2(Vector2.ZERO,ui.root.size).grow(2).encloses(ui.panel.get_global_rect()),name+" panel fits viewport")
	check(ui.return_button.is_visible_in_tree() and ui.panel.get_global_rect().grow(2).encloses(ui.return_button.get_global_rect()),name+" persistent return control fits panel")
	var horizontal=ui.scroller.get_h_scroll_bar()
	check(horizontal.max_value<=horizontal.page+1,name+" needs no horizontal scrolling")
	ui.scroller.scroll_vertical=0
	await capture(name+"-top")
	var vertical=ui.scroller.get_v_scroll_bar()
	if vertical.max_value>vertical.page+1:
		ui.scroller.scroll_vertical=int(vertical.max_value)
		await frames()
		var last=ui.content.get_child(ui.content.get_child_count()-1)
		check(last is Control and last.get_global_rect().end.y<=ui.scroller.get_global_rect().end.y+2,name+" final content reachable by vertical scrolling")
		await capture(name+"-bottom")
	for text in required_buttons:
		var button=button_named(text)
		check(is_instance_valid(button),name+" contains "+text)
		if not is_instance_valid(button):continue
		ui.scroller.ensure_control_visible(button)
		await frames()
		check(ui.scroller.get_global_rect().grow(2).encloses(button.get_global_rect()),name+" button fully reachable: "+text)

func open_engineering(view: String):
	game.close_menu()
	game.player.position=Vector3(-6,12.5,-9.7)
	game.engineering.view=view
	game.open_station("Machine","engineering")
	await frames()
	check(game.engineering.authorized(),"Fixture reaches local engineering: "+view)

func review_state(state_name: String):
	var expected=MMFMachineOperations.docked_guidance(game.session)
	game.close_menu();game.player.position=game.world.helm_model.root.global_position+Vector3(0,0,1.3)
	game.open_station("Helm","helm");await frames()
	await review_page(state_name+"-helm",["FUEL & JOURNEY PREPARATION  ›"])
	var preparation=button_named("FUEL & JOURNEY PREPARATION  ›")
	if preparation:
		preparation.pressed.emit();await frames()
		var preparation_matches=game.ui.record_text.contains(expected) if MMFMachineOperations.docked(game.session) else game.ui.record_text.contains("Cruise disables unused workshop and recovery loads.") and not game.ui.record_text.contains("DOCKED MODE ACTIVE")
		check(game.ui.page=="Record" and preparation_matches,state_name+" helm preparation contains the correct moored or travelling explanation")
		await review_page(state_name+"-preparation",["‹ BACK"])
	await open_engineering("overview")
	if game.session.operations.mode=="docked":
		var labels=[]
		for label in MMFAssets.of_type(game.ui.content,"Label"):labels.append(label.text)
		check(not labels.any(func(text):return text.contains("Restart a source") or text.contains("Review switches and priorities")),"Docked Overview does not contradict intentional shutdown")
		check(labels.any(func(text):return text.contains("off while Docked; no battery supply")),"Docked Overview keeps unbacked supply status visible")
	await review_page(state_name+"-overview",["REPAIRS / EMERGENCY SERVICE"])
	await open_engineering("modes")
	await review_page(state_name+"-modes",["PREVIEW DOCKED","PREVIEW CRUISE"])
	var docked_button=button_named("PREVIEW DOCKED")
	check(is_instance_valid(docked_button) and docked_button.disabled==not MMFMachineOperations.docked(game.session),state_name+" Docked button eligibility matches mooring state")

func run():
	if DisplayServer.get_name()=="headless":
		print("Rendered UI review required; no captures or visual pass claimed.");quit(2);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	Engine.max_fps=60;source=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames()
	game.audio.muted=true
	for size in [Vector2i(1024,768),Vector2i(1440,810)]:
		DisplayServer.window_set_size(size);await frames(12)
		prefix="%dx%d"%[size.x,size.y]
		check(DisplayServer.window_get_size()==size,"Requested native window size: "+prefix)
		check(game.playtests.launch("wake"),"Prepared Wake fixture launches: "+prefix)
		game.set_physics_process(false);game.player.set_physics_process(false)
		# Completion is fixture preparation only, so the real departure callback
		# can demonstrate restoration without pretending this is a site playthrough.
		for id in game.campaign.expedition().requiredUniques:
			if id not in game.session.story.uniques:game.session.story.uniques.append(id)
		game.session.update_power();await frames()
		await review_state("wake-moored")
		await open_engineering("modes")
		var preview=button_named("PREVIEW DOCKED")
		if not preview:check(false,"Docked preview button missing");continue
		preview.pressed.emit();await frames()
		await review_page("docked-preview",["APPLY OPERATING MODE"])
		var apply_button=button_named("APPLY OPERATING MODE")
		if not apply_button:check(false,"Docked apply button missing");continue
		apply_button.pressed.emit();await frames()
		check(game.session.operations.mode=="docked" and MMFPowerBudget.calculate(game.session,game.session.structures).fuel_rate==0,"Reached preview/apply callback activates fuel-free Docked")
		await review_state("wake-docked-active")
		game.close_menu();game.player.position=game.world.helm_model.root.global_position+Vector3(0,0,1.3)
		game.open_station("Helm","helm");await frames()
		var depart=button_named("RESUME TRAVEL / RETRACT GANGWAY")
		check(is_instance_valid(depart),"Existing helm departure control present")
		if depart:depart.pressed.emit();await frames()
		check(game.session.story.phase=="departing" and game.session.operations.mode!="docked","Normal departure callback restores travel plan")
		await review_state("after-departure")
	var end_source=MMFPlaytestRecorder.source_fingerprint()
	check(source==end_source,"Runtime source remained stable during UI review")
	var report={"checks":checks,"failures":failures,"source_hash":source,"source_hash_end":end_source,"captures":captures,"human_test":false,"evidence":"Prepared native UI fixtures; button callbacks, scroll access and captures. No earned progression or novice comprehension claim."}
	var file=FileAccess.open(OUT+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	print("DOCKED_GUIDANCE_REVIEW ",checks," checks; failures=",failures.size())
	quit(0 if failures.is_empty() else 1)
