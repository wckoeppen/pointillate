import { Delaunay } from "d3-delaunay";

import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/color-picker/color-picker.js";
import "@awesome.me/webawesome/dist/components/slider/slider.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";

// Defaults and overrides
const defaults = {
  selectedFile: "example.jpg",
  type: "image",

  backgroundColor: "#fff",
  pointColor: "#000",
  cellColor: "#000",

  numPoints: 1000,
  seedPreference: "dark", // "dark" | "light" | "none"
  relaxPreference: "dark", // "dark" | "light"
  sizePreference: "dark", // "dark" | "light" | "none"

  minRadius: 1,
  maxRadius: 4,
  uniformRadius: 4,
  relaxEnabled: true,
  relaxSpeed: 0.1,

  seedsOn: true,
  colorsOn: false,
  cellsOn: false,
  fillsOn: false,
};

const presetOverrides = [
  {
    name: "Suit up",
    src: "examples/suitup.jpg",
    type: "image",
    settings: {
      numPoints: 2000,
      seedPreference: "none",
      maxRadius: 10,
    },
  },
  {
    name: "AR-15",
    src: "examples/ar15.jpg",
    type: "image",
    settings: {
      numPoints: 1000,
      sizePreference: "none",
      uniformRadius: 3,
      backgroundColor: "#aa0000",
      pointColor: "#ffffff",
      cellColor: "#bb3333",
      seedsOn: true,
      cellsOn: true,
    },
  },
  {
    name: "Gulf Coast",
    src: "examples/skimboard.mov",
    type: "video",
    settings: {
      numPoints: 5000,
      seedPreference: "none",
      relaxPreference: "light",
      sizePreference: "light",
      minRadius: 2,
      maxRadius: 8,
      uniformRadius: 8,
      backgroundColor: "#000000",
      pointColor: "#ffffff",
      cellColor: "#000000",
      relaxSpeed: 1,
      seedsOn: true,
      colorsOn: true,
    },
  },
  {
    name: "Burlesque",
    src: "examples/burlesque.mov",
    type: "video",
    settings: {
      numPoints: 1000,
      seedPreference: "light",
      relaxPreference: "light",
      sizePreference: "light",
      minRadius: 2,
      maxRadius: 20,
      uniformRadius: 20,
      backgroundColor: "#000000",
      pointColor: "#ffffff",
      relaxSpeed: 1,
      seedsOn: true,
      colorsOn: true,
    },
  },
  {
    name: "Folklorica",
    src: "examples/folklorica.jpg",
    type: "image",
    settings: {
      numPoints: 15000,
      seedPreference: "none",
      relaxPreference: "dark",
      sizePreference: "dark",
      minRadius: 1,
      maxRadius: 7,
      uniformRadius: 7,
      backgroundColor: "#ffffff",
      pointColor: "#000000",
      relaxSpeed: 0.3,
      seedsOn: true,
      colorsOn: true,
    },
  },
];

// DOM refs
const app = document.getElementById("app");
const controlPane = document.getElementById("controlPane");
const canvasStage = document.getElementById("canvasStage");
const canvas = document.getElementById("canvas");
const controlCarousel = document.getElementById("controlCarousel");
const cardToStart = document.getElementById("cardToStart");

const mediaUploadDialog = document.getElementById("mediaUploadDialog");
const uploadButton = document.getElementById("uploadButton");
const resetButton = document.getElementById("resetButton");
const optionsButton = document.getElementById("optionsButton");

const seedToggle = document.getElementById("seedToggle");
const cellToggle = document.getElementById("cellToggle");
const colorToggle = document.getElementById("colorToggle");
const fillToggle = document.getElementById("fillToggle");

const seedSelect = document.getElementById("seedSelect");
const sizeSelect = document.getElementById("sizeSelect");
const relaxSelect = document.getElementById("relaxSelect");

const radiusRange = document.getElementById("radiusRange");
const radiusSlider = document.getElementById("radiusSlider");
const numPointsSlider = document.getElementById("numPointsSlider");
const speedSlider = document.getElementById("speedSlider");

const backgroundColorBtn = document.getElementById("backgroundColorBtn");
const pointColorBtn = document.getElementById("pointColorBtn");
const cellColorBtn = document.getElementById("cellColorBtn");

const runButton = document.getElementById("runButton");
const runIcon = document.getElementById("runIcon");

const videoEl = document.getElementById("video");

const saveDropdown = document.getElementById("saveDropdown");
const infoButton = document.getElementById("infoButton");
const infoOverlay = document.getElementById("infoOverlay");
const closeInfo = document.getElementById("closeInfo");

