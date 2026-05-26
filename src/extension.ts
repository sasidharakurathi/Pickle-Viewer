import * as vscode from 'vscode';
import { PklEditorProvider } from './pklEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Pickle Viewer Extension is now active.');

    // 1. Register the Custom Editor Provider
    context.subscriptions.push(PklEditorProvider.register(context));

    // 2. Register "Pickle Viewer: Open Pickle File..." command palette command
    context.subscriptions.push(
        vscode.commands.registerCommand('pklViewer.openFile', async () => {
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
        })
    );

    // 3. Register "Open with Pickle Viewer" context menu click command
    context.subscriptions.push(
        vscode.commands.registerCommand('pklViewer.openInViewer', (uri: vscode.Uri) => {
            if (uri) {
                openPickleInViewer(uri);
            } else {
                // If clicked from command palette without file context, fallback to file selection
                vscode.commands.executeCommand('pklViewer.openFile');
            }
        })
    );
}

function openPickleInViewer(uri: vscode.Uri) {
    // vscode.openWith executes the custom editor registered with that viewType
    vscode.commands.executeCommand('vscode.openWith', uri, 'pklViewer.pklEditor');
}

export function deactivate() {}
