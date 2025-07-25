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

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const flipX = centerLon < 0 ? -1 : 1;
    const flipZ = centerLat < 0 ? -1 : 1;

    const centerX = flipX * (centerLon - minLon) * scale;
    const centerZ = flipZ * (centerLat - minLat) * scale;
    controls.target.set(centerX, 0, centerZ);

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
      const R = 6371e3;
      const φ1 = toRad(a.lat);
      const φ2 = toRad(b.lat);
      const Δφ = toRad(b.lat - a.lat);
      const Δλ = toRad(b.lon - a.lon);
      const aVal = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    };

    points.forEach((pt, i) => {
      const x = flipX * (pt.lon - minLon) * scale;
      const y = (pt.ele - minEle);
      const z = flipZ * (pt.lat - minLat) * scale;
      vertices.push(x, y, z);
      const color = colorScale(pt.ele);
      colors.push(color.r, color.g, color.b);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    // Soft blended fill below line
    const fillMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide });
    const fillGeometry = new THREE.BufferGeometry();
    const fillVertices = [];
    const fillColors = [];

    for (let i = 1; i < points.length; i++) {
      const pt1 = points[i - 1];
      const pt2 = points[i];
      const x1 = flipX * (pt1.lon - minLon) * scale;
      const y1 = (pt1.ele - minEle);
      const z1 = flipZ * (pt1.lat - minLat) * scale;

      const x2 = flipX * (pt2.lon - minLon) * scale;
      const y2 = (pt2.ele - minEle);
      const z2 = flipZ * (pt2.lat - minLat) * scale;

      fillVertices.push(x1, 0, z1);
      fillVertices.push(x2, 0, z2);
      fillVertices.push(x1, y1, z1);

      fillVertices.push(x2, 0, z2);
      fillVertices.push(x2, y2, z2);
      fillVertices.push(x1, y1, z1);

      const color1 = colorScale(pt1.ele);
      const color2 = colorScale(pt2.ele);
      for (let j = 0; j < 3; j++) fillColors.push(color1.r, color1.g, color1.b);
      for (let j = 0; j < 3; j++) fillColors.push(color2.r, color2.g, color2.b);
    }

    fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillVertices, 3));
    fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fillColors, 3));
    const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    scene.add(fillMesh);

    // Start and End Markers (unchanged)
    const startPt = points[0];
    const startX = flipX * (startPt.lon - minLon) * scale;
    const startY = (startPt.ele - minEle);
    const startZ = flipZ * (startPt.lat - minLat) * scale;
    const startImg = document.createElement('img');
    startImg.src = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
    startImg.style.width = '20px';
    startImg.style.height = '20px';
    const startLabel = new CSS2DObject(startImg);
    startLabel.position.set(startX, startY + 10, startZ);
    scene.add(startLabel);

    const endPt = points[points.length - 1];
    const endX = flipX * (endPt.lon - minLon) * scale;
    const endY = (endPt.ele - minEle);
    const endZ = flipZ * (endPt.lat - minLat) * scale;
    const endImg = document.createElement('img');
    endImg.src = 'https://maps.google.com/mapfiles/ms/icons/flag.png';
    endImg.style.width = '20px';
    endImg.style.height = '20px';
    const endLabel = new CSS2DObject(endImg);
    endLabel.position.set(endX, endY + 10, endZ);
    scene.add(endLabel);

    points.forEach((pt, i) => {
      if (i > 0) {
        totalDistance += haversine(points[i - 1], pt);
        if (Math.floor(totalDistance / 1609.34) > mileMarkers.length) {
          const mileNum = mileMarkers.length + 1;
          const img = document.createElement('img');
          img.src = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
          img.style.width = '20px';
          img.style.height = '20px';
          const label = new CSS2DObject(img);
          const x = flipX * (pt.lon - minLon) * scale;
          const y = (pt.ele - minEle);
          const z = flipZ * (pt.lat - minLat) * scale;
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
    mileMarkers.forEach(marker => scene.add(marker));

    scene.add(new THREE.AxesHelper(300));
    const gridWidth = (maxLon - minLon) * scale;
    const gridHeight = (maxLat - minLat) * scale;
    const gridSize = Math.max(gridWidth, gridHeight) * 1.2;
    const gridDivisions = Math.floor(gridSize / 50);
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
    gridHelper.position.set(centerX, 0, centerZ);
    scene.add(gridHelper);

    camera.position.set(centerX, 0, centerZ + gridSize);
    camera.lookAt(centerX, 0, centerZ);
    controls.update();

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    return () => {
      mountRef.current.removeChild(renderer.domElement);
      mountRef.current.removeChild(labelRenderer.domElement);
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

