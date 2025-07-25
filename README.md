# GPX 3D Plotter

A 3D GPX track visualizer built with React and Three.js. It displays latitude, longitude, and elevation data from GPX files as interactive 3D plots.

## Features

- 3D track plotting based on lat/lon/elevation
- Dynamic grid and axis
- Colorized elevation lines
- Gradient-filled elevation areas from track to ground
- Mile markers, start & end markers with icons
- OrbitControls for rotation/zoom/pan

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Run the app
```bash
npm start
```

### 3. Open in browser
Visit: [http://localhost:3000](http://localhost:3000)

### 4. Load a GPX file
Click the upload button to select and render a `.gpx` file.

## Customizing Fill Opacity
To adjust the transparency of the elevation area fill, edit the following line in `GPX3DPlotter.jsx`:

```js
const fillMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.15 });
```

You can change the `opacity` value (between 0 and 1) to control how visible or soft the filled area appears.

## Screenshot
![Example Screenshot](screenshot.png)

## Credits
Made with ❤️ by spaceshiptrip 🚀

