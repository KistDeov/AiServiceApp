import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControlLabel,
  FormGroup,
  Switch,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  RadioGroup,
  Radio,
  Grid,
  Divider
} from '@mui/material';
import CenteredLoading from './components/CenteredLoading';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
// Note: removed unused import

const HalfAutoSendConfirmDialog = ({ open, onClose, onConfirm }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      PaperProps={{
        sx: {
          backgroundColor: 'background.paper',
          color: 'text.primary'
        }
      }}
    >
      <DialogTitle id="alert-dialog-title" sx={{ color: 'text.primary', backgroundColor: 'background.paper' }}>
        Félautomata válaszküldés bekapcsolása
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: 'background.paper' }}>
        <DialogContentText id="alert-dialog-description" sx={{ color: 'text.secondary', backgroundColor: 'background.paper' }}>
          Biztosan be szeretné kapcsolni a félautomata válaszküldést? 
          A rendszer beérkező levél esetén generál egy választ a levélre majd előkészíti azt az elküldéshez. 
          Ezeket a leveleket a "Előkészített levelek" nézetben tudod megtekinteni és szükség esetén módosítani, majd elküldeni.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: 'background.paper' }}>
        <Button onClick={onClose} color="primary">
          Mégsem
        </Button>
        <Button onClick={onConfirm} color="primary" variant="contained" autoFocus>
          Bekapcsolás
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const AutoSendConfirmDialog = ({ open, onClose, onConfirm, startTime, endTime, onTimeChange, timedAutoSend, onTimedAutoSendChange }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      PaperProps={{
        sx: {
          backgroundColor: 'background.paper',
          color: 'text.primary'
        }
      }}
    >
      <DialogTitle id="alert-dialog-title" sx={{ color: 'text.primary', backgroundColor: 'background.paper' }}>
        Automatikus válaszküldés bekapcsolása
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: 'background.paper' }}>
        <DialogContentText id="alert-dialog-description" sx={{ color: 'text.secondary', backgroundColor: 'background.paper' }}>
          Biztosan be szeretné kapcsolni az automatikus válaszküldést? 
          A rendszer automatikusan fog válaszolni az ÖSSZES olvasatlan levélre.
        </DialogContentText>
        <Box sx={{ mt: 3 }}>
          <FormControlLabel
            control={<Switch checked={timedAutoSend} onChange={onTimedAutoSendChange} />}
            label="Időzített automatikus válaszküldés"
          />
          {timedAutoSend && (
            <>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Automatikus válaszküldés időablaka
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 2 }}>
                <TextField
                  label="Kezdő időpont"
                  type="time"
                  value={startTime}
                  onChange={onTimeChange('start')}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  inputProps={{
                    step: 300, // 5 perc
                  }}
                  sx={{ width: 150 }}
                />
                <Typography sx={{ mx: 2 }}>-</Typography>
                <TextField
                  label="Befejező időpont"
                  type="time"
                  value={endTime}
                  onChange={onTimeChange('end')}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  inputProps={{
                    step: 300, // 5 perc
                  }}
                  sx={{ width: 150 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Az automatikus válaszküldés csak a megadott időintervallumban fog működni.
                A kezdő időponttól a befejező időpontig tart a működés, utána kikapcsol.
                Másnap a kezdő időpontban automatikusan újraindul.
              </Typography>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: 'background.paper' }}>
        <Button onClick={onClose} color="primary">
          Mégsem
        </Button>
        <Button onClick={onConfirm} color="primary" variant="contained" autoFocus>
          Bekapcsolás
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Helper to return today's date in YYYY-MM-DD format for date inputs
const getTodayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const themeOptions = [
  { value: 'black', label: 'Sötét (Alapértelmezett)' },
  { value: 'purple', label: 'Lila' },
  { value: 'light', label: 'Fehér' },
  { value: 'red', label: 'Piros' },
  { value: 'blue', label: 'Kék' },
];

