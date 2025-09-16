import React, { useEffect, useState } from 'react';
import { Paper, Typography, Box, CircularProgress } from '@mui/material';

const MailStructureView = () => {
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [signature, setSignature] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [signatureImage, setSignatureImage] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const settings = await window.api.getPromptSettings?.();
        setGreeting(settings?.greeting || '');
        setSignature(settings?.signature || '');
        setSignatureText(settings?.signatureText || '');
        // Mindig abszolút file URL-t használj!
        const imageUrl = await window.api.getSignatureImageFileUrl?.();
        setSignatureImage(imageUrl || '');
      } catch {
        // Hibakezelés
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const body = 'Ez egy teszt e-mail törzsszöveg, amely bemutatja, hogyan jelenik meg az Ai által megszerkesztett levél. Ez a rész a levél tartalma, amit az Ai írt.';

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Paper sx={{ p: 4, width: 800, mx: 'auto', mt: 6, wordWrap: 'break-word' }}>
      <Typography variant="h5" gutterBottom>Levél előnézete</Typography><br />
      <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {greeting}
      </Typography>
      <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {body}
      </Typography>
      <Typography sx={{ mt: 2 }}>
        {signature}
      </Typography>
      <Typography sx={{ mt: 2 }}>
        {signatureText}
      </Typography>
      {/* Only show the image if signatureImage is a non-empty string */}
      {signatureImage && signatureImage.trim() !== '' && (
        <Box sx={{ mt: 2 }}>
          <img src={signatureImage} style={{ width: "300px" }} />
        </Box>
      )}
    </Paper>
  );
};

export default MailStructureView;