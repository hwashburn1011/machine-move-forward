class_name MMFTerminalPages
extends RefCounted

var game
var category="all"
var catalog_selected=""
var catalog_scroll=0
const CATALOG_PAGE_SIZE=18
var catalog_page=0
var deck=0
var selected=""
var locate_left=0.0
var marker: Label3D
var catalog_undo_button: Button
var undo_check_left=0.0

func catalog_ids() -> Array:
	var ids=[]
	for id in game.data.BUILD_PIECE_ORDER:
		if id in MMFNativeProgression.MODULES and id not in game.session.expedition_gear.recovered:continue
		if category=="favorites" and id not in game.session.polish.favorites: continue
		if category not in ["all","favorites"] and game.data.BUILD_PIECES[id].category!=category: continue
		ids.append(id)
	return ids

func favorite(id: String):
	if not game.data.BUILD_PIECES.has(id): return
	if id in game.session.polish.favorites: game.session.polish.favorites.erase(id)
	else: game.session.polish.favorites.append(id)

func turn_catalog_page(ui, direction: int):
	catalog_page+=direction;catalog_scroll=0;ui.refresh()
	# Keep repeated keyboard paging on the pager, including at either end.
	var fallback: Button
	for button in ui.content.find_children("*","Button",true,false):
		if not button.has_meta("catalog_page_delta") or button.disabled:continue
		fallback=button
		if int(button.get_meta("catalog_page_delta"))==direction:
			ui.preferred_focus=button;return
	if fallback:ui.preferred_focus=fallback

func catalog(ui):
	ui.section("PARTS","DECK %d"%(game.building.current_level()+3))
	ui.text_line("Select a part, then PLACE to aim in the world. [{key:build}] exits placement; [{key:catalog}] changes parts.")
	var undo=game.building.undo_status()
	var undo_button=ui.button(game.hint("[{key:build_undo}] UNDO LAST BUILD"),func():game.building.undo_last();ui.refresh(),undo.allowed)
	catalog_undo_button=undo_button;undo_check_left=.1
	undo_button.tooltip_text=undo.reason
	var filters=HBoxContainer.new();ui.content.add_child(filters)
	for name in ["all","structure","station","decor","favorites"]:
		var labels={"all":"ALL","structure":"HULL","station":"UNITS","decor":"DECOR","favorites":"SAVED"}
		var b=Button.new();b.text=labels[name];b.toggle_mode=true;b.button_pressed=category==name
		b.pressed.connect(func():category=name;catalog_scroll=0;catalog_page=0;ui.refresh());filters.add_child(b)
	var ids=catalog_ids()
	if catalog_selected not in ids: catalog_selected=""
	# Keep construction responsive: only instantiate the visible catalog page.
	# Selection/details survive page changes; filters still cover the full catalog.
	var page_count=maxi(1,ceili(float(ids.size())/CATALOG_PAGE_SIZE))
	catalog_page=clampi(catalog_page,0,page_count-1)
	var pager=HBoxContainer.new();ui.content.add_child(pager)
	var prior=ui.button("PREVIOUS PARTS",func():turn_catalog_page(ui,-1),catalog_page>0)
	prior.reparent(pager);prior.set_meta("catalog_page_delta",-1)
	prior.autowrap_mode=TextServer.AUTOWRAP_OFF;prior.custom_minimum_size=Vector2(170,40)
	var page_label=Label.new();page_label.text="  %d / %d  ·  %d parts  "%[catalog_page+1,page_count,ids.size()];pager.add_child(page_label)
	page_label.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
	var following=ui.button("NEXT PARTS",func():turn_catalog_page(ui,1),catalog_page+1<page_count)
	following.reparent(pager);following.set_meta("catalog_page_delta",1)
	following.autowrap_mode=TextServer.AUTOWRAP_OFF;following.custom_minimum_size=Vector2(140,40)
	var visible_ids=ids.slice(catalog_page*CATALOG_PAGE_SIZE,(catalog_page+1)*CATALOG_PAGE_SIZE)
	var original=ui.content
	var columns=HBoxContainer.new();columns.add_theme_constant_override("separation",28)
	columns.custom_minimum_size.y=maxf(280,ui.scroller.size.y-145);original.add_child(columns)
	var scroll=ScrollContainer.new();scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;scroll.follow_focus=true
	scroll.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.size_flags_stretch_ratio=1.4;columns.add_child(scroll)
	var list=VBoxContainer.new();list.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(list)
	ui.content=list
	for id in visible_ids:
		var def=game.data.BUILD_PIECES[id]
		var b=ui.compact_row(def.name,"LOCKED" if not game.building.unlocked(id) else "",func():catalog_selected=id;ui.refresh(),catalog_selected==id)
		b.set_meta("catalog_part",id)
		if catalog_selected==id:ui.preferred_focus=b
	scroll.get_v_scroll_bar().value_changed.connect(func(value):catalog_scroll=int(value))
	scroll.set_deferred("scroll_vertical",catalog_scroll)
	var details=VBoxContainer.new();details.size_flags_horizontal=Control.SIZE_EXPAND_FILL;details.add_theme_constant_override("separation",14);columns.add_child(details)
	ui.content=details
	if catalog_selected!="":
		var id=catalog_selected
		var def=game.data.BUILD_PIECES[id]
		var available=game.building.unlocked(id)
		ui.section(def.name,"READY" if available else "LOCKED")
		if def.get("description","")!="": ui.text_line(def.description)
		var installation=MMFMachineSpaces.bay_note(id)
		if installation!="":ui.text_line("CONNECTION / "+installation)
		for item in def.cost:ui.text_line("%s: %d / %d"%[game.data.ITEMS[item].name,game.session.count_resource(item),def.cost[item]])
		ui.button("UNPIN MATERIALS" if game.guidance.is_pinned("build",id) else "PIN MATERIALS",func():game.guidance.toggle_pin("build",id);ui.refresh())
		if not available:
			var requirements={"collector-auto":"Salvage controller","turret-auto":"Tracking servo","seed-garden":"Human seed bank","caretaker-dock":"Recover L-12","turret-manual":"Deck gun blueprint"}
			ui.text_line("Requires: "+requirements.get(id,"Blueprint"))
		var actions=HBoxContainer.new();ui.content.add_child(actions)
		var place=ui.button("PLACE",func():game.close_menu();game.building.choose(id),available and game.session.can_pay(def.cost))
		place.set_meta("terminal_action","place:"+id)
		place.reparent(actions);place.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		var save=ui.button("★ SAVED" if id in game.session.polish.favorites else "☆ SAVE",func():favorite(id);ui.refresh())
		save.reparent(actions);save.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	elif ids.is_empty(): ui.text_line("No saved parts." if category=="favorites" else "No parts.")
	else: ui.text_line("Choose a part.")
	ui.content=original

