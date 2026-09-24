class_name MMFUI
extends CanvasLayer

var game
var root: Control
var panel: PanelContainer
var content: VBoxContainer
var tabs: HBoxContainer
var hud: Label
var objective: Label
var prompt: Label
var toast: Label
var crosshair: Label
var caption: Label
var page=""
var toast_time=0.0
var refresh_time=0.0
var storage_id=""
var record_title=""
var record_text=""
var binding_action=""
var binding_buttons={}
var binding_status: Label
var return_button: Button
var toast_source=""
var damage_overlay: ColorRect
var live_status: Label
var transmission: Label
var boarding: Label
var hit_readout: Label
var hit_left=0.0
var salvage_readout: MMFSalvageReadout

func setup(owner_game):
	game=owner_game
	process_mode=Node.PROCESS_MODE_ALWAYS
	root=Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter=Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme=Theme.new()
	theme.default_font_size=19
	var font=SystemFont.new()
	font.font_names=["Consolas","DejaVu Sans Mono"]
	theme.default_font=font
	var normal=StyleBoxFlat.new()
	normal.bg_color=Color(0.035,0.075,0.075,0.94)
	normal.border_color=Color(0.23,0.47,0.45)
	normal.set_border_width_all(1)
	normal.content_margin_left=14
	normal.content_margin_right=14
	normal.content_margin_top=10
	normal.content_margin_bottom=10
	theme.set_stylebox("normal","Button",normal)
	var hover=normal.duplicate()
	hover.bg_color=Color(0.11,0.26,0.23)
	theme.set_stylebox("hover","Button",hover)
	theme.set_stylebox("focus","Button",hover)
	theme.set_color("font_color","Label",Color(0.76,0.86,0.77))
	theme.set_color("font_color","Button",Color(0.78,0.86,0.78))
	root.theme=theme
	damage_overlay=ColorRect.new();damage_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);damage_overlay.mouse_filter=Control.MOUSE_FILTER_IGNORE;root.add_child(damage_overlay)
	hud=overlay(Vector2(28,25),Vector2(360,170),18)
	objective=overlay(Vector2(1470,30),Vector2(420,170),20)
	prompt=overlay(Vector2(550,850),Vector2(820,80),20)
	prompt.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	toast=overlay(Vector2(400,760),Vector2(1120,70),20)
	toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	crosshair=overlay(Vector2(950,526),Vector2(30,30),24)
	crosshair.text="+"
	caption=overlay(Vector2(320,945),Vector2(1280,75),24)
	caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	transmission=overlay(Vector2(400,655),Vector2(1120,100),21)
	transmission.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	transmission.add_theme_color_override("font_color",Color(.45,.95,.88))
	var radio_plate=StyleBoxFlat.new();radio_plate.bg_color=Color(.015,.035,.035,.9);radio_plate.set_content_margin_all(12)
	transmission.add_theme_stylebox_override("normal",radio_plate)
	boarding=overlay(Vector2(500,170),Vector2(920,60),21);boarding.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	boarding.add_theme_color_override("font_color",Color(1,.57,.23))
	hit_readout=overlay(Vector2(815,575),Vector2(290,40),18);hit_readout.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	salvage_readout=MMFSalvageReadout.new();root.add_child(salvage_readout);salvage_readout.setup(game)
	panel=PanelContainer.new()
	var background=normal.duplicate()
	background.bg_color=Color(0.014,0.03,0.031,0.985)
	background.set_content_margin_all(26)
	background.border_color=Color(0.56,0.41,0.2)
	panel.add_theme_stylebox_override("panel",background)
	root.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left=90;panel.offset_right=-90;panel.offset_top=70;panel.offset_bottom=-70
	var outer=VBoxContainer.new()
	outer.add_theme_constant_override("separation",18)
	panel.add_child(outer)
	var title=Label.new()
	title.text="S–07   /   LINEKEEPER TERMINAL\nNOMAD // ENCRYPTED SYSTEM LINK   ━━━━━━━━━━━━━━━━━━━━"
	title.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_color_override("font_color",Color(0.98,0.66,0.27))
	title.add_theme_font_size_override("font_size",24)
	outer.add_child(title)
	tabs=HBoxContainer.new()
	outer.add_child(tabs)
	for title_text in ["Inventory","Build","Workshop","Machine","Signal","Records","Settings"]:
		var button=Button.new()
		button.text=title_text
		button.pressed.connect(func():game.open_menu(title_text))
		tabs.add_child(button)
	var scroller=ScrollContainer.new()
	scroller.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	scroller.size_flags_vertical=Control.SIZE_EXPAND_FILL
	scroller.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	outer.add_child(scroller)
	content=VBoxContainer.new()
	content.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation",12)
	scroller.add_child(content)
	binding_status=Label.new();binding_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	binding_status.add_theme_color_override("font_color",Color(.98,.66,.27))
	outer.add_child(binding_status)
	return_button=Button.new()
	return_button.pressed.connect(func():
		if game.started: game.close_menu()
		else: game.open_menu("Title"))
	outer.add_child(return_button)
	refresh_control_labels()
	panel.hide()
	root.resized.connect(reflow)
	reflow.call_deferred()
	game.session.notice.connect(notify)

