class_name MMFTerminalInventory
extends RefCounted

var selected=""
var filter="ALL"
const SUPPLIES=["repair-kit","fuel","signal-decoy"]
const EFFECTS={"repair-kit":"Health +40","fuel":"Generator fuel","scrap":"Construction material","components":"Machine parts","refined-metal":"Refined building stock","extended-mag":"Magazine +50%","signal-decoy":"Diverts enemy tracking"}

func ids(bag) -> Array:
	var result=[]
	for slot in bag.slots:
		if slot and slot.itemId not in result:result.append(slot.itemId)
	return result

func render(ui):
	var s=ui.game.session
	var pinned=ui.game.guidance.checklist_text(true)
	if pinned!="":
		ui.text_line(pinned)
		ui.button("CLEAR PIN",func():ui.game.guidance.clear_pin();ui.refresh())
	ui.section("PACK","%d / %d"%[s.inventory.slots.filter(func(slot):return slot!=null).size(),s.inventory.slots.size()])
	var original=ui.content
	var gauges=HBoxContainer.new();gauges.add_theme_constant_override("separation",24);original.add_child(gauges)
	for spec in [["HEALTH",s.health]]:
		var group=VBoxContainer.new();group.size_flags_horizontal=Control.SIZE_EXPAND_FILL;gauges.add_child(group);ui.content=group
		ui.meter_row(spec[0],spec[1]);ui.content=original
	var filters=[]
	for name in ["ALL","SUPPLIES","PARTS","GEAR"]:
		filters.append([("› " if filter==name else "")+name,func():filter=name;ui.refresh()])
	ui.actions(filters)
	var entries=[]
	for id in ids(s.inventory):
		var gear=s.data.ITEMS[id].category in ["ammo","mod"]
		if filter=="SUPPLIES" and id not in SUPPLIES:continue
		if filter=="PARTS" and (id in SUPPLIES or gear):continue
		if filter=="GEAR" and not gear:continue
		entries.append({"id":id,"title":s.data.ITEMS[id].name,"value":"× %d"%s.inventory.count_item(id)})
	if filter in ["ALL","GEAR"]:
		for id in ["rifle","shotgun"]:entries.append({"id":id,"title":s.data.WEAPONS[id].name,"value":"EQUIPPED" if s.current_weapon==id and not ui.game.building.salvage_tool.equipped() else ""})
		if ui.game.building.salvage_tool.acquired():entries.append({"id":"salvage-cutter","title":"Salvage cutter","value":"EQUIPPED" if ui.game.building.salvage_tool.equipped() else ""})
	ui.browse(entries,selected,func(id):selected=id,func(id):details(ui,id))
	ui.actions([["SORT",func():s.inventory.sort_slots();ui.refresh(),true,"sort-pack"]])
	if not ui.game.building.salvage_tool.acquired():
		var hint=ui.button("FIND CUTTER  ›",func():ui.show_record("Salvage cutter","Recover the cutter from the onboard tool locker. Select it with ["+ui.game.key_label("salvage_tool")+"] and hold ["+ui.game.key_label("demolish")+"] on nearby construction."))
		hint.tooltip_text="Onboard tool locker"

func details(ui,id: String):
	var s=ui.game.session
	ui.pictogram(id)
	if id in ["rifle","shotgun"]:
		ui.text_line(s.data.WEAPONS[id].name,true)
		ui.meter_row("AMMO",s.weapons[id].ammoInMag,s.data.WEAPONS[id].magazineSize+s.weapons[id].magazineBonus)
		ui.button("EQUIP",func():ui.game.player.switch_weapon(id);ui.game.close_menu())
		return
	if id=="salvage-cutter":
		ui.text_line("Salvage cutter",true);ui.text_line("Dismantle + recover")
		ui.button("EQUIP",func():ui.game.building.salvage_tool.set_equipped(true);ui.game.close_menu())
		return
	var def=s.data.ITEMS[id]
	ui.text_line(def.name,true)
	var effect=EFFECTS.get(id,def.get("category","Resource").capitalize())
	ui.text_line(effect)
	if id in ["repair-kit","extended-mag"]:
		var enabled=s.health>0 and s.health<100 if id=="repair-kit" else s.weapons[s.current_weapon].magazineBonus==0
		var action=ui.button("FIT" if id=="extended-mag" else "USE",func():s.use_item(id);ui.refresh(),enabled)
		action.set_meta("terminal_action","use:"+id)
	elif id=="signal-decoy":ui.button("DEPLOY",func():
		if ui.game.combat.scout.deploy_decoy():ui.game.close_menu(),ui.game.combat.scout.can_decoy())
	ui.button("DETAILS  ›",func():ui.show_record(def.name,def.description))

func storage(ui):
	var s=ui.game.session
	if not s.stores.has(ui.storage_id):return
	var bag=s.stores[ui.storage_id];var pack=s.inventory
	ui.section("STORAGE","%d / %d"%[bag.slots.filter(func(slot):return slot!=null).size(),bag.slots.size()])
	ui.actions([["TAKE ALL",func():transfer(ui,bag,pack,false,ui.storage_id,"pack");ui.refresh()],["DEPOSIT MATCHING",func():transfer(ui,pack,bag,true,"pack",ui.storage_id);ui.refresh()],["SORT",func():bag.sort_slots();ui.refresh()]])
	for spec in [["STORED",bag,pack,"TAKE"],["PACK",pack,bag,"STORE"]]:
		ui.section(spec[0])
		if ids(spec[1]).is_empty():ui.text_line("—")
		for id in ids(spec[1]):
			ui.compact_row(s.data.ITEMS[id].name,"%s ×%d"%[spec[3],spec[1].count_item(id)],func():
				var count=mini(spec[1].count_item(id),spec[2].room_for(id));spec[1].remove(id,count);spec[2].add(id,count)
				if count>0:ui.game.record_event("menu","storage_transfer",{"item":id,"count":count,"from":ui.storage_id if spec[1]==bag else "pack","to":"pack" if spec[1]==bag else ui.storage_id,"net":0})
				ui.refresh())

func transfer(ui,source,target,matching: bool,source_id: String,target_id: String):
	var before={}
	for id in ids(source):before[id]=source.count_item(id)
	var moved=source.transfer_to(target,matching)
	if moved<=0:return
	var supplies={}
	for id in before:
		var count=int(before[id])-source.count_item(id)
		if count>0:supplies[id]=count
	ui.game.record_event("menu","storage_transfer",{"supplies":supplies,"from":source_id,"to":target_id,"net":0})
