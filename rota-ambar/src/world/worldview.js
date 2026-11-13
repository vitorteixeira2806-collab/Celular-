// Renderização do mundo: chunks carregados sob demanda, malhas mescladas (poucos draw calls),
// janelas procedurais via shader, céu com ciclo dia/noite e mar.
import * as THREE from 'three';
import { Geo, C, shade, mix } from './geo.js';
import { CHUNK, RING, WATER_Y, laneWidth } from './map.js';
import { clamp, lerp, smoothstep, fbm, hash2 } from '../core/util.js';
import { signalColor } from './signals.js';

const COL = {
  asphalt: C(0x3a3d42), highway: C(0x34373c), mountain: C(0x424440), dock: C(0x4b4c4e),
  white: C(0xe8e6de), yellow: C(0xe0b030), sidewalk: C(0xb4afa5), plaza: C(0x9d978b), concrete: C(0x8a8a86),
  grassA: C(0x5d8c3c), grassB: C(0x7ba549), rock: C(0x7c776a), sandA: C(0xe8d6a4), sandB: C(0xd2bd8a), wet: C(0x8f9f86),
  dirt: C(0x7b6a4f), trunk: C(0x6b4a2f), leafA: C(0x3c7a38), leafB: C(0x5c9a3e), pine: C(0x2f5e3a), palm: C(0x3f8f4a),
  pole: C(0x565c64), lampHead: C(0xfff0c0), cont: [0xc8553d, 0x2f6f9f, 0x3d8f5f, 0xd9a441, 0x8a8f96, 0x7b3f6e].map(C),
  ramp: C(0xe07a1f), rampSide: C(0x8a4a16), parkGrass: C(0x6a9f48), yard: C(0x79a852),
};

// ---------- Hora do dia ----------
const K = (t, top, hor, sun, sunI, hemiSky, hemiGnd, hemiI) => ({
  t, top: new THREE.Color(top), hor: new THREE.Color(hor), sun: new THREE.Color(sun), sunI,
  hs: new THREE.Color(hemiSky), hg: new THREE.Color(hemiGnd), hemiI,
});
const TOD = [
  K(0.0, 0x050915, 0x18223a, 0x9db0e6, 0.5, 0x6477a8, 0x2c3140, 1.0),
  K(0.19, 0x070c1c, 0x1c2640, 0x9db0e6, 0.5, 0x6477a8, 0x2c3140, 1.0),
  K(0.25, 0x33507c, 0xf2a46a, 0xffb27a, 0.95, 0x9fb0d0, 0x5a4c44, 0.85),
  K(0.32, 0x3d7cc6, 0xb9daf0, 0xfff1dc, 1.6, 0xcfe4ff, 0x6b6558, 1.1),
  K(0.64, 0x3f7fc8, 0xb5d8f0, 0xfff1dc, 1.65, 0xcfe4ff, 0x6b6558, 1.1),
  K(0.72, 0x47609e, 0xf7b267, 0xffc487, 1.35, 0xd8c8c0, 0x6b5a4c, 1.0),
  K(0.765, 0x3b3a70, 0xff8436, 0xff8a3c, 1.05, 0xc8a8a8, 0x6a5246, 1.0),
  K(0.8, 0x1c1f4a, 0x8a4058, 0xff7050, 0.4, 0x7a78a8, 0x3a3644, 0.95),
  K(0.85, 0x050915, 0x18223a, 0x9db0e6, 0.5, 0x6477a8, 0x2c3140, 1.0),
  K(1.0, 0x050915, 0x18223a, 0x9db0e6, 0.5, 0x6477a8, 0x2c3140, 1.0),
];

