import React from "react";
import { Box, Typography, Button } from "@mui/material";

const UpdateReadyView = ({ onClose }) => {

  const handleRestart = () => {
    window.api.restartApp();
  }

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <Box
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "300px",
        textAlign: "center",
        mt: 16,
      }}
    >
      <Typography variant="h5" gutterBottom>
        Frissítés letöltve!
      </Typography>
      <Typography variant="body1">
        <Button variant="outlined" sx={{ mt: 2 }} onClick={handleClose}>Később</Button>
        <Button variant="contained" sx={{ mt: 2, ml: 2 }} onClick={handleRestart}>Újraindítás</Button>
      </Typography>
    </Box>
  );
};

export default UpdateReadyView;