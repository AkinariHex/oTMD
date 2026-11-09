const overlayParams = new URLSearchParams(location.search);
const showSample = overlayParams.has("sample");
const SAMPLE_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23373b46'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%23a9afbc'/%3E%3Cellipse cx='20' cy='34' rx='13' ry='9' fill='%23a9afbc'/%3E%3C/svg%3E";
const numberFormat = new Intl.NumberFormat("en-US");
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setImage(image, source) {
  if (source && image.getAttribute("src") !== source) image.src = source;
}

function applyFrameStyle(frame, style) {
  frame.style.background = `rgba(${style.backgroundColor}, ${style.backgroundOpacity})`;
  frame.style.borderRadius = `${style.borderRadius}px`;
  frame.style.padding = `${style.padding}px`;
  frame.style.fontFamily = style.fontFamily;
}

function connectOverlay(source, onMessage) {
  let delay = RECONNECT_MIN_MS;
  const query = overlayParams.has("preview") ? "?preview=1" : source ? `?source=${source}` : "";

  const open = () => {
    const socket = new WebSocket(`ws://${location.host}/ws${query}`);
    socket.onopen = () => {
      delay = RECONNECT_MIN_MS;
    };
    socket.onmessage = (message) => onMessage(JSON.parse(message.data).settings);
    socket.onclose = () => {
      setTimeout(open, delay);
      delay = Math.min(delay * 2, RECONNECT_MAX_MS);
    };
  };

  window.addEventListener("load", open);
}
