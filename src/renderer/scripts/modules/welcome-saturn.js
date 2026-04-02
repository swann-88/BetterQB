import * as THREE from "../../../../node_modules/three/build/three.module.js";

const SATURN_VERTEX_SHADER = `
attribute float size;
attribute vec3 customColor;
attribute float opacityAttr;
attribute float isRing;
attribute float aRandomId;
attribute vec4 motion0;
attribute vec4 motion1;
attribute vec4 motion2;
attribute vec4 motion3;

varying vec3 vColor;
varying float vDist;
varying float vOpacity;
varying float vScaleFactor;
varying float vIsRing;
varying float vDensityComp;

uniform float uTime;
uniform float uScale;
uniform float uRotationX;
uniform float uRotationY;

mat2 rotate2d(float a) {
  return mat2(cos(a), -sin(a), sin(a), cos(a));
}

vec3 safeTangent(vec3 n) {
  vec3 ref = abs(n.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  return normalize(cross(ref, n));
}

void main() {
  float normScaleLOD = clamp((uScale - 0.15) / 2.35, 0.0, 1.0);

  vec3 pos = position;

  float baseRadius = motion0.x;
  float baseAngle = motion0.y;
  float baseHeight = motion0.z;
  float angularSpeed = motion0.w;
  float driftAmpR = motion1.x;
  float driftAmpY = motion1.y;
  float driftFreqR = motion1.z;
  float driftFreqY = motion1.w;
  float phaseA = motion2.x;
  float phaseB = motion2.y;
  float flowAmpT = motion2.z;
  float flowAmpR = motion2.w;
  float flowFreq = motion3.x;
  float flowPhase = motion3.y;

  if (isRing > 0.5) {
    float radius = baseRadius + sin(uTime * driftFreqR + phaseA) * driftAmpR;
    float height = baseHeight + sin(uTime * driftFreqY + phaseB) * driftAmpY;
    float angle = baseAngle + uTime * angularSpeed + sin(uTime * (driftFreqY * 0.7) + phaseA) * 0.018;
    pos.x = radius * cos(angle);
    pos.z = radius * sin(angle);
    pos.y = height;
  } else {
    vec3 n = normalize(pos);
    vec3 tangentA = safeTangent(n);
    vec3 tangentB = normalize(cross(n, tangentA));
    float flowT = uTime * flowFreq + flowPhase;
    float tA = sin(flowT);
    float tB = cos(flowT * 0.83 + flowPhase * 1.7);
    float rPulse = sin(flowT * 0.37 + flowPhase * 2.1);
    pos += tangentA * (tA * flowAmpT);
    pos += tangentB * (tB * flowAmpT * 0.72);
    pos += n * (rPulse * flowAmpR);
  }

  float cy = cos(uRotationY);
  float sy = sin(uRotationY);
  float rx = pos.x * cy - pos.z * sy;
  float rz2 = pos.x * sy + pos.z * cy;
  pos.x = rx;
  pos.z = rz2;

  float cx = cos(uRotationX);
  float sx = sin(uRotationX);
  float ry = pos.y * cx - pos.z * sx;
  float rz = pos.y * sx + pos.z * cx;
  pos.y = ry;
  pos.z = rz;

  vec4 mvPosition = modelViewMatrix * vec4(pos * uScale, 1.0);
  float dist = -mvPosition.z;
  vDist = dist;

  gl_Position = projectionMatrix * mvPosition;

  float pointSize = size * (350.0 / dist);
  pointSize *= 0.62;

  if (isRing < 0.5 && dist < 50.0) {
    pointSize *= 0.8;
  }

  // Keep apparent ring density steadier in perspective:
  // far-side ring areas get deterministic sub-sampling to reduce sparkle flicker.
  vDensityComp = 1.0;
  if (isRing > 0.5) {
    float farT = smoothstep(180.0, 320.0, dist);
    float keepProbability = 1.0 - farT * 0.70;
    if (aRandomId > keepProbability) {
      gl_Position = vec4(0.0);
      gl_PointSize = 0.0;
      return;
    }
    vDensityComp = mix(1.0, 0.72, farT);
  }

  gl_PointSize = clamp(pointSize, 0.0, 300.0);

  vColor = customColor;
  vOpacity = opacityAttr;
  vScaleFactor = uScale;
  vIsRing = isRing;
}
`;