// State Variables
let currentPoints = [];
let delaunay, voronoi;
let animationFrameId = null;
let isRunning = false;

let referenceCanvas = document.createElement("canvas");
const referenceContext = referenceCanvas.getContext("2d", {
  willReadFrequently: true,
});

let referenceData;
let brightnessMap = null;
const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
let imageHasAlpha = false;

let sourceMode = "image"; // "image" | "video"
let mediaWidth = 0;
let mediaHeight = 0;
let selectedFile = defaults.selectedFile;

const blurPixels = 1;
const maxWidth = 1280;

// Reads
let numPoints = defaults.numPoints;
let minRadius = defaults.minRadius;
let maxRadius = defaults.maxRadius;
let uniformRadius = defaults.uniformRadius;
let relaxSpeed = defaults.relaxSpeed;
let cacheSpeed = relaxSpeed;
let cacheMinRadius = minRadius;
let seedPreference = defaults.seedPreference;
let sizePreference = defaults.sizePreference;
let relaxPreference = defaults.relaxPreference;
let relaxEnabled = defaults.relaxEnabled;
let backgroundColor = defaults.backgroundColor;
let pointColor = defaults.pointColor;
let cellColor = defaults.cellColor;
let seedsOn = defaults.seedsOn;
let colorsOn = defaults.colorsOn;
let cellsOn = defaults.cellsOn;
let fillsOn = defaults.fillsOn;

// --- Video state ---
let activeVideo = null;
let videoPlaying = false;
let currentMediaUrl = null;
let lastVideoSample = 0;
const videoSampleHz = 24;
const videoSampleInterval = 1000 / videoSampleHz;

function chooseRandomPreset(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function computeWorkingSize(mediaW, mediaH, maxW = 960) {
  if (mediaW <= maxW) return { w: mediaW, h: mediaH };
  const scale = maxW / mediaW;
  return { w: Math.round(mediaW * scale), h: Math.round(mediaH * scale) };
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const v =
    h.length === 3
      ? parseInt(
          h
            .split("")
            .map((c) => c + c)
            .join(""),
          16,
        )
      : parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function getRelaxCompositeBgHex() {
  // light => composite onto black, dark => composite onto white
  return relaxPreference === "light" ? "#000000" : "#ffffff";
}

function detectAnyAlpha(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

function buildBrightnessMapComposited(data, w, h, bgHex) {
  const { r: bgR, g: bgG, b: bgB } = hexToRgb(bgHex);
  const out = new Float32Array(w * h);

  let di = 0;
  for (let i = 0; i < out.length; i++, di += 4) {
    const r = data[di];
    const g = data[di + 1];
    const b = data[di + 2];
    const a = data[di + 3] / 255;

    const cr = r * a + bgR * (1 - a);
    const cg = g * a + bgG * (1 - a);
    const cb = b * a + bgB * (1 - a);

    out[i] = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
  }
  return out;
}

function rebuildBrightnessMapIfNeeded() {
  if (sourceMode !== "image") return;
  if (!referenceData || canvas.width <= 0 || canvas.height <= 0) return;

  if (!imageHasAlpha) {
    brightnessMap = null;
    return;
  }

  const bgHex = getRelaxCompositeBgHex();
  brightnessMap = buildBrightnessMapComposited(
    referenceData,
    canvas.width,
    canvas.height,
    bgHex,
  );
}

function getBrightnessAtPoint(data, w, h, x, y) {
  const ix = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(h - 1, Math.floor(y)));

  if (sourceMode === "image" && brightnessMap) {
    return brightnessMap[iy * w + ix];
  }
  const idx = (iy * w + ix) * 4;
  return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
}

function getColor(data, width, height, x, y) {
  const ix = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const idx = (iy * width + ix) * 4;

  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];

  return { r, g, b };
}

function getWeightAtPoint(data, w, h, x, y) {
  const brightness = getBrightnessAtPoint(data, w, h, x, y); // 0..255
  return 1 - brightness / 255; // 0..1 darkness
}

function getColorStringAtPoint(data, w, h, x, y) {
  const { r, g, b } = getColor(data, w, h, x, y);
  return `rgb(${r}, ${g}, ${b})`;
}

const toneResponse = {
  dark: (b) => 1 - b / 255,
  light: (b) => b / 255,
  none: () => 1,
};

function lerp(start, end, inc) {
  return [
    start[0] + (end[0] - start[0]) * inc,
    start[1] + (end[1] - start[1]) * inc,
  ];
}

function drawPoint(drawcanvasContext, x, y, color = "black", radius = 1) {
  drawcanvasContext.fillStyle = color;
  drawcanvasContext.beginPath();
  drawcanvasContext.arc(x, y, radius, 0, Math.PI * 2);
  drawcanvasContext.fill();
}

// Media / image handling

function cleanupActiveMedia() {
  // Stop any video decode/network work immediately
  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
    videoEl.onloadedmetadata = null;
    videoEl.onerror = null;
  }

  activeVideo = null;
  videoPlaying = false;
  lastVideoSample = 0;

  if (currentMediaUrl) {
    URL.revokeObjectURL(currentMediaUrl);
    currentMediaUrl = null;
  }
}

