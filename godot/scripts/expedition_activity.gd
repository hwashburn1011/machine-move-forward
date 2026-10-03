class_name MMFExpeditionActivity
extends MMFDestinationActivity

signal semantic_event(event_name: String,fields: Dictionary)
var view: MMFExpeditionMechanismView
var generation=0
var opened_generation=-1
var last_rejection=""

func key(item: Dictionary) -> String:
	return str(item.get("activity",super.key(item)))

func state(id: String) -> Dictionary:
	if not MMFExpeditionMechanisms.STEPS.has(id):return {}
	if not game.session.polish.activities.has(id) or not game.session.polish.activities[id].has("mechanism"):
		game.session.polish.activities[id]=MMFExpeditionMechanisms.normalize(id,game.session.polish.activities.get(id,{}),game.session.story)
	return game.session.polish.activities[id]

func peek_state(id: String) -> Dictionary:
	var existing=game.session.polish.activities.get(id,{})
	return existing if existing.has("mechanism") else MMFExpeditionMechanisms.normalize(id,existing,game.session.story)

func completed(item: Dictionary) -> bool:
	if item.get("kind","")=="mechanism":return false
	var id=key(item)
	if id=="":return true
	if item.get("factId","") in game.session.story.uniques or item.get("objectiveId","") in game.session.story.objectives:return true
	return state(id).done

func rebuild():
	generation+=1;entry={};opened_generation=-1;last_rejection=""
	if is_instance_valid(view):view.queue_free()
	view=null
	if not is_instance_valid(game.campaign.destination):return
	view=MMFExpeditionMechanismView.new();view.activity=self;view.game=game
	game.campaign.destination.add_child(view)
	view.setup(game.campaign.expedition().id)

func moving() -> bool:
	return is_instance_valid(view) and not view.pending.is_empty()

func open(item: Dictionary):
	entry=item.duplicate(true);feedback="";opened_generation=generation
	game.open_menu("Console")

func control_visible(item: Dictionary) -> bool:
	var id=key(item)
	return id!="" and item.get("action","")==MMFExpeditionMechanisms.next_step(id,peek_state(id))

func interaction_refusal(item: Dictionary) -> String:
	if game.session.story.phase!="docked" or not is_instance_valid(game.campaign.destination):return "Dock at the destination to use this equipment."
	if game.session.health<=0 or game.cinematic!="" or game.combat.active_threat():return "Secure the area before operating this equipment."
	var found={}
	for p in game.campaign.points:
		if p.entry.id==item.get("id",""):found=p;break
	if found.is_empty():return "This control is no longer connected."
	var target=game.campaign.destination.to_global(found.at)
	if game.player.global_position.distance_to(target-Vector3.UP*.6)>2.5:return "Return to this local control to continue."
	# The control itself can be the final hit; intervening machinery cannot.
	var eye=game.player.global_position+Vector3.UP*1.35
	var hit=game.raycast(eye,target,[game.player.get_rid()])
	if not hit.is_empty() and hit.position.distance_to(target)>.5 and hit.collider.get_meta("expedition_control","")!=item.get("id",""):
		return "Move into clear view of this control."
	return ""

func refusal() -> String:
	if opened_generation!=generation:return "This local connection has expired. Reconnect at the control."
	var blocked=interaction_refusal(entry)
	if blocked!="":return blocked
	var id=key(entry)
	if id in ["archive","transmitter"] and "orchard-memory-core" not in game.session.story.uniques:return "Recover the Orchard memory core first."
	if moving():return "Equipment is moving. Keep the service area clear."
	return ""

func adjust(index: int,value: float) -> bool:
	if refusal()!="" or entry.get("kind","")!="mechanism" or not is_finite(value):return false
	var id=key(entry);var action=entry.get("action","");var st=state(id)
	if action!=MMFExpeditionMechanisms.next_step(id,st):return false
	if id=="power" and action=="bus" and index in [0,1,2]:st.values[index]=clampi(roundi(value),0,4)
	elif id=="array" and index==MMFExpeditionMechanisms.STEPS.array.find(action) and index in [0,1,2]:st.values[index]=clampi(roundi(value),0,100)
	else:return false
	feedback=""
	if is_instance_valid(view):view.sync()
	return true

