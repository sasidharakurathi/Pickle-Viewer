(function() {
    const vscode = acquireVsCodeApi();
    
    // Application State
    let state = vscode.getState() || {
        activeTab: 'tab-explorer',
        pickleData: null,
        scanReport: null,
        dataFrames: {}, // Store dataframe nodes found during traversal
        selectedDfPath: '',
        hexLoaded: false,
        searchQuery: ''
    };

    // DOM Elements
    const body = document.body;
    const fileTitle = document.getElementById('file-title');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Explorer Elements
    const treeContainer = document.getElementById('tree-container');
    const treeSearch = document.getElementById('tree-search');
    const searchMatches = document.getElementById('search-matches');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const btnExpandAll = document.getElementById('btn-expand-all');
    const btnCollapseAll = document.getElementById('btn-collapse-all');
    
    // DataFrame Elements
    const dfSelector = document.getElementById('df-selector');
    const dfMetaSummary = document.getElementById('df-meta-summary');
    const dfTable = document.getElementById('df-table');
    const dfStatsContainer = document.getElementById('df-stats-container');
    
    // Hex Elements
    const hexViewport = document.getElementById('hex-viewport');
    
    // Security Elements
    const safetyBadge = document.getElementById('safety-badge');
    const securitySummaryTitle = document.getElementById('security-summary-title');
    const securitySummaryDesc = document.getElementById('security-summary-desc');
    const statusExecutionOpcodes = document.getElementById('status-execution-opcodes');
    const metaFilename = document.getElementById('meta-filename');
    const metaFilesize = document.getElementById('meta-filesize');
    const metaScanStatus = document.getElementById('meta-scan-status');
    const securityImportsList = document.getElementById('security-imports-list');
    
    // Overlay Elements
    const statusOverlay = document.getElementById('status-overlay');
    const overlaySpinner = document.getElementById('overlay-spinner');
    const overlayIcon = document.getElementById('overlay-icon');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayMsg = document.getElementById('overlay-msg');
    const overlayActions = document.getElementById('overlay-actions');
    const btnOverlayTrust = document.getElementById('btn-overlay-trust');
    const overlayErrorDetails = document.getElementById('overlay-error-details');
    const overlayTraceback = document.getElementById('overlay-traceback');

    // Header buttons
    const btnExportJson = document.getElementById('btn-export-json');
    const btnExportSchema = document.getElementById('btn-export-schema');

    // Setup Event Listeners
    function init() {
        // Tab switching
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                switchTab(tabId);
            });
        });

        // Search in Tree
        treeSearch.addEventListener('input', (e) => {
            handleSearch(e.target.value);
        });

        btnClearSearch.addEventListener('click', () => {
            treeSearch.value = '';
            handleSearch('');
        });

        btnExpandAll.addEventListener('click', () => {
            expandAllNodes();
        });

        btnCollapseAll.addEventListener('click', () => {
            collapseAllNodes();
        });

        // DataFrame switching
        dfSelector.addEventListener('change', (e) => {
            const dfPath = e.target.value;
            switchDataFrame(dfPath);
        });

        // Trust Action
        btnOverlayTrust.addEventListener('click', () => {
            vscode.postMessage({ type: 'requestTrust' });
        });

        // Export Actions
        btnExportJson.addEventListener('click', () => {
            if (state.pickleData) {
                vscode.postMessage({ type: 'exportJson', data: state.pickleData });
            }
        });

        btnExportSchema.addEventListener('click', () => {
            if (state.pickleData) {
                vscode.postMessage({ type: 'exportSchema', data: state.pickleData });
            }
        });

        // Inform extension Webview is ready
        vscode.postMessage({ type: 'ready' });

        // Restore active tab
        if (state.activeTab) {
            switchTab(state.activeTab);
        }
    }

    // Message handler from Extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'status':
                updateStatusOverlay(message);
                break;
            case 'scanReport':
                renderSecurityReport(message.report);
                break;
            case 'data':
                state.pickleData = message.data;
                saveState();
                renderExplorer();
                break;
            case 'hexData':
                state.hexLoaded = true;
                saveState();
                if (window.HexView && typeof window.HexView.init === 'function') {
                    window.HexView.init(message.base64);
                }
                break;
            case 'hexError':
                hexViewport.innerText = `Error loading binary hex data: ${message.error}`;
                break;
            case 'error':
                showOverlayError(message.error, message.traceback);
                break;
            case 'subPathResult':
                handleSubPathLoaded(message.path, message.result);
                break;
        }
    });

    // Save state to VS Code
    function saveState() {
        vscode.setState(state);
    }

    // Tab switcher
    function switchTab(tabId) {
        state.activeTab = tabId;
        saveState();

        tabButtons.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        tabContents.forEach(content => {
            if (content.id === tabId) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // Lazy load hex view data only when first clicked
        if (tabId === 'tab-hex' && !state.hexLoaded) {
            vscode.postMessage({ type: 'loadHex' });
        }
    }

    // Progress state overlay controller
    function updateStatusOverlay(msg) {
        overlayActions.classList.add('hide');
        overlayErrorDetails.classList.add('hide');
        
        // Default state: show spinner, hide custom icon
        overlaySpinner.classList.remove('hide');
        overlayIcon.classList.add('hide');
        overlayIcon.innerText = '';

        switch (msg.status) {
            case 'scanning':
                body.classList.add('loading-state');
                overlayTitle.innerText = "Analyzing file structure...";
                overlayMsg.innerText = "Scanning pickle bytecode statically for security safety.";
                fileTitle.innerText = msg.filename || "Pickle File";
                state.dataFrames = {};
                dfSelector.innerHTML = '<option value="">-- Click a DataFrame in the Tree --</option>';
                break;
            case 'waiting_for_trust':
                body.classList.add('loading-state');
                overlaySpinner.classList.add('hide');
                overlayIcon.innerText = "🛡️";
                overlayIcon.classList.remove('hide');
                overlayTitle.innerText = "Security Authorization Required";
                overlayMsg.innerText = "Pickle files can run arbitrary code. Review the 'Security Audit' tab or click the button below to authorize loading this file.";
                overlayActions.classList.remove('hide');
                break;
            case 'blocked':
                body.classList.add('loading-state');
                overlaySpinner.classList.add('hide');
                overlayIcon.innerText = "🔒";
                overlayIcon.classList.remove('hide');
                overlayTitle.innerText = "File Loading Blocked";
                overlayMsg.innerText = msg.reason || "Review permission to inspect this file.";
                overlayActions.classList.remove('hide');
                break;
            case 'loading':
                body.classList.add('loading-state');
                overlayTitle.innerText = "Unpickling dataset...";
                overlayMsg.innerText = "Safely reconstructing variables and serializing scientific datatypes.";
                break;
            case 'loaded':
                body.classList.remove('loading-state');
                statusOverlay.classList.add('hide');
                break;
            case 'error':
                body.classList.add('loading-state');
                overlaySpinner.classList.add('hide');
                overlayIcon.innerText = "💥";
                overlayIcon.classList.remove('hide');
                break;
        }
    }

    function showOverlayError(err, traceback) {
        overlaySpinner.classList.add('hide');
        overlayIcon.innerText = "💥";
        overlayIcon.classList.remove('hide');
        overlayTitle.innerText = "Unpickling Crashed";
        overlayMsg.innerText = err || "An error occurred while running python backend.";
        if (traceback) {
            overlayErrorDetails.classList.remove('hide');
            overlayTraceback.innerText = traceback;
        }
    }

    // Security Dashboard Renderer
    function renderSecurityReport(report) {
        state.scanReport = report;
        saveState();

        const formattedSize = formatBytes(report.file_size);
        metaFilename.innerText = fileTitle.innerText;
        metaFilesize.innerText = formattedSize;
        metaScanStatus.innerText = report.success ? "Successfully Audited" : "Scan Error";

        // Risk rating rules
        let riskRating = 'LOW RISK';
        let riskClass = 'low-risk';
        let riskDesc = 'No executable instructions or imports identified statically. This file functions as a pure data container.';
        
        // Dangerous import keywords
        const dangerKeywords = ['os', 'sys', 'subprocess', 'posix', 'nt', 'builtin', 'builtins', 'eval', 'exec', 'socket'];
        const flaggedImports = [];

        report.imports.forEach(imp => {
            const lowerImp = imp.toLowerCase();
            const isDanger = dangerKeywords.some(kw => lowerImp.includes(kw));
            if (isDanger) flaggedImports.push(imp);
        });

        if (report.has_execution_opcodes) {
            if (flaggedImports.length > 0) {
                riskRating = 'HIGH RISK';
                riskClass = 'high-risk';
                riskDesc = `⚠️ CRITICAL: Bytecode execution triggers (REDUCE/BUILD) are present and flagged system imports (${flaggedImports.join(', ')}) were detected. Loading this file could execute malicious software.`;
            } else {
                riskRating = 'MEDIUM RISK';
                riskClass = 'medium-risk';
                riskDesc = '⚠️ CAUTION: The file contains code execution opcodes (REDUCE/BUILD) to instantiate custom Python classes. Load only if you trust the source.';
            }
        }

        // Apply risk classes to summary cards
        const summaryCard = document.querySelector('.security-summary-card');
        summaryCard.className = `security-summary-card ${riskClass}`;
        
        safetyBadge.innerText = riskRating;
        safetyBadge.className = `safety-badge ${riskClass}`;
        securitySummaryTitle.innerText = `${riskRating} Alert`;
        securitySummaryDesc.innerText = riskDesc;

        // Bytecode execution card
        if (report.has_execution_opcodes) {
            statusExecutionOpcodes.innerHTML = '<span class="status-dot red"></span> Vulnerable (Execution bytecode present)';
        } else {
            statusExecutionOpcodes.innerHTML = '<span class="status-dot green"></span> Safe (Pure structured variables)';
        }

        // Populate imports list
        securityImportsList.innerHTML = '';
        if (report.imports.length === 0) {
            securityImportsList.innerHTML = '<li class="empty-list">No python imports or custom classes detected statically.</li>';
        } else {
            report.imports.forEach(imp => {
                const li = document.createElement('li');
                li.innerText = imp;
                
                const lowerImp = imp.toLowerCase();
                const isDanger = dangerKeywords.some(kw => lowerImp.includes(kw));
                if (isDanger) {
                    li.classList.add('danger-import');
                    li.innerHTML = `⚠️ DANGEROUS: <code>${imp}</code>`;
                }
                securityImportsList.appendChild(li);
            });
        }
    }

    // Discover all DataFrames in the pickle structure recursively
    function discoverDataFrames(val, path) {
        if (val === null || typeof val !== 'object') {
            return;
        }

        if ('__pkl_type__' in val) {
            const pklType = val.__pkl_type__;
            if (pklType === 'dataframe') {
                const pathStr = JSON.stringify(path);
                state.dataFrames[pathStr] = val;
                return;
            }
            if (pklType === 'list' || pklType === 'tuple' || pklType === 'set') {
                if (val.values) {
                    val.values.forEach((v, idx) => discoverDataFrames(v, [...path, idx.toString()]));
                }
                return;
            }
            if (pklType === 'object') {
                if (val.attributes) {
                    Object.keys(val.attributes).forEach(attrName => {
                        discoverDataFrames(val.attributes[attrName], [...path, attrName]);
                    });
                }
                return;
            }
            if (pklType === 'model') {
                if (val.learned_parameters) {
                    Object.keys(val.learned_parameters).forEach(pName => {
                        discoverDataFrames(val.learned_parameters[pName], [...path, 'learned_parameters', pName]);
                    });
                }
                if (val.attributes) {
                    Object.keys(val.attributes).forEach(attrName => {
                        discoverDataFrames(val.attributes[attrName], [...path, attrName]);
                    });
                }
                return;
            }
        } else {
            // Standard dictionary
            Object.keys(val).forEach(key => {
                if (key !== '__pkl_truncated__' && key !== '__pkl_total_keys__') {
                    discoverDataFrames(val[key], [...path, key]);
                }
            });
        }
    }

    // Populate the DataFrame dropdown selector
    function populateDataFrameSelector() {
        dfSelector.innerHTML = '';
        const paths = Object.keys(state.dataFrames);
        if (paths.length === 0) {
            dfSelector.innerHTML = '<option value="">-- No DataFrames found in file --</option>';
            return;
        }
        
        dfSelector.innerHTML = '<option value="">-- Select DataFrame --</option>';
        paths.forEach(pathStr => {
            const val = state.dataFrames[pathStr];
            const path = JSON.parse(pathStr);
            const label = path.length > 0 ? path.join('.') : 'root';
            const shapeStr = `(${val.shape[0]}x${val.shape[1]})`;
            
            const opt = document.createElement('option');
            opt.value = pathStr;
            opt.innerText = `${label} ${shapeStr}`;
            dfSelector.appendChild(opt);
        });
    }

    // Auto-select and display the first DataFrame by default
    function autoSelectFirstDataFrame() {
        const paths = Object.keys(state.dataFrames);
        if (paths.length > 0) {
            const firstPath = paths[0];
            if (!state.selectedDfPath || !state.dataFrames[state.selectedDfPath]) {
                state.selectedDfPath = firstPath;
                saveState();
            }
            dfSelector.value = state.selectedDfPath;
            switchDataFrame(state.selectedDfPath);
        } else {
            state.selectedDfPath = '';
            saveState();
            switchDataFrame('');
        }
    }

    // Explorer Tree Rendering
    function renderExplorer() {
        if (!state.pickleData) {
            treeContainer.innerHTML = '<div class="no-stats-placeholder">No variables loaded.</div>';
            return;
        }
        treeContainer.innerHTML = '';
        state.dataFrames = {}; // reset
        
        // Discover all DataFrames, populate selector dropdown, and auto-select first DataFrame
        discoverDataFrames(state.pickleData, []);
        populateDataFrameSelector();
        autoSelectFirstDataFrame();

        // Render root variables
        const root = renderNode("root", state.pickleData, []);
        treeContainer.appendChild(root);
        
        // Restore search query if present
        if (state.searchQuery) {
            treeSearch.value = state.searchQuery;
            handleSearch(state.searchQuery);
        }
    }

    function renderNode(key, val, path) {
        const node = document.createElement('div');
        node.className = 'tree-node';
        node.dataset.path = JSON.stringify(path);

        const item = document.createElement('div');
        item.className = 'tree-item';
        
        const chevron = document.createElement('span');
        chevron.className = 'tree-chevron empty';
        chevron.innerText = '▶';
        item.appendChild(chevron);

        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.innerText = key + ':';
        item.appendChild(keySpan);

        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value';
        item.appendChild(valueSpan);

        node.appendChild(item);

        // Helper to configure toggles
        function setupCollapsible(badgeText, badgeClass, renderChildrenFn) {
            chevron.className = 'tree-chevron';
            const badge = document.createElement('span');
            badge.className = `type-badge ${badgeClass}`;
            badge.innerText = badgeText;
            item.insertBefore(badge, keySpan.nextSibling);

            let childrenContainer = null;
            let loaded = false;

            item.addEventListener('click', (e) => {
                // Prevent toggle on text selections or button clicks inside
                if (e.target.tagName === 'BUTTON' || window.getSelection().toString() !== '') {
                    return;
                }

                if (!loaded) {
                    childrenContainer = document.createElement('div');
                    childrenContainer.className = 'tree-children hide';
                    renderChildrenFn(childrenContainer);
                    node.appendChild(childrenContainer);
                    loaded = true;
                }

                const isExpanded = chevron.classList.toggle('expanded');
                childrenContainer.classList.toggle('hide', !isExpanded);
            });
        }

        // Determine value rendering based on metadata types
        if (val === null) {
            valueSpan.innerText = 'None';
            valueSpan.style.color = 'var(--vscode-symbolIcon-keywordForeground, #56b6c2)';
        } 
        else if (typeof val !== 'object') {
            valueSpan.innerText = JSON.stringify(val);
            if (typeof val === 'number') {
                valueSpan.style.color = 'var(--vscode-symbolIcon-numberForeground, #d19a66)';
            } else if (typeof val === 'boolean') {
                valueSpan.style.color = 'var(--vscode-symbolIcon-booleanForeground, #56b6c2)';
            } else {
                valueSpan.style.color = 'var(--vscode-symbolIcon-stringForeground, #98c379)';
            }
        } 
        else if ('__pkl_type__' in val) {
            const pklType = val.__pkl_type__;
            
            if (pklType === 'ndarray' || pklType === 'tensor') {
                const shapeStr = `(${val.shape.join(', ')})`;
                valueSpan.innerText = `${shapeStr} [${val.dtype}]`;
                
                setupCollapsible(pklType, 'ndarray', (container) => {
                    // Render NDArray metadata details
                    const metaTable = document.createElement('div');
                    metaTable.className = 'tree-node monospace';
                    metaTable.style.padding = '8px';
                    metaTable.style.fontSize = '11px';
                    metaTable.style.color = 'var(--vscode-foreground, rgba(255,255,255,0.6))';
                    
                    let summaryHtml = `Shape: ${shapeStr}<br>Dtype: ${val.dtype}<br>Size: ${val.size}`;
                    if (val.device) summaryHtml += `<br>Device: ${val.device}`;
                    if (val.requires_grad !== undefined) summaryHtml += `<br>Requires Grad: ${val.requires_grad}`;
                    
                    if (val.summary && Object.keys(val.summary).length > 0) {
                        summaryHtml += `<br>Range: [${val.summary.min}, ${val.summary.max}] | Mean: ${val.summary.mean}`;
                    }
                    
                    metaTable.innerHTML = summaryHtml;
                    container.appendChild(metaTable);

                    // Image preview inside array!
                    if (val.image) {
                        const imgDiv = document.createElement('div');
                        imgDiv.className = 'tree-image-preview';
                        
                        const img = document.createElement('img');
                        img.src = `data:image/png;base64,${val.image}`;
                        imgDiv.appendChild(img);

                        const meta = document.createElement('span');
                        meta.className = 'image-meta monospace';
                        meta.innerText = `Image Gradient Preview (${val.shape[1]}x${val.shape[0]})`;
                        imgDiv.appendChild(meta);

                        container.appendChild(imgDiv);
                    }

                    // Render flattened values grid
                    if (val.preview && val.preview.length > 0) {
                        const previewLabel = document.createElement('div');
                        previewLabel.className = 'tree-key';
                        previewLabel.innerText = 'Preview:';
                        container.appendChild(previewLabel);
                        
                        const previewContainer = document.createElement('div');
                        previewContainer.className = 'tree-value monospace';
                        previewContainer.style.maxHeight = '100px';
                        previewContainer.style.overflowY = 'auto';
                        previewContainer.style.padding = '6px';
                        previewContainer.style.background = 'rgba(0,0,0,0.15)';
                        previewContainer.style.borderRadius = '4px';
                        
                        previewContainer.innerText = `[${val.preview.join(', ')}${val.size > 100 ? '...' : ''}]`;
                        container.appendChild(previewContainer);
                    }
                });
            } 
            else if (pklType === 'dataframe') {
                const shapeStr = `(${val.shape.join(', ')})`;
                valueSpan.innerText = `${shapeStr}`;
                const pathStr = JSON.stringify(path);

                setupCollapsible('dataframe', 'dataframe', (container) => {
                    const desc = document.createElement('div');
                    desc.style.padding = '8px';
                    desc.style.display = 'flex';
                    desc.style.flexDirection = 'column';
                    desc.style.gap = '8px';

                    const meta = document.createElement('div');
                    meta.className = 'monospace';
                    meta.style.fontSize = '11px';
                    meta.innerHTML = `Shape: ${shapeStr}<br>Columns: [${val.columns.join(', ')}]`;
                    desc.appendChild(meta);

                    const btnOpen = document.createElement('button');
                    btnOpen.className = 'btn primary small';
                    btnOpen.innerText = '📊 Inspect in DataFrame Viewer';
                    btnOpen.addEventListener('click', () => {
                        dfSelector.value = pathStr;
                        switchDataFrame(pathStr);
                        switchTab('tab-dataframe');
                    });
                    desc.appendChild(btnOpen);

                    container.appendChild(desc);
                });
            } 
            else if (pklType === 'image') {
                const sizeStr = `${val.size[0]}x${val.size[1]}`;
                valueSpan.innerText = `${sizeStr} [${val.format}]`;

                setupCollapsible('image', 'image', (container) => {
                    const imgDiv = document.createElement('div');
                    imgDiv.className = 'tree-image-preview';
                    
                    const img = document.createElement('img');
                    img.src = `data:image/png;base64,${val.image}`;
                    imgDiv.appendChild(img);

                    const meta = document.createElement('span');
                    meta.className = 'image-meta monospace';
                    meta.innerText = `${val.format} format image (${sizeStr})`;
                    imgDiv.appendChild(meta);

                    container.appendChild(imgDiv);
                });
            } 
            else if (pklType === 'audio') {
                const shapeStr = val.shape && val.shape.length > 0 ? `(${val.shape.join(', ')})` : '';
                valueSpan.innerText = `${shapeStr} [${val.sample_rate || 'raw'} Hz]`;

                setupCollapsible('audio', 'audio', (container) => {
                    const audioDiv = document.createElement('div');
                    audioDiv.style.padding = '8px';
                    audioDiv.style.display = 'flex';
                    audioDiv.style.flexDirection = 'column';
                    audioDiv.style.gap = '6px';

                    const meta = document.createElement('div');
                    meta.className = 'monospace';
                    meta.style.fontSize = '11px';
                    meta.innerHTML = `Format: ${val.format}<br>Sample Rate: ${val.sample_rate || 'unknown'} Hz${val.shape ? '<br>Shape: ' + shapeStr : ''}`;
                    audioDiv.appendChild(meta);

                    const audio = document.createElement('audio');
                    audio.controls = true;
                    const mime = val.format === 'MP3' ? 'audio/mp3' : 'audio/wav';
                    audio.src = `data:${mime};base64,${val.audio}`;
                    audio.style.width = '100%';
                    audio.style.marginTop = '4px';
                    audioDiv.appendChild(audio);

                    container.appendChild(audioDiv);
                });
            }
            else if (pklType === 'video') {
                if (val.is_raw_bytes) {
                    valueSpan.innerText = `[${val.format}]`;

                    setupCollapsible('video', 'video', (container) => {
                        const videoDiv = document.createElement('div');
                        videoDiv.className = 'tree-image-preview';
                        videoDiv.style.maxWidth = '400px';

                        const video = document.createElement('video');
                        video.controls = true;
                        video.muted = true;
                        video.autoplay = true;
                        video.loop = true;
                        const mime = val.format === 'WEBM' ? 'video/webm' : (val.format === 'OGG' ? 'video/ogg' : 'video/mp4');
                        video.src = `data:${mime};base64,${val.video}`;
                        video.style.width = '100%';
                        video.style.borderRadius = 'var(--border-radius-sm)';
                        videoDiv.appendChild(video);

                        const meta = document.createElement('span');
                        meta.className = 'image-meta monospace';
                        meta.innerText = `Raw ${val.format} Video File`;
                        videoDiv.appendChild(meta);

                        container.appendChild(videoDiv);
                    });
                } else {
                    const shapeStr = `(${val.shape.join(', ')})`;
                    valueSpan.innerText = `${shapeStr}`;

                    setupCollapsible('video', 'video', (container) => {
                        const videoDiv = document.createElement('div');
                        videoDiv.className = 'tree-image-preview';
                        
                        const img = document.createElement('img');
                        img.src = `data:image/gif;base64,${val.video}`;
                        videoDiv.appendChild(img);

                        const meta = document.createElement('span');
                        meta.className = 'image-meta monospace';
                        meta.innerText = `Looped Video Preview (${val.shape[0]} frames, ${val.shape[2]}x${val.shape[1]})`;
                        videoDiv.appendChild(meta);

                        container.appendChild(videoDiv);
                    });
                }
            }
            else if (pklType === 'plot') {
                valueSpan.innerText = `Matplotlib Chart`;

                setupCollapsible('plot', 'plot', (container) => {
                    const plotDiv = document.createElement('div');
                    plotDiv.className = 'tree-image-preview';
                    plotDiv.style.maxWidth = '100%';
                    
                    const img = document.createElement('img');
                    img.src = `data:image/png;base64,${val.image}`;
                    img.style.maxHeight = '400px';
                    plotDiv.appendChild(img);

                    const meta = document.createElement('span');
                    meta.className = 'image-meta monospace';
                    meta.innerText = `Matplotlib Figure Plot (${val.width}x${val.height})`;
                    plotDiv.appendChild(meta);

                    container.appendChild(plotDiv);
                });
            }
            else if (pklType === 'model') {
                valueSpan.innerText = `${val.class}`;

                setupCollapsible(val.framework === 'pytorch' ? 'pytorch model' : 'scikit-learn model', 'model', (container) => {
                    const modelDiv = document.createElement('div');
                    modelDiv.style.padding = '8px';
                    modelDiv.style.display = 'flex';
                    modelDiv.style.flexDirection = 'column';
                    modelDiv.style.gap = '8px';

                    const meta = document.createElement('div');
                    meta.className = 'monospace';
                    meta.style.fontSize = '11px';
                    meta.style.color = 'var(--vscode-symbolIcon-keywordForeground, #56b6c2)';
                    meta.innerHTML = `Framework: ${val.framework || 'unknown'}<br>Class: ${val.class}<br>Parameters: ${val.total_params.toLocaleString()}`;
                    modelDiv.appendChild(meta);

                    container.appendChild(modelDiv);

                    // PyTorch specific layers
                    if (val.framework === 'pytorch' && Object.keys(val.submodules).length > 0) {
                        const layersLabel = document.createElement('div');
                        layersLabel.className = 'tree-key';
                        layersLabel.innerText = '🍰 Submodules / Layers:';
                        layersLabel.style.marginTop = '6px';
                        container.appendChild(layersLabel);

                        const layersContainer = document.createElement('div');
                        layersContainer.className = 'tree-children';
                        layersContainer.style.background = 'rgba(0,0,0,0.15)';
                        layersContainer.style.padding = '6px';
                        layersContainer.style.borderRadius = '4px';

                        Object.keys(val.submodules).forEach(layerName => {
                            const sub = val.submodules[layerName];
                            const child = document.createElement('div');
                            child.className = 'tree-node';
                            child.style.fontSize = '11px';
                            child.innerHTML = `<span class="tree-key">${layerName}:</span> <span class="tree-value">${sub.class.split('.').pop()} (params: ${sub.params_count.toLocaleString()})</span>`;
                            layersContainer.appendChild(child);
                        });
                        container.appendChild(layersContainer);
                    }

                    // Scikit-Learn learned attributes
                    if (val.framework === 'scikit-learn' && Object.keys(val.learned_parameters).length > 0) {
                        const learnedLabel = document.createElement('div');
                        learnedLabel.className = 'tree-key';
                        learnedLabel.innerText = '✨ Learned Parameters:';
                        learnedLabel.style.marginTop = '6px';
                        container.appendChild(learnedLabel);

                        const learnedContainer = document.createElement('div');
                        learnedContainer.className = 'tree-children';
                        Object.keys(val.learned_parameters).forEach(pName => {
                            const child = renderNode(pName, val.learned_parameters[pName], [...path, 'learned_parameters', pName]);
                            learnedContainer.appendChild(child);
                        });
                        container.appendChild(learnedContainer);
                    }

                    // General object attributes
                    if (Object.keys(val.attributes).length > 0) {
                        const attrsLabel = document.createElement('div');
                        attrsLabel.className = 'tree-key';
                        attrsLabel.innerText = '📂 Attributes:';
                        attrsLabel.style.marginTop = '6px';
                        container.appendChild(attrsLabel);

                        const attrsContainer = document.createElement('div');
                        attrsContainer.className = 'tree-children';
                        Object.keys(val.attributes).forEach(attrName => {
                            const child = renderNode(attrName, val.attributes[attrName], [...path, attrName]);
                            attrsContainer.appendChild(child);
                        });
                        container.appendChild(attrsContainer);
                    }
                });
            }
            else if (pklType === 'list' || pklType === 'tuple' || pklType === 'set') {
                valueSpan.innerText = `length: ${val.length}`;
                
                setupCollapsible(pklType, 'list', (container) => {
                    val.values.forEach((itemVal, idx) => {
                        const child = renderNode(idx.toString(), itemVal, [...path, idx.toString()]);
                        container.appendChild(child);
                    });

                    if (val.length > val.values.length) {
                        const btnLazy = document.createElement('button');
                        btnLazy.className = 'btn secondary small btn-lazy-load';
                        btnLazy.innerText = `Load more items... (Total: ${val.length})`;
                        
                        btnLazy.addEventListener('click', () => {
                            btnLazy.classList.add('disabled');
                            btnLazy.innerText = 'Loading...';
                            vscode.postMessage({
                                type: 'requestSubPath',
                                path: JSON.stringify(path)
                            });
                        });
                        container.appendChild(btnLazy);
                    }
                });
            } 
            else if (pklType === 'bytes') {
                valueSpan.innerText = `length: ${val.length}`;
                setupCollapsible('bytes', 'bytes', (container) => {
                    const rawHex = document.createElement('div');
                    rawHex.className = 'tree-value monospace';
                    rawHex.style.padding = '8px';
                    rawHex.style.background = 'rgba(0,0,0,0.15)';
                    rawHex.style.borderRadius = '4px';
                    rawHex.innerText = `Hex Preview:\n${val.preview}`;
                    container.appendChild(rawHex);
                });
            } 
            else if (pklType === 'object') {
                valueSpan.innerText = `${val.class}`;

                setupCollapsible(val.is_mock ? 'unresolved class' : 'object', 'object', (container) => {
                    const meta = document.createElement('div');
                    meta.className = 'monospace';
                    meta.style.padding = '6px';
                    meta.style.fontSize = '11px';
                    meta.style.color = 'var(--vscode-foreground, rgba(255,255,255,0.4))';
                    meta.innerHTML = `Class: ${val.class}<br>Repr: <code>${val.repr}</code>`;
                    container.appendChild(meta);

                    if (val.state_repr) {
                        const stateDiv = document.createElement('div');
                        stateDiv.className = 'tree-node';
                        stateDiv.innerHTML = `<span class="tree-key">State Value:</span><span class="tree-value">${val.state_repr}</span>`;
                        container.appendChild(stateDiv);
                    }

                    // Render sub-attributes
                    Object.keys(val.attributes).forEach(attrName => {
                        const child = renderNode(attrName, val.attributes[attrName], [...path, attrName]);
                        container.appendChild(child);
                    });
                });
            }
        } 
        else {
            // Standard dictionary object
            const keys = Object.keys(val).filter(k => k !== '__pkl_truncated__' && k !== '__pkl_total_keys__');
            const totalKeys = val.__pkl_total_keys__ !== undefined ? val.__pkl_total_keys__ : keys.length;
            valueSpan.innerText = `keys: ${totalKeys}`;

            setupCollapsible('dict', 'dict', (container) => {
                keys.forEach(childKey => {
                    const child = renderNode(childKey, val[childKey], [...path, childKey]);
                    container.appendChild(child);
                });

                if (val.__pkl_truncated__) {
                    const btnLazy = document.createElement('button');
                    btnLazy.className = 'btn secondary small btn-lazy-load';
                    btnLazy.innerText = `Load more keys... (Total: ${totalKeys})`;
                    
                    btnLazy.addEventListener('click', () => {
                        btnLazy.classList.add('disabled');
                        btnLazy.innerText = 'Loading...';
                        vscode.postMessage({
                            type: 'requestSubPath',
                            path: JSON.stringify(path)
                        });
                    });
                    container.appendChild(btnLazy);
                }
            });
        }

        return node;
    }

    // Handle Lazy Loaded SubPath chunks
    function handleSubPathLoaded(pathStr, result) {
        const path = JSON.parse(pathStr);
        if (!result.success) {
            vscode.window.showErrorMessage(`Failed to lazy load subpath: ${result.error}`);
            return;
        }

        // Find the node element matching the path
        const matchingNode = findNodeByPath(pathStr);
        if (!matchingNode) return;

        // Re-compile subpath value
        // Note: For simplicity we can update our parent state and trigger full tree rerender,
        // or replace just this node. Replacing in state and rerendering tree preserves state!
        updateStateAtSubPath(state.pickleData, path, result.data);
        saveState();
        renderExplorer();
    }

    function findNodeByPath(pathStr) {
        const nodes = document.querySelectorAll('.tree-node');
        for (const n of nodes) {
            if (n.dataset.path === pathStr) return n;
        }
        return null;
    }

    function updateStateAtSubPath(obj, pathList, newData) {
        let current = obj;
        for (let i = 0; i < pathList.length - 1; i++) {
            const key = pathList[i];
            if (current.__pkl_type__ && current.values) {
                current = current.values[parseInt(key)];
            } else if (current.__pkl_type__ && current.attributes) {
                current = current.attributes[key];
            } else {
                current = current[key];
            }
        }

        const lastKey = pathList[pathList.length - 1];
        if (current.__pkl_type__ && current.values) {
            // Replaced lazy structure
            if (newData.__pkl_type__ && (newData.__pkl_type__ === 'list' || newData.__pkl_type__ === 'tuple')) {
                current.values = newData.values;
            }
        } else if (current.__pkl_type__ && current.attributes) {
            current.attributes[lastKey] = newData;
        } else {
            // Dictionary
            // Merge loaded keys
            if (typeof newData === 'object' && !('__pkl_type__' in newData)) {
                // Remove truncation flag and merge keys
                delete current.__pkl_truncated__;
                delete current.__pkl_total_keys__;
                Object.assign(current, newData);
            } else {
                current[lastKey] = newData;
            }
        }
    }

    // Helper to recursively expand a node and all its dynamically created children
    function expandNodeRecursively(nodeElement) {
        const chevron = nodeElement.querySelector('.tree-item > .tree-chevron');
        if (chevron && !chevron.classList.contains('empty')) {
            if (!chevron.classList.contains('expanded')) {
                chevron.click(); // Triggers lazy rendering of children
            }
            
            const childrenContainer = nodeElement.querySelector('.tree-children');
            if (childrenContainer) {
                const nestedNodes = childrenContainer.querySelectorAll(':scope > .tree-node');
                nestedNodes.forEach(childNode => {
                    expandNodeRecursively(childNode);
                });
            }
        }
    }

    // Helper to recursively collapse a node and all its sub-elements
    function collapseNodeRecursively(nodeElement) {
        const childrenContainer = nodeElement.querySelector('.tree-children');
        if (childrenContainer) {
            const nestedNodes = childrenContainer.querySelectorAll(':scope > .tree-node');
            nestedNodes.forEach(childNode => {
                collapseNodeRecursively(childNode);
            });
        }

        const chevron = nodeElement.querySelector('.tree-item > .tree-chevron');
        if (chevron && !chevron.classList.contains('empty') && chevron.classList.contains('expanded')) {
            chevron.click(); // Collapses the node
        }
    }

    // Expand/Collapse operations
    function expandAllNodes() {
        const rootNodes = treeContainer.querySelectorAll(':scope > .tree-node');
        rootNodes.forEach(node => {
            expandNodeRecursively(node);
        });
    }

    function collapseAllNodes() {
        const rootNodes = treeContainer.querySelectorAll(':scope > .tree-node');
        rootNodes.forEach(node => {
            collapseNodeRecursively(node);
        });
    }

    // Key search engine
    function handleSearch(query) {
        state.searchQuery = query;
        saveState();

        const cleanQuery = query.trim().toLowerCase();
        
        if (cleanQuery === '') {
            searchMatches.classList.add('hide');
            btnClearSearch.classList.add('hide');
            
            // Remove matching classes
            document.querySelectorAll('.tree-item.matched').forEach(n => n.classList.remove('matched'));
            document.querySelectorAll('.tree-value-highlight').forEach(n => {
                n.replaceWith(document.createTextNode(n.innerText));
            });
            return;
        }

        searchMatches.classList.remove('hide');
        btnClearSearch.classList.remove('hide');

        let matchCount = 0;
        const treeItems = document.querySelectorAll('.tree-item');

        treeItems.forEach(item => {
            const keySpan = item.querySelector('.tree-key');
            const valSpan = item.querySelector('.tree-value');
            
            const keyText = keySpan ? keySpan.innerText.toLowerCase() : '';
            const valText = valSpan ? valSpan.innerText.toLowerCase() : '';
            
            const keyMatched = keyText.includes(cleanQuery);
            const valMatched = valText.includes(cleanQuery);

            if (keyMatched || valMatched) {
                item.classList.add('matched');
                matchCount++;
                
                // Highlight inside values
                if (valSpan && valSpan.innerText && valMatched) {
                    const originalValText = valSpan.innerText;
                    const regex = new RegExp(`(${escapeRegExp(cleanQuery)})`, 'gi');
                    valSpan.innerHTML = originalValText.replace(regex, '<span class="tree-value-highlight">$1</span>');
                }

                // Automatically expand parents to show matches
                expandParents(item);
            } else {
                item.classList.remove('matched');
                // Remove existing highlights if any
                const highlights = item.querySelectorAll('.tree-value-highlight');
                highlights.forEach(h => h.replaceWith(document.createTextNode(h.innerText)));
            }
        });

        searchMatches.innerText = `${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
    }

    function expandParents(element) {
        let parentNode = element.closest('.tree-node').parentElement.closest('.tree-node');
        while (parentNode) {
            const parentChevron = parentNode.querySelector('.tree-item > .tree-chevron');
            const parentChildren = parentNode.querySelector('.tree-children');
            
            if (parentChevron && !parentChevron.classList.contains('expanded')) {
                parentChevron.classList.add('expanded');
                if (parentChildren) parentChildren.classList.remove('hide');
            }
            
            parentNode = parentNode.parentElement.closest('.tree-node');
        }
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // TAB 2: DATAFRAME VIEWER IMPLEMENTATION
    function switchDataFrame(dfPath) {
        state.selectedDfPath = dfPath;
        saveState();

        if (!dfPath) {
            dfTable.innerHTML = '<thead><tr><th>Select a DataFrame from the dropdown or click it in the Explorer.</th></tr></thead>';
            dfMetaSummary.innerText = 'Shape: -';
            dfStatsContainer.innerHTML = '<div class="no-stats-placeholder">Select a numerical column or DataFrame to view metrics.</div>';
            return;
        }

        const dfData = state.dataFrames[dfPath];
        if (!dfData) return;

        dfMetaSummary.innerText = `Shape: (${dfData.shape[0]} rows, ${dfData.shape[1]} cols)`;

        // 1. Render Table headers
        let tableHeaderHtml = '<tr><th class="index-col">Index</th>';
        dfData.columns.forEach(col => {
            const dtype = dfData.dtypes[col] || '';
            tableHeaderHtml += `<th>${col}<br><span class="col-type" style="font-size:9px; font-weight:normal; opacity:0.6;">${dtype}</span></th>`;
        });
        tableHeaderHtml += '</tr>';

        // 2. Render Table rows
        let tableBodyHtml = '';
        dfData.preview.forEach((row, rowIdx) => {
            const indexLabel = dfData.index[rowIdx] || rowIdx.toString();
            tableBodyHtml += `<tr><td class="index-col">${indexLabel}</td>`;
            row.forEach(cell => {
                let cellVal = cell;
                if (cell === null) cellVal = '<span style="opacity: 0.5;">None</span>';
                else if (typeof cell === 'object' && cell !== null && '__pkl_type__' in cell) {
                    // Truncated list/sub-object representation inside cell
                    cellVal = `<span class="monospace" style="color:var(--vscode-symbolIcon-fieldForeground);">${cell.__pkl_type__}</span>`;
                }
                tableBodyHtml += `<td>${cellVal}</td>`;
            });
            tableBodyHtml += '</tr>';
        });

        dfTable.innerHTML = `<thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody>`;

        // 3. Render Table statistics sidebar
        dfStatsContainer.innerHTML = '';
        if (dfData.stats && Object.keys(dfData.stats).length > 0) {
            Object.keys(dfData.stats).forEach(colName => {
                const stats = dfData.stats[colName];
                const card = document.createElement('div');
                card.className = 'column-stat-card';

                card.innerHTML = `
                    <div class="stat-header">
                        <h4>${colName}</h4>
                        <span class="col-type">${dfData.dtypes[colName] || 'numeric'}</span>
                    </div>
                    <div class="stat-grid">
                        <div class="stat-row"><span class="stat-name">count</span><span class="stat-val">${stats.count}</span></div>
                        <div class="stat-row"><span class="stat-name">mean</span><span class="stat-val">${formatStatVal(stats.mean)}</span></div>
                        <div class="stat-row"><span class="stat-name">std</span><span class="stat-val">${formatStatVal(stats.std)}</span></div>
                        <div class="stat-row"><span class="stat-name">min</span><span class="stat-val">${formatStatVal(stats.min)}</span></div>
                        <div class="stat-row"><span class="stat-name">50% (med)</span><span class="stat-val">${formatStatVal(stats['50%'])}</span></div>
                        <div class="stat-row"><span class="stat-name">max</span><span class="stat-val">${formatStatVal(stats.max)}</span></div>
                    </div>
                `;
                dfStatsContainer.appendChild(card);
            });
        } else {
            dfStatsContainer.innerHTML = '<div class="no-stats-placeholder">No column descriptive statistics available. Numerical columns are required.</div>';
        }
    }

    function formatStatVal(val) {
        if (val === null || val === undefined) return 'None';
        if (typeof val === 'number') {
            // Trim long floating representations in stats
            return val.toFixed(4).replace(/\.?0+$/, '');
        }
        return val;
    }

    // Helper: Formatter utilities
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Init script
    init();

})();
