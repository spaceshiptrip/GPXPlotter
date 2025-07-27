import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GPXParser from 'gpxparser';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

export default function GPX3DPlotter() {
  const mountRef = useRef(null);
  const [fileContent, setFileContent] = useState(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const defaultViewRef = useRef({});
  const [colorByGrade, setColorByGrade] = useState(false);
  const [elevationProfile, setElevationProfile] = useState([]);

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

    let totalDistance = 0;
    const elevationData = [];
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const x = flipX * (pt.lon - minLon) * scale;
      const y = pt.ele - minEle;
      const z = flipZ * (pt.lat - minLat) * scale;

      vertices.push(x, y, z);
      totalDistance += i > 0 ? haversine(points[i - 1], pt) : 0;

      const color = new THREE.Color().setHSL((pt.ele - minEle) / (maxEle - minEle), 1, 0.5);
      colors.push(color.r, color.g, color.b);

      elevationData.push({ mile: totalDistance / 1609.34, elevation: pt.ele });

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
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true })));

    fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillVertices, 3));
    fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fillColors, 3));
    scene.add(new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide })));

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

    setElevationProfile(elevationData);

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

  const resetView = () => {
    if (controlsRef.current && cameraRef.current && defaultViewRef.current.cameraPos) {
      cameraRef.current.position.copy(defaultViewRef.current.cameraPos);
      controlsRef.current.target.copy(defaultViewRef.current.target);
      controlsRef.current.update();
    }
  };

  return (
    <div className="w-screen h-screen">
      <input type="file" accept=".gpx" onChange={handleFileUpload} className="absolute z-10 m-4 p-2 bg-white rounded shadow" />
      <button onClick={resetView} className="absolute top-20 left-4 z-10 p-2 bg-blue-500 text-white rounded shadow">Reset View</button>
      <div className="absolute bottom-4 left-4 w-[600px] bg-white p-4 rounded shadow z-10">
        <Line
          data={{
            labels: elevationProfile.map(d => d.mile.toFixed(2)),
            datasets: [{
              label: 'Elevation (m)',
              data: elevationProfile.map(d => d.elevation),
              fill: true,
              backgroundColor: 'rgba(66, 133, 244, 0.2)',
              borderColor: 'rgba(66, 133, 244, 1)',
            }]
          }}
          options={{
            responsive: true,
            plugins: {
              legend: { display: true },
              tooltip: { mode: 'index', intersect: false }
            },
            scales: {
              x: { title: { display: true, text: 'Distance (miles)' } },
              y: { title: { display: true, text: 'Elevation (m)' } }
            }
          }}
        />
      </div>
      <div ref={mountRef} className="w-full h-full relative" />
    </div>
  );
}

