class_name MMFInstrumentDisplay
extends Control

var activity
var kind="array"

func _ready():
	custom_minimum_size=Vector2(0,175)
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func _draw():
	draw_rect(Rect2(Vector2.ZERO,size),Color(.025,.075,.077))
	var v=activity.state(kind).values
	var font=ThemeDB.fallback_font
	for i in 3:
		var y=40+i*48
		draw_line(Vector2(90,y),Vector2(size.x-24,y),Color(.14,.25,.23))
		if kind=="array":
			var target=[25,60,85][i]
			draw_string(font,Vector2(12,y+5),str(target),HORIZONTAL_ALIGNMENT_LEFT,-1,20,Color(.96,.68,.26))
			var reference=PackedVector2Array();var received=PackedVector2Array()
			for step in 151:
				var t=float(step)/150
				var x=90+t*(size.x-118)
				reference.append(Vector2(x,y+sin(t*TAU*3)*14))
				received.append(Vector2(x,y+sin(t*TAU*3+(v[i]-target)*.07)*14))
			draw_polyline(reference,Color(.85,.58,.2,.6),1.3,true)
			draw_polyline(received,Color(.2,.9,.77),2,true)
		else:
			draw_string(font,Vector2(12,y+5),["REC","TRK","FUR"][i],HORIZONTAL_ALIGNMENT_LEFT,-1,19,Color(.6,.8,.75))
			for n in 4:
				var rect=Rect2(100+n*(size.x-140)/4.0,y-14,(size.x-160)/4.0,24)
				draw_rect(rect,Color(.15,.85,.65) if n<v[i] else Color(.1,.18,.18))
				draw_rect(rect,Color(.36,.54,.45),false,1)