const SettingsView = ({ themeName, setThemeName, onAutoSendChanged, onHalfAutoSendChanged }) => {
  const [autoSend, setAutoSend] = useState(false);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [timedAutoSend, setTimedAutoSend] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHalfAutoConfirmDialog, setShowHalfAutoConfirmDialog] = useState(false);
  const [pendingAutoSend, setPendingAutoSend] = useState(false);
  const [pendingHalfAuto, setPendingHalfAuto] = useState(false);
  const [halfAuto, setHalfAuto] = useState(false);
  const [displayMode, setDisplayMode] = useState('windowed');
  const [ignoredEmails, setIgnoredEmails] = useState("");
  const [minEmailDate, setMinEmailDate] = useState(""); // ÚJ
  const [maxEmailDate, setMaxEmailDate] = useState(""); // ÚJ
  // Default fromDate to today's date
  const [fromDate, setFromDate] = useState(() => getTodayISO());
  const [notifyOnAutoReply, setNotifyOnAutoReply] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [section, setSection] = useState('appearance');

  // Fixed width for the section panels (in pixels). Change this value to adjust the width.
  const sectionWidth = 1250;

  // Load settings
  useEffect(() => {
    Promise.all([
      window.api.getAutoSend(),
      window.api.getHalfAutoSend(),
      window.api.getAutoSendTimes(),
      window.api.getDisplayMode(),
      window.api.getTimedAutoSend ? window.api.getTimedAutoSend() : Promise.resolve(true),
      window.api.getIgnoredEmails ? window.api.getIgnoredEmails() : Promise.resolve([]),
      window.api.getMinEmailDate ? window.api.getMinEmailDate() : Promise.resolve(""),
      window.api.getMaxEmailDate ? window.api.getMaxEmailDate() : Promise.resolve(""),
      // load persisted fromDate if available from the API, otherwise resolve to empty string
      window.api.getFromDate ? window.api.getFromDate() : Promise.resolve("") ,
      window.api.getNotifyOnAutoReply(),
      window.api.getNotificationEmail()
    ]).then(([autoSendVal, halfAutoVal, times, mode, timed, ignored, minDate, maxDate, fromDateVal, notify, email]) => {
      setAutoSend(autoSendVal);
      setHalfAuto(halfAutoVal);
      setStartTime(times.startTime);
      setEndTime(times.endTime);
      setDisplayMode(mode || 'windowed');
      setTimedAutoSend(typeof timed === 'boolean' ? timed : true);
      setIgnoredEmails((ignored || []).join(", "));
      setMinEmailDate(minDate || "");
      setMaxEmailDate(maxDate || "");
      // If API returned a value for fromDate, use it; otherwise keep today's date
      setFromDate(fromDateVal || getTodayISO());
      setNotifyOnAutoReply(notify || false);
      setNotificationEmail(email || "");
      // If both modes are enabled by stored settings, prefer automatic mode and turn off half-automatic.
      // This ensures mutual exclusivity in the UI and persisted config.
      if (autoSendVal && halfAutoVal) {
        setHalfAuto(false);
        window.api.setHalfAuto && window.api.setHalfAuto(false);
        window.global.halfAuto = false;
        halfAutoVal = false;
      }

      setLoading(false);
      window.global.autoSend = autoSendVal;
      window.global.halfAuto = halfAutoVal;
    });
  }, []);

  const handleIgnoredEmailsChange = (event) => {
    setIgnoredEmails(event.target.value);
  };

  const handleIgnoredEmailsBlur = () => {
    // Split by comma, trim, remove empty
    const emails = ignoredEmails.split(",").map(e => e.trim()).filter(Boolean);
    window.api.setIgnoredEmails && window.api.setIgnoredEmails(emails);
  };

  const handleAutoSendChange = (event) => {
    const newValue = event.target.checked;
    if (newValue) {
      setPendingAutoSend(true);
      setShowConfirmDialog(true);
    } else {
      setAutoSend(false);
      window.api.setAutoSend(false).then(() => {
        window.global.autoSend = false;
        if (onAutoSendChanged) onAutoSendChanged(false); // <-- EZ ITT A LÉNYEG
        window.api.onAutoSendChanged && window.api.onAutoSendChanged(false);
      });
    }
  };

  const handleConfirmAutoSend = () => {
    setAutoSend(true);
    window.api.setAutoSend(true).then(() => {
      window.global.autoSend = true;
      if (onAutoSendChanged) onAutoSendChanged(true); // <-- EZ ITT A LÉNYEG
      window.api.onAutoSendChanged && window.api.onAutoSendChanged(true);
    });
    // If half-auto was enabled, turn it off to keep modes exclusive
    if (halfAuto) {
      setHalfAuto(false);
      window.api.setHalfAuto && window.api.setHalfAuto(false);
      window.global.halfAuto = false;
      if (onHalfAutoSendChanged) onHalfAutoSendChanged(false);
      window.api.onHalfAutoSendChanged && window.api.onHalfAutoSendChanged(false);
    }

    if (!timedAutoSend) {
      setStartTime("00:00");
      setEndTime("23:59");
      window.api.setAutoSendTimes({
        startTime: "00:00",
        endTime: "23:59"
      });
    } else {
      window.api.setTimedAutoSend && window.api.setTimedAutoSend(timedAutoSend);
    }
  
    setShowConfirmDialog(false);
    setPendingAutoSend(false);
  };

  const handleCancelAutoSend = () => {
    setShowConfirmDialog(false);
    setPendingAutoSend(false);
  };

  const handleHalfAutoSendChange = (event) => {
    const newValue = event.target.checked;
    if (newValue) {
      setPendingHalfAuto(true);
      setShowHalfAutoConfirmDialog(true);
    } else {
      setHalfAuto(false);
      window.api.setHalfAuto(false).then(() => {
        window.global.halfAuto = false;
        if (onHalfAutoSendChanged) onHalfAutoSendChanged(false); // <-- EZ ITT A LÉNYEG
        window.api.onHalfAutoSendChanged && window.api.onHalfAutoSendChanged(false);
      });
    }
  };

  const handleConfirmHalfAutoSend = () => {
    setHalfAuto(true);
    window.api.setHalfAuto(true).then(() => {
      window.global.halfAuto = true;
      if (onHalfAutoSendChanged) onHalfAutoSendChanged(true); // <-- EZ ITT A LÉNYEG
      window.api.onHalfAutoSendChanged && window.api.onHalfAutoSendChanged(true);
    });
    // If full auto was enabled, turn it off to keep modes exclusive
    if (autoSend) {
      setAutoSend(false);
      window.api.setAutoSend && window.api.setAutoSend(false);
      window.global.autoSend = false;
      if (onAutoSendChanged) onAutoSendChanged(false);
      window.api.onAutoSendChanged && window.api.onAutoSendChanged(false);
    }

    setShowHalfAutoConfirmDialog(false);
    setPendingHalfAuto(false);
  };

  const handleCancelHalfAutoSend = () => {
    setShowHalfAutoConfirmDialog(false);
    setPendingHalfAuto(false);
  };

  const handleTimeChange = (type) => (event) => {
    const newTime = event.target.value;
    if (type === 'start') {
      setStartTime(newTime);
      window.api.setAutoSendTimes({
        startTime: newTime,
        endTime: endTime
      });
    } else {
      setEndTime(newTime);
      window.api.setAutoSendTimes({
        startTime: startTime,
        endTime: newTime
      });
    }
  };

  const handleTimedAutoSendChange = (event) => {
    setTimedAutoSend(event.target.checked);
    window.api.setTimedAutoSend && window.api.setTimedAutoSend(event.target.checked);
  };

  const handleDisplayModeChange = (event) => {
    const newMode = event.target.value;
    setDisplayMode(newMode);
    window.api.setDisplayMode(newMode);
  };

  const handleMinEmailDateChange = (e) => {
    setMinEmailDate(e.target.value);
    window.api.setMinEmailDate && window.api.setMinEmailDate(e.target.value);
  };

  const handleMaxEmailDateChange = (e) => {
    setMaxEmailDate(e.target.value);
    window.api.setMaxEmailDate && window.api.setMaxEmailDate(e.target.value);
  };

  const handlefromDateChange = (e) => {
    setFromDate(e.target.value);
    window.api.setFromDate && window.api.setFromDate(e.target.value);
  };

  const handleNotifyOnAutoReplyChange = (event) => {
    const newValue = event.target.checked;
    setNotifyOnAutoReply(newValue);
    window.api.setNotifyOnAutoReply(newValue);
  };

  const handleNotificationEmailChange = (event) => {
    const newValue = event.target.value;
    setNotificationEmail(newValue);
    window.api.setNotificationEmail(newValue);
  };

  if (loading) {
    return <CenteredLoading />;
  }

  return (
    <>
      <Paper sx={{ p: 3, height: '80vh', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pr: 2, overflow: 'hidden' }}>
          <Typography variant="h4" gutterBottom>Beállítások</Typography>

          <Tabs value={section} onChange={(e, val) => setSection(val)} variant="fullWidth" sx={{ mb: 2 }}>
            <Tab label="Kinézet" value="appearance" />
            <Tab label="Auto" value="autosend" />
            <Tab label="AI Levél" value="ai" />
            <Tab label="Szűrések" value="filters" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <Grid container spacing={3} sx={{ height: '100%', width: '100%', flex: 1 }}>
              {section === 'appearance' && (
                <Grid item xs={12} sx={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
                  <Paper variant="outlined" sx={{ p: 3, height: '100%', width: sectionWidth, maxWidth: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 'none', mx: 'auto' }}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="h6" gutterBottom align="center">Kinézet</Typography>
                      <Divider sx={{ mb: 2 }} />

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle1">Megjelenítési mód</Typography>
                        <RadioGroup value={displayMode} onChange={handleDisplayModeChange}>
                          <FormControlLabel value="windowed" control={<Radio />} label="Ablakos mód" />
                          <FormControlLabel value="fullscreen" control={<Radio />} label="Teljes képernyő" />
                        </RadioGroup>
                        <Typography variant="body2" color="text.secondary">Válassza ki az alkalmazás megjelenítési módját. A változtatások azonnal életbe lépnek.</Typography>
                      </Box>

                      <Box>
                        <Typography variant="subtitle1">Téma</Typography>
                        <RadioGroup value={themeName} onChange={e => setThemeName(e.target.value)} row>
                          {themeOptions.map(opt => (
                            <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                          ))}
                        </RadioGroup>
                        <Typography variant="body2" color="text.secondary">Válassza ki az alkalmazás színvilágát. A változtatás azonnal látszik.</Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              )}

              {section === 'autosend' && (
                <Grid item xs={12} sx={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
                  <Paper variant="outlined" sx={{ p: 3, height: '100%', width: sectionWidth, maxWidth: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 'none', mx: 'auto' }}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="h6" gutterBottom align="center">Automata válaszküldés</Typography>
                      <Divider sx={{ mb: 2 }} />

                      <FormGroup>
                        <FormControlLabel control={<Switch sx={{ ml: 1 }} checked={autoSend || pendingAutoSend} onChange={handleAutoSendChange} disabled={halfAuto || pendingHalfAuto} />} label="Automatikus válaszküldés" />
                        <FormControlLabel control={<Switch sx={{ ml: 1 }} checked={halfAuto || pendingHalfAuto} onChange={handleHalfAutoSendChange} disabled={autoSend || pendingAutoSend} />} label="Félautomata válaszküldés" />
                        <Box sx={{ mt: 2 }}>
                          <FormControlLabel control={<Switch sx={{ ml: 1 }} checked={notifyOnAutoReply} onChange={handleNotifyOnAutoReplyChange} />} label="Értesítés küldése automatikus válasz esetén" />
                          <TextField label="Értesítési email cím" value={notificationEmail} onChange={handleNotificationEmailChange} placeholder="pl. admin@example.com" fullWidth sx={{ mt: 1 }} />
                        </Box>
                      </FormGroup>
                      
                    </Box>
                  </Paper>
                </Grid>
              )}

              {section === 'filters' && (
                <Grid item xs={12} sx={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
                  <Paper variant="outlined" sx={{ p: 3, height: '100%', width: sectionWidth, maxWidth: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 'none', mx: 'auto' }}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="h6" gutterBottom align="center">Szűrések</Typography>
                      <Divider sx={{ mb: 2 }} />

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle1">Tiltott email címek (szűrő)</Typography>
                        <TextField label="Email címek vesszővel elválasztva" value={ignoredEmails} onChange={handleIgnoredEmailsChange} onBlur={handleIgnoredEmailsBlur} placeholder="pl. spam@example.com, noreply@domain.hu" fullWidth multiline minRows={2} sx={{ mt: 1 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Az itt megadott email címekről érkező leveleket a rendszer figyelmen kívül hagyja a válaszküldésnél (mint a spamet).</Typography>
                      </Box>

                      <Box>
                        <Typography variant="subtitle1">Csak a megadott dátumok között érkezett levelek feldolgozása</Typography>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
                          <TextField label="Minimum dátum" type="date" value={minEmailDate} onChange={handleMinEmailDateChange} InputLabelProps={{ shrink: true }} sx={{ width: 220 }} />
                          <TextField label="Maximum dátum" type="date" value={maxEmailDate} onChange={handleMaxEmailDateChange} InputLabelProps={{ shrink: true }} sx={{ width: 220 }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Csak az itt megadott dátumok között érkezett leveleket dolgozza fel a rendszer.</Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              )}

              {section === 'ai' && (
                <Grid item xs={12} sx={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
                  <Paper variant="outlined" sx={{ p: 3, height: '100%', width: sectionWidth, maxWidth: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 'none', mx: 'auto' }}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="h6" gutterBottom align="center">AI levélkeresési beállítások</Typography>
                      <Divider sx={{ mb: 2 }} />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1">Eddig a dátumig keressen a levelekben az AI a válaszadáshoz</Typography>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
                        <TextField label="Dátum" type="date" value={fromDate} onChange={handlefromDateChange} InputLabelProps={{ shrink: true }} sx={{ width: 220 }} />
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              )}


            </Grid>
          </Box>
        </Box>
      </Paper>

      <AutoSendConfirmDialog open={showConfirmDialog} onClose={handleCancelAutoSend} onConfirm={handleConfirmAutoSend} startTime={startTime} endTime={endTime} onTimeChange={handleTimeChange} timedAutoSend={timedAutoSend} onTimedAutoSendChange={handleTimedAutoSendChange} />

      <HalfAutoSendConfirmDialog open={showHalfAutoConfirmDialog} onClose={handleCancelHalfAutoSend} onConfirm={handleConfirmHalfAutoSend} />

    </>
  );
};

export default SettingsView;