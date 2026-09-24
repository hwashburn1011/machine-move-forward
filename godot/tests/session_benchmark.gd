extends SceneTree

var report={}
class Fixture extends Node3D:
	var session
	var player=Node3D.new()
	var data: Dictionary
	func aboard(): return true
func _initialize():set_meta("test_mode",true);call_deferred("run")
func stats(values: Array) -> Dictionary:
	values.sort();return {"medianMs":values[values.size()/2],"p95Ms":values[int(values.size()*.95)],"maxMs":values.back()}
func run():
	var data=MMFAssets.json("res://data/definitions.json")
	for size in [30,300,900]:
		var session=MMFSession.new(data);session.structures.clear();session.stores.clear()
		for i in size:
			var kind=["floor","generator","lamp","refinery","floor","condenser","turret-auto","turret-manual","collector-auto","caretaker-dock","planter","seed-garden"][i%12]
			var piece=session.create_piece(kind,{"x":i%20,"y":0,"z":int(i/20)},0,{},true)
			piece.health*=.5 if i%5==0 else 1.0
		session.facts.salvage=true;session.fieldwork_active=true;session.story.uniques.append("course-gyro");session.opening_done=true
		var power=[];var tick=[]
		var fixture=Fixture.new();fixture.session=session;fixture.data=data;fixture.player.position=Vector3(0,16.1,0)
		var home=MMFHome.new();home.setup(fixture);home.update(0)
		var homes=[]
		for warm in 20:session.tick(1.0/60)
		for block in 40:
			session.fuel=60
			var start=Time.get_ticks_usec()
			for i in 100:session.update_power()
			power.append((Time.get_ticks_usec()-start)/100000.0)
			start=Time.get_ticks_usec()
			for i in 100:session.tick(1.0/60)
			tick.append((Time.get_ticks_usec()-start)/100000.0)
			start=Time.get_ticks_usec()
			for i in 100:home.update(1.0/60)
			homes.append((Time.get_ticks_usec()-start)/100000.0)
			await process_frame
		report[str(size)]={"power":stats(power),"tick":stats(tick),"home":stats(homes),"capacity":session.capacity,"demand":session.demand,"poweredCount":session.powered.values().count(true)}
		print("SESSION_BENCHMARK ",size," ",report[str(size)])
		home.free();fixture.player.free();fixture.free()
	var file=FileAccess.open("res://../test-results/godot-native/session-benchmark.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();quit()
