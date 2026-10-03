shader_type spatial;
uniform vec4 base_color : source_color = vec4(0.12,0.14,0.13,1.0);
uniform float metalness = 0.6;
varying vec3 local_position;
float grain(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p,p.yzx + 33.33);
	return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p) {
	vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.0-2.0*f);
	return mix(mix(mix(grain(i),grain(i+vec3(1,0,0)),f.x),mix(grain(i+vec3(0,1,0)),grain(i+vec3(1,1,0)),f.x),f.y),mix(mix(grain(i+vec3(0,0,1)),grain(i+vec3(1,0,1)),f.x),mix(grain(i+vec3(0,1,1)),grain(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void vertex() { local_position=VERTEX; }
void fragment() {
	float wear=noise3(local_position*17.0)*0.7+noise3(local_position*51.0)*0.3;
	float rust=smoothstep(0.48,0.68,wear);
	ALBEDO=mix(base_color.rgb,vec3(0.23,0.075,0.025),rust*0.8);
	ALBEDO*=0.92+noise3(local_position*110.0)*0.16;
	METALLIC=mix(metalness,0.12,rust);
	ROUGHNESS=mix(0.53,0.88,rust);
}
