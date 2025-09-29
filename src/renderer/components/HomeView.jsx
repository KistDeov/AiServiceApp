import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, IconButton } from '@mui/material';
import { FaArrowCircleRight } from "react-icons/fa";
import ReplyStatsChart from './ReplyStatsChart';

const HomeView = ({ showSnackbar, reloadKey }) => {
  const [unreadEmails, setUnreadEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsData, setStatsData] = useState([]);

  const handleViewChange = (view) => {
    window.api.setView(view);
  }

  useEffect(() => {
    window.api.onEmailsUpdated((newEmails) => {
      setUnreadEmails(newEmails);
    });
    Promise.all([
      window.api.getUnreadEmails(),
      window.api.getUserEmail()
    ])
      .then(([emails, email]) => {
        setUnreadEmails(emails);
        setUserEmail(email.split('@')[0]);
        setLoading(false);
      })
      .catch(err => {
        console.error('Hiba az adatok lekérésekor:', err);
        setLoading(false);
        showSnackbar('Hiba az adatok lekérésekor', 'error');
      });
    return () => {
      window.api.removeEmailsUpdateListener();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setStatsLoading(true);
    async function fetchStats() {
      try {
        const stats = await window.api.getReplyStats?.();
        console.log('[HomeView] Fetched stats:', stats);
        if (isMounted) setStatsData(stats || []);
      } catch (e) {
        console.error('[HomeView] Error fetching stats:', e);
        if (isMounted) setStatsData([]);
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
    return () => { isMounted = false; };
  }, [reloadKey]);

  if (loading) {
    return (
      <Paper sx={{ p: 4 }}>
        <CircularProgress />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 4, maxHeight: 675 }}>
      <Typography variant="h4" gutterBottom>
        Üdvözlöm, {userEmail}!
      </Typography>
      <Typography variant="body1" sx={{ mt: 4 }}>
        {unreadEmails.length > 0 
          ? `${unreadEmails.length} db válaszolatlan leveled van.`
          : 'Nincs válaszra váró levél'}
        <IconButton onClick={() => handleViewChange('mails')} size="large" sx={{ ml: 1, color: 'primary.main' }}>
            <FaArrowCircleRight />
        </IconButton>
      </Typography>
      {statsLoading ? (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <><Typography variant="body1" gutterBottom sx={{ mt: 4 }}>
            0 db válasz előkészítve a küldésre

          <IconButton onClick={() => handleViewChange('generatedMails')} size="large" sx={{ ml: 1, color: 'primary.main' }}>
            <FaArrowCircleRight />
          </IconButton>
          </Typography><Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, mb: 1 }}>
              <ReplyStatsChart data={statsData} width={300} height={100} />
            </Box></>
      )}
    </Paper>
  );
};

export default HomeView;