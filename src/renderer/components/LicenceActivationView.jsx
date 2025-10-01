import React, { useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, TextField, Button, Typography } from "@mui/material";

const LicenceActivationView = ({}) => {
    const theme = useTheme();
    const [email, setEmail] = useState("");
    const [licence, setLicence] = useState("");
    const [touched, setTouched] = useState({ email: false, licence: false });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(""); // új state

    const normalisedLicence = licence.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16);

    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isLicenceValid = normalisedLicence.length === 16;

    const canSubmit = isEmailValid && isLicenceValid && !submitting;

    const handleLicenceChange = (e) => {
        const raw = e.target.value;
        const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16);
        // Optional: format into 4-4-4-4 groups
        const grouped = cleaned.match(/.{1,4}/g)?.join("-") || "";
        setLicence(grouped);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setTouched({ email: true, licence: true });
        setError("");
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const payload = { email: email.trim(), licenceKey: normalisedLicence };
            // IPC call to backend
            const res = await window.api.checkLicence(payload);
            if (res.success) {
                // Check if already activated
                const alreadyActivated = await window.api.isLicenceActivated(payload);
                if (alreadyActivated) {
                    setError("A licenc már aktiválva van az adatbázisban.");
                } else {
                    // Perform activation on the backend
                    const act = await window.api.activateLicence(payload);
                    if (act && act.success) {
                        // Successful activation: set license state via IPC
                        await window.api.setEmail(email.trim());
                        // Az email továbbítása az új IPC handlernek
                        await window.api.setActivationEmail(email.trim());
                        localStorage.setItem('isLicenced', 'true');
                        localStorage.setItem('licence', normalisedLicence);
                        window.location.reload(); // or navigate to the main app
                    } else {
                        setError(act?.error || 'Nem sikerült aktiválni a licencet.');
                    }
                }
            } else {
                setError(res.error || "Invalid license or email.");
            }
        } catch (err) {
            setError("Network or server error.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
                width: 520,
                mx: "auto",
                mt: 24,
                display: "flex",
                flexDirection: "column",
                gap: 3,
                p: 4,
                bgcolor: theme.palette.background.paper,
                borderRadius: 2,
                boxShadow: 3
            }}
        >
            <Typography variant="h5" fontWeight={600}>
                Licenc aktiválás
            </Typography>

            <TextField
                label="Email cím"
                type="email"
                value={email}
                required
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                error={touched.email && !isEmailValid}
                helperText={
                    touched.email && !isEmailValid
                        ? "Érvényes email címet adjon meg."
                        : "Adja meg a vásárláskor használt email címet."
                }
            />

            <TextField
                label="Licenckód (16 karakter)"
                value={licence}
                required
                inputProps={{ maxLength: 19, style: { letterSpacing: 2 } }} // 16 + 3 kötőjel
                onChange={handleLicenceChange}
                onBlur={() => setTouched(t => ({ ...t, licence: true }))}
                error={touched.licence && !isLicenceValid}
                helperText={
                    touched.licence && !isLicenceValid
                        ? "A licenckód pontosan 16 alfanumerikus karakter."
                        : "Pl.: ABCD-EF12-345G-HI67"
                }
            />

            {error && (
                <Typography color="error" sx={{ mt: -2, mb: 1 }}>
                    {error}
                </Typography>
            )}

            <Button
                type="submit"
                variant="contained"
                disabled={!canSubmit}
            >
                {submitting ? "Ellenőrzés..." : "Aktiválás"}
            </Button>
        </Box>
    );
};

export default LicenceActivationView;
