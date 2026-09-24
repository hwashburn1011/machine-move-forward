class_name MMFCrossfireStage
extends RefCounted

# Prepare the existing set during scanning. One resource request at a time and
# one scene part per tick keep the entry frame free of disk loads/assembly.
const PATHS=["res://art/crossfire-human.glb","res://art/crossfire-robot.glb","models/authored/warden.glb","models/authored/bastion.glb","models/authored/revenant.glb","models/authored/s07-player.glb"]
var owner_cinema
var pending=""
var path_index=0
var part_index=0
var stage: Node3D

func poll():
	if pending=="":return
	var status=ResourceLoader.load_threaded_get_status(pending)
	if status==ResourceLoader.THREAD_LOAD_IN_PROGRESS:return
	var resource=ResourceLoader.load_threaded_get(pending)
	if resource:MMFAssets.cache[pending]=resource
	pending=""

func update():
	poll()
	if pending!="":return
	var game=owner_cinema.game
	if game.cinematic!="" or game.session.scanner.phase not in ["installed","scanning","contact-ready"]:return
	while path_index<PATHS.size():
		var path=PATHS[path_index];path_index+=1
		if not path.begins_with("res://"):path="res://assets/"+path
		if MMFAssets.cache.has(path):continue
		if ResourceLoader.load_threaded_request(path,"PackedScene")==OK:pending=path
		return
	if part_index<7:build_part()
	elif game.session.scanner.phase=="contact-ready":owner_cinema.signal_route.prepare(game,stage)

func create_root():
	if stage:return
	stage=Node3D.new();stage.name="PreparedCrossfire"
	stage.position=Vector3(54,0,-76);stage.hide();stage.process_mode=Node.PROCESS_MODE_DISABLED
	owner_cinema.add_child(stage)

func build_part():
	create_root()
	if part_index<2:
		var robot=part_index==1
		var ship=MMFAssets.scene(PATHS[part_index]);ship.name="RobotShip" if robot else "HumanShip"
		stage.add_child(ship);ship.position=Vector3(13,1.3,5) if robot else Vector3(-17,1.3,-6)
		owner_cinema.game.effects.burning(ship,Vector3(2,7.95,3))
	elif part_index<5:
		var specs=[["warden",Vector3(-2.7,8.1,-1.2)],["bastion",Vector3(-2.4,8.1,2.1)],["revenant",Vector3(-3.35,8.1,-5)]]
		var spec=specs[part_index-2]
		var model=owner_cinema.actor(spec[0],spec[1],stage.get_node("RobotShip"))
		model.name="ContactRevenant" if spec[0]=="revenant" else spec[0]
		model.rotation.y=-PI/2;owner_cinema.animate(model,"idle")
	else:
		var z=-1.8 if part_index==5 else 1.2
		var model=owner_cinema.actor("s07-player",Vector3(2.7,8.1,z),stage.get_node("HumanShip"))
		model.rotation.y=PI/2;owner_cinema.animate(model,"armed_idle")
	part_index+=1

func take() -> Node3D:
	# Direct crossfire save restores have no scan interval. Preserve their
	# immediate playback with the original synchronous loading fallback.
	if pending!="":
		var resource=ResourceLoader.load_threaded_get(pending)
		if resource:MMFAssets.cache[pending]=resource
		pending=""
	while part_index<7:build_part()
	var result=stage;stage=null;part_index=0
	result.name="Crossfire";result.process_mode=Node.PROCESS_MODE_INHERIT;result.show()
	for particles in MMFAssets.of_type(result,"GPUParticles3D"):particles.restart()
	result.reset_physics_interpolation()
	return result

func reset():
	if is_instance_valid(stage):stage.queue_free()
	stage=null;part_index=0;path_index=0
	# An outstanding engine request cannot be cancelled. update() consumes it
	# even if a different campaign no longer needs the set.

func close():
	if pending!="":
		ResourceLoader.load_threaded_get(pending);pending=""
	reset()
