window.global ||= window;

import React, { useEffect, useState } from "react";
import ReactDOM from 'react-dom/client';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Button,
  TextField,
  Snackbar,
  Alert,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Select,
  MenuItem,
  Card,
  CardContent,
  FormGroup,
  Switch,
  CssBaseline,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import HomeView from './components/HomeView';
import ImportFileView from './components/ImportFileView';
import PromptView from './components/PromptView';
import SentMailsView from './components/SentMailsView';
import MailsView from './components/MailsView';
import SettingsView from './components/SettingsView';
import MailStructureView from './components/MailStructureView';
import TutorialView from './components/TutorialView';
import DemoOverView from './components/DemoOverView';
import HelpView from './components/HelpView';
import NoConnectionView from './components/NoConnectionView.jsx';
import LicenceActivationView from './components/LicenceActivationView.jsx';
import { FaRegQuestionCircle, FaBars, FaThumbtack, FaHome, FaEnvelope, FaDatabase, FaRobot, FaCog, FaSignOutAlt, FaPowerOff, FaUserFriends } from 'react-icons/fa';
import { FaEnvelopeCircleCheck } from "react-icons/fa6";
import { IoMdConstruct } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { FaTimesCircle } from "react-icons/fa";
import IconButton from '@mui/material/IconButton';
import ReplyStatsChart from './components/ReplyStatsChart';

// Téma objektumok
const themes = {
  purple: createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#7b1fa2' },
      background: { default: '#121015', paper: '#1f122a' },
      text: { primary: '#e1bee7', secondary: '#b39ddb' },
    },
    drawer: {
      gradient: 'linear-gradient(to right, #7b1fa2 50%, transparent)',
      shadow: '2px 0 8px 0 #7b1fa2',
      curtainGradient: 'linear-gradient(to right, #7b1fa2 80%, transparent)',
      triggerColor: '#bf55ec',
    },
  }),
  black: createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#ffd600' },
      background: { default: '#000', paper: '#181818' },
      text: { primary: '#fff', secondary: '#aaa' },
    },
    drawer: {
      gradient: 'linear-gradient(to right, #444 50%, transparent)',
      shadow: '2px 0 8px 0 #111',
      curtainGradient: 'linear-gradient(to right, #444 80%, transparent)',
      triggerColor: '#fff',
    },
  }),
  light: createTheme({
    palette: {
      mode: 'light',
      primary: { main: '#1976d2' },
      background: { default: '#fff', paper: '#f5f5f5' },
      text: { primary: '#222', secondary: '#555' },
    },
    drawer: {
      gradient: 'linear-gradient(to right, #1976d2 50%, transparent)',
      shadow: '2px 0 8px 0 #1976d2',
      curtainGradient: 'linear-gradient(to right, #1976d2 80%, transparent)',
      triggerColor: '#64b5f6',
    },
  }),
  red: createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#d32f2f' },
      background: { default: '#2a0909', paper: '#4a1a1a' },
      text: { primary: '#fff', secondary: '#ffb3b3' },
    },
    drawer: {
      gradient: 'linear-gradient(to right, #d32f2f 50%, transparent)',
      shadow: '2px 0 8px 0 #d32f2f',
      curtainGradient: 'linear-gradient(to right, #d32f2f 80%, transparent)',
      triggerColor: '#ff5252',
    },
  }),
  blue: createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#1976d2' },
      background: { default: '#0d1b2a', paper: '#1b263b' },
      text: { primary: '#e0e1dd', secondary: '#a9bcd0' },
    },
    drawer: {
      gradient: 'linear-gradient(to right, #1976d2 50%, transparent)',
      shadow: '2px 0 8px 0 #1976d2',
      curtainGradient: 'linear-gradient(to right, #1976d2 80%, transparent)',
      triggerColor: '#64b5f6',
    },
  }),
};

