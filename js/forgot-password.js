document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('forgotForm');
  const email = document.getElementById('email');
  const message = document.getElementById('message');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async event => {

    event.preventDefault();

    message.className = 'alert hidden';
    message.textContent = '';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {

      const result = await API.post(
        '/auth/forgot-password',
        {
          email: email.value.trim()
        }
      );

      message.textContent = result.message;
      message.className = 'alert success';

      form.reset();

    } catch (error) {

      message.textContent =
        error.message || 'Unable to send reset request.';

      message.className = 'alert error';

    } finally {

      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Reset Link';

    }

  });

});