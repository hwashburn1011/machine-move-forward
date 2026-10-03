class_name MMFOpeningLetter
extends Control

# One clock controls ink, the two-second hold, and the physical paper burn.
# No voice track: this is a private account, read at the player's own pace.
const READ_START=1.5
const READ_END=39.5
const BURN_START=READ_END+2.0
const BURN_END=BURN_START+5.0
const DURATION=BURN_END+1.0
const TEXT="We built them to keep the wells running.\n\nBy the time the drought reached our city, there were too few of us left to carry water, mend the rails, or bury the dead. The machines could work through the heat. For a while, that felt like mercy.\n\nI signed the order that let them decide which roads stayed open. Three days later, the gates closed with our families still outside. We called it a fault. They called it keeping us safe.\n\nSome of us kept a line open. Some machines helped. I still don't know why.\n\nWe didn't realize what we were making.\nWe didn't know if we could control it...\nWell, we know now."
const PAPER_SIZE=Vector2i(1280,1040)
var viewport: SubViewport
var ink: LetterInk
var paper: TextureRect
var paper_material: ShaderMaterial
var elapsed=0.0

class LetterInk extends Control:
	var font=preload("res://assets/fonts/marck-script/MarckScript-Regular.ttf")
	var words=[]
	var progress=0.0
	var bottom=0.0

	func _ready():
		var pen=Vector2(126,174)
		for paragraph in MMFOpeningLetter.TEXT.split("\n"):
			if paragraph.is_empty():pen.y+=20;continue
			for word in paragraph.split(" "):
				var width=font.get_string_size(word+" ",HORIZONTAL_ALIGNMENT_LEFT,-1,40).x
				if pen.x+width>1154:pen.x=126;pen.y+=49
				words.append({"text":word,"position":pen});pen.x+=width
			pen.x=126;pen.y+=49
		bottom=pen.y

	func _draw():
		draw_string(font,Vector2(126,103),"Transfer Hall 04 — a page left behind",HORIZONTAL_ALIGNMENT_LEFT,-1,30,Color("665342"))
		for i in words.size():
			var amount=smoothstep(float(i)-.8,float(i)+.8,progress*words.size())
			draw_string(font,words[i].position,words[i].text,HORIZONTAL_ALIGNMENT_LEFT,-1,40,Color("756652").lerp(Color("211e1a"),amount))

func setup():
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var black=ColorRect.new();black.color=Color.BLACK;black.mouse_filter=Control.MOUSE_FILTER_IGNORE;black.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);add_child(black)
	viewport=SubViewport.new();viewport.size=PAPER_SIZE;viewport.transparent_bg=true;viewport.disable_3d=true;viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED;add_child(viewport)
	ink=LetterInk.new();viewport.add_child(ink)
	paper=TextureRect.new();paper.mouse_filter=Control.MOUSE_FILTER_IGNORE;paper.texture=viewport.get_texture();paper.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;add_child(paper)
	paper_material=ShaderMaterial.new();paper_material.shader=preload("res://shaders/opening_paper.gdshader");paper.material=paper_material
	hide()

func sample(at: float):
	elapsed=at;show()
	var area=get_viewport_rect().size
	var fit=minf((area.x-44)/PAPER_SIZE.x,(area.y-76)/PAPER_SIZE.y)
	paper.size=Vector2(PAPER_SIZE)*fit;paper.position=(area-paper.size)*.5
	ink.progress=clampf((at-READ_START)/(READ_END-READ_START),0,1);ink.queue_redraw()
	viewport.render_target_update_mode=SubViewport.UPDATE_ONCE
	paper_material.set_shader_parameter("burn",clampf((at-BURN_START)/(BURN_END-BURN_START),0,1))
	paper_material.set_shader_parameter("seconds",at)
	paper.modulate.a=smoothstep(0,1.2,at)*(1-smoothstep(BURN_END-.15,BURN_END+.45,at))

func stop():
	hide();viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED

