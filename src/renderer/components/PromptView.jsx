import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, TextField, Tabs, Tab, Grid, Stack } from '@mui/material';
import CenteredLoading from './CenteredLoading';

const PromptView = ({ showSnackbar }) => {
  const [greeting, setGreeting] = useState('');
  const [signature, setSignature] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState(null);

  const [section, setSection] = useState('greeting');

  // Use full available width for section panels to maximize space
  const sectionWidth = '100%';

  // Shared styles for inner section Papers: fixed height and scroll when content overflows
  const sectionPaperSx = { p: 4, bgcolor: '#181818', color: 'white', borderRadius: 1, boxShadow: '0 1px 6px rgba(0,0,0,0.6)', height: '470px', overflowY: 'auto' };

  // Preview URL for images (when selecting before upload)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFileData, setPendingFileData] = useState(null);

  // Attachment state
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [attachmentFileSize, setAttachmentFileSize] = useState(0);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  // List attachments from backend
  const fetchAttachments = async () => {
    setAttachmentsLoading(true);
    try {
      const result = await window.api.listAttachments?.();
      if (Array.isArray(result)) {
        setAttachments(result);
      } else {
        setAttachments([]);
      }
    } catch (e) {
      setAttachments([]);
    }
    setAttachmentsLoading(false);
  };

  // Delete attachment handler
  const handleDeleteAttachment = async (name) => {
    try {
      const result = await window.api.deleteAttachment({ name });
      if (result.success) {
        showSnackbar('Csatolmány törölve!', 'success');
        fetchAttachments();
      } else {
        showSnackbar('Hiba a törléskor: ' + (result.error || ''), 'error');
      }
    } catch (e) {
      showSnackbar('Hiba a törléskor!', 'error');
    }
  };
  // Attachment file select handler
  const handleAttachmentSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { // 25MB
      showSnackbar('A fájl mérete nem lehet nagyobb 25 MB-nál!', 'error');
      return;
    }
    setAttachmentFile(file);
    setAttachmentFileName(file.name);
    setAttachmentFileSize(file.size);
  };

  // Attachment upload handler
  const handleAttachmentUpload = async () => {
    if (!attachmentFile) return;
    setAttachmentUploading(true);
    try {
      // Read file as ArrayBuffer
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        // Call API to upload attachment
        try {
          const result = await window.api.uploadAttachment({
            name: attachmentFileName,
            size: attachmentFileSize,
            content: arrayBuffer
          });
          if (result.success !== false) {
            showSnackbar('Csatolmány sikeresen feltöltve!', 'success');
            setAttachmentFile(null);
            setAttachmentFileName('');
            setAttachmentFileSize(0);
            // Frissítjük a csatolmányok listáját
            fetchAttachments();
          } else {
            showSnackbar(`Hiba a csatolmány feltöltésekor: ${result.error}`, 'error');
          }
        } catch (err) {
          showSnackbar('Hiba a csatolmány feltöltésekor!', 'error');
        }
        setAttachmentUploading(false);
      };
      reader.readAsArrayBuffer(attachmentFile);
    } catch (err) {
      showSnackbar('Hiba a csatolmány feltöltésekor!', 'error');
      setAttachmentUploading(false);
    }
  };

  const handleImgSelect = async () => {
    try {
      const result = await window.api.showImageDialog();
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

  const handleImgDelete = async () => {
    setLoading(true);
    try {
      const deleteResult = await window.api.deleteSignatureImage?.();
      if (deleteResult?.success !== false) {
        setSignatureImage('');
        setSignaturePreviewUrl(null);
        showSnackbar('Kép sikeresen törölve!', 'success');
      } else {
        showSnackbar(`Hiba történt a törlés során: ${deleteResult?.error}`, 'error');
      }
    } catch (error) {
      showSnackbar('Hiba történt a kép törlése során!', 'error');
      console.error('Kép törlési hiba:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const uploadResult = await window.api.uploadImageFile(pendingFileData);
      if (uploadResult.success !== false) {
        // After upload succeed, convert pendingFileData (ArrayBuffer or base64/data URL string)
        // into a stable data URL and store it in signatureImage so preview stays visible.
        try {
          let dataUrl = null;
          if (pendingFileData) {
            if (typeof pendingFileData === 'string') {
              if (pendingFileData.startsWith('data:')) {
                dataUrl = pendingFileData;
              } else {
                dataUrl = `data:image/png;base64,${pendingFileData}`;
              }
            } else if (pendingFileData instanceof ArrayBuffer || ArrayBuffer.isView(pendingFileData)) {
              // Convert ArrayBuffer/TypedArray to data URL
              const blob = new Blob([pendingFileData]);
              dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            }
          }

          if (dataUrl) {
            setSignatureImage(dataUrl);
            setSignaturePreviewUrl(dataUrl);
          } else {
            // Fallback to known static path used by app
            setSignatureImage('src/images/signature.png');
          }

          // Buildelt módban próbáljuk a képet az exe mellé is másolni
          if (window.api.copyImageToExeRoot) {
            await window.api.copyImageToExeRoot();
          }

          showSnackbar('Fájl sikeresen feltöltve!', 'success');
          setSelectedFileName(null);
        } catch (convErr) {
          console.error('Preview conversion error:', convErr);
          showSnackbar('Fájl feltöltve, de előnézet konvertálása sikertelen.', 'warning');
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
    window.api.getPromptSettings?.().then((settings) => {
      setGreeting(settings?.greeting || '');
      setSignature(settings?.signature || '');
      setSignatureImage(settings?.signatureImage || '');
      setSignatureText(settings?.signatureText || '');
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
    fetchAttachments();
  }, []);

  // Build preview URL when pendingFileData changes (supports ArrayBuffer, base64 string, or data URL)
  useEffect(() => {
    let url = null;
    if (!pendingFileData) {
      setSignaturePreviewUrl(null);
      return;
    }

    try {
      // If it's an ArrayBuffer (or typed array), create a blob URL
      if (pendingFileData instanceof ArrayBuffer || ArrayBuffer.isView(pendingFileData)) {
        const blob = new Blob([pendingFileData]);
        url = URL.createObjectURL(blob);
      } else if (typeof pendingFileData === 'string') {
        // If string starts with data: it's already a data URL
        if (pendingFileData.startsWith('data:')) {
          url = pendingFileData;
        } else {
          // Assume base64 image data (png) and build a data URL
          url = `data:image/png;base64,${pendingFileData}`;
        }
      }
    } catch (err) {
      console.error('Error creating preview URL for image:', err);
      url = null;
    }

    setSignaturePreviewUrl(url);

    return () => {
      if (url && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch (e) { }
      }
    };
  }, [pendingFileData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.api.savePromptSettings?.({ greeting, signature, signatureText, signatureImage });
      showSnackbar('Sikeresen mentve!', 'success');
    } catch (e) {
      showSnackbar('Hiba mentéskor!', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CenteredLoading />;

  return (
    <Paper sx={{ p: 4, maxHeight: '85vh', height: '85vh', overflowY: 'auto' }}>
      <Tabs value={section} onChange={(e, val) => setSection(val)} variant="standard" centered sx={{ mb: 2 }}>
        <Tab label="Megszólítás szövege" value="greeting" />
        <Tab label="Üdvözlés szövege" value="signature" />
        <Tab label="Aláírás" value="signatureText" />
        <Tab label="Signo" value="signo" />
        <Tab label="Csatolmány" value="attachment" />
      </Tabs>

      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: sectionWidth, maxWidth: 1200 }}>
          {section === 'greeting' && (
            <Paper
              variant="outlined"
              sx={sectionPaperSx}
            >
              <Typography
                variant="h6"
                align="center"
                gutterBottom
                sx={{ color: 'white', fontSize: { xs: '1.25rem', sm: '1.45rem', md: '1.56rem' } }}
              >
                Megszólítás
              </Typography>
              <TextField
                label="Ide írhatja, milyen megszólítás szerepeljen a levélben"
                variant="outlined"
                fullWidth
                multiline
                rows={8}
                sx={{ mt: 2, '& .MuiInputBase-input': { fontSize: '1.25rem' }, '& .MuiInputLabel-root': { fontSize: '1.13rem' } }}
                value={greeting}
                onChange={e => setGreeting(e.target.value)}
                disabled={loading}
                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.85)' } }}
                inputProps={{ style: { color: 'white' } }}
              />
            </Paper>
          )}

          {section === 'signature' && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Typography variant="h6" align="center" gutterBottom sx={{ color: 'white', fontSize: { xs: '1.25rem', sm: '1.45rem', md: '1.56rem' } }}>Üdvözlés</Typography>
              <TextField
                label="Ide írhatja, milyen üdvözlés szerepeljen a levélben"
                variant="outlined"
                fullWidth
                multiline
                rows={8}
                sx={{ mt: 2, '& .MuiInputBase-input': { fontSize: '1.25rem' } }}
                value={signature}
                onChange={e => setSignature(e.target.value)}
                disabled={loading}
                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.85)' } }}
                inputProps={{ style: { color: 'white' } }}
              />
            </Paper>
          )}

          {section === 'signatureText' && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Typography variant="h6" align="center" gutterBottom sx={{ color: 'white', fontSize: { xs: '1.25rem', sm: '1.45rem', md: '1.56rem' } }}>Aláírás</Typography>
              <TextField
                label="Itt szerkesztheti a levél aláírását"
                variant="outlined"
                fullWidth
                multiline
                rows={8}
                sx={{ mt: 2, '& .MuiInputBase-input': { fontSize: '1.25rem' } }}
                value={signatureText}
                onChange={e => setSignatureText(e.target.value)}
                disabled={loading}
                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.85)' } }}
                inputProps={{ style: { color: 'white' } }}
              />
            </Paper>
          )}

          {section === 'signo' && (
            <Paper variant="outlined" sx={{ ...sectionPaperSx, position: 'relative' }}>
              <Typography variant="h6" align="center" gutterBottom sx={{ color: 'white', fontSize: { xs: '1.25rem', sm: '1.45rem', md: '1.56rem' } }}>Signo</Typography>
              <Grid container spacing={3} sx={{ mt: 1, alignItems: 'center' }}>
                {/* Left column: compact controls stacked and vertically centered (make buttons smaller) */}
                <Grid item xs={12} md={8} sx={{ display: 'flex', alignItems: 'center', pr: { md: '340px' } }}>
                  <Stack spacing={1.5} sx={{ width: '100%', maxWidth: 520 }}>
                    <Button
                      variant="contained"
                      onClick={handleImgSelect}
                      disabled={loading}
                      size="medium"
                      sx={{ width: '100%', py: 1, fontSize: '0.95rem', bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' } }}
                    >
                      {loading ? <CircularProgress size={18} /> : 'Kép fájl kiválasztása'}
                    </Button>

                    <Button
                      variant="contained"
                      onClick={handleImgDelete}
                      disabled={loading}
                      size="medium"
                      sx={{ width: '100%', py: 1, fontSize: '0.95rem', bgcolor: '#d32f2f', '&:hover': { bgcolor: '#e05555' } }}
                    >
                      {loading ? <CircularProgress size={18} /> : 'Kép törlése'}
                    </Button>

                    {selectedFileName && (
                      <Typography sx={{ mt: 0.5, color: 'white', fontSize: { xs: '0.9rem', sm: '0.95rem' }, wordBreak: 'break-all' }}>
                        Kiválasztott fájl: <strong>{selectedFileName}</strong>
                      </Typography>
                    )}

                    {showConfirm && (
                      <Paper sx={{ p: 2, bgcolor: '#222', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Typography sx={{ mb: 1.5, fontSize: '0.95rem' }}>
                          Figyelem! A feltöltés felülírja a meglévő signot. Biztosan szeretnéd folytatni?
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                          <Button
                            variant="contained"
                            onClick={handleConfirm}
                            disabled={loading}
                            size="medium"
                            sx={{ bgcolor: '#ffd400', color: '#000', '&:hover': { bgcolor: '#ffdb4d' }, fontSize: '0.95rem' }}
                          >
                            Feltöltés és felülírás
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={handleCancel}
                            disabled={loading}
                            size="medium"
                            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.95rem' }}
                          >
                            Mégsem
                          </Button>
                        </Stack>
                      </Paper>
                    )}
                  </Stack>
                </Grid>

                {/* Right column: fixed 300x300 square preview aligned to the right edge */}
                <Grid item xs={12} md={4} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', width: 300, height: 300, bgcolor: '#222', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px dashed rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)' }}>
                    {signaturePreviewUrl || signatureImage ? (
                      <img
                        src={signaturePreviewUrl || signatureImage}
                        alt="Preview"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.95rem' }}>Nincs kép kiválasztva</Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          )}

          {section === 'attachment' && (
            <Paper variant="outlined" sx={{ ...sectionPaperSx, p: 3 }}>
              <Typography variant="h6" align="center" gutterBottom sx={{ color: 'white', fontSize: { xs: '1.25rem', sm: '1.45rem', md: '1.56rem' } }}>Csatolmány</Typography>
              <Box sx={{ mt: 2, mb: 2 }}>
                <input
                  type="file"
                  id="attachment-input"
                  style={{ display: 'none' }}
                  onChange={handleAttachmentSelect}
                  disabled={attachmentUploading || loading}
                />
                <label htmlFor="attachment-input">
                  <Button variant="contained" component="span" disabled={attachmentUploading || loading}>
                    Fájl kiválasztása
                  </Button>
                </label>
                {attachmentFileName && (
                  <Typography sx={{ mt: 1, color: 'white', fontSize: { xs: '0.95rem', sm: '1rem' } }}>
                    Kiválasztott fájl: {attachmentFileName} ({(attachmentFileSize / (1024 * 1024)).toFixed(2)} MB)
                  </Typography>
                )}
                <Button
                  sx={{ ml: 2 }}
                  variant="contained"
                  color="primary"
                  onClick={handleAttachmentUpload}
                  disabled={!attachmentFile || attachmentUploading || loading}
                >
                  {attachmentUploading ? <CircularProgress size={24} /> : 'Feltöltés'}
                </Button>
              </Box>

              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Feltöltött csatolmányok:</Typography>
                {attachmentsLoading ? (
                  <CenteredLoading size={28} text={'Betöltés...'} />
                ) : attachments.length === 0 ? (
                  <Typography>Nincs csatolmány feltöltve.</Typography>
                ) : (
                  attachments.map((file) => (
                    <Box key={file} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography sx={{ flex: 1 }}>{file}</Typography>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => handleDeleteAttachment(file)}
                        sx={{ ml: 2 }}
                      >
                        Törlés
                      </Button>
                    </Box>
                  ))
                )}
              </Box>
            </Paper>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <Button variant="contained" color="primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Mentés...' : 'Mentés'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default PromptView;