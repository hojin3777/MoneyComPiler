const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMac: process.platform === 'darwin',
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDefaultDataPath: () => ipcRenderer.invoke('get-default-data-path'),  
});