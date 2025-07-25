import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GPXParser from 'gpxparser';

export default function GPX3DPlotter() {
  const mountRef = useRef(null);
  const [fileContent, setFileContent] = useState(null);

  useEffect(() => {
    if (!fileContent) return;

    const parser = new GPXParser();
    parser.parse(fileContent);
    const track = parser.tracks[0];
    const points = track.points;

    if (!points.length) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 1.2;
    controls.target.set(0, 0, 0);

    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const eles = points.map(p => p.ele);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minEle = Math.min(...eles);
    const maxEle = Math.max(...eles);

    const scale = 100000;

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    const colorScale = (ele) => {
      const norm = (ele - minEle) / (maxEle - minEle);
      return new THREE.Color().setHSL(0.6 - norm * 0.6, 1, 0.5);
    };

    points.forEach((pt) => {
      const x = (pt.lon - minLon) * scale;
      const y = (pt.ele - minEle);
      const z = (pt.lat - minLat) * scale;
      vertices.push(x, y, z);

      const color = colorScale(pt.ele);
      colors.push(color.r, color.g, color.b);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    const axisLength = 300;
    const axesHelper = new THREE.AxesHelper(axisLength);
    scene.add(axesHelper);

    // Dynamically size the grid based on the plot bounds and center it
    const gridWidth = (maxLon - minLon) * scale;
    const gridHeight = (maxLat - minLat) * scale;
    const gridSize = Math.max(gridWidth, gridHeight);
    const gridDivisions = Math.floor(gridSize / 50);
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
    gridHelper.position.set(gridWidth / 2, 0, gridHeight / 2);
    scene.add(gridHelper);

    camera.position.set(gridWidth / 2, (maxEle - minEle) * 2, gridHeight / 2);
    controls.update();

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      mountRef.current.removeChild(renderer.domElement);
      window.removeEventListener('resize', handleResize);
    };
  }, [fileContent]);

  const handleFileUpload = e => {
    const reader = new FileReader();
    reader.onload = event => {
      setFileContent(event.target.result);
    };
    reader.readAsText(e.target.files[0]);
  };

  return (
    <div className="w-screen h-screen">
      <input type="file" accept=".gpx" onChange={handleFileUpload} className="absolute z-10 m-4 p-2 bg-white rounded shadow" />
      <div ref={mountRef} className="w-full h-full relative" />
    </div>
  );
}

