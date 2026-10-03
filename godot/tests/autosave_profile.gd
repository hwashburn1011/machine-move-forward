extends SceneTree

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
	var report={"scope":"Synthetic native campaign serialization/I/O timings, not rendering FPS. Same verified writer compares main-thread execution with worker queueing; eight writes per case.","source_hash":MMFPlaytestRecorder.source_fingerprint(),"cpu":OS.get_processor_name(),"scenarios":{}}
	for count in [2,300,900]:
		var session=MMFSession.new(data)
		while session.structures.size()<count:
			var i=session.structures.size()
			var p=session.create_piece("crate" if i%5==0 else "floor",{"x":i%30,"y":-i%3,"z":i/30},0,{},true)
			if session.stores.has(p.instanceId):session.stores[p.instanceId].add("scrap",40)
		var writer=MeasuredWriter.new();root.add_child(writer)
		var synchronous=[];var queued=[];var durable=[]
		var directory="user://native-autosave-profile/"+str(count)+"/"
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
		var valid=MMFSession.new(data).restore_native(payload.get("session",{}))
		var file=FileAccess.open(directory+"autosave.json",FileAccess.READ);var bytes=file.get_length();file.close()
		report.scenarios[str(count)]={"pieces":session.structures.size(),"bytes":bytes,"syncMainMs":stats(synchronous),"asyncRequestMainMs":stats(queued),"asyncHarvestMainMs":stats(writer.harvest_ms),"asyncWallToDurableMs":stats(durable),"validCampaign":valid}
		print("AUTOSAVE_PROFILE ",count," ",report.scenarios[str(count)])
		writer.queue_free();await process_frame
	var file=FileAccess.open("res://../test-results/godot-native/autosave-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit")
