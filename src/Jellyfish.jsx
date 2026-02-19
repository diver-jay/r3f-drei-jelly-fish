import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as particulate from "particulate";
import "./shaders/GelShaderMaterial"; // gelShaderMaterial JSX 태그 등록
import "./shaders/BulbShaderMaterial"; // bulbShaderMaterial JSX 태그 등록
import "./shaders/TailShaderMaterial"; // tailShaderMaterial JSX 태그 등록
import "./shaders/TentacleShaderMaterial"; // tentacleShaderMaterial JSX 태그 등록

const FAINT_COLOR = new THREE.Color(0x415ab5); // bulbFaint (GelMaterial, 파랑)

const { sin, cos, log, floor, PI } = Math;
const push = Array.prototype.push;

// ─── GEOM ─────────────────────────────────────────────────────────────────────
function geomPoint(x, y, z, buf) {
  buf.push(x, y, z);
}
function geomCircle(segments, radius, y, buf) {
  const step = (PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    buf.push(cos(step * i) * radius, y, sin(step * i) * radius);
  }
}

// ─── LINKS ────────────────────────────────────────────────────────────────────
function linksLoop(index, count, buf) {
  // 링을 닫힌 루프로 연결
  for (let i = 0; i < count - 1; i++) buf.push(index + i, index + i + 1);
  buf.push(index, index + count - 1); // 마지막 → 첫번째로 닫기
  return buf;
}
function linksRings(i0, i1, count, buf) {
  // 두 링 사이를 세로로 연결
  for (let i = 0; i < count; i++) buf.push(i0 + i, i1 + i);
  return buf;
}
function linksRadial(center, index, count, buf) {
  // 중심 → 링 전체 방사형 연결
  for (let i = 0; i < count; i++) buf.push(center, index + i);
  return buf;
}

// ─── FACES ────────────────────────────────────────────────────────────────────
function facesRadial(center, index, count, buf) {
  // 중심점 + 링으로 부채꼴 삼각형
  for (let i = 0; i < count - 1; i++)
    buf.push(center, index + i + 1, index + i);
  buf.push(center, index, index + count - 1);
  return buf;
}
function facesRings(i0, i1, count, buf) {
  // 두 링 사이 quad → 삼각형 2개
  for (let i = 0; i < count - 1; i++) {
    const a = i0 + i,
      b = i0 + i + 1,
      c = i1 + i + 1,
      d = i1 + i;
    buf.push(a, b, c, c, d, a);
  }
  const a = i0 + count - 1,
    b = i0,
    c = i1,
    d = i1 + count - 1;
  buf.push(a, b, c, c, d, a);
  return buf;
}

// ─── Physics helpers ──────────────────────────────────────────────────────────

// 해파리 종(bell) 모양의 rib 반경 커브 (원본 Medusae.js 수식)
function ribRadius(t) {
  return sin(PI - PI * 0.55 * t * 1.8) + log(t * 100 + 2) / 3;
}

// 해파리 꼬리(tail) sub-umbrella 반경 커브
// t=0: sin(PI/2)*1 = 1.0 (마지막 벨 rib와 동일 반경)
// t→1: 빠르게 수축 (끝부분이 거의 닫힘)
function tailRibRadius(t) {
  return sin(0.25 * t * PI + 0.5 * PI) * (1 - 0.9 * t);
}

// 각 rib의 UV 좌표 생성
function ribUvs(sv, count, buf) {
  for (let i = 1; i < count; i++) {
    const st = i / count;
    buf.push((st <= 0.5 ? st : 1 - st) * 2, sv);
  }
  buf.push(0, sv);
}

// 내부 rib 삼각 sub-structure 인덱스
function innerRibIndices(offset, start, segments, buf) {
  const step = floor(segments / 3);
  for (let i = 0; i < 3; i++) {
    buf.push(
      start + ((offset + step * i) % segments),
      start + ((offset + step * (i + 1)) % segments),
    );
  }
  return buf;
}

