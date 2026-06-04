const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')



function getFFmpegPath() {
  const bundledPath = path.join(process.resourcesPath || __dirname, 'ffmpeg', 'ffmpeg.exe')
  if (fs.existsSync(bundledPath)) return bundledPath
  const systemPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe'
  if (fs.existsSync(systemPath)) return systemPath
  return 'ffmpeg'
}

const FFMPEG = getFFmpegPath()

const FONTS = {
  classic:    'font.ttf',
  elegance:   'fonts\\playfair.ttf',
  neon:       'fonts\\bebas.ttf',
  retro:      'fonts\\pacifico.ttf',
  comic:      'fonts\\comicneue.ttf',
  tallhaus:   'fonts\\oswald.ttf',
  vintage:    'fonts\\abril.ttf',
  bomb:       'fonts\\blackhan.ttf',
  signature:  'fonts\\dancing.ttf',
  printer:    'fonts\\courier.ttf',
  typewriter: 'fonts\\specialelite.ttf',
  nunito:     'fonts\\nunito.ttf'
}

function getFontPath(fontKey) {
  const rel = FONTS[fontKey] || FONTS.classic
  const resourceFont = path.join(process.resourcesPath || __dirname, rel)
  const localFont = path.join(__dirname, rel)
  const fontFile = fs.existsSync(resourceFont) ? resourceFont : localFont
  return fontFile.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, '$1\\:/')
}

function getDrawtextStyle(bgIdx, col) {
  const idx = parseInt(bgIdx) || 0
  const isLight = (hex) => {
    const c = (hex||'').replace('#','').padEnd(6,'0')
    const r = parseInt(c.substr(0,2),16)
    const g = parseInt(c.substr(2,2),16)
    const b = parseInt(c.substr(4,2),16)
    return (r*299+g*587+b*114)/1000 > 128
  }
  const cleanCol = (col||'ffffff').replace('#','')
  const isWhite = cleanCol.toLowerCase() === 'ffffff'
  const borderColor = isWhite ? '000000' : 'ffffff'
  if (idx === 0) {
    const textColor = isLight('#'+cleanCol) ? 'black' : 'white'
    return { fontcolor: textColor, box: `box=1:boxcolor=0x${cleanCol}@1.0:boxborderw=22` }
  }
  if (idx === 1) {
    return { fontcolor: `0x${cleanCol}`, box: `borderw=5:bordercolor=0x${borderColor}` }
  }
  return { fontcolor: `0x${cleanCol}`, box: '' }
}

function escapeFFmpeg(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
}

function wrapText(text, maxChars) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current ? current + ' ' + word : word
    if (test.length <= maxChars) { current = test }
    else { if (current) lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines
}

let mainWin = null
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.on('update-available', (info) => { if(mainWin) mainWin.webContents.send('update-available', info.version) })
autoUpdater.on('download-progress', (p) => { if(mainWin) mainWin.webContents.send('update-progress', Math.round(p.percent)) })
autoUpdater.on('update-downloaded', () => { if(mainWin) mainWin.webContents.send('update-progress', 100); setTimeout(() => autoUpdater.quitAndInstall(false, true), 2000) })
ipcMain.on('start-update-download', () => { autoUpdater.downloadUpdate() })
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(false, true) })

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'RoyalForge', backgroundColor: '#080808',
    icon: path.join(__dirname, 'app', 'icon.ico')
  })
  mainWin = win
  win.loadFile('app/index.html')
  win.setMenuBarVisibility(false)
}

let processCounter = 0

// Save PNG from base64 — use safe filename (no dots)
ipcMain.handle('save-temp-png', async (event, base64Data, uid) => {
  try {
    const safeUid = String(uid).replace(/\./g, '_')
    const pngPath = path.join(os.tmpdir(), `rf_overlay_${safeUid}.png`)
    fs.writeFileSync(pngPath, Buffer.from(base64Data, 'base64'))
    return pngPath
  } catch(e) {
    console.error('Failed to save PNG:', e)
    return null
  }
})

ipcMain.handle('process-video', async (event, data) => {
  const { inputPath, outputPath, topText, botText, color, botColor, hookColor, fontKey, fontSize, topBgStyle, botBgStyle, hookBgStyle, ovStyle, textYPercent, preWrappedLines, overlayPngPath } = data

  const fontSrc = 'C:\\Windows\\Fonts\\arialbd.ttf'
  const fontDest = path.join(__dirname, 'font.ttf')
  if (!fs.existsSync(fontDest)) {
    try { fs.copyFileSync(fontSrc, fontDest) } catch(e) {}
  }

  const FONT = getFontPath(fontKey || 'classic')
  const fSize = fontSize || 52
  const scale = 2.0
  const BOX_BORDER = 22
  const bofSize = Math.round(fSize * scale)
  const bofBotSize = Math.round(fSize * scale * 0.78)
  const videoFontSize = Math.round(fSize * scale * 0.75) // 0.75 keeps fulltext from overflowing video width
  const topCol = (color || '#e03d52').replace('#', '')
  const botCol = (botColor || '#ffffff').replace('#', '')
  const hookCol = (hookColor || '#ffffff').replace('#', '')

  const isFulltext = ovStyle === 'fulltext' || (ovStyle === 'mix' && topText && topText.length > 30 && !botText)

  const pct = parseFloat(textYPercent) || 12
  const videoH = 3840
  const topY = Math.round((pct / 100) * videoH)
  const botY = topY + Math.round(bofSize * 0.75) + (BOX_BORDER * 2)

  const uid = ++processCounter

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  // PNG overlay path — uses 2-input filter_complex with transpose for rotation
  if (overlayPngPath && fs.existsSync(overlayPngPath)) {
    return new Promise((resolve, reject) => {
      // Scale PNG to fit 2160 wide, then overlay centered at topY position
      // transpose=2 handles -90 degree rotation metadata on iPhone videos
      const filterComplex = `[0:v]scale=2160:-2[rot];[rot][1:v]overlay=0:0:enable='gte(t,0.1)'`
      const args = [
        '-i', inputPath,
        '-i', overlayPngPath,
        '-filter_complex', filterComplex,
        '-c:v', 'libx264', '-c:a', 'copy', '-preset', 'ultrafast', '-y', outputPath
      ]

      try { fs.writeFileSync(path.join(__dirname, 'last_filter.txt'), 'PNG_OVERLAY: ' + filterComplex, 'utf8') } catch(e) {}

      execFile(FFMPEG, args, { maxBuffer: 1024 * 1024 * 200 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(overlayPngPath) } catch(e) {}
        if (err) {
          console.error('PNG overlay failed:', err.message)
          console.error('FFmpeg stderr:', stderr.substring(0, 500))
          processWithDrawtext(inputPath, outputPath, topText, botText, FONT, bofSize, bofBotSize, videoFontSize, topCol, botCol, hookCol, topBgStyle, botBgStyle, hookBgStyle, isFulltext, topY, botY, BOX_BORDER, preWrappedLines, uid, resolve, reject)
        } else {
          resolve(outputPath)
        }
      })
    })
  }

  return new Promise((resolve, reject) => {
    processWithDrawtext(inputPath, outputPath, topText, botText, FONT, bofSize, bofBotSize, videoFontSize, topCol, botCol, hookCol, topBgStyle, botBgStyle, hookBgStyle, isFulltext, topY, botY, BOX_BORDER, preWrappedLines, uid, resolve, reject)
  })
})

