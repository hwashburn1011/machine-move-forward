shader_type spatial;
render_mode blend_mix, depth_draw_never;
uniform float glow_energy = 2.0;
void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.8;
	EMISSION = COLOR.rgb * glow_energy;
	ALPHA = COLOR.a;
}