func act(_index: int=0) -> bool:
	feedback=refusal()
	if feedback!="":return rejected(feedback,"local-control-unavailable")
	if entry.get("kind","")!="mechanism":return rejected("Operate the marked local service controls before collecting this component.","physical-controls-required")
	var id=key(entry);var action=str(entry.action);var st=state(id)
	feedback=MMFExpeditionMechanisms.refusal(id,st,action)
	if feedback!="":return rejected(feedback,"interlock-or-calibration")
	if action in st.mechanism.milestones:return true
	if id=="array" and action=="lock":
		for journal in game.campaign.expedition().requiredJournals:
			if journal not in game.session.story.journals:return rejected("Read both relay calibration records before locking the phase.","calibration-records-required")
	if MMFExpeditionMechanisms.moving_step(id,action):
		if not is_instance_valid(view) or not view.begin_motion(id,action):return rejected("Clear the marked machinery sweep before operating this control.","occupied-sweep")
		game.close_menu()
		return true
	finish_step(id,action)
	return true

func rejected(message: String,reason: String) -> bool:
	feedback=message
	var signature=str(generation)+"/"+str(entry.get("id",""))+"/"+reason
	if signature!=last_rejection:
		last_rejection=signature
		semantic_event.emit("activity_blocked",{"site_id":game.campaign.expedition().id,"activity_id":key(entry),"step_id":entry.get("action",""),"reason_code":reason})
	return false

func finish_step(id: String,action: String):
	var st=state(id);var first=st.mechanism.milestones.is_empty();var prior=st.mechanism.milestones.size()
	if not MMFExpeditionMechanisms.commit(id,st,action) or prior==st.mechanism.milestones.size():return
	last_rejection=""
	var fields={"site_id":game.campaign.expedition().id,"activity_id":id,"step_id":action}
	if first:semantic_event.emit("activity_started",fields)
	semantic_event.emit("activity_step_completed",fields)
	if st.done:semantic_event.emit("activity_completed",fields)
	feedback="Equipment access restored. Recover the component at its service station." if st.done else "Latched. Next: "+MMFExpeditionMechanisms.control(id,MMFExpeditionMechanisms.next_step(id,st)).label
	game.session.notify(feedback)
	game.session.changed.emit()
	game.audio.play_sound("radio-signal",.10)
	if is_instance_valid(view):view.sync()
	game.story_art.sync_destination()
	# Unlock and travel share the same pendant. Keep its next local command ready.
	if not st.done and entry.get("kind","")=="mechanism" and key(entry)==id:
		var next_action=MMFExpeditionMechanisms.next_step(id,st)
		var current_control=MMFExpeditionMechanisms.control(id,str(entry.action))
		var next_control=MMFExpeditionMechanisms.control(id,next_action)
		if current_control.at==next_control.at and is_instance_valid(view):
			entry=view.controls["mechanism-"+id+"-"+next_action].entry.duplicate(true)
	if game.menu_open and game.ui.page=="Console":game.ui.refresh()

