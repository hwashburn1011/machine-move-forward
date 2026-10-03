class_name MMFUI
extends CanvasLayer

var game
var root: Control
var panel: PanelContainer
var content: VBoxContainer
var tabs: HBoxContainer
var hud: Label
var objective: Label
var guidance_left=0.0
var guidance_text=""
var prompt: Label
var toast: Label
var crosshair: Label
var caption: Label
var page=""
var toast_time=0.0
var refresh_time=0.0
var storage_id=""
var station_kind=""
var record_title=""
var record_text=""
var record_back_page=""
var binding_action=""
var binding_buttons={}
var binding_status: Label
var return_button: Button
var toast_source=""
var action_page=""
var action_station=[]
var damage_overlay: ColorRect
var live_status: Label
var transmission: Label
var boarding: Label
var hit_readout: Label
var hit_left=0.0
var salvage_readout: MMFSalvageReadout
var loot_readout: MMFLootReadout
var terminal: MMFWristTerminal
var reticle: MMFAimReticle
var terminal_title: Label
var link_status: Label
var action_status: Label
var scroller: ScrollContainer
var page_tabs={}
var pack_view=MMFTerminalInventory.new()
var workshop_view=MMFTerminalWorkshop.new()
var live_meters=[]
var preferred_focus: Control
var device_frame: MMFTerminalFrame
var plain_panel_style: StyleBoxFlat
var title_screen: MMFTitleScreen
var continue_id=""
const TERMINAL_PAGES=["Inventory","Records"]
const TAB_LABELS={"Inventory":"PACK","Records":"LOG","Helm":"NAVIGATION","Machine":"ENGINEERING","Signal":"SIGNALS","Research":"RESEARCH"}

func setup(owner_game):
	game=owner_game
	process_mode=Node.PROCESS_MODE_ALWAYS
	root=Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter=Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme=Theme.new()
	theme.default_font_size=21
	var font=SystemFont.new()
	font.font_names=["Consolas","DejaVu Sans Mono"]
	theme.default_font=font
	var normal=StyleBoxFlat.new()
	normal.bg_color=Color(0,0,0,0)
	normal.content_margin_left=9
	normal.content_margin_right=9
	normal.content_margin_top=6
	normal.content_margin_bottom=6
	theme.set_stylebox("normal","Button",normal)
	theme.set_stylebox("disabled","Button",normal)
	var hover=normal.duplicate()
	hover.bg_color=Color(.12,.18,.15,.95)
	theme.set_stylebox("hover","Button",hover)
	theme.set_stylebox("focus","Button",hover)
	theme.set_stylebox("pressed","Button",hover)
	theme.set_color("font_color","Label",Color(.64,.75,.66))
	theme.set_color("font_color","Button",Color(.75,.84,.74))
	theme.set_color("font_hover_color","Button",Color(.9,.94,.83))
	theme.set_color("font_pressed_color","Button",Color(.9,.94,.83))
	theme.set_color("font_focus_color","Button",Color(.9,.94,.83))
	theme.set_color("font_disabled_color","Button",Color(.35,.42,.36))
	root.theme=theme
	title_screen=MMFTitleScreen.new();root.add_child(title_screen);title_screen.setup(game)
	damage_overlay=ColorRect.new();damage_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);damage_overlay.mouse_filter=Control.MOUSE_FILTER_IGNORE;root.add_child(damage_overlay)
	hud=overlay(Vector2(28,25),Vector2(360,170),18)
	objective=overlay(Vector2(1470,30),Vector2(420,170),20)
	prompt=overlay(Vector2(550,850),Vector2(820,80),20)
	prompt.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	toast=overlay(Vector2(400,760),Vector2(1120,70),20)
	toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	crosshair=overlay(Vector2(950,526),Vector2(30,30),24)
	crosshair.text=""
	reticle=MMFAimReticle.new();reticle.game=game;root.add_child(reticle)
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
	loot_readout=MMFLootReadout.new();root.add_child(loot_readout);loot_readout.setup(game)
	device_frame=MMFTerminalFrame.new();root.add_child(device_frame);device_frame.setup(theme)
	panel=PanelContainer.new()
	var background=normal.duplicate()
	background.bg_color=Color(.018,.027,.023,1)
	background.set_content_margin_all(20)
	plain_panel_style=background
	panel.add_theme_stylebox_override("panel",background)
	root.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left=90;panel.offset_right=-90;panel.offset_top=70;panel.offset_bottom=-70
	var outer=VBoxContainer.new()
	outer.add_theme_constant_override("separation",10)
	panel.add_child(outer)
	var title=Label.new()
	terminal_title=title
	title.text="S–07  /  LINEKEEPER 4    ·    LOCAL LINK"
	title.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_color_override("font_color",Color(.8,.86,.72))
	title.add_theme_font_size_override("font_size",22)
	outer.add_child(title)
	link_status=Label.new();link_status.add_theme_font_size_override("font_size",15)
	link_status.add_theme_color_override("font_color",Color(.51,.63,.55))
	link_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;outer.add_child(link_status)
	tabs=HBoxContainer.new()
	outer.add_child(tabs)
	for title_text in TAB_LABELS:
		var button=Button.new()
		button.text=TAB_LABELS[title_text]
		button.add_theme_font_size_override("font_size",22)
		button.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		button.pressed.connect(func():game.open_menu(title_text))
		tabs.add_child(button)
		page_tabs[title_text]=button
	scroller=ScrollContainer.new()
	scroller.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	scroller.follow_focus=true
	scroller.size_flags_vertical=Control.SIZE_EXPAND_FILL
	scroller.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	outer.add_child(scroller)
	content=VBoxContainer.new()
	content.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation",7)
	scroller.add_child(content)
	binding_status=Label.new();binding_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	binding_status.add_theme_color_override("font_color",Color(.76,.98,.62))
	outer.add_child(binding_status)
	action_status=Label.new();action_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	action_status.add_theme_font_size_override("font_size",16)
	action_status.add_theme_color_override("font_color",Color(.8,.76,.6));action_status.hide();outer.add_child(action_status)
	return_button=Button.new()
	return_button.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	return_button.add_theme_font_size_override("font_size",18)
	return_button.pressed.connect(func():
		if title_screen.menu_origin: game.open_menu("Title")
		elif game.started: game.close_menu()
		else: game.open_menu("Title"))
	outer.add_child(return_button)
	refresh_control_labels()
	panel.hide()
	panel.visibility_changed.connect(update_frame_visibility)
	# Wrapped labels can report their old minimum for one container layout pass
	# after changing pages. Fit the glass again once those sizes settle.
	panel.minimum_size_changed.connect(func():
		if panel.get_parent()==root:reflow.call_deferred())
	terminal=MMFWristTerminal.new();add_child(terminal);terminal.setup(self)
	root.resized.connect(reflow)
	reflow.call_deferred()
	game.session.notice.connect(notify)