// ─── buildJellyfish ───────────────────────────────────────────────────────────
function buildJellyfish() {
  // 버퍼
  const verts = [],
    uvs = [];
  const links = [],
    innerLinks = [];
  const bulbFaces = [],
    tailFaces = [];
  const queuedConstraints = [],
    weights = [];
  const ribs = [],
    tailRibs = [];

  // 설정값 (원본 Medusae.js 기준)
  const size = 40,
    yOffset = 20;
  const segmentsCount = 4;
  const totalSegments = segmentsCount * 3 * 3; // 36
  const ribsCount = 20;
  const ribRadiusVal = 15;
  const tailRibsCount = 15;
  const tailRibRadiusFactor = 20; // rib 아래로 내려갈수록 radiusOuter가 yParam*20 만큼 추가됨

  // 핀 Y 위치 계산
  const tailArmSegments = 100,
    tailArmSegmentLength = 1;
  const tentacleSegments = 120,
    tentacleSegmentLength = 1.5;
  const posTop = yOffset + size; // 60
  const posMid = yOffset; // 20
  const posBottom = yOffset - size; // -20
  const posTail = yOffset - tailArmSegments * tailArmSegmentLength; // -80
  const posTentacle = yOffset - tentacleSegments * tentacleSegmentLength * 1.5; // -250

  // 특수 파티클 인덱스 (고정값)
  const PIN_TOP = 0,
    PIN_MID = 1,
    PIN_BOTTOM = 2,
    PIN_TAIL = 3,
    PIN_TENTACLE = 4;
  const IDX_TOP = 5,
    IDX_MID = 6,
    IDX_BOTTOM = 7;
  const TOP_START = 8; // rib 링 파티클 시작 인덱스

  // 공유 state 객체
  const s = {
    // 버퍼
    verts,
    uvs,
    links,
    innerLinks,
    bulbFaces,
    queuedConstraints,
    weights,
    ribs,
    tailRibs,
    tailFaces,
    // 설정
    size,
    yOffset,
    segmentsCount,
    totalSegments,
    ribsCount,
    ribRadiusVal,
    tailRibsCount,
    tailRibRadiusFactor,
    // 위치
    posTop,
    posMid,
    posBottom,
    posTail,
    posTentacle,
    // 인덱스
    PIN_TOP,
    PIN_MID,
    PIN_BOTTOM,
    PIN_TAIL,
    PIN_TENTACLE,
    IDX_TOP,
    IDX_MID,
    IDX_BOTTOM,
    TOP_START,
  };

  createCore(s);
  createBulb(s);
  createTail(s);
  createSystem(s);

  return s;
}

// ─── createCore ───────────────────────────────────────────────────────────────
// 8개의 특수 파티클(Y축 위)과 척추 constraint를 생성합니다.
// - 파티클 0~4: 고정 핀 (PointConstraint로 절대 위치 고정, weight=0)
// - 파티클 5~7: 부유 인덱스 핀 (spine DistanceConstraint로 범위 제한)
// - 파티클 8~:  rib 링 파티클 시작 (TOP_START)
function createCore(s) {
  const { verts, uvs, bulbFaces, queuedConstraints } = s;
  const { size, posTop, posMid, posBottom, posTail, posTentacle } = s;
  const {
    PIN_TOP,
    PIN_MID,
    PIN_BOTTOM,
    IDX_TOP,
    IDX_MID,
    IDX_BOTTOM,
    TOP_START,
  } = s;
  const { totalSegments } = s;

  function queueConstraints(...args) {
    if (args.length === 1 && Array.isArray(args[0]))
      push.apply(queuedConstraints, args[0]);
    else push.apply(queuedConstraints, args);
  }

  // 8개 파티클을 Y축 위에 배치
  const offsets = [
    posTop,
    posMid,
    posBottom,
    posTail,
    posTentacle, // PIN_TOP ~ PIN_TENTACLE (0~4)
    size * 1.5,
    -size * 0.5,
    -size, // IDX_TOP, IDX_MID, IDX_BOTTOM (5~7)
  ];
  for (const yo of offsets) {
    geomPoint(0, yo, 0, verts);
    uvs.push(0, 0);
  }

  // 척추 DistanceConstraint: IDX 파티클들이 Y축 상 일정 범위 안에 위치하도록 제한
  const spineA = particulate.DistanceConstraint.create(
    [0, size * 0.5],
    [PIN_TOP, IDX_TOP],
  );
  const spineB = particulate.DistanceConstraint.create(
    [size * 0.5, size * 0.7],
    [IDX_TOP, IDX_MID],
  );
  const spineC = particulate.DistanceConstraint.create(
    [0, size * 0.5],
    [PIN_BOTTOM, IDX_BOTTOM],
  );
  const spineD = particulate.DistanceConstraint.create(
    [size, size * 2],
    [IDX_TOP, IDX_BOTTOM],
  );
  // AxisConstraint: IDX 파티클들이 PIN_TOP→PIN_MID 축 위에 머물도록 강제
  const axis = particulate.AxisConstraint.create(PIN_TOP, PIN_MID, [
    IDX_TOP,
    IDX_MID,
    IDX_BOTTOM,
  ]);

  queueConstraints(spineA, spineB, spineC, spineD, axis);

  // IDX_TOP을 중심으로 첫 번째 rib 링과의 부채꼴 면 생성 (나중에 rib가 채워짐)
  facesRadial(IDX_TOP, TOP_START, totalSegments, bulbFaces);
}