function refreshSourcePixels(now, force = false) {
  if (sourceMode !== "video" || !activeVideo) return;
  if (canvas.width <= 0 || canvas.height <= 0) return;
  if (!force && now != null && now - lastVideoSample < videoSampleInterval)
    return;

  referenceContext.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
  referenceData = referenceContext.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;

  lastVideoSample = now != null ? now : performance.now();
}

function sampleCurrentVideoFrame() {
  if (!activeVideo) return;

  const w = referenceCanvas.width;
  const h = referenceCanvas.height;
  if (w <= 0 || h <= 0) return;

  referenceContext.drawImage(activeVideo, 0, 0, w, h);
  referenceData = referenceContext.getImageData(0, 0, w, h).data;
}

function loadImage(img) {
  sourceMode = "image";
  activeVideo = null;
  lastVideoSample = 0;

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  setMediaSize(img.naturalWidth, img.naturalHeight);
  let drawWidth = img.naturalWidth;
  let drawHeight = img.naturalHeight;

  const scale = maxWidth / img.width;
  drawWidth = maxWidth;
  drawHeight = img.height * scale;

  referenceCanvas.width = drawWidth;
  referenceCanvas.height = drawHeight;

  if (blurPixels > 0) {
    referenceContext.filter = `blur(${blurPixels}px)`;
  }
  canvas.width = drawWidth;
  canvas.height = drawHeight;

  referenceContext.drawImage(img, 0, 0, drawWidth, drawHeight);

  referenceData = referenceContext.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
  imageHasAlpha = detectAnyAlpha(referenceData);
  rebuildBrightnessMapIfNeeded();

  seedPoints();
  getVoronoi();
  renderFrame();
}

// Sample to see if frame is all zeros.
function looksBlankRGBA(data, stride = 2000) {
  if (!data || data.length < 4) return true;

  for (let i = 0; i <= data.length - 4; i += stride) {
    if (data[i] || data[i + 1] || data[i + 2] || data[i + 3]) return false;
  }
  return true;
}

// Waits for a DOM event
function waitOnce(target, type) {
  return new Promise((res) =>
    target.addEventListener(type, res, { once: true }),
  );
}

// Wait for a decoded frame
function waitDecodedFrame(video, timeoutMs = 250) {
  const tickFallback = new Promise((res) =>
    requestAnimationFrame(() => requestAnimationFrame(res)),
  );

  if (video.requestVideoFrameCallback) {
    const rvfc = new Promise((res) =>
      video.requestVideoFrameCallback(() => res()),
    );
    const timeout = new Promise((res) => setTimeout(res, timeoutMs));

    return Promise.race([rvfc, tickFallback, timeout]);
  }

  return tickFallback;
}

async function loadVideo(video) {
  stopLoop();

  brightnessMap = null;
  imageHasAlpha = false;
  enterVideoMode(video);
  setMediaSize(video.videoWidth, video.videoHeight);

  const { w, h } = computeWorkingSize(
    video.videoWidth,
    video.videoHeight,
    maxWidth,
  );
  referenceCanvas.width = w;
  referenceCanvas.height = h;

  if (blurPixels > 0) {
    referenceContext.filter = `blur(${blurPixels}px)`;
  }

  canvas.width = w;
  canvas.height = h;

  sampleCurrentVideoFrame();

  // first calls to the video reference can be blank if we're not playing.
  // if that's the case, try fast-forwarding and wait. :shrug:
  if (looksBlankRGBA(referenceData)) {
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    const target = dur > 0 ? Math.min(0.08, Math.max(0, dur - 0.01)) : 0.08;

    try {
      if (video.currentTime < 0.001) {
        video.currentTime = target;
        await waitOnce(video, "seeked");
        await waitDecodedFrame(video);
      }
      sampleCurrentVideoFrame();
    } catch (e) {
      console.warn("seek forward for non-blank frame failed:", e);
    }
  }

  seedPoints();
  getVoronoi();
  renderFrame();
}