const ExitDialog = ({ open, onClose, onConfirm }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      PaperProps={{
        sx: {
          backgroundColor: 'background.paper',
          color: 'text.primary',
          '& .MuiDialogContent-root': {
            backgroundColor: 'background.paper'
          },
          '& .MuiDialogActions-root': {
            backgroundColor: 'background.paper'
          }
        }
      }}
    >
      <DialogTitle id="alert-dialog-title" sx={{ color: 'text.primary', backgroundColor: 'background.paper' }}>
        Biztosan ki szeretne lépni?
      </DialogTitle>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Mégsem
        </Button>
        <Button onClick={onConfirm} color="primary" variant="contained" autoFocus>
          Kilépés
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const LogoutDialog = ({ open, onClose, onConfirm }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      PaperProps={{
        sx: {
          backgroundColor: 'background.paper',
          color: 'text.primary',
          '& .MuiDialogContent-root': {
            backgroundColor: 'background.paper'
          },
          '& .MuiDialogActions-root': {
            backgroundColor: 'background.paper'
          }
        }
      }}
    >
      <DialogTitle id="alert-dialog-title" sx={{ color: 'text.primary', backgroundColor: 'background.paper' }}>
        Biztosan kijelentkezik?
      </DialogTitle>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Mégsem
        </Button>
        <Button onClick={onConfirm} color="primary" variant="contained" autoFocus>
          Kijelentkezés
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const SmtpSettingsDialog = ({ open, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    imapHost: '',
    imapPort: '993',
    smtpHost: '',
    smtpPort: '587',
    useSSL: true
  });

  const handleChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'useSSL' ? event.target.checked : event.target.value
    }));
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const isFormValid = () => {
    return formData.email && 
           formData.password && 
           formData.imapHost && 
           formData.imapPort && 
           formData.smtpHost && 
           formData.smtpPort;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Email fiók beállítások</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Email cím"
            value={formData.email}
            onChange={handleChange('email')}
            fullWidth
            required
          />
          <TextField
            label="Jelszó"
            type="password"
            value={formData.password}
            onChange={handleChange('password')}
            fullWidth
            required
          />
          <TextField
            label="IMAP Szerver"
            value={formData.imapHost}
            onChange={handleChange('imapHost')}
            fullWidth
            required
            placeholder="pl.: imap.gmail.com"
          />
          <TextField
            label="IMAP Port"
            value={formData.imapPort}
            onChange={handleChange('imapPort')}
            fullWidth
            required
          />
          <TextField
            label="SMTP Szerver"
            value={formData.smtpHost}
            onChange={handleChange('smtpHost')}
            fullWidth
            required
            placeholder="pl.: smtp.gmail.com"
          />
          <TextField
            label="SMTP Port"
            value={formData.smtpPort}
            onChange={handleChange('smtpPort')}
            fullWidth
            required
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.useSSL}
                onChange={handleChange('useSSL')}
              />
            }
            label="SSL/TLS használata"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégsem</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={!isFormValid() || loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Csatlakozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const LoginView = ({ onLogin, showSnackbar }) => {
  const [selectedProvider, setSelectedProvider] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSmtpDialog, setShowSmtpDialog] = useState(false);

  const handleProviderSelect = async (provider) => {
    setSelectedProvider(provider);
    if (provider === 'smtp') {
      setShowSmtpDialog(true);
      return;
    }

    setLoading(true);
    try {
      let success = false;
      let email = '';
      if (provider === 'gmail') {
        success = await window.api.loginWithGmail();
        // Próbáljuk lekérni az email címet is, ha van ilyen API
        if (success && window.api.getCurrentUserEmail) {
          try {
            email = await window.api.getCurrentUserEmail();
          } catch (e) { email = ''; }
        }
      }
      if (success) {
        showSnackbar('Sikeres bejelentkezés!', 'success');
        onLogin(provider, email); // Átadjuk az emailt is
      }
    } catch (error) {
      showSnackbar('Hiba történt a bejelentkezés során!', 'error');
      console.error('Bejelentkezési hiba:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSmtpSubmit = async (formData) => {
    setLoading(true);
    try {
      const success = await window.api.loginWithSmtp(formData);
      if (success) {
        showSnackbar('Sikeres bejelentkezés!', 'success');
        setShowSmtpDialog(false);
        onLogin('smtp', formData.email); // Átadjuk az emailt is
      } else {
        showSnackbar('Sikertelen bejelentkezés!', 'error');
      }
    } catch (error) {
      showSnackbar('Hiba történt a bejelentkezés során!', 'error');
      console.error('SMTP bejelentkezési hiba:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      gap: 4
    }}>
      <Typography variant="h4" gutterBottom>
        Válasszon ki egy email címet a levelezés elkezdéséhez
      </Typography>
      <Box sx={{ 
        display: 'flex', 
        gap: 2, 
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 1000
      }}>
        <Card sx={{ width: 300, cursor: 'pointer' }} onClick={() => handleProviderSelect('gmail')}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Gmail</Typography>
            <Typography>
              Bejelentkezés Google fiókkal
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ width: 300, cursor: 'pointer' }} onClick={() => handleProviderSelect('smtp')}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Egyéb (SMTP/IMAP)</Typography>
            <Typography>
              Bejelentkezés egyéb email fiókkal
            </Typography>
          </CardContent>
        </Card>
      </Box>
      {loading && !showSmtpDialog && <CircularProgress sx={{ mt: 4 }} />}

      <SmtpSettingsDialog
        open={showSmtpDialog}
        onClose={() => setShowSmtpDialog(false)}
        onSubmit={handleSmtpSubmit}
        loading={loading}
      />
    </Box>
  );
};


