require('dotenv').config();
const express = require('express');
const cors = require('cors');
const resumeRoutes = require('./routes/resume');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/resume', resumeRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));