func reflow():
	var s=root.size
	var title_rect=title_screen.layout(s)
	update_frame_visibility()
	if page in MMFTerminalFrame.PAGES and panel.get_parent()==root:
		var display=device_frame.layout(s)
		panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
		panel.position=display.position;panel.size=display.size
	elif page=="Title" and panel.get_parent()==root:
		panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
		panel.position=title_rect.position;panel.size=title_rect.size
	objective.position=Vector2(s.x-450,30)
	crosshair.position=s*.5-Vector2(10,14)
	prompt.position=Vector2((s.x-820)*.5,s.y-160)
	toast.position=Vector2((s.x-1120)*.5,s.y-310)
	caption.position=Vector2((s.x-1280)*.5,s.y-135)
	transmission.position=Vector2((s.x-1120)*.5,s.y-425)
	boarding.position=Vector2((s.x-920)*.5,170)
	hit_readout.position=s*.5+Vector2(-145,40)

func update_frame_visibility():
	if device_frame and panel:device_frame.visible=panel.visible and panel.get_parent()==root and page in MMFTerminalFrame.PAGES

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
	MMFWristLog.append(game.session,message)
	toast_source=message
	toast.text=game.hint(message)
	toast_time=6
	action_page=page if game.menu_open else ""
	action_station=[station_kind,storage_id]
	# Explicit menu actions answer inside the linked display. World play stays
	# quiet; its receipts remain available in the personal log.
	if is_instance_valid(action_status):
		action_status.text=game.hint(message)
		if game.menu_open:terminal.redraw()

func reset_feedback():
	toast_time=0;toast_source="";action_page="";action_station=[]
	toast.text="";toast.hide();action_status.text="";action_status.hide()
	transmission.text="";transmission.hide();boarding.hide()

func combat_hit(kind: String):
	hit_left=.55
	hit_readout.text=kind
	hit_readout.modulate=Color(.4,1,.75) if kind=="EXPOSED HIT" else Color(1,.72,.38)

func confirm_player_hit():
	if reticle:reticle.confirm()

func text_line(message: String,big: bool=false):
	var label=Label.new()
	label.text=game.hint(message)
	label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	if big:
		label.add_theme_font_size_override("font_size",24)
		label.add_theme_color_override("font_color",Color(.8,.86,.72))
	content.add_child(label)
	return label

func button(label: String,action: Callable,enabled: bool=true):
	var b=Button.new()
	b.text=label
	if page=="Title":b.add_theme_font_size_override("font_size",24)
	b.alignment=HORIZONTAL_ALIGNMENT_LEFT
	b.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	b.disabled=not enabled
	if not enabled:b.focus_mode=Control.FOCUS_NONE
	b.mouse_default_cursor_shape=Control.CURSOR_POINTING_HAND
	b.pressed.connect(action)
	content.add_child(b)
	return b

func section(title_text: String,trailing: String="") -> HBoxContainer:
	var row=HBoxContainer.new();content.add_child(row)
	var heading=Label.new();heading.text=title_text;heading.add_theme_font_size_override("font_size",24);heading.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(heading)
	var value=Label.new();value.text=trailing;row.add_child(value)
	return row

