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
const minRadiusSlider = document.getElementById("minRadius");
const maxRadiusSlider = document.getElementById("maxRadius");
const numPointsSlider = document.getElementById("numPointsSlider");
const imageUploadInput = document.getElementById("imageUpload");
const loader = document.getElementById("loader");
const controls = document.getElementById("controls");
const restartBtn = document.getElementById("restart-btn");

const ctx = canvas.getContext("2d");
let imgCtx;
let imageData;

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
  console.log("original image size", img.width, img.height);

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  canvas.style.display = "block";
  controls.style.display = "flex";
  loader.style.display = "none";

  // resize large images
  let drawWidth = img.width;
  let drawHeight = img.height;
  if (img.width > 800) {
    console.log("resizing");
    const scale = 800 / img.width;
    drawWidth = 800;
    drawHeight = img.height * scale;
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
  draw();
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


function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  imageData = imgCtx.getImageData(0, 0, canvas.width, canvas.height).data;

  const useColor = colorToggle.checked;
  const drawPoly = polyToggle.checked;
  const MIN_POINT_RADIUS = parseFloat(minRadiusSlider.value);
  const MAX_POINT_RADIUS = parseFloat(maxRadiusSlider.value);

  // draw points or polygons right away
  if (!drawPoly) {
    for (let idx = 0; idx < currentPoints.length; idx++) {
      const v = currentPoints[idx];

      const brightness = getBrightness(
        imageData,
        canvas.width,
        canvas.height,
        v[0],
        v[1]
      );

      const brightFraction = brightness / 255;
      const darkFraction = 1 - brightFraction;
      const radius =
        MIN_POINT_RADIUS + darkFraction * (MAX_POINT_RADIUS - MIN_POINT_RADIUS);

      let color;
      if (useColor) {
        const { r, g, b } = getColor(
          imageData,
          canvas.width,
          canvas.height,
          v[0],
          v[1]
        );
        color = `rgb(${r}, ${g}, ${b})`;
      } else {
        color = "black";
      }

      ctx.globalAlpha = 0.9;

      drawPoint(ctx, v[0], v[1], color, radius);
    }
  }

  let polygons = voronoi.cellPolygons();
  let cells = Array.from(polygons);

  if (drawPoly) {
    // draw voronoi diagram (polygons) around points
    for (let i = 0; i < cells.length; i++) {
      const poly = cells[i];
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i][0], poly[i][1]);
      }
      ctx.closePath();

      if (useColor) {
        const v = currentPoints[i];
        const { r, g, b } = getColor(
          imageData,
          canvas.width,
          canvas.height,
          v[0],
          v[1]
        );

        const color = `rgb(${r}, ${g}, ${b})`;
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }
  }

  // Time to relax via Lloyds algorithm
  let targetPoints = new Array(cells.length);
  for (let i = 0; i < targetPoints.length; i++) {
    targetPoints[i] = [0, 0];
  }

  let targetWeights = new Array(cells.length).fill(0);
  let delaunayIndex = 0;
  for (let i = 0; i < canvas.width; i++) {
    for (let j = 0; j < canvas.height; j++) {
      const index = (j * canvas.width + i) * 4;
      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];
      const val = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let weight = 1 - val / 255;
      delaunayIndex = delaunay.find(i, j, delaunayIndex);

      targetPoints[delaunayIndex][0] += i * weight;
      targetPoints[delaunayIndex][1] += j * weight;
      targetWeights[delaunayIndex] += weight;
    }
  }

  for (let i = 0; i < targetPoints.length; i++) {
    if (targetWeights[i] > 0) {
      targetPoints[i][0] /= targetWeights[i];
      targetPoints[i][1] /= targetWeights[i];
    } else {
      targetPoints[i] = [...currentPoints[i]];
    }
  }

  for (let idx = 0; idx < currentPoints.length; idx++) {
    currentPoints[idx] = lerp(currentPoints[idx], targetPoints[idx], 0.3);
  }

  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
  animationFrameId = requestAnimationFrame(draw);
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
