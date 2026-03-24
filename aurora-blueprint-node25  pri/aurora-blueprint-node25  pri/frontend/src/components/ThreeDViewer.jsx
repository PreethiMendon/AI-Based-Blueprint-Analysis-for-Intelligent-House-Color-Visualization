// frontend/src/components/ThreeDViewer.jsx
import React, {useMemo} from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

function RoomMesh({room, color, position}) {
  const shape = useMemo(() => {
    // use pixel widths but scale to meters
    const w = Math.max(0.8, (room.w_px || room.w) / 120)
    const h = Math.max(0.8, (room.h_px || room.h) / 120)
    return new THREE.BoxGeometry(w, 2.5, h)
  }, [room])
  return (
    <mesh geometry={shape} position={position} castShadow>
      <meshStandardMaterial color={color || '#777'} metalness={0.2} roughness={0.6} />
    </mesh>
  )
}

export default function ThreeDViewer({areas, colorMap}) {
  const positions = areas.map((a,i)=> [i*2.8, 1.25, 0])
  return (
    <div style={{height: '400px', width: '100%'}} className="rounded">
      <Canvas shadows camera={{position:[5,5,8], fov:50}}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5,10,7]} intensity={0.8} />
        <OrbitControls />
        {areas.map((a,i)=>(
          <RoomMesh key={a.id} room={a} color={colorMap[a.id]} position={positions[i]} />
        ))}
        <gridHelper args={[20,20]} />
      </Canvas>
    </div>
  )
}
