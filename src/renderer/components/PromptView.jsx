import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Button, TextField } from '@mui/material';

const PromptView = ({ showSnackbar }) => {
  const [greeting, setGreeting] = useState('');
  const [signature, setSignature] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState(null);

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
        setSignatureImage('src/images/signature.png');
        // Buildelt módban próbáljuk a képet az exe mellé is másolni
        if (window.api.copyImageToExeRoot) {
          await window.api.copyImageToExeRoot();
        }
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

  return (
      <Paper sx={{ p: 4, maxHeight: '85vh', overflowY: 'auto'}}>
        <Typography sx={{ mt: 3 }} variant="h4" gutterBottom>Megszólítás szövege</Typography>
        <TextField
          label="Ide írhatja, milyen megszólítás szerepeljen a levélben"
          variant="outlined"
          fullWidth
          multiline
          rows={6}
          sx={{ mt: 2 }}
          value={greeting}
          onChange={e => setGreeting(e.target.value)}
          disabled={loading}
        />
        <Typography sx={{ mt: 4 }} variant="h4" gutterBottom>Üdvözlés szövege</Typography>
        <TextField
          label="Ide írhatja, milyen üdvözlés szerepeljen a levélben"
          variant="outlined"
          fullWidth
          multiline
          rows={6}
          sx={{ mt: 2 }}
          value={signature}
          onChange={e => setSignature(e.target.value)}
          disabled={loading}
        />
        <Typography sx={{ mt: 4 }} variant="h4" gutterBottom>Aláírás</Typography>
        <TextField
          label="Itt szerkesztheti a levél aláírását"
          variant="outlined"
          fullWidth
          multiline
          rows={6}
          sx={{ mt: 2 }}
          value={signatureText}
          onChange={e => setSignatureText(e.target.value)}
          disabled={loading}
        />
        <Typography sx={{ mt: 4 }} variant="h4" gutterBottom>Signo</Typography>
        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            onClick={handleImgSelect}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Kép fájl kiválasztása'}
          </Button>
          <Button sx={{ ml: 2, backgroundColor: 'red' }}
            variant="contained"
            onClick={handleImgDelete}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Kép törlése'}
          </Button>
          {selectedFileName && (
            <Typography sx={{ mt: 2 }}>
              Kiválasztott fájl: {selectedFileName}
            </Typography>
          )}
          {showConfirm && (
            <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
              <Typography sx={{ mb: 2 }}>
                Figyelem! A feltöltés felülírja a meglévő signot. Biztosan szeretnéd folytatni?
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
        {/* Attachment section */}
        <Typography sx={{ mt: 4 }} variant="h4" gutterBottom>Csatolmány</Typography>
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
            <Typography sx={{ mt: 1 }}>
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

        {/* Attachment list and delete buttons */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Feltöltött csatolmányok:</Typography>
          {attachmentsLoading ? (
            <CircularProgress size={24} />
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

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
          <Button variant="contained" color="primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Mentés...' : 'Mentés'}
          </Button>
        </Box>
      </Paper>
  );
};

export default PromptView;