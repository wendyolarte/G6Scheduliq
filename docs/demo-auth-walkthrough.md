# Scheduliq demo script: registration and login

**Estimated time:** 4–6 minutes  
**Demo tip:** Use a test account and a valid email address you control. Do not display a real password, access token, or secret in the recording.

## 1. Start on the public home page

**On screen:** Open the Scheduliq home page.

**Say:**  
“This is the public landing page. If I already have an account, I choose **Log in**. If I am new, I can choose **Sign up** or **Get started free**.”

**Show in code:**

- [index.html](../index.html#L17), lines 17–18: the top navigation links to the login and registration pages.
- [index.html](../index.html#L25), lines 25–26: the main buttons link to registration and login.
- [js/index.js](../js/index.js#L1), lines 1–8: if a user is already signed in, the landing-page buttons change to dashboard and log-out actions.

## 2. Register a student or faculty/staff account

**On screen:** Click **Sign up**. Choose **Student** or **Faculty/Staff**, then fill in the form. Show that the ID label changes when the role changes.

**Say:**  
“The registration page collects the account details. Students can enter a student ID; faculty and staff see an employee ID label. Admin accounts cannot be created through public sign-up.”

**Show in code:**

- [pages/register.html](../pages/register.html#L22), lines 22–48: the role buttons, name/email/department/ID/password fields, submit button, and `register.js` script include.
- [js/register.js](../js/register.js#L3), lines 3–9: the selected role is tracked and the ID label changes.
- [js/register.js](../js/register.js#L12), lines 12–25: clicking **Create account** gathers the fields, checks required values, enforces an eight-character minimum and matching passwords, then sends the request.

**On screen:** Submit the form with valid test details.

**Say:**  
“The browser sends the registration request to the API. The server validates it again, rejects duplicate email addresses, hashes the password, and saves the account in MySQL. The original password is not stored.”

**Show in code:**

- [js/api.js](../js/api.js#L11), lines 11–35: `API.post` sends JSON to the backend.
- [server/server.js](../server/server.js#L21): mounts the authentication router at `/api/auth`.
- [server/routes/auth.js](../server/routes/auth.js#L12), lines 12–28: handles `/register`, validates the request, hashes the password with bcrypt, inserts the user, and returns a session token and safe user details.
- [database/schema.sql](../database/schema.sql#L5), lines 5–12: defines the users table, including `password_hash` and the account role.

## 3. Show the post-registration dashboard

**On screen:** After successful registration, point out that Scheduliq takes the new user to the dashboard.

**Say:**  
“Registration also signs the user in. The browser saves the session token and public user profile, then opens the dashboard. The dashboard content and navigation depend on the account role.”

**Show in code:**

- [js/register.js](../js/register.js#L23), lines 23–25: saves the returned session and redirects to `dashboard.html`.
- [js/api.js](../js/api.js#L4), lines 4–7: reads and saves the session token and user profile in browser storage.
- [js/layout.js](../js/layout.js#L25), lines 25–35: checks for a signed-in user and builds navigation allowed for that role.
- [pages/dashboard.html](../pages/dashboard.html#L9), lines 9–12, and [js/dashboard.js](../js/dashboard.js#L1), lines 1–15: define the dashboard page and display the user’s name and role-specific message.

## 4. Log out, then demonstrate existing-account login

**On screen:** Use **Log out** in the top bar. On the login page, choose the correct account mode, enter the test account credentials, and click **Log in**.

**Say:**  
“For an existing account, the login page asks for the account type as well as the email and password. The selected mode must match the role saved for that account.”

**Show in code:**

- [pages/login.html](../pages/login.html#L23), lines 23–44: the mode buttons, login form, create-account link, and `login.js` script include.
- [js/login.js](../js/login.js#L3), lines 3–10: tracks the chosen mode and hides the create-account link in Admin mode.
- [js/login.js](../js/login.js#L12), lines 12–25: validates the form, sends the login request, saves the returned session, and opens the requested page or dashboard.
- [server/routes/auth.js](../server/routes/auth.js#L30), lines 30–42: looks up the user, compares the entered password with the stored bcrypt hash, checks account status and mode, then returns a session token.

**Say:**  
“If the password is wrong, the account is inactive, or I chose the wrong mode, the API returns an error instead of opening the dashboard. A successful login returns a signed token that expires after eight hours.”

**Optional code detail:** [server/routes/auth.js](../server/routes/auth.js#L7), lines 7–8, creates the eight-hour token and limits the returned user profile to public account fields. [js/api.js](../js/api.js#L11), lines 11–16, attaches the token as a Bearer authorization header to later API requests.

## 5. Close the walkthrough

**Say:**  
“So the click path is: the HTML page displays the controls, the page JavaScript handles the click and validation, the API client sends the request, the authentication route verifies it, and MySQL stores the account with a password hash. After sign-in, the layout checks the session and shows the right role-based dashboard.”

### Quick code map

| What the audience sees | Main code |
| --- | --- |
| Home-page sign-up and login links | [index.html](../index.html) |
| Registration form | [pages/register.html](../pages/register.html) |
| Registration click and browser-side checks | [js/register.js](../js/register.js) |
| Login form | [pages/login.html](../pages/login.html) |
| Login click and browser-side checks | [js/login.js](../js/login.js) |
| HTTP requests and browser session storage | [js/api.js](../js/api.js) |
| Registration and login verification | [server/routes/auth.js](../server/routes/auth.js) |
| User table and password-hash column | [database/schema.sql](../database/schema.sql) |
| Session check and role-based app shell | [js/layout.js](../js/layout.js) |
| Role-specific dashboard | [pages/dashboard.html](../pages/dashboard.html), [js/dashboard.js](../js/dashboard.js) |
