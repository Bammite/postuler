const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const profilePath = path.join(__dirname, '../../profile.json');

class JobService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.modelCandidates = [
      process.env.GEMINI_MODEL,
      "gemma-4-26b-a4b-it"
    ].filter(Boolean);
  }

  async readProfile() {
    try {
      const data = await fs.readFile(profilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return { description: '', cvPath: '' };
      throw error;
    }
  }

  async writeProfile(description, cvPath) {
    await fs.writeFile(profilePath, JSON.stringify({ description, cvPath }, null, 2), 'utf8');
  }

  async resetProfile() {
    const profile = await this.readProfile();
    if (profile.cvPath) {
      await fs.unlink(profile.cvPath).catch(() => {});
    }
    await fs.writeFile(profilePath, JSON.stringify({ description: '', cvPath: '' }, null, 2), 'utf8');
  }

  async generateDraft(jobDescription, userProfile) {
    let profileToUse = userProfile;
    
    // Si le profil fourni est vide, on récupère le profil enregistré
    if (!profileToUse || profileToUse.trim() === '') {
      const saved = await this.readProfile();
      profileToUse = saved.description;
      if (!profileToUse) throw new Error("Aucun profil disponible (enregistré ou fourni).");
    }

    const prompt = `Voici une offre d'emploi : "${jobDescription}". 
    Voici mon profil : "${profileToUse}". 
    Analyse l'offre pour extraire l'adresse email de contact et l'objet du mail demandé. 
    Rédige ensuite une lettre de motivation courte et professionnelle en français. 
    Réponds uniquement au format JSON : {"email": "...", "subject": "...", "body": "..."}`;

    let lastError;
    for (const modelName of this.modelCandidates) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();

        try {
          return JSON.parse(text);
        } catch {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("La réponse IA n'est pas un JSON valide.");
          return JSON.parse(jsonMatch[0]);
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Impossible de générer la candidature avec les modèles configurés (${this.modelCandidates.join(", ")}). Détail: ${lastError?.message || "erreur inconnue"}`
    );
  }

  async sendEmail(email, subject, body, attachCv) {
    const attachments = [];
    if (attachCv) {
      const profile = await this.readProfile();
      if (profile.cvPath) {
        try {
          await fs.access(profile.cvPath);
          attachments.push({ filename: path.basename(profile.cvPath), path: profile.cvPath });
        } catch (err) { console.warn("CV non trouvé pour l'envoi."); }
      }
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    return await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: body,
      attachments
    });
  }
}

module.exports = new JobService();
