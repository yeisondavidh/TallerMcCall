# Taller McCall

## Publicar en Netlify

El repositorio ya incluye `netlify.toml` y queda listo para desplegar como sitio estático:

1. Sube el contenido del proyecto a GitHub.
2. En Netlify selecciona `Add new site > Import an existing project > GitHub`.
3. Selecciona el repositorio.
4. Deja `Build command` vacío y usa `Publish directory: .`.
5. Pulsa `Deploy site`.

Con `config.js` vacío, la web funciona como demo estática y guarda los datos en el navegador. Para datos compartidos, cambia únicamente esta línea después de desplegar el backend:

```js
window.__API_URL__ = 'https://tu-api.onrender.com';
```

No pongas aquí `DATABASE_URL` ni `APP_SECRET`; son secretos del servidor.

## Datos compartidos

La aplicación usa PostgreSQL mediante `server.js`. `localStorage` queda únicamente como respaldo local y para migración inicial.

### 1. Crear la base gratuita

Puedes usar Supabase:

1. Crea un proyecto en https://supabase.com.
2. Abre `Project Settings > Database`.
3. Copia la connection string de PostgreSQL.
4. Ejecuta el contenido de `schema.sql` en el SQL Editor.

### 2. Configurar y ejecutar

Copia `.env.example` como `.env` y completa `DATABASE_URL`.

```powershell
npm install
npm start
```

Abre `http://localhost:3000`. No abras `index.html` directamente: la API se sirve desde Node.

### 3. Migración automática

Al iniciar la app desde el servidor:

- Si PostgreSQL está vacío y el navegador tiene datos locales, esos datos se envían una sola vez a la base.
- Si PostgreSQL ya tiene datos, esos datos remotos tienen prioridad.
- Cada alta, edición, surtido, orden, pago o eliminación se sincroniza con PostgreSQL.

Antes de publicar, haz una copia de seguridad de la base y configura `DATABASE_URL` como variable privada del hosting.

## Publicación gratuita

Puedes desplegar `server.js` en Render, Railway u otro servicio que soporte Node y PostgreSQL. Configura:

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `DATABASE_URL`
- Environment variable: `APP_SECRET`
- Environment variable: `FRONTEND_URL` con la URL de Netlify

La API ya exige login de servidor y token firmado. Usa HTTPS en el hosting y no expongas la connection string ni `APP_SECRET` en el frontend.
