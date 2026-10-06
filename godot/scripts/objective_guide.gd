class_name MMFObjectiveGuide
extends RefCounted

# Semantic tasks are derived, never a second progression authority.
var game
var marker: Label3D
var refresh_left = 0.0
var last_task = ""

static func task(id: String, title: String, action: String, kind: String="", target: String="", pin: Dictionary={}) -> Dictionary:
	return {"id":id,"title":title,"action":action,"text":title+"\n"+action,"target_kind":kind,"target_id":target,"pin":pin}

static func scrap_shortfall(s, cost: Dictionary, purpose: String, pin: Dictionary) -> Dictionary:
	var missing=maxi(0,int(cost.get("scrap",0))-s.count_resource("scrap"))
	if missing==0:return {}
	# A shopping objective must name something the player can do now. Keep the
	# intended purchase pinned, but do not point at an unaffordable station.
	return task("recover-scrap","RECOVER MORE SALVAGE","Need %d more scrap for %s. Aim at passing cargo and throw the hook with [{key:reel}]."%[missing,purpose],"","",pin)

static func describe(s) -> Dictionary:
	if s.opening_done and s.health>0 and s.attack_recent<=0 and not MMFMachineOperations.docked(s):
		var diagnosis=MMFMachineService.diagnose(s)
		if not diagnosis.faults.is_empty() and (diagnosis.eligible or s.subsystems.engine<=0 or s.fuel<=0 or not MMFPowerBudget.calculate(s,s.structures).drive_enabled):
			return task("machine-recovery","RESTORE THE NOMAD",diagnosis.faults[0]+" Service cabinets are one deck below.","engineering")
	if not s.facts.salvage:
		return task("salvage","RECOVER SALVAGE","Reel in drifting cargo with [{key:reel}] to recover the receiver.")
	if s.scanner.phase=="awaiting-module":
		if s.count_resource("scanner-replacement-module")>0:
			return task("install-scanner","INSTALL THE MODULE","Interact with the receiver to fit your replacement module.","receiver")
		# Guide the next affordable action. Recovered components count exactly as
		# crafted ones; a historical refining total is not a progression gate.
		var needs_bench=not s.has_station("workbench")
		var next_cost=s.data.BUILD_PIECES.workbench.cost if needs_bench else {}
		for recipe in s.data.RECIPES:
			if not needs_bench and recipe.id=="craft-scanner-replacement-module":next_cost=recipe.inputs
		var missing=maxi(0,int(next_cost.get("components",0))-s.count_resource("components"))
		if missing>0:
			if not s.has_station("refinery"):
				var gather=scrap_shortfall(s,s.data.BUILD_PIECES.refinery.cost,"a refinery",{"kind":"build","id":"refinery"})
				if not gather.is_empty():return gather
				return task("build-refinery","BUILD A REFINERY","Open construction with [{key:build}] and place a refinery on a clear deck. Recovered components also count toward your next repair.","build","refinery",{"kind":"build","id":"refinery"})
			for recipe in s.data.RECIPES:
				if recipe.id!="refine-components":continue
				var gather=scrap_shortfall(s,recipe.inputs,"one refining batch",{"kind":"recipe","id":"refine-components"})
				if not gather.is_empty():
					gather.action+=" Recovered components can also cover the shortfall."
					gather.text=gather.title+"\n"+gather.action
					return gather
			return task("refine","RECOVER OR REFINE COMPONENTS","Need %d more components for %s. Recover cargo or use the refinery."%[missing,"the workbench" if needs_bench else "the scanner module"],"piece","refinery",{"kind":"recipe","id":"refine-components"})
		var gather=scrap_shortfall(s,next_cost,"the workbench" if needs_bench else "the scanner module",{"kind":"build" if needs_bench else "recipe","id":"workbench" if needs_bench else "craft-scanner-replacement-module"})
		if not gather.is_empty():return gather
		if needs_bench:
			return task("build-workbench","BUILD A WORKBENCH","Open construction with [{key:build}] and place a workbench on a clear deck to repair the scanner.","build","workbench",{"kind":"build","id":"workbench"})
		return task("craft-scanner","REPAIR THE SCANNER","Use the workbench to craft a replacement module.","piece","workbench",{"kind":"recipe","id":"craft-scanner-replacement-module"})
	if s.scanner.phase=="installed":
		return task("start-scan","START THE SCAN","Interact with the receiver aboard the Nomad.","receiver")
	if s.scanner.phase=="scanning":
		var suggestion={"kind":"build","id":"turret-manual"} if not s.has_station("turret-manual") else {}
		var activity="Optional: open construction [{key:build}] to prepare a Manual Deck Gun on a clear deck." if not suggestion.is_empty() else "Optional: approach the deck gun and press [{key:use}] to try its sights, or collect passing cargo with [{key:reel}]."
		return task("scan","SCAN IN PROGRESS  %d%%"%int(s.scan_fraction()*100.0),"The receiver works on its own while you stay aboard with power. "+activity+" Close menus to let the journey continue.","receiver","",suggestion)
	if s.scanner.phase=="contact-ready":
		return task("signal-ready","CONTACT ACQUIRED","Transmission stabilizing…","receiver")
	if s.scanner.phase=="consumed" and (not s.has_station("turret-manual") or not s.facts.get("defenseCrewed",false)) and s.story.phase in ["locked","signal","crossfire","raids"]:
		if not s.has_station("turret-manual"):
			return task("build-defense","PREPARE A DEFENSE","Build a Manual Deck Gun, then approach it to crew it.","build","turret-manual",{"kind":"build","id":"turret-manual"})
		return task("crew-defense","CREW THE DECK GUN","Approach the deck gun and press [{key:use}] to mount.","piece","turret-manual")
	var mission=MMFMissions.contact_mission(s.contacts.active)
	if mission!="" and s.contacts.active.get("state","") in ["committed","docked","visited"]:
		var r=s.missions.records[mission]
		if s.contacts.active.state=="committed":return task("mission-travel","OPTIONAL SIGNAL AHEAD","Stay aboard while the Nomad approaches the mission platform.")
		if r.status=="completed":return task("mission-return","OPTIONAL WORK COMPLETE","Collect any remaining courier supplies, then return aboard and depart from the helm.","mission","return")
		return task("mission-work",MMFNativeNarrativeData.MISSIONS[mission].title.to_upper(),"Aim at the yellow coupling and throw the salvage hook with [{key:reel}]." if mission=="stranded-courier" and r.step==0 else "Use this platform's marked local service control. Return aboard whenever you need to leave.","mission","coupling" if mission=="stranded-courier" and r.step==0 else "console")
	match s.story.phase:
		"crossfire","raids":return task("defend","DEFEND THE NOMAD","Watch both sides for grappling mechs.")
		"docked":return task("expedition","EXPLORE THE SITE",str(s.data.STORY_EXPEDITIONS[int(s.story.index)].objective),"expedition")
		"approach","braking":return task("travel","FOLLOW THE SIGNAL","Destination in %d m. Prepare your machine while travelling."%maxf(0,s.story.arrival-s.distance))
		"departing":return task("depart","DEPARTING","Stay aboard as the Nomad clears the site.")
		"ending-ready":return task("final-course","SET THE FINAL BEARING","Interact with the navigation helm to continue.","helm")
		"finale-link":return task("secure-link","SECURE THE RECEIVING LINK","Use the receiver to secure the link, then resume the protected journey at the helm.","receiver" if s.finale.stage=="secure" else "helm")
		"finale-docked":return task("receiving-berth","RESTORE THE RECEIVING BERTH","Cross the gangway. Read the maintenance plate, restore the coupler, transfer seeds and archive, then choose a communication policy." if s.finale.stage=="berth" else "Transfer complete. Return aboard and use the helm when ready to continue.")
		"ending-journey","arrival":return task("arrival","FOLLOW THE FINAL BEARING","Your destination is ahead.")
		"complete":return task("complete","KEEP WALKING","Your machine, your course.")
	return task("course","TRACE THE SIGNAL","Interact with the navigation helm to choose your next course.","helm")

