import "./style.css";
import { Delaunay } from "d3-delaunay";

import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome/dist/components/color-picker/color-picker.js";
import "@awesome.me/webawesome/dist/components/slider/slider.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/switch/switch.js";

// Property Utlities

function setProp(el, prop, value) {
  if (!el) return;
  if (el[prop] === value) return;
  el[prop] = value;
}

function setStyle(el, prop, value) {
  if (!el) return;
  if (el.style[prop] === value) return;
  el.style[prop] = value;
}

// DOM refs
const app = document.getElementById("app");

const colorToggle = document.getElementById("colorToggle");
const polyToggle = document.getElementById("polyToggle");
const circToggle = document.getElementById("circToggle");

const radiusSlider = document.getElementById("radiusSlider");
const numPointsSlider = document.getElementById("numPointsSlider");
const speedSlider = document.getElementById("speedSlider");

const mediaUploadBtn = document.getElementById("mediaUpload");
const loader = document.getElementById("loader");
const controls = document.getElementById("controls");

const seedToDarkBtn = document.getElementById("btn-seedToDark");
const seedToLightBtn = document.getElementById("btn-seedToLight");
const seedToNoneBtn = document.getElementById("btn-seedToNone");

const relaxToDarkBtn = document.getElementById("btn-relaxToDark");
const relaxToLightBtn = document.getElementById("btn-relaxToLight");

const backgroundColorBtn = document.getElementById("backgroundColorBtn");
const pointColorBtn = document.getElementById("pointColorBtn");
const lineColorBtn = document.getElementById("lineColorBtn");

const runBtn = document.getElementById("btn-run");
const resetBtn = document.getElementById("reset-btn");

// State

let currentPoints = [];
let delaunay;
let voronoi;
let animationFrameId = null;

let imgCanvas = document.createElement("canvas");
const canvas = document.getElementById("canvas");

const ctx = canvas.getContext("2d", { willReadFrequently: true });
const imgCtx = imgCanvas.getContext("2d", { willReadFrequently: true });
let imageData;

let sourceMode = "image"; // "image" | "video"
let sourceCanvas = null;
let sourceCtx = null;
let sourcePixels = null; // Uint8ClampedArray (RGBA)
let sourceW = 0;
let sourceH = 0;

// Media source (image/video) state
let activeVideo = null;
let currentMediaUrl = null;
let lastVideoSample = 0;
const VIDEO_SAMPLE_HZ = 15;
const VIDEO_SAMPLE_INTERVAL = 1000 / VIDEO_SAMPLE_HZ;

function revokeCurrentMediaUrl() {
  if (currentMediaUrl) {
    URL.revokeObjectURL(currentMediaUrl);
    currentMediaUrl = null;
  }
}

function resetUI() {
  // Fallback UI reset used on load failures
  // Clear inline display overrides so CSS can control layout again
  setLoadingUI();
}

function computeWorkingSize(mediaW, mediaH, maxW = 960) {
  if (mediaW <= maxW) return { w: mediaW, h: mediaH };
  const scale = maxW / mediaW;
  return { w: Math.round(mediaW * scale), h: Math.round(mediaH * scale) };
}

function refreshSourcePixels(now, force = false) {
  if (sourceMode !== "video" || !activeVideo) return;

  if (!force && now != null && now - lastVideoSample < VIDEO_SAMPLE_INTERVAL)
    return;

  // Draw current video frame into the same buffer canvas used for images
  imgCtx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
  imageData = imgCtx.getImageData(0, 0, canvas.width, canvas.height).data;

  lastVideoSample = now != null ? now : performance.now();
}

function loadVideoAndStart(video) {
  stopLoop();

  sourceMode = "video";
  activeVideo = video;
  lastVideoSample = 0;

  // Show UI (clear inline overrides so CSS governs layout)
  setLoadingUI();

  const { w, h } = computeWorkingSize(video.videoWidth, video.videoHeight, 960);

  imgCanvas.width = w;
  imgCanvas.height = h;
  canvas.width = w;
  canvas.height = h;

  // Prime pixels from the first frame
  imgCtx.drawImage(video, 0, 0, w, h);
  imageData = imgCtx.getImageData(0, 0, w, h).data;

  seedPoints();
  getVoronoi();
  renderFrame();
  setReadyUI();
  startLoop();
}

let numPoints = 1000;
let speed = 0.3;
let seedPreference = "dark"; // "dark" | "light" | "none"

// let seedToDarkPixels = true;
let relaxToDarkPixels = true;
let relaxEnabled = false;
let isRunning = false;
let backgroundColor = "#fff";
let pointColor = "#000";
let lineColor = "#000";

