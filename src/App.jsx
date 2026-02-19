import { Canvas } from '@react-three/fiber'
import Experience from './Experience'

export default function App() {
  return (
    <Canvas
      camera={{
        fov: 45,
        near: 0.1,
        far: 200,
        position: [0, 2, 8]  // 해파리 중심(y≈2, scale=0.05 기준) 정면
      }}
    >
      <Experience />
    </Canvas>
  )
}