func compact_row(title_text: String,trailing: String,action: Callable,selected: bool=false,enabled: bool=true) -> Button:
	var b=Button.new();b.text=title_text;b.alignment=HORIZONTAL_ALIGNMENT_LEFT;b.clip_text=true
	b.custom_minimum_size.y=44;b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;b.disabled=not enabled
	b.mouse_default_cursor_shape=Control.CURSOR_POINTING_HAND;b.tooltip_text=title_text
	var plate=StyleBoxFlat.new();plate.bg_color=Color(.5,.78,.32) if selected else Color.TRANSPARENT
	plate.content_margin_left=12;plate.content_margin_right=maxf(60,root.get_theme_font("font","Button").get_string_size(trailing,HORIZONTAL_ALIGNMENT_LEFT,-1,21).x+24) if trailing!="" else 12;plate.content_margin_top=8;plate.content_margin_bottom=8
	b.add_theme_stylebox_override("normal",plate)
	var focus=StyleBoxFlat.new();focus.bg_color=Color.TRANSPARENT;focus.border_color=Color(.67,.95,.47);focus.set_border_width_all(1)
	b.add_theme_stylebox_override("focus",focus)
	if selected:
		for state in ["hover","pressed"]:b.add_theme_stylebox_override(state,plate)
		for state in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:b.add_theme_color_override(state,Color(.02,.07,.025))
	var value=Label.new();value.text=trailing;value.mouse_filter=Control.MOUSE_FILTER_IGNORE;value.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	value.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);value.offset_left=8;value.offset_right=-12;value.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
	value.add_theme_color_override("font_color",Color(.02,.07,.025) if selected else Color(.61,.9,.45));b.add_child(value)
	b.pressed.connect(action);content.add_child(b)
	return b

func meter_row(label_text: String,value: float,max_value: float=100,suffix: String="") -> HBoxContainer:
	var row=HBoxContainer.new();row.add_theme_constant_override("separation",14);content.add_child(row)
	var title_label=Label.new();title_label.text=label_text;title_label.custom_minimum_size.x=105;row.add_child(title_label)
	var bar=ProgressBar.new();bar.max_value=maxf(1,max_value);bar.value=value;bar.show_percentage=false;bar.custom_minimum_size=Vector2(0,14);bar.size_flags_horizontal=Control.SIZE_EXPAND_FILL;bar.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	var back=StyleBoxFlat.new();back.bg_color=Color(.10,.18,.07);bar.add_theme_stylebox_override("background",back)
	var fill=StyleBoxFlat.new();fill.bg_color=Color(.53,.83,.33);bar.add_theme_stylebox_override("fill",fill);row.add_child(bar)
	var number=Label.new();number.text=str(roundi(value))+suffix;number.custom_minimum_size.x=72;number.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;row.add_child(number)
	if label_text in ["HEALTH","FUEL","POWER","SCAN"]:live_meters.append({"key":{"HEALTH":"health","FUEL":"fuel","POWER":"power","SCAN":"scan"}[label_text],"bar":bar,"number":number,"suffix":suffix})
	return row

func actions(specs: Array):
	var row=HBoxContainer.new();row.add_theme_constant_override("separation",14);content.add_child(row)
	for spec in specs:
		var b=Button.new();b.text=spec[0];b.disabled=not spec[2] if spec.size()>2 else false;b.pressed.connect(spec[1]);row.add_child(b)
		if spec.size()>3:b.set_meta("terminal_action",spec[3])
	return row

func browse(entries: Array,selection: String,choose: Callable,detail: Callable):
	if entries.is_empty():text_line("Nothing here yet.");return
	if not entries.any(func(entry):return entry.id==selection):selection=entries[0].id;choose.call(selection)
	var columns=HBoxContainer.new();columns.add_theme_constant_override("separation",28);content.add_child(columns)
	var list=VBoxContainer.new();list.size_flags_horizontal=Control.SIZE_EXPAND_FILL;list.size_flags_stretch_ratio=1.5;columns.add_child(list)
	var divider=VSeparator.new();columns.add_child(divider)
	var details=VBoxContainer.new();details.custom_minimum_size.x=240;details.size_flags_horizontal=Control.SIZE_EXPAND_FILL;details.add_theme_constant_override("separation",10);columns.add_child(details)
	var original=content
	for entry in entries:
		content=list
		var b=compact_row(entry.title,entry.get("value",""),func():
			for action_button in details.find_children("*","Button",true,false):
				if not action_button.disabled:action_button.grab_focus();break,entry.id==selection)
		if entry.id!=selection:b.focus_entered.connect(func():choose.call(entry.id);refresh.call_deferred())
		b.set_meta("terminal_entry",entry.id)
		if entry.id==selection:preferred_focus=b
	content=details;detail.call(selection);content=original

func pictogram(kind: String):
	var icon=MMFTerminalVisual.new();icon.kind=kind;content.add_child(icon)
	return icon

func costs(cost: Dictionary) -> String:
	var items=[]
	for id in cost: items.append("%d %s"%[cost[id],id])
	return ", ".join(items)

func open(which: String):
	cancel_binding()
	page=which
	title_screen.page_changed(which)
	panel.theme=title_screen.menu_theme if page=="Title" else device_frame.screen_theme if page in MMFTerminalFrame.PAGES else null
	var style=StyleBoxFlat.new() if page=="Title" else device_frame.screen_style if page in MMFTerminalFrame.PAGES else plain_panel_style
	if page=="Title":style.bg_color=Color.TRANSPARENT;style.set_content_margin_all(0)
	panel.add_theme_stylebox_override("panel",style)
	terminal.open(which)
	panel.show()
	refresh()
	reflow()
	scroller.set_deferred("scroll_vertical",0)

func cycle_terminal_page(direction: int):
	var pages=context_pages()
	if pages.size()>1:game.open_menu(pages[posmod(pages.find(page)+direction,pages.size())])

func context_pages() -> Array:
	if page in TERMINAL_PAGES:return TERMINAL_PAGES
	if page in ["Signal","Research"]:return ["Signal","Research"]
	if page in ["Helm","Machine"]:return []
	return []