func reflow():
	var s=root.size
	objective.position=Vector2(s.x-450,30)
	crosshair.position=s*.5-Vector2(10,14)
	prompt.position=Vector2((s.x-820)*.5,s.y-160)
	toast.position=Vector2((s.x-1120)*.5,s.y-310)
	caption.position=Vector2((s.x-1280)*.5,s.y-135)
	transmission.position=Vector2((s.x-1120)*.5,s.y-425)
	boarding.position=Vector2((s.x-920)*.5,170)
	hit_readout.position=s*.5+Vector2(-145,40)

func overlay(at: Vector2,dimensions: Vector2,font_size: int) -> Label:
	var label=Label.new()
	label.position=at
	label.size=dimensions
	label.add_theme_font_size_override("font_size",font_size)
	label.add_theme_color_override("font_shadow_color",Color.BLACK)
	label.add_theme_constant_override("shadow_offset_x",1)
	label.add_theme_constant_override("shadow_offset_y",2)
	label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	root.add_child(label)
	return label

func notify(message: String):
	toast_source=message
	toast.text=game.hint(message)
	toast_time=6

func combat_hit(kind: String):
	hit_left=.55
	hit_readout.text=kind
	hit_readout.modulate=Color(.4,1,.75) if kind=="EXPOSED HIT" else Color(1,.72,.38)

func text_line(message: String,big: bool=false):
	var label=Label.new()
	label.text=game.hint(message)
	label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	if big:
		label.add_theme_font_size_override("font_size",25)
		label.add_theme_color_override("font_color",Color(0.97,0.68,0.32))
	content.add_child(label)
	return label

func button(label: String,action: Callable,enabled: bool=true):
	var b=Button.new()
	b.text=label
	b.alignment=HORIZONTAL_ALIGNMENT_LEFT
	b.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	b.disabled=not enabled
	b.pressed.connect(action)
	content.add_child(b)
	return b

func costs(cost: Dictionary) -> String:
	var items=[]
	for id in cost: items.append("%d %s"%[cost[id],id])
	return ", ".join(items)

func open(which: String):
	cancel_binding()
	page=which
	panel.show()
	refresh()