// ─── updateRibs ───────────────────────────────────────────────────────────────
// 매 프레임 phase 값(0~1)에 따라 각 rib의 constraint 거리를 동적으로 변경합니다.
// phase가 높을수록 rib가 바깥으로 벌어져 종(bell)이 펼쳐지는 모션이 됩니다.
function updateRibs(ribs, phase, totalSegments) {
  const radiusOffset = 15; // 최대 반경 증가량

  for (const rib of ribs) {
    const rad = rib.radius + rib.yParam * phase * radiusOffset;
    const radOuter =
      (rib.radiusOuter || rib.radius) + rib.yParam * phase * radiusOffset;
    const radSpine =
      (rib.radiusSpine || rib.radius) + rib.yParam * phase * radiusOffset;

    if (rib.outer) {
      const outerLen = (2 * PI * radOuter) / totalSegments;
      rib.outer.setDistance(outerLen * 0.9, outerLen);
    }
    if (rib.inner) {
      const innerLen = (2 * PI * rad) / 3;
      rib.inner.setDistance(innerLen * 0.8, innerLen);
    }
    if (rib.spine) {
      rib.spine.setDistance(rad * 0.8, radSpine);
    }
  }
}

// ─── createSystem ─────────────────────────────────────────────────────────────
// 쌓인 verts와 constraint들로 ParticleSystem을 생성하고, 핀을 고정합니다.
function createSystem(s) {
  const { verts, queuedConstraints, weights } = s;
  const { PIN_TOP, PIN_MID, PIN_BOTTOM, PIN_TAIL, PIN_TENTACLE } = s;
  const { posTop, posMid, posBottom, posTail, posTentacle } = s;

  // verts 배열로 시스템 생성 (2 = constraint 반복 횟수)
  const system = particulate.ParticleSystem.create(verts, 2);

  for (const c of queuedConstraints) system.addConstraint(c);
  for (let i = 0; i < weights.length; i++) system.weights[i] = weights[i];

  // 핀 파티클은 weight=0 → 힘의 영향을 받지 않음
  system.setWeight(PIN_TOP, 0);
  system.setWeight(PIN_MID, 0);
  system.setWeight(PIN_BOTTOM, 0);
  system.setWeight(PIN_TAIL, 0);

  // PointConstraint: 핀을 절대 좌표에 고정
  system.addPinConstraint(
    particulate.PointConstraint.create([0, posTop, 0], PIN_TOP),
  );
  system.addPinConstraint(
    particulate.PointConstraint.create([0, posMid, 0], PIN_MID),
  );
  system.addPinConstraint(
    particulate.PointConstraint.create([0, posBottom, 0], PIN_BOTTOM),
  );
  system.addPinConstraint(
    particulate.PointConstraint.create([0, posTail, 0], PIN_TAIL),
  );
  system.addPinConstraint(
    particulate.PointConstraint.create([0, posTentacle, 0], PIN_TENTACLE),
  );

  // 300 tick 사전 완화: 시작부터 안정된 형태로 렌더링
  for (let i = 0; i < 300; i++) system.tick(1);

  s.system = system;
}