func focus_first_row():
	if not game.menu_open:return
	if is_instance_valid(preferred_focus):preferred_focus.grab_focus();return
	for child in content.find_children("*","BaseButton",true,false):
		if not child.disabled:
			child.grab_focus();return

func refresh():
	cancel_binding()
	binding_buttons.clear()
	binding_status.visible=page=="Settings"
	refresh_control_labels()
	var headings={"Inventory":"S–07 / PERSONAL PACK","Records":"S–07 / PERSONAL LOG","Build":"CONSTRUCTION / PART CATALOG","Signal":"NOMAD / RECEIVER","Research":"NOMAD / RECEIVER","Helm":"NOMAD / HELM","Machine":"NOMAD / ENGINEERING","Workshop":"NOMAD / "+station_kind.to_upper(),"Storage":"NOMAD / "+station_kind.to_upper(),"Shelf":"NOMAD / KEEPSAKE DISPLAY","Caretaker":"NOMAD / COMPANION DOCK","Story":"SITE / SIGNAL READER","Mission":"SITE / MISSION EQUIPMENT","Finale":"RECEIVING BERTH","FinaleBrief":"NOMAD / FINAL OPERATION","RouteConfirm":"NOMAD / MAIN COURSE","Service":"SITE / SERVICE BAY","Equipment":"NOMAD / "+station_kind.replace("-"," ").to_upper(),"Console":"SITE / "+str(game.activity.entry.get("label","INSTRUMENT")).to_upper(),"Checkpoints":"PLAYTEST / CHECKPOINT SELECTOR"}
	headings.PortCrane="NOMAD / PORT RECOVERY ARM"
	headings.Painter="NOMAD / PATCHCOAT FINISHES"
	headings.Pause="S–07 / SESSION CONTROLS"
	headings.Settings="S–07 / SYSTEM PREFERENCES"
	terminal_title.text=headings.get(page,"S–07 / PERSONAL RECORD" if terminal.physical_page(page) else "MACHINE MOVE FORWARD")
	terminal_title.visible=page!="Title"
	terminal_title.add_theme_font_size_override("font_size",30 if page=="Title" else 22)
	return_button.visible=page!="Title"
	if game.started and page not in ["Title","Departure","Checkpoints"]:
		if not terminal_title.text.begins_with("S–07"):terminal_title.text="S–07  /  "+terminal_title.text
	link_status.visible=game.started and page not in ["Title","Departure","Checkpoints"]
	link_status.text="LINEKEEPER 4  ·  LOCAL MEMORY" if terminal.physical_page(page) else "LINEKEEPER 4  ·  CONSTRUCTION LINK" if page=="Build" else "LINEKEEPER 4  ·  NEAR-FIELD EQUIPMENT LINK" if page in ["Helm","Machine","Signal","Research","Workshop","Storage","Equipment","Console","Caretaker","Shelf","Service","Story","Mission","Painter","PortCrane"] else "LINEKEEPER 4  ·  LOCAL CONTROLS"
	if game.playtests.active_id!="":terminal_title.text+="  ·  PLAYTEST"
	var plate=panel.get_theme_stylebox("panel").duplicate()
	plate.border_color=Color(.27,.38,.31)
	plate.set_border_width_all(0 if page=="Title" else 1);panel.add_theme_stylebox_override("panel",plate)
	for id in page_tabs:
		page_tabs[id].text=("› " if id==page else "")+TAB_LABELS[id]
		page_tabs[id].visible=id in context_pages()
	live_status=null
	live_meters.clear();preferred_focus=null
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()
	tabs.visible=context_pages().size()>1
	var s=game.session
	match page:
		"Departure":
			text_line("PREPARING DEPARTURE",true)
			text_line("Loading the opening scene…")
		"Title":
			continue_id=latest_continue()
			var new_button=button("NEW GAME",func():game.new_game())
			var resume=button("CONTINUE PLAYTEST" if game.playtests.active_id!="" else "CONTINUE",continue_campaign,(game.started and game.session.health>0) or continue_id!="")
			resume.tooltip_text="Resume your current journey." if game.started else "Continue your saved journey." if continue_id!="" else "Start a new game to begin your journey."
			button("LOAD GAME",func():game.open_menu("Library"))
			button("SETTINGS",func():game.open_menu("Settings"))
			button("QUIT",func():game.get_tree().quit())
			var checkpoints=button("PLAYTEST CHECKPOINTS",func():game.open_menu("Checkpoints"));checkpoints.add_theme_font_size_override("font_size",15)
			if game.playtests.active_id!="":button("RETURN TO CAMPAIGN",func():game.playtests.return_to_campaign()).add_theme_font_size_override("font_size",15)
			preferred_focus=new_button if resume.disabled else resume
		"Pause":
			text_line("CONNECTION HELD",true)
			button("RESUME",game.close_menu)
			if s.recovery.phase!="idle":button("CANCEL EMERGENCY SERVICE",func():MMFMachineService.cancel(s);game.close_menu())
			button("PLAYTEST CHECKPOINTS",func():game.open_menu("Checkpoints"))
			if game.playtests.active_id!="":
				button("RESTART THIS CHECKPOINT",func():game.playtests.launch(game.playtests.active_id))
				button("RETURN TO CAMPAIGN",func():game.playtests.return_to_campaign())
			button("SAVE PLAYTEST" if game.playtests.active_id!="" else "SAVE CAMPAIGN",func():
				if game.save_game("manual") and game.playtests.active_id!="":game.save_game("autosave"))
			button("CAMPAIGN LIBRARY",func():game.open_menu("Library"))
			button("SETTINGS",func():game.open_menu("Settings"))
			if game.recorder.enabled:button("EXPORT PLAYTEST TIMINGS",game.export_playtest_report)
			button("QUIT TO TITLE",func():game.open_menu("Title"))
		"Library":
			text_line("PLAYTEST SAVES / "+game.playtests.definition(game.playtests.active_id).title if game.playtests.active_id!="" else "LOAD GAME",true)
			var saves=MMFSaves.list_saves()
			if saves.is_empty():text_line("No saved journeys yet. Start a new game to make your first crossing.")
			for entry in saves:
				button(entry.id+"    "+entry.date,func():game.load_game(entry.id))
			if game.started:button("CREATE NAMED CHECKPOINT",func():game.save_game("checkpoint-"+str(int(Time.get_unix_time_from_system())));refresh())
			button("OPEN SAVE FOLDER",func():OS.shell_open(ProjectSettings.globalize_path(MMFSaves.DIRECTORY)))
			if game.started:button("EXPORT JSON…",func():file_dialog(false))
			button("IMPORT NATIVE CAMPAIGN JSON…",func():file_dialog(true))
		"Inventory": pack_view.render(self)
		"Storage": storage_page()
		"PortCrane":game.salvage.automation.render(self)
		"Painter":game.personalization.render_painter(self,storage_id)
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
		"Story":game.narrative.render(self)
		"Mission":game.missions.render(self)
		"RouteConfirm":game.missions.render_route(self)
		"FinaleBrief":game.finale.render_brief(self)
		"Finale":game.finale.render(self)
		"Workshop","Research": workshop_view.render(self)
		"Equipment":equipment_page()
		"Caretaker":
			section("L–12 / COMPANION")
			text_line(game.caretaker.status if s.caretaker.recovered else "Recover L-12 to activate this dock.")
		"Checkpoints":game.playtests.render(self)
		"Machine": game.engineering.render(self)
		"Service":
			game.engineering.render_service(self,true)
			button("NAVIGATION / DEPARTURE",func():game.open_station("Helm","helm"))
		"Signal","Helm": navigation_page()
		"Records": game.terminal_pages.records(self)
		"Record":
			if record_back_page!="":button("‹ BACK",func():game.open_menu(record_back_page))
			text_line(record_title,true)
			text_line(record_text)
		"Settings": settings_page()
	focus_first_row.call_deferred()
	terminal.redraw()

