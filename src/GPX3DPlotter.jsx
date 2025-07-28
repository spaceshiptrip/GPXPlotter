import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GPXParser from 'gpxparser';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement } from 'chart.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

export default function GPX3DPlotter() {
  const mountRef = useRef(null);
  const [fileContent, setFileContent] = useState(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const defaultViewRef = useRef({});
  const [colorByGrade, setColorByGrade] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [showChart, setShowChart] = useState(false);

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
    const elevationProfile = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (i > 0) totalDistance += haversine(points[i - 1], pt);
      elevationProfile.push({
        mile: totalDistance / 1609.34,
        elevation: pt.ele
      });

      const x = flipX * (pt.lon - minLon) * scale;
      const y = pt.ele - minEle;
      const z = flipZ * (pt.lat - minLat) * scale;

      vertices.push(x, y, z);
      const color = new THREE.Color().setHSL(0.6 - ((pt.ele - minEle) / (maxEle - minEle)) * 0.6, 1, 0.5);
      colors.push(color.r, color.g, color.b);

      if (i > 0) {
        const pt2 = points[i - 1];
        const x2 = flipX * (pt2.lon - minLon) * scale;
        const y2 = pt2.ele - minEle;
        const z2 = flipZ * (pt2.lat - minLat) * scale;

        fillVertices.push(x2, 0, z2, x, 0, z, x2, y2, z2);
        fillVertices.push(x, 0, z, x, y, z, x2, y2, z2);

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

    const eleFeet = elevationProfile.map(p => (p.elevation * 3.28084).toFixed(0));
    const gradeColors = elevationProfile.map((_, i) => {
      if (i === 0) return 'rgba(75,192,192,1)';
      const dist = (elevationProfile[i].mile - elevationProfile[i - 1].mile) * 1609.34;
      const elevDiff = elevationProfile[i].elevation - elevationProfile[i - 1].elevation;
      const pctGrade = (elevDiff / dist) * 100;
      const h = 0.3 - Math.min(Math.max(pctGrade, -10), 10) / 20 * 0.3;
      const color = new THREE.Color().setHSL(h, 1, 0.5);
      return `rgb(${Math.floor(color.r * 255)},${Math.floor(color.g * 255)},${Math.floor(color.b * 255)})`;
    });

    setChartData({
      labels: elevationProfile.map(p => p.mile.toFixed(2)),
      datasets: [
        {
          label: 'Elevation Profile (ft)',
          data: eleFeet,
          backgroundColor: gradeColors,
          borderColor: gradeColors,
          pointRadius: 0,
          tension: 0.3
        }
      ]
    });

    return () => {
      mountRef.current.removeChild(renderer.domElement);
      mountRef.current.removeChild(labelRenderer.domElement);
    };
  }, [fileContent]);

  const handleFileUpload = e => {
    const reader = new FileReader();
    reader.onload = event => setFileContent(event.target.result);
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
      <button onClick={() => setShowChart(prev => !prev)} className="absolute top-36 left-4 z-10 p-2 bg-purple-600 text-white rounded shadow">
        {showChart ? 'Hide 2D Plot' : 'Show 2D Plot'}
      </button>
      {showChart && chartData && (
        <div className="absolute bottom-0 left-0 w-full bg-white bg-opacity-90 z-10 p-4" style={{ height: '200px' }}>
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: { title: { display: true, text: 'Miles' } },
                y: { title: { display: true, text: 'Elevation (ft)' } }
              },
              plugins: { legend: { display: false } }
            }}
          />
        </div>
      )}
      <div ref={mountRef} className="w-full h-full relative" />
    </div>
  );
}