function processWithDrawtext(inputPath, outputPath, topText, botText, FONT, bofSize, bofBotSize, videoFontSize, topCol, botCol, hookCol, topBgStyle, botBgStyle, hookBgStyle, isFulltext, topY, botY, BOX_BORDER, preWrappedLines, uid, resolve, reject) {
  const filters = []
  const botFile = path.join(os.tmpdir(), `rf_bot_${uid}.txt`)
  const filterFile = path.join(os.tmpdir(), `rf_filter_${uid}.txt`)

  if (topText && topText.trim()) {
    const style = getDrawtextStyle(isFulltext ? (hookBgStyle||0) : topBgStyle, isFulltext ? hookCol : topCol)
    const useSize = isFulltext ? videoFontSize : bofSize
    const boxPart = style.box ? `:${style.box}` : ''

    if (isFulltext) {
      const lines = (preWrappedLines && preWrappedLines.length > 0) ? preWrappedLines : wrapText(topText.trim(), 10)
      const lineHeight = Math.round(useSize * 0.72) + BOX_BORDER * 2
      lines.forEach((line, i) => {
        const y = topY + (i * lineHeight)
        const escaped = escapeFFmpeg(line)
        filters.push(`drawtext=fontfile='${FONT}':text='${escaped}':fontsize=${useSize}:fontcolor=${style.fontcolor}${boxPart}:x=(w-text_w)/2:y=${y}:enable='gte(t,0.1)'`)
      })
    } else {
      const topFile = path.join(os.tmpdir(), `rf_top_${uid}.txt`)
      fs.writeFileSync(topFile, topText.trim(), 'utf8')
      const topPath = topFile.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, '$1\\:/')
      filters.push(`drawtext=fontfile='${FONT}':textfile='${topPath}':expansion=none:fontsize=${bofSize}:fontcolor=${style.fontcolor}${boxPart}:x=(w-text_w)/2:y=${topY}:enable='gte(t,0.1)'`)
    }
  }

  if (botText && botText.trim()) {
    fs.writeFileSync(botFile, botText.trim(), 'utf8')
    const botPath = botFile.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, '$1\\:/')
    const botStyle = getDrawtextStyle(botBgStyle, botCol)
    const boxPart = botStyle.box ? `:${botStyle.box}` : ''
    filters.push(`drawtext=fontfile='${FONT}':textfile='${botPath}':expansion=none:fontsize=${bofBotSize}:fontcolor=${botStyle.fontcolor}${boxPart}:x=(w-text_w)/2:y=${botY}:enable='gte(t,0.1)'`)
  }

  if (filters.length === 0) filters.push('null')

  const filterStr = filters.join(',')
  fs.writeFileSync(filterFile, filterStr, 'utf8')
  try { fs.writeFileSync(path.join(__dirname, 'last_filter.txt'), filterStr, 'utf8') } catch(e) {}

  const env = Object.assign({}, process.env, {
    FONTCONFIG_FILE: path.join(__dirname, 'fonts', 'fonts.conf'),
    FC_CONFIG_DIR: path.join(__dirname, 'fonts')
  })

  const args = ['-i', inputPath, '-filter_script:v', filterFile, '-c:v', 'libx264', '-c:a', 'copy', '-preset', 'ultrafast', '-y', outputPath]

  execFile(FFMPEG, args, { maxBuffer: 1024 * 1024 * 200, env }, (err, stdout, stderr) => {
    try { fs.unlinkSync(filterFile) } catch(e) {}
    try { fs.unlinkSync(botFile) } catch(e) {}
    if (err) { console.error('FFmpeg error:', stderr); reject(stderr) }
    else { resolve(outputPath) }
  })
}

ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'MOV', 'MP4'] }]
  })
  return result.filePaths
})

ipcMain.handle('open-folder', async (event, p) => { shell.openPath(p) })
ipcMain.handle('open-external', async (event, url) => { shell.openExternal(url) })
ipcMain.handle('get-home-dir', async () => os.homedir())

app.whenReady().then(() => {
  createWindow()
  try { autoUpdater.checkForUpdates() } catch(e) {}
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
