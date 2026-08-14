import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TopologyPayload } from '../hooks/useAutopoieticStream';

interface Props {
  event: TopologyPayload | null;
}

const safeNum = (val: any, fallback: number): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const safeClamp = (val: any, fallback: number, min = -10.0, max = 5.0): number => {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

export const PhaseSpaceCanvas: React.FC<Props> = ({ event }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<TopologyPayload | null>(event);
  const uniformsRef = useRef<any>(null);

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  useEffect(() => {
    if (!mountRef.current) return;

    const w = mountRef.current.clientWidth || window.innerWidth || 100;
    const h = mountRef.current.clientHeight || window.innerHeight || 100;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050811, 0.012);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    camera.position.set(0, 4, 34);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x0f172a, 1.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.5);
    dirLight1.position.set(25, 30, 20);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 2.0);
    dirLight2.position.set(-25, -20, -20);
    scene.add(dirLight2);

    // 【変更】ベースメッシュの半径を 8 から 5 に小さく設定
    const geometry = new THREE.SphereGeometry(5, 96, 96);

    const uniforms = {
      uTime: { value: 0 },
      uCoeffs: { value: new THREE.Vector4(-0.15, 0.34, 0.89, 1.20) },
      uResidual: { value: 0.001 },
      uStability: { value: -1.0 },
      uCameraPosition: { value: camera.position },
    };
    uniformsRef.current = uniforms;

    const vertexShaderCode = `
      uniform float uTime;
      uniform vec4 uCoeffs;
      uniform float uResidual;
      uniform float uStability;
      varying float vDepth;
      varying float vStability;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vStability = uStability;
        vec3 pos = position;

        float deformFactor = smoothstep(-0.4, 0.2, uStability);
        float animTime = uTime * (0.2 + deformFactor * 0.8);

        // 1. 自転制御
        float spinSpeed = mix(0.08, 0.8, deformFactor);
        float angleY = uTime * spinSpeed;
        float x_rotated = pos.x * cos(angleY) - pos.z * sin(angleY);
        float z_rotated = pos.x * sin(angleY) + pos.z * cos(angleY);
        pos.x = x_rotated;
        pos.z = z_rotated;

        // 2. 【変更】最大拡大率を 1.8 から 1.25 へ小さく抑制
        float lambdaScale = mix(0.8, 1.25, deformFactor);

        // 3. トーラス・変形
        float safeCoeffY = tanh(uCoeffs.y * 0.5) * 0.8;
        float sphereR = length(position);
        float baseAngle = atan(position.z, position.x + 0.000001);
        
        float torusR = sphereR * (1.0 + abs(safeCoeffY) * 0.8);
        vec3 torusPos = vec3(
          (torusR + sphereR * 0.25 * cos(baseAngle * 2.0)) * cos(baseAngle),
          sphereR * 0.25 * sin(baseAngle * 2.0),
          (torusR + sphereR * 0.25 * cos(baseAngle * 2.0)) * sin(baseAngle)
        );
        pos = mix(pos, torusPos, abs(safeCoeffY) * 0.35 * deformFactor);

        // 【変更】基準半径 5.0 に合わせて最大膨張上限を 6.5 にガード
        float baseRadius = max(2.5, min(6.5, 5.0 * (1.0 + uCoeffs.x * 0.08)));
        pos *= (baseRadius / 5.0) * lambdaScale;

        // 4. 表面波紋
        float waveFreq = 3.0;
        float currentAngle = atan(pos.z, pos.x + 0.000001);
        float wave1 = sin(currentAngle * waveFreq + animTime * 1.5) * cos(asin(clamp(pos.y / (baseRadius * lambdaScale), -1.0, 1.0)) * waveFreq);
        float wave2 = cos(pos.x * 0.2 + animTime * 2.0) * sin(pos.z * 0.2 + animTime * 1.8);
        
        // 【変更】波幅の倍率を 1.2 -> 0.6 に抑えて出っ張りを抑制
        float surfaceWave = (wave1 * 0.7 + wave2 * 0.5) * clamp(uCoeffs.w, -2.0, 2.0) * 0.6 * deformFactor;

        float highEnergyWobble = 0.0;
        if (deformFactor > 0.1) {
          highEnergyWobble = sin(pos.x * 0.4 + animTime * 3.0) * cos(pos.y * 0.4 + animTime * 2.5) * (deformFactor * 0.6);
        }

        vec3 safeNorm = length(pos) > 0.0001 ? normalize(pos) : vec3(0.0, 1.0, 0.0);
        pos += safeNorm * (surfaceWave + highEnergyWobble);

        // 5. システム残差
        float ripple = sin(pos.x * 2.0 + pos.y * 2.0 + animTime * 4.0) * min(0.3, uResidual * 10.0) * deformFactor;
        pos += safeNorm * ripple;

        vPosition = pos;
        vNormal = safeNorm;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vDepth = -mvPosition.z;
      }
    `;

    const meshMaterial = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      vertexShader: vertexShaderCode,
      fragmentShader: `
        uniform vec3 uCameraPosition;
        varying float vStability;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 colorPureSphere = vec3(0.12, 0.70, 0.95);
          vec3 colorEnergetic  = vec3(0.08, 0.85, 0.50);
          vec3 colorCritical   = vec3(0.95, 0.22, 0.22);

          vec3 finalColor;
          if (vStability <= -0.4) {
            finalColor = colorPureSphere;
          } else if (vStability <= 0.0) {
            float t = clamp((vStability + 0.4) / 0.4, 0.0, 1.0);
            finalColor = mix(colorPureSphere, colorEnergetic, t);
          } else {
            float t = clamp(vStability / 0.5, 0.0, 1.0);
            finalColor = mix(colorEnergetic, colorCritical, t);
          }

          vec3 ambient = finalColor * 0.4;
          vec3 lightDir1 = normalize(vec3(25, 30, 20));
          float diff1 = max(0.0, dot(vNormal, lightDir1));
          vec3 diffuse = finalColor * diff1 * 0.8;

          vec3 viewDir = normalize(uCameraPosition - vPosition);
          vec3 reflectDir = reflect(-lightDir1, vNormal);
          float spec = pow(max(0.0, dot(viewDir, reflectDir)), 32.0);
          vec3 specular = vec3(0.85, 0.95, 1.0) * spec * 0.45;

          gl_FragColor = vec4(ambient + diffuse + specular, 0.85);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    scene.add(mesh);

    const wireMaterial = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      wireframe: true,
      vertexShader: vertexShaderCode,
      fragmentShader: `
        varying float vStability;

        void main() {
          vec3 colorSphere   = vec3(0.40, 0.85, 1.00);
          vec3 colorCritical = vec3(0.98, 0.42, 0.42);

          float t = clamp((vStability + 0.4) / 0.8, 0.0, 1.0);
          vec3 finalColor = mix(colorSphere, colorCritical, t);

          gl_FragColor = vec4(finalColor, 0.25);
        }
      `,
    });
    const wireframe = new THREE.Mesh(geometry, wireMaterial);
    scene.add(wireframe);

    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const currentEvent = eventRef.current;
      const params = uniformsRef.current;

      params.uTime.value = time;
      params.uCameraPosition.value = camera.position;

      if (currentEvent) {
        const tLam = safeClamp(currentEvent.reLambdaMax, -0.5, -10.0, 5.0);
        const tRes = safeNum(currentEvent.residual, 0.001);
        const rawCoeffs = (currentEvent as any).coefficents || (currentEvent as any).coefficients || [-0.15, 0.34, 0.89, 1.20];

        const tC1 = safeClamp(rawCoeffs[0], -0.15, -3.0, 3.0);
        const tC2 = safeClamp(rawCoeffs[1], 0.34, -3.0, 3.0);
        const tC3 = safeClamp(rawCoeffs[2], 0.89, -3.0, 3.0);
        const tC4 = safeClamp(rawCoeffs[3], 1.20, -3.0, 3.0);

        params.uCoeffs.value.set(
          THREE.MathUtils.lerp(params.uCoeffs.value.x, tC1, 0.05),
          THREE.MathUtils.lerp(params.uCoeffs.value.y, tC2, 0.05),
          THREE.MathUtils.lerp(params.uCoeffs.value.z, tC3, 0.05),
          THREE.MathUtils.lerp(params.uCoeffs.value.w, tC4, 0.05)
        );
        params.uResidual.value = THREE.MathUtils.lerp(params.uResidual.value, tRes, 0.08);

        let stabilityRatio = -0.5;
        if (tLam > -0.4) {
          stabilityRatio = (tLam - (-0.4)) / 0.4 - 0.5;
        }

        params.uStability.value = THREE.MathUtils.lerp(params.uStability.value, stabilityRatio, 0.06);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || window.innerWidth || 100;
      const h = mountRef.current.clientHeight || window.innerHeight || 100;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1,
        overflow: 'hidden',
        background: '#050811',
      }}
    />
  );
};
