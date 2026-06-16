// ============================================================================
// FrameStack PDF — code.js  v3.1
// Figma Plugin Sandbox Runner
// Architecture: Message dispatch table, sequential export safety, typed events
// ============================================================================

figma.showUI(__html__, {
  width: 620,
  height: 760,
  title: "FrameStack PDF"
});

// ── Typed message constants ──
const MSG = {
  // Sandbox → UI
  USER_READY:          "USER_READY",
  LOADING:             "LOADING",
  NO_FRAMES:           "NO_FRAMES",
  FRAMES_LOADED:       "FRAMES_LOADED",
  SINGLE_FRAME_READY:  "SINGLE_FRAME_READY",
  SINGLE_FRAME_FAILED: "SINGLE_FRAME_FAILED",
  HISTORY_LOGS_READY:  "HISTORY_LOGS_READY",
  PDF_DATA_READY:      "PDF_DATA_READY",
  PDF_DATA_FAILED:     "PDF_DATA_FAILED",
  PREFS_READY:         "PREFS_READY",
  // UI → Sandbox
  EXPORT_SINGLE_FRAME: "EXPORT_SINGLE_FRAME",
  SAVE_HISTORY_LOGS:   "SAVE_HISTORY_LOGS",
  GET_HISTORY_LOGS:    "GET_HISTORY_LOGS",
  SAVE_PDF_BLOB:       "SAVE_PDF_BLOB",
  FETCH_PDF_DATA:      "FETCH_PDF_DATA",
  CLEAR_ALL_PDF_BLOBS: "CLEAR_ALL_PDF_BLOBS",
  SAVE_PREFS:          "SAVE_PREFS",
  GET_PREFS:           "GET_PREFS",
  FIND_ALL_FRAMES:     "FIND_ALL_FRAMES",
  CLOSE:               "CLOSE"
};

const STORAGE_KEYS = {
  HISTORY_LOGS:    "framestack_history_logs",
  PDF_BLOB_PREFIX: "pdf_blob_",
  PREFS:           "framestack_prefs",
};

// ── Safe binary encoder ──
// QuickJS freezes on large typed-array serialisation.
// Chunking into 16 KB slices avoids the call-stack overflow.
function uint8ToBinaryString(arr) {
  const CHUNK = 16384; // 16 KB — safe upper bound for QuickJS apply()
  const parts = [];
  for (let i = 0; i < arr.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK)));
  }
  return parts.join("");
}

// ── Send helper ──
function send(payload) {
  figma.ui.postMessage(payload);
}

// ── Current user ──
async function initUser() {
  try {
    const user = figma.currentUser;
    send({
      type:     MSG.USER_READY,
      name:     user ? user.name || "" : "",
      photoUrl: user ? user.photoUrl || "" : ""
    });
  } catch (_) {
    send({ type: MSG.USER_READY, name: "", photoUrl: "" });
  }
}

// ── Thumbnail export (shared by selection and find-all) ──
async function exportThumbnail(frame) {
  const bytes = await frame.exportAsync({
    format:     "PNG",
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

// ── Batch frame loader (shared by initSelection and FIND_ALL_FRAMES) ──
async function loadFrames(frames, isRefresh) {
  // Sequential export is safer above this frame count (avoids sandbox OOM spikes).
  const USE_SEQUENTIAL_THRESHOLD = 8;
  const frameData = [];
  try {
    if (frames.length <= USE_SEQUENTIAL_THRESHOLD) {
      const results = await Promise.all(frames.map(f => exportThumbnail(f)));
      frameData.push(...results);
    } else {
      for (const frame of frames) {
        frameData.push(await exportThumbnail(frame));
      }
    }
    send({ type: MSG.FRAMES_LOADED, frames: frameData, isRefresh });
  } catch (err) {
    send({
      type:   MSG.SINGLE_FRAME_FAILED,
      id:     "batch",
      reason: "Thumbnail staging error: " + (err.message || String(err))
    });
  }
}

// ── Frame selection loader ──
async function initSelection(isRefresh = false) {
  const selection = figma.currentPage.selection;
  const frames    = selection.filter(n => n.type === "FRAME");
  if (frames.length === 0) {
    send({ type: MSG.NO_FRAMES, hasAnySelection: selection.length > 0, isRefresh });
    return;
  }
  send({ type: MSG.LOADING, isRefresh });
  await loadFrames(frames, isRefresh);
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
        format:     "PNG",
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
      send({ type: MSG.SINGLE_FRAME_FAILED, id, reason: err.message || String(err) });
    }
  },

  [MSG.SAVE_HISTORY_LOGS]({ logs }) {
    figma.clientStorage.setAsync(STORAGE_KEYS.HISTORY_LOGS, logs).catch(() => {});
  },

  [MSG.GET_HISTORY_LOGS]() {
    figma.clientStorage.getAsync(STORAGE_KEYS.HISTORY_LOGS)
      .then(logs => send({ type: MSG.HISTORY_LOGS_READY, logs: logs || [] }))
      .catch(()   => send({ type: MSG.HISTORY_LOGS_READY, logs: [] }));
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
        type:   MSG.PDF_DATA_FAILED,
        id,
        reason: err.message || "Storage read failure."
      }));
  },

  [MSG.CLEAR_ALL_PDF_BLOBS]({ ids = [] }) {
    ids.forEach(id =>
      figma.clientStorage.deleteAsync(STORAGE_KEYS.PDF_BLOB_PREFIX + id).catch(() => {})
    );
  },

  [MSG.SAVE_PREFS]({ prefs }) {
    figma.clientStorage.setAsync(STORAGE_KEYS.PREFS, prefs).catch(() => {});
  },

  [MSG.GET_PREFS]() {
    figma.clientStorage.getAsync(STORAGE_KEYS.PREFS)
      .then(prefs => send({ type: MSG.PREFS_READY, prefs: prefs || null }))
      .catch(()   => send({ type: MSG.PREFS_READY, prefs: null }));
  },

  async [MSG.FIND_ALL_FRAMES]() {
    const allFrames = figma.currentPage.children.filter(n => n.type === "FRAME");
    if (allFrames.length === 0) {
      send({ type: MSG.NO_FRAMES, hasAnySelection: false, isRefresh: false });
      return;
    }
    send({ type: MSG.LOADING, isRefresh: false });
    await loadFrames(allFrames, false);
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
initUser();
initSelection();