static func valid_pin(pin, data: Dictionary) -> bool:
	if not pin is Dictionary: return false
	if pin.is_empty(): return true
	if pin.size()!=2 or not pin.get("id") is String: return false
	if pin.get("kind")=="build": return data.BUILD_PIECES.has(pin.id) and pin.id not in MMFNativeProgression.RETIRED_PIECES
	if pin.get("kind")=="recipe":
		for recipe in data.RECIPES:
			if recipe.id==pin.id: return true
	return false

func current_task() -> Dictionary:
	var result=describe(game.session)
	var s=game.session
	if s.story.phase=="finale-docked":
		if not game.finale.gangway_open:
			result=task("berth-access","CLEAR THE STARBOARD GANGWAY","Move construction away from the docking opening. The safety gate will open when the passage is clear.")
		elif s.finale.stage=="aftermath":result=task("berth-return","KEEP WALKING","Return aboard and use the helm when ready. The berth remains available until departure.","helm")
		else:
			var id="receiver" if not s.finale.powered else "seeds" if not s.finale.seeds else "archive" if not s.finale.archive else "transmitter"
			result=task("berth-"+id,"RECEIVING BERTH",{"receiver":"Check the maintenance reference, select channel B and close the local isolator.","seeds":"Connect the preserved seeds to the berth enclosure.","archive":"Import the transmitted archive copy. The original core stays at Meridian.","transmitter":"Preview and choose how other travellers can reach this berth."}[id],"berth",id)
	var needs_power=result.target_kind=="receiver" and not s.powered.get("fixed-radio",false) or result.target_kind=="piece" and s.has_station(result.target_id) and not s.station_powered(result.target_id)
	if needs_power:
		if not s.has_station("generator"):
			result.action+="\nBuild or repair a generator to power this equipment."
		elif s.fuel<=0:
			result.action+="\nRefuel a generator using fuel carried in your pack."
			result.target_kind="piece";result.target_id="generator"
		else:result.action+="\nRestore spare generator capacity for this equipment."
		result.text=result.title+"\n"+result.action
	if result.id=="scan":
		var hold=""
		if game.session.health<=0:hold="Recover before scanning can resume."
		elif not game.aboard():hold="Return aboard to resume scanning."
		elif game.combat.active_threat() or game.session.attack_recent>0:hold="Secure the Nomad to resume scanning."
		elif not game.session.powered.get("fixed-radio",false):hold="Restore generator power to resume scanning."
		elif game.menu_open and game.ui.page!="Signal":hold="Close the menu to resume scanning."
		if hold!="":result.action=hold;result.text=result.title+"\n"+hold
	if result.target_kind=="expedition" and game.activity.has_method("describe_step"):
		var step=game.activity.describe_step()
		if not step.is_empty():
			result.action=step.get("label",result.action)
			if step.get("blocked_reason","")!="":result.action+="\n"+str(step.blocked_reason)
			result.text=result.title+"\n"+result.action
	return result

