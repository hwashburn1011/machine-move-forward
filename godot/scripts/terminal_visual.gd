class_name MMFTerminalVisual
extends Control

# Original line pictograms, drawn at the display's resolution rather than
# baked into the arm model. The adjacent item name supplies the text label.
var kind="components"
var ink=Color(.64,.92,.44)

func _ready():
	custom_minimum_size=Vector2(120,126)
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func line(a: Vector2,b: Vector2):draw_line(a,b,ink,2.8,true)
func box(rect: Rect2):draw_rect(rect,ink,false,2.8)

func _draw():
	draw_set_transform(Vector2((size.x-100)*.5,8),0,Vector2.ONE)
	match kind:
		"water","fuel":
			box(Rect2(36,8,28,12));box(Rect2(26,27,48,70));line(Vector2(36,20),Vector2(26,27));line(Vector2(64,20),Vector2(74,27))
			if kind=="water":
				for y in [58,68,78]:line(Vector2(35,y),Vector2(65,y))
			else:draw_colored_polygon(PackedVector2Array([Vector2(54,39),Vector2(40,64),Vector2(51,64),Vector2(44,83),Vector2(64,57),Vector2(53,57)]),ink)
		"rations","greens":
			box(Rect2(22,26,56,63));line(Vector2(22,35),Vector2(78,35));line(Vector2(22,80),Vector2(78,80))
			line(Vector2(50,70),Vector2(50,45));line(Vector2(50,57),Vector2(37,48));line(Vector2(50,63),Vector2(64,49))
		"repair-kit":
			box(Rect2(16,31,68,55));box(Rect2(37,19,26,12))
			draw_rect(Rect2(44,42,12,32),ink);draw_rect(Rect2(34,52,32,12),ink)
		"scrap","alloy":
			box(Rect2(20,40,54,41));box(Rect2(29,24,54,39))
			for at in [Vector2(37,33),Vector2(75,33),Vector2(28,72),Vector2(66,72)]:draw_circle(at,2.5,ink)
		"signal-decoy":
			box(Rect2(33,57,34,34));line(Vector2(50,57),Vector2(50,24));draw_circle(Vector2(50,24),4,ink)
			for radius in [17,28]:draw_arc(Vector2(50,27),radius,-PI*.8,-PI*.2,24,ink,2.5,true)
		"ammo-rifle","ammo-shotgun":
			for x in [23,44,65]:
				box(Rect2(x,37,14,49));line(Vector2(x-2,86),Vector2(x+16,86))
				if kind=="ammo-rifle":line(Vector2(x,37),Vector2(x+7,24));line(Vector2(x+7,24),Vector2(x+14,37))
		"extended-mag":
			box(Rect2(30,23,40,65))
			for y in [38,51,64,77]:line(Vector2(39,y),Vector2(61,y))
		"rifle","shotgun":
			box(Rect2(12,41,55,16));line(Vector2(67,46),Vector2(93,46));line(Vector2(67,52),Vector2(93,52))
			box(Rect2(34,57,12,21));line(Vector2(22,57),Vector2(14,75));line(Vector2(12,41),Vector2(6,30))
		"salvage-cutter":
			box(Rect2(30,38,43,32));box(Rect2(36,70,13,24));line(Vector2(73,45),Vector2(91,29));line(Vector2(73,59),Vector2(94,45))
			line(Vector2(31,42),Vector2(17,27));line(Vector2(31,56),Vector2(13,42))
		_:
			box(Rect2(26,27,48,48));box(Rect2(38,39,24,24))
			for offset in [34,47,60,69]:
				line(Vector2(offset,17),Vector2(offset,27));line(Vector2(offset,75),Vector2(offset,85))
				line(Vector2(16,offset),Vector2(26,offset));line(Vector2(74,offset),Vector2(84,offset))