// ─── createBulb ───────────────────────────────────────────────────────────────
// ribsCount개의 링을 위→아래 순서로 생성하고, 인접 링 사이에 스킨(삼각면)을 붙입니다.
function createBulb(s) {
  const { ribsCount } = s;

  for (let i = 0; i < ribsCount; i++) {
    createRib(s, i, ribsCount);
    if (i > 0) createSkin(s, i - 1, i);
  }
}

// 링 하나: 원형으로 파티클 배치 + 외/내부 DistanceConstraint
function createRib(s, index, total) {
  const { verts, uvs, links, innerLinks, queuedConstraints, ribs } = s;
  const { size, yOffset, totalSegments, segmentsCount, ribRadiusVal } = s;
  const { IDX_TOP, IDX_BOTTOM, TOP_START } = s;

  function queueConstraints(...args) {
    if (args.length === 1 && Array.isArray(args[0]))
      push.apply(queuedConstraints, args[0]);
    else push.apply(queuedConstraints, args);
  }
  function addLinks(indices, target) {
    push.apply(target || links, indices);
  }

  const yParam = index / total;
  const yPos = size + yOffset - yParam * size; // 위(60)→아래(20) 순서로 배치
  const start = index * totalSegments + TOP_START;
  const radius = ribRadius(yParam) * ribRadiusVal; // 종(bell) 모양 커브 적용

  geomCircle(totalSegments, radius, yPos, verts);
  ribUvs(yParam, totalSegments, uvs);

  // 외부 링 constraint: 인접 파티클 간 거리 유지 (링 형태 붕괴 방지)
  const outerLen = (2 * PI * radius) / totalSegments;
  const outerRib = particulate.DistanceConstraint.create(
    [outerLen * 0.9, outerLen],
    linksLoop(start, totalSegments, []),
  );

  // 내부 삼각 sub-structure: 링이 3등분 구조로 찌그러지지 않도록 강화
  const innerLen = (2 * PI * radius) / 3;
  const indices = [];
  for (let i = 0; i < segmentsCount; i++)
    innerRibIndices(i * 3, start, totalSegments, indices);
  const innerRib = particulate.DistanceConstraint.create(
    [innerLen * 0.8, innerLen],
    indices,
  );

  // 첫/마지막 rib는 척추(IDX_TOP/IDX_BOTTOM)와 방사형으로 연결
  const isTop = index === 0,
    isBottom = index === total - 1;
  let spine, radiusSpine;
  if (isTop || isBottom) {
    const spineCenter = isTop ? IDX_TOP : IDX_BOTTOM;
    radiusSpine = isTop ? radius * 1.25 : radius;
    spine = particulate.DistanceConstraint.create(
      [radius * 0.5, radiusSpine],
      linksRadial(spineCenter, start, totalSegments, []),
    );
    queueConstraints(spine);
    addLinks(spine.indices, isTop ? links : innerLinks);
  }

  addLinks(outerRib.indices, innerLinks);
  addLinks(innerRib.indices, innerLinks);
  queueConstraints(outerRib, innerRib);

  ribs.push({
    start,
    radius,
    radiusSpine,
    yParam,
    yPos,
    outer: outerRib,
    inner: innerRib,
    spine,
  });
}

// 인접 두 링 사이: 세로 DistanceConstraint + 삼각면 생성
function createSkin(s, r0, r1) {
  const { verts, links, bulbFaces, queuedConstraints, ribs, totalSegments } = s;

  function queueConstraints(...args) {
    if (args.length === 1 && Array.isArray(args[0]))
      push.apply(queuedConstraints, args[0]);
    else push.apply(queuedConstraints, args);
  }

  const rib0 = ribs[r0],
    rib1 = ribs[r1];
  // 두 링의 첫 파티클 간 거리 → skin constraint 기준 길이
  const dist = particulate.Vec3.distance(verts, rib0.start, rib1.start);
  const skin = particulate.DistanceConstraint.create(
    [dist * 0.5, dist],
    linksRings(rib0.start, rib1.start, totalSegments, []),
  );

  queueConstraints(skin);
  push.apply(links, skin.indices);
  facesRings(rib0.start, rib1.start, totalSegments, bulbFaces);
}

