import * as THREE from "three";

/* ===================================================================== *
 *  GLSL library
 *  Shared chunks first, then the materials that compose them.
 * ===================================================================== */

const NOISE = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }
`;

/* --------------------------------------------------------------------- *
 *  1. Sky dome — gradient + sun + drifting cloud deck + night stars
 * --------------------------------------------------------------------- */

export function createSkyUniforms() {
  return {
    uTime: { value: 0 },
    uNight: { value: 0 }, // 0 = noon, 1 = midnight
    uSunDir: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() },
    uTop: { value: new THREE.Color(0x3f7fc4) },
    uHorizon: { value: new THREE.Color(0xdfe7ea) },
    uSunColor: { value: new THREE.Color(0xfff0cd) },
    uCloud: { value: 0.42 },
  };
}

export function createSkyMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uNight, uCloud;
      uniform vec3 uSunDir, uTop, uHorizon, uSunColor;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

        vec3 sky = mix(uHorizon, uTop, pow(clamp(d.y, 0.0, 1.0), 0.45));
        // ground bounce below horizon
        sky = mix(sky, uHorizon * 0.62, smoothstep(0.0, -0.25, d.y));

        // sun
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        float disc = smoothstep(0.9975, 0.9992, sd);
        float halo = pow(sd, 220.0) * 0.7 + pow(sd, 14.0) * 0.18;
        sky += uSunColor * (halo + disc * 3.0) * (1.0 - uNight * 0.6);

        // cloud deck projected onto the dome
        vec2 cuv = d.xz / max(abs(d.y) + 0.18, 0.001);
        float t = uTime * 0.006;
        float c = fbm(cuv * 0.9 + vec2(t, t * 0.4));
        c = smoothstep(0.42, 0.86, c) * uCloud;
        c *= smoothstep(0.0, 0.25, d.y);
        vec3 cloudCol = mix(vec3(0.88, 0.9, 0.94), uSunColor, 0.35 * (1.0 - uNight));
        cloudCol *= mix(1.0, 0.28, uNight);
        sky = mix(sky, cloudCol, c);

        // stars at night
        float stars = step(0.9988, hash21(floor(d.xz * 620.0)));
        sky += vec3(stars) * uNight * smoothstep(0.05, 0.5, d.y) * 0.9;

        // subtle dither to kill banding
        sky += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

/* --------------------------------------------------------------------- *
 *  2. Hologram marker — grows, pulses, scans
 * --------------------------------------------------------------------- */

export function createHoloMaterial({ color = 0x63e0ff, rings = 3 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uRings: { value: rings },
      uThickness: { value: 0.06 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uProgress, uOpacity, uRings, uThickness;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vPos;

      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;

        // expanding shock ring
        float ring = 1.0 - smoothstep(0.0, uThickness, abs(r - uProgress));
        // standing rings
        float bands = 0.0;
        for (int i = 0; i < 4; i++) {
          if (float(i) >= uRings) break;
          float rr = 0.24 + float(i) * 0.2 + sin(uTime * 2.0 + float(i)) * 0.012;
          bands += (1.0 - smoothstep(0.0, 0.02, abs(r - rr))) * (0.5 - float(i) * 0.09);
        }
        // rotating sweep
        float a = atan(c.y, c.x);
        float sweep = smoothstep(0.6, 1.0, sin(a * 3.0 - uTime * 3.4)) * 0.35 * step(0.35, r);

        // radial fade + scanlines
        float fade = smoothstep(1.0, 0.55, r);
        float scan = 0.72 + 0.28 * sin(vPos.y * 320.0 + uTime * 9.0);

        float alpha = (ring * 1.4 + bands + sweep) * fade * scan * uOpacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor * (0.7 + ring * 1.2 + bands), alpha);
      }
    `,
  });
}

/* --------------------------------------------------------------------- *
 *  3. Volumetric light shaft — soft additive card
 * --------------------------------------------------------------------- */

export function createShaftMaterial({ color = 0xffe6bb, opacity = 0.22 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;

      void main() {
        float edgeX = smoothstep(0.0, 0.34, vUv.x) * smoothstep(1.0, 0.66, vUv.x);
        float fadeY = smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float dust = fbm(vec2(vUv.x * 6.0, vUv.y * 1.4 - uTime * 0.03));
        float a = edgeX * fadeY * (0.55 + dust * 0.75) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

/* --------------------------------------------------------------------- *
 *  4. Floating dust motes sprite
 * --------------------------------------------------------------------- */

export function createDustSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --------------------------------------------------------------------- *
 *  5. Grade passes.
 *
 *     The pipeline is deliberately split so the maths happens in the
 *     right space:
 *        Render → GTAO → Outline → Bloom   (linear HDR)
 *        → LinearGrade                      (exposure / white balance)
 *        → OutputPass                       (ACES + sRGB encode)
 *        → FilmicLook                       (contrast, CA, grain, vignette)
 *        → SMAA
 * --------------------------------------------------------------------- */

export const LinearGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.05 },
    uTemperature: { value: 0.04 },
    uGain: { value: new THREE.Vector3(1.0, 0.995, 0.985) },
    uLift: { value: new THREE.Vector3(0.0, 0.0, 0.006) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure, uTemperature;
    uniform vec3 uGain, uLift;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb * uExposure;
      // warm/cool bias, strongest in the highlights
      col.r *= 1.0 + uTemperature;
      col.b *= 1.0 - uTemperature * 1.15;
      col = col * uGain + uLift;
      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

export const FilmicLookShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uContrast: { value: 1.05 },
    uSaturation: { value: 1.06 },
    uCA: { value: 0.0018 },
    uGrain: { value: 0.032 },
    uVignette: { value: 0.46 },
    uAspect: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uContrast, uSaturation, uCA, uGrain, uVignette, uAspect;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      float r2 = dot(dir, dir);

      // chromatic aberration grows toward the frame edges
      vec2 off = dir * uCA * (0.35 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = mix(vec3(0.5), col, uContrast);

      // vignette (aspect aware)
      vec2 vd = dir * vec2(uAspect, 1.0);
      float vig = smoothstep(0.98, 0.26, length(vd));
      col *= mix(1.0, vig, uVignette);

      // animated grain
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

