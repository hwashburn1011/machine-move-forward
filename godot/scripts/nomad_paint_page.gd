class_name MMFNomadPaintPage
extends RefCounted
## Physical trolley console. Selection/preview is transient; only explicit apply spends.

static func render(owner_view,ui,station_id: String):
	var s=owner_view.game.session
	ui.section("PATCHCOAT FINISH CONSOLE")
	if not s.customization.restored:
		ui.text_line("Restore the Patchcoat tool set at a workbench after repairing the receiver: 3 recovered finish parts + 6 scrap. Ordinary cargo contains the parts.")
		ui.text_line("This trolley is ready when your tools are. You can build furnishings before restoring these tools.");return
	var authorized=owner_view._authority(station_id)
	if not authorized:ui.text_line("Return to this trolley aboard the Nomad after the encounter to apply a finish.")
	ui.text_line("Choose an owned furnishing or a machine enamel zone. Preview is free; applying a changed finish costs 2 scrap. Closing this console cancels its preview.")
	var targets=[]
	for zone in MMFNomadPersonalization.ZONES:targets.append({"id":"zone:"+zone,"name":owner_view.config.zones[zone].name})
	for p in s.structures:
		if p.health>0 and MMFNomadPersonalization.piece_eligible(p.definitionId):
			var name=s.data.BUILD_PIECES[p.definitionId].name
			if p.state.has("restoration"):name=MMFNomadPersonalization.PROJECTS[p.state.restoration].name
			targets.append({"id":p.instanceId,"name":"%s · deck %d · [%d,%d]"%[name,int(p.cell.y)+3,int(p.cell.x),int(p.cell.z)]})
	if not targets.any(func(row):return row.id==owner_view.selection):owner_view.selection=targets[0].id
	var options=OptionButton.new();options.custom_minimum_size.y=44
	for i in range(targets.size()):
		options.add_item(targets[i].name)
		if targets[i].id==owner_view.selection:options.selected=i
	options.item_selected.connect(func(index):owner_view.reset_preview();owner_view.selection=targets[index].id;ui.refresh())
	ui.content.add_child(options)
	var current="original"
	if owner_view.selection.begins_with("zone:"):current=s.customization.machinePaint[owner_view.selection.trim_prefix("zone:")]
	else:current=s.find_piece(owner_view.selection).state.get("finish","original")
	ui.text_line("Saved finish: "+_name(owner_view,current))
	var grid=GridContainer.new();grid.columns=3;grid.add_theme_constant_override("h_separation",12);grid.add_theme_constant_override("v_separation",6);ui.content.add_child(grid)
	for id in ["original"]+MMFNomadPersonalization.PALETTE_IDS:
		var row=HBoxContainer.new();row.size_flags_horizontal=Control.SIZE_EXPAND_FILL;grid.add_child(row)
		var swatch=ColorRect.new();swatch.custom_minimum_size=Vector2(26,26);swatch.size_flags_vertical=Control.SIZE_SHRINK_CENTER
		swatch.color=Color("918c7d") if id=="original" else Color(owner_view.config.palette[id].paint);swatch.mouse_filter=Control.MOUSE_FILTER_IGNORE;row.add_child(swatch)
		var b=Button.new();b.text=("● " if owner_view.selected_finish==id else "")+_name(owner_view,id);b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;b.alignment=HORIZONTAL_ALIGNMENT_LEFT
		b.pressed.connect(func():owner_view.selected_finish=id;owner_view.reset_preview();ui.refresh());row.add_child(b)
	ui.section("SELECTED FINISH",_name(owner_view,owner_view.selected_finish))
	var source: Node3D;var material_spec={}
	if owner_view.selection.begins_with("zone:"):
		var zone=owner_view.selection.trim_prefix("zone:");var bank=owner_view._zone_root(zone)
		if bank and bank.get_child_count()>0:source=bank.get_child(0)
		material_spec=owner_view.config.zones[zone].materials
	else:
		var target=owner_view._piece_target(owner_view.selection)
		if not target.is_empty():source=target.root;material_spec=target.spec
	MMFNomadFinishView.study(ui.content,source,material_spec,owner_view.config.palette,owner_view.selected_finish)
	ui.text_line("Finish study · pieces keep their existing wear and fittings. Machine zones show one representative unit.")
	ui.button("RESET PREVIEW TO SAVED FINISH",func():owner_view.reset_preview();owner_view.selected_finish=current;ui.refresh())
	ui.button("APPLY FINISH · 2 scrap",func():
		if owner_view.selection.begins_with("zone:"):owner_view.paint_machine(station_id,owner_view.selection.trim_prefix("zone:"),owner_view.selected_finish)
		else:owner_view.paint_piece(station_id,owner_view.selection,owner_view.selected_finish),authorized and current!=owner_view.selected_finish and s.can_pay(MMFNomadPersonalization.PAINT_COST))
	ui.section("RESTORE A PERSONAL KEEPSAKE")
	ui.text_line("A cosmetic restoration for a piece you own. Each project costs 1 recovered finish part + 4 scrap, including its named finish, and can be completed once.")
	for id in MMFNomadPersonalization.PROJECTS:
		var project=MMFNomadPersonalization.PROJECTS[id]
		ui.text_line(project.name+(" · RESTORED" if id in s.customization.projects else ""),true)
		ui.text_line(project.text)
		if id in s.customization.projects:continue
		var owned=s.structures.filter(func(p):return p.definitionId==project.piece and p.health>0 and not p.state.has("restoration"))
		if owned.is_empty():ui.text_line("Own a "+s.data.BUILD_PIECES[project.piece].name+" to begin.")
		else:
			# Explicit identity prevents silently altering another owned duplicate.
			for p in owned:ui.button("RESTORE %s · [%d,%d] deck %d · 1 finish part + 4 scrap"%[project.name,int(p.cell.x),int(p.cell.z),int(p.cell.y)+3],func():owner_view.restore_project(station_id,id,p.instanceId),authorized and s.can_pay(MMFNomadPersonalization.PROJECT_COST))
	ui.section("G–01 SERVICE MARK")
	if s.facts.get("guardianOutcome","") in ["destroyed","disarmed","evaded"]:
		ui.text_line("Your Gatekeeper clearance authorizes a small service stencil on the upper cargo locker. Applying or removing it costs nothing.")
		var mark="none" if s.customization.serviceMark=="g01" else "g01"
		ui.button("REMOVE SERVICE MARK" if mark=="none" else "APPLY G–01 SERVICE MARK",func():owner_view.set_service_mark(station_id,mark),authorized)
	else:ui.text_line("Earned by clearing the Gatekeeper through destruction, disarming or evasion.")

static func _name(owner_view,id: String) -> String:
	return "Original finish" if id=="original" else owner_view.config.palette[id].name
