class_name MMFOpeningStage
extends Node

# The title remains responsive while disk resources load on an engine worker.
# Assemble one hidden part per frame on the main thread for render preparation.
const PATHS=["res://art/opening-rooftop.glb","res://assets/models/authored/warden.glb","res://assets/models/authored/revenant.glb"]
var owner_cinema
var pending=""
var path_index=0
var part_index=0
var stage: Node3D
var requested=false
var failure=""
var assembled_frame=-1
var encounter_assets: MMFEncounterAssets

func _init():
	process_mode=Node.PROCESS_MODE_ALWAYS

func poll():
	if pending=="":return
	var status=ResourceLoader.load_threaded_get_status(pending)
	if status==ResourceLoader.THREAD_LOAD_IN_PROGRESS:return
	var resource=ResourceLoader.load_threaded_get(pending)
	if resource is PackedScene:MMFAssets.cache[pending]=resource
	else:failure="The opening scene could not be loaded."
	pending=""

func prepared() -> bool:
	# Leave a render opportunity after instancing before handing off the camera.
	# Immediate New Game also waits for bounded encounter preparation, keeping
	# its first resource uploads out of the running opening cinematic.
	return part_index==3 and Engine.get_process_frames()>assembled_frame and (not is_instance_valid(encounter_assets) or encounter_assets.finished)

func _process(_dt):
	poll()
	if owner_cinema.game.started:
		cancel(true)
		if pending=="":set_process(false)
		return
	if failure!="":
		if requested:
			owner_cinema.game.open_menu("Title")
			owner_cinema.game.session.notify(failure)
		set_process(false);return
	if pending!="":return
	while path_index<PATHS.size():
		var path=PATHS[path_index];path_index+=1
		if MMFAssets.cache.has(path):continue
		if ResourceLoader.load_threaded_request(path,"PackedScene")==OK:pending=path
		else:failure="The opening scene could not be loaded."
		return
	if part_index<3:build_part();return
	if requested and prepared():
		requested=false
		var game=owner_cinema.game
		game.started=true;game.close_menu();owner_cinema.begin_opening()
	elif prepared():set_process(false)

func request():
	requested=true;set_process(true)

func build_part():
	if not stage:
		stage=Node3D.new();stage.name="PreparedOpening"
		stage.hide();stage.process_mode=Node.PROCESS_MODE_DISABLED
		owner_cinema.add_child(stage)
	if part_index==0:
		var rooftop=MMFAssets.scene(PATHS[0]);rooftop.name="Rooftop";stage.add_child(rooftop)
	else:
		var kind="warden" if part_index==1 else "revenant"
		var model=owner_cinema.actor(kind,Vector3.ZERO,stage);model.name=kind
	part_index+=1
	if part_index==3:assembled_frame=Engine.get_process_frames()

func take() -> Node3D:
	# Direct unfinished-opening save restores and explicit cinematic tests have
	# no title interval. Retain their synchronous, complete fallback.
	if pending!="":
		var resource=ResourceLoader.load_threaded_get(pending)
		if resource is PackedScene:MMFAssets.cache[pending]=resource
		pending=""
	while part_index<3:build_part()
	var result=stage;stage=null;part_index=0;path_index=0;assembled_frame=-1
	requested=false;set_process(false)
	result.name="Opening";result.process_mode=Node.PROCESS_MODE_INHERIT;result.show()
	return result

func cancel(discard: bool=false):
	requested=false
	if discard:
		if is_instance_valid(stage):stage.queue_free()
		stage=null;part_index=0;path_index=0;assembled_frame=-1
	# An outstanding engine request is still consumed by poll() or _exit_tree.

func _exit_tree():
	if pending!="":ResourceLoader.load_threaded_get(pending);pending=""
	owner_cinema=null
