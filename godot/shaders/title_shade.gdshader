shader_type canvas_item;
render_mode unshaded;

void fragment() {
	float left = 1.0 - smoothstep(0.03, 0.64, UV.x);
	float foot = smoothstep(0.65, 1.0, UV.y) * 0.28;
	float edge = pow(abs(UV.y - 0.5) * 2.0, 3.0) * 0.10;
	COLOR = vec4(0.025, 0.039, 0.036, min(0.91, left * 0.88 + foot + edge));
}