export class WorldView {
  constructor(scene, map, lights) {
    this.scene = scene; this.map = map; this.hemi = lights.hemi; this.sun = lights.sun;
    this.chunks = new Map();
    this.queue = [];
    this.radius = 3; this.propDist = 300; this.fogFar = 560;
    this.ccx = 1e9; this.ccz = 1e9;
    this.tod = 0.66; this.night = 0; this.dayLen = 540;
    this.uni = { night: { value: 0 } };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.Fog(0xb5d8f0, 120, this.fogFar);

    this.mGround = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mDecal = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    this.mProp = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mStatic = this.makeStaticMat();
    this.mGlow = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    this.mSignal = new THREE.ShaderMaterial({
      uniforms: { uState: { value: new THREE.Vector4(0, 0, 0, 0) } },
      vertexShader: 'attribute vec2 sig; varying vec2 vSig; void main(){ vSig = sig; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec4 uState; varying vec2 vSig;
        void main(){
          float st = vSig.x < 0.5 ? uState.x : vSig.x < 1.5 ? uState.y : vSig.x < 2.5 ? uState.z : uState.w;
          vec3 col = vSig.y < 0.5 ? vec3(1.0, 0.1, 0.06) : vSig.y < 1.5 ? vec3(1.0, 0.72, 0.08) : vec3(0.1, 1.0, 0.3);
          float on = 1.0 - step(0.5, abs(st - vSig.y));
          gl_FragColor = vec4(col * mix(0.1, 1.4, on), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.buildSky();
    this.buildSea();
    this.buildBase();
    this.setTime(this.tod);
  }

  makeStaticMat() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uni = this.uni;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = uni.night;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 binfo;\nvarying vec3 vInfo;\nvarying vec2 vBuv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = binfo; vBuv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vInfo;\nvarying vec2 vBuv;\nfloat bhash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
        if (vInfo.y > 0.5 && vBuv.y > -0.5) {
          vec2 cell; vec4 wr;
          if (vInfo.y < 1.5) { cell = vec2(2.8, 3.5); wr = vec4(0.08, 0.92, 0.22, 0.86); }
          else if (vInfo.y < 2.5) { cell = vec2(3.8, 3.1); wr = vec4(0.22, 0.78, 0.3, 0.78); }
          else if (vInfo.y < 3.5) { cell = vec2(6.5, 5.5); wr = vec4(0.15, 0.85, 0.58, 0.84); }
          else { cell = vec2(4.4, 3.3); wr = vec4(0.3, 0.7, 0.36, 0.74); }
          vec2 g = vBuv / cell;
          vec2 id = floor(g); vec2 f = fract(g);
          float win = step(wr.x, f.x) * step(f.x, wr.y) * step(wr.z, f.y) * step(f.y, wr.w);
          float cov = (wr.y - wr.x) * (wr.w - wr.z);
          float aa = clamp(1.6 - max(fwidth(g.x), fwidth(g.y)) * 2.2, 0.0, 1.0);
          float rnd = bhash(id + floor(vInfo.x * 997.0 + 0.5));
          float w = mix(cov, win, aa);
          vec3 glass = mix(vec3(0.03, 0.06, 0.1), vec3(0.12, 0.22, 0.32), rnd);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, w * 0.85);
          float on = step(rnd, uNight * vInfo.z * 0.75);
          float lit = mix(cov * uNight * vInfo.z * 0.75, win * on, aa);
          vec3 lc = mix(vec3(1.0, 0.7, 0.32), vec3(0.6, 0.78, 1.0), step(0.82, fract(rnd * 7.31)));
          totalEmissiveRadiance += lc * lit * 0.75;
        }`);
    };
    return m;
  }

  // ---------- Céu ----------
  buildSky() {
    this.skyU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uGlow: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uHor, uSunCol, uSunDir; uniform float uNight, uGlow; varying vec3 vDir;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHor, uTop, pow(h, 0.5));
          if (d.y < 0.0) col = mix(uHor, uHor * 0.55, clamp(-d.y * 5.0, 0.0, 1.0));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (smoothstep(0.9993, 0.9997, sd) * 1.6 + pow(sd, 90.0) * 0.5 * uGlow + pow(sd, 8.0) * 0.22 * uGlow);
          if (uNight > 0.02 && d.y > 0.0) {
            vec3 p = d * 110.0; vec3 ip = floor(p);
            float r = h3(ip);
            float star = step(0.992, r) * smoothstep(0.45, 0.1, length(fract(p) - 0.5));
            col += star * uNight * (0.5 + 0.5 * fract(r * 91.7)) * smoothstep(0.0, 0.25, d.y);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 24, 14), mat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  buildSea() {
    this.seaU = {
      uDeep: { value: new THREE.Color(0x1d5a7a) }, uShal: { value: new THREE.Color(0x3fa3a8) }, uHor: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() }, uFog: { value: new THREE.Vector2(120, 560) }, uLight: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaU, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uDeep, uShal, uHor, uSunCol, uSunDir, uCam; uniform float uTime, uLight; uniform vec2 uFog; varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          float w = sin(p.x * 0.11 + uTime * 0.9) * sin(p.y * 0.17 - uTime * 1.2) + sin(p.x * 0.031 - p.y * 0.043 + uTime * 0.5);
          vec3 col = mix(uDeep, uShal, clamp(smoothstep(560.0, 470.0, vW.z) * 0.75 + w * 0.06, 0.0, 1.0)) * uLight;
          float foam = smoothstep(0.75, 1.0, sin(vW.z * 0.9 - uTime * 1.4 + sin(p.x * 0.07) * 2.0)) * smoothstep(512.0, 486.0, vW.z);
          col = mix(col, vec3(0.9) * uLight, foam * 0.5);
          vec3 v = normalize(uCam - vW);
          vec3 n = normalize(vec3(sin(p.x * 0.33 + uTime) * 0.09 + sin(p.y * 0.7 + uTime * 1.7) * 0.05, 1.0, cos(p.y * 0.41 - uTime * 1.3) * 0.09));
          float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 70.0);
          col += uSunCol * spec * 0.7;
          float fres = pow(1.0 - max(v.y, 0.0), 3.0);
          col = mix(col, uHor, fres * 0.55);
          float dist = length(vW - uCam);
          col = mix(col, uHor, smoothstep(uFog.x, uFog.y, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const g = new THREE.PlaneGeometry(9000, 5000, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(g, mat);
    this.sea.position.set(0, WATER_Y, 440 + 2500);
    this.scene.add(this.sea);
  }

  // base global: gramado plano dentro do anel, asfalto da malha e plataforma do porto
  buildBase() {
    const m = this.map, g = new Geo();
    const ax0 = m.GX[0] - 5, ax1 = m.GX[m.NX - 1] + 5, az0 = m.GZ[0] - 5, az1 = RING.z1 - 12.5;
    const fx0 = -966, fx1 = 966, fz0 = -636, fz1 = 440;
    const cs = 46;
    for (let x = fx0; x < fx1; x += cs) for (let z = fz0; z < fz1; z += cs) {
      const x1 = Math.min(fx1, x + cs), z1 = Math.min(fz1, z + cs);
      if (x >= ax0 && x1 <= ax1 && z >= az0 && z1 <= az1) continue;
      const c = (px, pz) => mix(COL.grassA, COL.grassB, fbm(px / 90, pz / 90, 2));
      g.tri([x, -0.03, z1], [x1, -0.03, z1], [x1, -0.03, z], c(x, z1), c(x1, z1), c(x1, z));
      g.tri([x, -0.03, z1], [x1, -0.03, z], [x, -0.03, z], c(x, z1), c(x1, z), c(x, z));
    }
    g.up([ax0, 0, az1], [ax1, 0, az1], [ax1, 0, az0], [ax0, 0, az0], COL.asphalt);
    // porto: laje + paredes do cais
    const P = m.PORT;
    g.up([P.x0, 0, P.z1], [P.x1, 0, P.z1], [P.x1, 0, P.z0], [P.x0, 0, P.z0], COL.concrete);
    const wall = shade(COL.concrete, 0.6);
    g.quad([P.x0, -7, P.z1], [P.x1, -7, P.z1], [P.x1, 0, P.z1], [P.x0, 0, P.z1], wall);
    g.quad([P.x0, -7, P.z0], [P.x0, -7, P.z1], [P.x0, 0, P.z1], [P.x0, 0, P.z0], wall);
    g.quad([P.x1, -7, P.z1], [P.x1, -7, P.z0], [P.x1, 0, P.z0], [P.x1, 0, P.z1], wall);
    // faixa amarela na borda do cais
    g.up([P.x0, 0.03, P.z1 - 0.2], [P.x1, 0.03, P.z1 - 0.2], [P.x1, 0.03, P.z1 - 1], [P.x0, 0.03, P.z1 - 1], COL.yellow);
    const mesh = new THREE.Mesh(g.build(), this.mGround);
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = -1;
    this.scene.add(mesh);
    this.base = mesh;
  }

  // ---------- Qualidade ----------
  setQuality(q) {
    this.radius = q.radius; this.propDist = q.propDist; this.fogFar = q.fogFar;
    this.scene.fog.near = q.fogFar * 0.3; this.scene.fog.far = q.fogFar;
    this.seaU.uFog.value.set(q.fogFar * 0.3, q.fogFar);
    this.ccx = 1e9;
  }

  // ---------- Hora do dia ----------
  setTime(t) {
    t = ((t % 1) + 1) % 1;
    this.tod = t;
    let i = 0;
    while (i < TOD.length - 2 && TOD[i + 1].t <= t) i++;
    const a = TOD[i], b = TOD[i + 1];
    const f = clamp((t - a.t) / (b.t - a.t || 1), 0, 1);
    const top = this.skyU.uTop.value.copy(a.top).lerp(b.top, f);
    const hor = this.skyU.uHor.value.copy(a.hor).lerp(b.hor, f);
    this.sun.color.copy(a.sun).lerp(b.sun, f);
    this.sun.intensity = lerp(a.sunI, b.sunI, f);
    this.hemi.color.copy(a.hs).lerp(b.hs, f);
    this.hemi.groundColor.copy(a.hg).lerp(b.hg, f);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, f);
    this.scene.fog.color.copy(hor);
    // sol: nasce a leste, se põe sobre o mar (sudoeste)
    const ang = ((t - 0.25) / 0.52) * Math.PI; // 0 no nascer (0.25), PI no pôr (0.77)
    const el = Math.sin(ang);
    const sd = this.sunDir.set(Math.cos(ang) * 0.82, el, 0.5 - Math.cos(ang) * 0.08).normalize();
    this.night = 1 - smoothstep(-0.1, 0.12, el);
    const isDay = el > -0.08;
    if (isDay) this.lightDir = sd; else this.lightDir = this._moon || (this._moon = new THREE.Vector3(-0.4, 0.75, -0.35).normalize());
    this.skyU.uSunDir.value.copy(sd);
    this.skyU.uSunCol.value.copy(this.sun.color).multiplyScalar(isDay ? 1 : 0);
    this.skyU.uNight.value = this.night;
    this.skyU.uGlow.value = 1 + (1 - Math.abs(el)) * 1.5;
    this.uni.night.value = this.night;
    this.seaU.uHor.value.copy(hor);
    this.seaU.uSunDir.value.copy(sd);
    this.seaU.uSunCol.value.copy(this.sun.color).multiplyScalar(isDay ? clamp(el * 4 + 0.3, 0, 1) : 0);
    this.seaU.uLight.value = lerp(0.16, 1, 1 - this.night) * (0.75 + 0.25 * clamp(el, 0, 1));
    this.mGlow.color.setScalar(smoothstep(0.25, 0.8, this.night));
    this.topColor = top;
  }

  update(dt, cam, time, paused) {
    if (!paused) this.setTime(this.tod + (dt / this.dayLen) * (this.night > 0.6 ? 1.7 : 1));
    this.sky.position.copy(cam.position);
    this.seaU.uTime.value = time;
    this.seaU.uCam.value.copy(cam.position);
    this.sea.position.x = Math.round(cam.position.x / 200) * 200;
    // luz direcional acompanha a câmera
    const L = this.lightDir;
    this.sun.position.set(cam.position.x + L.x * 300, cam.position.y + L.y * 300, cam.position.z + L.z * 300);
    this.sun.target.position.copy(cam.position);
    this.sun.target.updateMatrixWorld();
    // semáforos
    this.mSignal.uniforms.uState.value.set(signalColor(0, 0, time), signalColor(0, 1, time), signalColor(1, 0, time), signalColor(1, 1, time));
    this.stream(cam.position.x, cam.position.z);
  }

  // ---------- Streaming de chunks ----------
  stream(px, pz) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const R = this.radius;
    if (cx !== this.ccx || cz !== this.ccz) {
      this.ccx = cx; this.ccz = cz;
      const want = [];
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const d = Math.hypot(dx, dz);
        if (d > R + 0.5) continue;
        const k = this.map.chunkKey(cx + dx, cz + dz);
        if (!this.chunks.has(k)) want.push({ k, cx: cx + dx, cz: cz + dz, d });
      }
      want.sort((a, b) => a.d - b.d);
      this.queue = want;
      for (const [k, ch] of this.chunks) {
        if (Math.hypot(ch.cx - cx, ch.cz - cz) > R + 1.6) { this.disposeChunk(ch); this.chunks.delete(k); }
      }
    }
    if (this.queue.length) {
      const t0 = performance.now();
      do {
        const q = this.queue.shift();
        if (!this.chunks.has(q.k)) this.chunks.set(q.k, this.buildChunk(q.cx, q.cz));
      } while (this.queue.length && performance.now() - t0 < (this.fast ? 400 : 5));
    }
    const pd2 = this.propDist * this.propDist;
    const nightOn = this.night > 0.25;
    for (const ch of this.chunks.values()) {
      const dx = ch.mx - px, dz = ch.mz - pz;
      const near = dx * dx + dz * dz < pd2;
      if (ch.near) ch.near.visible = near;
      if (ch.glow) ch.glow.visible = near && nightOn;
    }
  }
  // carrega tudo ao redor de uma posição de uma vez (teleporte, início)
  preload(px, pz) {
    this.fast = true;
    this.ccx = 1e9;
    this.stream(px, pz);
    this.fast = false;
  }
  get loading() { return this.queue.length; }

  disposeChunk(ch) {
    this.group.remove(ch.group);
    ch.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  buildChunk(cx, cz) {
    const map = this.map;
    const data = map.chunks.get(map.chunkKey(cx, cz));
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const group = new THREE.Group();
    const ch = { cx, cz, group, mx: x0 + CHUNK / 2, mz: z0 + CHUNK / 2, near: null, glow: null };
    const ground = new Geo(), decal = new Geo(), stat = new Geo({ uv: true, info: true }), prop = new Geo(), glow = new Geo();
    const sig = { geo: new Geo(), sig: [] };
    this.terrain(ground, x0, z0);
    if (data) {
      for (const b of data.blocks) this.slab(ground, b);
      for (const [e, i] of data.segs) this.road(decal, e, i);
      for (const b of data.buildings) this.building(stat, b);
      for (const r of data.ramps) this.ramp(stat, r);
      for (const p of data.props) this.prop(p, stat, prop, glow);
      for (const n of data.nodes) if (n.signal >= 0) this.signalPoles(n, prop, sig);
    }
    const add = (geo, mat, o = {}) => {
      if (!geo.count) return null;
      const mesh = new THREE.Mesh(geo.build(), mat);
      mesh.matrixAutoUpdate = false;
      if (o.cast) mesh.castShadow = true;
      if (o.recv) mesh.receiveShadow = true;
      (o.parent || group).add(mesh);
      return mesh;
    };
    add(ground, this.mGround, { recv: true });
    add(decal, this.mDecal, { recv: true });
    add(stat, this.mStatic, { cast: true, recv: true });
    if (prop.count || sig.geo.count) {
      ch.near = new THREE.Group();
      group.add(ch.near);
      add(prop, this.mProp, { parent: ch.near });
      if (sig.geo.count) {
        const sg = sig.geo.build();
        sg.setAttribute('sig', new THREE.Float32BufferAttribute(sig.sig, 2));
        const mesh = new THREE.Mesh(sg, this.mSignal);
        mesh.matrixAutoUpdate = false;
        ch.near.add(mesh);
      }
    }
    ch.glow = add(glow, this.mGlow);
    if (ch.glow) ch.glow.renderOrder = 2;
    this.group.add(group);
    return ch;
  }

  // ---------- Terreno ----------
  terrain(g, x0, z0) {
    const map = this.map;
    if (z0 >= 800) return;
    const flat = (x, z) => x >= -966 && x <= 966 && z >= -636 && z <= 440;
    if (flat(x0, z0) && flat(x0 + CHUNK, z0 + CHUNK)) return;
    const N = z0 < -600 ? 20 : 16, cs = CHUNK / N;
    const H = [], Cc = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = x0 + i * cs, z = z0 + j * cs;
      let h = map.groundBase(x, z);
      if (z < -600 && map.mountainInfo(x, z).d < 9.5) h -= 0.5;
      if (map.inPort(x, z)) h = -1.5;
      H.push(h);
    }
    const at = (i, j) => H[j * (N + 1) + i];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = x0 + i * cs, z = z0 + j * cs, h = at(i, j);
      const hx = at(Math.min(N, i + 1), j) - at(Math.max(0, i - 1), j), hz = at(i, Math.min(N, j + 1)) - at(i, Math.max(0, j - 1));
      const slope = Math.hypot(hx, hz) / (2 * cs);
      let c;
      if (z > 441 && !(Math.abs(x) > 990 && z < 452)) {
        c = mix(COL.sandA, COL.sandB, fbm(x / 30, z / 30, 2));
        if (h < -0.2) c = mix(c, COL.wet, clamp((-h - 0.2) / 1.2, 0, 1));
      } else {
        c = mix(COL.grassA, COL.grassB, fbm(x / 90, z / 90, 2));
        c = mix(c, COL.rock, clamp((slope - 0.42) * 3.2, 0, 1) * 0.9 + clamp((h - 95) / 40, 0, 0.5));
      }
      Cc.push(c);
    }
    const cat = (i, j) => Cc[j * (N + 1) + i];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const xa = x0 + i * cs, xb = xa + cs, za = z0 + j * cs, zb = za + cs;
      if (flat(xa, za) && flat(xb, zb)) continue;
      const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
      if (h00 < -4 && h10 < -4 && h01 < -4 && h11 < -4) continue;
      const A = [xa, h01, zb], B = [xb, h11, zb], Cq = [xb, h10, za], D = [xa, h00, za];
      if ((i + j) & 1) {
        g.tri(A, B, Cq, cat(i, j + 1), cat(i + 1, j + 1), cat(i + 1, j));
        g.tri(A, Cq, D, cat(i, j + 1), cat(i + 1, j), cat(i, j));
      } else {
        g.tri(A, B, D, cat(i, j + 1), cat(i + 1, j + 1), cat(i, j));
        g.tri(B, Cq, D, cat(i + 1, j + 1), cat(i + 1, j), cat(i, j));
      }
    }
  }

  // ---------- Quarteirão (calçada + miolo) ----------
  slab(g, b) {
    const y = 0.08, s = 3.2;
    const { x0, z0, x1, z1 } = b;
    const D = b.district;
    const inner = D === 'residencial' ? COL.yard : D === 'parque' ? COL.parkGrass : D === 'industrial' || D === 'porto' || D === 'oficina' ? COL.concrete : D === 'orla' ? mix(COL.plaza, COL.sandA, 0.35) : COL.plaza;
    const ix0 = x0 + s, ix1 = x1 - s, iz0 = z0 + s, iz1 = z1 - s;
    const sw = COL.sidewalk;
    g.up([x0, y, z0], [x1, y, z0], [ix1, y, iz0], [ix0, y, iz0], sw);
    g.up([x0, y, z1], [x1, y, z1], [ix1, y, iz1], [ix0, y, iz1], sw);
    g.up([x0, y, z0], [ix0, y, iz0], [ix0, y, iz1], [x0, y, z1], sw);
    g.up([x1, y, z0], [ix1, y, iz0], [ix1, y, iz1], [x1, y, z1], sw);
    g.up([ix0, y, iz0], [ix1, y, iz0], [ix1, y, iz1], [ix0, y, iz1], inner);
    // meio-fio
    const cb = shade(sw, 0.72);
    g.quad([x0, 0, z1], [x1, 0, z1], [x1, y, z1], [x0, y, z1], cb);
    g.quad([x1, 0, z0], [x0, 0, z0], [x0, y, z0], [x1, y, z0], cb);
    g.quad([x1, 0, z1], [x1, 0, z0], [x1, y, z0], [x1, y, z1], cb);
    g.quad([x0, 0, z0], [x0, 0, z1], [x0, y, z1], [x0, y, z0], cb);
    if (D === 'parque') {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, p = COL.plaza;
      g.up([cx - 3, y + 0.02, iz0], [cx + 3, y + 0.02, iz0], [cx + 3, y + 0.02, iz1], [cx - 3, y + 0.02, iz1], p);
      g.up([ix0, y + 0.02, cz - 3], [ix1, y + 0.02, cz - 3], [ix1, y + 0.02, cz + 3], [ix0, y + 0.02, cz + 3], p);
    }
  }

  // ---------- Vias e sinalização ----------
  normals(e) {
    if (e.nrm) return e.nrm;
    const p = e.pts, n = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      n.push({ x: -(b.z - a.z) / l, z: (b.x - a.x) / l });
    }
    return (e.nrm = n);
  }

  road(g, e, i) {
    const map = this.map;
    const p = e.pts, a = p[i], b = p[i + 1], N = this.normals(e), na = N[i], nb = N[i + 1];
    const hw = e.width / 2;
    const mtn = e.type === 'mountain';
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const inBase = mx > map.GX[0] - 5 && mx < map.GX[map.NX - 1] + 5 && mz > map.GZ[0] - 5 && mz < RING.z1 - 12.5;
    const ya = (a.y || 0) + 0.03, yb = (b.y || 0) + 0.03;
    const P = (t, off, dy) => [lerp(a.x, b.x, t) + lerp(na.x, nb.x, t) * off, lerp(ya, yb, t) + dy, lerp(a.z, b.z, t) + lerp(na.z, nb.z, t) * off];
    const ribbon = !(inBase && (e.type === 'street' || e.type === 'avenue'));
    if (ribbon) {
      const col = e.type === 'mountain' ? COL.mountain : e.type === 'dock' ? COL.dock : e.type === 'street' || e.type === 'avenue' ? COL.asphalt : COL.highway;
      g.up(P(0, -hw, 0), P(0, hw, 0), P(1, hw, 0), P(1, -hw, 0), col);
      if (mtn) {
        for (const sgn of [-1, 1]) {
          const A = P(0, sgn * hw, 0), B = P(1, sgn * hw, 0), Cq = P(1, sgn * (hw + 4), -1.2), D = P(0, sgn * (hw + 4), -1.2);
          const ny = (B[2] - A[2]) * (Cq[0] - A[0]) - (B[0] - A[0]) * (Cq[2] - A[2]);
          const c1 = COL.dirt, c2 = mix(COL.dirt, COL.grassA, 0.7);
          if (ny >= 0) { g.tri(A, B, Cq, c1, c1, c2); g.tri(A, Cq, D, c1, c2, c2); } else { g.tri(D, Cq, B, c2, c2, c1); g.tri(D, B, A, c2, c1, c1); }
        }
      }
    }
    // faixas pintadas
    const s0 = e.cum[i], s1 = e.cum[i + 1], sl = s1 - s0;
    const nA = map.nodes[e.a], nB = map.nodes[e.b];
    const trimA = nA.edges.length >= 3 ? nA.r + 0.8 : 0, trimB = nB.edges.length >= 3 ? nB.r + 0.8 : 0;
    const lo = Math.max(s0, trimA), hi = Math.min(s1, e.len - trimB);
    const my = 0.045;
    const strip = (sa, sb, off, w, col) => {
      const ta = (sa - s0) / sl, tb = (sb - s0) / sl;
      g.up(P(ta, off - w, my), P(ta, off + w, my), P(tb, off + w, my), P(tb, off - w, my), col);
    };
    const solid = (off, w, col) => { if (hi > lo) strip(lo, hi, off, w, col); };
    const dashed = (off, w, col, dash, gap) => {
      const per = dash + gap;
      for (let k = Math.floor(lo / per); k * per < hi; k++) {
        const da = Math.max(lo, k * per), db = Math.min(hi, k * per + dash);
        if (db - da > 0.3) strip(da, db, off, w, col);
      }
    };
    const lw = laneWidth(e);
    if (e.type === 'street' || e.type === 'dock') dashed(0, 0.07, COL.yellow, 3, 5);
    else { solid(-0.16, 0.06, COL.yellow); solid(0.16, 0.06, COL.yellow); }
    for (let k = 1; k < e.lanes; k++) { dashed(k * lw + 0.15, 0.06, COL.white, 3, 7); dashed(-(k * lw + 0.15), 0.06, COL.white, 3, 7); }
    if (e.type !== 'street' && e.type !== 'dock') { const eo = e.lanes * lw + 0.4; solid(eo, 0.07, COL.white); solid(-eo, 0.07, COL.white); }
    // faixa de pedestres e linha de retenção em cruzamentos com semáforo
    const cross = (node, atA) => {
      const r = node.r;
      const sa = atA ? r - 3.1 : e.len - r + 0.6, sb = atA ? r - 0.6 : e.len - r + 3.1;
      if (sa < s0 - 0.01 || sb > s1 + 0.01) return;
      for (let o = -hw + 0.7; o <= hw - 0.7; o += 1.25) strip(sa, sb, o, 0.3, COL.white);
      const ls = atA ? r + 0.5 : e.len - r - 0.9;
      if (atA) strip(ls, ls + 0.4, -hw / 2, hw / 2 - 0.3, COL.white); else strip(ls, ls + 0.4, hw / 2, hw / 2 - 0.3, COL.white);
    };
    if (nA.signal >= 0 && i === 0) cross(nA, true);
    if (nB.signal >= 0 && i === p.length - 2) cross(nB, false);
  }

  // ---------- Prédios ----------
  building(g, b) {
    const { x0, z0, x1, z1, h } = b;
    const col = C(b.color), roof = shade(col, 0.5);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    g.ci = [b.seed, b.style, b.lit || 0.4];
    if (b.kind === 'tower') {
      const t = b.tiers && b.tiers[0];
      if (t) {
        g.box(x0, 0, z0, x1, t.from, z1, col, { uv: true, topCol: roof });
        g.box(x0 + t.inset, t.from, z0 + t.inset, x1 - t.inset, h, z1 - t.inset, col, { uv: true, topCol: roof });
      } else g.box(x0, 0, z0, x1, h, z1, col, { uv: true, topCol: roof });
      g.ci = [0, 0, 0];
      const r = Math.min(x1 - x0, z1 - z0) * 0.18;
      g.box(cx - r, h, cz - r, cx + r, h + 2.6, cz + r, shade(col, 0.65));
      if (h > 85) g.box(cx - 0.25, h + 2.6, cz - 0.25, cx + 0.25, h + 16, cz + 0.25, C(0x9aa0a6));
    } else if (b.kind === 'mid' || b.kind === 'hotel') {
      g.box(x0, 0, z0, x1, h, z1, col, { uv: true, topCol: roof });
      g.ci = [0, 0, 0];
      // platibanda e caixa d'água
      g.box(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.6, z1 + 0.2, shade(col, 0.82), { topCol: roof });
      if (b.seed > 0.4) g.box(cx - 1.6, h + 0.6, cz - 1.6, cx + 1.6, h + 3, cz + 1.6, shade(col, 0.7));
    } else if (b.kind === 'house') {
      g.box(x0, 0, z0, x1, h, z1, col, { uv: true, top: false });
      g.ci = [0, 0, 0];
      this.gable(g, x0, z0, x1, z1, h, b.ridgeX, C(b.color2), col, 0.45);
    } else if (b.kind === 'warehouse') {
      g.box(x0, 0, z0, x1, h, z1, col, { uv: true, top: false });
      g.ci = [0, 0, 0];
      this.gable(g, x0, z0, x1, z1, h, x1 - x0 < z1 - z0, C(b.color2), col, 0.16);
    } else if (b.kind === 'garage') {
      g.ci = [0, 0, 0];
      const acc = C(b.color2);
      g.box(x0, 0, z0, x1, h, z1, col, { topCol: roof });
      g.box(x0 - 0.3, h - 2.2, z0 - 0.3, x1 + 0.3, h - 0.9, z1 + 0.3, acc);
      // portões
      const n = Math.max(2, Math.floor((x1 - x0) / 9));
      for (let k = 0; k < n; k++) {
        const dx = lerp(x0 + 2, x1 - 2, (k + 0.5) / n);
        g.quad([dx - 3, 0, z1 + 0.05], [dx + 3, 0, z1 + 0.05], [dx + 3, 4.4, z1 + 0.05], [dx - 3, 4.4, z1 + 0.05], C(0x11151b));
      }
      g.box(cx - 5, h, z1 - 1.2, cx + 5, h + 2.4, z1 - 0.6, acc);
    }
  }

  gable(g, x0, z0, x1, z1, h, ridgeX, rc, wc, pitch) {
    const ov = 0.45;
    if (ridgeX) {
      const zm = (z0 + z1) / 2, rh = (z1 - z0) / 2 * pitch * 2 * 0.5 + 0.4;
      g.quad([x0 - ov, h - 0.1, z1 + ov], [x1 + ov, h - 0.1, z1 + ov], [x1 + ov, h + rh, zm], [x0 - ov, h + rh, zm], rc);
      g.quad([x1 + ov, h - 0.1, z0 - ov], [x0 - ov, h - 0.1, z0 - ov], [x0 - ov, h + rh, zm], [x1 + ov, h + rh, zm], shade(rc, 0.85));
      g.tri([x1, h, z1], [x1, h, z0], [x1, h + rh, zm], wc);
      g.tri([x0, h, z0], [x0, h, z1], [x0, h + rh, zm], wc);
    } else {
      const xm = (x0 + x1) / 2, rh = (x1 - x0) / 2 * pitch * 2 * 0.5 + 0.4;
      g.quad([x1 + ov, h - 0.1, z1 + ov], [x1 + ov, h - 0.1, z0 - ov], [xm, h + rh, z0 - ov], [xm, h + rh, z1 + ov], rc);
      g.quad([x0 - ov, h - 0.1, z0 - ov], [x0 - ov, h - 0.1, z1 + ov], [xm, h + rh, z1 + ov], [xm, h + rh, z0 - ov], shade(rc, 0.85));
      g.tri([x0, h, z1], [x1, h, z1], [xm, h + rh, z1], wc);
      g.tri([x1, h, z0], [x0, h, z0], [xm, h + rh, z0], wc);
    }
  }

  ramp(g, r) {
    g.ci = [0, 0, 0];
    const y0 = this.map.groundBase(r.x, r.z);
    const hw = r.w / 2;
    const P = (lx, lz, y) => [r.x + lx * r.c + lz * r.s, y0 + y, r.z - lx * r.s + lz * r.c];
    const a = P(-hw, 0, 0.02), b = P(hw, 0, 0.02), c = P(hw, r.len, r.h), d = P(-hw, r.len, r.h), e = P(hw, r.len, -0.5), f = P(-hw, r.len, -0.5);
    g.up(a, b, c, d, COL.ramp);
    // listras
    for (let k = 1; k < 4; k++) {
      const t0 = k / 4 - 0.03, t1 = k / 4 + 0.03;
      g.up(P(-hw, r.len * t0, r.h * t0 + 0.03), P(hw, r.len * t0, r.h * t0 + 0.03), P(hw, r.len * t1, r.h * t1 + 0.03), P(-hw, r.len * t1, r.h * t1 + 0.03), COL.white);
    }
    g.quad(c, e, f, d, COL.rampSide);
    g.quad(e, c, d, f, COL.rampSide);
    g.tri(b, e, c, COL.rampSide); g.tri(b, c, e, COL.rampSide);
    g.tri(a, d, f, COL.rampSide); g.tri(a, f, d, COL.rampSide);
  }

  // ---------- Objetos ----------
  prop(p, st, pr, glow) {
    const map = this.map;
    const y = p.y != null ? p.y : map.groundBase(p.x, p.z);
    const x = p.x, z = p.z;
    st.ci = [0, 0, 0];
    switch (p.t) {
      case 'tree': {
        const s = p.s;
        st.cyl(x, y - 0.3, z, 0.24 * s, 0.17 * s, 2.3 * s + 0.3, 5, COL.trunk, { cap: false });
        if (p.pine) {
          const c = shade(COL.pine, 0.85 + p.c * 0.3);
          st.cyl(x, y + 1.6 * s, z, 1.7 * s, 0, 2.6 * s, 6, c);
          st.cyl(x, y + 3.2 * s, z, 1.25 * s, 0, 2.4 * s, 6, shade(c, 1.1));
          st.cyl(x, y + 4.7 * s, z, 0.8 * s, 0, 2.0 * s, 6, shade(c, 1.2));
        } else {
          const c = mix(COL.leafA, COL.leafB, p.c);
          st.cyl(x, y + 1.9 * s, z, 1.15 * s, 1.95 * s, 1.2 * s, 6, shade(c, 0.82), { cap: false });
          st.cyl(x, y + 3.1 * s, z, 1.95 * s, 0, 2.5 * s, 6, c);
        }
        break;
      }
      case 'palm': {
        const s = p.s, lean = 0.9 * s, a = p.r;
        let px = x, pz = z, py = y;
        const H = 7.5 * s;
        for (let k = 0; k < 3; k++) {
          const nx = x + Math.sin(a) * lean * ((k + 1) / 3) ** 2, nz = z + Math.cos(a) * lean * ((k + 1) / 3) ** 2, ny = y + (H * (k + 1)) / 3;
          st.obox((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, 0.17 * s, H / 6 + 0.05, 0.17 * s, a, shade(COL.trunk, 1.15), { top: false });
          px = nx; pz = nz; py = ny;
        }
        for (let k = 0; k < 7; k++) {
          const la = a + (k / 7) * Math.PI * 2, R = 2.9 * s;
          const dx = Math.sin(la), dz = Math.cos(la), wx = -dz * 0.55 * s, wz = dx * 0.55 * s;
          const A = [px, py + 0.2, pz], B = [px + dx * R * 0.55 + wx, py + 0.45 * s, pz + dz * R * 0.55 + wz], Cq = [px + dx * R * 0.55 - wx, py + 0.45 * s, pz + dz * R * 0.55 - wz], D = [px + dx * R, py - 0.9 * s, pz + dz * R];
          const c = shade(COL.palm, 0.85 + (k % 3) * 0.12);
          st.tri(A, B, Cq, c); st.tri(A, Cq, B, c);
          st.tri(B, D, Cq, c); st.tri(B, Cq, D, c);
        }
        break;
      }
      case 'lamp': {
        const H = p.big ? 9 : 6.4, arm = p.big ? 3.2 : 1.9;
        const dx = Math.sin(p.r), dz = Math.cos(p.r);
        pr.obox(x, y + H / 2, z, 0.09, H / 2, 0.09, p.r, COL.pole, { top: false });
        pr.obox(x + dx * arm / 2, y + H, z + dz * arm / 2, 0.06, 0.06, arm / 2, p.r, COL.pole);
        const hx = x + dx * arm, hz = z + dz * arm;
        pr.obox(hx, y + H - 0.08, hz, 0.22, 0.07, 0.42, p.r, COL.lampHead);
        // brilho noturno: lâmpada + mancha de luz no chão
        const warm = [1.0, 0.78, 0.42];
        const s = 0.42;
        glow.quad([hx - s, y + H - 0.17, hz - s], [hx + s, y + H - 0.17, hz - s], [hx + s, y + H - 0.17, hz + s], [hx - s, y + H - 0.17, hz + s], warm);
        const R = p.big ? 13 : 8.5, gy = y + 0.1, cc = shade(warm, p.big ? 0.4 : 0.34), zero = [0, 0, 0];
        const gxc = x + dx * (arm + 1.2), gzc = z + dz * (arm + 1.2);
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
          glow.tri([gxc, gy, gzc], [gxc + Math.sin(a0) * R, gy, gzc + Math.cos(a0) * R], [gxc + Math.sin(a1) * R, gy, gzc + Math.cos(a1) * R], cc, zero, zero);
        }
        break;
      }
      case 'post':
        pr.obox(x, y + 0.45, z, 0.07, 0.45, 0.07, 0, COL.white);
        pr.obox(x, y + 0.98, z, 0.08, 0.08, 0.08, 0, C(0xd13a2a));
        break;
      case 'cont': {
        const L = 12.2, W = 2.5, H = 2.6;
        for (let k = 0; k < p.s; k++) {
          const c = COL.cont[Math.floor(hash2(Math.round(x * 3) + k * 17, Math.round(z * 3)) * COL.cont.length)];
          st.obox(x, y + H * (k + 0.5), z, L / 2, H / 2 - 0.02, W / 2, p.r, c, { topCol: shade(c, 0.8) });
        }
        break;
      }
      case 'tank': {
        const h = 9 + p.c * 6;
        st.cyl(x, y, z, p.s, p.s, h, 12, C(0xd8d6ce), { capCol: C(0xb9b7ae) });
        st.cyl(x, y + h * 0.45, z, p.s + 0.06, p.s + 0.06, 0.8, 12, C(0xc8553d), { cap: false });
        break;
      }
      case 'crane': {
        const yel = C(0xe0a52c), dk = C(0x394049);
        for (const sx of [-8, 8]) for (const sz of [-7, 7]) st.box(x + sx - 0.8, y, z + sz - 0.8, x + sx + 0.8, y + 30, z + sz + 0.8, yel);
        st.box(x - 9.5, y + 30, z - 8.5, x + 9.5, y + 32.5, z + 8.5, yel, { bottom: true });
        st.box(x - 2, y + 32.5, z - 26, x + 2, y + 35, z + 34, yel, { bottom: true });
        st.box(x - 3, y + 27, z - 2, x + 3, y + 30, z + 3, dk, { bottom: true });
        st.box(x - 0.6, y + 35, z - 3, x + 0.6, y + 43, z - 1, yel);
        glow.quad([x - 1, y + 43.2, z - 3], [x + 1, y + 43.2, z - 3], [x + 1, y + 43.2, z - 1], [x - 1, y + 43.2, z - 1], [1, 0.1, 0.08]);
        break;
      }
      case 'umbrella': {
        pr.obox(x, y + 1.1, z, 0.04, 1.1, 0.04, 0, COL.white, { top: false });
        const cols = [[0xe5483b, 0xf4f1e8], [0x2f8fd0, 0xf4f1e8], [0xf2b632, 0xe5483b], [0x3da35d, 0xf4f1e8]][Math.floor(p.c * 4) % 4].map(C);
        pr.cyl(x, y + 1.9, z, 1.7, 0, 0.7, 8, cols[0], { cols });
        break;
      }
      case 'kiosk': {
        const c = [0xe5483b, 0x2f8fd0, 0xf2b632][Math.floor(p.c * 3) % 3];
        st.box(x - 2.4, y, z - 2.4, x + 2.4, y + 2.7, z + 2.4, C(0xf1ead8));
        st.box(x - 3.2, y + 2.7, z - 3.2, x + 3.2, y + 3.1, z + 3.2, C(c), { bottom: true });
        st.cyl(x, y + 3.1, z, 3.4, 0, 1.3, 4, shade(C(c), 0.85));
        break;
      }
      case 'tower': {
        const cols = [C(0xd13a2a), C(0xf1efe8)];
        let r = 2.2, yy = y;
        for (let k = 0; k < 6; k++) { const r1 = r * 0.8; st.cyl(x, yy, z, r, r1, 8, 4, cols[k & 1], { cap: k === 5 }); r = r1; yy += 8; }
        st.box(x - 0.15, yy, z - 0.15, x + 0.15, yy + 7, z + 0.15, cols[0]);
        const s = 1.2;
        glow.quad([x - s, yy + 7, z], [x + s, yy + 7, z], [x + s, yy + 7 + 2 * s, z], [x - s, yy + 7 + 2 * s, z], [1, 0.1, 0.06]);
        glow.quad([x, yy + 7, z - s], [x, yy + 7, z + s], [x, yy + 7 + 2 * s, z + s], [x, yy + 7 + 2 * s, z - s], [1, 0.1, 0.06]);
        glow.quad([x + s, yy + 7, z], [x - s, yy + 7, z], [x - s, yy + 7 + 2 * s, z], [x + s, yy + 7 + 2 * s, z], [1, 0.1, 0.06]);
        glow.quad([x, yy + 7, z + s], [x, yy + 7, z - s], [x, yy + 7 + 2 * s, z - s], [x, yy + 7 + 2 * s, z + s], [1, 0.1, 0.06]);
        break;
      }
      case 'lighthouse': {
        const cols = [C(0xf1efe8), C(0xd13a2a)];
        let r = 3.6, yy = y;
        for (let k = 0; k < 5; k++) { const r1 = r * 0.86; st.cyl(x, yy, z, r, r1, 5, 10, cols[k & 1], { cap: false }); r = r1; yy += 5; }
        st.cyl(x, yy, z, r + 0.8, r + 0.8, 0.5, 10, C(0x394049));
        st.cyl(x, yy + 0.5, z, r * 0.7, r * 0.7, 2.6, 8, C(0xfff0c0));
        st.cyl(x, yy + 3.1, z, r * 0.95, 0, 1.8, 8, C(0xd13a2a));
        const s = r * 0.75, w = [1, 0.9, 0.6];
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), tx = dz, tz = -dx;
          const bx = x + dx * (s + 0.05), bz = z + dz * (s + 0.05);
          glow.quad([bx - tx * s, yy + 0.6, bz - tz * s], [bx + tx * s, yy + 0.6, bz + tz * s], [bx + tx * s, yy + 3, bz + tz * s], [bx - tx * s, yy + 3, bz - tz * s], w);
          glow.quad([bx + tx * s, yy + 0.6, bz + tz * s], [bx - tx * s, yy + 0.6, bz - tz * s], [bx - tx * s, yy + 3, bz - tz * s], [bx + tx * s, yy + 3, bz + tz * s], w);
        }
        break;
      }
      default:
    }
  }

  // semáforos: um poste por aproximação, à direita de quem chega
  signalPoles(n, pr, sig) {
    const map = this.map;
    for (const id of n.edges) {
      const e = map.edges[id];
      const atA = e.a === n.id;
      const q = atA ? e.pts[1] : e.pts[e.pts.length - 2];
      let dx = q.x - n.x, dz = q.z - n.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      // direita de quem vem em direção ao cruzamento (sentido -d)
      const rx = dz, rz = -dx;
      const hw = e.width / 2;
      const px = n.x + dx * (n.r + 0.6) + rx * (hw + 1.1), pz = n.z + dz * (n.r + 0.6) + rz * (hw + 1.1);
      const yaw = Math.atan2(dx, dz);
      pr.obox(px, 2.9, pz, 0.1, 2.9, 0.1, yaw, COL.pole, { top: false });
      const arm = Math.min(hw * 0.75, 4.5);
      const ax = px - rx * arm / 2, az = pz - rz * arm / 2;
      pr.obox(ax, 5.7, az, 0.07, 0.07, arm / 2, Math.atan2(-rx, -rz), COL.pole);
      const hx = px - rx * arm, hz = pz - rz * arm;
      pr.obox(hx, 5.25, hz, 0.26, 0.72, 0.16, yaw, C(0x16181c));
      const sId = n.signal * 2 + e.axis;
      for (let k = 0; k < 3; k++) {
        const by = 5.7 - k * 0.45, s = 0.17;
        const bx = hx + dx * 0.17, bz = hz + dz * 0.17;
        // quad voltado para +d (para o motorista que chega)
        sig.geo.quad([bx - rx * s, by - s, bz - rz * s], [bx + rx * s, by - s, bz + rz * s], [bx + rx * s, by + s, bz + rz * s], [bx - rx * s, by + s, bz - rz * s], [1, 1, 1]);
        for (let v = 0; v < 6; v++) sig.sig.push(sId, k);
      }
    }
  }
}
