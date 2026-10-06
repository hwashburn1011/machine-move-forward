class_name MMFRouteRadar
extends Control

var game
var dots=[]

func _ready():
	custom_minimum_size=Vector2(280,150)
	mouse_filter=Control.MOUSE_FILTER_STOP
	resized.connect(queue_redraw)

func _draw():
	if not game:return
	var origin=Vector2(size.x*.5,size.y-14)
	var ink=Color(.28,.7,.39,.7)
	for radius in [42,84,126]:draw_arc(origin,radius,PI,TAU,40,Color(.2,.45,.28,.35),1)
	draw_line(origin+Vector2(-6,0),origin+Vector2(0,-8),ink,2)
	draw_line(origin+Vector2(0,-8),origin+Vector2(6,0),ink,2)
	var limit=deg_to_rad(game.session.navigation_limit())
	for sign_value in [-1,1]:draw_line(origin,origin+Vector2(sin(limit)*sign_value,-cos(limit))*130,ink,1)
	dots.clear()
	var contacts=game.session.contacts.get("candidates",[])
	for i in contacts.size():
		var c=contacts[i];var p=game.opportunities.preview(c)
		# This is a forward sweep. Passed signals remain in the written list,
		# but must not masquerade as contacts just ahead of the bow.
		if p.passed or p.window_closed:continue
		var angle=deg_to_rad(clampf(p.bearing,-75,75))
		var radius=clampf(p.remaining/1200*126,16,126)
		var at=origin+Vector2(sin(angle),-cos(angle))*radius
		# Index labels distinguish close bearings without suggesting false positions.
		var selected=c.id==game.session.contacts.active.get("id","")
		var color=Color(.55,1,.64) if p.reachable else Color(.65,.52,.3)
		draw_circle(at,4,color)
		if selected:draw_arc(at,8,0,TAU,24,color,1.5)
		draw_string(ThemeDB.fallback_font,at+Vector2(10,-3),str(i+1),HORIZONTAL_ALIGNMENT_LEFT,-1,14,color)
		dots.append({"at":at,"id":c.id})

func _gui_input(event):
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
		for dot in dots:
			if dot.at.distance_to(event.position)<14:
				game.opportunities.radar.select(dot.id);game.ui.refresh();accept_event();return
