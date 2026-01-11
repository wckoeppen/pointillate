import "@awesome.me/webawesome/dist/components/button/button.js";

const app = document.getElementById("app");
const titlePane = document.getElementById("titlePane");
const controlPane = document.getElementById("controlPane");
const canvasStage = document.getElementById("canvasStage");
const canvas = document.getElementById("canvas");

let mediaWidth = 0;
let mediaHeight = 0;

function setMediaSize(w, h) {
  mediaWidth = w;
  mediaHeight = h;
  fitCanvas();
  requestAnimationFrame(fitCanvas); // settle after layout
}

function desiredControlHeightPx() {
  const maxH = parseFloat(getComputedStyle(controlPane).maxHeight); // computed -> px
  return Math.min(controlPane.scrollHeight, maxH);
}

function fitCanvas() {
  if (!mediaWidth || !mediaHeight) return;

  const titleH = titlePane.getBoundingClientRect().height;
  const controlH = desiredControlHeightPx();

  const availH = Math.max(0, window.innerHeight - titleH - controlH);
  const availW = canvasStage.clientWidth;

  const scale = Math.min(availW / mediaWidth, availH / mediaHeight);

  const cssW = Math.floor(mediaWidth * scale);
  const cssH = Math.floor(mediaHeight * scale);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvasStage.style.height = `${cssH}px`;
    console.log(cssW, cssH);

}

// Refit when viewport or control pane changes size
window.addEventListener("resize", () => {
  fitCanvas();
  requestAnimationFrame(fitCanvas);
});
new ResizeObserver(() => {
  fitCanvas();
  requestAnimationFrame(fitCanvas);
}).observe(controlPane);
new ResizeObserver(() => {
  fitCanvas();
  requestAnimationFrame(fitCanvas);
}).observe(titlePane);

function loadImageAndStart() {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}test-photo-small.jpg`;
  img.onload = () => {
    setMediaSize(img.naturalWidth, img.naturalHeight);
  };
}

loadImageAndStart();

document.getElementById("openOptions").addEventListener("click", () => {
  app.classList.toggle("controls-open");
  fitCanvas();
  requestAnimationFrame(fitCanvas);
});
