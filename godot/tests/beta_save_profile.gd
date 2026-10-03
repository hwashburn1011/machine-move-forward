extends SceneTree
## Serialization timings for personalized synthetic homes. No rendering claim.
class MeasuredWriter extends MMFAutosaver:
	var harvest_ms=[]
	func harvest():
		var start=Time.get_ticks_usec();super.harvest();harvest_ms.append((Time.get_ticks_usec()-start)/1000.0)

func _initialize():
	set_meta("test_mode",true);call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort();return {"median":values[values.size()/2],"max":values.back()}

func run():
	var data=MMFAssets.json("res://data/definitions.json")
	var output="res://../test-results/beta-next/save-profile/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	var report={"scope":"Synthetic personalized native campaign serialization/I/O timings, not rendering FPS. Eight verified writes per case; no personal saves.","source_hash":MMFPlaytestRecorder.source_fingerprint(),"cpu":OS.get_processor_name(),"scenarios":{}}
	for count in [2,300,900]:
		var session=MMFSession.new(data)
		session.customization.restored=true
		session.customization.machinePaint={"lockers":"petrol","benches":"clay"}
		var furnishings=[]
		for id in session.data.BUILD_PIECE_ORDER:
			if id.begins_with("nomad-") or id.begins_with("nomad2-"):furnishings.append(id)
		for p in session.structures:
			if MMFNomadPersonalization.piece_eligible(p.definitionId):p.state.finish="denim"
		while session.structures.size()<count:
			var i=session.structures.size()
			var id=furnishings.pop_front() if not furnishings.is_empty() else "crate" if i%5==0 else "floor"
			var piece=session.create_piece(id,{"x":i%30,"y":-i%3,"z":i/30},0,{},true)
			if MMFNomadPersonalization.piece_eligible(id):piece.state.finish=MMFNomadPersonalization.PALETTE_IDS[i%14]
			if session.stores.has(piece.instanceId):session.stores[piece.instanceId].add("scrap",40)
		var writer=MeasuredWriter.new();root.add_child(writer)
		var synchronous=[];var queued=[];var durable=[]
		var directory=ProjectSettings.globalize_path(output+str(count)+"/")
		for i in 8:
			await process_frame
			var start=Time.get_ticks_usec()
			if not MMFSaves.write_at(directory,"autosave",{"session":session.native_snapshot()}):push_error("Synchronous save failed");quit(1);return
			synchronous.append((Time.get_ticks_usec()-start)/1000.0)
		for i in 8:
			await process_frame
			var start=Time.get_ticks_usec()
			if not writer.request({"session":session.native_snapshot()},directory):push_error("Worker request failed");quit(1);return
			queued.append((Time.get_ticks_usec()-start)/1000.0)
			while writer.pending():await process_frame
			durable.append((Time.get_ticks_usec()-start)/1000.0)
		var payload=MMFSaves.decode(directory+"autosave.json")
		var restored=MMFSession.new(data)
		var valid=restored.restore_native(payload.get("session",{}))
		# JSON restores numeric format1 as1.0; compare the serialized contract.
		var same=restored.customization==JSON.parse_string(JSON.stringify(session.customization))
		var painted=0
		for piece in session.structures:
			if piece.state.has("finish"):
				painted+=1;same=same and restored.find_piece(piece.instanceId).get("state",{}).get("finish","")==piece.state.finish
		if not valid or not same:push_error("Personalized saved campaign failed restore validation");quit(1);return
		var file=FileAccess.open(directory+"autosave.json",FileAccess.READ);var bytes=file.get_length();file.close()
		report.scenarios[str(count)]={"pieces":session.structures.size(),"painted":painted,"bytes":bytes,"syncMainMs":stats(synchronous),"asyncRequestMainMs":stats(queued),"asyncHarvestMainMs":stats(writer.harvest_ms),"asyncWallToDurableMs":stats(durable),"validCampaign":valid}
		print("BETA_SAVE_PROFILE ",count," ",JSON.stringify(report.scenarios[str(count)]))
		writer.queue_free();await process_frame
	var file=FileAccess.open(output+"report.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	quit()
