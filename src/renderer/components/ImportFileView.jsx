import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Button, TextField, IconButton, List, ListItem, ListItemText, Tabs, Tab } from '@mui/material';
import { MdDelete } from 'react-icons/md';

const ImportFileView = ({ showSnackbar }) => {
  const [selectedFileName, setSelectedFileName] = useState(null);
  const [uploadedFilePath, setUploadedFilePath] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [originalUploadedFileName, setOriginalUploadedFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFileData, setPendingFileData] = useState(null);
  const [webUrls, setWebUrls] = useState([]);
  const [newWebUrl, setNewWebUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [section, setSection] = useState('websites');

  // Excel status
  const [excelExists, setExcelExists] = useState(false);

  // helper: save previous filename before replacing
  const replaceUploadedFileName = (newName) => {
    console.log('[ImportFileView] replaceUploadedFileName called', { newName, uploadedFileName });
    try {
      const prev = uploadedFileName || window.localStorage.getItem('uploadedFileName');
      if (prev && prev !== newName) {
        window.localStorage.setItem('previousUploadedFileName', prev);
      }
    } catch (e) {
      console.error('localStorage error saving previousUploadedFileName', e);
    }
    setUploadedFileName(newName);
  };

  const handleFileSelect = async () => {
    try {
      const result = await window.api.showFileDialog();
      console.log('[ImportFileView] showFileDialog result', result);
      if (result.success) {
        setSelectedFileName(result.filePath);
        setPendingFileData(result.content);
        setShowConfirm(true);
        try {
          const originalName = result.filePath ? result.filePath.split(/[/\\\\]/).pop() : null;
          console.log('[ImportFileView] extracted originalName from selection', { originalName });
          if (originalName) {
            setOriginalUploadedFileName(originalName);
            // show the selected original name immediately in the UI while preserving the previous stored name
            try {
              replaceUploadedFileName(originalName);
            } catch (e) {
              console.error('Error setting displayed uploadedFileName on select', e);
            }
          }
        } catch (e) {
          console.error('Error extracting original filename on select', e);
        }
      }
    } catch (error) {
      showSnackbar('Hiba történt a fájl kiválasztása során!', 'error');
      console.error('Fájl kiválasztási hiba:', error);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const uploadResult = await window.api.uploadExcelFile({ content: pendingFileData, originalPath: selectedFileName });
      console.log('[ImportFileView] uploadResult', uploadResult);
      if (uploadResult.success) {
        showSnackbar('Fájl sikeresen feltöltve!', 'success');
        // if main returned the filename, use it; otherwise fall back to parsing
        if (uploadResult.filename) {
          console.log('[ImportFileView] backend returned filename', uploadResult.filename);
          replaceUploadedFileName(uploadResult.filename);
        } else {
          try {
            const originalName = selectedFileName ? selectedFileName.split(/[/\\\\]/).pop() : null;
            console.log('[ImportFileView] fallback originalName on confirm', { originalName });
            if (originalName) replaceUploadedFileName(originalName);
          } catch (e) {
            console.error('Error extracting original filename', e);
          }
        }
        setSelectedFileName(null);
        // refresh excel status and path using returned path if present
        setExcelExists(true);
        if (uploadResult.path) {
          console.log('[ImportFileView] uploadResult.path', uploadResult.path);
          setUploadedFilePath(uploadResult.path);
          // If backend didn't return a filename, derive it from the returned path
          if (!uploadResult.filename) {
            try {
              const nameFromPath = uploadResult.path?.split(/[/\\\\]/).pop();
              if (nameFromPath) replaceUploadedFileName(nameFromPath);
            } catch (e) {
              console.error('Error extracting filename from uploadResult.path', e);
            }
          }
        } else {
          try {
            const path = await window.api.getExcelPath?.();
            setUploadedFilePath(path);
            // also set a readable filename for display
            try {
              const nameFromPath = path ? path.split(/[/\\\\]/).pop() : null;
              if (nameFromPath) replaceUploadedFileName(nameFromPath);
            } catch (e) {
              console.error('Error extracting filename from excel path', e);
            }
          } catch (e) {
            console.error('Unable to get excel path after upload', e);
          }
        }
        // Open the sheet editor so the user can edit the uploaded Excel
        try {
          window.api.setView?.('sheet-editor');
        } catch (e) {
          console.error('Failed to open sheet editor', e);
        }
      } else {
        showSnackbar(`Hiba történt a feltöltés során: ${uploadResult.error}`, 'error');
      }
    } catch (error) {
      showSnackbar('Hiba történt a fájl feltöltése során!', 'error');
      console.error('Fájl feltöltési hiba:', error);
    } finally {
      setLoading(false);
      setShowConfirm(false);
      setPendingFileData(null);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setSelectedFileName(null);
    setPendingFileData(null);
  };

  useEffect(() => {
    setLoading(true);
    window.api.getWebSettings?.().then((settings) => {
      setWebUrls(settings?.webUrls || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // check if an excel file already exists
    window.api.getExcelStatus?.().then(async (exists) => {
      setExcelExists(!!exists);
      if (exists) {
        try {
          const path = await window.api.getExcelPath?.();
          setUploadedFilePath(path);
          // derive a readable filename from the path so the UI can display it
            try {
              const nameFromPath = path ? path.split(/[/\\\\]/).pop() : null;
              if (nameFromPath) replaceUploadedFileName(nameFromPath);
            } catch (e) {
              console.error('Error extracting filename from excel path', e);
            }
        } catch (e) {
          console.error('Error fetching excel path', e);
        }
      }
    }).catch(() => {});
  }, []);

  // load saved displayed filename from localStorage on mount (so it survives view reloads)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('uploadedFileName');
      if (saved) setUploadedFileName(saved);
      const savedOriginal = window.localStorage.getItem('originalUploadedFileName') || window.localStorage.getItem('previousUploadedFileName');
      if (savedOriginal) setOriginalUploadedFileName(savedOriginal);
    } catch (e) {
      // ignore localStorage failures
    }
  }, []);

  // persist uploadedFileName to localStorage so it remains visible across reloads
  useEffect(() => {
    try {
      if (uploadedFileName) {
        window.localStorage.setItem('uploadedFileName', uploadedFileName);
      } else {
        window.localStorage.removeItem('uploadedFileName');
      }
    } catch (e) {
      console.error('localStorage error saving uploadedFileName', e);
    }
  }, [uploadedFileName]);

  // persist original filename so we can show the user's original name even if backend renames the file
  useEffect(() => {
    try {
      if (originalUploadedFileName) {
        window.localStorage.setItem('originalUploadedFileName', originalUploadedFileName);
      } else {
        window.localStorage.removeItem('originalUploadedFileName');
      }
    } catch (e) {
      console.error('localStorage error saving originalUploadedFileName', e);
    }
  }, [originalUploadedFileName]);

  const handleAddUrl = () => {
    if (newWebUrl.trim() && !webUrls.includes(newWebUrl.trim())) {
      setWebUrls([...webUrls, newWebUrl.trim()]);
      setNewWebUrl('');
    }
  };

  const handleDeleteUrl = (url) => {
    setWebUrls(webUrls.filter((item) => item !== url));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.api.saveWebSettings?.({ webUrls });
      showSnackbar('Sikeresen mentve!', 'success');
    } catch (e) {
      showSnackbar('Hiba mentéskor!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const validateUrl = (url) => {
    const urlPattern = new RegExp(
      '^(https?:\\/\\/)?' + // protocol
      '((([a-zA-Z\\d]([a-zA-Z\\d-]*[a-zA-Z\\d])*)\\.)+[a-zA-Z]{2,}|' + // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-zA-Z\\d%_.~+()]*)*' + // port and path
      '(\\?[;&a-zA-Z\\d%_.~+=-]*)?' + // query string
      '(\\#[-a-zA-Z\\d_]*)?$',
      'i' // fragment locator
    );
    return !!urlPattern.test(url);
  };

  const handleUrlChange = (e) => {
    const value = e.target.value;
    setNewWebUrl(value);
    if (value && !validateUrl(value)) {
      setUrlError('Érvénytelen URL formátum!');
    } else {
      setUrlError('');
    }
  };


  // open the dedicated sheet editor view
  const openSheetEditor = () => {
    window.api.setView('sheet-editor');
  };

  return (
    <Paper sx={{ p: 4 }}>
      <Tabs value={section} onChange={(e, val) => setSection(val)} variant="standard" centered sx={{ mb: 2 }}>
        <Tab label="Weboldalak" value="websites" />
        <Tab label="Excel feltöltés" value="excel" />
      </Tabs>

      <Box>
        {section === 'websites' && (
          <Paper variant="outlined" sx={{ p: 4, bgcolor: '#181818', color: 'white', borderRadius: 1, boxShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
            <Typography variant="h4" gutterBottom sx={{ color: 'white', textAlign: 'center' }}>Weboldalak megadása</Typography>
            <Typography variant="h8" gutterBottom sx={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>Itt megadhatod a vállalkozásod, céged weboldalait, hogy az AI megértse mivel foglalkozik a céged, ezzel segítve a pontosabb válaszadást.</Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 2 }}>
              <TextField
                label="Új weboldal URL"
                fullWidth
                value={newWebUrl}
                onChange={handleUrlChange}
                error={!!urlError}
                helperText={urlError}
                sx={{ maxWidth: 640 }}
                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.85)' } }}
                inputProps={{ style: { color: 'white' } }}
              />
              <Button variant="contained" onClick={handleAddUrl} disabled={!newWebUrl.trim() || !!urlError} sx={{ mt: 1, bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' }, width: 180 }}>
                Hozzáadás
              </Button>
            </Box>

            <List sx={{ mt: 3, maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {webUrls.map((url, index) => (
                <ListItem key={index} sx={{ width: '100%', maxWidth: 640, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1, mb: 1 }} secondaryAction={
                  <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteUrl(url)} sx={{ color: 'white' }}>
                    <MdDelete />
                  </IconButton>
                }>
                  <ListItemText primary={url} primaryTypographyProps={{ sx: { color: 'white', wordBreak: 'break-all' } }} />
                </ListItem>
              ))}
            </List>

            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Button variant="contained" onClick={handleSave} disabled={saving || loading} sx={{ mt: 1, bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' }}}>
                {saving ? 'Mentés...' : 'Mentés'}
              </Button>
            </Box>
          </Paper>
        )}

        {section === 'excel' && (
          <Paper variant="outlined" sx={{ p: 4, mt: 1, bgcolor: '#181818', color: 'white', borderRadius: 1, boxShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
            <Typography variant="h4" gutterBottom sx={{ color: 'white', textAlign: 'center' }}>Adatbázis importálása</Typography>
            <Typography variant="h8" gutterBottom sx={{ color: 'rgba(228, 125, 0, 1)', textAlign: 'center' }}>Az adatok az AI-nak lesznek átadva. Ne adjon meg semmilyen olyan kényes adatot, amit az interneten sem osztana meg!</Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 3 }}>
              <Button
                variant="contained"
                onClick={handleFileSelect}
                disabled={loading}
                sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' }, width: 220 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Excel fájl kiválasztása'}
              </Button>

              {selectedFileName && (
                <Typography sx={{ mt: 2, color: 'white', wordBreak: 'break-all', maxWidth: 640, textAlign: 'center' }}>
                  Kiválasztott fájl: {selectedFileName}
                </Typography>
              )}

              {showConfirm && (
                <Paper sx={{ mt: 3, p: 2, bgcolor: '#222', borderRadius: 1, maxWidth: 640, width: '100%', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography sx={{ mb: 2, color: 'white' }}>
                    Figyelem! A feltöltés felülírja a meglévő adatbázist. Biztosan szeretnéd folytatni?
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleConfirm}
                      disabled={loading}
                      sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' } }}
                    >
                      Feltöltés és felülírás
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={handleCancel}
                      disabled={loading}
                      sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                    >
                      Mégsem
                    </Button>
                  </Box>
                </Paper>
              )}

              {excelExists && (
                <Button
                  variant="outlined"
                  onClick={openSheetEditor}
                  disabled={loading}
                  sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', mt: 2 }}
                >
                  Megnyitás szerkesztésre
                </Button>
              )}
              {(originalUploadedFileName || uploadedFileName) && (
                <Box sx={{ mt: 2, maxWidth: 640, textAlign: 'center' }}>
                  <Typography sx={{ color: 'rgba(255,255,255,0.75)', wordBreak: 'break-all' }}>
                    Feltöltött fájl: {originalUploadedFileName || uploadedFileName}
                  </Typography>
                  {originalUploadedFileName && originalUploadedFileName !== uploadedFileName && (
                    <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all' }}>
                      Tárolt név: {uploadedFileName}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        )}
      </Box>
    </Paper>
  );
};

export default ImportFileView;