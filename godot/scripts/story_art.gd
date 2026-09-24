class_name MMFStoryArt
extends RefCounted

var game
var archive: Node3D
var seeds: Node3D
var lamps: Array=[]
var refresh_left=0.0
const PARTS={"gyro":"GyroPanel","power":"PowerRouter","array":"ArrayTuner","port":"Isolator","starboard":"Isolator","transmitter":"ArchiveConsole","archive":"ArchiveConsole"}

func part(name: String) -> Node3D:
	var kit=MMFAssets.scene("res://art/story-instruments.glb")
	var original=MMFAssets.find_named(kit,name)
	var copy=original.duplicate() if original else Node3D.new()
	kit.free()
	return copy

func setup():
	# Both instruments bolt to the existing receiver assembly, not the walkway.
	archive=part("ArchiveConsole");game.world.receiver.add_child(archive)
	archive.position=Vector3(.22,1.447,0);archive.scale=Vector3.ONE*.65
	seeds=part("SeedTerrarium");game.world.receiver.add_child(seeds)
	seeds.position=Vector3(-.22,1.447,0);seeds.scale=Vector3.ONE*.65
	update(0)

func update(dt: float):
	if archive: archive.visible="annika-archive-shard" in game.session.story.uniques
	if seeds: seeds.visible="human-seed-bank" in game.session.story.uniques
	if archive and seeds:
		var collision=game.world.receiver_body.get_child(0)
		var height=1.85 if archive.visible or seeds.visible else 1.44
		if not is_equal_approx(collision.shape.size.y,height):
			collision.shape.size.y=height
			game.world.receiver_body.position.y=16.03+height*.5
	refresh_left-=dt
	if refresh_left<=0: refresh_left=.5;sync_destination()

func decorate_destination():
	lamps.clear()
	var c=game.campaign
	if not c or not is_instance_valid(c.destination): return
	for point in c.points:
		var id=game.activity.key(point.entry)
		if id=="": continue
		var model=part(PARTS[id]);c.destination.add_child(model)
		model.position=point.at+Vector3(0,-.1,-.07);model.scale=Vector3.ONE*.6
		# Visible steel mounting stay reaches the existing console's deck. No floating panel.
		var foot=Vector3(point.at.x,.025,point.at.z+.025)
		MMFAssets.box(c.destination,Vector3(.19,maxf(.1,point.at.y-.1),.07),(foot+Vector3(foot.x,point.at.y-.1,foot.z))*.5,MMFAssets.material(Color(.11,.13,.12)),false)
		MMFAssets.box(c.destination,Vector3(.35,.04,.28),foot,MMFAssets.material(Color(.18,.20,.18)),false)
		var lamp=MMFAssets.box(model,Vector3(.025,.16,.008),Vector3(.215,.28,-.098),MMFAssets.material(Color(.9,.32,.04),1),false)
		lamps.append({"entry":point.entry,"node":lamp,"done":null})
	sync_destination()

func sync_destination():
	for item in lamps:
		if not is_instance_valid(item.node): continue
		var done=game.activity.completed(item.entry)
		if item.done==done: continue
		item.done=done
		item.node.material_override=MMFAssets.material(Color(.12,.9,.55) if done else Color(.9,.32,.04),1.8)
