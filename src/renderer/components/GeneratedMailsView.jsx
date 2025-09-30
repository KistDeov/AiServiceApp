import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, CircularProgress, IconButton } from '@mui/material';
import { FaArrowCircleRight } from "react-icons/fa";

const GeneratedMailsView = () => {

  const [halfAutoEnabled, setHalfAutoEnabled] = useState(null); // Initially null to indicate loading state
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedReplies, setGeneratedReplies] = useState({});
  const [sending, setSending] = useState(false);
  const [repliesGenerated, setRepliesGenerated] = useState(false);

  useEffect(() => {
    window.api.getHalfAutoSend()
      .then((enabled) => {
        setHalfAutoEnabled(enabled);
      })
      .catch((err) => {
        console.error('Error fetching halfAutoEnabled state:', err);
        setHalfAutoEnabled(false); // Default to false on error
      });
  }, []);

  useEffect(() => {
    if (halfAutoEnabled === null || repliesGenerated) return; // Wait until halfAutoEnabled is loaded

    if (halfAutoEnabled) {
      setLoading(true);
      window.api.getUnreadEmails()
        .then((data) => {
          console.log('Unread emails fetched:', data);
          setEmails(data);
          window.api.readGeneratedReplies()
            .then((storedReplies) => {
              console.log('Stored replies fetched:', storedReplies);
              const replies = { ...storedReplies };
              const replyPromises = data.map(email => {
                console.log('Email passed to AI for reply generation:', {
                  id: email.id,
                  from: email.from,
                  subject: email.subject,
                  snippet: email.snippet
                }); // Log the email details including snippet
                if (!replies[email.id]) {
                  console.log('Generating reply for email:', email);
                  return window.api.generateReply(email)
                    .then(reply => {
                      if (!reply.body) {
                        console.warn('Generated reply body is undefined, using snippet as fallback for email:', email);
                        reply.body = email.snippet; // Use snippet as fallback
                      } else {
                        console.log('Reply generated for email:', email.id, reply);
                      }
                      replies[email.id] = reply;
                      return window.api.saveGeneratedReplies(replies);
                    })
                    .catch(err => console.error('Error generating reply:', err));
                }
                return Promise.resolve();
              });

              Promise.all(replyPromises).then(() => {
                setGeneratedReplies(replies);
                setRepliesGenerated(true);
                setLoading(false);
              });
            })
            .catch(err => {
              console.error('Error reading stored replies:', err);
              setLoading(false);
            });
        })
        .catch(err => {
          console.error('Error fetching unread emails:', err);
          setLoading(false);
        });
    }
  }, [halfAutoEnabled, repliesGenerated]);

  const handleSendAllReplies = () => {
    setSending(true);
    const promises = emails.map(email => {
      const reply = generatedReplies[email.id];
      if (reply) {
        if (!reply.body) {
          console.error('Attempting to send reply with undefined body for email:', email);
        }
        console.log('Sending reply for email:', email.id);
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
        setSending(false);
      })
      .catch(err => {
        console.error('Error sending all replies:', err);
        setSending(false);
      });
  };

  const handleViewChange = (view) => {
    window.api.setView(view);
  };

  if (halfAutoEnabled === null) {
    return <CircularProgress />;
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
  } else if (emails.length === 0) {
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
          Nincsenek előkészített levelek.
        </Typography>
      </Paper>
    );
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