class_name MMFTerminalPages
extends RefCounted

var game
var category="all"
var deck=0
var selected=""
var locate_left=0.0
var marker: Label3D

func catalog_ids() -> Array:
	var ids=[]
	for id in game.data.BUILD_PIECE_ORDER:
		if category=="favorites" and id not in game.session.polish.favorites: continue
		if category not in ["all","favorites"] and game.data.BUILD_PIECES[id].category!=category: continue
		ids.append(id)
	return ids

func favorite(id: String):
	if not game.data.BUILD_PIECES.has(id): return
	if id in game.session.polish.favorites: game.session.polish.favorites.erase(id)
	else: game.session.polish.favorites.append(id)

func catalog(ui):
	ui.text_line("CONSTRUCTION / DECK %d"%(game.building.current_level()+3),true)
	ui.text_line("Aim within 12 m. %s/%s rotate · %s/%s deck · %s auto deck · %s relocate · Hold %s dismantle. Incoming attacks cancel construction."%[game.key_label("rotate_left"),game.key_label("use"),game.key_label("deck_up"),game.key_label("deck_down"),game.key_label("deck_auto"),game.key_label("shoulder"),game.key_label("demolish")])
	var filters=HBoxContainer.new();ui.content.add_child(filters)
	for name in ["all","structure","station","decor","favorites"]:
		var b=Button.new();b.text=name.to_upper();b.toggle_mode=true;b.button_pressed=category==name
		b.pressed.connect(func():category=name;ui.refresh());filters.add_child(b)
	if catalog_ids().is_empty(): ui.text_line("No favourites yet. Use the star beside an item to save it here.")
	for id in catalog_ids():
		var def=game.data.BUILD_PIECES[id]
		var row=HBoxContainer.new();ui.content.add_child(row)
		var star=Button.new();star.text="★" if id in game.session.polish.favorites else "☆";star.tooltip_text="Toggle favourite: "+def.name
		star.pressed.connect(func():favorite(id);ui.refresh());row.add_child(star)
		var b=Button.new();b.text=def.name+"   /   "+ui.costs(def.cost)+("   [LOCKED]" if not game.building.unlocked(id) else "")
		b.size_flags_horizontal=Control.SIZE_EXPAND_FILL;b.alignment=HORIZONTAL_ALIGNMENT_LEFT;b.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
		b.disabled=not game.building.unlocked(id);b.pressed.connect(func():game.close_menu();game.building.choose(id));row.add_child(b)
		if def.get("description","")!="": ui.text_line(def.description)

func schematic(ui):
	ui.text_line("DECK SCHEMATIC / LIVE EQUIPMENT",true)
	var tabs=HBoxContainer.new();ui.content.add_child(tabs)
	for i in [0,-1,-2]:
		var b=Button.new();b.text=["LOWER / 1","SERVICE / 2","TOP / 3"][i+2];b.toggle_mode=true;b.button_pressed=deck==i
		b.pressed.connect(func():deck=i;selected="";ui.refresh());tabs.add_child(b)
	var map=MMFDeckMap.new();map.game=game;map.level=deck;map.selected=selected;map.select=func(id):selected=id;ui.refresh()
	ui.content.add_child(map)
	var p=game.session.find_piece(selected)
	if not p.is_empty():
		var def=game.data.BUILD_PIECES[p.definitionId]
		ui.text_line("SELECTED / "+def.name,true)
		ui.text_line("Deck %d   •   Condition %d%%   •   %s   •   Grid %d, %d"%[int(p.cell.y)+3,int(100*p.health/def.maxHealth),"Power available" if game.session.powered.get(p.instanceId,true) else "POWER SHORTAGE",p.cell.x,p.cell.z])
		ui.button("SERVICE / OPEN "+def.name,func():game.service_piece(p))
		var repair_cost=maxi(1,int(ceil(def.cost.get("scrap",0)*(1-p.health/def.maxHealth)*.2)))
		ui.button("REPAIR / %d scrap"%repair_cost,func():game.session.repair(p.instanceId);game.session.update_power();ui.refresh(),p.health<def.maxHealth and game.session.can_pay({"scrap":repair_cost}))
		ui.button("LOCATE ON DECK",func():locate(p.instanceId))
	else: ui.text_line("Select equipment to view its condition, service it or locate it aboard.")
	# Accessible list also covers small/overlapping map markers.
	for piece in game.session.structures:
		if piece.cell.y==deck and piece.definitionId not in ["floor","wall","railing"]:
			ui.button("SELECT / "+game.data.BUILD_PIECES[piece.definitionId].name+" / "+piece.instanceId,func():selected=piece.instanceId;ui.refresh())

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
	ui.text_line("%s / Current: %s\n%s"%[def.name,game.data.UPGRADES[fitted].name if fitted!="" else "Standard","   ·   ".join(changes)])

func attachment_comparison(ui,id: String):
	var notes={"":"Standard weapon configuration","rifle-stabilizer":"Spread ×0.55 / recoil ×0.65 / reload time ×1.15","rifle-burst-cam":"Three-shot bursts / cyclic fire rate 12 shots per second","shotgun-choke":"Spread ×0.60 / range ×1.35 / falloff start ×1.25 / fire rate ×0.80","shotgun-scatter-brake":"Spread ×1.20 / range ×0.75 / falloff start ×0.80 / fire rate ×1.25"}
	var weapon=game.data.WEAPON_ATTACHMENTS[id].weaponId
	var current=game.session.weapons[weapon].attachment
	ui.text_line("CURRENT: "+notes.get(current,"Standard")+"\nCANDIDATE: "+notes[id])

func records(ui):
	ui.text_line("NOMAD / JOURNEY MANIFEST",true)
	for id in game.session.story.uniques: ui.text_line("✓ "+game.journey.reward_text(id))
	ui.text_line("TRANSMISSION ARCHIVE",true)
	for line in game.session.polish.log: ui.text_line(line.speaker+" / "+line.text)
