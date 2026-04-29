const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const jobService = require('./services/jobService');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const uploadDir = path.join(__dirname, '../uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, 'cv.pdf')
});
const upload = multer({ storage: storage });

app.post('/save-profile', upload.single('cv'), async (req, res) => {
  try {
    const cvPath = req.file ? req.file.path : (await jobService.readProfile()).cvPath;
    await jobService.writeProfile(req.body.description, cvPath);
    res.json({ success: true, message: "Profil mis à jour !" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement du profil." });
  }
});

app.post('/generate-draft', async (req, res) => {
  try {
    const draft = await jobService.generateDraft(req.body.jobDescription, req.body.userProfile);
    res.json({ success: true, draft });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/send-email', async (req, res) => {
  try {
    const { email, subject, body, attachCv } = req.body;
    await jobService.sendEmail(email, subject, body, attachCv);
    res.json({ success: true, message: "Candidature envoyée avec succès !" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur lors de l'envoi du mail." });
  }
});

app.get('/get-profile', async (req, res) => {
  try {
    const profile = await jobService.readProfile();
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur lors de la récupération du profil." });
  }
});

app.post('/reset-profile', async (req, res) => {
  try {
    await jobService.resetProfile();
    res.json({ success: true, message: "Profil réinitialisé avec succès !" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur lors de la réinitialisation." });
  }
});

module.exports = app;
