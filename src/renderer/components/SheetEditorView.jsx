import React, { useState, useEffect } from 'react';
import { Paper, Typography, Tabs, Tab, TextField, Button, Box, IconButton } from '@mui/material';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { MdDelete } from 'react-icons/md';
import { FaArrowCircleRight } from 'react-icons/fa';
import CenteredLoading from './CenteredLoading';

const SheetEditorView = ({ showSnackbar, embedded = false, onClose }) => {
  const MAX_SHEETS = 3;
  const MAX_CHARS_PER_SHEET = 1000; // character limit per sheet

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excelSheets, setExcelSheets] = useState([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetEditText, setSheetEditText] = useState('');
  const [excelFilename, setExcelFilename] = useState('');

  const loadExcelSheets = async () => {
    try {
      setLoading(true);
      const res = await window.api.readExcelFile?.();
      if (res && res.success) {
        let sheets = res.sheets || [];
        // enforce maximum number of sheets by truncating extra ones
        if (sheets.length > MAX_SHEETS) {
          showSnackbar?.(`Maximum ${MAX_SHEETS} munkalap engedélyezett. A további lapok el lesznek távolítva.`, 'error');
          sheets = sheets.slice(0, MAX_SHEETS);
        }
        // enforce character limit per sheet by truncating data text
        sheets = sheets.map((s) => {
          const text = (s.data || []).map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c)).join('\t')).join('\n');
          if (text.length > MAX_CHARS_PER_SHEET) {
            showSnackbar?.(`A(z) "${s.name || ''}" munkalap túl hosszú; levágjuk ${MAX_CHARS_PER_SHEET} karakterre.`, 'warning');
            const truncatedText = text.slice(0, MAX_CHARS_PER_SHEET);
            const rows = truncatedText.split('\n').map((line) => line.split('\t').map((c) => c));
            return { ...s, data: rows };
          }
          return s;
        });
        setExcelSheets(sheets);
        // preserve the previously active sheet index if possible, otherwise default to 0
        const prev = activeSheetIndex || 0;
        const newActive = (sheets.length > 0) ? Math.min(prev, sheets.length - 1) : 0;
        setActiveSheetIndex(newActive);
        if (sheets && sheets[newActive]) {
          const text = (sheets[newActive].data || []).map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c)).join('\t')).join('\n');
          setSheetEditText(text.slice(0, MAX_CHARS_PER_SHEET));
        } else {
          setSheetEditText('');
        }
        // also try to get the current excel file path so we can display its filename
        try {
          const p = await window.api.getExcelPath?.();
          if (p) {
            const parts = String(p).split(/[/\\\\]/);
            setExcelFilename(parts[parts.length - 1] || '');
          } else {
            setExcelFilename('');
          }
        } catch (e) {
          setExcelFilename('');
        }
      } else {
        showSnackbar('Nincs excel fájl feltöltve. A szerkesztéshez tölts fel egyet.');
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
    // Persist current editor contents into the previously active sheet before switching
    // (so edits are not lost and will be written for all sheets on save)
    const prevIndex = activeSheetIndex;
    const currentText = sheetEditText;
    // build a new sheets array with the previous sheet's data updated
    // enforce char limit when persisting previous sheet
    const updatedSheets = excelSheets.map((s, i) => {
      if (i !== prevIndex) return s;
      let text = (currentText || '');
      if (text.length > MAX_CHARS_PER_SHEET) {
        showSnackbar?.(`A munkalap tartalma túl hosszú, csak az első ${MAX_CHARS_PER_SHEET} karakter kerül mentésre.`, 'warning');
        text = text.slice(0, MAX_CHARS_PER_SHEET);
      }
      const rows = text.split('\n').map((line) => line.split('\t').map((c) => c));
      return { ...s, data: rows };
    });
    setExcelSheets(updatedSheets);

    // now switch to the requested sheet and load its text
    setActiveSheetIndex(index);
    const sheet = updatedSheets[index];
    if (sheet) {
      const text = (sheet.data || []).map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c)).join('\t')).join('\n');
      setSheetEditText(text);
    } else {
      setSheetEditText('');
    }
  };

  const handlePrevSheet = () => {
    if (!excelSheets || excelSheets.length === 0) return;
    if (activeSheetIndex > 0) {
      // reuse the same logic as the tab change handler
      handleSheetChange(null, activeSheetIndex - 1);
    }
  };

  const handleNextSheet = () => {
    if (!excelSheets || excelSheets.length === 0) return;
    if (activeSheetIndex < excelSheets.length - 1) {
      handleSheetChange(null, activeSheetIndex + 1);
    }
  };

  const handleAddSheet = () => {
    // enforce max sheets
    if (excelSheets.length >= MAX_SHEETS) {
      showSnackbar?.(`Maximum ${MAX_SHEETS} munkalap engedélyezett.`, 'error');
      return;
    }
    // create an empty sheet with a default name that doesn't clash
    const baseName = 'Munka';
    let idx = excelSheets.length + 1;
    let name = `${baseName}${idx}`;
    const existingNames = new Set(excelSheets.map(s => s.name));
    while (existingNames.has(name)) {
      idx += 1;
      name = `${baseName}${idx}`;
    }
    const newSheet = { name, data: [['']] };
    const newSheets = [...excelSheets, newSheet];
    setExcelSheets(newSheets);
    const newIndex = newSheets.length - 1;
    setActiveSheetIndex(newIndex);
    // set the editor text to a single empty cell row
    setSheetEditText('');
  };

  const [renameValue, setRenameValue] = useState('');
  const [renameIndex, setRenameIndex] = useState(-1);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(-1);
  const [confirmExportOpen, setConfirmExportOpen] = useState(false);

  const openRename = (index) => {
    const s = excelSheets[index];
    setRenameValue(s?.name || `Sheet${index+1}`);
    setRenameIndex(index);
  };

  const applyRename = () => {
    if (renameIndex < 0) return;
    const trimmed = (renameValue || '').trim() || `Sheet${renameIndex+1}`;
    // ensure uniqueness
    const existing = new Set(excelSheets.map((s, i) => i === renameIndex ? null : s.name));
    let finalName = trimmed;
    let suffix = 1;
    while (existing.has(finalName)) {
      finalName = `${trimmed}_${suffix}`;
      suffix += 1;
    }
    const updated = excelSheets.map((s, i) => i === renameIndex ? { ...s, name: finalName } : s);
    setExcelSheets(updated);
    setRenameIndex(-1);
    setRenameValue('');
  };

  const requestDelete = (index) => {
    setConfirmDeleteIndex(index);
  };

  const cancelDelete = () => setConfirmDeleteIndex(-1);

  const confirmDelete = () => {
    const idx = confirmDeleteIndex;
    if (idx < 0) return;
    // prevent deleting last sheet
    if (excelSheets.length <= 1) {
      showSnackbar('Nem törölheted az utolsó munkalapot.', 'error');
      setConfirmDeleteIndex(-1);
      return;
    }
    const updated = excelSheets.filter((_, i) => i !== idx);
    setExcelSheets(updated);
    // adjust active index
    const newActive = Math.max(0, Math.min(activeSheetIndex, updated.length - 1));
    setActiveSheetIndex(newActive);
    // update edit text to the current active sheet
    const sheet = updated[newActive];
    const text = (sheet?.data || []).map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c)).join('\t')).join('\n');
    setSheetEditText(text);
    setConfirmDeleteIndex(-1);
  };

  const handleSaveExcel = async () => {
    try {
      setSaving(true);
      // Ensure current editor contents are persisted into the sheets we send to the backend
      // persist current editor contents into the sheets we send to the backend
      const sheetsToSave = excelSheets.map((s, idx) => {
        if (idx === activeSheetIndex) {
          let text = (sheetEditText || '');
          if (text.length > MAX_CHARS_PER_SHEET) {
            showSnackbar?.(`A munkalap mentésekor a tartalom túl hosszú; csak az első ${MAX_CHARS_PER_SHEET} karakter kerül mentésre.`, 'warning');
            text = text.slice(0, MAX_CHARS_PER_SHEET);
          }
          const rows = text.split('\n').map((line) => line.split('\t').map((c) => c));
          return { name: s.name || `Sheet${idx+1}`, data: rows };
        }
        return { name: s.name || `Sheet${idx+1}`, data: s.data || [] };
      });

      // If there are no existing sheets (edge case), create one from editor content
      const sheetsArg = (sheetsToSave.length > 0) ? sheetsToSave : [{ name: 'Sheet1', data: (sheetEditText || '').split('\n').map(l => l.split('\t').map(c => c)) }];

      // final enforcement: ensure no more than MAX_SHEETS are saved
      if (sheetsArg.length > MAX_SHEETS) {
        showSnackbar?.(`Mentés előtt a munkalapok száma maximalizálva lesz ${MAX_SHEETS}-re.`, 'warning');
      }

      const res = await window.api.saveExcelFile?.({ sheets: sheetsArg });
      if (res && res.success) {
        showSnackbar('Excel sikeresen mentve!', 'success');
        // update local state to match what we sent (so the view immediately reflects the saved data)
        setExcelSheets(sheetsArg);
        // attempt to reload from backend to pick up any canonical changes, preserving active index
        try {
          await loadExcelSheets();
        } catch (e) {
          // ignore reload errors — user already got success message
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
    <Paper sx={{ p: 4, mt: 1, bgcolor: '#181818', color: 'white', borderRadius: 1, boxShadow: '0 1px 6px rgba(0,0,0,0.6)', maxHeight: 'calc(100vh - 240px)', display: 'flex', flexDirection: 'column', maxWidth: 1200 }}>

      {loading ? (
        <CenteredLoading />
      ) : (
        <>
          {/* Tabs area - title above the tabs */}
          <Box sx={{ mb: 1, width: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ color: 'white', textAlign: 'center' }}>Adatbázis szerkesztése</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <IconButton onClick={handlePrevSheet} disabled={excelSheets.length === 0 || activeSheetIndex <= 0} sx={{ color: 'primary.main', flex: '0 0 auto', mr: 1 }} aria-label="Előző">
                <FaArrowCircleRight style={{ transform: 'rotate(180deg)' }} />
              </IconButton>

              <Tabs
                value={activeSheetIndex}
                onChange={handleSheetChange}
                sx={{ flex: 1, maxWidth: 1000, minWidth: 0 }}
              >
                {excelSheets.map((s, i) => (
                  <Tab key={i} label={s.name || `Sheet ${i+1}`} value={i} />
                ))}
              </Tabs>

              <IconButton onClick={handleNextSheet} disabled={excelSheets.length === 0 || activeSheetIndex >= excelSheets.length - 1} sx={{ color: 'primary.main', flex: '0 0 auto', ml: 1 }} aria-label="Következő">
                <FaArrowCircleRight />
              </IconButton>
            </Box>
          </Box>
          {/* Scrollable content area */}
          <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
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
            <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.65)', textAlign: 'right' }}>
              {Math.min(sheetEditText.length, MAX_CHARS_PER_SHEET)} / {MAX_CHARS_PER_SHEET} karakter
            </Typography>
          </Box>

          {/* Sticky footer with action buttons so they remain visible */}
          <Box sx={{ position: 'sticky', bottom: 0, zIndex: 10, bgcolor: '#181818', borderTop: '1px solid rgba(255,255,255,0.04)', p: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" onClick={() => setConfirmExportOpen(true)} disabled={saving} sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' }, minWidth: 160 }}>
              {saving ? 'Mentés...' : 'Exortálás Excelbe'}
            </Button>
            <Button variant="outlined" onClick={handleAddSheet} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', minWidth: 140 }} disabled={excelSheets.length >= MAX_SHEETS}>Új munkalap</Button>
            <Button variant="outlined" onClick={() => openRename(activeSheetIndex)} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', minWidth: 120 }}>Átnevez</Button>
            <IconButton onClick={() => requestDelete(activeSheetIndex)} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.08)' }}>
              <MdDelete />
            </IconButton>
          </Box>
        </>
      )}
      {/* Rename dialog */}
      <Dialog open={renameIndex >= 0} onClose={() => setRenameIndex(-1)}>
        <DialogTitle>Munkalap átnevezése</DialogTitle>
        <DialogContent>
          <TextField fullWidth value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameIndex(-1)}>Mégsem</Button>
          <Button onClick={applyRename} variant="contained" sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' } }}>Mentés</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={confirmDeleteIndex >= 0} onClose={cancelDelete}>
        <DialogTitle>Munkalap törlése</DialogTitle>
        <DialogContent>
          <Typography>Biztosan törölni szeretnéd a(z) "{excelSheets[confirmDeleteIndex]?.name}" munkalapot?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDelete}>Mégsem</Button>
          <Button onClick={confirmDelete} variant="contained" color="error">Törlés</Button>
        </DialogActions>
      </Dialog>

      {/* Export confirm dialog */}
      <Dialog open={confirmExportOpen} onClose={() => setConfirmExportOpen(false)}>
        <DialogTitle>Exportálás megerősítése</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan exportálod a jelenlegi munkalapokat? A korábban feltöltött Excel munkafüzet felülíródik.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmExportOpen(false)}>Mégsem</Button>
          <Button onClick={() => { setConfirmExportOpen(false); handleSaveExcel(); }} variant="contained" sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' } }}>Exportálás</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SheetEditorView;
