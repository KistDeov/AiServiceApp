import React, { useState, useEffect } from 'react';
import { Paper, Typography, Tabs, Tab, TextField, Button, Box, CircularProgress } from '@mui/material';

const SheetEditorView = ({ showSnackbar }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excelSheets, setExcelSheets] = useState([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetEditText, setSheetEditText] = useState('');

  const loadExcelSheets = async () => {
    try {
      setLoading(true);
      const res = await window.api.readExcelFile?.();
      if (res && res.success) {
        setExcelSheets(res.sheets || []);
        setActiveSheetIndex(0);
        if (res.sheets && res.sheets[0]) {
          const text = res.sheets[0].data.map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c)).join('\t')).join('\n');
          setSheetEditText(text);
        }
      } else {
        showSnackbar('Nem sikerült beolvasni az Excel fájlt: ' + (res?.error || ''), 'error');
      }
    } catch (e) {
      console.error(e);
      showSnackbar('Hiba az Excel beolvasásakor', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExcelSheets();
  }, []);

  const handleSheetChange = (e, index) => {
    setActiveSheetIndex(index);
    const sheet = excelSheets[index];
    if (sheet) {
      const text = (sheet.data || []).map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c)).join('\t')).join('\n');
      setSheetEditText(text);
    } else {
      setSheetEditText('');
    }
  };

  const handleSaveExcel = async () => {
    try {
      setSaving(true);
      const sheets = excelSheets.map((s, idx) => {
        if (idx === activeSheetIndex) {
          const rows = sheetEditText.split('\n').map((line) => line.split('\t').map((c) => c));
          return { name: s.name || `Sheet${idx+1}`, data: rows };
        }
        return { name: s.name || `Sheet${idx+1}`, data: s.data || [] };
      });
      const res = await window.api.saveExcelFile?.({ sheets });
      if (res && res.success) {
        showSnackbar('Excel sikeresen mentve!', 'success');
        // refresh the loaded sheets to reflect any changes written by the main process
        try {
          await loadExcelSheets();
        } catch (e) {
          // ignore reload errors, user already got success message
        }
      } else {
        showSnackbar('Hiba a mentéskor: ' + (res?.error || ''), 'error');
      }
    } catch (e) {
      console.error(e);
      showSnackbar('Hiba a mentés során', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 4, mt: 1, bgcolor: '#181818', color: 'white', borderRadius: 1, boxShadow: '0 1px 6px rgba(0,0,0,0.6)', maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}>
      <Typography variant="h4" gutterBottom sx={{ color: 'white', textAlign: 'center' }}>Excel szerkesztő</Typography>
      <Typography variant="h8" gutterBottom sx={{ color: 'rgba(228, 125, 0, 1)', textAlign: 'center' }}>Itt szerkesztheted az importált Excel fájl munkalapjait.</Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : (
        <>
          <Tabs value={activeSheetIndex} onChange={handleSheetChange} sx={{ mb: 1 }}>
            {excelSheets.map((s, i) => <Tab key={i} label={s.name || `Sheet ${i+1}`} value={i} />)}
          </Tabs>

          <TextField
            multiline
            fullWidth
            value={sheetEditText}
            onChange={(e) => setSheetEditText(e.target.value)}
            sx={{
              // fixed-height root so the field doesn't grow with content
              '& .MuiOutlinedInput-root': {
                alignItems: 'flex-start',
                backgroundColor: '#111',
              },
              // ensure general input text color
              '& .MuiInputBase-input': {
                color: 'white',
              },
              // specifically target the multiline textarea so it scrolls internally
              '& .MuiInputBase-inputMultiline': {
                minHeight: 360,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '12px',
                boxSizing: 'border-box',
                resize: 'vertical',
                whiteSpace: 'pre-wrap',
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.2)',
              },
            }}
            variant="outlined"
          />

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
            <Button variant="contained" onClick={handleSaveExcel} disabled={saving} sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' } }}>
              {saving ? 'Mentés...' : 'Mentés Excelbe'}
            </Button>
            <Button variant="outlined" onClick={() => window.api.setView?.('import')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>Vissza</Button>
          </Box>
        </>
      )}
    </Paper>
  );
};

export default SheetEditorView;
