const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { create } = require('domain');
const { pathToFileURL } = require('url');

let mainWindow;
let pythonProcess;

const IS_WINDOWS = process.platform === 'win32';

// ****** 경로 해석 헬퍼 ******
// resolvePythonExecutable: 플랫폼별 Python 실행 파일 후보를 순서대로 찾습니다.
function resolvePythonExecutable(pythonHome) {
    const candidates = IS_WINDOWS
        ? [
            path.join(pythonHome, 'python.exe'),
            path.join(pythonHome, 'Scripts', 'python.exe'),
            'python.exe',
        ]
        : [
            path.join(pythonHome, 'bin', 'python3'),
            path.join(pythonHome, 'bin', 'python'),
            path.join(pythonHome, 'python3'),
            path.join(pythonHome, 'python'),
            'python3',
            'python',
        ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        if (path.isAbsolute(candidate)) {
            if (fs.existsSync(candidate)) return candidate;
        } else {
            return candidate;
        }
    }

    return IS_WINDOWS ? 'python.exe' : 'python3';
}

// resolveDevPythonExecutable: 개발 모드에서 사용할 Python 경로를 찾습니다.
function resolveDevPythonExecutable() {
    if (process.env.CUSTOMMYDATA_PYTHON) {
        return process.env.CUSTOMMYDATA_PYTHON;
    }

    if (process.platform === 'darwin') {
        const macCondaCandidates = [
            '/opt/miniconda3/envs/custommydata-mac/bin/python',
            '/opt/homebrew/Caskroom/miniconda/base/envs/custommydata-mac/bin/python',
            path.join(require('os').homedir(), 'miniconda3', 'envs', 'custommydata-mac', 'bin', 'python'),
            path.join(require('os').homedir(), 'anaconda3', 'envs', 'custommydata-mac', 'bin', 'python'),
        ];

        for (const candidate of macCondaCandidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }

    if (process.env.CONDA_PREFIX) {
        const condaPython = path.join(process.env.CONDA_PREFIX, 'bin', 'python');
        if (fs.existsSync(condaPython)) {
            return condaPython;
        }
    }

    return IS_WINDOWS ? 'C:\\code\\.venv_backend\\Scripts\\python.exe' : 'python3';
}

// resolveBackendScriptPath: backend/app.py의 실제 경로를 계산합니다.
function resolveBackendScriptPath() {
    if (!app.isPackaged) {
        return path.resolve(__dirname, '..', '..', '..', 'moneyComPiler', 'backend', 'app.py');
    }

    return path.join(process.resourcesPath, 'backend', 'app.py');
}

// resolvePackagedPythonPaths: 패키징된 Python 배포본에서 PYTHONPATH 후보를 계산합니다.
function resolvePackagedPythonPaths(pythonHome) {
    const candidates = IS_WINDOWS
        ? [
            path.join(pythonHome, 'Lib', 'site-packages'),
            path.join(pythonHome, 'lib', 'site-packages'),
            path.join(pythonHome, 'site-packages'),
        ]
        : [
            path.join(pythonHome, 'lib', 'python3.12', 'site-packages'),
            path.join(pythonHome, 'lib', 'python3.11', 'site-packages'),
            path.join(pythonHome, 'lib', 'python3.10', 'site-packages'),
            path.join(pythonHome, 'lib', 'site-packages'),
            path.join(pythonHome, 'site-packages'),
        ];

    return candidates.filter(candidate => fs.existsSync(candidate));
}

// resolveFrontendUrl: 개발/배포 환경에 맞는 프론트엔드 진입 URL을 계산합니다.
function resolveFrontendUrl() {
    if (!app.isPackaged) {
        return process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    }

    return pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString();
}

// resolveAppIconPath: 플랫폼에 맞는 앱 아이콘 파일 경로를 반환합니다.
function resolveAppIconPath() {
    if (app.isPackaged) {
        return IS_WINDOWS
            ? path.join(process.resourcesPath, 'icon.ico')
            : path.join(process.resourcesPath, 'icon.icns');
    }

    return IS_WINDOWS
        ? path.join(__dirname, '..', 'public', 'icon.ico')
        : path.join(__dirname, '..', 'public', 'icon.icns');
}

// ****** Python 백엔드 관리 ******
// startPythonBackend: Python 백엔드 프로세스 시작
function startPythonBackend() {
    const isDev = !app.isPackaged;

    const logDir = path.join(require('os').homedir(), '.moneyComPiler', 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const logFilePath = path.join(logDir, `backend-${Date.now()}.log`);
    console.log(`Backend logs will be saved to: ${logFilePath}`);

    let pythonPath;
    let scriptPath;
    let pythonHome;

    if (isDev) {
        pythonPath = resolveDevPythonExecutable();
        scriptPath = resolveBackendScriptPath();
    } else {
        const resourcesPath = process.resourcesPath;
        pythonHome = path.join(resourcesPath, 'python');
        pythonPath = resolvePythonExecutable(pythonHome);
        scriptPath = resolveBackendScriptPath();
        
        console.log('Resolved paths:');
        console.log('  - resourcesPath:', resourcesPath);
        console.log('  - pythonPath:', pythonPath);
        console.log('  - scriptPath:', scriptPath);
        console.log('  - pythonHome:', pythonHome);
                
        fs.appendFileSync(logFilePath, `=== Electron Path Info ===\n`);
        fs.appendFileSync(logFilePath, `resourcesPath: ${resourcesPath}\n`);
        fs.appendFileSync(logFilePath, `pythonPath: ${pythonPath}\n`);
        fs.appendFileSync(logFilePath, `scriptPath: ${scriptPath}\n`);
        fs.appendFileSync(logFilePath, `pythonHome: ${pythonHome}\n\n`);
    }

    console.log('Starting Python backend...');
    console.log('Python path:', pythonPath);
    console.log('Script path:', scriptPath);

    if (!fs.existsSync(pythonPath)) {
        const errorMsg = `Python 실행 파일을 찾을 수 없습니다:\n${pythonPath}`;
        console.error(errorMsg);
        fs.appendFileSync(logFilePath, `ERROR: ${errorMsg}\n`);
        dialog.showErrorBox('Python 오류', errorMsg);
        return;
    }

    if (!fs.existsSync(scriptPath)) {
        const errorMsg = `백엔드 스크립트를 찾을 수 없습니다:\n${scriptPath}`;
        console.error(errorMsg);
        fs.appendFileSync(logFilePath, `ERROR: ${errorMsg}\n`);
        dialog.showErrorBox('백엔드 오류', errorMsg);
        return;
    }

    const spawnOptions = {
        cwd: path.dirname(scriptPath),
        env: isDev 
            ? {
                ...process.env,
                BACKEND_PORT: '5050',
                PYTHONUNBUFFERED: '1',
                PYTHONNOUSERSITE: '1',
                PYTHONDONTWRITEBYTECODE: '1',
                PYTHONUTF8: '1',
                PYTHONIOENCODING: 'utf-8',
                PYTHONPATH: [
                  path.resolve(__dirname, '..', '..', '..', 'moneyComPiler', 'pororo_easyocr_main'),
                  process.env.PYTHONPATH || '',
                ].filter(Boolean).join(path.delimiter),
            }
            : {
                PYTHONHOME: pythonHome,
                PYTHONPATH: [
                    path.join(process.resourcesPath, 'pororo_easyocr_main'),
                    ...resolvePackagedPythonPaths(pythonHome),
                ].join(path.delimiter),
                RESOURCE_PATH: process.resourcesPath,
                IS_PACKAGED: 'true',
                
                PATH: [
                    IS_WINDOWS ? pythonHome : path.join(pythonHome, 'bin'),
                    process.env.PATH || '',
                ].filter(Boolean).join(path.delimiter),
                
                PYTHONUNBUFFERED: '1',
                PYTHONNOUSERSITE: '1', // 사용자 site-packages 차단
                PYTHONDONTWRITEBYTECODE: '1',
                PYTHONUTF8: '1',
                PYTHONIOENCODING: 'utf-8',
                
                SYSTEMROOT: process.env.SYSTEMROOT,
                TEMP: process.env.TEMP,
                TMP: process.env.TMP,
            },
        shell: false, // shell 사용 안 함
        windowsHide: true,
    };

    fs.appendFileSync(logFilePath, `=== Python Process Starting ===\n`);
    fs.appendFileSync(logFilePath, `Command: ${pythonPath} ${scriptPath}\n`);
    fs.appendFileSync(logFilePath, `CWD: ${spawnOptions.cwd}\n`);
    fs.appendFileSync(logFilePath, `PYTHONHOME: ${spawnOptions.env.PYTHONHOME}\n`);
    fs.appendFileSync(logFilePath, `PYTHONPATH: ${spawnOptions.env.PYTHONPATH}\n`);
    fs.appendFileSync(logFilePath, `PATH: ${spawnOptions.env.PATH}\n\n`);

    pythonProcess = spawn(pythonPath, [scriptPath], spawnOptions);

    pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[STDOUT] ${output}`);
        fs.appendFileSync(logFilePath, `[STDOUT] ${output}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`[STDERR] ${output}`);
        fs.appendFileSync(logFilePath, `[STDERR] ${output}`);
    });

    pythonProcess.on('error', (error) => {
        console.error('[ERROR] Failed to start Python process:', error);
        fs.appendFileSync(logFilePath, `[ERROR] ${error.message}\n`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`[EXIT] Python process exited with code ${code}`);
        fs.appendFileSync(logFilePath, `[EXIT] Python process exited with code ${code}\n`);
    });
}