func storage_page():
	pack_view.storage(self)

func equipment_page():
	var s=game.session;var p=s.find_piece(storage_id)
	if p.is_empty():text_line("This equipment is no longer installed.");return
	var def=game.data.BUILD_PIECES[p.definitionId]
	section(def.name.to_upper());meter_row("CONDITION",p.health,def.maxHealth)
	match p.definitionId:
		"generator":
			meter_row("FUEL",s.fuel,100,"%")
			text_line("Owned fuel: %d · Running cost: %.1f fuel/min"%[s.count_resource("fuel"),3.6*s.modifiers().fuelBurnMultiplier])
			var enabled=MMFMachineOperations.source_enabled(s.operations,p.instanceId)
			var quote=MMFMachineOperations.switch_quote(s,p.instanceId,not enabled)
			button("STOP GENERATOR" if enabled else "START GENERATOR",func():game.engineering.equipment_switch(p.instanceId,quote))
			button("REFUEL",func():
				if s.refuel():game.player.equipment.refuel()
				refresh(),s.fuel<100 and s.count_resource("fuel")>0)
		"battery-bank":
			text_line("Reserve: %d / 120. Charges from spare generation; backs up the receiver and helm."%p.state.get("charge",0))
			button("CHECK BACKUP RESERVE",func():
				var estimate=MMFNativeProgression.battery_preview(s)
				game.record_event("other","battery_preview",estimate)
				show_record("Battery reserve",("With generation offline, this reserve can supply %s for about %.0f seconds at the current navigation load.\n\nEngines and guns are not backed up. This check does not interrupt power or consume charge."%[", ".join(estimate.supplied),estimate.seconds]) if estimate.draw>0 else "No navigation backup available yet. Charge the bank from spare generator capacity and check the receiver or helm load."))
		"quiet-drive":
			text_line("Quieter travel reduces speed by 35% and generator output by 4.")
			var comparison=MMFNativeProgression.drive_preview(s)
			text_line("NORMAL: %d generation · full cruise speed\nQUIET: %d generation · 65%% cruise speed · half scout detection buildup\nCurrent demand: %d"%[comparison.normal_generation,comparison.quiet_generation,comparison.demand])
			button("RESTORE NORMAL RUNNING" if s.expedition_gear.quiet else "ENABLE QUIET RUNNING",func():s.expedition_gear.quiet=not s.expedition_gear.quiet;s.update_power();refresh(),p.health>0)
		"salvage-crane":button("OPERATE CRANE",func():game.close_menu();game.salvage.operate_crane(p),p.health>0)
	button("REPAIR",func():s.repair(p.instanceId);refresh(),p.health<def.maxHealth)
	button("RELOCATE EQUIPMENT",func():
		if not game.building.start_move(p.instanceId):s.notify("Secure the deck and approach this equipment before moving it."))
	text_line("Placement keeps the existing support and clearance rules. Cancel leaves the equipment where it was.")

