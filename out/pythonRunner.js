"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonRunner = void 0;
const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
class PythonRunner {
    static async getPythonInterpreter() {
        // 1. Try to get the active interpreter from the official VS Code Python extension
        try {
            const pythonExtension = vscode.extensions.getExtension('ms-python.python');
            if (pythonExtension) {
                if (!pythonExtension.isActive) {
                    await pythonExtension.activate();
                }
                const api = pythonExtension.exports;
                if (api && typeof api.environments?.getActiveEnvironmentPath === 'function') {
                    const environment = api.environments.getActiveEnvironmentPath();
                    if (environment && environment.path) {
                        return environment.path;
                    }
                }
                // Fallback for older Python extension APIs
                if (api && typeof api.getActiveInterpreterPath === 'function') {
                    const interpreterPath = api.getActiveInterpreterPath();
                    if (interpreterPath) {
                        return interpreterPath;
                    }
                }
            }
        }
        catch (e) {
            console.error('Failed to query Python extension API:', e);
        }
        // 2. Check workspace settings
        const config = vscode.workspace.getConfiguration('pklViewer');
        const customPath = config.get('pythonPath');
        if (customPath && customPath.trim() !== '') {
            return customPath;
        }
        // 3. System defaults
        return process.platform === 'win32' ? 'python' : 'python3';
    }
    static async scanPickle(extensionUri, filePath) {
        const pythonPath = await this.getPythonInterpreter();
        const scriptPath = path.join(extensionUri.fsPath, 'python', 'viewer.py');
        const args = ['--action', 'scan', '--file', filePath];
        return new Promise((resolve) => {
            this.runProcess(pythonPath, scriptPath, args)
                .then((stdout) => {
                try {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
                catch (e) {
                    resolve({
                        success: false,
                        file_size: 0,
                        imports: [],
                        has_execution_opcodes: true,
                        error: `Failed to parse Python scan JSON: ${stdout.substring(0, 500)}`
                    });
                }
            })
                .catch((err) => {
                resolve({
                    success: false,
                    file_size: 0,
                    imports: [],
                    has_execution_opcodes: true,
                    error: `Python static scan execution failed: ${err.message}`
                });
            });
        });
    }
    static async loadPickle(extensionUri, filePath, maxListLen, maxDfRows) {
        const pythonPath = await this.getPythonInterpreter();
        const scriptPath = path.join(extensionUri.fsPath, 'python', 'viewer.py');
        const args = [
            '--action', 'load',
            '--file', filePath,
            '--max-list-len', maxListLen.toString(),
            '--max-df-rows', maxDfRows.toString()
        ];
        return new Promise((resolve) => {
            this.runProcess(pythonPath, scriptPath, args)
                .then((stdout) => {
                try {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
                catch (e) {
                    resolve({
                        success: false,
                        error: `Failed to parse Python load JSON: ${stdout.substring(0, 1000)}`
                    });
                }
            })
                .catch((err) => {
                resolve({
                    success: false,
                    error: `Python load execution failed: ${err.message}`
                });
            });
        });
    }
    static async loadSubPath(extensionUri, filePath, jsonPath, maxListLen, maxDfRows) {
        const pythonPath = await this.getPythonInterpreter();
        const scriptPath = path.join(extensionUri.fsPath, 'python', 'viewer.py');
        const args = [
            '--action', 'get_path',
            '--file', filePath,
            '--path', jsonPath,
            '--max-list-len', maxListLen.toString(),
            '--max-df-rows', maxDfRows.toString()
        ];
        return new Promise((resolve) => {
            this.runProcess(pythonPath, scriptPath, args)
                .then((stdout) => {
                try {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
                catch (e) {
                    resolve({
                        success: false,
                        error: `Failed to parse Python get_path JSON: ${stdout.substring(0, 1000)}`
                    });
                }
            })
                .catch((err) => {
                resolve({
                    success: false,
                    error: `Python get_path execution failed: ${err.message}`
                });
            });
        });
    }
    static runProcess(pythonPath, scriptPath, args) {
        return new Promise((resolve, reject) => {
            const commandArgs = [scriptPath, ...args];
            console.log(`Executing: ${pythonPath} ${commandArgs.join(' ')}`);
            // Use 100MB buffer for handling massive serialized dictionaries/dataframes
            cp.execFile(pythonPath, commandArgs, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
                if (error) {
                    // Check if Python interpreter actually exists
                    if (error.code === 'ENOENT') {
                        reject(new Error(`Python interpreter not found at '${pythonPath}'. Please check your configurations.`));
                    }
                    else {
                        reject(new Error(stderr || stdout || error.message));
                    }
                    return;
                }
                resolve(stdout);
            });
        });
    }
}
exports.PythonRunner = PythonRunner;
//# sourceMappingURL=pythonRunner.js.map