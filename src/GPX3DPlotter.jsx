import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GPXParser from 'gpxparser';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

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

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mountRef.current.appendChild(labelRenderer.domElement);

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

    const mileMarkers = [];
    let totalDistance = 0;
    const toRad = deg => (deg * Math.PI) / 180;
    const haversine = (a, b) => {
      const R = 6371e3; // meters
      const φ1 = toRad(a.lat);
      const φ2 = toRad(b.lat);
      const Δφ = toRad(b.lat - a.lat);
      const Δλ = toRad(b.lon - a.lon);
      const aVal = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    };

    points.forEach((pt, i) => {
      const x = (pt.lon - minLon) * scale;
      const y = (pt.ele - minEle);
      const z = (pt.lat - minLat) * scale;
      vertices.push(x, y, z);

      const color = colorScale(pt.ele);
      colors.push(color.r, color.g, color.b);

      if (i > 0) {
        totalDistance += haversine(points[i - 1], pt);
        if (Math.floor(totalDistance / 1609.34) > mileMarkers.length) {
          const mileNum = mileMarkers.length + 1;
          const img = document.createElement('img');
          img.src = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
          img.style.width = '20px';
          img.style.height = '20px';
          const label = new CSS2DObject(img);
          label.position.set(x, y + 10, z);

          const textDiv = document.createElement('div');
          textDiv.textContent = `${mileNum} mi`;
          textDiv.style.color = 'white';
          textDiv.style.fontSize = '10px';
          textDiv.style.textAlign = 'center';
          textDiv.style.marginTop = '-4px';
          const textLabel = new CSS2DObject(textDiv);
          textLabel.position.set(x, y + 18, z);

          mileMarkers.push(label);
          mileMarkers.push(textLabel);
        }
      }
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    // Add start marker (green pin)
    const startPt = points[0];
    const startX = (startPt.lon - minLon) * scale;
    const startY = (startPt.ele - minEle);
    const startZ = (startPt.lat - minLat) * scale;
    const startImg = document.createElement('img');
    startImg.src = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
    startImg.style.width = '20px';
    startImg.style.height = '20px';
    const startLabel = new CSS2DObject(startImg);
    startLabel.position.set(startX, startY + 10, startZ);
    scene.add(startLabel);

    // Add end marker (checkered flag)
    const endPt = points[points.length - 1];
    const endX = (endPt.lon - minLon) * scale;
    const endY = (endPt.ele - minEle);
    const endZ = (endPt.lat - minLat) * scale;
    const endImg = document.createElement('img');
    endImg.src = 'https://maps.google.com/mapfiles/ms/icons/flag.png';
    endImg.style.width = '20px';
    endImg.style.height = '20px';
    const endLabel = new CSS2DObject(endImg);
    endLabel.position.set(endX, endY + 10, endZ);
    scene.add(endLabel);

    mileMarkers.forEach(marker => scene.add(marker));

    const axisLength = 300;
    const axesHelper = new THREE.AxesHelper(axisLength);
    scene.add(axesHelper);

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
      labelRenderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      mountRef.current.removeChild(renderer.domElement);
      mountRef.current.removeChild(labelRenderer.domElement);
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

