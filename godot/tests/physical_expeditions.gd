extends SceneTree

var game
var checks=0
var failures=[]
var walked=0.0
var capture_directory="res://../docs/godot-port/previews/physical-expeditions/"
const PRESETS=["foundry","wake","array","orchard-caretaker","orchard-cold-vault","meridian-quiet","meridian-cordon"]

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://physical-expedition-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int):
	for i in count:await physics_frame

func capture(label: String,focus: Vector3=Vector3.INF):
	if DisplayServer.get_name()=="headless":return
	# Simulation is fixed for this traversal fixture; refresh presentation explicitly.
	game.guidance.update(.6);game.journey.update(15)
	if focus.is_finite():
		var delta=focus-game.player.position
		game.player.yaw=atan2(-delta.x,-delta.z);game.player.pitch=-.12
		game.player.update_camera(.1)
	if game.guidance.has_method("fit_marker"):game.guidance.fit_marker()
	await frames(8);await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(capture_directory))
	var suffix="-4x3" if DisplayServer.window_get_size().x<1250 else ""
	root.get_texture().get_image().save_png(capture_directory+label+suffix+".png")

func clear_ray(at: Vector3,target: Vector3) -> bool:
	var hit=game.raycast(at+Vector3.UP*1.35,target,[game.player.get_rid()])
	return hit.is_empty() or hit.position.distance_to(target)<.5

func path_to(target: Vector3) -> Array:
	var start=Vector2i(roundi(game.player.position.x*2),roundi(game.player.position.z*2))
	var queue=[start];var previous={start:start};var cursor=0;var goal=start;var found=false
	while cursor<queue.size() and queue.size()<7000:
		var cell=queue[cursor];cursor+=1
		var at=Vector3(cell.x*.5,16.09,cell.y*.5)
		if Vector2(at.x-target.x,at.z-target.z).length()<1.9 and clear_ray(at,target):goal=cell;found=true;break
		for delta in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var next=cell+delta
			if previous.has(next) or next.x< -4 or next.x>66 or absi(next.y)>19:continue
			var candidate=Vector3(next.x*.5,16.09,next.y*.5)
			if not game.player.boundary.fits(candidate):continue
			if game.player.test_move(Transform3D(Basis.IDENTITY,at),candidate-at):continue
			previous[next]=cell;queue.append(next)
	if not found:return []
	var reverse=[goal]
	while goal!=start:goal=previous[goal];reverse.append(goal)
	reverse.reverse()
	var points=[]
	for i in range(1,reverse.size()):
		if i+1<reverse.size() and reverse[i]-reverse[i-1]==reverse[i+1]-reverse[i]:continue
		points.append(Vector3(reverse[i].x*.5,16.09,reverse[i].y*.5))
	if points.is_empty():points.append(Vector3(start.x*.5,16.09,start.y*.5))
	return points

func walk_to(target: Vector3) -> bool:
	game.close_menu()
	var points=path_to(target)
	if points.is_empty():print("NO_PATH ",game.player.position," TO ",target);return false
	for point in points:
		var limit=int((game.player.position.distance_to(point)/2.0+3)*60)
		for tick in limit:
			var delta=(point-game.player.position)*Vector3(1,0,1)
			if delta.length()<.18:break
			game.player.yaw=atan2(-delta.x,-delta.z)
			var before=game.player.position
			Input.action_press("forward");await physics_frame
			walked+=game.player.position.distance_to(before)
		Input.action_release("forward")
		await frames(2)
		if Vector2(game.player.position.x-point.x,game.player.position.z-point.z).length()>.45:
			print("WALK_BLOCKED ",game.player.position," TO ",point," menu=",game.menu_open," velocity=",game.player.velocity," yaw=",game.player.yaw," processing=",game.player.is_physics_processing())
			for i in game.player.get_slide_collision_count():
				var hit=game.player.get_slide_collision(i);print("WALK_COLLIDER ",hit.get_collider().get_path()," at ",hit.get_position()," normal ",hit.get_normal())
			return false
	return true

func find_point(id: String) -> Dictionary:
	for point in game.campaign.points:
		if point.entry.id==id:return point
	return {}

