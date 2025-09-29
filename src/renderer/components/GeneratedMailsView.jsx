import React from 'react';
import { Typography, Paper } from '@mui/material';

const GeneratedMailsView = () => {
  return (
    <Paper sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Előkészített levelek    
      </Typography>
      <Typography variant="body1">
        Itt találhatók az előkészített levelek.
      </Typography>
    </Paper>
  );
};

export default GeneratedMailsView;