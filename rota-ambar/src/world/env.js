// Ambiente compartilhado pelos materiais: cores do céu, sol e noite.
// Permite reflexos baratos (sem cubemap): o "ambiente" é o próprio gradiente do céu.
import * as THREE from 'three';

export const ENV = {
  uSkyTop: { value: new THREE.Color(0x3f7fc8) },
  uSkyHor: { value: new THREE.Color(0xb5d8f0) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(0xffffff) },
  uGnd: { value: new THREE.Color(0x202226) },
  uNight: { value: 0 },
};

export const ENV_PARS = `
uniform vec3 uSkyTop, uSkyHor, uSunDir, uSunCol, uGnd;
uniform float uNight;
vec3 envColor(vec3 r) {
  return r.y > 0.0 ? mix(uSkyHor, uSkyTop, pow(r.y, 0.55)) : mix(uSkyHor * 0.55, uGnd, clamp(-r.y * 4.0, 0.0, 1.0));
}
float ehash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

export function bindEnv(shader) { for (const k in ENV) shader.uniforms[k] = ENV[k]; }

// Lataria/vidro brilhantes: reflexo do céu com fresnel + brilho do sol.
// mode 'paint' = tudo reflete; 'detail' = só os vidros (identificados pela cor do vértice).
export function glossy(mat, mode) {
  mat.onBeforeCompile = (sh) => {
    bindEnv(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ENV_PARS)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 gV = normalize(vViewPosition);
        vec3 gR = inverseTransformDirection(reflect(-gV, normal), viewMatrix);
        float gF = pow(1.0 - clamp(dot(normal, gV), 0.0, 1.0), 4.0);
        ${mode === 'paint'
    ? 'float gK = 0.04 + 0.3 * gF; float gS = 1.1;'
    : 'float gG = step(vColor.b, 0.06) * step(2.0 * vColor.r, vColor.b); float gK = (0.22 + 0.78 * gF) * gG; float gS = 1.6 * gG;'}
        totalEmissiveRadiance += envColor(gR) * gK * 0.85 + uSunCol * pow(max(dot(gR, uSunDir), 0.0), 140.0) * gS;
        diffuseColor.rgb *= 1.0 - gK * 0.45;
      }`);
  };
  mat.customProgramCacheKey = () => 'glossy-' + mode;
  return mat;
}