function terminatePythonProcess(timeoutMs = 3000) {
    return new Promise((resolve) => {
        if (!pythonProcess) {
            resolve();
            return;
        }

        const proc = pythonProcess;
        let finished = false;

        const done = () => {
            if (finished) return;
            finished = true;
            resolve();
        };

        const timer = setTimeout(() => {
            try {
                if (proc && !proc.killed) {
                    proc.kill('SIGKILL');
                }
            } catch (error) {
                console.error('Failed to SIGKILL Python process:', error);
            }
            done();
        }, timeoutMs);

        proc.once('exit', () => {
            clearTimeout(timer);
            done();
        });

        try {
            proc.kill('SIGTERM');
        } catch (error) {
            clearTimeout(timer);
            console.error('Failed to SIGTERM Python process:', error);
            done();
        }
    });
}


async function waitForBackend(maxRetries = 180, interval = 1000) {
    console.log('Waiting for backend to be ready...');

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch('http://127.0.0.1:5050/api/health');
            if (response.ok) {
                console.log('Backend is ready!');
                return true;
            }
        } catch (error) {
            if (i % 10 === 0) {
                console.log(`Backend not ready yet (${i + 1}/${maxRetries})...`);
            }
        }

        // interval만큼 대기
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.error('Backend failed to start within timeout');
    return false;
}

// createWindow: 메인 윈도우 생성
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 1250,
        minHeight: 800,
        frame: false,
        backgroundColor: '#1a1a1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: resolveAppIconPath(),
        show: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 10, y: 10 }
    });

    const isDev = !app.isPackaged;
    const startUrl = resolveFrontendUrl();

    mainWindow.loadURL(startUrl);

    mainWindow.webContents.on('did-finish-load', async () => {
        console.log('Frontend loaded');
        mainWindow.show();
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ****** 앱 생명주기 관리 ******
app.whenReady().then(() => {
    startPythonBackend();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    dialog.showErrorBox('오류 발생', error.message);
});

// ****** 윈도우 제어 IPC 핸들러 ******
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { ok: true };
    } catch (error) {
        console.error('Failed to open external URL:', error);
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('get-default-data-path', async () => {
  return path.join(os.homedir(), '.moneyComPiler');
});

ipcMain.handle('app-relaunch', async () => {
  await terminatePythonProcess();
  app.relaunch();
  app.exit(0);
});