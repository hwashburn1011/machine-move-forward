class_name MMFTerminalFrame
extends Control

# Flat presentation of the same graphite case, alloy rails, copper selector
# and rubber keys authored in art/wrist-terminal.glb. Decoration never owns input.
const STATION_PAGES=["Workshop","Research","Console","Service","Signal","Helm","Machine","Storage","Equipment","Mission","Caretaker","Shelf","Painter","PortCrane","Story","Finale"]
const PAGES=["Pause","Settings","Library","Checkpoints","FinaleBrief"]+STATION_PAGES
var station_link=false
var glass=Rect2()
var housing=Rect2()
var font: Font
var screen_theme: Theme
var screen_style: StyleBoxFlat
var case_style: StyleBoxFlat
var gasket_style: StyleBoxFlat
var bezel_style: StyleBoxFlat
var key_style: StyleBoxFlat

static func plate(fill: Color,edge: Color,width: int,radius: int) -> StyleBoxFlat:
	var style=StyleBoxFlat.new();style.bg_color=fill;style.border_color=edge
	style.set_border_width_all(width);style.set_corner_radius_all(radius)
	return style

func setup(base: Theme):
	name="LinekeeperMenuHousing";mouse_filter=Control.MOUSE_FILTER_IGNORE;focus_mode=Control.FOCUS_NONE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	font=base.default_font
	case_style=plate(Color("293c38"),Color("60736a"),2,24)
	case_style.shadow_color=Color(0,0,0,.48);case_style.shadow_size=18;case_style.shadow_offset=Vector2(0,12)
	gasket_style=plate(Color("101a17"),Color("0b1210"),3,14)
	bezel_style=plate(Color("748277"),Color("9b9e87"),2,10)
	key_style=plate(Color("13201c"),Color("4a5548"),2,9)
	screen_style=plate(Color("0b1512"),Color("405348"),1,2);screen_style.set_content_margin_all(24)
	screen_theme=base.duplicate()
	var button=plate(Color("16251f"),Color("33483d"),1,3)
	button.content_margin_left=14;button.content_margin_right=14;button.content_margin_top=9;button.content_margin_bottom=9
	var hover=button.duplicate();hover.bg_color=Color("263d30");hover.border_color=Color("778772")
	var focus=plate(Color.TRANSPARENT,Color("b5b48a"),2,3)
	var disabled=button.duplicate();disabled.bg_color=Color("101c17");disabled.border_color=Color("24392e")
	for type in ["Button","CheckButton"]:
		screen_theme.set_stylebox("normal",type,button);screen_theme.set_stylebox("hover",type,hover)
		screen_theme.set_stylebox("pressed",type,hover);screen_theme.set_stylebox("focus",type,focus)
		screen_theme.set_stylebox("disabled",type,disabled)
		screen_theme.set_color("font_color",type,Color("c1cdb5"))
		screen_theme.set_color("font_focus_color",type,Color("e0e3c9"))
		screen_theme.set_color("font_hover_color",type,Color("e0e3c9"))
		screen_theme.set_color("font_pressed_color",type,Color("e0e3c9"))
	var track=plate(Color("17251f"),Color("3e5145"),1,3);track.set_content_margin_all(4)
	var filled=plate(Color("6b8060"),Color("7d9270"),1,3)
	screen_theme.set_stylebox("slider","HSlider",track)
	screen_theme.set_stylebox("grabber_area","HSlider",filled)
	screen_theme.set_stylebox("grabber_area_highlight","HSlider",filled)
	hide()

func layout(view_size: Vector2) -> Rect2:
	var dimensions=Vector2(minf(1320,view_size.x-64),minf(920,view_size.y-64))
	housing=Rect2((view_size-dimensions)*.5,dimensions)
	glass=Rect2(housing.position+Vector2(42,66),dimensions-Vector2(164,120))
	queue_redraw();return glass

func screw(at: Vector2):
	var corners=PackedVector2Array()
	for i in 6:corners.append(at+Vector2.from_angle(TAU*i/6)*10)
	draw_colored_polygon(corners,Color("869085"));draw_circle(at,6,Color("33423a"))
	draw_line(at-Vector2(5,0),at+Vector2(5,0),Color("101a16"),3,true)

func _draw():
	if housing.size==Vector2.ZERO:return
	draw_rect(Rect2(Vector2.ZERO,size),Color(.008,.013,.011,.46))
	draw_style_box(case_style,housing)
	draw_line(housing.position+Vector2(28,4),Vector2(housing.end.x-28,housing.position.y+4),Color("9c9b7f"),2,true)
	draw_style_box(gasket_style,glass.grow(19))
	draw_style_box(bezel_style,glass.grow(12))
	# Inner shaded edge gives the glass a recess instead of another flat outline.
	draw_rect(glass.grow(3),Color("111d18"))
	draw_line(glass.position-Vector2(2,2),Vector2(glass.end.x+2,glass.position.y-2),Color("202c23"),3,true)
	draw_line(Vector2(glass.position.x-2,glass.end.y+2),glass.end+Vector2(2,2),Color("b3a881"),2,true)
	var spine=housing.end.x-56
	draw_string(font,housing.position+Vector2(43,38),"LINEKEEPER  /  4",HORIZONTAL_ALIGNMENT_LEFT,-1,19,Color("c0c7ad"))
	draw_string(font,Vector2(glass.end.x-235,housing.position.y+38),"S–07  ·  EQUIPMENT LINK" if station_link else "S–07  ·  FIELD TERMINAL",HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color("96a88f"))
	for at in [housing.position+Vector2(22,24),Vector2(housing.end.x-22,housing.position.y+24),housing.end-Vector2(22,24),Vector2(housing.position.x+22,housing.end.y-24)]:screw(at)
	var lamp=Vector2(spine,glass.position.y+13)
	draw_circle(lamp,9,Color("0f1b14"));draw_circle(lamp,5,Color("a2b77c"))
	var dial=Vector2(spine,glass.position.y+91)
	draw_circle(dial+Vector2(0,5),35,Color("101914"));draw_circle(dial,34,Color("765b38"))
	for i in 24:
		var direction=Vector2.from_angle(TAU*i/24)
		draw_line(dial+direction*28,dial+direction*33,Color("b1a080"),2,true)
	draw_circle(dial,26,Color("615d42"));draw_line(dial-Vector2(0,22),dial-Vector2(0,8),Color("bac1a4"),4,true)
	for i in 3:
		var at=Vector2(spine-24,glass.position.y+glass.size.y*(.41+i*.18))
		draw_style_box(key_style,Rect2(at,Vector2(48,44)))
		draw_line(at+Vector2(16,22),at+Vector2(32,22),Color("94a08b"),3,true)
	draw_string(font,Vector2(spine-22,housing.end.y-51),"S07",HORIZONTAL_ALIGNMENT_LEFT,-1,19,Color("9cad96"))
	draw_string(font,Vector2(glass.position.x,housing.end.y-22),"LK / 4",HORIZONTAL_ALIGNMENT_LEFT,-1,14,Color("99a88e"))
	for i in 9:
		var at=Vector2(glass.position.x+110+i*31,housing.end.y-29)
		draw_style_box(gasket_style,Rect2(at,Vector2(18,5)))
