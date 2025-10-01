import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, IconButton } from '@mui/material';
import { FaArrowCircleRight } from "react-icons/fa";
import ReplyStatsChart from './ReplyStatsChart';
import CenteredLoading from './CenteredLoading';

const HomeView = ({ showSnackbar, reloadKey }) => {
  const [unreadEmails, setUnreadEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsData, setStatsData] = useState([]);
  const [halfAuto, setHalfAuto] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState(null);
  const [remainingGenerations, setRemainingGenerations] = useState(null);
  const [timeLeftStr, setTimeLeftStr] = useState('');

  const handleViewChange = (view) => {
    window.api.setView(view);
  }

  useEffect(() => {
    window.api.onEmailsUpdated((newEmails) => {
      setUnreadEmails(newEmails);
    });
    Promise.all([
      window.api.getUnreadEmails(),
      window.api.getUserEmail(),
      window.api.getHalfAutoSend()
    ])
      .then(([emails, email, halfAutoVal]) => {
        setUnreadEmails(emails);
        setUserEmail((email || '').split('@')[0]);
        setHalfAuto(Boolean(halfAutoVal));
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

  // Fetch trial status (trialEndDate and remainingGenerations)
  useEffect(() => {
    let mounted = true;
    async function fetchTrial() {
      try {
        const status = await window.api.getTrialStatus?.();
        if (!mounted) return;
        if (status) {
          setTrialEndDate(status.trialEndDate || null);
          setRemainingGenerations(typeof status.remainingGenerations === 'number' ? status.remainingGenerations : null);
        }
      } catch (e) {
        console.error('[HomeView] getTrialStatus error:', e);
      }
    }
    fetchTrial();
    return () => { mounted = false; };
  }, []);

  // Countdown timer for trial end
  useEffect(() => {
    if (!trialEndDate) {
      setTimeLeftStr('');
      return;
    }
    let interval = null;
    function update() {
      const now = new Date();
      // Normalize DB string like '2025-12-30 12:43:02' to ISO-ish
      const normalized = trialEndDate.replace(' ', 'T');
      const end = new Date(normalized);
      if (isNaN(end.getTime())) {
        setTimeLeftStr('Ismeretlen dátum');
        return;
      }
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeftStr('Lejárt');
        if (interval) clearInterval(interval);
        return;
      }
      const days = Math.floor(diff / (24*60*60*1000));
      const hours = Math.floor((diff % (24*60*60*1000)) / (60*60*1000));
      const minutes = Math.floor((diff % (60*60*1000)) / (60*1000));
      const seconds = Math.floor((diff % (60*1000)) / 1000);
      setTimeLeftStr(`${days} nap`);
    }
    update();
    interval = setInterval(update, 1000);
    return () => { if (interval) clearInterval(interval); };
  }, [trialEndDate]);

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
        <CenteredLoading />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 4, maxHeight: 675 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h4" gutterBottom>
          Üdvözlöm, {userEmail}!
        </Typography>
        {(trialEndDate || remainingGenerations !== null) && (
          <Box sx={{ textAlign: 'right', ml: 2 }}>
            {trialEndDate && (
              <Typography variant="body1">Hátralévő idő: {timeLeftStr}</Typography>
            )}
            {remainingGenerations !== null && (
              <Typography variant="body1">Hátralévő generálások: {remainingGenerations} db </Typography>
            )}
          </Box>
        )}
      </Box>
      <Typography variant="body1" sx={{ mt: 4 }}>
        {unreadEmails.length > 0 
          ? `${unreadEmails.length} db válaszolatlan leveled van.`
          : 'Nincs válaszra váró levél'}
        <IconButton onClick={() => handleViewChange('mails')} size="large" sx={{ ml: 1, color: 'primary.main' }}>
            <FaArrowCircleRight />
        </IconButton>
      </Typography>
      {halfAuto && (
        <Typography variant="body1" sx={{ mt: 2 }}>
          {unreadEmails.length > 0 
            ? `${unreadEmails.length} db előkészített leveled van.`
            : 'Nincs előkészített leveled'}
          <IconButton onClick={() => handleViewChange('generatedMails')} size="large" sx={{ ml: 1, color: 'primary.main' }}>
              <FaArrowCircleRight />
          </IconButton>
        </Typography>
      )}
      {statsLoading ? (
        <CenteredLoading size={40} text={'Betöltés...'} />
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, mb: 1 }}>
          <ReplyStatsChart data={statsData} width={300} height={100} />
        </Box>
      )}
    </Paper>
  );
};

export default HomeView;