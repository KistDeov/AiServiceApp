import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, Typography } from '@mui/material';

export default function ApiKeySettings() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    const key = await window.api.getApiKey();
    setApiKey(key);
  };

  const handleSave = async () => {
    await window.api.setApiKey(apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        OpenAI API Kulcs Beállítások
      </Typography>
      <TextField
        fullWidth
        label="OpenAI API Kulcs"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        margin="normal"
        type="password"
      />
      <Button
        variant="contained"
        onClick={handleSave}
        sx={{ mt: 2 }}
      >
        Mentés
      </Button>
      {saved && (
        <Typography color="success" sx={{ mt: 1 }}>
          API kulcs sikeresen mentve!
        </Typography>
      )}
    </Box>
  );
} 