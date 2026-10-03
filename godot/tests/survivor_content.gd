extends SceneTree

var game
var checks=0
var failures=[]
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-survivor-content-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(count: int=3):
	for i in count: await physics_frame

func add_piece(id: String,cell: Dictionary,rotation: int=0,edge: Dictionary={}) -> Dictionary:
	var p=game.session.create_piece(id,cell,rotation,edge,true);game.building.add_visual(p);return p

func fixture_contact(kind: String):
	var s=game.session
	s.story.phase="route-selection";s.story.uniques=["course-gyro","course-actuator"];s.facts.salvage=true;s.scanner.phase="consumed";s.update_power()
	s.contacts.active=game.opportunities.make_contact(1 if kind=="friendly-refuge" else 2)
	s.contacts.active.kind=kind;s.contacts.active.state="docked";s.distance=s.contacts.active.atDistanceM;s.speed=0
	game.opportunities.create_site();game.world.set_dock_open(true)
	await frames()

func fill_all():
	for bag in game.session.containers():
		for i in bag.slots.size(): bag.slots[i]={"itemId":"scrap","count":int(game.data.ITEMS.scrap.stackSize)}

func clear_bags():
	for bag in game.session.containers(): bag.slots.fill(null)

func capture(name: String,eye: Vector3,target: Vector3):
	if DisplayServer.get_name()=="headless": return
	game.player.reset_physics_interpolation()
	game.ui.toast_time=0;game.ui.toast.text=""
	game.interaction_prompt=game.hint(game.building.salvage_tool.prompt()) if game.building.salvage_tool.equipped() else ""
	var previous=game.player.camera.global_transform
	game.player.camera.global_position=eye;game.player.camera.look_at(target);game.player.camera.fov=65;game.player.camera.current=true
	game.player.camera.reset_physics_interpolation()
	await frames(20);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://../test-results/godot-native/"+name+".png")
	game.player.camera.global_transform=previous;game.player.camera.reset_physics_interpolation()

func key(action: String,pressed: bool):
	var event=InputEventKey.new();event.physical_keycode=game.key_defaults[action];event.pressed=pressed
	Input.parse_input_event(event)

