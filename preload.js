const { contextBridge, ipcRenderer } = require('electron');
console.log('PRELOAD LOADED');
contextBridge.exposeInMainWorld('api', {
  getIgnoredEmails: () => ipcRenderer.invoke('getIgnoredEmails'),
  setIgnoredEmails: (emails) => ipcRenderer.invoke('setIgnoredEmails', emails),
  getUnreadEmails: () => ipcRenderer.invoke('get-unread-emails'),
  getEmailById: (id) => ipcRenderer.invoke('get-email-by-id', id),
  getRepliedEmailIds: () => ipcRenderer.invoke('get-replied-email-ids'),
  generateReply: (email) => ipcRenderer.invoke('generate-reply', email),
  sendReply: (data) => ipcRenderer.invoke('send-reply', data),
  getAutoSend: () => ipcRenderer.invoke('getAutoSend'),
  setAutoSend: (value) => ipcRenderer.invoke('setAutoSend', value),
  getHalfAutoSend: () => ipcRenderer.invoke('getHalfAutoSend'),
  setHalfAuto: (value) => ipcRenderer.invoke('setHalfAutoSend', value),
  onEmailsUpdated: (callback) => ipcRenderer.on('emails-updated', (_, data) => callback(data)),
  removeEmailsUpdateListener: () => ipcRenderer.removeAllListeners('emails-updated'),
  uploadExcelFile: (content) => ipcRenderer.invoke('upload-excel-file', content),
  uploadImageFile: (content) => ipcRenderer.invoke('upload-image-file', content),
  uploadAttachment: (data) => ipcRenderer.invoke('upload-attachment', data),
  deleteAttachment: (data) => ipcRenderer.invoke('delete-attachment', data),
  listAttachments: () => ipcRenderer.invoke('list-attachments'),
  showFileDialog: () => ipcRenderer.invoke('show-file-dialog'),
  showImageDialog: () => ipcRenderer.invoke('show-image-dialog'),
  deleteSignatureImage: () => ipcRenderer.invoke('delete-signature-image'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  //Adatbázis műveletek
  checkLicence: (payload) => ipcRenderer.invoke('check-licence', payload),
  isLicenceActivated: (payload) => ipcRenderer.invoke('is-licence-activated', payload),
  // Authentikációs funkciók
  checkAuthStatus: () => ipcRenderer.invoke('check-auth-status'),
  loginWithGmail: () => ipcRenderer.invoke('login-with-gmail'),
  loginWithSmtp: (config) => ipcRenderer.invoke('login-with-smtp', config),
  logout: () => ipcRenderer.invoke('logout'),
  getUserEmail: () => ipcRenderer.invoke('get-user-email'),
  // API kulcs kezelése
  setApiKey: (apiKey) => ipcRenderer.invoke('setApiKey', apiKey),
  getApiKey: () => ipcRenderer.invoke('getApiKey'),
  exitApp: () => ipcRenderer.invoke('exit-app'),
  setAutoSendTimes: (times) => ipcRenderer.invoke('setAutoSendTimes', times),
  getAutoSendTimes: () => ipcRenderer.invoke('getAutoSendTimes'),
  //Éretsítések
  getNotifyOnAutoReply: () => ipcRenderer.invoke('getNotifyOnAutoReply'),
  setNotifyOnAutoReply: (value) => ipcRenderer.invoke('setNotifyOnAutoReply', value),
  getNotificationEmail: () => ipcRenderer.invoke('getNotificationEmail'),
  setNotificationEmail: (email) => ipcRenderer.invoke('setNotificationEmail', email),
  onShowCustomView: (callback) => ipcRenderer.on('show-custom-view', (_, data) => callback(data)),
  removeShowCustomViewListener: () => ipcRenderer.removeAllListeners('show-custom-view'),
  // Megjelenítési mód kezelése
  getDisplayMode: () => ipcRenderer.invoke('getDisplayMode'),
  setDisplayMode: (mode) => ipcRenderer.invoke('setDisplayMode', mode),
  getLeftNavbarMode: () => ipcRenderer.invoke('getLeftNavbarMode'),
  setLeftNavbarMode: (mode) => ipcRenderer.invoke('setLeftNavbarMode', mode),
  getPromptSettings: () => ipcRenderer.invoke('getPromptSettings'),
  savePromptSettings: (data) => ipcRenderer.invoke('savePromptSettings', data),
  getWebSettings: () => ipcRenderer.invoke('getWebSettings'),
  saveWebSettings: (data) => ipcRenderer.invoke('saveWebSettings', data),
  getReplyStats: () => ipcRenderer.invoke('get-reply-stats'),
  readSentEmailsLog: () => ipcRenderer.invoke('read-sent-emails-log'),
  getSignatureImagePath: () => {
    const path = require('path');
    const fs = require('fs');
    const imgPath = path.join(__dirname, 'src', 'images', 'signature.png');
    return fs.existsSync(imgPath) ? imgPath : '';
  },

  getSignatureImageFileUrl: () => ipcRenderer.invoke('getSignatureImageFileUrl'),
  copyImageToExeRoot: () => {
    return ipcRenderer.invoke('copy-image-to-exe-root');
  },
  fsExists: (filePath) => {
    try {
      return Promise.resolve(require('fs').existsSync(filePath));
    } catch {
      return Promise.resolve(false);
    }
  },
  setView: (view) => ipcRenderer.invoke('set-view', view),
  checkInternet: () => ipcRenderer.invoke('check-internet'),
  getMinEmailDate: () => ipcRenderer.invoke('getMinEmailDate'),
  setMinEmailDate: (dateStr) => ipcRenderer.invoke('setMinEmailDate', dateStr),
  isDemoOver: () => ipcRenderer.invoke('is-demo-over'),
  receive: (channel, callback) => ipcRenderer.on(channel, (_, data) => callback(data)),
  remove: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  setEmail: (email) => ipcRenderer.invoke('set-email', email),
  getEmail: () => ipcRenderer.invoke('get-email'),
  setActivationEmail: (email) => ipcRenderer.invoke('set-activation-email', email),
  getActivationEmail: () => ipcRenderer.invoke('get-activation-email'),
  sendToMain: (channel, message) => {
    ipcRenderer.send(channel, message);
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (_, progress) => callback(progress));
  },

  removeUpdateDownloadProgressListener: (callback) => {
    ipcRenderer.removeListener('update-download-progress', callback);
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-ava', () => callback());
  },
  onUpdateReady: (callback) => {
    ipcRenderer.on('update-ready', () => callback());
  },
  handleUpdateAction: (action) => {
    ipcRenderer.invoke('handle-update-action', action);
  },
  restartApp: () => ipcRenderer.invoke('restart-app')
});

contextBridge.exposeInMainWorld('electronAPI', {
  exitApp: () => ipcRenderer.send('exit-app'),
});

contextBridge.exposeInMainWorld('electron', { ipcRenderer });