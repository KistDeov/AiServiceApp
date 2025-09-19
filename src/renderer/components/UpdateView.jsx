import React from "react";
import { Box, Typography, CircularProgress } from "@mui/material";

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
        textAlign: "center"
      }}
    >
      <CircularProgress size={60} sx={{ mb: 3 }} />
      <Typography variant="h5" gutterBottom>
        Frissítések letöltése folyamatban...
      </Typography>
      <Typography variant="body1">
        Ez eltarthat néhány percig
      </Typography>
    </Box>
  );
};

export default UpdateView;