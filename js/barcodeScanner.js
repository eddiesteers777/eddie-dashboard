/* ==========================================
   Southbound Barcode Scanner

   Opens the camera modal on nutrition.html, reads a barcode and hands
   the decoded value back to whatever called it.

   Uses the browser's own BarcodeDetector where there is one (Chrome on
   Android) and otherwise the zbar-based polyfill
   (@undecaf/barcode-detector-polyfill), which is what makes it work in
   Safari on an iPhone. The polyfill is only downloaded the first time
   someone taps Scan (it used to load, render-blocking, on every visit
   to Nutrition -- and the code then looked for a different library that
   was never loaded, so Scan always said the library had failed).

   Rear camera (facingMode: "environment"); retail barcodes (UPC/EAN),
   Code 128 and QR codes.
========================================== */

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];
const POLYFILL = [
    "https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.9.15/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@undecaf/barcode-detector-polyfill@0.9.23/dist/index.js"
];

let active = null; // { stream, timer, video }

function getElements() {
    return {
        overlay: document.getElementById("foodScannerOverlay"),
        readerEl: document.getElementById("foodScannerReader"),
        status: document.getElementById("foodScannerStatus"),
        closeBtn: document.getElementById("foodScannerClose")
    };
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Couldn't load ${src}`));
        document.head.appendChild(script);
    });
}

let detectorPromise = null;
function getDetector() {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (async () => {
        if ("BarcodeDetector" in window) {
            try {
                const supported = await window.BarcodeDetector.getSupportedFormats();
                const formats = FORMATS.filter(f => supported.includes(f));
                if (formats.length) return new window.BarcodeDetector({ formats });
            } catch { /* fall through to the polyfill */ }
        }
        for (const src of POLYFILL) await loadScript(src);
        const Polyfill = window.barcodeDetectorPolyfill?.BarcodeDetectorPolyfill;
        if (!Polyfill) throw new Error("barcode-polyfill-missing");
        return new Polyfill({ formats: FORMATS });
    })();
    detectorPromise.catch(() => { detectorPromise = null; });
    return detectorPromise;
}

function stopScanner() {
    if (!active) return;
    clearTimeout(active.timer);
    active.stream?.getTracks().forEach(track => track.stop());
    if (active.video) active.video.srcObject = null;
    active = null;
}

function closeModal() {
    const { overlay, readerEl } = getElements();
    stopScanner();
    overlay?.classList.remove("open");
    if (readerEl) readerEl.innerHTML = "";
}

/**
 * Opens the scanner modal and starts the camera. Calls
 * onScanned(decodedText) exactly once on a successful scan,
 * then closes the modal automatically. Calling code doesn't
 * need to close anything itself on success.
 */
export async function openBarcodeScanner(onScanned) {
    const { overlay, readerEl, status, closeBtn } = getElements();

    if (!overlay || !readerEl || !status) {
        console.error("Barcode scanner: expected modal elements are missing.");
        return;
    }

    overlay.classList.add("open");
    status.textContent = "Getting the scanner ready…";
    status.dataset.status = "loading";
    if (closeBtn) closeBtn.onclick = closeModal;
    overlay.onclick = event => { if (event.target === overlay) closeModal(); };

    let detector;
    try {
        detector = await getDetector();
    } catch (error) {
        console.error("Barcode scanner unavailable:", error);
        status.textContent = navigator.onLine === false
            ? "The scanner needs a connection the first time. Type the food's name instead."
            : "The scanner couldn't load. Check your connection, or type the food's name instead.";
        status.dataset.status = "error";
        return;
    }
    if (!overlay.classList.contains("open")) return; // closed while loading

    status.textContent = "Requesting camera access…";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!overlay.classList.contains("open")) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = document.createElement("video");
        video.setAttribute("playsinline", "");
        video.muted = true;
        video.className = "food-scanner-video";
        video.srcObject = stream;
        readerEl.innerHTML = "";
        readerEl.appendChild(video);
        await video.play();
        active = { stream, video, timer: null };
        status.textContent = "Point the camera at a barcode.";
        status.dataset.status = "ready";

        let handled = false;
        const tick = async () => {
            if (!active || handled) return;
            try {
                const codes = await detector.detect(video);
                const code = codes.find(c => c.rawValue)?.rawValue;
                if (code && !handled) {
                    handled = true;
                    closeModal();
                    onScanned(code.trim());
                    return;
                }
            } catch { /* a frame that couldn't be read: try the next */ }
            if (active) active.timer = setTimeout(tick, 200);
        };
        tick();
    } catch (error) {
        console.error("Barcode scanner failed to start:", error);
        stopScanner();
        status.textContent = /Permission|NotAllowed/i.test(`${error?.name} ${error?.message}`)
            ? "Camera access was denied. Allow camera access in your browser settings and try again."
            : "Couldn't access the camera on this device.";
        status.dataset.status = "error";
    }
}