func refresh():
	cancel_binding()
	binding_buttons.clear()
	binding_status.visible=page=="Settings"
	refresh_control_labels()
	live_status=null
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()
	tabs.visible=page not in ["Title","Pause","Library","Record","Departure"]
	var s=game.session
	match page:
		"Departure":
			text_line("PREPARING DEPARTURE",true)
			text_line("Loading the opening scene…")
		"Title":
			text_line("MACHINE MOVE FORWARD",true)
			text_line("Carry the names. Keep the machine moving.\nNative Godot development build")
			button("CONTINUE",func():game.load_game("autosave"),not MMFSaves.read("autosave").is_empty())
			button("NEW CAMPAIGN",func():game.new_game())
			button("CAMPAIGN LIBRARY",func():game.open_menu("Library"))
			button("SETTINGS",func():game.open_menu("Settings"))
			button("QUIT",func():game.get_tree().quit())
		"Pause":
			text_line("CONNECTION HELD",true)
			button("RESUME",game.close_menu)
			button("SAVE CAMPAIGN",func():game.save_game("manual"))
			button("CAMPAIGN LIBRARY",func():game.open_menu("Library"))
			button("SETTINGS",func():game.open_menu("Settings"))
			button("QUIT TO TITLE",func():game.open_menu("Title"))
		"Library":
			text_line("CAMPAIGN LIBRARY",true)
			for entry in MMFSaves.list_saves():
				button(entry.id+"    "+entry.date,func():game.load_game(entry.id))
			button("CREATE NAMED CHECKPOINT",func():game.save_game("checkpoint-"+str(int(Time.get_unix_time_from_system())));refresh())
			button("OPEN SAVE FOLDER",func():OS.shell_open(ProjectSettings.globalize_path(MMFSaves.DIRECTORY)))
			button("EXPORT JSON…",func():file_dialog(false))
			button("IMPORT NATIVE CAMPAIGN JSON…",func():file_dialog(true))
		"Inventory":
			text_line("PACK / %d SLOTS" % s.inventory.slots.size(),true)
			button("SORT INVENTORY",func():s.inventory.sort_slots();refresh())
			for slot in s.inventory.slots:
				if slot==null: continue
				var id=slot.itemId
				button("%s × %d   %s" %[game.data.ITEMS[id].name,slot.count,game.data.ITEMS[id].description],func():s.use_item(id);refresh())
			text_line("ONBOARD STORAGE",true)
			for id in s.stores:
				button(id+"  [OPEN]",func():storage_id=id;game.open_menu("Storage"))
		"Storage": storage_page()
		"Shelf":
			text_line("ABOARD THE NOMAD / KEEPSAKE DISPLAY",true)
			var shelf=s.find_piece(storage_id)
			if not shelf.is_empty():
				button("CLEAR DISPLAY",func():game.home.set_keepsake(shelf,"");refresh())
				for id in s.story.uniques:
					if game.data.KEEPSAKE_DETAILS.has(id):
						var details=game.data.KEEPSAKE_DETAILS[id]
						button(details.title,func():game.home.set_keepsake(shelf,id,true);show_record(details.title,details.text))
				for expedition in game.data.STORY_EXPEDITIONS:
					for journal in expedition.journals:
						if journal.id in s.story.journals: button(journal.title,func():game.home.set_keepsake(shelf,journal.id,true);show_record(journal.title,journal.text))
		"Build": game.terminal_pages.catalog(self)
		"Console": game.activity.render(self)
		"Workshop":
			text_line("FABRICATION",true)
			for recipe in game.data.RECIPES:
				button("%s   ← %s   [%s]" %[recipe.name,costs(recipe.inputs),recipe.station],func():s.craft(recipe.id);refresh(),s.has_station(recipe.station))
			text_line("MACHINE RESEARCH",true)
			var refusal=game.research_refusal()
			if refusal!="": text_line(refusal)
			for id in game.data.UPGRADES:
				var def=game.data.UPGRADES[id]
				game.terminal_pages.comparisons(self,def)
				if s.research.active.get(def.branch,"")==id:
					button("REMOVE "+def.name,func():game.research_action("remove",def.branch);refresh(),game.research_refusal(true)=="")
				elif id in s.research.completed:
					button("FIT "+def.name,func():game.research_action("fit",id);refresh(),refusal=="")
				else:
					button("RESEARCH "+def.name+"  "+costs(def.researchCost),func():game.research_action("research",id);refresh(),refusal=="" and s.can_pay(def.researchCost))
			text_line("WEAPON WORKBENCH",true)
			var attachment_refusal=game.attachment_refusal()
			if attachment_refusal!="": text_line(attachment_refusal)
			for id in game.data.WEAPON_ATTACHMENTS:
				var def=game.data.WEAPON_ATTACHMENTS[id]
				game.terminal_pages.attachment_comparison(self,id)
				if s.weapons[def.weaponId].attachment==id:
					button("REMOVE "+def.name,func():game.remove_attachment(def.weaponId);refresh(),attachment_refusal=="")
				else:
					var known=id in s.attachment_research
					button(("FIT " if known else "RESEARCH & FIT ")+def.name+("" if known else "  "+costs(def.cost)),func():game.fit_attachment(id);refresh(),attachment_refusal=="" and (known or s.can_pay(def.cost)))
		"Machine": machine_page()
		"Signal","Helm": navigation_page()
		"Records":
			game.terminal_pages.records(self)
			text_line("RECOVERED RECORDS",true)
			for expedition in game.data.STORY_EXPEDITIONS:
				for journal in expedition.journals:
					if journal.id in s.story.journals: button(journal.title,func():show_record(journal.title,journal.text))
			text_line("COMPONENTS: "+", ".join(s.story.uniques))
		"Record":
			text_line(record_title,true)
			text_line(record_text)
		"Settings": settings_page()

