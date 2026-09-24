shader_type spatial;
uniform float phase = 0.0;
void fragment() {
	float cycle = mod(TIME + phase, 4.7);
	float glow = 0.18 + smoothstep(0.28, 0.34, cycle) * (1.0 - smoothstep(0.5, 0.64, cycle));
	ALBEDO = vec3(0.53,0.12,0.016);
	EMISSION = vec3(1.0,0.24,0.015) * glow * 1.8;
	ROUGHNESS = 0.28;
	METALLIC = 0.1;
}
