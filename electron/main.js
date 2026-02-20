const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const { waitForServer } = require('./utils/waitForServer');
const { checkMongoDB } = require('./utils/mongoCheck');
const backendServer = require('../back/src/index');
const isDev = !app.isPackaged;

let mainWindow;
let frontendProcess;
let appInitialized = false;

const BACKEND_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:3000';
const FRONTEND_BUILD_PATH = path.join(__dirname, '../front/public');
const FIRST_RUN_NOTICE_PATH = path.join(app.getPath('userData'), 'first-run-notice.json');

async function hasSeenFirstRunNotice() {
  try {
    const content = await fs.promises.readFile(FIRST_RUN_NOTICE_PATH, 'utf8');
    const parsed = JSON.parse(content);
    return parsed && parsed.seen === true;
  } catch (error) {
    return false;
  }
}

async function markFirstRunNoticeAsSeen() {
  const payload = {
    seen: true,
    seenAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(FIRST_RUN_NOTICE_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

async function showFirstRunNotice() {
  const seen = await hasSeenFirstRunNotice();
  if (seen) {
    return;
  }

  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Setup & Privacy Notice',
    buttons: ['Continue'],
    defaultId: 0,
    noLink: true,
    message: 'MongoDB detected on this PC (localhost:27017).',
    detail: [
      'This app stores payroll data in your local MongoDB database.',
      '',
      'Privacy: the app only checks local service availability (MongoDB and required local ports).',
      'It does not scan personal files, browser history, photos, documents, or cloud accounts.',
      'No employee data is sent outside your PC unless you configure an external server yourself.',
    ].join('\n'),
  });

  await markFirstRunNoticeAsSeen();
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function validateStartupPrerequisites() {
  const mongoConnected = await checkMongoDB();
  if (!mongoConnected) {
    throw new Error('MongoDB is not running. Please install/start MongoDB Community Server (mongod service) and try again.');
  }

  const requiredPorts = isDev ? [3000, 4000] : [4000];
  const unavailablePorts = [];

  for (const port of requiredPorts) {
    const available = await checkPortAvailable(port);
    if (!available) {
      unavailablePorts.push(port);
    }
  }

  if (unavailablePorts.length > 0) {
    throw new Error(`Required port(s) already in use: ${unavailablePorts.join(', ')}. Please close the process using those port(s) and try again.`);
  }
}

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
  await backendServer.startServer();
  await waitForServer(BACKEND_URL, 30000);
  console.log('Backend is ready');
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
    console.log('Checking startup prerequisites...');
    await validateStartupPrerequisites();

    console.log('Starting backend...');
    await startBackend();

    if (isDev) {
      console.log('Starting frontend...');
      await startFrontend();
    }

    console.log('Creating window...');
    createWindow();
    await showFirstRunNotice();

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
  const requiredPortsText = isDev ? '3000 and 4000' : '4000';
  dialog.showErrorBox(
    'Payroll System - Error',
    message + `\n\nPlease ensure:\n1. MongoDB is installed and running\n2. Port(s) ${requiredPortsText} are available`
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
  backendServer.stopServer().catch((err) => {
    console.error('Error stopping backend server:', err);
  });
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
