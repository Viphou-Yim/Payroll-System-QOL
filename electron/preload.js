const { contextBridge, ipcRenderer } = require('electron');

// Expose selected ipcRenderer methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  getDBStatus: () => ipcRenderer.invoke('get-db-status'),
  getAppInfo: () => ipcRenderer.invoke('app-info'),
});
