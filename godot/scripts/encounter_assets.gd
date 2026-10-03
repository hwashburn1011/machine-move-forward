class_name MMFEncounterAssets
extends Node

# Encounter resources, stairs and both furnishing preview collections share
# one outstanding engine request. Preparation creates
# no actors, consumes no gameplay RNG and never waits on an unfinished load.
const STAIRS_PREVIEW="res://assets/runtime/stairs.glb"
const RECOVERED_MODULES="res://art/nomad-recovered-modules.glb"
const PATHS=[MMFEnemyModels.REFINED.sovereign,"res://art/sovereign-drone.glb",MMFEnemyModels.REFINED.bastion,MMFEnemyModels.REFINED.raider,MMFEnemyModels.REFINED.scavenger,MMFEnemyModels.REFINED.warden,MMFEnemyModels.REFINED.revenant,STAIRS_PREVIEW,MMFArt100Decor.PATH,MMFArt200Decor.PATH,MMFGatekeeperPresentation.PATH,RECOVERED_MODULES,MMFSiteRoofs.PATH,MMFArt100Story.PATH,MMFRoadsideOutposts.PATH,MMFSiteGrounding.PATH]
const MATERIALS=[MMFEnemy.WARNING_READY,MMFEnemy.WARNING_DANGER,MMFEnemy.WARNING_VULNERABLE,MMFEffects.SHELL_WARNING]
var material_index=0
var tells_prepared=false
var roof_shape_index=0
var paths=PATHS.duplicate()
var next_index=0
var pending=""
var finished=false
var failures=[]
var requests=0
var completed=0

func _init():name="EncounterAssets";process_mode=Node.PROCESS_MODE_ALWAYS

func _enter_tree():MMFAssets.scene_preparers.append(self)

func _process(_dt):
	if material_index<MATERIALS.size():
		# StandardMaterial creates its renderer shader lazily on first get_rid.
		# Prepare one immutable warning material per title frame, before combat.
		MATERIALS[material_index].get_rid();material_index+=1;return
	if not tells_prepared:
		MMFEnemyTells.direction_mesh();tells_prepared=true;return
	if roof_shape_index<MMFSiteRoofs.SHAPE_PATHS.size():
		# Exact roof triangles are baked offline; warm one small native shape per
		# title frame so arrival never builds or reads back a rendering mesh.
		MMFSiteRoofs.prepare_shape(roof_shape_index);roof_shape_index+=1;return
	if pending!="":
		var status=ResourceLoader.load_threaded_get_status(pending)
		if status==ResourceLoader.THREAD_LOAD_IN_PROGRESS:return
		collect();return
	while next_index<paths.size():
		var path=paths[next_index];next_index+=1
		if MMFAssets.cache.has(path):
			prepare_previews(path)
			if path in [MMFArt100Decor.PATH,MMFArt200Decor.PATH,MMFSiteRoofs.PATH,MMFRoadsideOutposts.PATH,MMFSiteGrounding.PATH]:return
			continue
		# Each successful request owns exactly one get, even when another stage
		# requests the same path. Godot shares the underlying resource work.
		if ResourceLoader.load_threaded_request(path,"PackedScene")==OK:
			pending=path;requests+=1
		else:failures.append(path)
		return
	finished=true;set_process(false)

func collect(prepare: bool=true):
	var resource=ResourceLoader.load_threaded_get(pending)
	var path=pending
	if resource is PackedScene:MMFAssets.cache[path]=resource;completed+=1
	else:failures.append(pending)
	pending=""
	if resource is PackedScene and prepare and not is_queued_for_deletion():prepare_previews(path)

func prepare_previews(path: String):
	# Import completion alone leaves collection instantiation, material setup and
	# per-piece packing on the first build selection. Finish those bounded caches
	# during existing title preparation, without adding visible nodes or actors.
	if path==MMFArt100Decor.PATH:MMFArt100Decor.prepare_models()
	elif path==MMFArt200Decor.PATH:MMFArt200Decor.prepare_models()
	elif path==MMFSiteRoofs.PATH:MMFSiteRoofs.prepare_models()
	elif path==MMFRoadsideOutposts.PATH:MMFRoadsideOutposts.prepare_models()
	elif path==MMFSiteGrounding.PATH:MMFSiteGrounding.prepare_models()
	elif path==RECOVERED_MODULES:
		# Preparing one instance visits the kit's shared PBR resources once at
		# title, before an earned module is first selected in the catalogue.
		var model=MMFNativeProgression.model("quiet-drive");model.free()

func _exit_tree():
	MMFAssets.scene_preparers.erase(self)
	# Engine requests cannot be cancelled. Teardown drains this node's one
	# accepted request; regular preparation only collects terminal requests.
	if pending!="":collect(false)
	# Packed previews belong to the active game session. Instances retain their
	# own mesh/material references; release the caches before renderer teardown.
	if MMFAssets.scene_preparers.is_empty():
		MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache()
		MMFSiteRoofs.clear_cache()
		MMFRoadsideOutposts.clear_cache()
		MMFSiteGrounding.clear_cache()
		MMFEnemyTells.clear_cache()
