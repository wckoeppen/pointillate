import "./style.css";
import { Delaunay } from "d3-delaunay";

import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
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
const displayPane = document.getElementById("displayPane");
const canvas = document.getElementById("canvas");
const video = document.getElementById("video");

const seedSelect = document.getElementById("seedSelect");
const sizeSelect = document.getElementById("sizeSelect");
const relaxSelect = document.getElementById("relaxSelect");

const colorToggle = document.getElementById("colorToggle");
const polyToggle = document.getElementById("polyToggle");
const circToggle = document.getElementById("circToggle");

const radiusRange = document.getElementById("radiusRange");
const radiusSlider = document.getElementById("radiusSlider");
const numPointsSlider = document.getElementById("numPointsSlider");
const speedSlider = document.getElementById("speedSlider");

const mediaUploadBtn = document.getElementById("mediaUpload");
const loader = document.getElementById("loader");
const controls = document.getElementById("controls");

const videoEl = document.getElementById("video");
const videoControls = document.getElementById("videoControls");
const playBtn = document.getElementById("btn-video-play");
const pauseBtn = document.getElementById("btn-video-pause");
const loopToggle = document.getElementById("videoLoopToggle");

const backgroundColorBtn = document.getElementById("backgroundColorBtn");
const pointColorBtn = document.getElementById("pointColorBtn");
const lineColorBtn = document.getElementById("lineColorBtn");

const relaxBtn = document.getElementById("relaxBtn");

// State
let currentPoints = [];
let delaunay;
let voronoi;
let animationFrameId = null;
let imgCanvas = document.createElement("canvas"); // this is for the image data
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const imgCtx = imgCanvas.getContext("2d", { willReadFrequently: true });
let imageData;
let sourceMode = "image"; // "image" | "video"

let numPoints = numPointsSlider?.value || 1000;
let minRadius = radiusRange?.minValue || 1;
let maxRadius = radiusRange?.maxValue || 4;
let uniformRadius = radiusSlider?.value || 1;
let speed = speedSlider.value || 0.5;

let seedPreference = "dark"; // "dark" | "light" | "none"
let sizePreference = "dark"; // "dark" | "light" | "none"
let relaxPreference = "dark"; // "dark" | "light"

// let seedToDarkPixels = true;
let relaxEnabled = false;
let isRunning = false;
let backgroundColor = backgroundColorBtn?.value || "#fff";
let pointColor = pointColorBtn?.value || "#000";
let lineColor = lineColorBtn?.value || "#000";

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

function showVideoControls(show) {
  videoControls.style.display = show ? "" : "none";
}