func machine_page():
	var s=game.session
	section("NOMAD","%.1f m/s"%s.speed)
	meter_row("FUEL",s.fuel,100,"%")
	meter_row("POWER",s.demand,maxf(1,s.capacity)," / %d"%s.capacity)
	game.terminal_pages.schematic(self)
	for p in s.structures:
		if p.definitionId=="battery-bank":section("BATTERY","%d / 120"%p.state.get("charge",0))
	if MMFNativeProgression.available(s,"quiet-drive"):section("DRIVE","QUIET" if MMFNativeProgression.quiet_running(s) else "NORMAL")
	section("SYSTEMS")
	for id in s.subsystems:compact_row(game.data.SUBSYSTEMS[id].name,"%d%%"%[100*s.subsystems[id]/game.data.SUBSYSTEMS[id].maxHealth],func():show_record(game.data.SUBSYSTEMS[id].name,"Condition: %d%%"%[100*s.subsystems[id]/game.data.SUBSYSTEMS[id].maxHealth]);button("REPAIR",func():s.repair(id);refresh()))
	if s.caretaker.recovered:
		text_line("L–12 / "+game.caretaker.status,true)
		text_line("Companion · follows you aboard")

func signal_status() -> String:
	var s=game.session
	return {"awaiting-receiver":"Receiver missing","awaiting-module":"Receiver offline","installed":"Receiver ready","scanning":"Scanning","contact-ready":"Signal found"}.get(s.scanner.phase,s.story.phase.replace("-"," ").capitalize())

func navigation_page():
	var s=game.session
	section("SIGNAL","%dm"%s.distance)
	live_status=text_line(signal_status(),true)
	button("CURRENT TASK  ›",func():show_record("Current task",game.hint(s.objective())+"\n\n"+game.journey.brief()))
	if page=="Helm":button("FUEL & JOURNEY PREPARATION  ›",func():show_record("Journey preparation",MMFCampaignFlow.preparation_text(s)))
	if game.combat.has_method("encounter_status"):
		var status=game.combat.encounter_status()
		if status!="":text_line(status)
	var scout=game.combat.get("scout")
	if scout and scout.has_method("can_decoy") and scout.can_decoy():
		button("DEPLOY SIGNAL DECOY",func():
			if scout.deploy_decoy():game.close_menu()
			else:refresh(),scout.can_decoy())
	game.missions.render_nav(self)
	if s.story.phase=="finale-link":
		text_line("Link: "+s.finale.encounter+". Secure it at the receiver, then resume travel at the helm.")
		if page=="Signal" and s.finale.stage=="secure" and s.finale.encounter=="pending":button("SECURE RECEIVING LINK",game.finale.secure_link)
		if page=="Helm" and s.finale.stage=="ready":button("RESUME PROTECTED FINAL JOURNEY",game.finale.resume_travel)
	if s.story.phase=="finale-docked":
		text_line("Receiving berth: "+s.finale.stage+". Local equipment works independently of Nomad generation.")
		if page=="Helm" and s.finale.stage=="aftermath":button("RETRACT GANGWAY / KEEP WALKING",game.finale.depart)
	game.opportunities.radar.render(self)
	var contact=s.contacts.active
	if not contact.is_empty():
		section("NEARBY")
		text_line(game.opportunities.title(),true)
		var preview=game.opportunities.preview()
		text_line("%dm  /  %.0f°  /  %d fuel" %[preview.remaining,preview.bearing,preview.fuel])
		button("DETAILS  ›",func():show_record(game.opportunities.title(),game.opportunities.description()))
		if contact.state=="detected":
			var mission_id=MMFMissions.contact_mission(contact)
			button("INTERCEPT",func():game.opportunities.commit(),preview.reachable and (mission_id=="" or (page=="Helm" and (s.missions.records[mission_id].status=="accepted" or MMFMissionContracts.reward_pending(s,mission_id)))) and (not MMFNativeProgression.radar_ready(s) or game.opportunities.radar.powered()))
			button("PASS BY",func():game.opportunities.dismiss();refresh())
		if contact.kind=="friendly-refuge" and s.survivor_content.refuge.workshopKnown and not s.survivor_content.workshop.charted:text_line("MARKED · Shared workshop")
		if contact.state in ["docked","visited"]:
			button("DEPART",func():game.opportunities.depart())
			if contact.kind=="salvage-wreck" and contact.salvageMode=="":
				button("SECURE CACHE · 24 scrap / 2 components",func():game.opportunities.choose_salvage("secure"))
				button("OVERRIDE · skiff fight · 48 scrap / 6 parts",func():game.opportunities.choose_salvage("broadcast"),game.aboard())
	if s.scanner.phase=="awaiting-module": button("INSTALL MODULE",func():s.install_scanner();refresh())
	if s.scanner.phase=="installed": button("SCAN",func():
		if s.start_scan(game.aboard()): game.close_menu()
		else: refresh())
	if s.scanner.phase=="scanning": meter_row("SCAN",s.scan_fraction()*100.0,100,"%")
	if page=="Helm":
		var config=MMFMachineOperations.resume_config(s)
		var refusal=MMFMachineOperations.departure_reason(s,config)
		text_line("Departure: "+("ready" if refusal=="" else refusal))
		text_line("Operating plan: "+("Manual" if config.mode=="legacy" else config.mode.capitalize())+" · %.1f fuel / active minute"%(MMFPowerBudget.calculate(s,s.structures,0,config).fuel_rate*60))
		if s.story.phase=="route-selection" and not game.campaign.routes().is_empty():
			text_line("Route fuel estimates use current machinery. Exploring, fighting and stops add time.")
		elif s.story.phase in ["route-selection","approach","ending-ready"]:
			var distance=400.0 if s.story.phase=="ending-ready" else maxf(0,s.story.arrival-s.distance) if s.story.phase=="approach" else float(game.campaign.expedition().approachDistanceM)
			var estimate=MMFMachineOperations.travel(s,distance,config)
			text_line("Transit estimate for %dm: %.1f fuel. Exploring, fighting and stops add time."%[distance,estimate.fuel] if estimate.available else "Transit estimate unavailable until propulsion is restored.")
	if page=="Helm" and s.story.phase=="route-selection":
		text_line(game.campaign.expedition().title,true)
		if game.campaign.routes().is_empty(): button("CONTINUE TO THE ARRAY" if s.story.index==2 else "TRACE SIGNAL / COMMIT COURSE",func():game.missions.confirm_route())
		for route in game.campaign.routes():
			var estimate=MMFMachineOperations.travel(s,route.distanceM,MMFMachineOperations.resume_config(s))
			var fuel_label="~%.1f fuel"%estimate.fuel if estimate.available else "propulsion unavailable"
			button("%s · %dm · %s · %s" %[route.id,route.distanceM,fuel_label,MMFCordonGuardian.route_label(route)],func():game.missions.confirm_route(route.id))
	if s.story.phase=="docked": button("RESUME TRAVEL / RETRACT GANGWAY",func():game.campaign.depart())
	if page=="Helm" and s.story.phase=="ending-ready":
		button("REVIEW FINAL OPERATION",game.finale.review)
	if page=="Helm" and s.navigation_limit()>0:
		text_line("HEADING %.0f° / LIMIT ±%.0f°" %[s.target_course,s.navigation_limit()])
		var slider=HSlider.new()
		slider.min_value=-s.navigation_limit()
		slider.max_value=s.navigation_limit()
		slider.value=s.target_course
		slider.value_changed.connect(func(value):s.target_course=value)
		content.add_child(slider)