function ensureSourceCanvas(w, h) {
  if (!sourceCanvas) {
    sourceCanvas = document.createElement("canvas");
    sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (sourceCanvas.width !== w) sourceCanvas.width = w;
  if (sourceCanvas.height !== h) sourceCanvas.height = h;
  sourceW = w;
  sourceH = h;
}

// Image sampling helpers

function getBrightness(imageDataArr, width, height, x, y) {
  const ix = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const idx = (iy * width + ix) * 4;

  return (
    0.2126 * imageDataArr[idx] +
    0.7152 * imageDataArr[idx + 1] +
    0.0722 * imageDataArr[idx + 2]
  );
}

function getColor(imageDataArr, width, height, x, y) {
  const ix = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const idx = (iy * width + ix) * 4;

  const r = imageDataArr[idx];
  const g = imageDataArr[idx + 1];
  const b = imageDataArr[idx + 2];

  return { r, g, b };
}

function getWeightAtPoint(imageDataArr, w, h, x, y) {
  const brightness = getBrightness(imageDataArr, w, h, x, y); // 0..255
  return 1 - brightness / 255; // 0..1 darkness
}

function getColorStringAtPoint(imageDataArr, w, h, x, y) {
  const { r, g, b } = getColor(imageDataArr, w, h, x, y);
  return `rgb(${r}, ${g}, ${b})`;
}

// Stippling / Voronoi

const acceptanceProbability = {
  dark: (b) => 1 - b / 255,
  light: (b) => b / 255,
  none: () => 1,
};

function seedPoints() {
  const acceptanceFn = acceptanceProbability[seedPreference];
  currentPoints = [];

  while (currentPoints.length < numPoints) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;

    if (seedPreference === "none") {
      currentPoints.push([x, y]);
      continue;
    }

    const brightness = getBrightness(
      imageData,
      canvas.width,
      canvas.height,
      x,
      y
    );

    const p = acceptanceFn(brightness);
    if (Math.random() < p) {
      currentPoints.push([x, y]);
    }
  }
}

function getVoronoi() {
  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
}

function lerp(start, end, inc) {
  return [
    start[0] + (end[0] - start[0]) * inc,
    start[1] + (end[1] - start[1]) * inc,
  ];
}

function drawPoint(drawCtx, x, y, color = "black", radius = 1) {
  drawCtx.fillStyle = color;
  drawCtx.beginPath();
  drawCtx.arc(x, y, radius, 0, Math.PI * 2);
  drawCtx.fill();
}

function relaxPoints() {
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

      let weight;
      if (relaxToDarkPixels) {
        weight = 1 - brightness / 255;
      } else {
        weight = brightness / 255;
      }

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

  for (let i = 0; i < n; i++) {
    currentPoints[i] = lerp(currentPoints[i], targetPoints[i], speed);
  }

  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
}

// Render

function renderFrame() {
  if (!imgCtx || !imageData) return;

  // ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const showColor = colorToggle?.checked ?? false;
  const showPolygons = polyToggle?.checked ?? false;
  const showPoints = circToggle?.checked ?? true;

  const MIN_POINT_RADIUS = parseFloat(radiusSlider?.minValue ?? "0");
  const MAX_POINT_RADIUS = parseFloat(radiusSlider?.maxValue ?? "1");

  if (showPolygons && voronoi) {
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
        ctx.strokeStyle = lineColor;
        ctx.stroke();
      }
    }
  }

  if (showPoints) {
    // ctx.globalAlpha = 0.9;

    for (let idx = 0; idx < currentPoints.length; idx++) {
      const v = currentPoints[idx];

      const brightness = getBrightness(
        imageData,
        canvas.width,
        canvas.height,
        v[0],
        v[1]
      );

      let weight;
      if (relaxToDarkPixels) {
        weight = 1 - brightness / 255;
      } else {
        weight = brightness / 255;
      }

      const curved = Math.pow(weight, 2.0);

      const radius =
        MIN_POINT_RADIUS + curved * (MAX_POINT_RADIUS - MIN_POINT_RADIUS);

      let color = pointColor;
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

      drawPoint(ctx, v[0], v[1], color, radius);
    }
  }
}

//  UI sync

function syncRelaxButtonUI() {
  const nextVariant = relaxEnabled ? "accent" : "filled";
  setProp(runBtn, "appearance", nextVariant);
}

function syncSeedButtonsUI() {
  const isDark = seedPreference === "dark";
  const isLight = seedPreference === "light";
  const isNone = seedPreference === "none";

  if (seedToDarkBtn) seedToDarkBtn.appearance = isDark ? "accent" : "filled";
  if (seedToLightBtn) seedToLightBtn.appearance = isLight ? "accent" : "filled";
  if (seedToNoneBtn) seedToNoneBtn.appearance = isNone ? "accent" : "filled";

  // If your component supports pressed state, keep it consistent too
  if (seedToDarkBtn && "pressed" in seedToDarkBtn)
    seedToDarkBtn.pressed = isDark;
  if (seedToLightBtn && "pressed" in seedToLightBtn)
    seedToLightBtn.pressed = isLight;
  if (seedToNoneBtn && "pressed" in seedToNoneBtn)
    seedToNoneBtn.pressed = isNone;
}

function setSeedPreference(next) {
  if (next === seedPreference) return; // already selected
  seedPreference = next;

  syncSeedButtonsUI();

  seedPoints(); // uses seedPreference internally
  getVoronoi();
  renderFrame();
}

