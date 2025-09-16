import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Button, TextField } from '@mui/material';

const MailsView = ({ showSnackbar }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [fullEmail, setFullEmail] = useState(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [replyMode, setReplyMode] = useState(false);
  const [generatedMode, setGeneratedMode] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [repliedEmailIds, setRepliedEmailIds] = useState(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    window.api.onEmailsUpdated((newEmails) => {
      let repliedSet = new Set(repliedEmailIds);
      const filtered = newEmails.filter(email => !repliedSet.has(email.id));
      setEmails(filtered);
    });
    window.api.getUnreadEmails()
      .then(async (data) => {
        let repliedSet = new Set();
        setLoading(false);
        const filtered = data.filter(email => !repliedSet.has(email.id));
        setRepliedEmailIds(repliedSet);
        setEmails(filtered);
      })
      .catch(err => {
        console.error('Hiba az emailek lekérésekor:', err);
        setLoading(false);
        showSnackbar('Hiba az emailek lekérésekor', 'error');
      });
    return () => {
      window.api.removeEmailsUpdateListener();
    };
  }, []);

  useEffect(() => {
    if (selectedEmail) {
      setLoadingFull(true);
      window.api.getEmailById(selectedEmail.id)
        .then((data) => {
          setFullEmail(data);
          setLoadingFull(false);
        })
        .catch(err => {
          console.error('Hiba a teljes email lekérésekor:', err);
          setLoadingFull(false);
          showSnackbar('Hiba az email részleteinek lekérésekor', 'error');
        });
    }
  }, [selectedEmail]);

  const handleSendReply = () => {
    if (!fullEmail) return;
    window.api.sendReply({
      to: fullEmail.from,
      subject: replySubject,
      body: replyBody,
      emailId: fullEmail.id
    })
      .then(res => {
        if (res.success) {
          showSnackbar('Levél elküldve', 'success');
        } else {
          showSnackbar(`Hiba a küldéskor: ${res.error}`, 'error');
        }
      })
      .catch(err => {
        showSnackbar(`Hiba a küldés során: ${err.message}`, 'error');
      });
    setReplyMode(false);
    setGeneratedMode(false);
    setReplySubject('');
    setReplyBody('');
    setSelectedEmail(null);
    setFullEmail(null);
  };

  const handleGenerateReply = () => {
    if (!fullEmail) return;
    setLoadingFull(true);
    window.api.generateReply(fullEmail)
      .then((generated) => {
        setReplySubject(generated.subject);
        setReplyBody(generated.body);
        setGeneratedMode(true);
        setLoadingFull(false);
      })
      .catch(err => {
        console.error('Hiba a válasz generálásakor:', err);
        setLoadingFull(false);
        showSnackbar('Hiba a válasz generálása során', 'error');
      });
  };

  const handleCancelReply = () => {
    setReplyMode(false);
    setGeneratedMode(false);
    setReplySubject('');
    setReplyBody('');
  };

  const filteredEmails = emails.filter(email => {
    const q = search.toLowerCase();
    const dateStr = email.date ? new Date(email.date).toISOString().slice(0, 10) : '';
    return (
      (!q) ||
      (email.subject && email.subject.toLowerCase().includes(q)) ||
      (email.from && email.from.toLowerCase().includes(q)) ||
      (email.body && email.body.toLowerCase().includes(q)) ||
      (dateStr && dateStr.includes(q))
    );
  });

  if (loading) return <CircularProgress />;

  if (selectedEmail) {
    return (
      
      <Paper
        sx={{
           p: 4,
      maxHeight: '90vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
        }}
      >
        <Typography variant="h5" gutterBottom>Levelezés részletei</Typography>
        {loadingFull || !fullEmail ? (
          <CircularProgress />
        ) : (replyMode || generatedMode) ? (
          <>
            <Typography><strong>Válasz a következő címzettnek:</strong> {fullEmail.from}</Typography>
            <TextField
              label="Tárgy"
              variant="outlined"
              sx={{ mt: 2 }}
              value={replySubject}
              onChange={(e) => setReplySubject(e.target.value)}
            />
            <TextField
              label="Üzenet"
              variant="outlined"
              maxWidth="80%"
              multiline
              rows={6}
              sx={{ mt: 2 }}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
              <Button variant="contained" color="primary" onClick={handleSendReply}>Küldés</Button>
              <Button variant="outlined" onClick={handleCancelReply}>Vissza</Button>
            </Box>
          </>
        ) : (
          <>
            <Typography><strong>Feladó:</strong> {fullEmail.from}</Typography>
            <Typography><strong>Tárgy:</strong> {fullEmail.subject}</Typography>
            <Typography><strong>Dátum:</strong> {fullEmail.date ? new Date(fullEmail.date).toISOString().slice(0, 10) : ''}</Typography>
            <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
              <strong>Üzenet:</strong><br />
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
                }}
              >
                {fullEmail.body}
              </Box>
            </Typography>
            <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
              <Button variant="contained" color="primary" onClick={() => setReplyMode(true)}>Saját válasz</Button>
              <Button variant="contained" color="primary" onClick={handleGenerateReply}>Válasz generálása</Button>
            </Box>
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" onClick={() => {
                setSelectedEmail(null);
                setFullEmail(null);
              }}>Vissza</Button>
            </Box>
          </>
        )}
      </Paper>
    );
  }

  return (
    <Paper sx={{ 
      p: 4,
      maxHeight: '90vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Typography variant="h4" gutterBottom>Beérkezett levelek</Typography>
      <TextField
        label="Keresés a levelekben"
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
          <Typography>Nincsenek beérkezett levelek.</Typography>
        ) : (
          filteredEmails.map((email) => (
            <Box
              key={email.id}
              sx={{
                mb: 3,
                p: 2,
                border: '1px solid #333',
                borderRadius: 2,
                cursor: 'pointer',
                '&:hover': { backgroundColor: '#2a1e3a' }
              }}
              onClick={() => setSelectedEmail(email)}
            >
              <Typography><strong>Feladó:</strong> {email.from}</Typography>
              <Typography><strong>Tárgy:</strong> {email.subject}</Typography>
              <Typography><strong>Dátum:</strong> {email.date ? new Date(email.date).toISOString().slice(0, 10) : ''}</Typography>
              <Typography><strong>Előnézet:</strong> {email.snippet}</Typography>
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
};

export default MailsView;