const AutoSendConfirmDialog = ({ open, onClose, onConfirm, startTime, endTime, onTimeChange, timedAutoSend, onTimedAutoSendChange }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Automatikus válaszküldés bekapcsolása</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Biztosan be szeretné kapcsolni az automatikus válasz küldést? A rendszer automatikusan fog válaszolni az ÖSSZES olvasatlan levélre.
      </DialogContentText>
      <Box sx={{ mt: 3 }}>
        <FormControlLabel
          control={<Switch checked={timedAutoSend} onChange={onTimedAutoSendChange} />}
          label="Időzített automatikus válaszküldés"
        />
        {timedAutoSend && (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 2 }}>
            <TextField
              label="Kezdő időpont"
              type="time"
              value={startTime}
              onChange={onTimeChange('start')}
              sx={{ width: 150 }}
            />
            <Typography sx={{ mx: 2 }}>-</Typography>
            <TextField
              label="Befejező időpont"
              type="time"
              value={endTime}
              onChange={onTimeChange('end')}
              sx={{ width: 150 }}
            />
          </Box>
        )}
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Mégsem</Button>
      <Button onClick={onConfirm} variant="contained" autoFocus>Bekapcsolás</Button>
    </DialogActions>
  </Dialog>
);

const App = () => {
  // MINDEN HOOK ITT!
  const [isDemoOver, setIsDemoOver] = useState(false);
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem('themeName') || 'black';
  });
  // ...többi useState, useEffect...
  // Az activeView állapotot localStorage-ból olvassuk ki, ha van mentett érték
  const [activeView, setActiveView] = useState(('home'));
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLeftNavbarOn, setIsLeftNavbarOn] = useState(true);
  const [isPinned, setIsPinned] = useState(true); // alapból true
  const [drawerOpen, setDrawerOpen] = useState(true); // alapból true
  const [isOnline, setIsOnline] = useState(true); // ÚJ: internet állapot
  const [autoSend, setAutoSend] = useState(false);
  const [isLicenced, setIsLicenced] = useState(() => {
    return localStorage.getItem('isLicenced') === 'true';
  }); // ÚJ: licenc állapot
  const [showAutoSendDialog, setShowAutoSendDialog] = useState(false);
  const [pendingAutoSend, setPendingAutoSend] = useState(false);
  const [timedAutoSend, setTimedAutoSend] = useState(true);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");

  // Navbar állapot inicializálása settingsből
  useEffect(() => {
    window.api.getLeftNavbarMode?.().then((on) => {
      setIsLeftNavbarOn(on ?? true);
      setIsPinned(on ?? true);
      setDrawerOpen(on ?? true);
    });
  }, []);

  // drawerOpen vagy isPinned változásakor is szinkronizáljuk:
  useEffect(() => {
    setIsLeftNavbarOn(isPinned || drawerOpen);
    window.api.setLeftNavbarMode?.(isPinned || drawerOpen);
  }, [isPinned, drawerOpen]);

  // A tutorial állapotot localStorage-ból olvassuk ki, ha már egyszer átlépte vagy bejelentkezett a felhasználó
  const [isTutorialShown, setIsTutorialShown] = useState(() => {
    return localStorage.getItem('isTutorialShown') === 'true';
  });
  const [emailProvider, setEmailProvider] = useState(null);
  const [userEmail, setUserEmail] = useState(''); // ÚJ: email state
  const [search, setSearch] = useState('');


  // Mentés localStorage-ba, ha activeView változik
  useEffect(() => {
    localStorage.setItem('activeView', activeView);
  }, [activeView]);

  const theme = useTheme();

  useEffect(() => {
    localStorage.setItem('themeName', themeName);
  }, [themeName]);

  // Hover logic
  const handleDrawerMouseEnter = () => {
    if (!isPinned) setDrawerOpen(true);
  };
  const handleDrawerMouseLeave = () => {
    if (!isPinned) setDrawerOpen(false);
  };
  const handlePinClick = () => {
    setIsPinned((prev) => {
      const newPinned = !prev;
      if (newPinned) {
        setDrawerOpen(true); // Pin -> mindig nyitva
      } else {
        setDrawerOpen(false); // Unpin -> zárjuk
      }
      setIsLeftNavbarOn(newPinned || drawerOpen);
      return newPinned;
    });
  };

  // Ellenőrizzük, hogy van-e mentett bejelentkezés
  useEffect(() => {
    window.api.checkAuthStatus()
      .then(status => {
        if (status.isAuthenticated) {
          setIsAuthenticated(true);
          setEmailProvider(status.provider);
          if (status.email) setUserEmail(status.email); // ÚJ: email beállítása, ha van
          // Ha már bejelentkezett, a tutorialt soha többé ne mutassuk
          if (!isTutorialShown) {
            setIsTutorialShown(true);
            localStorage.setItem('isTutorialShown', 'true');
          }
        } else {
          setIsAuthenticated(false);
          setEmailProvider(null);
          setUserEmail(''); // ÚJ: email törlése
        }
      })
      .catch(error => {
        console.error('Hiba az authentikáció ellenőrzésekor:', error);
        setIsAuthenticated(false);
        setEmailProvider(null);
        setUserEmail(''); // ÚJ: email törlése
      });
  }, []);

  const handleLogin = (provider, email) => {
    setIsAuthenticated(true);
    setEmailProvider(provider);
    setUserEmail(email || ''); // ÚJ: email beállítása
    // Ha bejelentkezett, a tutorialt soha többé ne mutassuk
    if (!isTutorialShown) {
      setIsTutorialShown(true);
      localStorage.setItem('isTutorialShown', 'true');
    }
  };

  const handleLogoutClick = () => {
    setLogoutDialogOpen(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await window.api.logout();
      setIsAuthenticated(false);
      setEmailProvider(null);
      setUserEmail(''); // ÚJ: email törlése
      setLogoutDialogOpen(false);
      showSnackbar('Sikeres kijelentkezés!', 'success');
    } catch (error) {
      showSnackbar('Hiba történt a kijelentkezés során!', 'error');
      console.error('Kijelentkezési hiba:', error);
    }
  };

  const handleLogoutCancel = () => {
    setLogoutDialogOpen(false);
  };

  const handleExitClick = () => {
    setExitDialogOpen(true);
  };

  const handleExitConfirm = () => {
    window.api.exitApp();
  };

  const handleExitCancel = () => {
    setExitDialogOpen(false);
  };

  // AutoSend állapot lekérdezése indításkor ÉS dinamikus frissítés
  useEffect(() => {
    let unsub = null;
    // Első lekérdezés
    window.api.getAutoSend?.().then(val => setAutoSend(!!val));
    // Dinamikus frissítés, ha van ilyen event
    if (window.api.onAutoSendChanged) {
      const handler = (val) => setAutoSend(!!val);
      window.api.onAutoSendChanged(handler);
      unsub = () => window.api.onAutoSendChanged(null);
    } else if (window.api.subscribeAutoSendChanged) {
      // Alternatív API támogatás
      unsub = window.api.subscribeAutoSendChanged((val) => setAutoSend(!!val));
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleAutoSendSwitch = (event) => {
    const checked = event.target.checked;
    if (checked) {
      setPendingAutoSend(true);
      setShowAutoSendDialog(true);
    } else {
      setAutoSend(false);
      window.api.setAutoSend(false).then(() => {
        window.api.onAutoSendChanged?.(false);
      });
    }
  };

  const handleConfirmAutoSend = () => {
    setAutoSend(true);
    window.api.setAutoSend(true).then(() => {
      window.api.onAutoSendChanged?.(true);
    });
    window.api.setTimedAutoSend && window.api.setTimedAutoSend(timedAutoSend);
    setShowAutoSendDialog(false);
    setPendingAutoSend(false);
  };

  const handleCancelAutoSend = () => {
    setShowAutoSendDialog(false);
    setPendingAutoSend(false);
  };

  const handleTimeChange = (type) => (event) => {
    const newTime = event.target.value;
    if (type === 'start') {
      setStartTime(newTime);
      window.api.setAutoSendTimes?.({ startTime: newTime, endTime });
    } else {
      setEndTime(newTime);
      window.api.setAutoSendTimes?.({ startTime, endTime: newTime });
    }
  };

  const handleTimedAutoSendChange = (event) => {
    setTimedAutoSend(event.target.checked);
    window.api.setTimedAutoSend && window.api.setTimedAutoSend(event.target.checked);
  };

  const renderView = () => {
    switch (activeView) {
      case 'mails': return <MailsView showSnackbar={showSnackbar} />;
      case 'sentMails': return <SentMailsView showSnackbar={showSnackbar} />;
      case 'mailStructure': return <MailStructureView showSnackbar={showSnackbar} />;
      case 'settings': return <SettingsView
  themeName={themeName}
  setThemeName={setThemeName}
  onAutoSendChanged={setAutoSend}
/>;
      case 'import': return <ImportFileView showSnackbar={showSnackbar} />;
      case 'prompt': return <PromptView showSnackbar={showSnackbar} />;
      case 'help': return <HelpView showSnackbar={showSnackbar} />;
      default: return <HomeView showSnackbar={showSnackbar} reloadKey={activeView} />;
    }
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };


  // OFFLINE nézet minden más előtt
  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => setIsOnline(true);

    const addListener = (channel, fn) => {
      if (!ipc) return;
      if (typeof ipc.on === 'function') ipc.on(channel, fn);
      else if (typeof ipc.addListener === 'function') ipc.addListener(channel, fn);
    };
    const removeListener = (channel, fn) => {
      if (!ipc) return;
      if (typeof ipc.removeListener === 'function') ipc.removeListener(channel, fn);
      else if (typeof ipc.off === 'function') ipc.off(channel, fn);
    };

    addListener('no-internet-connection', handleOffline);
    addListener('internet-connection-restored', handleOnline);

    // Browser/Electron fallback
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Kezdő állapot ellenőrzése
    window.api.checkInternet?.().then(ok => setIsOnline(!!ok));

    // Ha offline leszünk, 10 mp-enként újra próbáljuk
    let retryInterval = null;
    if (!isOnline) {
      retryInterval = setInterval(() => {
        window.api.checkInternet?.().then(ok => {
          if (ok) {
            setIsOnline(true);
          }
        });
      }, 10000);
    }

    return () => {
      removeListener('no-internet-connection', handleOffline);
      removeListener('internet-connection-restored', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (retryInterval) clearInterval(retryInterval);
    };
  }, [isOnline]);

  // Demo állapot folyamatos ellenőrzése
  useEffect(() => {
    let cancelled = false;
    const checkDemoOver = async () => {
      try {
        const over = await window.api.isDemoOver();
        if (!cancelled) setIsDemoOver(over);
      } catch (e) {
        if (!cancelled) setIsDemoOver(false);
      }
    };
    checkDemoOver();
    const interval = setInterval(checkDemoOver, 5000); // 5 másodpercenként ellenőriz
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!isOnline) {
    const retryConnection = async () => {
      const ok = await window.api.checkInternet?.();
      setIsOnline(!!ok);
    };
    return (
      <ThemeProvider theme={themes[themeName] || themes.black}>
        <CssBaseline />
        <Box sx={{ p: 4 }}>
          <NoConnectionView onRetry={retryConnection} />
        </Box>
      </ThemeProvider>
    );
  }

  if (!isLicenced && !isDemoOver && !isAuthenticated) {
    return (
      <ThemeProvider theme={themes[themeName] || themes.black}>
        <CssBaseline />
        <LicenceActivationView /*onActivate={handleActivate}*/ />
      </ThemeProvider>
    );
  }

  // Ha a demo véget ért, csak a DemoOverView-t jelenítjük meg, minden más logikát kihagyva
  if (isDemoOver) {
    return (
      <ThemeProvider theme={themes[themeName] || themes.black}>
        <CssBaseline />
        <DemoOverView />
      </ThemeProvider>
    );
  }

  if (!isAuthenticated && isTutorialShown) {
    return (
      <ThemeProvider theme={themes[themeName] || themes.black}>
        <CssBaseline />
        <LoginView onLogin={handleLogin} showSnackbar={showSnackbar} />
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={4000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </ThemeProvider>
    );
  }

  if (!isAuthenticated && !isTutorialShown) {
    return (
      <ThemeProvider theme={themes[themeName] || themes.black}>
        <CssBaseline />
        <TutorialView onSkip={() => {
          setIsTutorialShown(true);
          localStorage.setItem('isTutorialShown', 'true');
        }} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={themes[themeName] || themes.black}>
      <CssBaseline />
      {/* Felső navigációs sáv */}
      <Box
        sx={{
          width: '100vw',
          height: 56,
          backgroundColor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1400,
          boxShadow: 4,
          px: 4,
          position: 'relative',
        }}
      >
        {/* Középre pontosan igazított ikonok */}
        <Box sx={{ display: 'flex', gap: 4, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <IconButton onClick={() => setActiveView('home')} color={activeView === 'home' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaHome size={22} />
          </IconButton>
          <IconButton onClick={() => setActiveView('mails')} color={activeView === 'mails' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaEnvelope size={22} />
          </IconButton>
          <IconButton onClick={() => setActiveView('sentMails')} color={activeView === 'sentMails' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaEnvelopeCircleCheck size={27} />
          </IconButton>
          <IconButton onClick={() => setActiveView('mailStructure')} color={activeView === 'mailStructure' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <IoMdConstruct size={22} />
          </IconButton>
          <IconButton onClick={() => setActiveView('import')} color={activeView === 'import' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaDatabase size={22} />
          </IconButton>
          <IconButton onClick={() => setActiveView('prompt')} color={activeView === 'prompt' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaRobot size={22} />
          </IconButton>
        </Box>
        {/* Közép és jobb ikonok közé helyezett AutoSend státusz */}
        <Box sx={{
          position: 'absolute',
          left: 'calc(75% - 16px)', // 75% a közép és jobb széle között, -16px hogy középre essen az ikon
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
        }}>
          <Typography variant="srOnly">Auto</Typography>
          <Switch
    checked={autoSend || pendingAutoSend}
    onChange={handleAutoSendSwitch}
    color={autoSend ? "success" : "error"}
    inputProps={{ 'aria-label': 'Automatikus válaszküldés kapcsoló' }}
    sx={{
      '& .MuiSwitch-switchBase.Mui-checked': {
        color: '#4caf50',
      },
      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
        backgroundColor: '#4caf50',
      },
      '& .MuiSwitch-switchBase': {
        color: '#d32f2f',
      },
      '& .MuiSwitch-track': {
        backgroundColor: '#d32f2f',
      },
    }}
  />
        </Box>
        {/* Jobbra igazított ikonok */}
        <Box sx={{ display: 'flex', gap: 4, position: 'absolute', right: 32 }}>
          {/* <FaDotCircle /> -- EZT TÖRÖLD, mert most már külön van */}
          <IconButton onClick={() => setActiveView('help')} color={activeView === 'help' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaRegQuestionCircle size={22} />
          </IconButton>
          <IconButton onClick={() => setActiveView('settings')} color={activeView === 'settings' ? 'default' : 'inherit'} sx={{ color: 'text.primary' }}>
            <FaCog size={22} />
          </IconButton>
          <IconButton onClick={handleLogoutClick} sx={{ color: 'text.primary' }}>
            <FaSignOutAlt size={22} />
          </IconButton>
          <IconButton onClick={handleExitClick} sx={{ color: 'text.primary' }}>
            <FaPowerOff size={22} />
          </IconButton>
        </Box>
        {/*Balra igazított logó*/}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', position: 'absolute', left: 32 }}>
          <Typography variant="h5">Ai Mail</Typography>
          {userEmail && (
            <Typography variant="body2" sx={{ ml: 1, color: 'text.primary', fontWeight: 500, fontSize: '1.4rem' }}>
              {userEmail}
            </Typography>
          )}
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* A tartalom lejjebb tolása a felső sáv miatt */}
        <Box
          sx={{
            position: 'fixed',
            top: 56,
            left: 0,
            height: 'calc(100vh - 56px)',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          {/* Trigger sáv, csak ha nincs nyitva/pinned */}
          {!(isPinned || drawerOpen) && (
            <Box
              onMouseEnter={handleDrawerMouseEnter}
              sx={{
                width: 20,
                height: '100%',
                background: `linear-gradient(to right, ${theme.drawer?.triggerColor} 40%, ${theme.palette.background.default} 100%)`,
                opacity: 1,
                borderRight: `2px solid ${theme.palette.text.secondary}`,
                boxShadow: `2px 0 8px 0 ${theme.palette.text.secondary}`,
                borderTopRightRadius: 6,
                borderBottomRightRadius: 6,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            />
          )}
          {/* Drawer csak ha nyitva vagy pinned */}
          {(isPinned || drawerOpen) && (
            <Drawer
              variant={isPinned ? 'permanent' : 'persistent'}
              open={drawerOpen || isPinned}
              sx={{
                width: 200,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                  width: 200,
                  boxSizing: 'border-box',
                  backgroundColor: 'background.paper',
                  transition: 'left 0.2s',
                  left: drawerOpen || isPinned ? 0 : -200,
                  zIndex: 1300,
                  top: 56,
                  height: 'calc(100vh - 56px)',
                },
                position: 'fixed',
                zIndex: 1300,
              }}
              PaperProps={{
                sx: {
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100vh',
                  backgroundColor: 'background.paper',
                  color: 'text.primary',
                  boxShadow: 4,
                  mt: 0,
                  pt: 0,
                  top: 56,
                  height: 'calc(100vh - 56px)',
                }
              }}
              onMouseLeave={handleDrawerMouseLeave}
            >
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', p: 1 }}>
                <Typography variant='caption' sx={{ mr: 5.5 }}>Verzió: Demo 1.5</Typography>
                <IconButton onClick={handlePinClick} size="small" color={isPinned ? 'error' : 'default'}>
                  {isPinned ? (
                    <FaTimesCircle size={20} color="#d32f2f" />
                  ) : (
                    <FaThumbtack size={20} />
                  )}
                </IconButton>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <List>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'home'} onClick={() => setActiveView('home')}>
                      <ListItemText primary="Főoldal" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'mails'} onClick={() => setActiveView('mails')}>
                      <ListItemText primary="Beérkezett levelek" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'sentMails'} onClick={() => setActiveView('sentMails')}>
                      <ListItemText primary="Elküldött levelek" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'mailStructure'} onClick={() => setActiveView('mailStructure')}>
                      <ListItemText primary="Levél szerkezet" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'import'} onClick={() => setActiveView('import')}>
                      <ListItemText primary="Adatbázis" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'prompt'} onClick={() => setActiveView('prompt')}>
                      <ListItemText primary="AI Szöveg" />
                    </ListItemButton>
                  </ListItem>
                </List>
                <Box sx={{ flexGrow: 1 }} />
                <List>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'help'} onClick={() => setActiveView('help')}>
                      <ListItemText primary="Súgó" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton selected={activeView === 'settings'} onClick={() => setActiveView('settings')}>
                      <ListItemText primary="Beállítások" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton onClick={handleLogoutClick}>
                      <ListItemText primary="Fiókváltás" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton onClick={handleExitClick}>
                      <ListItemText primary="Kilépés" />
                    </ListItemButton>
                  </ListItem>
                </List>
              </Box>
            </Drawer>
          )}
        </Box>
        <Box component="main" sx={{ flexGrow: 1, pl: 4, pr: 4, pb: 4, pt: 1, ml: (drawerOpen || isPinned) ? '200px' : 0, transition: 'margin-left 0.2s', mt: '10px' }}>
          {renderView()}
        </Box>
        <ExitDialog
          open={exitDialogOpen}
          onClose={handleExitCancel}
          onConfirm={handleExitConfirm}
        />
        <LogoutDialog
          open={logoutDialogOpen}
          onClose={handleLogoutCancel}
          onConfirm={handleLogoutConfirm}
        />
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={4000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
        <AutoSendConfirmDialog
  open={showAutoSendDialog}
  onClose={handleCancelAutoSend}
  onConfirm={handleConfirmAutoSend}
  startTime={startTime}
  endTime={endTime}
  onTimeChange={handleTimeChange}
  timedAutoSend={timedAutoSend}
  onTimedAutoSendChange={handleTimedAutoSendChange}
/>
      </Box>
    </ThemeProvider>
  );
};

// Initialize React only when DOM is ready
const initializeReact = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('Root element not found!');
    return;
  }

  // Clear any existing content
  while (rootElement.firstChild) {
    rootElement.removeChild(rootElement.firstChild);
  }

  const root = ReactDOM.createRoot(rootElement);

  // Cleanup on unmount
  const cleanup = () => {
    try {
      root.unmount();
    } catch (error) {
      console.error('Error during unmount:', error);
    }
  };

  window.addEventListener('beforeunload', cleanup);

  // Handle errors during render
  try {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Error during render:', error);
    cleanup();
  }
};

// Ensure DOM is fully loaded before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeReact);
} else {
  initializeReact();
}
