class_name MMFDestinationActivity
extends RefCounted

var game
var entry: Dictionary={}
var feedback=""
var feedback_view: Label
const KEYS={"course-gyro":"gyro","salvage-controller":"power","tracking-servo":"power","course-actuator":"array","annika-archive-shard":"array","orchard-port-isolator":"port","orchard-starboard-isolator":"starboard","meridian-transmitter-online":"transmitter","meridian-archive-installed":"archive"}
const STEPS={"gyro":["ISOLATE FEED","ARREST ROTOR","RELEASE CRADLE"],"port":["CONNECT GROUND","CLOSE BYPASS","ENERGISE ISOLATOR"],"starboard":["CONNECT GROUND","CLOSE BYPASS","ENERGISE ISOLATOR"],"transmitter":["CHECK ARCHIVE LINK","SYNCHRONISE TRANSMITTER","CONFIRM BEARING"],"archive":["VERIFY MEMORY CORE","SEAT ARCHIVE","VERIFY READBACK"]}
const TITLES={"gyro":"GYRO / SAFE RELEASE","power":"FOUNDRY / RECOVERY BUS","array":"ARRAY / PHASE ALIGNMENT","port":"ORCHARD / PORT ISOLATOR","starboard":"ORCHARD / STARBOARD ISOLATOR","transmitter":"MERIDIAN / TRANSMITTER","archive":"MERIDIAN / ARCHIVE CRADLE"}

func key(item: Dictionary) -> String:
	return KEYS.get(item.get("factId",item.get("objectiveId","")),"")

func state(id: String) -> Dictionary:
	if not game.session.polish.activities.has(id):
		game.session.polish.activities[id]={"step":0,"values":[0,0,0],"done":false}
	return game.session.polish.activities[id]

func completed(item: Dictionary) -> bool:
	var id=key(item)
	# Previously earned components and route-restored isolators remain valid.
	if item.get("factId","") in game.session.story.uniques or item.get("objectiveId","") in game.session.story.objectives: return true
	return id=="" or state(id).done

func open(item: Dictionary):
	entry=item.duplicate(true)
	feedback=""
	game.open_menu("Console")

func refusal() -> String:
	if entry.is_empty() or game.session.story.phase!="docked" or not is_instance_valid(game.campaign.destination): return "Dock at the destination to operate this instrument."
	if game.session.health<=0 or game.cinematic!="" or game.combat.active_threat(): return "Secure the area before operating the instrument."
	var found=false
	for point in game.campaign.points:
		if point.entry.id==entry.id:
			found=true
			if game.player.global_position.distance_to(game.campaign.destination.to_global(point.at)-Vector3.UP*.6)>2.5: return "Return to this instrument to continue."
	if not found: return "This instrument is no longer connected."
	if key(entry) in ["transmitter","archive"] and "orchard-memory-core" not in game.session.story.uniques: return "Recover the Orchard memory core first."
	return game.campaign.requirement(entry.get("factId",""))

func adjust(index: int,value: float) -> bool:
	if refusal()!="" or key(entry) not in ["power","array"] or index<0 or index>2 or not is_finite(value): return false
	state(key(entry)).values[index]=clampi(roundi(value),0,4 if key(entry)=="power" else 100)
	feedback=""
	if is_instance_valid(feedback_view): feedback_view.text=""
	return true

func act(index: int=0) -> bool:
	feedback=refusal()
	if feedback!="": return false
	var id=key(entry)
	if id=="": return false
	var st=state(id)
	if st.done: return true
	if id=="power":
		if st.values!=[2,1,0]:
			feedback="Recovery needs 2 units; tracking needs 1. Isolate the furnace. Available supply: 3."
			return false
	elif id=="array":
		for i in 3:
			if absf(st.values[i]-[25,60,85][i])>2:
				feedback="Match each received trace to its calibration tick (25 / 60 / 85)."
				return false
	else:
		if index!=int(st.step):
			feedback="Interlock held: "+STEPS[id][int(st.step)].to_lower()+" first."
			return false
		st.step+=1
		if st.step<STEPS[id].size():
			feedback="Confirmed. Next: "+STEPS[id][int(st.step)].to_lower()+"."
			return true
	st.done=true
	feedback="Instrument ready. Component access released."
	game.audio.play_sound("radio-signal",.12)
	game.campaign.interact(entry)
	game.story_art.sync_destination()
	game.ui.refresh()
	return true

func render(ui):
	var id=key(entry)
	if id=="": ui.text_line("No instrument selected.");return
	ui.text_line(TITLES[id],true)
	ui.text_line("LOCAL SERVICE LINK   /   No materials consumed   /   Progress is retained")
	var blocked=refusal()
	var st=state(id)
	if blocked!="": ui.text_line(blocked)
	if st.done:
		ui.text_line("COMPLETE / Equipment access restored.")
	elif id in ["power","array"]:
		ui.text_line("Allocate 3 units: RECOVERY 2 / TRACKING 1 / FURNACE 0." if id=="power" else "Match the calibration ticks: PORT 25 / CENTRAL 60 / STARBOARD 85. Then lock the phase.")
		var names=["RECOVERY","TRACKING","FURNACE"] if id=="power" else ["PORT","CENTRAL","STARBOARD"]
		var display=MMFInstrumentDisplay.new();display.activity=self;display.kind=id;ui.content.add_child(display)
		var status_label=ui.text_line(readout(id))
		for i in 3:
			ui.text_line(names[i])
			var slider=HSlider.new();slider.min_value=0;slider.max_value=4 if id=="power" else 100;slider.step=1;slider.value=st.values[i];slider.editable=blocked==""
			slider.custom_minimum_size.y=38
			slider.value_changed.connect(func(value):adjust(i,value);status_label.text=readout(id);display.queue_redraw())
			ui.content.add_child(slider)
		ui.button("COMMIT BUS" if id=="power" else "LOCK PHASE",func():act();ui.refresh(),blocked=="")
	else:
		ui.text_line("Follow the safety sequence. Completed steps remain latched.")
		for i in STEPS[id].size():
			ui.button(("✓ " if i<int(st.step) else "%d / "%[i+1])+STEPS[id][i],func():act(i);ui.refresh(),blocked=="" and i>=int(st.step))
	feedback_view=ui.text_line(feedback)
	ui.button("DISCONNECT / RETURN",game.close_menu)

func readout(id: String) -> String:
	var v=state(id).values
	if id=="power": return "DRAW %d / 3    %s"%[v[0]+v[1]+v[2],"OVERLOAD — change allocation" if v[0]+v[1]+v[2]>3 else "Supply stable"]
	return "RECEIVED %d / %d / %d    COHERENCE %d%%"%[v[0],v[1],v[2],maxi(0,100-int((abs(v[0]-25)+abs(v[1]-60)+abs(v[2]-85))/3))]
