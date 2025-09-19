import React, { useState } from "react";
import { Box, Typography } from '@mui/material';

const UpdateView = () => {
    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                Update View
            </Typography>
            <Typography variant="body1">
                This is the update view component.
            </Typography>
        </Box>
    );
};

export default UpdateView;