shader_type spatial;
render_mode unshaded, cull_disabled;

// Bone-local blade coordinates: guard at y=0, point at y=-0.94.
// Bright travelling bands remain visible even when low quality disables bloom.
varying float blade_distance;
void vertex() {
	blade_distance = clamp((-VERTEX.y - 0.025) / 0.89, 0.0, 1.0);
}
void fragment() {
	float phase = fract(blade_distance - TIME * 1.45);
	float band = smoothstep(0.72, 0.89, phase) * (1.0 - smoothstep(0.94, 1.0, phase));
	float ripple = 0.5 + 0.5 * sin(blade_distance * 100.0 - TIME * 23.0);
	vec3 blue = mix(vec3(0.018, 0.20, 0.52), vec3(0.50, 0.88, 1.0), band);
	ALBEDO = blue;
	EMISSION = blue * (1.6 + 3.0 * band + 0.18 * ripple);
}
