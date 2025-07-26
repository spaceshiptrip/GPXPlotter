import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GPXParser from 'gpxparser';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

export default function GPX3DPlotter() {
  const mountRef = useRef(null);
  const [fileContent, setFileContent] = useState(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const defaultViewRef = useRef({});
  const [colorByGrade, setColorByGrade] = useState(false);

  useEffect(() => {
    if (!fileContent) return;

    const parser = new GPXParser();
    parser.parse(fileContent);
    const track = parser.tracks[0];
    const points = track.points;

    if (!points.length) return;

    const toRad = deg => (deg * Math.PI) / 180;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    cameraRef.current = camera;

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
    controlsRef.current = controls;

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

    const flipX = 1;
    const flipZ = -1;

    const centerX = flipX * (centerLon - minLon) * scale;
    const centerZ = flipZ * (centerLat - minLat) * scale;
    controls.target.set(centerX, 0, centerZ);

    defaultViewRef.current = {
      cameraPos: new THREE.Vector3(centerX, Math.max((maxLon - minLon) * scale, (maxLat - minLat) * scale) * 1.2 / 2, centerZ + 0.1),
      target: new THREE.Vector3(centerX, 0, centerZ)
    };

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const fillGeometry = new THREE.BufferGeometry();
    const fillVertices = [];
    const fillColors = [];

    const haversine = (a, b) => {
      const R = 6371e3;
      const φ1 = toRad(a.lat);
      const φ2 = toRad(b.lat);
      const Δφ = toRad(b.lat - a.lat);
      const Δλ = toRad(b.lon - a.lon);
      const aVal = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    };

    let milePoints = [];
    let gradePerMile = [];
    let cumulativeDist = 0;
    let lastMileIndex = 0;

    for (let i = 1; i < points.length; i++) {
      cumulativeDist += haversine(points[i - 1], points[i]);
      if (cumulativeDist >= 1609.34 || i === points.length - 1) {
        const elevDiff = points[i].ele - points[lastMileIndex].ele;
        const grade = (elevDiff / cumulativeDist) * 100;
        gradePerMile.push({ index: i, grade });
        lastMileIndex = i;
        cumulativeDist = 0;
      }
    }

    const mileMarkers = [];
    let totalDistance = 0;
    let highestPt = { ele: -Infinity, x: 0, y: 0, z: 0, mile: 0 };
    let currentMileGrade = 0;
    let mileIndex = 0;

    const startIcon = document.createElement('div');
    startIcon.textContent = '🟢';
    const startLabel = new CSS2DObject(startIcon);

    const endIcon = document.createElement('div');
    endIcon.textContent = '🏁';
    const endLabel = new CSS2DObject(endIcon);

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const x = flipX * (pt.lon - minLon) * scale;
      const y = pt.ele - minEle;
      const z = flipZ * (pt.lat - minLat) * scale;

      vertices.push(x, y, z);
      totalDistance += i > 0 ? haversine(points[i - 1], pt) : 0;

      if (mileIndex < gradePerMile.length && i <= gradePerMile[mileIndex].index) {
        currentMileGrade = gradePerMile[mileIndex].grade;
      } else if (mileIndex < gradePerMile.length) {
        mileIndex++;
      }

      const color = colorByGrade
        ? new THREE.Color().setHSL(0.6 - Math.min(Math.abs(currentMileGrade) / 20, 1) * 0.6, 1, 0.5)
        : new THREE.Color().setHSL(0.6 - ((pt.ele - minEle) / (maxEle - minEle)) * 0.6, 1, 0.5);
      colors.push(color.r, color.g, color.b);

      if (i > 0) {
        const pt2 = points[i - 1];
        const x2 = flipX * (pt2.lon - minLon) * scale;
        const y2 = pt2.ele - minEle;
        const z2 = flipZ * (pt2.lat - minLat) * scale;

        fillVertices.push(x2, 0, z2);
        fillVertices.push(x, 0, z);
        fillVertices.push(x2, y2, z2);

        fillVertices.push(x, 0, z);
        fillVertices.push(x, y, z);
        fillVertices.push(x2, y2, z2);

        const baseColor = color.clone().lerp(new THREE.Color(0x000000), 0.8);
        for (let j = 0; j < 6; j++) fillColors.push(baseColor.r, baseColor.g, baseColor.b);
      }

      if (pt.ele > highestPt.ele) {
        highestPt = { x, y, z, ele: pt.ele, mile: totalDistance / 1609.34 };
      }

      if (i === 0) {
        startLabel.position.set(x, y + 10, z);
        scene.add(startLabel);
      }

      if (i === points.length - 1) {
        endLabel.position.set(x, y + 10, z);
        scene.add(endLabel);
      }

      if (Math.floor(totalDistance / 1609.34) > mileMarkers.length) {
        const marker = document.createElement('div');
        marker.className = 'mile-marker';
        marker.textContent = `${mileMarkers.length + 1}`;
        marker.style.background = '#4285F4';
        marker.style.color = 'white';
        marker.style.padding = '2px 6px';
        marker.style.borderRadius = '12px';
        marker.style.fontWeight = 'bold';
        marker.style.fontSize = '12px';
        marker.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
        const label = new CSS2DObject(marker);
        label.position.set(x, y, z);
        scene.add(label);
        mileMarkers.push(label);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true })));

    fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillVertices, 3));
    fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fillColors, 3));
    scene.add(new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide })));

    const elevationLabel = document.createElement('div');
    elevationLabel.className = 'elevation-peak';
    const eleFeet = highestPt.ele * 3.28084;
    elevationLabel.innerHTML = `⛰️<br/>${highestPt.ele.toFixed(1)} m / ${eleFeet.toFixed(0)} ft<br/>Mile ${highestPt.mile.toFixed(2)}`;
    elevationLabel.style.color = 'black';
    elevationLabel.style.padding = '4px';
    elevationLabel.style.background = 'rgba(255,255,255,0.85)';
    elevationLabel.style.borderRadius = '6px';
    elevationLabel.style.fontSize = '12px';
    const elevationObj = new CSS2DObject(elevationLabel);
    elevationObj.position.set(highestPt.x, highestPt.y + 10, highestPt.z);
    scene.add(elevationObj);

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.style.position = 'absolute';
    legend.style.bottom = '20px';
    legend.style.left = '20px';
    legend.style.padding = '6px 10px';
    legend.style.background = 'rgba(255,255,255,0.9)';
    legend.style.borderRadius = '6px';
    legend.style.fontSize = '12px';
    legend.style.color = '#333';
    legend.style.zIndex = '9999';
    legend.innerHTML = colorByGrade
      ? '<b>Grade % Legend</b><br/>Red: 20%+<br/>Orange: 10–20%<br/>Yellow: 5–10%<br/>Green: 0–5%'
      : '<b>Elevation Legend</b><br/>Purple: High<br/>Blue: Mid<br/>Green: Low';
    mountRef.current.appendChild(legend);

    const grid = new THREE.GridHelper(Math.max((maxLon - minLon) * scale, (maxLat - minLat) * scale) * 1.2, 20);
    grid.position.set(centerX, 0, centerZ);
    scene.add(grid);

    camera.position.copy(defaultViewRef.current.cameraPos);
    camera.lookAt(defaultViewRef.current.target);
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
      const legends = mountRef.current.querySelectorAll('.legend');
      legends.forEach(l => l.remove());
    };
  }, [fileContent, colorByGrade]);

  const handleFileUpload = e => {
    const reader = new FileReader();
    reader.onload = event => {
      setFileContent(event.target.result);
    };
    reader.readAsText(e.target.files[0]);
  };

  const resetView = () => {
    if (controlsRef.current && cameraRef.current && defaultViewRef.current.cameraPos) {
      cameraRef.current.position.copy(defaultViewRef.current.cameraPos);
      controlsRef.current.target.copy(defaultViewRef.current.target);
      controlsRef.current.update();
    }
  };

  const toggleColorMode = () => {
    setColorByGrade(prev => !prev);
  };

  return (
    <div className="w-screen h-screen">
      <input type="file" accept=".gpx" onChange={handleFileUpload} className="absolute z-10 m-4 p-2 bg-white rounded shadow" />
      <button onClick={resetView} className="absolute top-20 left-4 z-10 p-2 bg-blue-500 text-white rounded shadow">Reset View</button>
      <button onClick={toggleColorMode} className="absolute top-36 left-4 z-10 p-2 bg-green-600 text-white rounded shadow">
        Toggle Color Mode
      </button>
      <div ref={mountRef} className="w-full h-full relative" />
    </div>
  );
}