func visit(point: Dictionary) -> bool:
	if point.is_empty():return false
	var target=game.campaign.destination.to_global(point.at)
	if not await walk_to(target):return false
	return game.activity.interaction_refusal(point.entry)==""

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(8)
	game.invulnerable=true
	for preset in (["foundry"] if "--foundry-only" in OS.get_cmdline_user_args() else PRESETS):
		check(game.playtests.launch(preset),preset+": normal checkpoint restore")
		await frames(5)
		game.set_physics_process(false)
		await capture(preset+"-arrival",game.campaign.destination.global_position)
		game.session.inventory.slots.fill(null)
		# No optional equipment or inventory items are ever queried by service actions.
		var recovery_count=game.player.boundary.recoveries
		var before=JSON.stringify(game.session.native_snapshot())
		for i in 5:game.activity.describe_step()
		check(before==JSON.stringify(game.session.native_snapshot()),preset+": guidance projection is read-only")
		var site=game.campaign.expedition().id
		var point_count=game.campaign.points.size()
		for instrument in MMFExpeditionMechanisms.SITES[site]:
			var next=MMFExpeditionMechanisms.next_step(instrument,game.activity.state(instrument))
			if next=="":continue
			var remote=find_point("mechanism-"+instrument+"-"+next)
			game.activity.open(remote.entry)
			check(not game.activity.act(),preset+": physical control refuses remote operation "+instrument)
			game.close_menu()
		# Read through actual reach transactions, never grant journal flags directly.
		for point in game.campaign.points.duplicate():
			if point.entry.kind!="journal" or not game.campaign.can_show(point.entry):continue
			var reached=await visit(point)
			check(reached,preset+": walk to "+point.entry.id)
			if reached:check(game.campaign.interact(point.entry),preset+": read local record")
			game.close_menu()
		for instrument in MMFExpeditionMechanisms.SITES[site]:
			for action in MMFExpeditionMechanisms.STEPS[instrument]:
				var st=game.activity.state(instrument)
				if action in st.mechanism.milestones:continue
				var point=find_point("mechanism-"+instrument+"-"+action)
				var reached=await visit(point)
				check(reached,preset+": walk to "+instrument+"/"+action)
				if not reached:continue
				var moving=MMFExpeditionMechanisms.moving_step(instrument,action)
				if moving or action==MMFExpeditionMechanisms.STEPS[instrument][0]:await capture(preset+"-"+instrument+"-"+action+"-world",game.campaign.destination.to_global(point.at))
				game.campaign.interact(point.entry)
				check(not game.ui.terminal.active and game.ui.page=="Console",preset+": local panel retains world camera")
				if action==MMFExpeditionMechanisms.STEPS[instrument][0]:await capture(preset+"-"+instrument+"-panel")
				if instrument=="power" and action=="bus":
					for i in 3:game.activity.adjust(i,[2,1,0][i])
				if instrument=="array" and action!="lock":
					var index=MMFExpeditionMechanisms.STEPS.array.find(action)
					check(not game.activity.adjust((index+1)%3,20),"Local wheel cannot adjust a remote channel")
					game.activity.adjust(index,[25,60,85][index])
				check(game.activity.act(),preset+": local operation accepted "+action)
				if game.activity.moving():
					check(not game.safe_to_save(),"Moving instrument cannot serialize an intermediate collider pose")
					await frames(100)
				if moving:await capture(preset+"-"+instrument+"-"+action+"-complete",game.activity.view.to_global(game.activity.view.movers[instrument].to))
				check(action in game.activity.state(instrument).mechanism.milestones,preset+": durable milestone "+action)
				var snapshot=game.session.native_snapshot()
				var trial=MMFSession.new(game.data)
				check(trial.restore_native(snapshot) and trial.polish.activities[instrument]==game.activity.state(instrument),preset+": real native round-trip "+action)
				game.close_menu()
		for kind in ["objective","unique"]:
			for point in game.campaign.points.duplicate():
				if point.entry.kind!=kind or not game.campaign.can_show(point.entry):continue
				var reached=await visit(point)
				check(reached,preset+": walk to recovery "+point.entry.id)
				if reached:
					check(game.campaign.interact(point.entry),preset+": claim existing reward "+point.entry.id)
					var counts=game.session.story.uniques.size()+game.session.story.objectives.size()
					game.campaign.interact(point.entry)
					check(counts==game.session.story.uniques.size()+game.session.story.objectives.size(),"Repeated pickup never duplicates reward")
				game.close_menu()
		check(await walk_to(Vector3(10,17,0)),preset+": fixed return route to Nomad remains walkable")
		await capture(preset+"-return",game.campaign.destination.global_position)
		check(game.player.boundary.recoveries==recovery_count,preset+": no ground recovery on intended paths")
		check(game.session.inventory.totals().is_empty() if game.session.inventory.has_method("totals") else game.session.inventory.slots.all(func(slot):return slot==null),preset+": physical operations require no consumable")
		check(game.campaign.points.size()==point_count,preset+": no duplicate controls during operation")
		check(game.campaign.departure_reason()=="" and game.campaign.depart(),preset+": normal departure requirements fulfilled")
		game.set_physics_process(true)
	var report={"checks":checks,"failures":failures,"walked_m":walked,"passed":failures.is_empty()}
	var report_name="physical-expeditions" if DisplayServer.get_name()=="headless" else "physical-expeditions-native"
	if "--foundry-only" in OS.get_cmdline_user_args():report_name+="-foundry"
	if DisplayServer.get_name()!="headless" and DisplayServer.window_get_size().x<1250:report_name+="-4x3"
	var out=FileAccess.open("res://../test-results/"+report_name+".json",FileAccess.WRITE);out.store_string(JSON.stringify(report,"\t"));out.close()
	print("PHYSICAL_EXPEDITIONS_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