func settings_page():
	text_line("WRIST DISPLAY")
	for entry in [["terminal_reduced_motion","Reduced motion",false],["terminal_glow","Screen glow",true],["terminal_scanlines","Scanlines",false]]:
		var check=CheckButton.new();check.text=entry[1];check.button_pressed=game.settings.get(entry[0],entry[2])
		check.toggled.connect(func(value):game.settings[entry[0]]=value;game.save_settings();terminal.apply_preferences());content.add_child(check)
	text_line("TEXT SIZE")
	var text_scale=HSlider.new();text_scale.min_value=.9;text_scale.max_value=1.4;text_scale.step=.1;text_scale.value=game.settings.get("terminal_text_scale",1.0)
	text_scale.value_changed.connect(func(value):game.settings.terminal_text_scale=value;game.save_settings();terminal.apply_preferences());content.add_child(text_scale)
	var reminders=CheckButton.new();reminders.text="Service guidance in wrist log";reminders.button_pressed=game.settings.get("objective_reminders",true)
	reminders.toggled.connect(func(value):game.settings.objective_reminders=value;game.save_settings());content.add_child(reminders)
	var markers=CheckButton.new();markers.text="Show objective location markers";markers.button_pressed=game.settings.get("objective_markers",false)
	markers.toggled.connect(func(value):game.settings.objective_markers=value;game.save_settings());content.add_child(markers)
	var tasks=CheckButton.new();tasks.text="Show task on field display";tasks.button_pressed=game.settings.get("field_objectives",false)
	tasks.toggled.connect(func(value):game.settings.field_objectives=value;game.save_settings());content.add_child(tasks)
	for entry in [["sensitivity",0.2,3,0.1],["fov",40,90,1],["volume",0,1,0.05],["ambient",0,0.5,0.025],["music_volume",0,1,0.05]]:
		text_line({"volume":"MASTER VOLUME","ambient":"MACHINE AND WIND","music_volume":"OCCASIONAL MUSIC"}.get(entry[0],entry[0].to_upper()))
		var slider=HSlider.new()
		slider.min_value=entry[1]
		slider.max_value=entry[2]
		slider.step=entry[3]
		slider.value=game.settings.get(entry[0],.35)
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
		return_button.text=game.hint("[{key:terminal} / {key:pause}] CLOSE   ·   ↑↓ ENTER"+("   ·   ALT+←→" if page in TERMINAL_PAGES else "")) if game.started and not title_screen.menu_origin else "RETURN TO TITLE"
	if is_instance_valid(toast): toast.text=game.hint(toast_source)
	if is_instance_valid(action_status):action_status.text=game.hint(toast_source)
	for action in binding_buttons:
		var row=binding_buttons[action]
		if not is_instance_valid(row.key): continue
		row.key.text="PRESS KEY…" if binding_action==action else game.key_label(action)
		if action=="crouch" and not game.settings.bindings.has("crouch") and KEY_C not in game.settings.bindings.values(): row.key.text+=" / C"
		row.reset.disabled=not game.settings.bindings.has(action)
	if is_instance_valid(binding_status):
		binding_status.text=("Press a key for "+MMFControls.NAMES[binding_action]+". Escape cancels without changing controls.") if binding_action!="" else "Select a control, then press its new key. Escape cancels a pending change."