function toggleRelaxToBtn(mode) {
  const next = mode === "dark";
  if (next === relaxToDarkPixels) return; // already selected

  relaxToDarkPixels = next;

  relaxToDarkBtn.appearance = relaxToDarkPixels ? "accent" : "filled";
  relaxToLightBtn.appearance = relaxToDarkPixels ? "filled" : "accent";

  seedPoints();
  getVoronoi();
  renderFrame();
}

function setLoadingUI() {
  app.classList.remove("ready");
  app.classList.add("loading");
}

function setReadyUI() {
  app.classList.remove("loading");
  app.classList.add("ready");
}

//  Lifecycle

function startLoop() {
  if (animationFrameId != null) return;
  isRunning = true;
  animationFrameId = requestAnimationFrame(tick);
}

function stopLoop() {
  isRunning = false;
  if (animationFrameId != null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function tick(now) {
  refreshSourcePixels(now);

  if (relaxEnabled) relaxPoints();
  renderFrame();

  if (isRunning) animationFrameId = requestAnimationFrame(tick);
}

//  Image loading / initialization

function loadImageAndStart(img) {
  stopLoop();

  sourceMode = "image";
  activeVideo = null;
  lastVideoSample = 0;
  console.log("original image:", img.width, img.height);

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Show UI (clear inline overrides so CSS governs layout)
  setLoadingUI();

  let drawWidth = img.width;
  let drawHeight = img.height;

  // resize large images?
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

  imgCtx.drawImage(img, 0, 0, drawWidth, drawHeight);

  imageData = imgCtx.getImageData(0, 0, canvas.width, canvas.height).data;
  seedPoints();
  getVoronoi();
  renderFrame();
  setReadyUI();
  startLoop();
}

// Handlers

function handleImageUpload(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    revokeCurrentMediaUrl();

    loadImageAndStart(img);
  };

  img.onerror = () => {
    revokeCurrentMediaUrl();
    alert("Failed to load image.");
    resetUI();
  };

  img.src = url;
}

function handleVideoUpload(file) {
  revokeCurrentMediaUrl();
  const url = URL.createObjectURL(file);
  currentMediaUrl = url;

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  video.addEventListener("loadedmetadata", () => {
    loadVideoAndStart(video);

    video.play();
  });

  video.onerror = () => {
    revokeCurrentMediaUrl();
    alert("Failed to load video.");
    resetUI();
  };
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

  revokeCurrentMediaUrl();
}

function wireSaveButton() {
  const saveBtn = document.getElementById("btn-save-json");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", () => {
    if (!imgCtx || !imageData || currentPoints.length === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    const data = imgCtx.getImageData(0, 0, w, h).data;

    const exported = currentPoints.map((p, i) => {
      const x = p[0];
      const y = p[1];

      const weight = getWeightAtPoint(data, w, h, x, y);
      const color = getColorStringAtPoint(data, w, h, x, y);

      return {
        i: i,
        x: x,
        y: y,
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
}

function loadInitial() {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}test-photo-small.jpg`;

  img.onload = async () => {
    await Promise.all([
      radiusSlider?.updateComplete,
      numPointsSlider?.updateComplete,
      speedSlider?.updateComplete,
    ]);

    syncRelaxButtonUI();
    wireSaveButton();

    loadImageAndStart(img);
  };
}

loadInitial();

//  Listeners

runBtn?.addEventListener("click", () => {
  relaxEnabled = !relaxEnabled;
  syncRelaxButtonUI();
  startLoop();
});

mediaUploadBtn?.addEventListener("change", (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;

  setLoadingUI();

  if (file.type.startsWith("image/")) {
    handleImageUpload(file);
  } else if (file.type.startsWith("video/")) {
    handleVideoUpload(file);
  } else {
    alert("Unsupported file type.");
    resetUI();
  }
});

numPointsSlider?.addEventListener("input", () => {
  numPoints = numPointsSlider.value;
  seedPoints();
  getVoronoi();
});

speedSlider?.addEventListener("input", () => {
  speed = parseFloat(speedSlider.value);
  getVoronoi();
});

resetBtn?.addEventListener("click", () => {
  seedPoints();
  getVoronoi();
});

radiusSlider?.addEventListener("input", () => {
  renderFrame();
});

// Seed button buttons
seedToDarkBtn?.addEventListener("click", () => setSeedPreference("dark"));
seedToLightBtn?.addEventListener("click", () => setSeedPreference("light"));
seedToNoneBtn?.addEventListener("click", () => setSeedPreference("none"));

// Relax button listeners
relaxToDarkBtn?.addEventListener("click", () => {
  toggleRelaxToBtn("dark");
});
relaxToLightBtn?.addEventListener("click", () => {
  toggleRelaxToBtn("light");
});

// Color button listeners
backgroundColorBtn.addEventListener("input", () => {
  backgroundColor = backgroundColorBtn.value;
  renderFrame();
});
pointColorBtn.addEventListener("input", () => {
  pointColor = pointColorBtn.value;
  renderFrame();
});
lineColorBtn.addEventListener("input", () => {
  lineColor = lineColorBtn.value;
  renderFrame();
});
