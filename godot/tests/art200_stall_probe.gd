extends "res://tests/art200_performance.gd"
## Diagnostic-only wrappers time the unmodified shipping functions.
class CollisionProbe extends MMFSceneryCollision:
	var samples=[]
	func install_chunk(part: MeshInstance3D,shape: ConcavePolygonShape3D,index: int,total: int):
		var start=Time.get_ticks_usec();super.install_chunk(part,shape,index,total)
		var ms=(Time.get_ticks_usec()-start)/1000.0
		if ms>2:samples.append({"method":"install_chunk","at_usec":start,"kind":part.get_meta("landmark_kind",""),"index":index,"ms":ms})
	func collect_shape(keep: bool=true):
		var start=Time.get_ticks_usec();super.collect_shape(keep)
		var ms=(Time.get_ticks_usec()-start)/1000.0
		if ms>2:samples.append({"method":"collect_shape","at_usec":start,"ms":ms})
	func update(dt: float):
		var start=Time.get_ticks_usec()
		super.update(dt)
		var ms=(Time.get_ticks_usec()-start)/1000.0
		if ms>2:samples.append({"method":"update","at_usec":start,"ms":ms})

class ClearanceProbe extends MMFBuildPreview:
	var samples=[]
	func clearance_shapes(id: String) -> Array:
		var start=Time.get_ticks_usec();var cold=not solid_shapes.has(id);var result=super.clearance_shapes(id)
		var ms=(Time.get_ticks_usec()-start)/1000.0
		if ms>2:samples.append({"method":"clearance_shapes","id":id,"cold":cold,"at_usec":start,"ms":ms})
		return result
	func solid_overlap(spec: Dictionary,ignore_id: String="") -> bool:
		var start=Time.get_ticks_usec();var result=super.solid_overlap(spec,ignore_id)
		var ms=(Time.get_ticks_usec()-start)/1000.0
		if ms>2:samples.append({"method":"solid_overlap","id":spec.definitionId,"at_usec":start,"ms":ms})
		return result

var collision_probe
var clearance_probe
var slow_frames=[]
var previous_usec=0
var prior_monitors={}
var sampling_started=0

func monitor_snapshot() -> Dictionary:
	var result={"process_ms_sampled":Performance.get_monitor(Performance.TIME_PROCESS)*1000,"physics_ms_sampled":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000,"frame_setup_cpu_ms":RenderingServer.get_frame_setup_time_cpu()}
	for key in ["CANVAS","MESH","SURFACE","DRAW","SPECIALIZATION"]:
		result[key]=RenderingServer.get_rendering_info(ClassDB.class_get_integer_constant("RenderingServer","RENDERING_INFO_PIPELINE_COMPILATIONS_"+key))
	result.selected=game.building.selected;result.clearance_ready=game.building.build_preview.solid_shapes.has(game.building.selected);result.candidate_reason=game.building.report.get("reason","")
	return result

func camera_update(elapsed: float):
	if not collision_probe:
		var old=game.world.scenery_collision
		collision_probe=CollisionProbe.new();collision_probe.setup(game.world)
		for property in old.get_property_list():
			if property.usage&PROPERTY_USAGE_SCRIPT_VARIABLE and property.name!="world":collision_probe.set(property.name,old.get(property.name))
		old.loading_path="";old.loading_kind=""
		old.loading_index=0;old.active_part=null;old.working_shapes=[];old.working_kind=""
		old.world=null;game.world.scenery_collision=collision_probe
		var prior=game.building.build_preview;clearance_probe=ClearanceProbe.new()
		for key in ["previous","owner_reference","power_key","power_cache","bounds_cache","solid_excludes_key","solid_excludes","solid_shapes","outline","outline_material"]:clearance_probe.set(key,prior.get(key))
		if game.session.changed.is_connected(prior.invalidate):game.session.changed.disconnect(prior.invalidate)
		game.session.changed.connect(clearance_probe.invalidate);game.building.build_preview=clearance_probe
	var now=Time.get_ticks_usec();var current=monitor_snapshot()
	if previous_usec and now-previous_usec>16000:
		slow_frames.append({"at_usec":now,"elapsed":elapsed,"frame_ms":(now-previous_usec)/1000.0,"before":prior_monitors,"after":current})
	previous_usec=now;prior_monitors=current
	if elapsed>0 and sampling_started==0:sampling_started=now-int(elapsed*1000000)
	super.camera_update(elapsed)

func _finalize():
	if not collision_probe:return
	var result={"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scenario":scenario,"sample_start_usec":sampling_started,"collision":collision_probe.samples,"clearance":clearance_probe.samples,"slow_frames":slow_frames,"note":"Diagnostic wrappers call shipping methods unchanged; monitor sampling adds a small per-frame overhead. Do not use as final timing comparison."}
	var file=FileAccess.open(output+label+"-"+scenario+"-probe.json",FileAccess.WRITE);file.store_string(JSON.stringify(result,"\t"));file.close()
