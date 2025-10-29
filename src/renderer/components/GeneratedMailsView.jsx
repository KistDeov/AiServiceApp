import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, IconButton, TextField } from '@mui/material';
import { FaArrowCircleRight } from "react-icons/fa";
import CenteredLoading from './CenteredLoading';

const GeneratedMailsView = ({ showSnackbar }) => {
  const [halfAutoEnabled, setHalfAutoEnabled] = useState(null); // Initially null to indicate loading state
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedReplies, setGeneratedReplies] = useState({});
  const [sending, setSending] = useState(false);
  const [repliesGenerated, setRepliesGenerated] = useState(false);
  const [repliedEmailIds, setRepliedEmailIds] = useState([]); // IDs of already replied emails
  const [savingIds, setSavingIds] = useState([]); // track which replies are being saved
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [fullEmail, setFullEmail] = useState(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [search, setSearch] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');

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

      // First load replied email ids and stored generated replies in parallel
      Promise.all([
        window.api.getRepliedEmailIds().catch(err => {
          console.warn('Could not fetch replied email ids, proceeding without:', err);
          return [];
        }),
        window.api.readGeneratedReplies().catch(err => {
          console.warn('Could not read stored replies, proceeding with empty:', err);
          return {};
        }),
        window.api.getUnreadEmails()
      ])
      .then(([repliedIds, storedReplies, unreadData]) => {
        console.log('Unread emails fetched:', unreadData);
        console.log('Replied email ids:', repliedIds);
        console.log('Stored replies fetched:', storedReplies);

        // Filter out already replied emails
        const filteredEmails = Array.isArray(unreadData)
          ? unreadData.filter(e => !repliedIds.includes(e.id))
          : [];

        setRepliedEmailIds(Array.isArray(repliedIds) ? repliedIds : []);
        setEmails(filteredEmails);

        // Prepare replies object (start from stored replies but only keep for current filtered emails)
        const replies = { ...(storedReplies || {}) };

        const replyPromises = filteredEmails.map(email => {
          if (!replies[email.id]) {
            console.log('Generating reply for email:', { id: email.id, subject: email.subject });
            // Ensure full email body is fetched
            return window.api.getEmailById(email.id)
              .then(fullEmail => {
                if (!fullEmail || !fullEmail.body) {
                  console.warn('Full email missing body - using snippet as fallback for email id:', email.id);
                  fullEmail = { ...email, body: email.snippet || '' };
                }
                return window.api.generateReply(fullEmail)
                  .then(reply => {
                    if (!reply || !reply.body) {
                      console.warn('Generated reply body is undefined, using email body/snippet as fallback for email id:', email.id);
                      reply = reply || {};
                      reply.body = fullEmail.body || email.snippet || '';
                      reply.subject = reply.subject || (`Re: ${email.subject || ''}`);
                    } else {
                      reply.subject = reply.subject || (`Re: ${email.subject || ''}`);
                    }
                    replies[email.id] = reply;
                    return window.api.saveGeneratedReplies(replies).catch(err => {
                      console.warn('Could not save generated replies:', err);
                    });
                  });
              })
              .catch(err => {
                console.error('Error fetching full email or generating reply:', err);
              });
          }
          return Promise.resolve();
        });

        Promise.all(replyPromises).then(() => {
          setGeneratedReplies(replies);
          setRepliesGenerated(true);
          setLoading(false);
        }).catch(err => {
          console.error('Error during reply generation batch:', err);
          setGeneratedReplies(replies);
          setRepliesGenerated(true);
          setLoading(false);
        });
      })
      .catch(err => {
        console.error('Error fetching unread emails or dependencies:', err);
        setLoading(false);
      });
    }
  }, [halfAutoEnabled, repliesGenerated]);

  const handleSendAllReplies = () => {
    setSending(true);
    const promises = emails.map(email => {
      const reply = generatedReplies[email.id];
      if (reply && reply.body) {
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
        // Optionally refresh list after sending: remove sent emails from view by fetching replied ids again
        window.api.getRepliedEmailIds().then(ids => {
          setRepliedEmailIds(ids || []);
          setEmails(prev => prev.filter(e => !ids.includes(e.id)));
        showSnackbar && showSnackbar('Sikeresen elküldve', 'success');
        }).catch(()=>{});
      })
      .catch(err => {
        console.error('Error sending all replies:', err);
        setSending(false);
      });
  };

  const handleViewChange = (view) => {
    window.api.setView(view);
  };

  const handleOpenEmail = (email) => {
    setSelectedEmail(email);
    setLoadingFull(true);
    // fetch full email if available
    window.api.getEmailById(email.id)
      .then((data) => {
        const e = data || email;
        setFullEmail(e);
        // preload reply content from generatedReplies or fallback
        const reply = generatedReplies[email.id] || {};
        setReplySubject(reply.subject || `Re: ${email.subject || ''}`);
        setReplyBody(reply.body || '');
        setLoadingFull(false);
      })
      .catch(err => {
        console.warn('Could not load full email, using list data:', err);
        setFullEmail(email);
        const reply = generatedReplies[email.id] || {};
        setReplySubject(reply.subject || `Re: ${email.subject || ''}`);
        setReplyBody(reply.body || '');
        setLoadingFull(false);
      });
  };

  const handleBackFromOpen = () => {
    setSelectedEmail(null);
    setFullEmail(null);
    setReplySubject('');
    setReplyBody('');
  };

  const handleSaveSelectedReply = () => {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    setSavingIds(prev => [...prev, id]);
    window.api.readGeneratedReplies().then(stored => {
      const merged = { ...(stored || {}), ...(generatedReplies || {}) };
      merged[id] = { subject: replySubject, body: replyBody };
      return window.api.saveGeneratedReplies(merged).then(() => {
        // update local state
        setGeneratedReplies(prev => ({ ...(prev || {}), [id]: { subject: replySubject, body: replyBody } }));
      });
    }).then(() => {
      setSavingIds(prev => prev.filter(x => x !== id));
    }).catch(err => {
      console.error('Error saving selected reply for', id, err);
      setSavingIds(prev => prev.filter(x => x !== id));
    });
  };

  const handleSendSelectedReply = () => {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    if (!replyBody) return;
    setSending(true);
    window.api.sendReply({
      to: selectedEmail.from,
      subject: replySubject,
      body: replyBody,
      emailId: id
    }).then(() => {
      setSending(false);
      // refresh replied ids and remove from view
      window.api.getRepliedEmailIds().then(ids => {
        setRepliedEmailIds(ids || []);
        setEmails(prev => prev.filter(e => !ids.includes(e.id)));
        handleBackFromOpen();
        showSnackbar && showSnackbar('Sikeresen elküldve', 'success');
      }).catch(() => {
        handleBackFromOpen();
      });
    }).catch(err => {
      console.error('Error sending selected reply:', err);
      setSending(false);
    });
  };

  if (halfAutoEnabled === null) {
    return <CenteredLoading />;
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
    return <CenteredLoading helperText={"Levelek előkészítése folyamatban, ez eltarthat néhány percig..."} />;
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
        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={handleSendAllReplies}
          disabled={true}
        >
          Összes válasz elküldése
        </Button>
      </Paper>
    );
  } else {
    // Determine if there is any prepared reply with a body for the filtered emails
    const filteredEmails = emails.filter(email => {
      const q = search.toLowerCase();
      const matches = (
        (!q) ||
        (email.subject && email.subject.toLowerCase().includes(q)) ||
        (email.from && email.from.toLowerCase().includes(q)) ||
        (generatedReplies[email.id] && generatedReplies[email.id].body && generatedReplies[email.id].body.toLowerCase().includes(q)) ||
        (email.body && email.body.toLowerCase().includes(q)) ||
        (email.snippet && email.snippet.toLowerCase().includes(q))
      );
      return matches;
    });

    const anyPrepared = filteredEmails.some(e => generatedReplies[e.id] && generatedReplies[e.id].body);

    // If one is opened show a larger editor similar to MailsView
    if (selectedEmail) {
      return (
        <Paper sx={{ p: 4,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column' }}>
          <Typography variant="h5" gutterBottom>Előkészített levél szerkesztése</Typography>
          {loadingFull || !fullEmail ? (
            <CenteredLoading size={48} text={'Betöltés...'} />
          ) : (
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
                multiline
                rows={15}
                sx={{ mt: 2 }}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
              />
              <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
                <Button variant="contained" color="primary" onClick={handleSendSelectedReply} disabled={sending}>Küldés</Button>
                <Button variant="outlined" onClick={handleSaveSelectedReply} disabled={savingIds.includes(selectedEmail.id)}>{savingIds.includes(selectedEmail.id) ? 'Mentés...' : 'Mentés'}</Button>
                <Button variant="text" onClick={handleBackFromOpen}>Vissza</Button>
              </Box>
            </>
          )}
        </Paper>
      );
    }

    return (
      <Paper sx={{ p: 4,
        maxHeight: '690px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' }}>
        <Typography variant="h4" gutterBottom>
          Előkészített levelek
        </Typography>

        <TextField
          label="Keresés az előkészített levelekben"
          variant="outlined"
          fullWidth
          sx={{ mb: 2 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <Box sx={{ mt: 2, overflowY: 'auto', flex: 1 }}>
          {filteredEmails.map(email => (
            <Box
              key={email.id}
              sx={{ mb: 2, p: 2, border: '1px solid #333', borderRadius: 2, cursor: 'pointer' }}
              onClick={() => handleOpenEmail(email)}
            >
              <Typography><strong>Feladó:</strong> {email.from}</Typography>
              <Typography><strong>Tárgy:</strong> {email.subject}</Typography>
              <Typography sx={{ mt: 1 }}><strong>Üzenet</strong> {email.snippet || (email.body && (email.body.length > 200 ? `${email.body.slice(0, 200)}...` : email.body))}</Typography>

              {/* generated reply preview */}
              <Box sx={{ mt: 1, borderRadius: 1 }}>
                <Typography ><strong>Válasz előnézet:</strong></Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                  {generatedReplies[email.id]?.body ? (generatedReplies[email.id].body.length > 100 ? `${generatedReplies[email.id].body.slice(0, 100)}...` : generatedReplies[email.id].body) : <em>Nincs előkészített válasz</em>}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={handleSendAllReplies}
          disabled={sending || !anyPrepared}
        >
          {sending ? 'Küldés folyamatban...' : 'Összes válasz elküldése'}
        </Button>
      </Paper>
    );
  }
};

export default GeneratedMailsView;