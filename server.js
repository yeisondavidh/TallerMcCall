import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const appSecret = process.env.APP_SECRET || crypto.randomBytes(32).toString('hex');
const allowedOrigins = new Set([process.env.FRONTEND_URL, 'https://tranquil-dusk-4ce5d4.netlify.app'].filter(Boolean).map((origin) => origin.replace(/\/$/, '')));
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false } });

app.use(express.json({ limit: '30mb' }));
app.use((request, response, next) => { const origin = request.headers.origin?.replace(/\/$/, ''); if (origin && allowedOrigins.has(origin)) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS'); response.setHeader('Vary', 'Origin'); } if (request.method === 'OPTIONS') return response.sendStatus(204); next(); });
app.use((request, response, next) => { if (['/server.js', '/schema.sql', '/package.json', '/README.md', '/.env.example'].includes(request.path)) return response.sendStatus(404); next(); });
app.use(express.static(root));

const number = (value) => Number(value || 0);
const date = (value) => value ? new Date(value).toISOString() : '';
const token = (user) => { const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url'); const signature = crypto.createHmac('sha256', appSecret).update(payload).digest('base64url'); return `${payload}.${signature}`; };
function authenticated(request, response, next) { const value = request.headers.authorization || ''; const [payload, signature] = value.replace('Bearer ', '').split('.'); if (!payload || !signature) return response.status(401).json({ error: 'Autenticación requerida.' }); const expected = crypto.createHmac('sha256', appSecret).update(payload).digest('base64url'); if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return response.status(401).json({ error: 'Sesión inválida.' }); try { const user = JSON.parse(Buffer.from(payload, 'base64url').toString()); if (user.exp < Date.now()) throw new Error('expired'); request.user = user; next(); } catch { response.status(401).json({ error: 'Sesión expirada.' }); } }

async function setup() {
  const schema = await fs.readFile(path.join(root, 'schema.sql'), 'utf8');
  await pool.query(schema);
  await pool.query(`INSERT INTO users (id, username, password_hash, name, role, active) VALUES ('admin', 'admin', 'dd54d539e2e79fc1fd22e57ba3ea2df6ce6f61a483666f22fc157f6a3bb6587d', 'Administrador', 'admin', TRUE) ON CONFLICT (id) DO NOTHING`);
}

async function readState(client = pool) {
  const [users, clients, inventory, orders, parts, photos] = await Promise.all([
    client.query('SELECT id, username, password, password_hash, name, role, client_id, active FROM users ORDER BY name'),
    client.query('SELECT id, name, document, phone, email, username, password FROM clients ORDER BY name'),
    client.query('SELECT id, name, price, stock FROM inventory ORDER BY name'),
    client.query('SELECT id, client_id, mechanic_id, plate, brand, model, mileage, service_type, service_price, damage, reception_notes, mechanic_notes, status, paid, paid_at, created_at, updated_at FROM orders ORDER BY created_at'),
    client.query('SELECT order_id, inventory_id, name, price, quantity FROM order_parts ORDER BY id'),
    client.query('SELECT order_id, kind, data FROM order_photos ORDER BY id')
  ]);
  return {
    users: users.rows.map((item) => ({ id: item.id, username: item.username, ...(item.password ? { password: item.password } : {}), ...(item.password_hash ? { passwordHash: item.password_hash } : {}), name: item.name, role: item.role, ...(item.client_id ? { clientId: item.client_id } : {}), active: item.active })),
    clients: clients.rows,
    inventory: inventory.rows.map((item) => ({ ...item, price: number(item.price), stock: number(item.stock) })),
    orders: orders.rows.map((item) => ({ id: item.id, clientId: item.client_id, mechanicId: item.mechanic_id || '', plate: item.plate, brand: item.brand, model: item.model, mileage: item.mileage, serviceType: item.service_type, servicePrice: number(item.service_price), damage: item.damage, receptionNotes: item.reception_notes, mechanicNotes: item.mechanic_notes, status: item.status, paid: item.paid, paidAt: date(item.paid_at), createdAt: date(item.created_at), updatedAt: date(item.updated_at), parts: parts.rows.filter((part) => part.order_id === item.id).map((part) => ({ inventoryId: part.inventory_id, name: part.name, price: number(part.price), quantity: part.quantity })), entryPhotos: photos.rows.filter((photo) => photo.order_id === item.id && photo.kind === 'entry').map((photo) => photo.data), evidencePhotos: photos.rows.filter((photo) => photo.order_id === item.id && photo.kind === 'evidence').map((photo) => photo.data) }))
  };
}

async function writeState(state) {
  if (!state || !Array.isArray(state.users) || !Array.isArray(state.clients) || !Array.isArray(state.orders) || !Array.isArray(state.inventory)) throw new Error('Estado inválido');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM order_photos');
    await client.query('DELETE FROM order_parts');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM clients');
    await client.query('DELETE FROM inventory');
    for (const item of state.clients) await client.query('INSERT INTO clients (id, name, document, phone, email, username, password) VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id, item.name, item.document, item.phone || '', item.email || '', item.username || null, item.password || null]);
    for (const item of state.users) await client.query('INSERT INTO users (id, username, password, password_hash, name, role, client_id, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [item.id, item.username, item.password || null, item.passwordHash || null, item.name, item.role, item.clientId || null, item.active !== false]);
    for (const item of state.inventory) await client.query('INSERT INTO inventory (id, name, price, stock) VALUES ($1,$2,$3,$4)', [item.id, item.name, number(item.price), number(item.stock)]);
    for (const item of state.orders) {
      await client.query('INSERT INTO orders (id, client_id, mechanic_id, plate, brand, model, mileage, service_type, service_price, damage, reception_notes, mechanic_notes, status, paid, paid_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)', [item.id, item.clientId, item.mechanicId || null, item.plate, item.brand, item.model, item.mileage || '', item.serviceType, number(item.servicePrice), item.damage || '', item.receptionNotes || '', item.mechanicNotes || '', Number(item.status || 0), Boolean(item.paid), item.paidAt || null, item.createdAt || new Date().toISOString(), item.updatedAt || new Date().toISOString()]);
      for (const part of item.parts || []) await client.query('INSERT INTO order_parts (order_id, inventory_id, name, price, quantity) VALUES ($1,$2,$3,$4,$5)', [item.id, part.inventoryId || null, part.name, number(part.price), Number(part.quantity || 1)]);
      for (const photo of item.entryPhotos || []) await client.query('INSERT INTO order_photos (order_id, kind, data) VALUES ($1,\'entry\',$2)', [item.id, photo]);
      for (const photo of item.evidencePhotos || []) await client.query('INSERT INTO order_photos (order_id, kind, data) VALUES ($1,\'evidence\',$2)', [item.id, photo]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

app.post('/api/login', async (request, response) => { try { const username = String(request.body?.username || '').trim().toLowerCase(); const password = String(request.body?.password || ''); const result = await pool.query('SELECT id, username, password, password_hash, name, role, client_id, active FROM users WHERE username = $1 AND active = TRUE', [username]); const user = result.rows[0]; if (!user) return response.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); const hash = crypto.createHash('sha256').update(password).digest('hex'); const valid = user.password_hash ? user.password_hash === hash : user.password === password; if (!valid) return response.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); if (!user.password_hash) await pool.query('UPDATE users SET password_hash = $1, password = NULL WHERE id = $2', [hash, user.id]); response.json({ token: token(user), user: { id: user.id, username: user.username, name: user.name, role: user.role, clientId: user.client_id || '' } }); } catch (error) { console.error(error); response.status(500).json({ error: 'No se pudo iniciar sesión.' }); } });
app.get('/api/state', authenticated, async (_request, response) => { try { response.json(await readState()); } catch (error) { response.status(500).json({ error: 'No se pudo leer la base de datos.' }); } });
app.put('/api/state', authenticated, async (request, response) => { try { await writeState(request.body); response.json(await readState()); } catch (error) { console.error(error); response.status(400).json({ error: 'No se pudo guardar la información.' }); } });

setup().then(() => app.listen(port, () => console.log(`Taller McCall disponible en http://localhost:${port}`))).catch((error) => { console.error('No se pudo iniciar la base de datos.', error); process.exit(1); });
