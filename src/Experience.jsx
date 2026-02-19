import { OrbitControls } from "@react-three/drei";
import { Perf } from "r3f-perf";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Jellyfish from "./Jellyfish";
import JellyfishPoints from "./JellyfishPoints";

export default function Experience() {
  return (
    <>
      <Perf position="top-left" />
      <OrbitControls makeDefault />

      <directionalLight position={[1, 2, 3]} intensity={4.5} />
      <ambientLight intensity={1.5} />

      <Jellyfish />

      {/* 원본과 동일한 Bloom 효과: strength=0.8 */}
      <EffectComposer>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.8}
        />
      </EffectComposer>
    </>
  );
}