// ─── createTail ───────────────────────────────────────────────────────────────
// sub-umbrella (종 아래 깔때기형 막): 15개 링을 위→아래로 생성
// 첫 번째 스킨은 마지막 벨 rib와 tail rib 0을 연결 (seamless 접합)
function createTail(s) {
  const { tailRibsCount } = s;
  for (let i = 0; i < tailRibsCount; i++) {
    createTailRib(s, i, tailRibsCount);
    createTailSkin(s, i - 1, i); // i=0일 때 r0=-1 → 마지막 벨 rib 사용
  }
}

// 꼬리 링 하나: 반경 커브 적용 + 느슨한 outer constraint (접히는 형태)
function createTailRib(s, index, total) {
  const { verts, uvs, innerLinks, queuedConstraints, ribs, tailRibs } = s;
  const { size, totalSegments, segmentsCount, tailRibRadiusFactor, IDX_MID } = s;

  function queueConstraints(...args) {
    if (args.length === 1 && Array.isArray(args[0]))
      push.apply(queuedConstraints, args[0]);
    else push.apply(queuedConstraints, args);
  }

  const lastRib = ribs[ribs.length - 1]; // 마지막 벨 rib (rib 19)
  const yParam = index / total; // 0(위)→~0.93(아래)
  const yPos = lastRib.yPos - yParam * size * 0.8; // 최대 32 units 아래로
  const start = verts.length / 3; // 현재 verts에서 새 파티클 시작 인덱스

  const radiusT = tailRibRadius(yParam); // [0..1] 형태 계수
  const radius = radiusT * lastRib.radius; // 구조적 반경
  const radiusOuter = radius + yParam * tailRibRadiusFactor; // 외부 constraint 기준 반경

  geomCircle(totalSegments, radius, yPos, verts);
  ribUvs(yParam, totalSegments, uvs);

  // 외부 링 constraint: 벨보다 느슨한 [0.9×, 1.5×] → 접히는/펄럭이는 형태
  const mainLen = (2 * PI * radiusOuter) / totalSegments;
  const outerRib = particulate.DistanceConstraint.create(
    [mainLen * 0.9, mainLen * 1.5],
    linksLoop(start, totalSegments, []),
  );

  // 내부 삼각 sub-structure (벨과 동일 방식)
  const innerLen = (2 * PI * radius) / 3;
  const innerIndices = [];
  for (let i = 0; i < segmentsCount; i++)
    innerRibIndices(i * 3, start, totalSegments, innerIndices);
  const innerRib = particulate.DistanceConstraint.create(
    [innerLen * 0.8, innerLen],
    innerIndices,
  );

  // 척추 연결: 마지막 tail rib만 IDX_MID에 방사형 연결
  let spine;
  if (index === total - 1) {
    spine = particulate.DistanceConstraint.create(
      [radius * 0.8, radius],
      linksRadial(IDX_MID, start, totalSegments, []),
    );
    queueConstraints(spine);
    push.apply(innerLinks, spine.indices);
  }

  queueConstraints(outerRib, innerRib);

  tailRibs.push({
    start,
    radius,
    radiusOuter,
    yParam: 1 - yParam, // 반전 저장: 위쪽(top) rib가 펄스 진폭 최대
    yPos,
    outer: outerRib,
    inner: innerRib,
    spine,
  });
}

// 인접 두 꼬리 링 사이: 세로 constraint + 삼각면 생성
// r0 < 0이면 마지막 벨 rib를 사용 (seamless 접합)
function createTailSkin(s, r0, r1) {
  const { verts, innerLinks, tailFaces, queuedConstraints, ribs, tailRibs, totalSegments } = s;

  function queueConstraints(...args) {
    if (args.length === 1 && Array.isArray(args[0]))
      push.apply(queuedConstraints, args[0]);
    else push.apply(queuedConstraints, args);
  }

  const rib0 = r0 < 0 ? ribs[ribs.length - 1] : tailRibs[r0];
  const rib1 = tailRibs[r1];
  const dist = particulate.Vec3.distance(verts, rib0.start, rib1.start);
  const skin = particulate.DistanceConstraint.create(
    [dist * 0.5, dist],
    linksRings(rib0.start, rib1.start, totalSegments, []),
  );

  queueConstraints(skin);
  push.apply(innerLinks, skin.indices);
  facesRings(rib0.start, rib1.start, totalSegments, tailFaces);
}

