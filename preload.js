const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  processVideo: (data) => ipcRenderer.invoke('process-video', data),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveTempPNG: (base64, uid) => ipcRenderer.invoke('save-temp-png', base64, uid),
  startUpdateDownload: () => ipcRenderer.send('start-update-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, version) => cb(version)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_, pct) => cb(pct)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb())
})