func storage_page():
	if not game.session.stores.has(storage_id): return
	var bag=game.session.stores[storage_id]
	var pack=game.session.inventory
	text_line("STORAGE / "+storage_id,true)
	button("TAKE ALL",func():bag.transfer_to(pack);refresh())
	button("DEPOSIT MATCHING",func():pack.transfer_to(bag,true);refresh())
	button("SORT",func():bag.sort_slots();refresh())
	for slot in bag.slots:
		if slot==null: continue
		var id=slot.itemId
		button("TAKE %s × %d" %[id,slot.count],func():var count=mini(bag.count_item(id),pack.room_for(id));bag.remove(id,count);pack.add(id,count);refresh())
	text_line("YOUR PACK")
	for slot in pack.slots:
		if slot==null: continue
		var id=slot.itemId
		button("STORE %s × %d" %[id,slot.count],func():var count=mini(pack.count_item(id),bag.room_for(id));pack.remove(id,count);bag.add(id,count);refresh())

func machine_page():
	var s=game.session
	text_line("IRON NOMAD / SERVICE LINK",true)
	live_status=text_line("Fuel %d%%   Power %d / %d   Speed %.1f m/s" %[s.fuel,s.demand,s.capacity,s.speed])
	text_line("Refuel physically at the generator. Use the helm for course changes.")
	game.terminal_pages.schematic(self)
	for id in s.subsystems: button("REPAIR %s    %d%%" %[id,100*s.subsystems[id]/game.data.SUBSYSTEMS[id].maxHealth],func():s.repair(id);refresh())
	if s.caretaker.recovered:
		text_line("L–12 / "+game.caretaker.status,true)
		for mode in ["companion","steward"]: button("L–12: "+mode,func():s.caretaker.mode=mode;refresh())
		for priority in ["auto","gardens","outputs"]: button("Work priority: "+priority,func():s.caretaker.priority=priority;refresh())

func navigation_page():
	var s=game.session
	text_line("SIGNAL / NAVIGATION",true)
	text_line(game.journey.brief())
	live_status=text_line(s.objective())
	var contact=s.contacts.active
	if not contact.is_empty():
		text_line("OPTIONAL: "+game.data.OPPORTUNITIES[contact.kind].title,true)
		var preview=game.opportunities.preview()
		text_line("%dm · bearing %.0f° · estimated fuel %d" %[preview.remaining,preview.bearing,preview.fuel])
		if contact.state=="detected": button("INTERCEPT OPTIONAL SIGNAL",func():game.opportunities.commit(),preview.reachable)
		if contact.state in ["docked","visited"]:
			button("LEAVE OPTIONAL SITE",func():game.opportunities.depart())
			if contact.kind=="salvage-wreck" and contact.salvageMode=="":
				button("SECURE CACHE · 24 scrap / 2 components",func():game.opportunities.choose_salvage("secure"))
				button("BROADCAST OVERRIDE · defend against a skiff for 48 scrap / 6 components",func():game.opportunities.choose_salvage("broadcast"),game.aboard())
	if s.scanner.phase=="awaiting-module": button("INSTALL REPLACEMENT MODULE",func():s.install_scanner();refresh())
	if s.scanner.phase=="installed": button("START RECEIVER SCAN",func():
		if s.start_scan(game.aboard()): game.close_menu()
		else: refresh())
	if s.scanner.phase=="scanning": text_line("Signal coherence: %d%%" % (s.scanner.elapsedS/1.8))
	if s.story.phase=="route-selection":
		text_line(game.campaign.expedition().title,true)
		if game.campaign.routes().is_empty(): button("TRACE SIGNAL / COMMIT COURSE",func():game.campaign.begin_route())
		for route in game.campaign.routes(): button("%s · %dm · %s" %[route.id,route.distanceM,"quiet approach" if route.scriptedVehicle==null else route.scriptedVehicle+" patrol"],func():game.campaign.begin_route(route.id))
	if s.story.phase=="docked": button("DEPART / RETRACT GANGWAY",func():game.campaign.depart())
	if s.story.phase=="ending-ready":
		text_line("The Meridian solution is complete. Preserve a checkpoint and commit to the refuge bearing.")
		button("REVIEW FINAL BEARING",func():page="Record";record_title="CONFIRM MERIDIAN COURSE";record_text="A checkpoint will be preserved. The Nomad will follow the final bearing.";refresh();button("COMMIT TO THE MERIDIAN",func():game.campaign.begin_ending()))
	if page=="Helm" and s.navigation_limit()>0:
		text_line("HEADING %.0f° / LIMIT ±%.0f°" %[s.target_course,s.navigation_limit()])
		var slider=HSlider.new()
		slider.min_value=-s.navigation_limit()
		slider.max_value=s.navigation_limit()
		slider.value=s.target_course
		slider.value_changed.connect(func(value):s.target_course=value)
		content.add_child(slider)

