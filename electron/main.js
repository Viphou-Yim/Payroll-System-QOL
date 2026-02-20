const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn, fork } = require('child_process');
const { waitForServer } = require('./utils/waitForServer');
const { checkMongoDB } = require('./utils/mongoCheck');
const isDev = !app.isPackaged;

let mainWindow;
let backendProcess;
let frontendProcess;
let appInitialized = false;

const BACKEND_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:3000';
const FRONTEND_BUILD_PATH = path.join(__dirname, '../front/public');

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
    },
    icon: isDev
      ? undefined
      : path.join(__dirname, '../assets/icon.png'),
  });

  // Load URL or file based on dev/prod
  const startUrl = isDev ? FRONTEND_URL : `file://${path.join(FRONTEND_BUILD_PATH, 'index.html')}`;
  mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Start backend server
 */
async function startBackend() {
  return new Promise((resolve, reject) => {
    const backendEntry = path.join(__dirname, '../back/src/index.js');
    backendProcess = fork(backendEntry, [], {
      cwd: path.dirname(backendEntry),
      stdio: 'inherit',
    });

    backendProcess.on('error', (err) => {
      console.error('Backend process error:', err);
      reject(err);
    });

    // Wait for backend to be ready
    waitForServer(BACKEND_URL, 30000) // 30 second timeout
      .then(() => {
        console.log('Backend is ready');
        resolve();
      })
      .catch((err) => {
        console.error('Backend failed to start:', err);
        reject(new Error('Backend server failed to start. Please check your MongoDB connection.'));
      });
  });
}

/**
 * Start frontend server
 */
async function startFrontend() {
  return new Promise((resolve, reject) => {
    const frontPath = path.join(__dirname, '../front');
    frontendProcess = spawn('npm', ['run', 'start'], {
      cwd: frontPath,
      stdio: 'inherit',
      shell: true,
    });

    frontendProcess.on('error', (err) => {
      console.error('Frontend process error:', err);
      reject(err);
    });

    // Wait for frontend to be ready
    waitForServer(FRONTEND_URL, 30000) // 30 second timeout
      .then(() => {
        console.log('Frontend is ready');
        resolve();
      })
      .catch((err) => {
        console.error('Frontend failed to start:', err);
        reject(new Error('Frontend server failed to start'));
      });
  });
}

/**
 * Initialize app
 */
async function initializeApp() {
  if (appInitialized) {
    return;
  }

  try {
    // Check MongoDB connection
    console.log('Checking MongoDB connection...');
    const mongoConnected = await checkMongoDB();
    if (!mongoConnected) {
      throw new Error('MongoDB is not running. Please start MongoDB service and try again.');
    }

    console.log('Starting backend...');
    await startBackend();

    if (isDev) {
      console.log('Starting frontend...');
      await startFrontend();
    }

    console.log('Creating window...');
    createWindow();

    appInitialized = true;
  } catch (error) {
    console.error('Initialization error:', error);
    showErrorDialog(error.message);
    app.quit();
  }
}

/**
 * Show error dialog
 */
function showErrorDialog(message) {
  dialog.showErrorBox(
    'Payroll System - Error',
    message + '\n\nPlease ensure:\n1. MongoDB is installed and running\n2. Ports 3000 and 4000 are available'
  );
}

/**
 * App event handlers
 */
app.on('ready', initializeApp);

app.on('window-all-closed', () => {
  // On macOS, keep app in dock until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    initializeApp();
  }
});

/**
 * Kill all child processes on app quit
 */
app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
});

/**
 * IPC handlers for frontend communication
 */
ipcMain.handle('get-db-status', checkMongoDB);
ipcMain.handle('app-info', () => ({
  isDev,
  version: app.getVersion(),
}));

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Payroll System',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Payroll System',
              message: 'Payroll System v' + app.getVersion(),
              detail: 'A modern payroll management system',
            });
          },
        },
      ],
    },
  ];

  if (isDev && process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOtherApps' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('ready', createMenu);