const SATURN_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vDist;
varying float vOpacity;
varying float vScaleFactor;
varying float vIsRing;
varying float vDensityComp;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  float glow = smoothstep(1.0, 0.4, r);
  float t = clamp((vScaleFactor - 0.15) / 2.35, 0.0, 1.0);

  vec3 deepGold = vec3(0.35, 0.22, 0.05);
  float colorMix = smoothstep(0.1, 0.9, t);
  vec3 baseColor = mix(deepGold, vColor, colorMix);

  float brightness = 0.36 + 1.28 * t;
  float densityAlpha = 0.32 + 0.55 * smoothstep(0.0, 0.5, t);
  vec3 finalColor = baseColor * brightness;

  if (vIsRing > 0.5) {
    float ringBoost = 1.16 + 0.45 * smoothstep(0.2, 1.0, t);
    finalColor *= ringBoost;
    finalColor += vec3(0.24, 0.20, 0.12) * 0.22;
  }

  if (vDist < 40.0) {
    float closeMix = 1.0 - (vDist / 40.0);
    if (vIsRing < 0.5) {
      vec3 deepTexture = pow(vColor, vec3(1.4)) * 1.5;
      finalColor = mix(finalColor, deepTexture, closeMix * 0.8);
    } else {
      finalColor += vec3(0.15, 0.12, 0.10) * closeMix;
    }
  }

  float depthAlpha = 1.0;
  if (vDist < 10.0) {
    depthAlpha = smoothstep(0.0, 10.0, vDist);
  }

  float alpha = glow * vOpacity * densityAlpha * depthAlpha * 1.2 * vDensityComp;
  gl_FragColor = vec4(finalColor, alpha);
}
`;

const STAR_VERTEX_SHADER = `
attribute float size;
attribute vec3 customColor;
varying vec3 vColor;

