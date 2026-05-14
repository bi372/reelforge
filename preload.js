const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  processVideo: (data) => ipcRenderer.invoke('process-video', data),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveTempPNG: (base64, uid) => ipcRenderer.invoke('save-temp-png', base64, uid)
})