export default function Jellyfish() {
  const animTimeRef = useRef(0);
  const bulbMatRef = useRef(); // BulbShaderMaterial (주 벨, 동적 투명도)
  const faintMatRef = useRef(); // GelShaderMaterial (보조 림 글로우)
  const tailMatRef = useRef(); // TailShaderMaterial (꼬리 sub-umbrella)
  const hoodMatRef = useRef(); // TentacleShaderMaterial (외곽 와이어 Hood)

  // 한 번만 빌드: 물리 시스템 + 버퍼 데이터
  const { system, ribs, tailRibs, links, bulbFaces, tailFaces, uvs, totalSegments } = useMemo(
    () => buildJellyfish(),
    [],
  );

  // system.positions Float32Array를 직접 참조하는 공유 헬퍼
  // bulb와 tail 모두 같은 물리 버퍼를 참조하므로, index buffer만 다름
  function makeGeo(faces) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(system.positions, 3));
    geo.setAttribute("positionPrev", new THREE.BufferAttribute(system.positionsPrev, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(faces), 1));
    return geo;
  }

  const bulbGeo = useMemo(() => {
    const geo = makeGeo(bulbFaces);
    geo.computeVertexNormals();
    return geo;
  }, [system, bulbFaces, uvs]);

  const tailGeo = useMemo(() => makeGeo(tailFaces), [system, tailFaces, uvs]);

  // Hood Contour: system.positions를 공유, index = links 쌍 (LineSegments)
  const linksGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(system.positions, 3));
    geo.setAttribute("positionPrev", new THREE.BufferAttribute(system.positionsPrev, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(links), 1));
    return geo;
  }, [system, links]);

  // 매 프레임: 물리 tick → position 버퍼 갱신 + stepProgress 동기화
  useFrame((_, delta) => {
    const t = (animTimeRef.current += delta);
    const phase = (sin(t * PI - PI * 0.5) + 1) * 0.5; // 0→1→0 사이클

    updateRibs(ribs, phase, totalSegments);
    updateRibs(tailRibs, phase, totalSegments);
    system.tick(delta);

    // position / positionPrev 둘 다 갱신 (셰이더 lerp에 필요)
    // 두 geo가 같은 Float32Array를 참조하지만 각 BufferAttribute는 독립적 → 둘 다 flagging
    bulbGeo.attributes.position.needsUpdate = true;
    bulbGeo.attributes.positionPrev.needsUpdate = true;
    bulbGeo.computeVertexNormals();
    tailGeo.attributes.position.needsUpdate = true;
    tailGeo.attributes.positionPrev.needsUpdate = true;

    linksGeo.attributes.position.needsUpdate = true;
    linksGeo.attributes.positionPrev.needsUpdate = true;

    if (bulbMatRef.current) {
      bulbMatRef.current.stepProgress = phase;
      bulbMatRef.current.time = t;
    }
    if (faintMatRef.current) faintMatRef.current.stepProgress = phase;
    if (tailMatRef.current) tailMatRef.current.stepProgress = phase;
    if (hoodMatRef.current) hoodMatRef.current.stepProgress = phase;
  });

  // scale=0.05: 원본 단위(~60 units)를 씬에 맞게 축소
  return (
    <group scale={0.05}>
      {/* bulbFaint: 보조 파란 림 글로우, 살짝 크게 */}
      <mesh geometry={bulbGeo} scale={1.05}>
        <gelShaderMaterial
          ref={faintMatRef}
          diffuse={FAINT_COLOR}
          opacity={0.05}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* bulb: 주 벨, 동적 UV 패턴 투명도 */}
      <mesh geometry={bulbGeo} scale={0.95}>
        <bulbShaderMaterial
          ref={bulbMatRef}
          opacity={0.75}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* tail: sub-umbrella 깔때기형 막 */}
      <mesh geometry={tailGeo} scale={0.95}>
        <tailShaderMaterial
          ref={tailMatRef}
          opacity={0.75}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* hoodContour: 외곽 와이어 (LineSegments), AdditiveBlending */}
      <lineSegments geometry={linksGeo}>
        <tentacleShaderMaterial
          ref={hoodMatRef}
          opacity={0.35}
          transparent
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}
