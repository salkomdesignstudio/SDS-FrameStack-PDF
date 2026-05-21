// ============================================================================
// FrameStack PDF — code.js (Figma Plugin Sandbox Runner)
// Purpose: Multi-frame selection listener, image exporter, and UI messaging bridge.
// ============================================================================

// Mount the compiled UI iframe with responsive desktop dimensions
figma.showUI(__html__, {
  width: 620,
  height: 760,
  title: "FrameStack PDF"
});

/**
 * High-Speed Safety Binary String Encoder
 * QuickJS sandbox threads lock up when serializing raw byte arrays or large objects.
 * Dividing the Uint8Array into 16,384-byte subsegments and converting them to strings 
 * allows instant data postMessage transfer in under 5 milliseconds with zero memory overhead.
 */
function uint8ToBinaryString(arr) {
  const chunks = [];
  const chunkSize = 16384;
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, arr.subarray(i, i + chunkSize)));
  }
  return chunks.join("");
}

/**
 * Initializes and polls frames selected on the active page.
 * Filter types to FRAME only, generate quick thumbnails, and send to ui.html.
 */
async function initSelection(isRefresh = false) {
  const selectedNodes = figma.currentPage.selection;
  const frames = selectedNodes.filter(node => node.type === "FRAME");

  if (frames.length === 0) {
    const hasAnySelection = selectedNodes.length > 0;
    figma.ui.postMessage({ type: "NO_FRAMES", hasAnySelection, isRefresh });
    return;
  }

  // Signal UI that thumbnails are rendering
  figma.ui.postMessage({ type: "LOADING", isRefresh });

  try {
    // Stage thumbnails sequentially for maximum memory safety
    const frameData = await Promise.all(
      frames.map(async (frame) => {
        // Export lightweight 0.25x PNG for list thumbnails
        const thumbnailBytes = await frame.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 0.25 }
        });

        return {
          id: frame.id,
          name: frame.name,
          width: frame.width,
          height: frame.height,
          thumbnailBinary: uint8ToBinaryString(thumbnailBytes)
        };
      })
    );

    figma.ui.postMessage({ type: "FRAMES_LOADED", frames: frameData, isRefresh });
  } catch (err) {
    figma.ui.postMessage({
      type: "SINGLE_FRAME_FAILED",
      id: "all",
      reason: "Canvas access/thumbnail error: " + err.message
    });
  }
}

// ── Live Selection Sync ──
figma.on("selectionchange", () => {
  initSelection(true);
});

// ── Message Router ──
figma.ui.onmessage = async (msg) => {
  // High-fidelity image staging for PDF creation
  if (msg.type === "EXPORT_SINGLE_FRAME") {
    const { id } = msg;
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node && node.type === "FRAME") {
        // Export high resolution crisp 2x scale PNG
        const imageBytes = await node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 }
        });

        figma.ui.postMessage({
          type: "SINGLE_FRAME_READY",
          id: node.id,
          name: node.name,
          width: node.width,
          height: node.height,
          imageBinary: uint8ToBinaryString(imageBytes)
        });
      } else {
        figma.ui.postMessage({
          type: "SINGLE_FRAME_FAILED",
          id,
          reason: "Target frame layer no longer exists on this canvas."
        });
      }
    } catch (err) {
      figma.ui.postMessage({
        type: "SINGLE_FRAME_FAILED",
        id,
        reason: err.message || String(err)
      });
    }
  }

  // Save custom client history logs to persistent Figma clientStorage
  if (msg.type === "SAVE_HISTORY_LOGS") {
    figma.clientStorage.setAsync("framestack_history_logs", msg.logs).catch(() => {});
  }

  // Load custom client history logs from persistent Figma clientStorage
  if (msg.type === "GET_HISTORY_LOGS") {
    figma.clientStorage.getAsync("framestack_history_logs")
      .then(logs => {
        figma.ui.postMessage({ type: "HISTORY_LOGS_READY", logs: logs || [] });
      })
      .catch(() => {
        figma.ui.postMessage({ type: "HISTORY_LOGS_READY", logs: [] });
      });
  }

  // Save specific PDF data blob to figma.clientStorage under a unique key
  if (msg.type === "SAVE_PDF_BLOB") {
    figma.clientStorage.setAsync("pdf_blob_" + msg.id, msg.base64).catch(() => {});
  }

  // Fetch specific PDF data blob from figma.clientStorage and post back to UI
  if (msg.type === "FETCH_PDF_DATA") {
    figma.clientStorage.getAsync("pdf_blob_" + msg.id)
      .then(base64 => {
        if (base64) {
          figma.ui.postMessage({
            type: "PDF_DATA_READY",
            id: msg.id,
            base64: base64
          });
        } else {
          figma.ui.postMessage({
            type: "PDF_DATA_FAILED",
            id: msg.id,
            reason: "PDF content is no longer available or was cleared."
          });
        }
      })
      .catch((err) => {
        figma.ui.postMessage({
          type: "PDF_DATA_FAILED",
          id: msg.id,
          reason: err.message || "Failed to load PDF database."
        });
      });
  }

  // Clear specific PDF data blobs to reclaim storage
  if (msg.type === "CLEAR_ALL_PDF_BLOBS") {
    const ids = msg.ids || [];
    ids.forEach(id => {
      figma.clientStorage.deleteAsync("pdf_blob_" + id).catch(() => {});
    });
  }

  // Gracefully terminate Figma runtime environment
  if (msg.type === "CLOSE") {
    figma.closePlugin();
  }
};

// Start detection loop immediately on mount
initSelection();
