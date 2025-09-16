import React, { useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Button } from '@mui/material';

const ImportFileView = ({ showSnackbar }) => {
  const [selectedFileName, setSelectedFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFileData, setPendingFileData] = useState(null);

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

  return (
    <Paper sx={{ p: 4 }}>
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
    </Paper>
  );
};

export default ImportFileView; 