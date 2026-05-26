# Pickle Viewer - VS Code Extension

[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/SasidharAkurathi.pickle-visual-viewer?style=flat-square&label=Marketplace&color=007acc)](https://marketplace.visualstudio.com/items?itemName=SasidharAkurathi.pickle-visual-viewer)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/SasidharAkurathi.pickle-visual-viewer?style=flat-square&color=2ea44f)](https://marketplace.visualstudio.com/items?itemName=SasidharAkurathi.pickle-visual-viewer)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/SasidharAkurathi.pickle-visual-viewer?style=flat-square&color=dfb317)](https://marketplace.visualstudio.com/items?itemName=SasidharAkurathi.pickle-visual-viewer)

**Pickle Viewer** is a professional, security-first, and visually stunning developer tool for VS Code that allows you to safely open, inspect, and analyze Python `.pkl` / pickle files with an interactive visual workspace.

Built with performance, security, and scientific workflows in mind, Pickle Viewer provides a rich, web-style devtools interface to explore complex nested variables, machine learning models, raw media, and deep learning structures safely without risking system integrity.

---

## 🚀 Key Features

*   **🛡️ Security-First Bytecode Audit**: Pickle files can execute arbitrary system code when unpickling. Pickle Viewer statically disassembles the pickle byte-stream using `pickletools` **prior to running any python code**, mapping imports and checking for execution opcodes (`REDUCE`, `BUILD`, etc.) to provide a complete risk report.
*   **🛠️ Safe Resilient Mocking**: Bypasses missing modules or unresolved local class imports (e.g., custom PyTorch neural networks) using a custom `SafeUnpickler` that dynamically mocks missing classes as browsable `MockObject` instances, preventing typical crash loops.
*   **🌳 Key-Filterable Tree Explorer**: Collapsible monospace explorer showing variables, data structures, and primitives. Supports live input search with highlighted matching substrings.
*   **🔁 Cascading Recursive Expand/Collapse**: Toolbar actions programmatically cascade down the entire tree, triggering the lazy-loaded rendering of nested children at every level recursively.
*   **📊 Rich DataFrame Spreadsheet**: Pre-scans datasets recursively on load to discover and list all DataFrames. Renders selected DataFrames into scrollable tables with pagination and index column stickiness, alongside a statistics sidebar showing `df.describe()` metrics for numeric columns.
*   **🖼️ Embedded Media & ML visualizer**:
    *   **Images**: Auto-detects PIL `Image` objects or image-like NumPy matrices (2D/3D uint8 grids) and renders them inline using base64 PNG previews.
    *   **Audio waves**: Translates float audio waveform vectors or `(waveform, sample_rate)` tuples into signed 16-bit PCM WAV Base64 streams, playable in an interactive `<audio controls>` player.
    *   **Videos**: Compiles 4D NumPy frame sequences `(Frames, H, W, C)` into loopable base64 animated GIFs.
    *   **Matplotlib plots**: Automatically captures and renders `matplotlib.figure.Figure` plots inline.
    *   **Neural Network layers**: Parses PyTorch `nn.Module` hierarchies, listing direct child layers and parameter weight counts.
*   **📦 Magic Signature Bytes Auto-Detector**: Automatically scans raw binary `bytes`/`bytearray` objects to identify magic headers, rendering PNG/JPG/WebP/BMP images, MP3/WAV/OGG audio files, and MP4/WebM loopable muted `<video>` players inline!
*   **✨ Base64 String Media Auto-Detection**: Scans python string variables for Base64 Data URIs (`data:image/png;base64,...`) or pure base64 media blocks, converting them into visual players and canvas previews automatically!
*   **🔢 Paginated Hex Inspector**: Displays raw binary offsets, hex byte grids, and printable ASCII maps page-by-page.
*   **🌓 Unified VS Code Theme Support**: Visual elements inherit active editor styles (`--vscode-editor-background`, `--vscode-foreground`) to coordinate with Dark, Light, and High Contrast setups.

---

## 🧱 Extension Architecture

Pickle Viewer divides responsibilities cleanly:
1.  **VS Code Custom Editor (TypeScript)**: Integrated through `vscode.CustomReadonlyEditorProvider` to intercept `.pkl`/`.pickle`/`.pck` file launches.
2.  **Python Backend CLI (`python/viewer.py`)**: Spawns in the workspace's active interpreter environment. Parses pickles in memory, scales floats, and converts massive ndarrays into structured JSON metrics.
3.  **Unified Webview Interface (HTML/CSS/JS)**: Renders a premium, responsive multi-tab workbench (Explorer, DataFrame, Hex, Security).

---

## 🛠️ Installation & Compilation

Follow these steps to run and compile Pickle Viewer locally:

### Prerequisites
*   [Node.js](https://nodejs.org/) (v16 or higher)
*   [VS Code](https://code.visualstudio.com/) (v1.75.0 or higher)
*   [Python 3](https://www.python.org/) (with `numpy` and `pandas` installed in your workspace environment for testing ML pickles)

### 1. Development Environment Setup
Clone or copy the project into your local machine and open the directory in VS Code:
```bash
# Install node package typings and compilers
npm install
```

### 2. Compile TypeScript
To compile TypeScript source files in the `src/` directory to JavaScript in the `out/` directory:
```bash
# Run one-off compiler
npm run compile

# Or run the TypeScript watcher to automatically compile on file change
npm run watch
```

### 3. Run and Debug Local Extension
1. Open the project folder in VS Code.
2. Open the **Run and Debug** view (`Ctrl+Shift+D` or `Cmd+Shift+D`).
3. Select **Launch Extension** from the configuration dropdown.
4. Press **`F5`** (or click the green Play arrow).
5. A new window, **Extension Development Host**, will open. 
6. In this host window, open any workspace containing `.pkl` files (or generate sample pickles by running `python scratch/create_test_pickles.py` in your terminal!).
7. Double-click any `.pkl` file in the Explorer to launch it immediately inside our custom Pickle Viewer default visualizer editor!

---

## 📦 VSIX Packaging & VS Code Marketplace Publishing

To compile the extension into a shareable `.vsix` installer package and publish it to the official Microsoft Visual Studio Marketplace, follow these steps:

### Prerequisites for Publishing
*   A **Microsoft Account** linked to a [Microsoft Azure DevOps organization](https://aex.dev.azure.com/).
*   A **Personal Access Token (PAT)** created inside your Azure DevOps account under "All accessible organizations", authorized with "Marketplace: Publish" scopes.
*   A **Publisher ID** created in the [VS Code Marketplace Publisher Management Portal](https://marketplace.visualstudio.com/manage).

### 1. Packaging VSIX locally
To package the extension into a local VSIX installer file:
1. Install the VS Code Extension CLI globally:
   ```bash
   npm install -g @vscode/vsce
   ```
2. Run the packaging command from the project root:
   ```bash
   vsce package
   ```
3. A file named `pkl-viewer-1.0.0.vsix` will be generated in your project root!
4. Install it locally by opening the Command Palette (`Ctrl+Shift+P`), typing `Extensions: Install from VSIX...`, and selecting your generated file.

### 2. VS Code Marketplace publishing commands
To publish your VSIX directly to the Visual Studio Code Marketplace using command lines:
```bash
# Log in to your publisher account (input your DevOps PAT when prompted)
vsce login <YOUR_PUBLISHER_ID>

# Publish the extension
vsce publish
```

---

## 🛡️ Security Warnings & Trust

Because pickles can execute arbitrary code upon unpickling, **never load `.pkl` files from untrusted sources**. 

Pickle Viewer warns you on first load and requires explicit click confirmation. If you cancel, unpickling is blocked entirely, but you can still safely inspect the file's raw byte stream inside our **Hex Inspector** or inspect imports inside the **Security Audit** tab because neither action executes Python bytecode!

---

## 🧬 Scientific Support Metrics
*   **Lists/Tuples/Sets**: Truncated initially based on your `pklViewer.maxListLength` setting to preserve UI responsiveness. Items can be lazy loaded via a click.
*   **NumPy Ndarray**: Auto-calculates bounds and aggregates statistics in seconds.
*   **Pandas DataFrame**: Captures indices, datatypes, and renders rows with header support. Column statistics are calculated automatically using `pandas.DataFrame.describe()`.