func toggle_pin(kind: String, id: String):
	var pin={"kind":kind,"id":id}
	if not valid_pin(pin,game.data):return
	game.session.polish["pin"]={} if game.session.polish.get("pin",{})==pin else pin
	game.session.changed.emit()
	if game.has_method("record_event"):game.record_event("guidance","pin_changed",game.session.polish.pin)

func is_pinned(kind: String, id: String) -> bool:
	return game.session.polish.get("pin",{})=={"kind":kind,"id":id}

func clear_pin():
	game.session.polish["pin"]={}
	game.session.changed.emit()

func checklist(manual_only: bool=false) -> Dictionary:
	var pin=game.session.polish.get("pin",{})
	var manual=not pin.is_empty()
	if not manual and not manual_only:pin=describe(game.session).pin
	if pin.is_empty() or not valid_pin(pin,game.data):return {}
	var result={"id":pin.id,"kind":pin.kind,"manual":manual,"name":"","items":[],"reason":"","station":""}
	var cost={}
	if pin.kind=="build":
		result.name=game.data.BUILD_PIECES[pin.id].name
		cost=game.data.BUILD_PIECES[pin.id].cost
		if not game.building.unlocked(pin.id):result.reason="Blueprint not yet unlocked."
	else:
		for recipe in game.data.RECIPES:
			if recipe.id!=pin.id:continue
			result.name=recipe.name;cost=recipe.inputs;result.station=recipe.station
			if not game.session.has_station(recipe.station):result.reason="Build a working "+recipe.station+"."
			elif not game.session.station_powered(recipe.station):result.reason="Power the "+recipe.station+"."
			elif game.session.can_pay(cost):
				# Trial only cloned bags: inputs may free a slot for the output.
				var bags=[]
				for source in game.session.containers():
					var bag=MMFInventory.new(game.data.ITEMS,source.slots.size());bag.slots=source.slots.duplicate(true);bags.append(bag)
				for item in cost:
					var left=int(cost[item])
					for bag in bags:left-=bag.remove(item,left)
				var remaining=int(recipe.output.count)
				for bag in bags:remaining=bag.add(recipe.output.itemId,remaining)
				if remaining>0:result.reason="Make storage room for the output."
	for item in cost:
		result.items.append({"id":item,"name":game.data.ITEMS[item].name,"owned":game.session.count_resource(item),"needed":int(cost[item])})
	return result