// Engine
function seedPoints() {
  const start = performance.now();
  if (!referenceData || canvas.width <= 0 || canvas.height <= 0) return;

  const acceptanceFn = toneResponse[seedPreference];
  currentPoints = [];

  let attempts = 0;
  while (currentPoints.length < numPoints) {
    attempts++;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;

    if (seedPreference === "none") {
      currentPoints.push([x, y]);
    } else {
      const b = getBrightnessAtPoint(
        referenceData,
        canvas.width,
        canvas.height,
        x,
        y,
      );
      const p = acceptanceFn(b);
      if (p > 0 && Math.random() < p) currentPoints.push([x, y]);
    }

    if (performance.now() - start > 2000) {
      console.warn(
        `Could only place ${currentPoints.length} points after ${attempts} attempts in ${(performance.now() - start) / 1000} seconds.`,
      );
      break;
    }
  }

  // If we ran out of attempts, fill the remaining points randomly.
  while (currentPoints.length < numPoints) {
    currentPoints.push([
      Math.random() * canvas.width,
      Math.random() * canvas.height,
    ]);
  }
}

function getVoronoi() {
  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
}

function relaxPoints() {
  const weightFunction = toneResponse[relaxPreference];
  const floorWeight = 1e-16;

  const n = currentPoints.length;
  const targetPoints = new Array(n);
  for (let i = 0; i < n; i++) targetPoints[i] = [0, 0];
  const targetWeights = new Array(n).fill(0);

  const data = referenceData;
  const wCanvas = canvas.width;
  const hCanvas = canvas.height;

  let delaunayIndex = 0;

  for (let y = 0; y < hCanvas; y++) {
    for (let x = 0; x < wCanvas; x++) {
      const brightness = getBrightnessAtPoint(data, wCanvas, hCanvas, x, y);

      let w = weightFunction(brightness);
      if (w < floorWeight) w = floorWeight;

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
      targetPoints[i] = [currentPoints[i][0], currentPoints[i][1]];
    }
  }

  for (let i = 0; i < n; i++) {
    currentPoints[i] = lerp(currentPoints[i], targetPoints[i], relaxSpeed);
  }

  delaunay = Delaunay.from(currentPoints);
  voronoi = delaunay.voronoi([0, 0, wCanvas, hCanvas]);
}

// Rendering

function renderFrame() {
  if (!referenceContext || !referenceData) return;

  canvasContext.fillStyle = backgroundColor;
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);

  const w = canvas.width;
  const h = canvas.height;
  const data = referenceData;

  if (voronoi && (cellsOn || fillsOn)) {
    const cells = Array.from(voronoi.cellPolygons());

    if (cellsOn) {
      canvasContext.strokeStyle = cellColor;
    }

    for (let i = 0; i < cells.length; i++) {
      const poly = cells[i];
      if (!poly || poly.length === 0) continue;

      canvasContext.beginPath();
      canvasContext.moveTo(poly[0][0], poly[0][1]);
      for (let k = 1; k < poly.length; k++) {
        canvasContext.lineTo(poly[k][0], poly[k][1]);
      }
      canvasContext.closePath();

      if (fillsOn) {
        const [x, y] = currentPoints[i];
        const { r, g, b } = getColor(data, w, h, x, y);
        canvasContext.fillStyle = `rgb(${r}, ${g}, ${b})`;
        canvasContext.fill();
      }

      if (cellsOn) {
        canvasContext.stroke();
      }
    }
  }

  if (seedsOn) {
    const useUniform = sizePreference === "none";
    const sizeFn = toneResponse[sizePreference];
    let radiusSpan = maxRadius - minRadius;

    for (let idx = 0; idx < currentPoints.length; idx++) {
      const [x, y] = currentPoints[idx];

      let radius;
      if (useUniform) {
        radius = uniformRadius;
      } else {
        const brightness = getBrightnessAtPoint(data, w, h, x, y);
        const brightnessFraction = sizeFn(brightness);
        radius =
          minRadius + brightnessFraction * brightnessFraction * radiusSpan;
      }

      let color = pointColor;
      if (colorsOn) {
        const { r, g, b } = getColor(data, w, h, x, y);
        color = `rgb(${r}, ${g}, ${b})`;
      }

      drawPoint(canvasContext, x, y, color, radius);
    }
  }
}

// Canvas sizing helpers

function setMediaSize(w, h) {
  mediaWidth = w;
  mediaHeight = h;
  fitCanvas();
}

