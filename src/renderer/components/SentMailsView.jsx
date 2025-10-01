import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, TextField } from '@mui/material';
import CenteredLoading from './CenteredLoading';
import { useTheme } from '@mui/material/styles';

const SentMailsView = ({ showSnackbar }) => {
  const theme = useTheme();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    window.api.readSentEmailsLog?.()
      .then((data) => {
        setEmails(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Hiba az elküldött levelek lekérésekor:', err);
        setLoading(false);
        showSnackbar('Hiba az elküldött levelek lekérésekor', 'error');
      });
  }, []);

  const filteredEmails = emails.filter(email => {
    const q = search.toLowerCase();
    const dateStr = email.date ? new Date(email.date).toISOString().slice(0, 10) : '';
    return (
      (!q) ||
      (email.subject && email.subject.toLowerCase().includes(q)) ||
      (email.to && email.toLowerCase().includes(q)) ||
      (email.body && email.body.toLowerCase().includes(q)) ||
      (dateStr && dateStr.includes(q))
    );
  });

  if (loading) return <CenteredLoading />;

  if (selectedEmail) {
    // Split the body into reply and original message
    let replyText = selectedEmail.body;
    let originalMsg = '';
    const splitMarker = '------- Eredeti üzenet -------';
    if (selectedEmail.body && selectedEmail.body.includes(splitMarker)) {
      const [reply, original] = selectedEmail.body.split(splitMarker);
      replyText = reply.trim();
      originalMsg = splitMarker + original;
    }

    // Ha a logban külön mentve van az eredeti üzenet, azt jelenítsuk meg
    const hasOriginal =
      selectedEmail.originalFrom ||
      selectedEmail.originalDate ||
      selectedEmail.originalSubject ||
      selectedEmail.originalBody;

    return (
      <Paper
        sx={{
          p: 4,
          maxHeight: '84vh', // <-- Itt egyezzen meg a lista nézetével!
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Typography variant="h5" gutterBottom>Elküldött levél részletei</Typography>
        <Typography><strong>Címzett:</strong> {selectedEmail.to}</Typography>
        <Typography><strong>Tárgy:</strong> {selectedEmail.subject}</Typography>
        <Typography><strong>Dátum:</strong> {selectedEmail.date ? new Date(selectedEmail.date).toISOString().slice(0, 10) : ''}</Typography>
        {replyText && (
          <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            <strong>Válasz szövege:</strong><br />
            <Box
              sx={{
                borderRadius: 1,
                p: 2,
                mt: 1,
                border: '1px solid #333',
                width: '100%',
                boxSizing: 'border-box',
                // maxHeight és overflowY törölve!
              }}
            >
              {replyText}
            </Box>
          </Typography>
        )}
        {(hasOriginal || originalMsg) && (
          <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            <strong>Eredeti üzenet:</strong><br />
            <Box
              sx={{
                maxHeight: 300,
                maxWidth: 900,
                overflowY: 'auto',
                borderRadius: 1,
                p: 2,
                mt: 1,
                border: '1px solid #333',
                width: '100%',
                boxSizing: 'border-box',
                background: '#1a1a1a'
              }}
            >
              {hasOriginal ? (
                <>
                  <div><b>Feladó:</b> {selectedEmail.originalFrom}</div>
                  <div><b>Dátum:</b> {selectedEmail.originalDate}</div>
                  <div><b>Tárgy:</b> {selectedEmail.originalSubject}</div>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}><b>Üzenet:</b><br />{selectedEmail.originalBody}</div>
                </>
              ) : (
                originalMsg
              )}
            </Box>
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={() => setSelectedEmail(null)}>Vissza</Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ 
      p: 4,
      maxHeight: '84vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Typography variant="h4" gutterBottom>Elküldött levelek</Typography>
      <TextField
        label="Keresés az elküldött levelekben"
        variant="outlined"
        fullWidth
        sx={{ mb: 2 }}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <Box sx={{ 
        overflowY: 'auto',
        flex: 1,
        pr: 2,
        mr: -2 // Kompenzálja a padding-right-ot, hogy ne legyen dupla scrollbar
      }}>
        {filteredEmails.length === 0 ? (
          <Typography>Nincsenek elküldött levelek.</Typography>
        ) : (
          filteredEmails.map((email) => (
            <Box
              key={email.id}
              sx={{
                mb: 3,
                p: 2,
                border: '1px solid #333', // MailsView-hoz igazítva
                borderRadius: 2,
                cursor: 'pointer',
                '&:hover': { backgroundColor: '#2a1e3a' } // MailsView-hoz igazítva
              }}
              onClick={() => setSelectedEmail(email)}
            >
              <Typography><strong>Címzett:</strong> {email.to}</Typography>
              <Typography><strong>Tárgy:</strong> {email.subject}</Typography>
              <Typography><strong>Dátum:</strong> {email.date ? new Date(email.date).toISOString().slice(0, 10) : ''}</Typography>
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
};

export default SentMailsView;