func settings_page():
	text_line("SYSTEM PREFERENCES",true)
	var reminders=CheckButton.new();reminders.text="Optional objective reminders during quiet travel";reminders.button_pressed=game.settings.get("objective_reminders",true)
	reminders.toggled.connect(func(value):game.settings.objective_reminders=value;game.save_settings());content.add_child(reminders)
	for entry in [["sensitivity",0.2,3,0.1],["fov",40,90,1],["volume",0,1,0.05],["ambient",0,0.5,0.025]]:
		text_line(entry[0].to_upper())
		var slider=HSlider.new()
		slider.min_value=entry[1]
		slider.max_value=entry[2]
		slider.step=entry[3]
		slider.value=game.settings[entry[0]]
		slider.value_changed.connect(func(value):game.settings[entry[0]]=value;game.save_settings())
		content.add_child(slider)
	var vsync=CheckButton.new()
	vsync.text="Vertical sync"
	vsync.button_pressed=game.settings.vsync
	vsync.toggled.connect(func(value):game.settings.vsync=value;game.save_settings())
	content.add_child(vsync)
	text_line("GRAPHICS / Full-resolution assets at every preset")
	for tier in ["low","medium","high"]: button(tier.to_upper()+(" ✓" if game.settings.get("quality","high")==tier else ""),func():game.settings.quality=tier;game.save_settings();refresh())
	text_line("KEY BINDINGS",true)
	text_line("Select a control to change it. Keys already in use swap places.\nMouse: LMB fires / places · RMB aims / cancels placement.")
	button("RESTORE ALL DEFAULT KEYS",func():
		cancel_binding();game.settings.bindings={};game.configure_input();game.save_settings()
		binding_status.text="All keyboard controls restored to defaults.")
	for action in game.key_defaults:
		var row=HBoxContainer.new();row.add_theme_constant_override("separation",12);content.add_child(row)
		var name_label=Label.new();name_label.text=MMFControls.NAMES[action];name_label.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		row.add_child(name_label)
		var key_button=Button.new();key_button.custom_minimum_size.x=240
		key_button.pressed.connect(func():begin_binding(action));row.add_child(key_button)
		var reset=Button.new();reset.text="Default";reset.pressed.connect(func():apply_binding(action,game.key_defaults[action]))
		row.add_child(reset)
		binding_buttons[action]={"key":key_button,"reset":reset}
	refresh_control_labels()

func refresh_control_labels():
	if is_instance_valid(return_button):
		return_button.text=game.hint("RETURN TO DECK     [{key:terminal} / {key:pause}]") if game.started else "RETURN TO TITLE"
	if is_instance_valid(toast): toast.text=game.hint(toast_source)
	for action in binding_buttons:
		var row=binding_buttons[action]
		if not is_instance_valid(row.key): continue
		row.key.text="PRESS KEY…" if binding_action==action else game.key_label(action)
		if action=="crouch" and not game.settings.bindings.has("crouch") and KEY_C not in game.settings.bindings.values(): row.key.text+=" / C"
		row.reset.disabled=not game.settings.bindings.has(action)
	if is_instance_valid(binding_status):
		binding_status.text=("Press a key for "+MMFControls.NAMES[binding_action]+". Escape cancels without changing controls.") if binding_action!="" else "Select a control, then press its new key. Escape cancels a pending change."

func begin_binding(action: String):
	if page!="Settings" or not game.menu_open or not game.key_defaults.has(action): return
	binding_action=action
	refresh_control_labels()

func cancel_binding():
	binding_action=""
	refresh_control_labels()

func apply_binding(action: String,code: int):
	var swapped=""
	for other in game.key_defaults:
		if other!=action and int(game.settings.bindings.get(other,game.key_defaults[other]))==code: swapped=other
	binding_action=""
	game.settings.bindings=MMFControls.rebind(game.settings.bindings,action,code)
	game.configure_input()
	game.save_settings()
	binding_status.text=MMFControls.NAMES[action]+" → "+game.key_label(action)
	if swapped!="": binding_status.text+="   /   "+MMFControls.NAMES[swapped]+" → "+game.key_label(swapped)