func latest_continue() -> String:
	if not MMFSaves.read("autosave").is_empty():return "autosave"
	for entry in MMFSaves.list_saves():
		if not MMFSaves.read(entry.id).is_empty():return entry.id
	return ""

func continue_campaign():
	if game.started and game.session.health>0:game.close_menu()
	elif continue_id!="":game.load_game(continue_id)

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
	if page!="Record":record_back_page=page if game.menu_open and page not in ["Title","Pause","Departure"] else ""
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
	game.terminal_pages.update_catalog(dt)
	var readable=game.started and not game.menu_open and game.cinematic=="" and game.session.health>0
	salvage_readout.update()
	loot_readout.update(dt)
	transmission.hide();boarding.hide()
	if not game.journey.current.is_empty():transmission.text=game.journey.current.speaker+"  //  "+game.hint(game.journey.current.text)
	if not game.menu_open: hit_left=maxf(0,hit_left-dt)
	hit_readout.hide()
	damage_overlay.color=Color(0.8,0.02,0.0,game.effects.flash*0.8)
	toast_time=maxf(0,toast_time-dt)
	toast.hide()
	var feedback_visible=toast_time>0 and game.menu_open and page==action_page and action_station==[station_kind,storage_id] and game.cinematic==""
	if action_status.visible!=feedback_visible:
		action_status.visible=feedback_visible
		terminal.redraw()
	var s=game.session
	for meter in live_meters:
		if not is_instance_valid(meter.bar):continue
		var value=s.scan_fraction()*100.0 if meter.key=="scan" else s.demand if meter.key=="power" else s.get(meter.key)
		if meter.key=="power":meter.bar.max_value=maxf(1,s.capacity);meter.suffix=" / %d"%s.capacity
		meter.bar.value=value;meter.number.text=str(roundi(value))+meter.suffix
	if is_instance_valid(live_status):
		if page in ["Signal","Helm"]:live_status.text=signal_status()
	hud.visible=game.cinematic=="" and not game.menu_open
	objective.visible=hud.visible and game.settings.get("field_objectives",false)
	crosshair.visible=hud.visible
	prompt.visible=hud.visible
	if not hud.visible: return
	var held="SALVAGE CUTTER / field tool" if game.player.equipment.salvage_selected() else "%s %d / ∞"%[game.data.WEAPONS[s.current_weapon].name,s.weapons[s.current_weapon].ammoInMag]
	hud.text="S–07 / NOMAD LINK\n%.1f m/s · %dm\nFuel %d%% · Power %d/%d\nHealth %d\n%s" %[s.speed,s.distance,s.fuel,s.demand,s.capacity,s.health,held]
	if game.playtests.active_id!="":hud.text="PLAYTEST · "+game.playtests.definition(game.playtests.active_id).title+"\n"+hud.text
	guidance_left-=dt
	if guidance_left<=0:
		guidance_left=.2
		guidance_text=game.hint(game.guidance.current_task().text)
		var checklist=game.guidance.checklist_text()
		if checklist!="" and not game.combat.active_threat() and game.building.selected=="" and not Input.is_action_pressed("aim"):guidance_text+="\n\n"+checklist
	objective.text=guidance_text
	if game.building.selected!="":
		var report=game.building.report
		var explanation=game.building.failure
		var materials=[]
		if not report.is_empty():
			for id in report.get("cost",{}):materials.append("%s %d/%d"%[game.data.ITEMS[id].name,report.owned.get(id,0),report.cost[id]])
			explanation="Deck %d · "%[int(report.get("deck",game.building.current_level()))+3]+explanation
			var power=report.get("power",{})
			if not power.is_empty():explanation+=" · Power %d / %d"%[power.get("demand",s.demand),power.get("capacity",s.capacity)]
			if not report.get("warnings",[]).is_empty():explanation+="\n"+str(report.warnings[0])
		var connection=MMFMachineSpaces.bay_note(game.building.selected)
		var actions="\n[{key:fire}] Install at connection  [{key:catalog}] Parts  [{key:aim}] Cancel\n[{key:build_undo}] Undo" if connection!="" else "\n[{key:fire}] Place  [{key:rotate_left} / {key:use}] Rotate  [{key:catalog}] Parts  [{key:aim}] Cancel\n[{key:build_undo}] Undo  [{key:build_copy}] Copy  [{key:shoulder}] Move  [{key:deck_up} / {key:deck_down}] Deck  [{key:deck_auto}] Auto"
		prompt.text="BUILD "+game.data.BUILD_PIECES[game.building.selected].name+" · "+explanation+"\n"+("MOVE · No material cost" if game.building.moving!="" else " · ".join(materials))+game.hint(actions)
	else:
		var reel="CARGO ALIGNED · [%s] Throw hook"%game.key_label("reel") if salvage_readout.aligned>=0 else "[%s] Throw salvage hook"%game.key_label("reel")
		if game.salvage.busy(): reel="REELING CARGO" if game.salvage.reel_index>=0 else "HOOK RETURNING" if game.salvage.hook_phase=="back" else "HOOK OUT"
		prompt.text=game.interaction_prompt+game.hint("\n[{key:terminal}] Wrist / log   [{key:build}] Build   ")+reel
