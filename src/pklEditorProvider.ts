import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PythonRunner, ScanResult } from './pythonRunner';

class PklDocument implements vscode.CustomDocument {
    constructor(public readonly uri: vscode.Uri) {}
    dispose(): void {}
}

export class PklEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new PklEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(PklEditorProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false
        });
    }

    private static readonly viewType = 'pklViewer.pklEditor';
    private readonly workspaceTrustState = new Map<string, boolean>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return new PklDocument(uri);
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const webview = webviewPanel.webview;

        // Configure webview options
        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.dirname(document.uri.fsPath))
            ]
        };

        // Render loading / scan state first
        webview.html = this.getHtmlForWebview(webview);

        // Track user messages
        webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    // Webview is ready, trigger scan
                    await this.handleScan(document.uri, webviewPanel);
                    break;
                case 'requestTrust':
                    // User requested trust review again
                    await this.promptUserTrust(document.uri, webviewPanel);
                    break;
                case 'requestSubPath':
                    // Lazy load a sub-path
                    await this.handleSubPath(document.uri, message.path, webviewPanel);
                    break;
                case 'loadHex':
                    // User requested hex view data
                    await this.handleLoadHex(document.uri, webviewPanel);
                    break;
                case 'exportJson':
                    await this.handleExportJson(document.uri, message.data);
                    break;
                case 'exportSchema':
                    await this.handleExportSchema(document.uri, message.data);
                    break;
                case 'copyToClipboard':
                    await vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('Copied to clipboard!');
                    break;
            }
        });
    }

    private async handleScan(fileUri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
        const filePath = fileUri.fsPath;
        const filename = path.basename(filePath);
        
        // 1. Tell Webview we are scanning
        panel.webview.postMessage({
            type: 'status',
            status: 'scanning',
            filename
        });

        // 2. Run static scanner (Safe!)
        const scanResult = await PythonRunner.scanPickle(this.context.extensionUri, filePath);
        
        // 3. Send scan report to Webview
        panel.webview.postMessage({
            type: 'scanReport',
            report: scanResult
        });

        // 4. Check if file is already trusted in this workspace session
        const fileKey = fileUri.toString();
        if (this.workspaceTrustState.get(fileKey) === true) {
            // Already approved, proceed to load
            await this.loadPickleData(fileUri, panel);
        } else {
            // Prompt user for explicit trust
            panel.webview.postMessage({
                type: 'status',
                status: 'waiting_for_trust'
            });
            await this.promptUserTrust(fileUri, panel, scanResult);
        }
    }

    private async promptUserTrust(
        fileUri: vscode.Uri,
        panel: vscode.WebviewPanel,
        prefetchedScan?: ScanResult
    ): Promise<void> {
        const filePath = fileUri.fsPath;
        const filename = path.basename(filePath);
        
        const scanResult = prefetchedScan || await PythonRunner.scanPickle(this.context.extensionUri, filePath);
        
        let warningMessage = `Pickle files can execute arbitrary python code when loaded. Only open trusted files.\n\nFile: ${filename}`;
        if (scanResult.success) {
            if (scanResult.has_execution_opcodes) {
                warningMessage += `\n\n⚠️ CAUTION: This file contains byte-code execution instructions (REDUCE/BUILD) and imports: ${scanResult.imports.join(', ') || 'none'}`;
            } else {
                warningMessage += `\n\nℹ️ Static scan indicates this file is a pure data container (no code execution opcodes detected).`;
            }
        } else {
            warningMessage += `\n\n⚠️ Static analysis warning: ${scanResult.error || 'Unknown scan error'}`;
        }

        const trustButton = 'Trust and Open';

        const choice = await vscode.window.showWarningMessage(
            warningMessage,
            { modal: true },
            trustButton
        );

        if (choice === trustButton) {
            // Trust approved
            this.workspaceTrustState.set(fileUri.toString(), true);
            await this.loadPickleData(fileUri, panel);
        } else {
            // Cancelled
            panel.webview.postMessage({
                type: 'status',
                status: 'blocked',
                reason: 'Unpickling cancelled by user. Enable trust to inspect.'
            });
        }
    }

    private async loadPickleData(fileUri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
        panel.webview.postMessage({
            type: 'status',
            status: 'loading'
        });

        const config = vscode.workspace.getConfiguration('pklViewer');
        const maxListLen = config.get<number>('maxListLength') || 100;
        const maxDfRows = config.get<number>('maxDfRows') || 100;

        const parseResult = await PythonRunner.loadPickle(
            this.context.extensionUri,
            fileUri.fsPath,
            maxListLen,
            maxDfRows
        );

        if (parseResult.success) {
            panel.webview.postMessage({
                type: 'data',
                data: parseResult.data
            });
            panel.webview.postMessage({
                type: 'status',
                status: 'loaded'
            });
        } else {
            panel.webview.postMessage({
                type: 'error',
                error: parseResult.error || 'Failed to unpickle file.',
                traceback: parseResult.traceback
            });
            panel.webview.postMessage({
                type: 'status',
                status: 'error'
            });
        }
    }

    private async handleSubPath(fileUri: vscode.Uri, jsonPath: string, panel: vscode.WebviewPanel): Promise<void> {
        const config = vscode.workspace.getConfiguration('pklViewer');
        const maxListLen = config.get<number>('maxListLength') || 100;
        const maxDfRows = config.get<number>('maxDfRows') || 100;

        const result = await PythonRunner.loadSubPath(
            this.context.extensionUri,
            fileUri.fsPath,
            jsonPath,
            maxListLen,
            maxDfRows
        );

        panel.webview.postMessage({
            type: 'subPathResult',
            path: jsonPath,
            result
        });
    }

    private async handleLoadHex(fileUri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const fileBytes = await vscode.workspace.fs.readFile(fileUri);
            const base64Bytes = Buffer.from(fileBytes).toString('base64');
            panel.webview.postMessage({
                type: 'hexData',
                base64: base64Bytes
            });
        } catch (e: any) {
            panel.webview.postMessage({
                type: 'hexError',
                error: e.message
            });
        }
    }

    private async handleExportJson(fileUri: vscode.Uri, data: any): Promise<void> {
        const baseName = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(path.dirname(fileUri.fsPath), `${baseName}.json`)),
            filters: { 'JSON Files': ['json'] }
        });

        if (saveUri) {
            await vscode.workspace.fs.writeFile(
                saveUri,
                Buffer.from(JSON.stringify(data, null, 4), 'utf8')
            );
            vscode.window.showInformationMessage(`Successfully exported pickle contents to JSON: ${path.basename(saveUri.fsPath)}`);
        }
    }

    private async handleExportSchema(fileUri: vscode.Uri, data: any): Promise<void> {
        const baseName = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(path.dirname(fileUri.fsPath), `${baseName}_schema.txt`)),
            filters: { 'Text Files': ['txt'] }
        });

        if (saveUri) {
            const schemaText = this.generateSchemaText(data);
            await vscode.workspace.fs.writeFile(
                saveUri,
                Buffer.from(schemaText, 'utf8')
            );
            vscode.window.showInformationMessage(`Successfully exported schema: ${path.basename(saveUri.fsPath)}`);
        }
    }

    private generateSchemaText(data: any, indent: string = ''): string {
        if (data === null) {
            return `${indent}NoneType\n`;
        }
        if (typeof data !== 'object') {
            return `${indent}${typeof data} = ${data}\n`;
        }
        
        if ('__pkl_type__' in data) {
            const pklType = data.__pkl_type__;
            if (pklType === 'ndarray' || pklType === 'tensor') {
                const shape = JSON.stringify(data.shape);
                return `${indent}[${pklType.toUpperCase()}] shape: ${shape}, dtype: ${data.dtype}\n`;
            }
            if (pklType === 'dataframe') {
                const shape = JSON.stringify(data.shape);
                let cols = data.columns.join(', ');
                if (cols.length > 50) { cols = cols.substring(0, 50) + '...'; }
                return `${indent}[DATAFRAME] shape: ${shape}, columns: [${cols}]\n`;
            }
            if (pklType === 'image') {
                const size = JSON.stringify(data.size);
                return `${indent}[IMAGE] size: ${size}, format: ${data.format}\n`;
            }
            if (pklType === 'list' || pklType === 'tuple' || pklType === 'set') {
                let schema = `${indent}[${pklType.toUpperCase()}] length: ${data.length}\n`;
                if (data.values && data.values.length > 0) {
                    schema += `${indent}  Items Preview:\n`;
                    schema += this.generateSchemaText(data.values[0], indent + '    ');
                }
                return schema;
            }
            if (pklType === 'object') {
                let schema = `${indent}[OBJECT] class: ${data.class}\n`;
                if (data.attributes && Object.keys(data.attributes).length > 0) {
                    schema += `${indent}  Attributes:\n`;
                    for (const key of Object.keys(data.attributes)) {
                        schema += `${indent}    ${key}:\n`;
                        schema += this.generateSchemaText(data.attributes[key], indent + '      ');
                    }
                }
                return schema;
            }
        }

        // Standard JS object (represents python dict)
        let schema = `${indent}dict\n`;
        for (const key of Object.keys(data)) {
            if (key === '__pkl_truncated__' || key === '__pkl_total_keys__') { continue; }
            schema += `${indent}  ${key}:\n`;
            schema += this.generateSchemaText(data[key], indent + '    ');
        }
        return schema;
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const mediaPath = path.join(this.context.extensionPath, 'media');
        
        // Secure URIs
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'main.js')));
        const hexScriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'hexview.js')));
        const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'main.css')));
        const htmlTemplatePath = path.join(mediaPath, 'webview.html');

        let html = '';
        try {
            html = fs.readFileSync(htmlTemplatePath, 'utf8');
            // Inject URIs dynamically
            html = html.replace('${styleUri}', styleUri.toString());
            html = html.replace('${scriptUri}', scriptUri.toString());
            html = html.replace('${hexScriptUri}', hexScriptUri.toString());
            html = html.replace(/\$\{cspSource\}/g, webview.cspSource);
        } catch (e) {
            html = `<!DOCTYPE html><html><body><h3>Failed to load Webview template: ${e}</h3></body></html>`;
        }
        return html;
    }
}
