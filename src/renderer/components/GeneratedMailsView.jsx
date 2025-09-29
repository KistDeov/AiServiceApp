import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, CircularProgress, IconButton } from '@mui/material';
import { FaArrowCircleRight } from "react-icons/fa";

const GeneratedMailsView = () => {

  const halfAutoEnabled = window.api.getHalfAutoSend();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedReplies, setGeneratedReplies] = useState({});
  const [sending, setSending] = useState(false);
  const [repliesGenerated, setRepliesGenerated] = useState(false);

  useEffect(() => {
    if (halfAutoEnabled && !repliesGenerated) {
      setLoading(true);
      window.api.getUnreadEmails()
        .then((data) => {
          setEmails(data);
          const replies = {};
          const replyPromises = data.map(email => {
            return window.api.generateReply(email)
              .then(reply => {
                replies[email.id] = reply;
              })
              .catch(err => console.error('Hiba a válasz generálásakor:', err));
          });

          Promise.all(replyPromises).then(() => {
            setGeneratedReplies(replies);
            setRepliesGenerated(true);
            setLoading(false);
          });
        })
        .catch(err => {
          console.error('Hiba az emailek lekérésekor:', err);
          setLoading(false);
        });
    }
  }, [halfAutoEnabled, repliesGenerated]);

  const handleSendAllReplies = () => {
    setSending(true);
    const promises = emails.map(email => {
      const reply = generatedReplies[email.id];
      if (reply) {
        return window.api.sendReply({
          to: email.from,
          subject: reply.subject,
          body: reply.body,
          emailId: email.id
        });
      }
      return Promise.resolve();
    });

    Promise.all(promises)
      .then(() => {
        console.log('Minden válasz elküldve.');
        setSending(false);
      })
      .catch(err => {
        console.error('Hiba az összes válasz elküldésekor:', err);
        setSending(false);
      });
  };

  const handleViewChange = (view) => {
    window.api.setView(view);
  }

  if (!halfAutoEnabled) {
    return (
      <Paper sx={{ p: 4,
        maxHeight: '550px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' }}>
        <Typography variant="h4" gutterBottom>
          Előkészített levelek    
        </Typography>
        <Typography variant="body1" sx={{ mt: 2 }}>
          Kapcsold be a "Félautomata válaszküldés" opciót a beállításokban az előkészített levelek megtekintéséhez.
          <IconButton onClick={() => handleViewChange('settings')} size="large" sx={{ ml: 1, color: 'primary.main' }}>
              <FaArrowCircleRight />
          </IconButton>
        </Typography>
      </Paper>
    );
  } else if (loading) {
    return <CircularProgress />;
  } else {
    return (
      <Paper sx={{ p: 4,
        maxHeight: '550px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' }}>
        <Typography variant="h4" gutterBottom>
          Előkészített levelek
        </Typography>
        <Box sx={{ mt: 2, overflowY: 'auto', flex: 1 }}>
          {emails.map(email => (
            <Box key={email.id} sx={{ mb: 2, p: 2, border: '1px solid #333', borderRadius: 2 }}>
              <Typography><strong>Feladó:</strong> {email.from}</Typography>
              <Typography><strong>Tárgy:</strong> {email.subject}</Typography>
              <Typography><strong>Válasz:</strong> {generatedReplies[email.id]?.body || 'Generálás folyamatban...'}</Typography>
            </Box>
          ))}
        </Box>
        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={handleSendAllReplies}
          disabled={sending}
        >
          {sending ? 'Küldés folyamatban...' : 'Összes válasz elküldése'}
        </Button>
      </Paper>
    );
  }
};

export default GeneratedMailsView;