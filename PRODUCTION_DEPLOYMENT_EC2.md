# Production Deployment (EC2 + Nginx) — Fix for `localhost:3001` CORS/PNA errors

This repo’s frontend is designed to call the backend via **same-origin** paths like `/api/...` in production (so the browser never talks to `localhost` and there is **no CORS/PNA problem**).

If you see the deployed site calling `http://localhost:3001/...`, it means the production bundle was built with `VITE_API_URL=http://localhost:3001` baked into it.

## 1) Ensure production build does NOT bake `VITE_API_URL`

On EC2, before building the frontend, ensure `VITE_API_URL` is **unset** (or set to empty):

```bash
unset VITE_API_URL
unset LOCAL_IP
```

If you use a `.env` file during build on EC2, ensure it does **not** include:

- `VITE_API_URL=http://localhost:3001`
- `VITE_API_URL=http://127.0.0.1:3001`

### Quick sanity check (after building)

After `npm run build` in `frontend/`, verify the built assets do not contain `localhost:3001`:

```bash
grep -R "localhost:3001" /var/www/dispatch-hub/assets || true
grep -R "127.0.0.1:3001" /var/www/dispatch-hub/assets || true
```

Adjust `/var/www/dispatch-hub` to wherever you serve the `frontend/dist` output.

## 2) Nginx reverse proxy (same-origin `/api` + `/socket.io`)

Use the example config in `deploy/nginx.dispatch-hub.conf` to:

- Serve the frontend `dist/` on port 80
- Proxy `/api/*` → `http://127.0.0.1:3001`
- Proxy `/socket.io/*` → `http://127.0.0.1:3001` (WebSocket upgrade)

This makes browser requests go to:

- `http(s)://<your-host>/api/...` (no `localhost`)
- `http(s)://<your-host>/socket.io/...` (no `localhost`)

## 3) Backend env var (recommended)

Set `FRONTEND_URL` on the backend to the public origin you serve the frontend from, e.g.:

- `FRONTEND_URL=http://13.49.66.233` (or `https://...` if you enable TLS)

This is especially important for Socket.IO CORS validation if the browser sends an `Origin` header.


