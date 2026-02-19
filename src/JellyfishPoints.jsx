import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as particulate from "particulate";

const { sin, cos, PI } = Math;

// ─── GEOM HELPERS ────────────────────────────────────────────────────────────
function geomPoint(x, y, z, buf) {
  buf.push(x, y, z);
}
function geomCircle(segments, radius, y, buf) {
  const step = (PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    buf.push(cos(step * i) * radius, y, sin(step * i) * radius);
  }
}

// ─── LINK HELPERS ────────────────────────────────────────────────────────────
function linksLoop(index, count, buf) {
  for (let i = 0; i < count - 1; i++) buf.push(index + i, index + i + 1);
  buf.push(index, index + count - 1);
  return buf;
}
function linksRings(i0, i1, count, buf) {
  for (let i = 0; i < count; i++) buf.push(i0 + i, i1 + i);
  return buf;
}
function linksRadial(center, index, count, buf) {
  for (let i = 0; i < count; i++) buf.push(center, index + i);
  return buf;
}
// 삼각형 보강재 (Inner Ribs) 연결
function linksInnerTriangle(start, count, buf) {
  const step = count / 3; // 36 / 3 = 12 간격
  buf.push(start + 0, start + step);
  buf.push(start + step, start + step * 2);
  buf.push(start + step * 2, start + 0);
  return buf;
}

// ─── buildJellyfishStructure ──────────────────────────────────────────────────
function buildJellyfishStructure() {
  const verts = [];
  const links = []; // 일반 연결 (흰색/푸른색)
  const innerLinks = []; // 삼각형 보강재 (빨간색)
  const radialLinks = []; // 우산살 (노란색)

  const ribsCount = 20;
  const segments = 36;
  const size = 40;
  const yOffset = 20;

  // 1. 척추 점들 (Spine Points) 생성 (0 ~ 4번 인덱스)
  const PIN_TOP = 0,
    IDX_TOP = 1,
    IDX_MID = 2,
    IDX_BOTTOM = 3,
    PIN_TAIL = 4;
  const spineY = [
    size + yOffset,
    size * 1.5,
    size * 0.5,
    -size,
    yOffset - size,
  ];
  spineY.forEach((y) => geomPoint(0, y, 0, verts));

  // 2. 20개의 Ribs 생성 (인덱스 5번부터 시작)
  const RIB_START = 5;

  for (let i = 0; i < ribsCount; i++) {
    const t = i / (ribsCount - 1);
    const y = size + yOffset - t * size;
    const start = RIB_START + i * segments;

    // 해파리 종 모양 반지름 곡선
    const rad =
      (sin(PI - PI * 0.55 * t * 1.8) + Math.log(t * 100 + 2) / 3) * 15;

    geomCircle(segments, rad, y, verts);

    // 가로 링 연결 (Loop)
    linksLoop(start, segments, links);

    // 모든 Rib에 내부 삼각형 보강재 추가 (중요!)
    linksInnerTriangle(start, segments, innerLinks);

    // 상단(0번) Rib -> IDX_TOP 연결 (우산살)
    if (i === 0) linksRadial(IDX_TOP, start, segments, radialLinks);

    // 하단(19번) Rib -> IDX_BOTTOM 연결 (우산살)
    if (i === ribsCount - 1)
      linksRadial(IDX_BOTTOM, start, segments, radialLinks);

    // 세로 연결 (Vertical Skin)
    if (i > 0) {
      const prevStart = RIB_START + (i - 1) * segments;
      linksRings(prevStart, start, segments, links);
    }
  }

  // 3. 물리 시스템 생성
  const system = particulate.ParticleSystem.create(verts, 2);
  // (시각화 목적이므로 물리 제약조건은 최소화)
  system.setWeight(PIN_TOP, 0); // 머리 고정

  return { system, links, innerLinks, radialLinks };
}

export default function JellyfishPoints() {
  const { system, links, innerLinks, radialLinks } = useMemo(
    () => buildJellyfishStructure(),
    [],
  );

  // BufferGeometry 설정
  const pointsGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(system.positions, 3),
    );
    return geo;
  }, [system]);

  const linksGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(system.positions, 3),
    );
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(links), 1));
    return geo;
  }, [system, links]);

  const innerGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(system.positions, 3),
    );
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(innerLinks), 1));
    return geo;
  }, [system, innerLinks]);

  const radialGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(system.positions, 3),
    );
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(radialLinks), 1));
    return geo;
  }, [system, radialLinks]);

  // 애니메이션 (물리 연산 진행)
  useFrame((state, delta) => {
    system.tick(delta);
    pointsGeo.attributes.position.needsUpdate = true;
    linksGeo.attributes.position.needsUpdate = true;
    innerGeo.attributes.position.needsUpdate = true;
    radialGeo.attributes.position.needsUpdate = true;
  });

  return (
    <group scale={0.05}>
      {/* 1. 입자 (Points) - 모든 점을 시각화 */}
      <points geometry={pointsGeo}>
        <pointsMaterial size={0.1} color="cyan" sizeAttenuation={true} />
      </points>

      {/* 2. 일반 연결 (Ribs & Skin) - 검은색 */}
      <lineSegments geometry={linksGeo}>
        <lineBasicMaterial color="black" transparent opacity={0.3} />
      </lineSegments>

      {/* 3. 우산살 (Radial Links) - 노란색 (Top/Bottom만 존재) */}
      <lineSegments geometry={radialGeo}>
        <lineBasicMaterial color="yellow" transparent opacity={0.8} />
      </lineSegments>

      {/* 4. 내부 삼각형 보강재 (Inner Ribs) - 빨간색 (모든 Rib에 존재) */}
      <lineSegments geometry={innerGeo}>
        <lineBasicMaterial color="red" transparent opacity={1.0} />
      </lineSegments>
    </group>
  );
}
