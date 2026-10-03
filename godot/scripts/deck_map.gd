class_name MMFDeckMap
extends Control

var game
var level=0
var selected=""
var select: Callable
var extent=Vector2(15,17)

func point(at: Vector3) -> Vector2:
	return Vector2(size.x*.5+at.x/extent.x*(size.x*.45),size.y*.5+at.z/extent.y*(size.y*.40))

func _ready():
	custom_minimum_size=Vector2(0,380)
	size_flags_horizontal=Control.SIZE_EXPAND_FILL
	clip_contents=true
	for p in game.session.structures:
		if p.cell.y==level: extent=extent.max(Vector2(absf(p.cell.x*2)+2,absf(p.cell.z*2)+2))
	resized.connect(layout)
	for p in game.session.structures:
		if p.cell.y!=level or p.definitionId in ["floor","wall","railing"]: continue
		var b=Button.new();b.text=game.data.BUILD_PIECES[p.definitionId].name.left(12)
		b.tooltip_text=game.data.BUILD_PIECES[p.definitionId].name+" / "+p.instanceId
		b.set_meta("at",game.building.piece_transform(p).origin)
		b.pressed.connect(func():select.call(p.instanceId))
		b.add_theme_font_size_override("font_size",13);b.custom_minimum_size=Vector2(104,28)
		if p.instanceId==selected: b.modulate=Color(1,.73,.25)
		elif not game.session.powered.get(p.instanceId,true): b.modulate=Color(1,.48,.3)
		add_child(b)
	layout.call_deferred()

func layout():
	for b in get_children(): b.position=point(b.get_meta("at"))-Vector2(52,14);b.size=Vector2(104,28)
	queue_redraw()

func _draw():
	draw_rect(Rect2(Vector2.ZERO,size),Color(.023,.065,.067))
	for x in range(-12,13,2): draw_line(point(Vector3(x,0,-14)),point(Vector3(x,0,14)),Color(.07,.17,.17))
	for z in range(-14,15,2): draw_line(point(Vector3(-12,0,z)),point(Vector3(12,0,z)),Color(.07,.17,.17))
	var font=ThemeDB.fallback_font
	draw_string(font,Vector2(12,23),"BOW / FORWARD                    PORT / LEFT    |    STARBOARD / RIGHT",HORIZONTAL_ALIGNMENT_LEFT,-1,16,Color(.42,.76,.71))
	if level==0:
		for spec in [["HELM",Vector3(0,0,-10)],["RECEIVER",Vector3(1,0,-9.8)]]:
			var a=point(spec[1]);draw_circle(a,4,Color(.35,.65,.65));draw_string(font,a+Vector2(-55,(-18 if spec[0]=="HELM" else 22)),spec[0],HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color(.45,.75,.7))
	for p in game.session.structures:
		if p.cell.y==level and p.definitionId=="floor":
			var a=point(game.building.center(p.cell));draw_rect(Rect2(a-Vector2(5,5),Vector2(10,10)),Color(.23,.36,.33))
	for x in [-12,-2]:
		var a=point(Vector3(x,0,0));draw_rect(Rect2(a-Vector2(9,24),Vector2(18,48)),Color(.5,.38,.17),false,2)
		draw_string(font,a+Vector2(10,25),"STAIRS",HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color(.85,.65,.3))
	if int(round((game.player.position.y-16.03)/3.6))==level:
		var at=point(game.player.position);draw_circle(at,7,Color(.12,1,.9));draw_string(font,at+Vector2(10,-8),"YOU",HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color(.4,1,.9))
	draw_string(font,Vector2(12,size.y-12),"Grey: deck plates    Amber: selected / stairs    Orange: power shortage",HORIZONTAL_ALIGNMENT_LEFT,-1,14,Color(.6,.73,.65))
