# FrameStack PDF

**Export Figma frames to PDF — with full control over page size, compression, order, and metadata. Right inside Figma.**

[![Figma Plugin](https://img.shields.io/badge/Figma-Plugin-0014D1?style=flat-square&logo=figma&logoColor=white)](https://www.figma.com/community/plugin/1638543298157640831)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

FrameStack PDF is a Figma plugin that turns selected frames into a properly configured multi-page PDF without leaving Figma. It handles page sizing, image compression, per-frame overrides, bleed settings, PDF document metadata, and export history — all through a polished, dark-mode-ready interface built on jsPDF.

![FrameStack PDF Preview](./image-preview.png)

---

## Why FrameStack PDF

Figma's built-in PDF export is a black box: fixed page mapping, no compression control, no per-frame sizing, and no document metadata. For design deliverables, presentations, and print-ready files, that's rarely enough.

FrameStack PDF gives you the decisions Figma doesn't:

- **Per-frame page size overrides** — mix A4, Letter, and custom sizes in the same PDF
- **Compression control** — slide between quality and file size based on what the output is for
- **Drag-to-reorder** — define the page sequence independently of how frames are arranged on the canvas
- **Bleed support** — enable bleed per frame for print-ready exports
- **PDF metadata** — embed title, author, subject, and keywords directly into the file
- **Export history** — re-download any previous export without re-configuring

---

## Features

### Configure Tab

The primary workspace where you build your export.

**Page size presets** — quickly apply standard sizes across all frames: A4, A3, US Letter, US Legal, Tabloid, and Presentation (16:9). Each preset chip is applied in one click.

**Page orientation** — toggle between Portrait and Landscape via a segmented control. Works alongside presets and custom sizes.

**Image quality** — a range slider controls the JPEG compression quality passed to jsPDF. Higher values preserve detail; lower values reduce file size. The estimation box updates live to show approximate output size and compression ratio.

**Frame list** — all frames detected in your current Figma selection appear as cards. Each card shows:

- A live thumbnail rendered from the frame
- Frame name and dimensions (in `W × H px` format)
- An order badge showing its position in the PDF
- A drag handle for reordering
- A checkbox to include or exclude it from the export
- A settings trigger that opens a per-frame override drawer

**Per-frame overrides** — expand any frame card to set a custom page size and orientation that differs from the global setting, and toggle bleed on or off for that specific frame. Override frames are tagged inline so you can spot them at a glance.

**Select all / deselect all** — a toolbar above the frame list lets you toggle all frames in one action.

### Document Tab

Optional PDF document metadata embedded into the exported file.

| Field    | Description                                         |
| -------- | --------------------------------------------------- |
| Title    | Document title embedded in PDF properties           |
| Author   | Author name embedded in PDF properties              |
| Subject  | Subject or description embedded in PDF properties   |
| Keywords | Comma-separated keywords embedded in PDF properties |

All fields are optional. When left blank, the PDF is generated without those metadata entries.

### History Tab

A persistent log of every export session, stored locally within the plugin. Each history entry shows:

- The PDF filename
- The number of pages exported
- The export timestamp
- A re-download button to fetch the same file again without re-configuring

The full history can be cleared in one action from the History tab toolbar.

---

## How It Works

```
Figma Canvas
     │
     │  Plugin reads selected frames via Figma Plugin API
     ▼
code.js (Plugin sandbox)
     │
     │  Exports each frame as PNG image data
     │  Sends frame data, names, and dimensions to UI
     ▼
ui.html (Plugin UI — runs in iframe)
     │
     │  Receives frame data from plugin sandbox
     │  Renders frame cards with thumbnails
     │  User configures page sizes, quality, order, metadata
     │
     │  On export: jsPDF assembles pages in the defined order,
     │  applies per-page size and orientation, embeds image data
     │  at the configured quality level, attaches PDF metadata
     ▼
PDF file
     │
     └─ Downloaded directly to the user's machine
        Entry added to History tab for re-download
```

The plugin is split across two execution contexts as required by the Figma Plugin API:

**`code.js`** runs in the Figma plugin sandbox and has direct access to the Figma document. It reads selected frames, exports them as PNG image data using `figma.exportAsync`, and passes the results to the UI via `figma.ui.postMessage`.

**`ui.html`** runs in a sandboxed iframe and handles all user interaction and PDF generation. It receives the frame data from `code.js`, renders the configuration interface, and uses jsPDF to assemble and download the final PDF. Communication back to `code.js` goes through `parent.postMessage`.

---

## File Structure

```
SDS-FrameStack-PDF/
├── code.js           # Plugin sandbox — Figma API access, frame export
├── ui.html           # Plugin UI — configuration interface, jsPDF export
├── manifest.json     # Figma plugin manifest
├── logo.svg          # Plugin icon (vector)
├── logo.png          # Plugin icon (raster)
└── image-preview.png # Repository preview image
```

---

## Installation

### From the Figma Community

Search for **FrameStack PDF** in the Figma Community plugins directory, or install directly via plugin ID `1638543298157640831`.

### Running Locally (Development)

1. Clone the repository:

```bash
git clone https://github.com/salkomdesignstudio/SDS-FrameStack-PDF.git
```

2. In Figma Desktop, go to **Plugins → Development → Import plugin from manifest…**

3. Select `manifest.json` from the cloned folder.

4. The plugin will appear under **Plugins → Development** and can be run on any Figma file.

No build step is required — the plugin runs directly from `code.js` and `ui.html`.

---

## Usage

1. Open a Figma file and select the frames you want to export.
2. Run **FrameStack PDF** from the Plugins menu.
3. In the **Configure** tab:
   - Choose a page size preset or set a custom orientation.
   - Adjust the image quality slider.
   - Reorder frames by dragging, and deselect any you don't want included.
   - Open per-frame settings to override page size or enable bleed.
4. In the **Document** tab, optionally fill in PDF metadata.
5. The footer shows how many frames are selected and an estimated file size.
6. Click **Export PDF** to generate and download the file.
7. The export appears in the **History** tab for re-download at any time.

---

## Technical Details

| Detail           | Value                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Figma Plugin API | `1.0.0`                                                                            |
| PDF library      | [jsPDF 2.5.1](https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js) |
| Supported editor | Figma (not FigJam)                                                                 |
| Network access   | `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`                                         |
| Document access  | `dynamic-page`                                                                     |
| Permissions      | `currentuser`                                                                      |
| Dark mode        | Supported                                                                          |

---

## License

MIT © [Salkom Design Studio](https://salkomdesignstudio.com)

---

Built by **Govarthanan** — UI/UX Designer & Frontend Developer at [Salkom Design Studio](https://salkomdesignstudio.com), Chennai.