void main() {
  vColor = customColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = -mvPosition.z;
  gl_PointSize = size * (1000.0 / dist);
  gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const STAR_FRAGMENT_SHADER = `
varying vec3 vColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  float glow = pow(1.0 - r, 2.0);
  gl_FragColor = vec4(vColor, glow);
}
`;

const NEBULA_FRAGMENT_SHADER = `
varying vec3 vColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  float glow = pow(1.0 - r, 2.0);
  gl_FragColor = vec4(vColor, glow * 0.045);
}
`;

function createSaturnGeometry(particleCount) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const opacities = new Float32Array(particleCount);
  const isRings = new Float32Array(particleCount);
  const randomIds = new Float32Array(particleCount);
  const motion0 = new Float32Array(particleCount * 4);
  const motion1 = new Float32Array(particleCount * 4);
  const motion2 = new Float32Array(particleCount * 4);
  const motion3 = new Float32Array(particleCount * 4);

  const coreColorA = new THREE.Color("#F8E8B5");
  const coreColorB = new THREE.Color("#F2D78A");
  const midColorA = new THREE.Color("#D2A56F");
  const midColorB = new THREE.Color("#BE8D56");
  const hazeColorA = new THREE.Color("#E7CC95");
  const hazeColorB = new THREE.Color("#C79B67");

  const colorRingC = new THREE.Color("#2A2520");
  const colorRingBInner = new THREE.Color("#CDBFA0");
  const colorRingBOuter = new THREE.Color("#DCCBBA");
  const colorCassini = new THREE.Color("#050505");
  const colorRingA = new THREE.Color("#989085");
  const colorRingF = new THREE.Color("#AFAFA0");
  const planetRadius = 18;
  const planetCount = Math.floor(particleCount * 0.34);

  for (let i = 0; i < particleCount; i += 1) {
    let x = 0;
    let y = 0;
    let z = 0;
    let size = 1;
    let opacity = 0.8;
    let isRing = 0;
    let color = midColorA;
    randomIds[i] = Math.random();
    const phaseA = Math.random() * Math.PI * 2;
    const phaseB = Math.random() * Math.PI * 2;

    if (i < planetCount) {
      const layerPick = Math.random();
      const u = Math.random();
      const v = Math.random();
      const theta = Math.PI * 2 * u;
      const phi = Math.acos(2 * v - 1);
      let localRadius = planetRadius * 0.8;

      if (layerPick < 0.34) {
        localRadius = planetRadius * (0.16 + 0.34 * Math.pow(Math.random(), 0.72));
        color = coreColorA.clone().lerp(coreColorB, Math.random());
        size = 1.05 + Math.random() * 0.95;
        opacity = 0.92;
        motion2[i * 4 + 2] = 0.12 + Math.random() * 0.08;
        motion2[i * 4 + 3] = 0.05 + Math.random() * 0.05;
        motion3[i * 4] = 1.25 + Math.random() * 0.45;
      } else if (layerPick < 0.84) {
        localRadius = planetRadius * (0.42 + 0.48 * Math.pow(Math.random(), 0.88));
        color = midColorA.clone().lerp(midColorB, Math.random());
        size = 0.95 + Math.random() * 0.8;
        opacity = 0.84;
        motion2[i * 4 + 2] = 0.09 + Math.random() * 0.07;
        motion2[i * 4 + 3] = 0.04 + Math.random() * 0.04;
        motion3[i * 4] = 0.92 + Math.random() * 0.38;
      } else {
        localRadius = planetRadius * (0.84 + 0.36 * Math.pow(Math.random(), 1.2));
        color = hazeColorA.clone().lerp(hazeColorB, Math.random());
        size = 0.75 + Math.random() * 0.55;
        opacity = 0.58;
        motion2[i * 4 + 2] = 0.07 + Math.random() * 0.05;
        motion2[i * 4 + 3] = 0.03 + Math.random() * 0.03;
        motion3[i * 4] = 0.66 + Math.random() * 0.3;
      }

      x = localRadius * Math.sin(phi) * Math.cos(theta);
      y = localRadius * Math.cos(phi) * 0.92;
      z = localRadius * Math.sin(phi) * Math.sin(theta);
      isRing = 0;

      motion0[i * 4] = localRadius;
      motion0[i * 4 + 1] = theta;
      motion0[i * 4 + 2] = y;
      motion0[i * 4 + 3] = 0;
      motion1[i * 4] = 0;
      motion1[i * 4 + 1] = 0;
      motion1[i * 4 + 2] = 0;
      motion1[i * 4 + 3] = 0;
      motion2[i * 4] = phaseA;
      motion2[i * 4 + 1] = phaseB;
      motion3[i * 4 + 1] = Math.random() * Math.PI * 2;
    } else {
      isRing = 1;
      const zone = Math.random();
      let ringRadius = 0;

      if (zone < 0.15) {
        ringRadius = planetRadius * (1.235 + Math.random() * (1.525 - 1.235));
        color = colorRingC;
        size = 0.5;
        opacity = 0.3;
      } else if (zone < 0.65) {
        const t = Math.random();
        ringRadius = planetRadius * (1.525 + t * (1.95 - 1.525));
        color = colorRingBInner.clone().lerp(colorRingBOuter, t);
        size = 0.8 + Math.random() * 0.6;
        opacity = 0.85;
        if (Math.sin(ringRadius * 2.0) > 0.8) {
          opacity *= 1.2;
        }
      } else if (zone < 0.69) {
        ringRadius = planetRadius * (1.95 + Math.random() * (2.025 - 1.95));
        color = colorCassini;
        size = 0.3;
        opacity = 0.1;
      } else if (zone < 0.99) {
        ringRadius = planetRadius * (2.025 + Math.random() * (2.27 - 2.025));
        color = colorRingA;
        size = 0.7;
        opacity = 0.6;
        if (ringRadius > planetRadius * 2.2 && ringRadius < planetRadius * 2.21) {
          opacity = 0.1;
        }
      } else {
        ringRadius = planetRadius * (2.32 + Math.random() * 0.02);
        color = colorRingF;
        size = 1.0;
        opacity = 0.7;
      }

      const theta = Math.random() * Math.PI * 2;
      x = ringRadius * Math.cos(theta);
      z = ringRadius * Math.sin(theta);
      let thickness = 0.15;
      if (ringRadius > planetRadius * 2.3) {
        thickness = 0.4;
      }
      y = (Math.random() - 0.5) * thickness;

      const normalizedRadius = THREE.MathUtils.clamp((ringRadius - planetRadius * 1.235) / (planetRadius * (2.32 - 1.235)), 0, 1);
      const speedScale = 0.7;
      const speedBase = (0.105 - normalizedRadius * 0.06) * speedScale;
      const speedJitter = ((Math.random() - 0.5) * 0.005) * speedScale;
      const innerBoost = 1.0 + (1.0 - normalizedRadius) * 0.5;
      if (zone >= 0.15 && zone < 0.65) {
        const brighten = (1.0 - normalizedRadius) * 0.3;
        color = color.clone().lerp(new THREE.Color("#FFF7D8"), brighten);
      }
      opacity = Math.min(1.0, opacity * innerBoost);

      motion0[i * 4] = ringRadius;
      motion0[i * 4 + 1] = theta;
      motion0[i * 4 + 2] = y;
      motion0[i * 4 + 3] = speedBase + speedJitter;
      motion1[i * 4] = 0.012 + (1 - normalizedRadius) * 0.02;
      motion1[i * 4 + 1] = 0.01 + Math.random() * 0.022;
      motion1[i * 4 + 2] = 0.28 + Math.random() * 0.18;
      motion1[i * 4 + 3] = 0.24 + Math.random() * 0.16;
      motion2[i * 4] = phaseA;
      motion2[i * 4 + 1] = phaseB;
      motion2[i * 4 + 2] = 0;
      motion2[i * 4 + 3] = 0;
      motion3[i * 4] = 0;
      motion3[i * 4 + 1] = 0;
    }

    const p = i * 3;
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    colors[p] = color.r;
    colors[p + 1] = color.g;
    colors[p + 2] = color.b;
    sizes[i] = size;
    opacities[i] = opacity;
    isRings[i] = isRing;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("customColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("opacityAttr", new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute("isRing", new THREE.BufferAttribute(isRings, 1));
  geometry.setAttribute("aRandomId", new THREE.BufferAttribute(randomIds, 1));
  geometry.setAttribute("motion0", new THREE.BufferAttribute(motion0, 4));
  geometry.setAttribute("motion1", new THREE.BufferAttribute(motion1, 4));
  geometry.setAttribute("motion2", new THREE.BufferAttribute(motion2, 4));
  geometry.setAttribute("motion3", new THREE.BufferAttribute(motion3, 4));
  return geometry;
}

function createStarfieldGeometry(starCount = 24000) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const starColors = [
    new THREE.Color("#d7e1f5"),
    new THREE.Color("#f6f8ff"),
    new THREE.Color("#c7d3ea")
  ];

  for (let i = 0; i < starCount; i += 1) {
    const radius = 400 + Math.random() * 3000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const p = i * 3;

    positions[p] = radius * Math.sin(phi) * Math.cos(theta);
    positions[p + 1] = radius * Math.cos(phi);
    positions[p + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const type = Math.random();
    const c = type > 0.8
      ? starColors[0]
      : type > 0.35
        ? starColors[1]
        : starColors[2];
    colors[p] = c.r;
    colors[p + 1] = c.g;
    colors[p + 2] = c.b;
    sizes[i] = 0.8 + Math.random() * 1.6;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("customColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  return geometry;
}

function createNebulaGeometry(count = 90) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const radius = 800 + Math.random() * 2000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const p = i * 3;

    positions[p] = radius * Math.sin(phi) * Math.cos(theta);
    positions[p + 1] = radius * Math.cos(phi);
    positions[p + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const c = new THREE.Color().setHSL(0.62 + Math.random() * 0.08, 0.38, 0.04);
    colors[p] = c.r;
    colors[p + 1] = c.g;
    colors[p + 2] = c.b;
    sizes[i] = 400.0 + Math.random() * 600.0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("customColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  return geometry;
}

function disposeObject(object) {
  if (!object) {
    return;
  }
  if (object.geometry && typeof object.geometry.dispose === "function") {
    object.geometry.dispose();
  }
  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (material && typeof material.dispose === "function") {
          material.dispose();
        }
      });
    } else if (typeof object.material.dispose === "function") {
      object.material.dispose();
    }
  }
}

export function createWelcomeSaturn() {
  let host = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let saturnPoints = null;
  let stars = null;
  let nebula = null;
  let uniforms = null;
  let starUniforms = null;
  let rafId = 0;
  let mounted = false;
  let disposed = false;
  let width = 0;
  let height = 0;

  const onResize = () => {
    if (!host || !renderer || !camera) {
      return;
    }
    width = host.clientWidth || window.innerWidth;
    height = host.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  };

  const animate = (time) => {
    if (!mounted || !renderer || !scene || !camera) {
      return;
    }
    const elapsedTime = time * 0.001;

    if (uniforms) {
      uniforms.uTime.value = elapsedTime;
      uniforms.uScale.value = 4.26;
      uniforms.uRotationX.value = 0.42;
      uniforms.uRotationY.value = 0.08;
    }
    if (starUniforms) {
      starUniforms.uTime.value = elapsedTime;
    }

    if (stars) {
      stars.rotation.y = 0;
      stars.rotation.z = 0;
    }
    if (nebula) {
      nebula.rotation.y = 0;
      nebula.rotation.z = 0;
    }

    renderer.render(scene, camera);
    rafId = window.requestAnimationFrame(animate);
  };

  return {
    mount(target) {
      if (disposed || mounted || !target) {
        return;
      }

      host = target;
      width = host.clientWidth || window.innerWidth;
      height = host.clientHeight || window.innerHeight;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020202, 0.00015);

      camera = new THREE.PerspectiveCamera(60, width / Math.max(height, 1), 1, 10000);
      camera.position.set(0, 0, 205);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.48;
      renderer.setClearColor(0x020202, 1);
      host.appendChild(renderer.domElement);

      const particleCount = 360000;
      const saturnGeometry = createSaturnGeometry(particleCount);
      uniforms = {
        uTime: { value: 0 },
        uScale: { value: 4.26 },
        uRotationX: { value: 0.42 },
        uRotationY: { value: 0.08 }
      };
      const saturnMaterial = new THREE.ShaderMaterial({
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        uniforms,
        vertexShader: SATURN_VERTEX_SHADER,
        fragmentShader: SATURN_FRAGMENT_SHADER,
        transparent: true
      });
      saturnPoints = new THREE.Points(saturnGeometry, saturnMaterial);
      saturnPoints.rotation.z = 11.5 * (Math.PI / 180);
      scene.add(saturnPoints);

      const starGeometry = createStarfieldGeometry(14000);
      starUniforms = {
        uTime: { value: 0 }
      };
      const starMaterial = new THREE.ShaderMaterial({
        uniforms: starUniforms,
        vertexShader: STAR_VERTEX_SHADER,
        fragmentShader: STAR_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
      });
      stars = new THREE.Points(starGeometry, starMaterial);
      scene.add(stars);

      const nebulaGeometry = createNebulaGeometry(36);
      const nebulaMaterial = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: STAR_VERTEX_SHADER,
        fragmentShader: NEBULA_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
      });
      nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
      scene.add(nebula);

      window.addEventListener("resize", onResize, { passive: true });

      mounted = true;
      rafId = window.requestAnimationFrame(animate);
    },

    destroy() {
      if (disposed) {
        return;
      }

      mounted = false;
      disposed = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", onResize);

      disposeObject(saturnPoints);
      disposeObject(stars);
      disposeObject(nebula);

      if (scene) {
        scene.clear();
      }

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        const gl = renderer.getContext();
        const loseContext = gl && gl.getExtension ? gl.getExtension("WEBGL_lose_context") : null;
        if (loseContext && typeof loseContext.loseContext === "function") {
          loseContext.loseContext();
        }
      }

      host = null;
      renderer = null;
      scene = null;
      camera = null;
      saturnPoints = null;
      stars = null;
      nebula = null;
      uniforms = null;
      starUniforms = null;
      rafId = 0;
    }
  };
}
