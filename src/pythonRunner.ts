import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export interface ScanResult {
    success: boolean;
    file_size: number;
    imports: string[];
    has_execution_opcodes: boolean;
    error?: string;
}

export interface ParseResult {
    success: boolean;
    data?: any;
    error?: string;
    traceback?: string;
}

export class PythonRunner {
    private static async getPythonInterpreter(): Promise<string> {
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
        } catch (e) {
            console.error('Failed to query Python extension API:', e);
        }

        // 2. Check workspace settings
        const config = vscode.workspace.getConfiguration('pklViewer');
        const customPath = config.get<string>('pythonPath');
        if (customPath && customPath.trim() !== '') {
            return customPath;
        }

        // 3. System defaults
        return process.platform === 'win32' ? 'python' : 'python3';
    }

    public static async scanPickle(extensionUri: vscode.Uri, filePath: string): Promise<ScanResult> {
        const pythonPath = await this.getPythonInterpreter();
        const scriptPath = path.join(extensionUri.fsPath, 'python', 'viewer.py');
        const args = ['--action', 'scan', '--file', filePath];

        return new Promise<ScanResult>((resolve) => {
            this.runProcess(pythonPath, scriptPath, args)
                .then((stdout) => {
                    try {
                        const parsed = JSON.parse(stdout) as ScanResult;
                        resolve(parsed);
                    } catch (e) {
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

    public static async loadPickle(
        extensionUri: vscode.Uri,
        filePath: string,
        maxListLen: number,
        maxDfRows: number
    ): Promise<ParseResult> {
        const pythonPath = await this.getPythonInterpreter();
        const scriptPath = path.join(extensionUri.fsPath, 'python', 'viewer.py');
        const args = [
            '--action', 'load',
            '--file', filePath,
            '--max-list-len', maxListLen.toString(),
            '--max-df-rows', maxDfRows.toString()
        ];

        return new Promise<ParseResult>((resolve) => {
            this.runProcess(pythonPath, scriptPath, args)
                .then((stdout) => {
                    try {
                        const parsed = JSON.parse(stdout) as ParseResult;
                        resolve(parsed);
                    } catch (e) {
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

    public static async loadSubPath(
        extensionUri: vscode.Uri,
        filePath: string,
        jsonPath: string,
        maxListLen: number,
        maxDfRows: number
    ): Promise<ParseResult> {
        const pythonPath = await this.getPythonInterpreter();
        const scriptPath = path.join(extensionUri.fsPath, 'python', 'viewer.py');
        const args = [
            '--action', 'get_path',
            '--file', filePath,
            '--path', jsonPath,
            '--max-list-len', maxListLen.toString(),
            '--max-df-rows', maxDfRows.toString()
        ];

        return new Promise<ParseResult>((resolve) => {
            this.runProcess(pythonPath, scriptPath, args)
                .then((stdout) => {
                    try {
                        const parsed = JSON.parse(stdout) as ParseResult;
                        resolve(parsed);
                    } catch (e) {
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

    private static runProcess(pythonPath: string, scriptPath: string, args: string[]): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const commandArgs = [scriptPath, ...args];
            console.log(`Executing: ${pythonPath} ${commandArgs.join(' ')}`);

            // Use 100MB buffer for handling massive serialized dictionaries/dataframes
            cp.execFile(pythonPath, commandArgs, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
                if (error) {
                    // Check if Python interpreter actually exists
                    if ((error as any).code === 'ENOENT') {
                        reject(new Error(`Python interpreter not found at '${pythonPath}'. Please check your configurations.`));
                    } else {
                        reject(new Error(stderr || stdout || error.message));
                    }
                    return;
                }
                resolve(stdout);
            });
        });
    }
}
