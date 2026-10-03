class_name MMFTerminalWorkshop
extends RefCounted

var category="CRAFT"
var selected=""

func render(ui):
	var allowed=["RESEARCH"] if ui.page=="Research" else (["CRAFT","WEAPONS"] if ui.station_kind=="workbench" else ["CRAFT"])
	if category not in allowed:category=allowed[0];selected=""
	ui.section("RECEIVER RESEARCH" if ui.page=="Research" else ui.station_kind.to_upper())
	var categories=[]
	for name in allowed:categories.append([("› " if category==name else "")+name,func():category=name;selected="";ui.refresh()])
	if categories.size()>1:ui.actions(categories)
	var entries=[];var s=ui.game.session
	match category:
		"CRAFT":
			for recipe in s.data.RECIPES:
				if recipe.station!=ui.station_kind:continue
				entries.append({"id":recipe.id,"title":recipe.name,"value":"READY" if s.station_powered(recipe.station) and s.can_pay(recipe.inputs) else "—"})
		"RESEARCH":
			for id in s.data.UPGRADES:
				var def=s.data.UPGRADES[id]
				entries.append({"id":id,"title":def.name,"value":"FITTED" if s.research.active.get(def.branch,"")==id else "KNOWN" if id in s.research.completed else ""})
		"WEAPONS":
			for id in s.data.WEAPON_ATTACHMENTS:
				var def=s.data.WEAPON_ATTACHMENTS[id]
				entries.append({"id":id,"title":def.name,"value":"FITTED" if s.weapons[def.weaponId].attachment==id else "KNOWN" if id in s.attachment_research else ""})
	ui.browse(entries,selected,func(id):selected=id,func(id):details(ui,id))
	if ui.page=="Workshop" and ui.station_kind=="workbench":ui.game.personalization.render_workbench(ui,ui.storage_id)

func ingredients(ui,cost: Dictionary):
	ui.section("NEED")
	for id in cost:
		var label=ui.game.data.ITEMS[id].name
		ui.section(label,"%d / %d"%[ui.game.session.count_resource(id),cost[id]])

func details(ui,id: String):
	var game=ui.game;var s=game.session
	match category:
		"CRAFT":
			var recipe=s.data.RECIPES.filter(func(r):return r.id==id)[0]
			ui.pictogram(recipe.output.itemId);ui.text_line(recipe.name,true)
			ui.text_line("×%d  ·  %s"%[recipe.output.count,recipe.station.capitalize()])
			ingredients(ui,recipe.inputs)
			ui.button("UNPIN MATERIALS" if game.guidance.is_pinned("recipe",id) else "PIN MATERIALS",func():game.guidance.toggle_pin("recipe",id);ui.refresh())
			var ready=s.station_powered(recipe.station)
			if not ready:ui.text_line("Needs a working, powered "+recipe.station)
			var station=s.find_piece(ui.storage_id)
			ready=ready and not station.is_empty() and station.health>0 and s.powered.get(ui.storage_id,true)
			var action=ui.button("CRAFT",func():s.craft(id,1,ui.storage_id);ui.refresh(),ready and s.can_pay(recipe.inputs));action.set_meta("terminal_action","craft:"+id)
		"RESEARCH":
			var def=s.data.UPGRADES[id];ui.pictogram("components");ui.text_line(def.name,true)
			# Only the selected upgrade has a comparison; the list stays one line.
			game.terminal_pages.comparisons(ui,def)
			var refusal=game.research_refusal()
			if s.research.active.get(def.branch,"")==id:ui.button("REMOVE",func():game.research_action("remove",def.branch);ui.refresh(),game.research_refusal(true)=="")
			elif id in s.research.completed:ui.button("FIT",func():game.research_action("fit",id);ui.refresh(),refusal=="")
			else:
				ingredients(ui,def.researchCost)
				ui.button("RESEARCH",func():game.research_action("research",id);ui.refresh(),refusal=="" and s.can_pay(def.researchCost))
			if refusal!="":ui.button("REQUIREMENTS  ›",func():ui.show_record(def.name,refusal))
		"WEAPONS":
			var def=s.data.WEAPON_ATTACHMENTS[id];ui.pictogram(def.weaponId);ui.text_line(def.name,true)
			game.terminal_pages.attachment_comparison(ui,id)
			var refusal=game.attachment_refusal()
			if s.weapons[def.weaponId].attachment==id:ui.button("REMOVE",func():game.remove_attachment(def.weaponId);ui.refresh(),refusal=="")
			else:
				var known=id in s.attachment_research
				if not known:ingredients(ui,def.cost)
				ui.button("FIT" if known else "RESEARCH + FIT",func():game.fit_attachment(id);ui.refresh(),refusal=="" and (known or s.can_pay(def.cost)))
			if refusal!="":ui.button("REQUIREMENTS  ›",func():ui.show_record(def.name,refusal))
