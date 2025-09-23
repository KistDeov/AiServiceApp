import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";

const UpdateView = () => {
  const [updateState, setUpdateState] = useState(null);

  useEffect(() => {
    const handleUpdateAvailable = () => setUpdateState("available");
    const handleUpdateDownloaded = () => setUpdateState("downloaded");
  
    const ipc = window.electron?.ipcRenderer;
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

    addListener("update-available", handleUpdateAvailable);
    addListener("update-downloaded", handleUpdateDownloaded);

    return () => {
      removeListener("update-available", handleUpdateAvailable);
      removeListener("update-downloaded", handleUpdateDownloaded);
    };
  }, []);

  if (!updateState) return null;

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
        backgroundColor: "#fff",
        borderRadius: 2,
        boxShadow: 3
      }}
    >
      {updateState === "available" && (
        <>
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h5" gutterBottom>
            Frissítés elérhető!
          </Typography>
          <Typography variant="body1">
            Az új frissítés letöltése folyamatban van.
          </Typography>
        </>
      )}
      {updateState === "downloaded" && (
        <>
          <Typography variant="h5" gutterBottom>
            Frissítés letöltve!
          </Typography>
          <Typography variant="body1">
            Az alkalmazás újraindításával telepítheted a frissítést.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default UpdateView;