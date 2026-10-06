class_name MMFSiteInteractionCues
extends RefCounted

# Presentation follows the same selected target as Use. Never introduce a
# second aim/range/occlusion rule that advertises an action Use would not take.
const MARKER="◇"
const QUIET=Color(.62,.66,.59,.65)
const ACTIVE=Color(.83,.86,.74,1)

static func present(label: Label3D,title: String,available: bool,selected: bool,readable: bool):
	label.visible=available and readable
	if not label.visible:return
	label.text=title if selected else MARKER
	label.font_size=24 if selected else 18
	label.pixel_size=.003
	label.modulate=ACTIVE if selected else QUIET
	label.outline_size=4 if selected else 2

static func update(game,selected: Dictionary):
	var readable=game.started and not game.menu_open and game.cinematic=="" and game.session.health>0 and game.building.selected=="" and game.manual_turret==""
	var kind=selected.get("kind","")
	var target=selected.get("target",{})
	for p in game.campaign.points:
		var title=p.entry.label
		var service=p.entry.kind=="departure" and not game.engineering.bay().is_empty()
		if service:title="SITE SERVICE / DEPARTURE"
		var active=(kind=="campaign" and target.get("id","")==p.entry.id) or (kind=="service-bay" and service)
		present(p.label,title,game.session.story.phase=="docked" and game.campaign.can_show(p.entry),active,readable)
	for p in game.opportunities.points:
		var available=game.session.contacts.active.get("state","") in ["docked","visited"]
		if game.opportunities.survivor_site:available=available and game.opportunities.survivor_site.point_visible(p.id)
		var title=game.hint(p.text+(" [HOLD {key:use}]" if p.id=="service" else ""))
		present(p.label,title,available,kind=="optional" and target.get("id","")==p.id,readable)
	if is_instance_valid(game.finale.berth):
		for p in game.finale.berth.points:
			present(p.label,p.title,game.session.story.phase=="finale-docked",kind=="finale" and target.get("id","")==p.id,readable)