func describe_step(_site_id: String="") -> Dictionary:
	if not is_instance_valid(view):return {}
	for id in MMFExpeditionMechanisms.SITES.get(view.site_id,[]):
		var action=MMFExpeditionMechanisms.next_step(id,peek_state(id))
		if action=="":continue
		var spec=MMFExpeditionMechanisms.control(id,action)
		var blocked=""
		if id=="array":
			for journal in game.campaign.expedition().requiredJournals:
				if journal not in game.session.story.journals:
					for point in game.campaign.points:
						if point.entry.id==journal:return point_description(point,"Read the calibration record before setting the wheels.")
		return {"activity_id":id,"step_id":action,"label":spec.label,"target_anchor_id":"mechanism-"+id+"-"+action,"target":game.campaign.destination.to_global(spec.at),"blocked_reason":blocked,"completed":false,"can_interact":not moving()}
	var unclaimed=false
	for point in game.campaign.points:
		var item=point.entry
		if item.kind not in ["unique","objective"] or not game.campaign.can_show(item):continue
		unclaimed=true
		if game.campaign.requirement(item.get("factId",""))=="":return point_description(point)
	if unclaimed:
		for point in game.campaign.points:
			if point.entry.kind=="journal" and point.entry.id not in game.session.story.journals and game.campaign.can_show(point.entry):return point_description(point)
	return {"completed":true,"label":"Return aboard through the gangway","target_anchor_id":"nomad-gangway","target":Vector3(10,16.1,0),"blocked_reason":"","can_interact":false}

func point_description(point: Dictionary,reason: String="") -> Dictionary:
	return {"completed":false,"label":point.entry.label,"target_anchor_id":point.entry.id,"target":game.campaign.destination.to_global(point.at),"blocked_reason":reason,"can_interact":true}

func render(ui):
	var id=key(entry)
	if id=="":ui.text_line("No connected instrument.");return
	var st=state(id)
	ui.section(TITLES[id],"LOCAL SERVICE")
	ui.text_line("Site equipment • Captive components • No inventory materials consumed")
	var blocked=refusal()
	if blocked!="":ui.text_line(blocked)
	if entry.get("kind","")!="mechanism":
		var next=MMFExpeditionMechanisms.next_step(id,st)
		ui.text_line("Access restored. Reconnect to recover this component." if next=="" else "Walk to "+MMFExpeditionMechanisms.control(id,next).label+" to restore access.",true)
	else:
		var action=str(entry.action)
		ui.text_line(entry.label,true)
		var wanted=MMFExpeditionMechanisms.next_step(id,st)
		var ready=blocked=="" and action==wanted
		if wanted!="" and action!=wanted:ui.text_line("Next control: "+MMFExpeditionMechanisms.control(id,wanted).label)
		if id=="power" and action=="bus":
			ui.text_line("Available supply: 3. RECOVERY needs 2; TRACKING needs 1; isolate FURNACE (0).")
			for i in 3:add_slider(ui,i,["RECOVERY","TRACKING","FURNACE"][i],4,ready)
		elif id=="array" and action!="lock":
			var channel=MMFExpeditionMechanisms.STEPS.array.find(action)
			var records=game.campaign.expedition().requiredJournals
			var known=records.all(func(j):return j in game.session.story.journals)
			ui.text_line("Recorded calibration tick: "+str([25,60,85][channel])+". This local wheel controls one antenna." if known else "Read the relay calibration records to identify the correct wheel settings.")
			add_slider(ui,channel,action.to_upper(),100,ready)
		else:ui.text_line("Keep the striped service sweep clear. The fixed return aisle stays open.")
		ui.button("LATCH CALIBRATION" if id=="array" and action!="lock" else entry.label.split(" / ")[-1].to_upper(),operate_and_refresh,ready)
		ui.text_line("Completed: %d / %d"%[st.mechanism.milestones.size(),MMFExpeditionMechanisms.STEPS[id].size()])
	feedback_view=ui.text_line(feedback)
	ui.button("DISCONNECT / WALK TO NEXT CONTROL",game.close_menu)

func operate_and_refresh():
	act()
	if game.menu_open:game.ui.refresh()

func add_slider(ui,index: int,label: String,maximum: int,editable: bool):
	ui.text_line(label)
	var value_label=ui.text_line(str(state(key(entry)).values[index]))
	var slider=HSlider.new();slider.min_value=0;slider.max_value=maximum;slider.step=1;slider.value=state(key(entry)).values[index];slider.editable=editable;slider.custom_minimum_size.y=38
	ui.content.add_child(slider)
	value_label.text=str(int(slider.value))
	slider.value_changed.connect(func(value):
		if adjust(index,value):value_label.text=str(int(value)))
