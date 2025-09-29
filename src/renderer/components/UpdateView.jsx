import React from "react";
import { Box, Typography, CircularProgress, Button } from "@mui/material";

const UpdateView = () => {
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
        Frissítések letöltése folyamatban...
      </Typography>
      <Typography variant="body1">
        Ez eltarthat néhány másodpercig. Kérjük, NE zárd be az alkalmazást!
      </Typography>
      <CircularProgress size={60} sx={{ mb: 3 }} />
    </Box>
  );
};

export default UpdateView;