# G6Scheduliq

## Deployment

GitHub Pages can host the frontend files, but it cannot run the Express API or connect to MySQL. To enable login on a hosted site:

1. Deploy the Node.js app in `server/` to a host that supports persistent Node.js services, and provision a MySQL database reachable by that service.
2. Configure the backend environment variables from `.env.example` on the backend host. Use production database credentials and a unique, long `JWT_SECRET`.
3. Set `PRODUCTION_API_BASE` near the top of `js/api.js` to the backend API URL, including `/api` (for example, `https://your-api-host.example/api`).

Leave `PRODUCTION_API_BASE` empty for same-origin deployments. Local development on the supported VS Code Live Server ports continues to use `http://localhost:3000/api`.