func update_catalog(dt: float):
	if not game.menu_open or game.ui.page!="Build" or not is_instance_valid(catalog_undo_button):return
	undo_check_left-=dt
	if undo_check_left>0:return
	undo_check_left=.1
	var status=game.building.undo_status()
	if catalog_undo_button.disabled==not status.allowed and catalog_undo_button.tooltip_text==status.reason:return
	catalog_undo_button.disabled=not status.allowed;catalog_undo_button.tooltip_text=status.reason
	game.ui.terminal.redraw()

func schematic(ui):
	ui.section("DECK","%d"%(deck+3))
	var tabs=HBoxContainer.new();ui.content.add_child(tabs)
	for i in [0,-1,-2]:
		var b=Button.new();b.text=["LOWER","SERVICE","TOP"][i+2];b.toggle_mode=true;b.button_pressed=deck==i
		b.pressed.connect(func():deck=i;selected="";ui.refresh());tabs.add_child(b)
	var map=MMFDeckMap.new();map.game=game;map.level=deck;map.selected=selected;map.select=func(id):selected=id;ui.refresh()
	ui.content.add_child(map)
	var p=game.session.find_piece(selected)
	if not p.is_empty():
		var def=game.data.BUILD_PIECES[p.definitionId]
		ui.section(def.name,"POWER OK" if game.session.powered.get(p.instanceId,true) else "NO POWER")
		ui.meter_row("CONDITION",100.0*p.health/def.maxHealth,100,"%")
		ui.text_line("DECK %d · GRID %d, %d"%[int(p.cell.y)+3,p.cell.x,p.cell.z])
		var actions=HBoxContainer.new();ui.content.add_child(actions)
		var service=ui.button("SERVICE",func():game.service_piece(p))
		service.reparent(actions);service.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		var repair_cost=maxi(1,int(ceil(def.cost.get("scrap",0)*(1-p.health/def.maxHealth)*.2)))
		var repair=ui.button("REPAIR · %d scrap"%repair_cost,func():game.session.repair(p.instanceId);game.session.update_power();ui.refresh(),p.health<def.maxHealth and game.session.can_pay({"scrap":repair_cost}))
		repair.reparent(actions);repair.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		var locator=ui.button("LOCATE",func():locate(p.instanceId))
		locator.reparent(actions);locator.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	else: ui.text_line("Select a unit.")
	# Accessible list also covers small/overlapping map markers.
	ui.section("UNITS")
	for piece in game.session.structures:
		if piece.cell.y==deck and piece.definitionId not in ["floor","wall","railing"]:
			ui.compact_row(game.data.BUILD_PIECES[piece.definitionId].name,"",func():selected=piece.instanceId;ui.refresh(),selected==piece.instanceId)

func locate(id: String):
	selected=id;locate_left=15
	if not marker:
		marker=Label3D.new();marker.billboard=BaseMaterial3D.BILLBOARD_ENABLED;marker.font_size=32;marker.pixel_size=.009;marker.modulate=Color(.15,1,.85);game.world.add_child(marker)
	game.close_menu()
	update(0)

