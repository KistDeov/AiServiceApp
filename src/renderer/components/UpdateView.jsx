import React from "react";
import { Box, Typography, CircularProgress, Button } from "@mui/material";

const UpdateView = ({ message, buttons }) => {
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
        {message || "Frissítések letöltése folyamatban..."}
      </Typography>
      <Typography variant="body1">
        Ez eltarthat néhány percig
      </Typography>
      {buttons && (
        <Box sx={{ mt: 3, display: "flex", gap: 2 }}>
          {buttons.map((button, index) => (
            <Button
              key={index}
              variant={button.variant || "contained"}
              color={button.color || "primary"}
              onClick={button.onClick}
            >
              {button.label}
            </Button>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default UpdateView;