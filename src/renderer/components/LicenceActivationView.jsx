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
            // IPC hívás a backendhez
            const res = await window.api.checkLicence(payload);
            if (res.success) {
                // Sikeres licenc: állítsd be a licenc állapotot (pl. localStorage vagy IPC)
                localStorage.setItem('isLicenced', 'true');
                localStorage.setItem('licence', normalisedLicence);
                window.location.reload(); // vagy: tovább engeded a fő appba
            } else {
                setError(res.error || "Hibás licenc vagy email.");
            }
        } catch (err) {
            setError("Hálózati vagy szerver hiba.");
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
