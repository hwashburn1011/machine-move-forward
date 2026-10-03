extends SceneTree

var game
var checks=0
var failures=[]
var report={}
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-workshop-first-visit/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output-root="):output=arg.trim_prefix("--output-root=").trim_suffix("/")+"/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output));call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(count: int=3):
	for i in count: await physics_frame

func capture(name: String,eye: Vector3,target: Vector3):
	if DisplayServer.get_name()=="headless": return
	game.ui.toast_time=0;game.ui.toast.text="";game.interaction_prompt=""
	var previous=game.player.camera.global_transform
	var moving=game.player.is_physics_processing();game.player.set_physics_process(false)
	game.player.reset_physics_interpolation()
	game.player.camera.global_position=eye;game.player.camera.look_at(target);game.player.camera.fov=65;game.player.camera.current=true
	game.player.camera.reset_physics_interpolation()
	await frames(20);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")
	game.player.camera.global_transform=previous;game.player.camera.reset_physics_interpolation();game.player.set_physics_process(moving)

func key(action: String,pressed: bool):
	var event=InputEventKey.new();event.physical_keycode=game.key_defaults[action];event.pressed=pressed;Input.parse_input_event(event)

func walk(action: String,ticks: int):
	key(action,true);await frames(ticks);key(action,false);await frames(4)
	return game.player.position

func place_guided(spec: Dictionary):
	var b=game.building
	var id=spec.definitionId
	b.choose(id)
	check(b.manual_level==spec.cell.y and b.rotation_index==spec.rotation,"Guide prepares deck/orientation for "+id+str(spec.cell))
	var aim=b.center(spec.cell)
	if spec.has("edge"): aim+=(Vector3.RIGHT if spec.edge.axis=="x" else Vector3.BACK)*.98
	game.player.camera.global_position=aim+Vector3.UP*6
	game.player.camera.look_at(aim,Vector3.FORWARD)
	# Keep the real guide, aim, cost and commit path. Walking connectivity is
	# prepared asynchronously; wait for that answer before the actual click.
	b.update(0)
	var waits=0
	while b.report.get("pending",false) and waits<240:
		await frames(1);waits+=1;b.update(0)
	if not report.has("placement_waits"):report.placement_waits=[]
	report.placement_waits.append({"id":id,"cell":spec.cell,"physics_frames":waits,"reason":b.failure})
	var before=game.session.structures.size()
	var placed=b.commit_placement()
	check(placed and game.session.structures.size()==before+1,"Normal paid placement commits guided route part: "+id+str(spec.cell)+" "+b.failure)
	await frames();game.opportunities.survivor_site.update()
	return placed

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.camera.reparent(game,true)
	var s=game.session
	s.story.phase="route-selection";s.story.uniques=["course-actuator"]
	s.contacts.active=game.opportunities.make_contact(2);s.contacts.active.kind="rooftop-workshop";s.contacts.active.state="docked";s.distance=s.contacts.active.atDistanceM;s.speed=0
	game.opportunities.create_site();game.world.set_dock_open(true)
	s.add_resource("scrap",150);s.add_resource("components",10)
	game.player.position=Vector3(6,16.1,6);game.player.yaw=0
	await frames()
	var site=game.opportunities.survivor_site
	var guide=site.workshop_guide
	check(not guide.active,"Construction guide stays optional until requested")
	site.interact("bridge-note")
	check(guide.active and not guide.next.is_empty() and guide.label.visible,"Physical workshop plan projects the next construction part")
	await capture("workshop-build-guide",Vector3(4,22,13),Vector3(12,18,5))
	var cost=guide.remaining_cost();var before_scrap=s.count_resource("scrap");var before_components=s.count_resource("components")
	for spec in guide.PLAN:
		if not await place_guided(spec):break
	game.building.cancel()
	check(s.count_resource("scrap")==before_scrap-cost.scrap and s.count_resource("components")==before_components-cost.components,"Guided route pays exactly the ordinary construction costs")
	check(guide.next.is_empty() and not guide.label.visible and site.bridge_connected(),"Finished supported route clears the guide and opens the doorway")
	var support=guide.PLAN.filter(func(spec):return spec.definitionId=="wall")[0]
	var collider=game.runtime.pieceColliders.wall[0]
	var query=PhysicsShapeQueryParameters3D.new();var shape=BoxShape3D.new()
	shape.size=MMFAssets.v(collider.half)*2-Vector3.ONE*.02
	query.shape=shape;query.transform=game.building.piece_transform(support)*Transform3D(Basis.IDENTITY,MMFAssets.v(collider.offset));query.collision_mask=1
	var machine_hits=game.get_world_3d().direct_space_state.intersect_shape(query,32).filter(func(hit):return game.world.is_ancestor_of(hit.collider))
	check(machine_hits.is_empty(),"Support wall clears the machine's permanent deck and railings")
	report.supportWallMachineOverlaps=machine_hits.size()
	game.player.set_physics_process(true)
	var start=game.player.position
	var end=await walk("right",155)
	report.climb={"start":str(start),"end":str(end)}
	check(end.x>16.5 and end.y>19.4 and not game.aboard(),"Normal movement climbs from the Nomad through constructed stairs and bridge into the upper workshop")
	await capture("workshop-built-route",Vector3(5,27,15),Vector3(16,18.5,5))
	var returned=await walk("left",155)
	report.returnPosition=str(returned)
	check(game.aboard() and returned.y<16.3,"Normal movement returns across the upper bridge and down the built stairs")
	game.player.set_physics_process(false)
	report.checks=checks;report.failures=failures
	var file=FileAccess.open(output+"workshop-first-visit.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("WORKSHOP_FIRST_VISIT ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