func _input(event):
	if binding_action=="" or not event is InputEventKey: return
	get_viewport().set_input_as_handled()
	if not event.pressed or event.echo: return
	if event.physical_keycode==KEY_ESCAPE or event.keycode==KEY_ESCAPE:
		cancel_binding();binding_status.text="Key change cancelled. Your controls are unchanged."
	elif MMFControls.valid_key(event.physical_keycode): apply_binding(binding_action,event.physical_keycode)

func show_record(title_text: String,message: String):
	record_title=title_text
	record_text=message
	game.open_menu("Record")

func file_dialog(importing: bool):
	var dialog=FileDialog.new()
	dialog.access=FileDialog.ACCESS_FILESYSTEM
	dialog.file_mode=FileDialog.FILE_MODE_OPEN_FILE if importing else FileDialog.FILE_MODE_SAVE_FILE
	dialog.filters=PackedStringArray(["*.json ; Native campaign"])
	dialog.current_file="nomad-campaign.json"
	root.add_child(dialog)
	dialog.file_selected.connect(func(path):
		if importing: game.load_payload(MMFSaves.decode(path))
		elif game.save_game("export"): DirAccess.copy_absolute(MMFSaves.DIRECTORY+"export.json",path)
		dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free)
	dialog.popup_centered(Vector2i(1000,650))

func _process(dt):
	if game==null: return
	var readable=game.started and not game.menu_open and game.cinematic=="" and game.session.health>0
	salvage_readout.update()
	transmission.visible=readable and not game.combat.active_threat() and not game.journey.current.is_empty()
	if transmission.visible: transmission.text=game.journey.current.speaker+"  //  "+game.hint(game.journey.current.text)
	boarding.visible=readable and game.combat.ship_state=="grapple" and is_instance_valid(game.combat.hook) and game.combat.hook_health>0
	if boarding.visible:
		var right=game.player.camera.global_basis.x.dot(game.combat.hook.global_position-game.player.camera.global_position)>0
		boarding.text=("▶ " if right else "◀ ")+("PORT SIDE" if game.combat.ship_side<0 else "STARBOARD SIDE")+"   —   TOP DECK GRAPPLE   /   Hold "+game.key_label("use")+" at hook to cut"
	if not game.menu_open: hit_left=maxf(0,hit_left-dt)
	hit_readout.visible=readable and hit_left>0
	damage_overlay.color=Color(0.8,0.02,0.0,game.effects.flash*0.8)
	toast_time=maxf(0,toast_time-dt)
	toast.visible=toast_time>0 and game.cinematic==""
	var s=game.session
	if is_instance_valid(live_status):
		if page in ["Signal","Helm"]: live_status.text=game.hint(s.objective())
		elif page=="Machine": live_status.text="Fuel %d%%   Power %d / %d   Speed %.1f m/s" %[s.fuel,s.demand,s.capacity,s.speed]
	hud.visible=game.cinematic=="" and not game.menu_open
	objective.visible=hud.visible
	crosshair.visible=hud.visible
	prompt.visible=hud.visible
	if not hud.visible: return
	hud.text="IRON NOMAD\n%.1f m/s · %dm\nFuel %d%% · Power %d/%d\nHealth %d · Water %d · Food %d\n%s %d / ∞" %[s.speed,s.distance,s.fuel,s.demand,s.capacity,s.health,s.hydration,s.nourishment,game.data.WEAPONS[s.current_weapon].name,s.weapons[s.current_weapon].ammoInMag]
	objective.text=game.hint(s.objective())
	if game.building.selected!="":
		prompt.text="BUILD "+game.data.BUILD_PIECES[game.building.selected].name+"  ·  "+game.building.failure+game.hint("\n[{key:fire}] Place   [{key:rotate_left} / {key:use}] Rotate   [{key:catalog}] Catalogue\n[{key:deck_up} / {key:deck_down}] Deck   [{key:deck_auto}] Auto   [{key:aim}] Cancel")
	else:
		var reel="CARGO ALIGNED · [%s] Throw hook"%game.key_label("reel") if salvage_readout.aligned>=0 else "[%s] Throw salvage hook"%game.key_label("reel")
		if game.salvage.busy(): reel="REELING CARGO" if game.salvage.reel_index>=0 else "HOOK RETURNING" if game.salvage.hook_phase=="back" else "HOOK OUT"
		prompt.text=game.interaction_prompt+game.hint("\n[{key:terminal}] Wrist terminal   [{key:build}] Build   ")+reel
