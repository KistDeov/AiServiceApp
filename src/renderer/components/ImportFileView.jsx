import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Button, TextField, IconButton, List, ListItem, ListItemText } from '@mui/material';
import { MdDelete } from "react-icons/md";


const ImportFileView = ({ showSnackbar }) => {
  const [selectedFileName, setSelectedFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFileData, setPendingFileData] = useState(null);
  const [webUrls, setWebUrls] = useState([]);
  const [newWebUrl, setNewWebUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');

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
      <Box>
        <Typography variant="h4" gutterBottom>Weboldalak megadása</Typography>
        <Typography variant="h8" gutterBottom>Itt megadhatod a vállalkozásod, céged weboldalait, hogy az AI megértse mivel foglalkozik a céged, ezzel segítve a pontosabb válaszadást.</Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <TextField
            label="Új weboldal URL"
            fullWidth
            value={newWebUrl}
            onChange={handleUrlChange}
            error={!!urlError}
            helperText={urlError}
          />
          <Button variant="contained" color="primary" onClick={handleAddUrl} disabled={!newWebUrl.trim() || !!urlError}>
            Hozzáadás
          </Button>
        </Box>
        <List sx={{ mt: 2, maxHeight: 180, overflowY: 'auto' }}>
          {webUrls.map((url, index) => (
            <ListItem key={index} secondaryAction={
              <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteUrl(url)}>
                <MdDelete />
              </IconButton>
            }>
              <ListItemText primary={url} />
            </ListItem>
          ))}
        </List>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
        <Button variant="contained" color="primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Mentés...' : 'Mentés'}
        </Button>
      </Box>
      
      <Box sx={{mt:4}}>
        <Typography variant="h4" gutterBottom>Adatbázis importálása</Typography>
        <Typography variant="h8" color="warning" gutterBottom>Az adatok az AI-nak lesznek átadva. Ne adjon meg semmilyen olyan kényes adatot, amit az interneten sem osztana meg!</Typography>
        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            onClick={handleFileSelect}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Excel fájl kiválasztása'}
          </Button>
          {selectedFileName && (
            <Typography sx={{ mt: 2 }}>
              Kiválasztott fájl: {selectedFileName}
            </Typography>
          )}
          {showConfirm && (
            <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
              <Typography sx={{ mb: 2 }}>
                Figyelem! A feltöltés felülírja a meglévő adatbázist. Biztosan szeretnéd folytatni?
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  Feltöltés és felülírás
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Mégsem
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Paper>

  );
};

export default ImportFileView;