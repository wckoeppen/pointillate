import "./style.css";
import { Delaunay } from "d3-delaunay";

let currentPoints = [];
let delaunay;
let voronoi;
let animationFrameId = null;
let imgCanvas = document.createElement("canvas");
const canvas = document.getElementById("canvas");
const colorToggle = document.getElementById("colorToggle");
const polyToggle = document.getElementById("polyToggle");
const circToggle = document.getElementById("circToggle");

const minRadiusSlider = document.getElementById("minRadius");
const maxRadiusSlider = document.getElementById("maxRadius");
const numPointsSlider = document.getElementById("numPointsSlider");
const imageUploadInput = document.getElementById("imageUpload");
const loader = document.getElementById("loader");
const controls = document.getElementById("controls");
const restartBtn = document.getElementById("restart-btn");
const relaxBtn = document.getElementById("btn-relax");
const stopBtn = document.getElementById("btn-stop");

const ctx = canvas.getContext("2d");
let imgCtx;
let imageData;

let isRunning = false;
let relaxEnabled = true;

function getBrightness(imageData, width, height, x, y) {
  const ix = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const idx = (iy * width + ix) * 4;

  return (
    0.2126 * imageData[idx] +
    0.7152 * imageData[idx + 1] +
    0.0722 * imageData[idx + 2]
  );
}

function addStipplePoints() {
  const numPoints = parseInt(numPointsSlider.value);
  if (isNaN(numPoints) || numPoints <= 0) {
    numPoints = 1000;
  }
  currentPoints = [];

  for (let i = 0; i < numPoints; i++) {
    let x = Math.random() * canvas.width;
    let y = Math.random() * canvas.height;

    const brightness = getBrightness(
      imageData,
      canvas.width,
      canvas.height,
      x,
      y
    );
    const threshold = Math.random() * 255;

    if (brightness < threshold) {
      currentPoints.push([x, y]);
    } else {
      i--;
    }
  }
}

function loadImageAndStart(img) {
  console.log("original image:", img.width, img.height);

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  canvas.style.display = "block";
  controls.style.display = "flex";
  loader.style.display = "none";

  let drawWidth = img.width;
  let drawHeight = img.height;

  //resize large images
  if (img.width > 960) {
    const scale = 960 / img.width;
    drawWidth = 960;
    drawHeight = img.height * scale;
    console.log("scaling to:", drawWidth, drawHeight);
  }

  imgCanvas.width = drawWidth;
  imgCanvas.height = drawHeight;
  canvas.width = drawWidth;
  canvas.height = drawHeight;

  imgCtx = imgCanvas.getContext("2d");
  imgCtx.drawImage(img, 0, 0, drawWidth, drawHeight);

  imageData = imgCtx.getImageData(0, 0, canvas.width, canvas.height).data;

  addStipplePoints();
  getVoronoi();
  renderFrame();
  stop();
  resumeRelaxation();
  start();
}

function getColor(imageData, width, height, x, y) {
  const ix = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const idx = (iy * width + ix) * 4;

  const r = imageData[idx];
  const g = imageData[idx + 1];
  const b = imageData[idx + 2];
  // const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return { r, g, b };
}

function getVoronoi() {
  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
}

function lerp(start, end, inc) {
  // linear interpolation
  return [
    start[0] + (end[0] - start[0]) * inc,
    start[1] + (end[1] - start[1]) * inc,
  ];
}

function drawPoint(ctx, x, y, color = "black", radius = 1) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function relaxPoints(relaxFactor = 0.3) {
  // If imageData is static, cache it once elsewhere rather than re-getting here.
  imageData = imgCtx.getImageData(0, 0, canvas.width, canvas.height).data;

  // We only need the count; polygons themselves aren't required for centroid scan.
  // Safer: use currentPoints.length directly.
  const n = currentPoints.length;

  const targetPoints = new Array(n);
  for (let i = 0; i < n; i++) targetPoints[i] = [0, 0];

  const targetWeights = new Array(n).fill(0);

  let delaunayIndex = 0;

  for (let x = 0; x < canvas.width; x++) {
    for (let y = 0; y < canvas.height; y++) {
      const idx = (y * canvas.width + x) * 4;

      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];

      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const weight = 1 - brightness / 255;

      // nearest site index in currentPoints
      delaunayIndex = delaunay.find(x, y, delaunayIndex);

      targetPoints[delaunayIndex][0] += x * weight;
      targetPoints[delaunayIndex][1] += y * weight;
      targetWeights[delaunayIndex] += weight;
    }
  }

  for (let i = 0; i < n; i++) {
    if (targetWeights[i] > 0) {
      targetPoints[i][0] /= targetWeights[i];
      targetPoints[i][1] /= targetWeights[i];
    } else {
      targetPoints[i] = [...currentPoints[i]];
    }
  }

  // Move points toward targets
  for (let i = 0; i < n; i++) {
    currentPoints[i] = lerp(currentPoints[i], targetPoints[i], relaxFactor);
  }

  // Rebuild geometry for next update
  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
}

function renderFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Only needs to be refreshed when the source image changes.
  // If your image is static, you can move this outside renderFrame().
  imageData = imgCtx.getImageData(0, 0, canvas.width, canvas.height).data;

  const showColor = colorToggle.checked;
  const showPolygons = polyToggle.checked;
  const showPoints = circToggle.checked;

  const MIN_POINT_RADIUS = parseFloat(minRadiusSlider.value);
  const MAX_POINT_RADIUS = parseFloat(maxRadiusSlider.value);

  if (showPoints) {
    for (let idx = 0; idx < currentPoints.length; idx++) {
      const v = currentPoints[idx];

      const brightness = getBrightness(
        imageData,
        canvas.width,
        canvas.height,
        v[0],
        v[1]
      );
      const darkFraction = 1 - brightness / 255;

      const curved = Math.pow(darkFraction, 2.0);

      const radius =
        MIN_POINT_RADIUS + curved * (MAX_POINT_RADIUS - MIN_POINT_RADIUS);

      let color = "black";
      if (showColor) {
        const { r, g, b } = getColor(
          imageData,
          canvas.width,
          canvas.height,
          v[0],
          v[1]
        );
        color = `rgb(${r}, ${g}, ${b})`;
      }

      ctx.globalAlpha = 0.9;
      drawPoint(ctx, v[0], v[1], color, radius);
    }
  }

  if (showPolygons) {
    const cells = Array.from(voronoi.cellPolygons());
    for (let i = 0; i < cells.length; i++) {
      const poly = cells[i];
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
      ctx.closePath();

      if (showColor) {
        const v = currentPoints[i];
        const { r, g, b } = getColor(
          imageData,
          canvas.width,
          canvas.height,
          v[0],
          v[1]
        );
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }
  }
}

function loadInitial() {
  // load in image then get voronoi
  const img = new Image();
  img.src = img.src = `${import.meta.env.BASE_URL}20100528-test-001c-small.jpg`;

  img.onload = async () => {
    await customElements.whenDefined("sl-range");
    await Promise.all([
      minRadiusSlider.updateComplete,
      maxRadiusSlider.updateComplete,
      numPointsSlider.updateComplete,
    ]);

    loadImageAndStart(img);
  };
}

loadInitial();

function tick() {
  // Update phase (optional)
  if (relaxEnabled) {
    relaxPoints(0.3);
  }

  // Render phase (always, if you want)
  renderFrame();

  if (isRunning) {
    animationFrameId = requestAnimationFrame(tick);
  }
}

function start() {
  if (isRunning) return;
  isRunning = true;
  animationFrameId = requestAnimationFrame(tick);
}

function stop() {
  isRunning = false;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

function pauseRelaxation() {
  relaxEnabled = false;
}

function resumeRelaxation() {
  relaxEnabled = true;
}

function getWeightAtPoint(imageData, w, h, x, y) {
  const brightness = getBrightness(imageData, w, h, x, y); // 0..255
  return 1 - brightness / 255; // 0..1 darkness
}

function getColorStringAtPoint(imageData, w, h, x, y) {
  const { r, g, b } = getColor(imageData, w, h, x, y);
  return `rgb(${r}, ${g}, ${b})`;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

// event handlers

imageUploadInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  canvas.style.display = "none";
  controls.style.display = "none";
  loader.style.display = "inline-block";

  const reader = new FileReader();
  reader.onload = (event) => {
    const uploadedImg = new Image();
    uploadedImg.onload = () => {
      loadImageAndStart(uploadedImg);
    };
    uploadedImg.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

numPointsSlider.addEventListener("input", () => {
  addStipplePoints();
  getVoronoi();
});

restartBtn.addEventListener("click", () => {
  addStipplePoints();
  getVoronoi();
});

function syncRadiusFromMin() {
  let minR = Number(minRadiusSlider.value);
  let maxR = Number(maxRadiusSlider.value);

  if (minR > maxR) {
    maxR = minR;
    maxRadiusSlider.value = maxR;
  }
  return [minR, maxR];
}

function syncRadiusFromMax() {
  let minR = Number(minRadiusSlider.value);
  let maxR = Number(maxRadiusSlider.value);

  if (maxR < minR) {
    minR = maxR;
    minRadiusSlider.value = minR;
  }
  return [minR, maxR];
}

// Use Shoelace's event
minRadiusSlider.addEventListener("sl-input", () => {
  syncRadiusFromMin();
  renderFrame();
});

maxRadiusSlider.addEventListener("sl-input", () => {
  syncRadiusFromMax();
  renderFrame();
});

relaxBtn.addEventListener("click", () => resumeRelaxation());
stopBtn.addEventListener("click", () => pauseRelaxation());

const saveBtn = document.getElementById("btn-save-json");

saveBtn?.addEventListener("click", () => {
  if (!imgCtx || !imageData || currentPoints.length === 0) return;

  // Ensure imageData is current (important if the image can change)
  const w = canvas.width;
  const h = canvas.height;
  const data = imgCtx.getImageData(0, 0, w, h).data;

  const exported = currentPoints.map((p, i) => {
    const x = p[0];
    const y = p[1];

    const weight = getWeightAtPoint(data, w, h, x, y);
    const color = getColorStringAtPoint(data, w, h, x, y);

    return {
      index: i,
      positionX: x,
      positionY: y,
      weight,
      color,
    };
  });

  downloadJson("stipple-points.json", {
    createdAt: new Date().toISOString(),
    width: w,
    height: h,
    pointCount: exported.length,
    points: exported,
  });
});
