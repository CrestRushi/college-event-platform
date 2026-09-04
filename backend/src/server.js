import './config.js';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { getPool, databaseStatus } from './db.js';
import { getDocument, uploadDocument } from './storage.js';

const app = express();
const allowedDocumentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (allowedDocumentTypes.has(file.mimetype)) return callback(null, true);
    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
});
const port = Number(process.env.PORT || 5000);
const serverName = process.env.SERVER_NAME || 'Local Server';

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());

app.get('/api/events', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT id, name, description FROM events ORDER BY id');
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/registrations', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query(`SELECT r.registration_id, r.full_name, r.email, r.phone,
      r.college_name, r.document_s3_key, r.document_url, r.created_at, e.name AS event_name
      FROM registrations r JOIN events e ON e.id = r.event_id ORDER BY r.created_at DESC`);
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/registrations/search', async (req, res, next) => {
  const registrationId = String(req.query.registrationId || '').trim();
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!registrationId && !email) {
    return res.status(400).json({ success: false, message: 'Enter a registration ID or email address.' });
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }
  try {
    const { rows } = await getPool().query(`SELECT r.registration_id, r.full_name, r.email, r.phone,
      r.college_name, r.document_s3_key, r.document_url, r.created_at, e.name AS event_name
      FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE ($1 = '' OR UPPER(r.registration_id) = UPPER($1))
        AND ($2 = '' OR LOWER(r.email) = $2)
      ORDER BY r.created_at DESC`, [registrationId, email]);
    res.json({ success: true, registrations: rows });
  } catch (error) { next(error); }
});

app.get('/api/registrations/:registrationId/document', async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      'SELECT document_s3_key FROM registrations WHERE registration_id = $1',
      [String(req.params.registrationId).trim()]
    );
    if (!rows[0]?.document_s3_key) {
      return res.status(404).json({ success: false, message: 'No document was uploaded for this registration.' });
    }
    const document = await getDocument(rows[0].document_s3_key);
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', 'inline');
    document.body.pipe(res);
  } catch (error) { next(error); }
});

app.post('/api/registrations', upload.single('document'), async (req, res, next) => {
  const { fullName, email, phone, collegeName, eventId } = req.body;
  if (![fullName, email, phone, collegeName, eventId].every(Boolean) || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide all required fields and a valid email.' });
  }
  const eventIdNumber = Number(eventId);
  if (!Number.isInteger(eventIdNumber)) return res.status(400).json({ success: false, message: 'Select a valid event.' });

  const client = await getPool().connect();
  try {
    const event = await client.query('SELECT id FROM events WHERE id = $1', [eventIdNumber]);
    if (!event.rowCount) return res.status(400).json({ success: false, message: 'Selected event does not exist.' });
    const registrationId = `REG-${Date.now().toString().slice(-8)}`;
    const document = req.file ? await uploadDocument(req.file, registrationId) : { key: null, url: null };
    await client.query(`INSERT INTO registrations
      (registration_id, full_name, email, phone, college_name, event_id, document_s3_key, document_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [registrationId, fullName.trim(), email.trim(), phone.trim(), collegeName.trim(), eventIdNumber, document.key, document.url]);
    res.status(201).json({ success: true, registrationId, message: 'Registration successful', handledBy: serverName });
  } catch (error) { next(error); } finally { client.release(); }
});

app.get('/api/health', async (_req, res) => {
  const database = await databaseStatus();
  // Keep this at 200: ALB checks service reachability, while DB status remains visible for the demo.
  res.json({ status: 'healthy', server: serverName, database });
});
app.get('/api/server-info', async (_req, res) => res.json({
  serverName, hostname: os.hostname(), timestamp: new Date().toISOString(),
  database: await databaseStatus(), s3: process.env.AWS_S3_BUCKET_NAME ? 'configured' : 'not configured'
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  const uploadError = error instanceof multer.MulterError;
  const status = uploadError ? 400 : error.statusCode || 500;
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'File must be 10 MB or smaller.'
    : error.code === 'LIMIT_UNEXPECTED_FILE'
      ? 'Upload a PDF, Word document, JPG, or PNG file.'
      : error.statusCode ? error.message : 'Unable to complete the request.';
  res.status(status).json({ success: false, message });
});
app.listen(port, () => console.log(`College Event API running on port ${port} (${serverName})`));