func walk_east(start: Vector3,seconds: float) -> Vector3:
	game.player.position=start;game.player.yaw=0;game.player.velocity=Vector3.ZERO
	game.player.boundary.clear();game.player.set_physics_process(true)
	key("right",true)
	await frames(ceili(seconds*60))
	key("right",false);await frames(3);game.player.set_physics_process(false)
	return game.player.position

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.camera.reparent(game,true)
	var s=game.session;var b=game.building;var tool=b.salvage_tool
	await frames()
	check(not tool.acquired() and not tool.equipped(),"New campaigns expose an unclaimed tool locker")
	game.player.position=MMFSalvageTool.LOCKER_AT+Vector3(0,0,1.5)
	check(not tool.nearest_locker().is_empty() and tool.acquire() and not tool.acquire(),"Physical locker grants exactly one cutter before any story progression")
	check(tool.set_equipped(true) and tool.equipped(),"Acquired cutter can be selected")
	var old=s.native_snapshot();old.erase("survivorContent")
	var migrated=MMFSession.new(game.data)
	check(migrated.restore_native(old) and not migrated.survivor_content.toolAcquired,"Existing campaigns migrate to an accessible unclaimed locker")
	var saved=s.native_snapshot();var restored=MMFSession.new(game.data)
	check(restored.restore_native(saved) and restored.survivor_content.toolSelected,"Acquisition and selected cutter round-trip through native session saves")
	var bad=saved.duplicate(true);bad.survivorContent.refuge.components=4
	check(not restored.restore_native(bad),"Malformed new content is rejected without accepting excessive contributions")
	# An isolated owned fixture exercises real camera/working-line casts and holds.
	add_piece("floor",{"x":20,"y":1,"z":0})
	add_piece("floor",{"x":20,"y":1,"z":1})
	var crate=add_piece("crate",{"x":20,"y":1,"z":0})
	s.stores[crate.instanceId].add("fuel",3)
	await frames()
	game.player.position=Vector3(40,19.67,2.4)
	game.player.camera.global_position=Vector3(40,21.1,3.4)
	game.player.camera.look_at(Vector3(40,20.1,0),Vector3.UP)
	await frames()
	tool.update(0)
	report.toolTarget=tool.target_id
	check(tool.target_id==crate.instanceId,"Cutter selects an owned piece through actual camera and reachable working-line casts")
	Input.action_press("demolish");tool.update(.6)
	check(tool.progress>0 and not s.find_piece(crate.instanceId).is_empty(),"A partial hold previews progress without modifying construction")
	var held_camera=game.player.camera.global_transform
	game.player.yaw=0;game.player.visual.rotation.y=0
	game.player.set_physics_process(true);await frames(30);game.player.set_physics_process(false)
	var facing=game.player.visual.global_basis.z.normalized().dot(Vector3.FORWARD)
	check(tool.working() and facing>.98,"A held cutter action turns the actual character controller toward camera facing")
	game.player.camera.global_transform=held_camera;game.player.camera.reset_physics_interpolation()
	await capture("survivor-cutter",Vector3(42.5,21.8,4.3),Vector3(40,20.4,.8))
	game.open_menu("Inventory")
	check(tool.progress==0,"Opening a paused menu cancels dismantling immediately")
	game.close_menu();Input.action_release("demolish")
	game.player.position=Vector3(40,19.67,5.5);tool.update(.1)
	check(tool.target_id=="","A camera-visible piece outside working reach cannot be dismantled")
	game.player.position=Vector3(40,19.67,2.4)
	clear_bags();s.stores[crate.instanceId].add("fuel",3)
	var before=s.count_resource("fuel")
	tool.update(0);Input.action_press("demolish");tool.update(1.5);tool.update(1.5);Input.action_release("demolish")
	check(s.find_piece(crate.instanceId).is_empty() and s.count_resource("fuel")==before,"Completed/repeated holds preserve contents with exactly one demolition transaction")
	await frames()
	var full=add_piece("crate",{"x":20,"y":1,"z":0});await frames()
	fill_all();s.stores[full.instanceId].slots.fill(null);s.stores[full.instanceId].add("fuel",3)
	var preview=b.dismantle_preview(full.instanceId)
	check(preview.refusal!="" and not b.demolish(full.instanceId) and s.stores[full.instanceId].count_item("fuel")==3,"Full recipient storage blocks removal and preserves target contents")
	clear_bags()
	var f=add_piece("floor",{"x":21,"y":1,"z":0})
	var wall=add_piece("wall",{"x":21,"y":1,"z":0},0,{"x":21,"y":1,"z":0,"axis":"x"})
	var lamp=add_piece("lamp",{"x":21,"y":1,"z":0},0,{"x":21,"y":1,"z":0,"axis":"x"})
	var cascade=b.dismantle_preview(f.instanceId)
	check(wall.instanceId in cascade.pieces and lamp.instanceId in cascade.pieces,"Preview includes wall and lamp losing support with their floor")
	tool.set_equipped(false)
	# Friendly exchange remains optional and can be paid in separate visits.
	await fixture_contact("friendly-refuge")
	var site=game.opportunities.survivor_site
	var arrived=await walk_east(Vector3(10.5,16.1,0),1.2)
	check(arrived.x>13.3 and arrived.y>15.8 and not game.aboard(),"Normal movement input crosses the primary gangway onto the optional refuge")
	await capture("survivor-refuge",Vector3(10,23,-9),Vector3(19,16.8,0))
	clear_bags();s.add_resource("components",3)
	game.player.position=game.opportunities.site.to_global(Vector3(-2.5,.05,1.15))
	key("use",true);await frames(2);key("use",false);await frames(1)
	check(s.survivor_content.refuge.components==1 and s.count_resource("components")==2,"Friendly exchange accepts one deliberate component at a time")
	var partial=s.native_snapshot();var copy=MMFSession.new(game.data)
	check(copy.restore_native(partial) and copy.survivor_content.refuge.components==1,"Partial survivor contributions persist")
	site.interact("survivor");site.interact("survivor")
	game.opportunities.update_service_hold(2.5,true)
	check(s.survivor_content.refuge.repaired and s.contacts.active.step=="task-complete","Relay repair requires components and its deliberate service hold")
	fill_all();site.interact("reward")
	check(s.survivor_content.refuge.reward.scrap==4,"Full inventory leaves exchange reward in the refuge")
	clear_bags();site.interact("reward");var reward_scrap=s.count_resource("scrap");site.interact("reward")
	check(reward_scrap==4 and s.count_resource("scrap")==4,"Exchange reward cannot be duplicated")
	s.distance=s.survivor_content.refuge.ackAt+5;MMFSurvivorSite.acknowledge(game)
	check(game.journey.queue.filter(func(line):return line.id=="survivor/refuge-later").is_empty(),"Personal acknowledgment waits until the operator has left the refuge")
	game.player.position=Vector3(0,16.1,-1);s.contacts.active={}
	MMFSurvivorSite.acknowledge(game);MMFSurvivorSite.acknowledge(game)
	var acknowledgments=game.journey.queue.filter(func(line):return line.id=="survivor/refuge-later")
	check(acknowledgments.size()==1,"Later radio acknowledgment is queued once after distance from the refuge")
	# Workshop main path, persistent power puzzle and construction-assisted entry.
	await fixture_contact("rooftop-workshop");site=game.opportunities.survivor_site
	site.interact("fuse")
	check(not s.survivor_content.workshop.fuse,"Live bus prevents prematurely recovering the fuse")
	site.interact("isolate");site.interact("fuse");game.opportunities.update_service_hold(2.5,true)
	check(s.survivor_content.workshop.powered,"Workshop machinery completes isolate / fuse / restart sequence")
	site.interact("reward")
	check(s.survivor_content.workshop.mainLoot.scrap==0,"Main workshop cache can be recovered independently of upper entry")
	check(not site.bridge_connected() and site.upper_gate.collision_layer==1,"Raised entrance stays physically closed without the authored supported bridge")
	# Author an actual supported upper deck path with wall support, stairs and floors.
	add_piece("floor",{"x":4,"y":0,"z":3})
	add_piece("floor",{"x":5,"y":0,"z":3})
	add_piece("wall",{"x":5,"y":0,"z":3},0,{"x":5,"y":0,"z":3,"axis":"x"})
	add_piece("stairs",{"x":4,"y":0,"z":3},1)
	add_piece("floor",{"x":6,"y":1,"z":3})
	add_piece("floor",{"x":7,"y":1,"z":3})
	await frames()
	game.player.position=Vector3(10,19.67,6);clear_bags();s.add_resource("scrap",20);s.add_resource("components",3)
	var candidate={"definitionId":"boarding-extension","cell":{"x":7,"y":1,"z":3},"rotation":1}
	var refusal=b.validate(candidate)
	report.bridgeRefusal=refusal
	check(refusal=="","Authored secondary bridge placement has supported clear walking volume")
	var bridge=add_piece("boarding-extension",candidate.cell,1)
	await frames();site.update()
	check(site.bridge_connected() and site.upper_gate.collision_layer==0,"Correctly rotated bridge retracts the actual upper entrance interlock")
	game.player.position=Vector3(12,19.67,6)
	game.player.camera.global_position=Vector3(14,25,6);game.player.camera.look_at(Vector3(14,19.63,6),Vector3.FORWARD)
	b.choose("boarding-extension");b.moving=bridge.instanceId;b.rotation_index=0;b.manual_level=1
	check(b.commit_placement(),"Existing boarding extension can be deliberately reoriented through the placement transaction")
	site.update()
	check(not site.bridge_connected() and site.upper_gate.collision_layer==1,"Reorienting an existing bridge invalidates the cached connection and closes the interlock")
	await frames()
	b.choose("boarding-extension");b.moving=bridge.instanceId;b.rotation_index=1;b.manual_level=1
	check(b.commit_placement(),"Boarding extension can be restored to the authored docking orientation")
	await frames();site.update()
	check(site.bridge_connected() and site.upper_gate.collision_layer==0,"Restoring bridge orientation reopens the actual interlock")
	var crossings=[]
	for x in [12.0,13.0,14.0,15.0,16.15,17.0]:
		var hit=game.raycast(Vector3(x,20.0,6),Vector3(x,19.1,6),[game.player.get_rid()])
		crossings.append(not hit.is_empty() and absf(hit.position.y-19.63)<.05)
	check(false not in crossings,"Real collision supports the entire bridge crossing onto the workshop")
	var upper_arrived=await walk_east(Vector3(12,19.67,6),1.6)
	check(upper_arrived.x>16.2 and upper_arrived.y>19.4 and not game.aboard(),"Normal movement crosses the supported upper bridge into the raised workshop")
	game.player.position=Vector3(20.6,19.67,5.1)
	check(b.dismantle_preview(bridge.instanceId).refusal!="","Dismantling cannot sever an active upper return bridge from the destination side")
	b.choose("boarding-extension");b.moving=bridge.instanceId
	check(not b.commit_placement() and bridge.rotation==1,"Relocating cannot sever the active upper return bridge while off the machine")
	b.cancel()
	site.interact("upper-cache")
	check(s.survivor_content.workshop.upperLoot.components==0,"Supported upper entry unlocks its separate salvage cache")
	game.opportunities.depart()
	check(s.contacts.active.state in ["docked","visited"],"Nomad cannot depart while its operator is on the destination")
	game.player.position=Vector3(0,16.1,-1);game.opportunities.depart()
	check(s.contacts.active.state=="departing","Returned operator can depart the optional workshop")
	var round_trip=MMFSession.new(game.data)
	check(round_trip.restore_native(s.native_snapshot()) and round_trip.survivor_content.workshop.powered and round_trip.survivor_content.workshop.upperLoot.components==0,"Completed machinery and partial/claimed caches round-trip without resetting")
	if DisplayServer.get_name()!="headless":
		s.contacts.active.state="docked";game.player.position=Vector3(12,19.67,6)
		await capture("survivor-workshop",Vector3(6,28,-13),Vector3(19,17.5,2))
	report.checks=checks;report.failures=failures
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://../test-results/godot-native"))
	var file=FileAccess.open("res://../test-results/godot-native/survivor-content.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("SURVIVOR_CONTENT ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
