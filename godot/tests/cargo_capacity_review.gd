extends "res://tests/cargo_capacity.gd"

var captures=[]
var source=""
func frames(count=4):
	for i in count:await process_frame

func capture(id: String):
	await frames();await RenderingServer.frame_post_draw
	var path=out+id+".png";root.get_texture().get_image().save_png(path);captures.append(path)

func labels() -> String:
	var lines=[]
	for node in game.ui.content.find_children("*","Label",true,false):lines.append(node.text)
	return "\n".join(lines)

func run():
	out="res://../test-results/cargo-capacity/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	Engine.max_fps=60
	source=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	await frames(6)
	var s=game.session;var a=game.salvage.automation;s.speed=0;s.facts.salvage=true
	var cap=int(s.data.ITEMS.scrap.stackSize)
	for resolution in [Vector2i(1024,768),Vector2i(1440,810)]:
		DisplayServer.window_set_size(resolution);await frames(6)
		var suffix="%dx%d"%[resolution.x,resolution.y]
		game.close_menu();clear_cargo()
		game.player.teleport(Vector3(0,16.03,-1))
		var c=cargo(Vector3(-7,16.08,-1),{"scrap":7,"fuel":2});c.claimed="parked"
		game.player.camera.global_position=game.player.position+Vector3(0,2,2);game.player.camera.look_at(c.node.position)
		c.node.reset_physics_interpolation()
		for bag in s.containers():fill(bag,"components")
		await frames();game.ui.salvage_readout.update()
		check(game.ui.salvage_readout.visible and game.ui.salvage_readout.label.text.contains("STORAGE FULL"),"Visible full parked bracket "+suffix)
		check(game.ui.salvage_readout.get_rect().encloses(game.ui.salvage_readout.label.get_rect()),"Full bracket text stays on screen "+suffix)
		await capture("full-"+suffix)
		s.inventory.slots[0]={"itemId":"scrap","count":cap-3}
		await frames();game.ui.salvage_readout.update()
		check(game.ui.salvage_readout.visible and game.ui.salvage_readout.label.text.contains("PARTIAL SPACE"),"Existing bracket updates immediately for partial capacity "+suffix)
		await capture("partial-"+suffix)
		# Still-uncollected sealed cargo cannot be described as already aboard.
		for bag in s.containers():fill(bag,"components")
		c.claimed="";c.opened=false;c.contents={};await frames();game.ui.salvage_readout.update()
		check(game.ui.salvage_readout.label.text.contains("will retain cargo") and not game.ui.salvage_readout.recovery_blocked,"Sealed capacity cue is future tense and permits recovery "+suffix)
		await capture("sealed-full-"+suffix)
		clear_cargo()
		var dock=s.structures.filter(func(p):return p.definitionId=="collector-auto")
		var p=s.create_piece("collector-auto",{"x":4,"y":0,"z":1},0,{},true) if dock.is_empty() else dock[0]
		var id=str(p.instanceId);s.powered[id]=true
		var bag=s.stores[id];fill(bag,"scrap");s.inventory.slots.fill(null)
		c=cargo(Vector3(3,18,1),{"scrap":7,"fuel":2});c.claimed=id
		var node=Node3D.new();game.salvage.add_child(node)
		a.drones[id]={"cargo":c,"phase":"wait","node":node,"home":a.drone_home(p),"height":20.0,"rotors":[],"retry":0.0}
		game.open_station("Storage","collector-auto",id);await frames()
		check(labels().contains("HELD CARGO:") and labels().contains("free space in this dock"),"Local Storage explains held load "+suffix)
		check(game.ui.root.get_rect().encloses(game.ui.panel.get_global_rect()),"Storage panel stays inside viewport "+suffix)
		await capture("dock-held-"+suffix)
		var take=game.ui.content.find_children("*","Button",true,false).filter(func(button):return button.text=="TAKE ALL")
		check(take.size()==1,"Normal Take All action exists "+suffix)
		if not take.is_empty():take[0].pressed.emit()
		await frames()
		check(labels().contains("close reader to resume unloading") and not labels().contains("free space in this dock"),"Taking supplies refreshes capacity explanation without stale full status "+suffix)
		await capture("dock-space-available-"+suffix)
		game.close_menu();check(a.transfer(c,bag),"Ordinary held transfer finishes after capacity is freed "+suffix)
		node.queue_free();a.drones.erase(id)
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"captures":captures,"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"kind":"rendered prepared layout/interaction fixtures; not human or earned play"}
	FileAccess.open(out+"native-review.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "));print("CARGO_REVIEW_RESULT ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
