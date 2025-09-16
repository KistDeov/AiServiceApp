import React from "react";
import { Box, Typography, Button, useTheme } from '@mui/material';

const DemoOverView = () => {
  const theme = useTheme();

  const handleExit = () => {
    window.api.openExternal('https://okosmail.hu');
    setTimeout(() => {
      window.api.exitApp();
    }, 500);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        bgcolor: theme.palette.background.default,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography
        variant="h4"
        sx={{
          color: theme.palette.text.primary,
          mt: 6,
          mb: 6,
          alignSelf: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          letterSpacing: 1,
        }}
      >
        Véget ért a próba időszak!
      </Typography>
      <Typography
        variant="h6"
        sx={{
          color: theme.palette.text.primary,
          mt: 4,
          mb: 4,
          p: 6,
          alignSelf: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          letterSpacing: 1,
        }}
      >
        Köszönjük, hogy kipróbáltad az alkalmazást! A további használathoz kérjük, fizessen elő az Ön számára legmegfelelőbb csomagra.
      </Typography>
      <Button variant="contained" color="primary" size="large" onClick={handleExit} sx={{ mt: 2 }}>
        Ok
      </Button>
    </Box>
  );
};

export default DemoOverView;