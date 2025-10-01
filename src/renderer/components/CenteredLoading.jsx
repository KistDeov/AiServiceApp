import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

const CenteredLoading = ({ size = 72, text = 'Betöltés...', helperText = null, minHeight = '160px' }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', py: 4, minHeight }}>
      {/* Top title */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>{text}</Typography>

      {/* Helper text larger and centered under the spinner */}
      {helperText && (
        <Typography variant="body1" sx={{ mt: 1, textAlign: 'center', maxWidth: 800, fontSize: '1.05rem', mb: 2 }}>{helperText}</Typography>
      )}

      {/* Spinner centered under the title */}
      <CircularProgress size={size} sx={{ mb: 2 }} />

      
    </Box>
  );
};

export default CenteredLoading;
