// ============================================================================
// FrameStack PDF — code.js  v2.0
// Figma Plugin Sandbox Runner
// Architecture: Message dispatch table, sequential export safety, typed events
// ============================================================================

figma.showUI(__html__, {
  width: 620,
  height: 760,
  title: "FrameStack PDF"
});

// ── Typed message constants (single source of truth shared with ui.html) ──
const MSG = {
  // Sandbox → UI
  LOADING:             "LOADING",
  NO_FRAMES:           "NO_FRAMES",
  FRAMES_LOADED:       "FRAMES_LOADED",
  SINGLE_FRAME_READY:  "SINGLE_FRAME_READY",
  SINGLE_FRAME_FAILED: "SINGLE_FRAME_FAILED",
  HISTORY_LOGS_READY:  "HISTORY_LOGS_READY",
  PDF_DATA_READY:      "PDF_DATA_READY",
  PDF_DATA_FAILED:     "PDF_DATA_FAILED",
  // UI → Sandbox
  EXPORT_SINGLE_FRAME: "EXPORT_SINGLE_FRAME",
  SAVE_HISTORY_LOGS:   "SAVE_HISTORY_LOGS",
  GET_HISTORY_LOGS:    "GET_HISTORY_LOGS",
  SAVE_PDF_BLOB:       "SAVE_PDF_BLOB",
  FETCH_PDF_DATA:      "FETCH_PDF_DATA",
  CLEAR_ALL_PDF_BLOBS: "CLEAR_ALL_PDF_BLOBS",
  CLOSE:               "CLOSE"
};

const STORAGE_KEYS = {
  HISTORY_LOGS: "framestack_history_logs",
  PDF_BLOB_PREFIX: "pdf_blob_"
};

// ── Safe binary encoder ──
// QuickJS freezes on large typed array serialisation.
// Chunking into 16 KB slices avoids the call-stack overflow.
function uint8ToBinaryString(arr) {
  const CHUNK = 16384;
  const parts = [];
  for (let i = 0; i < arr.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK)));
  }
  return parts.join("");
}

// ── Send helper (keeps call sites clean) ──
function send(payload) {
  figma.ui.postMessage(payload);
}

// ── Frame selection loader ──
async function initSelection(isRefresh = false) {
  const selection = figma.currentPage.selection;
  const frames   = selection.filter(n => n.type === "FRAME");

  if (frames.length === 0) {
    send({ type: MSG.NO_FRAMES, hasAnySelection: selection.length > 0, isRefresh });
    return;
  }

  send({ type: MSG.LOADING, isRefresh });

  // Process sequentially to prevent Figma sandbox memory spikes on large selections.
  // Promise.all is fine for small counts; sequential is safer for 20+ frames.
  const USE_SEQUENTIAL_THRESHOLD = 8;
  const frameData = [];

  try {
    if (frames.length <= USE_SEQUENTIAL_THRESHOLD) {
      const results = await Promise.all(
        frames.map(frame => exportThumbnail(frame))
      );
      frameData.push(...results);
    } else {
      for (const frame of frames) {
        frameData.push(await exportThumbnail(frame));
      }
    }

    send({ type: MSG.FRAMES_LOADED, frames: frameData, isRefresh });
  } catch (err) {
    send({
      type: MSG.SINGLE_FRAME_FAILED,
      id: "batch",
      reason: "Thumbnail staging error: " + (err.message || String(err))
    });
  }
}

async function exportThumbnail(frame) {
  const bytes = await frame.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 0.25 }
  });
  return {
    id:              frame.id,
    name:            frame.name,
    width:           frame.width,
    height:          frame.height,
    thumbnailBinary: uint8ToBinaryString(bytes)
  };
}

// ── Message dispatch table ──
const handlers = {

  async [MSG.EXPORT_SINGLE_FRAME]({ id }) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (!node || node.type !== "FRAME") {
        send({ type: MSG.SINGLE_FRAME_FAILED, id, reason: "Frame no longer exists on canvas." });
        return;
      }
      const bytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }
      });
      send({
        type:        MSG.SINGLE_FRAME_READY,
        id:          node.id,
        name:        node.name,
        width:       node.width,
        height:      node.height,
        imageBinary: uint8ToBinaryString(bytes)
      });
    } catch (err) {
      send({
        type:   MSG.SINGLE_FRAME_FAILED,
        id,
        reason: err.message || String(err)
      });
    }
  },

  [MSG.SAVE_HISTORY_LOGS]({ logs }) {
    figma.clientStorage.setAsync(STORAGE_KEYS.HISTORY_LOGS, logs).catch(() => {});
  },

  [MSG.GET_HISTORY_LOGS]() {
    figma.clientStorage.getAsync(STORAGE_KEYS.HISTORY_LOGS)
      .then(logs => send({ type: MSG.HISTORY_LOGS_READY, logs: logs || [] }))
      .catch(()  => send({ type: MSG.HISTORY_LOGS_READY, logs: [] }));
  },

  [MSG.SAVE_PDF_BLOB]({ id, base64 }) {
    figma.clientStorage.setAsync(STORAGE_KEYS.PDF_BLOB_PREFIX + id, base64).catch(() => {});
  },

  [MSG.FETCH_PDF_DATA]({ id }) {
    figma.clientStorage.getAsync(STORAGE_KEYS.PDF_BLOB_PREFIX + id)
      .then(base64 => {
        if (base64) {
          send({ type: MSG.PDF_DATA_READY, id, base64 });
        } else {
          send({ type: MSG.PDF_DATA_FAILED, id, reason: "PDF content no longer available." });
        }
      })
      .catch(err => send({
        type: MSG.PDF_DATA_FAILED,
        id,
        reason: err.message || "Storage read failure."
      }));
  },

  [MSG.CLEAR_ALL_PDF_BLOBS]({ ids = [] }) {
    ids.forEach(id =>
      figma.clientStorage.deleteAsync(STORAGE_KEYS.PDF_BLOB_PREFIX + id).catch(() => {})
    );
  },

  [MSG.CLOSE]() {
    figma.closePlugin();
  }
};

// ── Live selection sync ──
figma.on("selectionchange", () => initSelection(true));

// ── Incoming message router ──
figma.ui.onmessage = (msg) => {
  if (!msg || !msg.type) return;
  const handler = handlers[msg.type];
  if (handler) {
    handler(msg);
  } else {
    console.warn("[FrameStack] Unknown message type:", msg.type);
  }
};

// ── Boot ──
initSelection();
