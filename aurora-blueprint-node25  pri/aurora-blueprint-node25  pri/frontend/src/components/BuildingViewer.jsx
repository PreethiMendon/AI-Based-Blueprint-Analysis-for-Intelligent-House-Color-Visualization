// frontend/src/components/BuildingViewer.jsx
import React, {useMemo} from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

function Wall({pos, size, color}){
  const geom = useMemo(()=> new THREE.BoxGeometry(size[0], size[1], size[2]), [size])
  return (
    <mesh geometry={geom} position={pos}>
      <meshStandardMaterial color={color || '#e5e7eb'} />
    </mesh>
  )
}

function Roof({pos, size, color}){
  // simple sloped roof using two boxes rotated
  return (
    <group position={pos}>
      <mesh position={[0, size[1]/2, 0]}>
        <boxGeometry args={[size[0], 0.2, size[2]]} />
        <meshStandardMaterial color={color || '#8b5e3c'} />
      </mesh>
      <mesh position={[0, size[1]/2 + 0.8, 0]} rotation={[0.4,0,0]}>
        <boxGeometry args={[size[0], 0.2, size[2]]} />
        <meshStandardMaterial color={color || '#7b3f2f'} />
      </mesh>
    </group>
  )
}

export default function BuildingViewer({areas=[], colorMap={}}){
  // compute building footprint from areas (naive bounding)
  const width = Math.max(6, Math.min(24, (areas.reduce((s,a)=> s + (a.w_px||100),0)/100)))
  const depth = Math.max(6, Math.min(24, (areas.reduce((s,a)=> s + (a.h_px||100),0)/100)))
  const wallColor = Object.values(colorMap)[0] || '#e5e7eb'
  const roofColor = Object.values(colorMap)[1] || '#7b3f2f'
  return (
    <div style={{height: '420px', width:'100%'}} className="rounded">
      <Canvas shadows camera={{position:[width, width, width], fov:40}}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[10,20,10]} intensity={0.9} />
        <OrbitControls />
        {/* floor */}
        <mesh rotation-x={-Math.PI/2} position={[0,-0.01,0]}>
          <planeGeometry args={[200,200]} />
          <meshStandardMaterial color={'#f8fafc'} />
        </mesh>

        {/* walls as a big box shell */}
        <Wall pos={[0,1.5,0]} size={[width,3,depth]} color={wallColor} />
        {/* roof */}
        <Roof pos={[0,2.1,0]} size={[width,1.8,depth]} color={roofColor} />

        {/* small door */}
        <mesh position={[ -width/2 + 0.8, 0.8, 0 ]}>
          <boxGeometry args={[0.8,1.6,0.1]} />
          <meshStandardMaterial color={Object.values(colorMap)[2] || '#6b2c1e'} />
        </mesh>

        {/* windows — create one per area if available */}
        {areas.slice(0,4).map((a,i)=>(
          <mesh key={a.id} position={[ (i-1.5)*1.4, 1.2, depth/2 + 0.05 ]}>
            <boxGeometry args={[0.8,0.8,0.05]} />
            <meshStandardMaterial color={'#bfdbfe'} />
          </mesh>
        ))}
      </Canvas>
    </div>
  )
}
