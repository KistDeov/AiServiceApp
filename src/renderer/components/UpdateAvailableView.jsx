import React from "react";
import { Box, Typography, Button } from "@mui/material";

const UpdateAvailableView = ({ onClose }) => {

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
        Frissítés elérhető!
      </Typography>
      <Typography variant="body1">
        Új frissítés érhető el az alkalmazáshoz. A letöltés folyamatban van.
      </Typography>
      <Typography variant="body1">
        <Button variant="contained" sx={{ mt: 2 }} onClick={handleClose}>OK</Button>
      </Typography>
    </Box>
  );
};

export default UpdateAvailableView;