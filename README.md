# G6Scheduliq

## Deploying the API on Railway

GitHub Pages can keep hosting the frontend, but the Express API and MySQL database must run on Railway (or another server host). Railway's [MySQL service](https://docs.railway.com/databases/mysql) provides the database variables referenced below.

1. In Railway, create a project and add a MySQL service.
2. Add this GitHub repository as a Node.js service, using the repository root. The `npm start` script starts the API; Railway provides `PORT`.
3. In the Node.js service's Variables, add these values. Replace `MySQL` in each reference with the exact name of your Railway database service:

   ```text
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   JWT_SECRET=<a unique, long random secret>
   ADMIN_NAME=<your admin name>
   ADMIN_EMAIL=<your admin email>
   ADMIN_PASSWORD=<a unique admin password>
   ```

   Set secret values in Railway, not in this repository. On first startup, the app creates the tables and the admin account if it does not already exist.
4. Generate a public domain for the Node.js service. After deployment, open `https://<your-domain>/health`; it should return `{"status":"ok"}`.
5. In `js/api.js`, set `PRODUCTION_API_BASE` to `https://<your-domain>/api` (no trailing slash), then publish that frontend change to GitHub Pages. Keep it empty for same-origin deployments; local development on VS Code Live Server continues to use `http://localhost:3000/api`.

The API enables CORS for the GitHub Pages frontend. Do not use `localhost` as the production API URL: it refers to the visitor's own computer, not the Railway service.