function fitCanvas() {
  if (!mediaWidth || !mediaHeight) return;

  const availW = canvasStage.clientWidth;
  const availH = canvasStage.clientHeight;
  const scale = Math.min(availW / mediaWidth, availH / mediaHeight);

  const cssW = Math.floor(mediaWidth * scale);
  const cssH = Math.floor(mediaHeight * scale);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

let fitScheduled = false;
function scheduleFitCanvas() {
  if (fitScheduled) return;
  fitScheduled = true;
  requestAnimationFrame(() => {
    fitScheduled = false;
    fitCanvas();
  });
}
new ResizeObserver(scheduleFitCanvas).observe(controlPane);
window.addEventListener("resize", scheduleFitCanvas);

// UI sync / controls helpers

function syncRadiusValuesUI() {
  if (sizePreference === "none") {
    uniformRadius = radiusSlider.value;
    maxRadius = uniformRadius;
    radiusRange.maxValue = maxRadius;
    return;
  }

  minRadius = radiusRange.minValue;
  maxRadius = radiusRange.maxValue;
  cacheMinRadius = minRadius;
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

function syncPlayButtonUI() {
  const isVideo = sourceMode === "video";
  const on = isVideo ? videoPlaying : relaxEnabled;

  runButton.appearance = on ? "accent" : "filled";
  runIcon.setAttribute("name", on ? "pause" : "play");
  runButton.setAttribute("aria-pressed", String(on));
  runButton.setAttribute(
    "aria-label",
    isVideo
      ? on
        ? "Pause video"
        : "Play video"
      : on
        ? "Pause relaxation"
        : "Start relaxation",
  );
}

function syncControlsButton() {
  const open = app.classList.contains("controls-open");

  optionsButton.appearance = open ? "accent" : "filled";
  optionsButton.setAttribute(
    "aria-label",
    open ? "Collapse options" : "Open options",
  );
}

function setSeedPreference(next) {
  seedPreference = next;

  seedPoints();
  getVoronoi();
  renderFrame();
}

function setSizePreference(next) {
  if (next === sizePreference) return;
  const prev = sizePreference;
  sizePreference = next;

  if (prev === "none" && next !== "none") {
    minRadius = cacheMinRadius;
    radiusRange.minValue = String(minRadius);
  }

  syncRadiusUI();
  renderFrame();
}

function setRelaxPreference(next) {
  if (next === relaxPreference) return;
  relaxPreference = next;
  renderFrame();
}

function setRelaxEnabled(next) {
  // In video mode, relaxation is forced ON
  if (sourceMode === "video") next = true;

  relaxEnabled = !!next;
  syncPlayButtonUI();
  updateLoopRunning();
}

function setVideoPlaying(next) {
  videoPlaying = !!next;

  if (activeVideo) {
    if (videoPlaying) activeVideo.play();
    else activeVideo.pause();
  }

  syncPlayButtonUI();
  updateLoopRunning();
}

function togglePrimary() {
  if (sourceMode === "video") setVideoPlaying(!videoPlaying);
  else setRelaxEnabled(!relaxEnabled);
}

function syncVideoUI() {
  // placeholder if additional video UI sync is needed
}

// Lifecycle / loop

function startLoop() {
  if (animationFrameId != null) return;
  isRunning = true;
  animationFrameId = requestAnimationFrame(animationStep);
}

function stopLoop() {
  isRunning = false;
  if (animationFrameId != null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function animationStep(now) {
  const isVideo = sourceMode === "video";
  if (isVideo) {
    if (videoPlaying) refreshSourcePixels(now);
  }
  if (relaxEnabled) relaxPoints();
  renderFrame();

  if (isRunning) animationFrameId = requestAnimationFrame(animationStep);
}

function shouldRunLoop() {
  // Video mode: run only while video is playing
  if (sourceMode === "video") return videoPlaying;

  // Image mode: run only while relaxation is enabled
  return relaxEnabled;
}

function updateLoopRunning() {
  if (shouldRunLoop()) startLoop();
  else stopLoop();
}

// Save / export

function getBasename(filename) {
  return filename.lastIndexOf(".") !== -1
    ? selectedFile.slice(0, selectedFile.lastIndexOf("."))
    : selectedFile;
}

function downloadJson(filename, metadata) {
  const blob = new Blob([JSON.stringify(metadata, null, 2)], {
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

function saveJSON() {
  if (!referenceContext || !referenceData || currentPoints.length === 0) return;

  const filename = `${getBasename(selectedFile)}-pointillated.json`;
  const w = canvas.width;
  const h = canvas.height;
  const data = referenceContext.getImageData(0, 0, w, h).data;

  const useUniform = sizePreference === "none";
  const sizeFn = toneResponse[sizePreference];
  const radiusSpan = maxRadius - minRadius;

  const exported = currentPoints.map((p, i) => {
    const x = p[0];
    const y = p[1];

    const weight = getWeightAtPoint(data, w, h, x, y);
    const color = getColorStringAtPoint(data, w, h, x, y);

    let radius;
    if (useUniform) {
      radius = uniformRadius;
    } else {
      const brightness = getBrightnessAtPoint(data, w, h, x, y);
      const brightnessFraction = sizeFn(brightness);
      radius = minRadius + brightnessFraction * brightnessFraction * radiusSpan;
    }

    return { i, x, y, weight, radius, color };
  });

  const settings = {
    startFrom: seedSelect?.value ?? seedPreference,
    gravitateTo: relaxSelect?.value ?? relaxPreference,
    sizeBy: sizeSelect?.value ?? sizePreference,
  };
  if (useUniform) {
    settings.radiusMode = "uniform";
    settings.uniformRadius = Number(radiusSlider?.value ?? uniformRadius);
  } else {
    settings.radiusMode = "range";
    settings.minRadius = Number(radiusRange?.minValue ?? minRadius);
    settings.maxRadius = Number(radiusRange?.maxValue ?? maxRadius);
  }

  const metadata = {
    created: new Date().toISOString(),
    originalFile: selectedFile,
    width: w,
    height: h,
    seedCount: exported.length,
    settings,
    seeds: exported,
  };

  downloadJson(filename, metadata);
}

function savePNG() {
  const filename = `${getBasename(selectedFile)}-pointillated.png`;

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// Controls / handlers

function enterVideoMode(video) {
  const prevMode = sourceMode;
  sourceMode = "video";
  activeVideo = video;
  lastVideoSample = 0;
  relaxEnabled = true;

  if (prevMode !== "video") cacheSpeed = relaxSpeed;
  relaxSpeed = 1;

  if (speedSlider) {
    speedSlider.value = 1;
    speedSlider.disabled = true;
  }

  videoPlaying = false;
  video.pause();

  syncPlayButtonUI();
  updateLoopRunning();
}

function enterImageMode() {
  sourceMode = "image";
  videoPlaying = false;
  activeVideo = null;
  relaxEnabled = false;

  relaxSpeed = cacheSpeed;
  if (speedSlider) {
    speedSlider.value = relaxSpeed;
    speedSlider.disabled = false;
  }

  syncPlayButtonUI();
  updateLoopRunning();
}

function resetScene() {
  if (sourceMode === "video") {
    videoPlaying = false;
    activeVideo?.pause?.();
    stopLoop();

    sampleCurrentVideoFrame();

    seedPoints();
    getVoronoi();
    renderFrame();

    syncPlayButtonUI();
    updateLoopRunning();
    return;
  }

  // Image mode behavior
  setRelaxEnabled(false);
  seedPoints();
  getVoronoi();
  renderFrame();
}

function scrollToCardInCarousel(card) {
  if (!controlCarousel || !card) return;

  const rootStyles = getComputedStyle(document.documentElement);
  const cardGap = parseFloat(rootStyles.getPropertyValue("--card-gap")) || 0;

  const carouselRect = controlCarousel.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  const targetScrollLeft =
    controlCarousel.scrollLeft + (cardRect.left - carouselRect.left) - cardGap;

  controlCarousel.scrollTo({
    left: targetScrollLeft,
    behavior: "instant",
  });
}

// Event listeners

runButton?.addEventListener("click", togglePrimary);
canvasStage?.addEventListener("click", togglePrimary);

// Overlay
function openInfo() {
  infoOverlay.hidden = false;
}

function closeInfoOverlay() {
  infoOverlay.hidden = true;
}

infoButton.addEventListener("click", openInfo);
closeInfo.addEventListener("click", closeInfoOverlay);

infoOverlay.addEventListener("click", (e) => {
  if (e.target === infoOverlay) closeInfoOverlay();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !infoOverlay.hidden) closeInfoOverlay();
});

// If focus goes into the carousel
controlCarousel?.addEventListener("focusin", (e) => {
  openControls();
});

mediaUploadDialog?.addEventListener("change", (e) => {
  const input = e.currentTarget;
  const file = input?.files?.[0];
  if (!file) return;

  selectedFile = file.name;
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
  if (sourceMode === "video") return;

  relaxSpeed = speedSlider.value;
  cacheSpeed = relaxSpeed;
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

relaxSelect?.addEventListener("change", () => {
  setRelaxPreference(relaxSelect.value);
  rebuildBrightnessMapIfNeeded();
});

sizeSelect?.addEventListener("change", () => {
  setSizePreference(sizeSelect.value);
});

backgroundColorBtn?.addEventListener("input", () => {
  backgroundColor = backgroundColorBtn.value;

  document.documentElement.style.setProperty(
    "--stage-background",
    backgroundColor,
  );
  renderFrame();
});
pointColorBtn?.addEventListener("input", () => {
  pointColor = pointColorBtn.value;
  renderFrame();
});
cellColorBtn?.addEventListener("input", () => {
  cellColor = cellColorBtn.value;
  renderFrame();
});

seedSelect?.addEventListener("change", () => {
  setSeedPreference(seedSelect.value);
});

// The dreaded controlPane (scroll/swipe to open/close)
function openControls() {
  app.classList.add("controls-open");
  syncControlsButton();
  requestAnimationFrame(fitCanvas);
}

function closeControls() {
  app.classList.remove("controls-open");
  syncControlsButton();
  requestAnimationFrame(fitCanvas);
}

// Dock buttons
uploadButton?.addEventListener("click", () => {
  mediaUploadDialog.click();
});

optionsButton?.addEventListener("click", () => {
  if (app.classList.contains("controls-open")) closeControls();
  else openControls();
});

resetButton?.addEventListener("click", resetScene);

canvasStage?.addEventListener(
  "wheel",
  (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    if (e.deltaY > 15) openControls();
    if (e.deltaY < -15) closeControls();
  },
  { passive: true },
);

let touchStartY = null;
let touchStartX = null;

canvasStage?.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  },
  { passive: true },
);

canvasStage?.addEventListener(
  "touchend",
  (e) => {
    if (touchStartY == null || touchStartX == null) return;

    const t = e.changedTouches[0];
    const dy = t.clientY - touchStartY;
    const dx = t.clientX - touchStartX;

    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy < -50) openControls();
      if (dy > 50) closeControls();
    }

    touchStartY = null;
    touchStartX = null;
  },
  { passive: true },
);

function isOn(btn, defaultValue = false) {
  if (!btn) return defaultValue;
  return btn.getAttribute("aria-pressed") === "true";
}

function setOn(btn, on) {
  if (!btn) return;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("appearance", on ? "accent" : "filled");
}

function setDisabled(btn, disabled) {
  if (!btn) return;
  if (disabled) {
    btn.setAttribute("disabled", "");
    setOn(btn, false); // force off when disabled
  } else {
    btn.removeAttribute("disabled");
  }
}

// Keep those toggles in sync
function syncButtonUI() {
  setOn(seedToggle, seedsOn);
  setOn(cellToggle, cellsOn);
  setOn(fillToggle, fillsOn);
  setDisabled(colorToggle, !seedsOn);
  if (!seedsOn) {
    colorsOn = false;
  }
  setOn(colorToggle, colorsOn);
}

syncButtonUI();

seedToggle?.addEventListener("click", () => {
  seedsOn = !seedsOn;
  syncButtonUI(); // sync seed color button too
  renderFrame();
});

cellToggle?.addEventListener("click", () => {
  cellsOn = !cellsOn;
  setOn(cellToggle, cellsOn);
  renderFrame();
});

colorToggle?.addEventListener("click", () => {
  colorsOn = !colorsOn;
  setOn(colorToggle, colorsOn);
  renderFrame();
});

fillToggle?.addEventListener("click", () => {
  fillsOn = !fillsOn;
  setOn(fillToggle, fillsOn);
  renderFrame();
});

saveDropdown?.addEventListener("wa-select", (e) => {
  const value = e.detail.item.value;

  if (value === "json") {
    saveJSON();
  } else if (value === "png") {
    savePNG();
  }
});

// File handlers
function handleImageUpload(file) {
  stopLoop();
  cleanupActiveMedia();

  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    enterImageMode();
    loadImage(img);
    URL.revokeObjectURL(url);
    if (currentMediaUrl === url) currentMediaUrl = null;
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    if (currentMediaUrl === url) currentMediaUrl = null;
    alert("Failed to load image.");
  };

  img.src = url;
}

async function loadVideoFromUrl(
  url,
  { revokeOnDone = false, autoPlay = false } = {},
) {
  stopLoop();
  cleanupActiveMedia();

  const thisUrl = new URL(url, window.location.href).href;
  currentMediaUrl = thisUrl;

  videoEl.preload = "metadata";
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.loop = true;

  const done = new Promise((resolve, reject) => {
    const onMeta = async () => {
      if (videoEl.currentSrc !== thisUrl && videoEl.src !== thisUrl) return;

      try {
        await loadVideo(videoEl);

        if (autoPlay) {
          setVideoPlaying(true);
        }

        resolve();
      } catch (e) {
        reject(e);
      }
    };

    const onErr = () => {
      if (videoEl.currentSrc !== thisUrl && videoEl.src !== thisUrl) return;
      cleanupActiveMedia();
      reject(new Error("Failed to load video."));
    };

    videoEl.addEventListener("loadedmetadata", onMeta, { once: true });
    videoEl.addEventListener("error", onErr, { once: true });
  });

  videoEl.src = thisUrl;
  videoEl.load();

  try {
    await done;
  } finally {
    if (revokeOnDone) URL.revokeObjectURL(url);
  }
}

function handleVideoUpload(file) {
  const url = URL.createObjectURL(file);
  loadVideoFromUrl(url, { revokeOnDone: true, autoPlay: false }).catch(() => {
    alert("Failed to load video.");
  });
}

async function loadPresetMedia(preset) {
  selectedFile = preset.src;
  const url = `${import.meta.env.BASE_URL}${preset.src}`;

  if (preset.type === "video") {
    await loadVideoFromUrl(url, { autoPlay: true });
    return;
  }

  enterImageMode();
  const img = new Image();
  img.src = url;
  await waitOnce(img, "load");
  loadImage(img);
}

// Set all the values and update the UI to match
async function applyPresetOverride(preset) {
  const s = preset.settings ?? {};

  await Promise.all([
    customElements.whenDefined("wa-input"),
    customElements.whenDefined("wa-select"),
    customElements.whenDefined("wa-slider"),
    customElements.whenDefined("wa-color-picker"),
    customElements.whenDefined("wa-button"),
  ]);

  if (s.numPoints != null) numPoints = s.numPoints;

  if (s.seedPreference) seedPreference = s.seedPreference;
  if (s.sizePreference) sizePreference = s.sizePreference;
  if (s.relaxPreference) relaxPreference = s.relaxPreference;

  if (s.relaxSpeed != null) {
    relaxSpeed = s.relaxSpeed;
    cacheSpeed = relaxSpeed;
  }

  if (s.backgroundColor) backgroundColor = s.backgroundColor;
  if (s.pointColor) pointColor = s.pointColor;
  if (s.cellColor) cellColor = s.cellColor;

  if (sizePreference === "none") {
    if (s.uniformRadius != null) {
      uniformRadius = s.uniformRadius;
      cacheMinRadius = s.minRadius;
      maxRadius = uniformRadius;
    }
  } else {
    if (s.minRadius != null) minRadius = s.minRadius;
    if (s.maxRadius != null) maxRadius = s.maxRadius;
    uniformRadius = maxRadius;
  }

  if (numPointsSlider) numPointsSlider.value = String(numPoints);
  if (seedSelect) seedSelect.value = seedPreference;
  if (sizeSelect) sizeSelect.value = sizePreference;
  if (relaxSelect) relaxSelect.value = relaxPreference;
  if (speedSlider) speedSlider.value = String(relaxSpeed);
  if (backgroundColorBtn) backgroundColorBtn.value = backgroundColor;
  if (pointColorBtn) pointColorBtn.value = pointColor;
  if (cellColorBtn) cellColorBtn.value = cellColor;
  if (radiusRange) {
    radiusRange.minValue = String(minRadius);
    radiusRange.maxValue = String(maxRadius);
  }
  if (radiusSlider) {
    radiusSlider.value = String(uniformRadius);
  }

  if ("seedsOn" in s) seedsOn = !!s.seedsOn;
  setOn(seedToggle, seedsOn);

  if ("colorsOn" in s) colorsOn = !!s.colorsOn;
  setOn(colorToggle, colorsOn);

  if ("cellsOn" in s) cellsOn = !!s.cellsOn;
  setOn(cellToggle, cellsOn);

  if ("fillsOn" in s) fillsOn = !!s.fillsOn;
  setOn(fillToggle, fillsOn);

  syncButtonUI();
  syncRadiusUI();
  document.documentElement.style.setProperty(
    "--stage-background",
    backgroundColor,
  );
  rebuildBrightnessMapIfNeeded();
  await loadPresetMedia(preset);
  if (s.relaxEnabled != null) setRelaxEnabled(!!s.relaxEnabled);
}

// Initialize
async function setup() {
  const presetOverride = chooseRandomPreset(presetOverrides);
  await applyPresetOverride(presetOverride);

  if (presetOverride?.settings?.relaxEnabled == null) setRelaxEnabled(true);

  app.classList.remove("loading");
  app.classList.add("ready");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToCardInCarousel(cardToStart);
    });
  });
}

setup();
