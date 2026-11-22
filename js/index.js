/* Landing page: swap the buttons if the visitor is already signed in */
document.addEventListener('DOMContentLoaded', () => {
  const user = API.user();
  if (API.token() && user) {
    const login = $('#navLogin'), signup = $('#navSignup');
    login.textContent = 'Open dashboard'; login.href = 'pages/dashboard.html'; login.className = 'btn sm';
    signup.textContent = 'Log out'; signup.href = '#'; signup.className = 'btn secondary sm';
    signup.onclick = e => { e.preventDefault(); API.logout(); };
    $('#heroCta').textContent = 'Go to my dashboard'; $('#heroCta').href = 'pages/dashboard.html';
  }
});