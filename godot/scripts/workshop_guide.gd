extends RefCounted

# An optional projection of a buildable route. Every part still goes through
# the normal catalog, reach/clearance checks, material payment and placement.
const PLAN=[
	{"definitionId":"floor","cell":{"x":4,"y":0,"z":3},"rotation":0,"instruction":"Lay the first deck plate at the foot of the stairs."},
	{"definitionId":"floor","cell":{"x":5,"y":0,"z":3},"rotation":0,"instruction":"Continue the lower deck one plate toward the workshop."},
	{"definitionId":"floor","cell":{"x":6,"y":0,"z":3},"rotation":0,"instruction":"Extend the lower deck to support the outer wall."},
	{"definitionId":"wall","cell":{"x":6,"y":0,"z":3},"edge":{"x":6,"y":0,"z":3,"axis":"x"},"rotation":0,"instruction":"Fit the support wall on the outer platform edge, clear of the machine's railing."},
	{"definitionId":"stairs","cell":{"x":4,"y":0,"z":3},"rotation":1,"instruction":"Fit stairs rising toward the workshop. Keep the stairwell opening clear."},
	{"definitionId":"floor","cell":{"x":6,"y":1,"z":3},"rotation":0,"instruction":"Lay the first upper deck plate above the side wall."},
	{"definitionId":"floor","cell":{"x":7,"y":1,"z":3},"rotation":0,"instruction":"Extend the upper deck to the illuminated docking square."},
	{"definitionId":"boarding-extension","cell":{"x":7,"y":1,"z":3},"rotation":1,"instruction":"Fit the boarding extension across the final gap toward the doorway."}
]
var site_reference: WeakRef
var owner_site:
	get: return site_reference.get_ref() if site_reference else null
var game
var active=false
var ghost: Node3D
var label: Label3D
var last_revision=-1
var last_index=-2
var next={}
var material=StandardMaterial3D.new()

func setup(site_owner):
	site_reference=weakref(site_owner);game=site_owner.game
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color=Color(.12,.73,.81,.20)
	label=Label3D.new();label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;label.font_size=26;label.pixel_size=.006;label.visibility_range_end=18
	label.modulate=Color(.65,.97,.87);label.outline_size=6;label.visible=false;owner_site.site.add_child(label)

func matches(spec: Dictionary) -> bool:
	for piece in game.session.structures:
		if piece.definitionId!=spec.definitionId or piece.cell!=spec.cell or piece.health<=0: continue
		if spec.has("edge") and piece.get("edge",{})!=spec.edge: continue
		if spec.definitionId in ["stairs","boarding-extension"] and int(piece.rotation)!=int(spec.rotation): continue
		return true
	return false

func missing_index() -> int:
	if owner_site.bridge_connected(): return -1
	for index in PLAN.size():
		if not matches(PLAN[index]): return index
	return -1

func remaining_cost() -> Dictionary:
	var total={}
	for spec in PLAN:
		if matches(spec): continue
		for id in game.data.BUILD_PIECES[spec.definitionId].cost:
			total[id]=total.get(id,0)+int(game.data.BUILD_PIECES[spec.definitionId].cost[id])
	return total

func show():
	active=true;last_revision=-1
	update()
	game.session.notify("Upper-deck plan marked aboard. [{key:build}] opens construction. Choose the named part and line up its preview with the cyan outline; place each part yourself. Keep the primary gangway clear.")

func prepare_choice(builder,id: String):
	if not active or next.is_empty() or id!=next.definitionId: return
	builder.manual_level=int(next.cell.y)
	builder.rotation_index=int(next.rotation)
	game.session.notify(next.instruction+" The guide sets its deck and starting rotation; aim at the cyan outline and place normally.")

func update():
	if not active: return
	var docked=game.session.contacts.active.get("state","") in ["docked","visited"]
	if not docked:
		if is_instance_valid(ghost): ghost.visible=false
		label.visible=false;return
	if last_revision==game.building.layout_revision: return
	last_revision=game.building.layout_revision
	var index=missing_index()
	if index==last_index: return
	last_index=index
	if is_instance_valid(ghost): ghost.queue_free();ghost=null
	if index<0:
		next={};label.visible=false
		game.session.notify("Upper boarding route connected. Walk up your stairs and across the extension; the original gangway remains available below.")
		return
	next=PLAN[index].duplicate(true)
	ghost=game.building.model_for(next.definitionId);owner_site.site.add_child(ghost)
	if next.definitionId=="floor":MMFFloorSurfaces.configure_model(ghost,next)
	for mesh in MMFAssets.of_type(ghost,"MeshInstance3D"):
		mesh.material_override=material;mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ghost.global_transform=game.building.piece_transform(next)
	label.global_position=game.building.center(next.cell)+Vector3.UP*2.2
	var cost=remaining_cost();var text=[]
	for id in cost: text.append("%d %s"%[cost[id],id])
	label.text=game.hint("PLAN %d / %d · %s\n[{key:build}] construction · %s remaining"%[index+1,PLAN.size(),game.data.BUILD_PIECES[next.definitionId].name,", ".join(text)])
	label.visible=true

func summary() -> String:
	if owner_site.bridge_connected(): return "Upper boarding route connected. The raised cache is accessible once workshop power is restored."
	var index=missing_index()
	if index<0: return "The parts are present. Check that the platform remains supported and the doorway is clear."
	return "Upper-deck plan: %d/%d · %s"%[index+1,PLAN.size(),game.data.BUILD_PIECES[PLAN[index].definitionId].name]
