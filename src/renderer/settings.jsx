import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
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
  Radio
} from '@mui/material';
import { ml } from 'googleapis/build/src/apis/ml';

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

const themeOptions = [
  { value: 'black', label: 'Sötét (Alapértelmezett)' },
  { value: 'purple', label: 'Lila' },
  { value: 'light', label: 'Fehér' },
  { value: 'red', label: 'Piros' },
  { value: 'blue', label: 'Kék' },
];

const SettingsView = ({ themeName, setThemeName, onAutoSendChanged }) => {
  const [autoSend, setAutoSend] = useState(false);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [timedAutoSend, setTimedAutoSend] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAutoSend, setPendingAutoSend] = useState(false);
  const [displayMode, setDisplayMode] = useState('windowed');
  const [ignoredEmails, setIgnoredEmails] = useState("");
  const [minEmailDate, setMinEmailDate] = useState(""); // ÚJ
  const [maxEmailDate, setMaxEmailDate] = useState(""); // ÚJ

  useEffect(() => {
    Promise.all([
      window.api.getAutoSend(),
      window.api.getAutoSendTimes(),
      window.api.getDisplayMode(),
      window.api.getTimedAutoSend ? window.api.getTimedAutoSend() : Promise.resolve(true),
      window.api.getIgnoredEmails ? window.api.getIgnoredEmails() : Promise.resolve([]),
      window.api.getMinEmailDate ? window.api.getMinEmailDate() : Promise.resolve(""),
      window.api.getMaxEmailDate ? window.api.getMaxEmailDate() : Promise.resolve("")
    ]).then(([autoSendVal, times, mode, timed, ignored, minDate, maxDate]) => {
      setAutoSend(autoSendVal);
      setStartTime(times.startTime);
      setEndTime(times.endTime);
      setDisplayMode(mode || 'windowed');
      setTimedAutoSend(typeof timed === 'boolean' ? timed : true);
      setIgnoredEmails((ignored || []).join(", "));
      setMinEmailDate(minDate || "");
      setMaxEmailDate(maxDate || "");
      setLoading(false);
      window.global.autoSend = autoSendVal;
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

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <>
      <Paper sx={{
        p: 4,
        maxHeight: '84vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box sx={{
          overflowY: 'auto',
          flex: 1,
          pr: 2,
          mr: -2
        }}>
          <Typography variant="h4" gutterBottom>Beállítások</Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  sx={{ ml: 1 }}
                  checked={autoSend || pendingAutoSend}
                  onChange={handleAutoSendChange}
                />
              }
              label="Automatikus válaszküldés"
            />
            
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Megjelenítési mód
              </Typography>
              
              <RadioGroup
                value={displayMode}
                onChange={handleDisplayModeChange}
              >
                <FormControlLabel 
                  value="windowed" 
                  control={<Radio />} 
                  label="Ablakos mód" 
                />
                <FormControlLabel 
                  value="fullscreen" 
                  control={<Radio />} 
                  label="Teljes képernyő" 
                />
              </RadioGroup>
              
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Válassza ki az alkalmazás megjelenítési módját. A változtatások azonnal életbe lépnek.
              </Typography>
            </Box>
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Téma
              </Typography>
              <RadioGroup
                value={themeName}
                onChange={e => setThemeName(e.target.value)}
                row
              >
                {themeOptions.map(opt => (
                  <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                ))}
              </RadioGroup>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Válassza ki az alkalmazás színvilágát. A változtatás azonnal látszik.
              </Typography>
            </Box>
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Tiltott email címek (szűrő)
              </Typography>
              <TextField
                label="Email címek vesszővel elválasztva"
                value={ignoredEmails}
                onChange={handleIgnoredEmailsChange}
                onBlur={handleIgnoredEmailsBlur}
                placeholder="pl. spam@example.com, noreply@domain.hu"
                fullWidth
                multiline
                minRows={2}
                sx={{ mt: 1 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Az itt megadott email címekről érkező leveleket a rendszer figyelmen kívül hagyja a válaszküldésnél (mint a spamet).
              </Typography>
            </Box>
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Csak a megadott dátumok között érkezett levelek feldolgozása
              </Typography>
              <TextField
                label="Minimum dátum"
                type="date"
                value={minEmailDate}
                onChange={handleMinEmailDateChange}
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 1, width: 220 }}
              />
              <TextField
                label="Maximum dátum"
                type="date"
                value={maxEmailDate}
                onChange={handleMaxEmailDateChange}
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 1, width: 220, ml: 2 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Csak az itt megadott dátumok között érkezett leveleket dolgozza fel a rendszer.
              </Typography>
            </Box>
          </FormGroup>
        </Box>
      </Paper>

      <AutoSendConfirmDialog
        open={showConfirmDialog}
        onClose={handleCancelAutoSend}
        onConfirm={handleConfirmAutoSend}
        startTime={startTime}
        endTime={endTime}
        onTimeChange={handleTimeChange}
        timedAutoSend={timedAutoSend}
        onTimedAutoSendChange={handleTimedAutoSendChange}
      />
    </>
  );
};

export default SettingsView;