func checklist_text(manual_only: bool=false) -> String:
	var list=checklist(manual_only)
	if list.is_empty():return ""
	var lines=[("PINNED · " if list.manual else "NEED · ")+list.name]
	for item in list.items:lines.append("%s %d / %d"%[item.name,item.owned,item.needed])
	if list.reason!="":lines.append(list.reason)
	elif list.station!="":lines.append("At the "+list.station)
	return "\n".join(lines)

func target() -> Dictionary:
	var t=current_task()
	if t.target_kind=="berth" and is_instance_valid(game.finale.berth):
		for p in game.finale.berth.points:
			if p.id==t.target_id:return {"position":game.finale.berth.to_global(p.at)+Vector3.UP,"label":p.title,"deck":0}
	if t.target_kind=="mission" and game.missions.site_view():
		var view=game.missions.site_view()
		if t.target_id=="coupling" and is_instance_valid(view.coupling):return {"position":view.coupling.global_position,"label":"COURIER COUPLING / SALVAGE HOOK","deck":0}
		for p in game.opportunities.points:
			if p.id==t.target_id:return {"position":view.site.to_global(p.at),"label":view.point_text(p.id),"deck":0}
	var pin=checklist(true)
	if not pin.is_empty() and pin.station!="":t.target_kind="piece";t.target_id=pin.station
	if t.target_kind=="engineering":return {"position":game.engineering.nearest_anchor(),"label":"ENGINEERING / SERVICE","deck":-1}
	if t.target_kind=="receiver" and game.session.facts.salvage:return {"position":game.world.receiver.global_position,"label":"RECEIVER","deck":0}
	if t.target_kind=="helm":return {"position":game.world.helm_model.root.global_position,"label":"NAVIGATION HELM","deck":0}
	if t.target_kind=="piece":
		var found={};var best=INF
		for p in game.session.structures:
			if p.definitionId!=t.target_id or p.health<=0:continue
			var at=game.building.piece_transform(p).origin
			var score=at.distance_to(game.player.position)+(0 if int(p.cell.y)==game.building.current_level() else 100)
			if score<best:best=score;found={"position":at,"label":game.data.BUILD_PIECES[p.definitionId].name.to_upper(),"deck":int(p.cell.y)}
		return found
	if t.target_kind=="expedition" and game.activity.has_method("describe_step"):
		var step=game.activity.describe_step()
		if step.get("target") is Vector3:return {"position":step.target,"label":step.get("label","SITE CONTROL"),"deck":0}
	return {}

func update(dt: float):
	var visible_now=game.started and not game.menu_open and game.cinematic=="" and game.session.health>0 and game.building.selected=="" and game.manual_turret=="" and game.terminal_pages.locate_left<=0 and not game.combat.active_threat() and not Input.is_action_pressed("aim") and game.settings.get("objective_markers",false)
	if marker:marker.visible=visible_now and not marker.text.is_empty()
	if not visible_now:return
	if marker:fit_marker()
	refresh_left-=dt
	if refresh_left>0:return
	refresh_left=.2
	var current=current_task()
	if current.id!=last_task:
		last_task=current.id
		if game.has_method("record_event"):game.record_event("guidance","objective_changed",{"id":current.id})
	if not marker:
		marker=Label3D.new();marker.name="ObjectiveMarker";marker.billboard=BaseMaterial3D.BILLBOARD_ENABLED;marker.font_size=30;marker.pixel_size=.004;marker.modulate=Color(.6,1,.85);marker.no_depth_test=false;marker.outline_size=8;game.add_child(marker)
	var destination=target()
	marker.text="";marker.hide()
	if destination.is_empty():return
	# A location label is not a path claim. Different floors remain explicit;
	# never project an arrow through a ceiling or across unsupported sand.
	marker.global_position=destination.position+Vector3.UP*1.7
	marker.text="◇ "+destination.label+"\nDECK %d · %d m"%[destination.deck+3,game.player.position.distance_to(destination.position)]
	if destination.deck!=game.building.current_level():marker.text+="\nUse a stairway to this deck"
	marker.show()
	fit_marker()

func fit_marker():
	var camera=game.get_viewport().get_camera_3d()
	if not camera or marker.text.is_empty():marker.hide();return
	var local=camera.to_local(marker.global_position)
	# Cap near-camera label size and keep it outside the HUD/prompt margins.
	marker.scale=Vector3.ONE*minf(1,maxf(.01,-local.z)/9.0)
	var size=game.get_viewport().get_visible_rect().size
	var margin=Vector2(minf(240,size.x*.17),minf(200,size.y*.22))
	var usable=Rect2(margin,size-margin*2)
	marker.visible=local.z<-.8 and usable.has_point(camera.unproject_position(marker.global_position))
