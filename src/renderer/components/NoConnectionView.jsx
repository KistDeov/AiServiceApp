import { Box, Typography, Button, CircularProgress } from "@mui/material";
import { FiWifiOff } from "react-icons/fi";
import React, { useState } from "react";

const NoConnectionView = ({ onRetry }) => {
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setLoading(true);
    try {
      await onRetry();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography>
        <FiWifiOff size={64} />
      </Typography>
      <Typography variant="h5">Nincs internetkapcsolat</Typography>
      <Typography variant="body1">
        Kérjük, ellenőrizze a hálózatot, majd próbálja újra.
      </Typography>
      <Box>
        <Button
          variant="contained"
          onClick={handleRetry}
          disabled={loading}
        >
          {loading ? <CircularProgress size={22} /> : 'Próbáld újra'}
        </Button>
      </Box>
    </Box>
  );
}

export default NoConnectionView;