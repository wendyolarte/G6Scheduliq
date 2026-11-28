document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('resetForm');

  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirmPassword');

  const message = document.getElementById('message');
  const submitBtn = document.getElementById('submitBtn');

  // Read the reset token from the URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  // Check if the token exists
  if (!token) {

    message.textContent =
      'Invalid reset link. Please request a new password-reset link.';

    message.className = 'alert error';

    form.style.display = 'none';

    return;

  }

  form.addEventListener('submit', async event => {

    event.preventDefault();

    message.className = 'alert hidden';
    message.textContent = '';

    // Check password length
    if (password.value.length < 8) {

      message.textContent =
        'Password must be at least 8 characters long.';

      message.className = 'alert error';

      return;

    }

    // Check password confirmation
    if (password.value !== confirmPassword.value) {

      message.textContent =
        'Passwords do not match.';

      message.className = 'alert error';

      return;

    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Resetting Password...';

    try {

      const result = await API.post(
        '/auth/reset-password',
        {
          token: token,
          password: password.value
        }
      );

      message.textContent = result.message;
      message.className = 'alert success';

      form.reset();

      // Redirect to login after successful reset
      setTimeout(() => {

        window.location.href = 'login.html';

      }, 2000);

    } catch (error) {

      message.textContent =
        error.message || 'Unable to reset password.';

      message.className = 'alert error';

      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';

    }

  });

});