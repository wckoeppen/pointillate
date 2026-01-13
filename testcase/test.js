import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome/dist/components/button/button.js";

const app = document.getElementById("app");
const titlePane = document.getElementById("titlePane");
const controlPane = document.getElementById("controlPane");
const canvasStage = document.getElementById("canvasStage");
const canvas = document.getElementById("canvas");
const optionsButton = document.getElementById("optionsButton");

let mediaWidth = 0;
let mediaHeight = 0;

// Control the layout
function setMediaSize(w, h) {
  mediaWidth = w;
  mediaHeight = h;
  fitCanvas();
}

function fitCanvas() {
  if (!mediaWidth || !mediaHeight) return;

  const titleH = titlePane.getBoundingClientRect().height;
  const controlH = controlPane.getBoundingClientRect().height;
  const availH = Math.max(0, window.innerHeight - titleH - controlH);
  const availW = canvasStage.clientWidth;

  const scale = Math.min(availW / mediaWidth, availH / mediaHeight);

  const cssW = Math.floor(mediaWidth * scale);
  const cssH = Math.floor(mediaHeight * scale);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvasStage.style.height = `${cssH}px`;
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

function loadImageAndStart() {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}test-photo-small.jpg`;
  img.onload = () => {
    setMediaSize(img.naturalWidth, img.naturalHeight);
  };
}

loadImageAndStart();

function syncControlsButton() {
  const open = app.classList.contains("controls-open");

  optionsButton.appearance = open ? "accent" : "filled";
  optionsButton.setAttribute(
    "aria-label",
    open ? "Collapse options" : "Open options"
  );
}

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

optionsButton.addEventListener("click", () => {
  if (app.classList.contains("controls-open")) closeControls();
  else openControls();
});
