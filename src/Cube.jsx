import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function Cube(props) {
  const cubeRef = useRef()

  useFrame((state, delta) => {
    cubeRef.current.rotation.y += delta * 0.2
  })

  return (
    <mesh ref={cubeRef} {...props}>
      <boxGeometry />
      <meshStandardMaterial color="mediumpurple" />
    </mesh>
  )
}
