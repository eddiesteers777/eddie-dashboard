/* ==========================================
   Southbound Barcode Scanner

   Thin wrapper around the html5-qrcode library
   (loaded globally via a <script> tag in nutrition.html)
   to open a camera modal, scan a barcode, and hand the
   decoded value back to whatever called it.

   Uses the rear camera (facingMode: "environment") since
   that's what people actually point at a product barcode.
   Decodes both 1D retail barcodes (UPC/EAN) and QR codes —
   the library supports both, and it costs nothing extra to
   leave both enabled.

   Safari on iOS has no native barcode-detection API at all
   (as of this writing), so this deliberately does not rely
   on the browser's BarcodeDetector — html5-qrcode does its
   own decoding in JS, which is what makes this work on an
   iPhone in Safari in the first place.
========================================== */

let activeScanner = null;

function getElements() {
    return {
        overlay: document.getElementById("foodScannerOverlay"),
        readerEl: document.getElementById("foodScannerReader"),
        status: document.getElementById("foodScannerStatus"),
        closeBtn: document.getElementById("foodScannerClose")
    };
}

async function stopScanner() {
    if (!activeScanner) {
        return;
    }

    try {
        await activeScanner.stop();
        activeScanner.clear();
    } catch {
        // Already stopped or never fully started — fine to ignore.
    }

    activeScanner = null;
}

function closeModal() {
    const { overlay, readerEl } = getElements();

    stopScanner();

    if (overlay) {
        overlay.classList.remove("open");
    }

    if (readerEl) {
        readerEl.innerHTML = "";
    }
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

    if (typeof window.Html5Qrcode === "undefined") {
        status.textContent =
            "Scanner library failed to load. Check your connection and reload the page.";
        overlay.classList.add("open");
        return;
    }

    overlay.classList.add("open");
    status.textContent = "Requesting camera access…";
    status.dataset.status = "loading";

    const onClose = () => {
        closeModal();
    };

    if (closeBtn) {
        closeBtn.onclick = onClose;
    }

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            onClose();
        }
    };

    try {
        activeScanner = new window.Html5Qrcode("foodScannerReader", {
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.QR_CODE
            ],
            verbose: false
        });

        let handled = false;

        await activeScanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 150 }
            },
            (decodedText) => {
                if (handled) {
                    return;
                }

                handled = true;
                closeModal();
                onScanned(decodedText.trim());
            },
            () => {
                // Per-frame "nothing found yet" callback — expected
                // constantly while the camera is pointed at nothing
                // decodable. Intentionally not treated as an error.
            }
        );

        status.textContent = "Point the camera at a barcode.";
        status.dataset.status = "ready";

    } catch (error) {
        console.error("Barcode scanner failed to start:", error);

        status.textContent =
            error?.message?.includes("Permission")
                ? "Camera access was denied. Allow camera access in Safari settings and try again."
                : "Couldn't access the camera on this device.";

        status.dataset.status = "error";
    }
}
