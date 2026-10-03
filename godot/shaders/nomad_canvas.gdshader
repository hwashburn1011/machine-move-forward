shader_type spatial;
render_mode cull_disabled;

uniform sampler2D base_map : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_map : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D orm_map : filter_linear_mipmap_anisotropic, repeat_enable;
uniform float cloth_time = 0.0;
uniform float wind_strength = 0.45;

void vertex() {
	// Shared parameter-space motion keeps stitched panels and repair patches
	// attached. Vertex alpha contains the authored weight, zero at each anchor.
	float wave = sin(cloth_time * 1.35 + UV.x * 12.0 + UV.y * 3.0) * .65;
	wave += sin(cloth_time * 2.1 - UV.y * 9.0 + UV.x * 2.0) * .35;
	VERTEX.y += .035 * wind_strength * COLOR.a * wave;
}

void fragment() {
	ALBEDO = texture(base_map, UV).rgb * COLOR.rgb;
	ROUGHNESS = texture(orm_map, UV).g;
	METALLIC = 0.0;
	NORMAL_MAP = texture(normal_map, UV * 24.0).rgb;
	NORMAL_MAP_DEPTH = .28;
}