function syncVideoUI() {
  const isPaused = videoEl.paused;

  // Optional: visually “accent” whichever state is active
  if (playBtn) playBtn.appearance = isPaused ? "filled" : "accent";
  if (pauseBtn) pauseBtn.appearance = isPaused ? "accent" : "filled";

  if (loopToggle) loopToggle.checked = !!videoEl.loop;
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
  setCanvasAspectRatio(video.videoWidth, video.videoHeight);

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

// Do we target darks, lights, or give everything equal weight?
const toneResponse = {
  dark: (b) => 1 - b / 255,
  light: (b) => b / 255,
  none: () => 1,
};

function seedPoints() {
  const acceptanceFn = toneResponse[seedPreference];
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
  const weightFunction = toneResponse[relaxPreference];
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

      let w = weightFunction(brightness);

      // nearest site index in currentPoints
      delaunayIndex = delaunay.find(x, y, delaunayIndex);

      targetPoints[delaunayIndex][0] += x * w;
      targetPoints[delaunayIndex][1] += y * w;
      targetWeights[delaunayIndex] += w;
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

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const showColor = colorToggle?.checked ?? false;
  const showPolygons = polyToggle?.checked ?? false;
  const showPoints = circToggle?.checked ?? true;
  const w = canvas.width;
  const h = canvas.height;

  if (showPoints) {
    // ctx.globalAlpha = 0.9;
    const useUniform = sizePreference === "none";
    const sizeFn = toneResponse[sizePreference];
    let radiusSpan = maxRadius - minRadius;

    for (let idx = 0; idx < currentPoints.length; idx++) {
      const [x, y] = currentPoints[idx];

      const radius = useUniform
        ? uniformRadius
        : (() => {
            const brightness = getBrightness(imageData, w, h, x, y);
            const t = sizeFn(brightness);
            const curved = t * t;
            return minRadius + curved * radiusSpan;
          })();

      let color = pointColor;
      if (showColor) {
        const { r, g, b } = getColor(imageData, w, h, x, y);
        color = `rgb(${r}, ${g}, ${b})`;
      }

      drawPoint(ctx, x, y, color, radius);
    }
  }

  if (showPolygons && voronoi) {
    const cells = Array.from(voronoi.cellPolygons());
    for (let i = 0; i < cells.length; i++) {
      const poly = cells[i];
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
      ctx.closePath();

      if (showColor) {
        const [x, y] = currentPoints[i];
        const { r, g, b } = getColor(
          imageData,
          canvas.width,
          canvas.height,
          x,
          y
        );
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
      } else {
        ctx.strokeStyle = lineColor;
        ctx.stroke();
      }
    }
  }
}

//  UI sync

function setCanvasAspectRatio(w, h) {
  if (!w || !h) return;
  canvasStage.style.setProperty("--canvas-ar", `${w} / ${h}`);
}

function setSeedPreference(next) {
  seedPreference = next;

  seedPoints();
  getVoronoi();
  renderFrame();
}

// Always keep radiusRange.maxValue and radiusSlider.value in sync
function syncRadiusValuesUI() {
  if (sizePreference === "none") {
    uniformRadius = radiusSlider.value;

    maxRadius = uniformRadius;
    radiusRange.maxValue = maxRadius;
    return;
  }

  minRadius = radiusRange.minValue;
  maxRadius = radiusRange.maxValue;

  uniformRadius = maxRadius;
  radiusSlider.value = uniformRadius;
}

function syncRadiusUI() {
  if (sizePreference === "none") {
    radiusSlider.value = maxRadius;
    uniformRadius = maxRadius;

    radiusRange.style.display = "none";
    radiusSlider.style.display = "";
    return;
  }

  if (minRadius > maxRadius) {
    minRadius = maxRadius;
  }

  radiusRange.minValue = minRadius;
  radiusRange.maxValue = maxRadius;

  radiusSlider.style.display = "none";
  radiusRange.style.display = "";
}



function setSizePreference(next) {
  if (next === sizePreference) return;
  sizePreference = next;

  syncRadiusUI();
  getVoronoi();
  renderFrame();
}

function setRelaxPreference(next) {
  if (next === relaxPreference) return;
  relaxPreference = next;

  getVoronoi();
  renderFrame();
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
  setCanvasAspectRatio(img.width, img.height);

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Show UI (clear inline overrides so CSS governs layout)
  let drawWidth = img.width;
  let drawHeight = img.height;

  // resize large images?
  if (img.width > 960) {
    const scale = 960 / img.width;
    drawWidth = 960;
    drawHeight = img.height * scale;
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
  startLoop();
}

// Handlers

function handleImageUpload(file) {
  showVideoControls(false);
  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    revokeCurrentMediaUrl();

    loadImageAndStart(img);
  };

  img.onerror = () => {
    revokeCurrentMediaUrl();
    alert("Failed to load image.");
  };

  img.src = url;
}

function handleVideoUpload(file) {
  revokeCurrentMediaUrl();
  const url = URL.createObjectURL(file);
  currentMediaUrl = url;

  const video = document.getElementById("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  showVideoControls(true);
  videoEl.loop = true; // or default from UI
  syncVideoUI();

  video.onloadedmetadata = () => {
    loadVideoAndStart(video);
  };

  video.onerror = () => {
    revokeCurrentMediaUrl();
    alert("Failed to load video.");
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
  URL.revokeObjectURL(url);
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
      radiusRange?.updateComplete,
      numPointsSlider?.updateComplete,
      speedSlider?.updateComplete,
    ]);

    wireSaveButton();

    loadImageAndStart(img);
    app.classList.remove("loading");
    app.classList.add("ready");
  };
}

loadInitial();

//  Listeners

relaxBtn?.addEventListener("click", () => {
  relaxEnabled = !relaxEnabled;
  startLoop();
});

mediaUploadBtn?.addEventListener("change", (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;

  if (file.type.startsWith("image/")) {
    handleImageUpload(file);
  } else if (file.type.startsWith("video/")) {
    handleVideoUpload(file);
  } else {
    alert("Unsupported file type.");
  }
});

numPointsSlider?.addEventListener("input", () => {
  numPoints = numPointsSlider.value;
  seedPoints();
  getVoronoi();
  renderFrame();
});

speedSlider?.addEventListener("input", () => {
  speed = speedSlider.value;
  getVoronoi();
  renderFrame();
});

radiusRange?.addEventListener("input", () => {
  syncRadiusValuesUI();
  renderFrame();
});

radiusSlider?.addEventListener("input", () => {
  syncRadiusValuesUI();
  renderFrame();
});

relaxSelect.addEventListener("change", (event) => {
  switch (event.target.value) {
    case "relaxDark":
      setRelaxPreference("dark");
      break;
    case "relaxLight":
      setRelaxPreference("light");
      break;
  }
});

sizeSelect.addEventListener("change", (event) => {
  switch (event.target.value) {
    case "sizeDark":
      setSizePreference("dark");
      break;
    case "sizeLight":
      setSizePreference("light");
      break;
    case "sizeNone":
      setSizePreference("none");
      break;
  }
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

seedSelect.addEventListener("change", (event) => {
  switch (event.target.value) {
    case "seedDark":
      setSeedPreference("dark");
      break;
    case "seedLight":
      setSeedPreference("light");
      break;
    case "seedRandom":
      setSeedPreference("none");
      break;
  }
});

// Video listeners
playBtn?.addEventListener("click", async () => {
  try {
    await videoEl.play();
  } catch (err) {
    // Autoplay policy or decode error
    console.warn("Video play failed:", err);
  }
  startLoop();
  syncVideoUI();
});

pauseBtn?.addEventListener("click", () => {
  videoEl.pause();
  if (!relaxEnabled) stopLoop();
  syncVideoUI();
});

loopToggle?.addEventListener("change", () => {
  videoEl.loop = loopToggle.checked;
  syncVideoUI();
});

// Keep UI synced if playback state changes externally
videoEl?.addEventListener("play", syncVideoUI);
videoEl?.addEventListener("pause", syncVideoUI);
videoEl?.addEventListener("ended", syncVideoUI);
