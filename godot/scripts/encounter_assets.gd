class_name MMFEncounterAssets
extends Node

# Seven existing resources, one outstanding engine request. Preparation creates
# no actors, consumes no gameplay RNG and never waits on an unfinished load.
const PATHS=["res://assets/models/authored/sovereign.glb","res://art/sovereign-drone.glb","res://assets/models/authored/bastion.glb","res://assets/models/authored/raider.glb","res://assets/models/authored/scavenger.glb","res://assets/models/authored/warden.glb","res://assets/models/authored/revenant.glb"]
const MATERIALS=[MMFEnemy.WARNING_READY,MMFEnemy.WARNING_DANGER,MMFEnemy.WARNING_VULNERABLE,MMFEffects.SHELL_WARNING]
var material_index=0
var paths=PATHS.duplicate()
var next_index=0
var pending=""
var finished=false
var failures=[]
var requests=0
var completed=0

func _init():name="EncounterAssets";process_mode=Node.PROCESS_MODE_ALWAYS

func _process(_dt):
	if material_index<MATERIALS.size():
		# StandardMaterial creates its renderer shader lazily on first get_rid.
		# Prepare one immutable warning material per title frame, before combat.
		MATERIALS[material_index].get_rid();material_index+=1;return
	if pending!="":
		var status=ResourceLoader.load_threaded_get_status(pending)
		if status==ResourceLoader.THREAD_LOAD_IN_PROGRESS:return
		collect();return
	while next_index<paths.size():
		var path=paths[next_index];next_index+=1
		if MMFAssets.cache.has(path):continue
		# Each successful request owns exactly one get, even when another stage
		# requests the same path. Godot shares the underlying resource work.
		if ResourceLoader.load_threaded_request(path,"PackedScene")==OK:
			pending=path;requests+=1
		else:failures.append(path)
		return
	finished=true;set_process(false)

func collect():
	var resource=ResourceLoader.load_threaded_get(pending)
	if resource is PackedScene:MMFAssets.cache[pending]=resource;completed+=1
	else:failures.append(pending)
	pending=""

func _exit_tree():
	# Engine requests cannot be cancelled. Teardown drains this node's one
	# accepted request; regular preparation only collects terminal requests.
	if pending!="":collect()
