import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Button, TextField, IconButton, List, ListItem, ListItemText, Tabs, Tab } from '@mui/material';
import { MdDelete } from 'react-icons/md';

const ImportFileView = ({ showSnackbar }) => {
  const [selectedFileName, setSelectedFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFileData, setPendingFileData] = useState(null);
  const [webUrls, setWebUrls] = useState([]);
  const [newWebUrl, setNewWebUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [section, setSection] = useState('websites');

  const handleFileSelect = async () => {
    try {
      const result = await window.api.showFileDialog();
      if (result.success) {
        setSelectedFileName(result.filePath);
        setPendingFileData(result.content);
        setShowConfirm(true);
      }
    } catch (error) {
      showSnackbar('Hiba történt a fájl kiválasztása során!', 'error');
      console.error('Fájl kiválasztási hiba:', error);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const uploadResult = await window.api.uploadExcelFile(pendingFileData);
      if (uploadResult.success) {
        showSnackbar('Fájl sikeresen feltöltve!', 'success');
        setSelectedFileName(null);
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
  }, []);

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
            </Box>
          </Paper>
        )}
      </Box>
    </Paper>
  );
};

export default ImportFileView;