func update(dt: float):
	locate_left=maxf(0,locate_left-dt)
	if not marker: return
	var p=game.session.find_piece(selected)
	marker.visible=locate_left>0 and not p.is_empty() and game.cinematic==""
	if marker.visible:
		marker.position=game.building.piece_transform(p).origin+Vector3.UP*1.7
		marker.text=game.data.BUILD_PIECES[p.definitionId].name+"\nDECK %d / %dm"%[int(p.cell.y)+3,game.player.position.distance_to(marker.position)]

func comparisons(ui,def: Dictionary):
	var fitted=game.session.research.active.get(def.branch,"")
	var current=game.data.UPGRADES[fitted].modifiers if fitted!="" else {}
	var fields=current.keys()
	for key in def.modifiers:
		if key not in fields: fields.append(key)
	var changes=[]
	for key in fields:
		var baseline=1.0 if key.ends_with("Multiplier") else 0.0
		var label=key.replace("Multiplier","").capitalize()
		changes.append("%s %.2f → %.2f%s"%[label,current.get(key,baseline),def.modifiers.get(key,baseline),"×" if baseline==1 else ""])
	ui.text_line("FITTED: "+(game.data.UPGRADES[fitted].name if fitted!="" else "Standard"))
	for change in changes:ui.text_line(change)

func attachment_comparison(ui,id: String):
	var notes={"":"Standard weapon configuration","rifle-stabilizer":"Spread ×0.55 / recoil ×0.65 / reload time ×1.15","rifle-burst-cam":"Three-shot bursts / cyclic fire rate 12 shots per second","shotgun-choke":"Spread ×0.60 / range ×1.35 / falloff start ×1.25 / fire rate ×0.80","shotgun-scatter-brake":"Spread ×1.20 / range ×0.75 / falloff start ×0.80 / fire rate ×1.25"}
	var weapon=game.data.WEAPON_ATTACHMENTS[id].weaponId
	var current=game.session.weapons[weapon].attachment
	ui.text_line("CURRENT: "+notes.get(current,"Standard")+"\nCANDIDATE: "+notes[id])

func records(ui):
	ui.section("CURRENT COURSE")
	ui.text_line(game.guidance.current_task().text)
	var supplies=game.guidance.checklist_text()
	if supplies!="":ui.text_line(supplies)
	ui.compact_row("Machine spaces","READ",func():ui.show_record("MACHINE SPACES","All three decks accept ordinary furniture and workstations. You can place multiple workbenches, storage units and generators. Keep the stairs, controls and working aisles clear.\n\nRecovered quiet-drive: lower deck drive connection.\nRecovered battery bank: middle deck power connection.\nRecovered freight crane: upper starboard connection.\n\nSelecting one of these major modules guides it to its connection. Existing installations remain where you built them. Drone docks need clear air above them, including room for the returning cargo."))
	ui.section("YOUR JOURNEY")
	ui.compact_row("Story so far","READ",func():ui.show_record("STORY SO FAR",MMFNarrativeProgress.recap(game.session)))
	ui.compact_row("Optional requests","READ",func():ui.show_record("OPTIONAL REQUESTS",MMFMissions.summary(game.session)))
	ui.section("RECORDS",str(game.session.story.journals.size()))
	for expedition in game.data.STORY_EXPEDITIONS:
		for journal in expedition.journals:
			if journal.id in game.session.story.journals:
				ui.compact_row(journal.title,"",func():ui.show_record(journal.title,journal.text))
	if game.session.story.journals.is_empty(): ui.text_line("No recovered records.")
	if not game.session.story.uniques.is_empty():
		ui.section("RECOVERED",str(game.session.story.uniques.size()))
		for id in game.session.story.uniques:
			var title=id.replace("-"," ").capitalize()
			ui.compact_row(title,"✓",func():ui.show_record(title,game.journey.reward_text(id)))
	ui.section("TRANSMISSIONS",str(game.session.polish.log.size()))
	if game.session.polish.log.is_empty(): ui.text_line("No transmissions.")
	for index in range(game.session.polish.log.size()-1,-1,-1):
		var entry=game.session.polish.log[index]
		var title="%s · %02d"%[entry.speaker,index+1]
		ui.compact_row(entry.speaker,"%02d"%(index+1),func():ui.show_record(title,entry.text))
	var receipts=game.session.polish.get("receipts",[])
	ui.section("LOCAL ACTIVITY",str(receipts.size()))
	if receipts.is_empty():ui.text_line("No local activity recorded.")
	for index in range(receipts.size()-1,-1,-1):
		var entry=receipts[index]
		var stamp="%02d:%02d"%[int(entry.at)/60,int(entry.at)%60]
		ui.compact_row(game.hint(entry.text).replace("\n"," "),stamp,func():ui.show_record("LOCAL ACTIVITY / "+stamp,entry.text))
