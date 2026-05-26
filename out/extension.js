"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const pklEditorProvider_1 = require("./pklEditorProvider");
function activate(context) {
    console.log('Pickle Viewer Extension is now active.');
    // 1. Register the Custom Editor Provider
    context.subscriptions.push(pklEditorProvider_1.PklEditorProvider.register(context));
    // 2. Register "Pickle Viewer: Open Pickle File..." command palette command
    context.subscriptions.push(vscode.commands.registerCommand('pklViewer.openFile', async () => {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Open Pickle File',
            filters: {
                'Pickle Files': ['pkl', 'pickle', 'pck', 'pckl']
            }
        });
        if (fileUris && fileUris.length > 0) {
            openPickleInViewer(fileUris[0]);
        }
    }));
    // 3. Register "Open with Pickle Viewer" context menu click command
    context.subscriptions.push(vscode.commands.registerCommand('pklViewer.openInViewer', (uri) => {
        if (uri) {
            openPickleInViewer(uri);
        }
        else {
            // If clicked from command palette without file context, fallback to file selection
            vscode.commands.executeCommand('pklViewer.openFile');
        }
    }));
}
exports.activate = activate;
function openPickleInViewer(uri) {
    // vscode.openWith executes the custom editor registered with that viewType
    vscode.commands.executeCommand('vscode.openWith', uri, 'pklViewer.pklEditor');
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map