// login.js – updated with redirect after login

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error-message');

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        errorEl.textContent = error.message;
        return;
    }

    // Check HR first, then employee
    const { data: hr } = await supabaseClient
        .from('hr_staff')
        .select('id')
        .eq('auth_id', data.user.id)
        .maybeSingle();

    if (hr) {
        // HR redirect: if there's a redirect param, use it, else go to dashboard
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        window.location.href = redirect ? decodeURIComponent(redirect) : '/hr/dashboard.html';
        return;
    }

    const { data: employee } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('auth_id', data.user.id)
        .maybeSingle();

    if (employee) {
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        window.location.href = redirect ? decodeURIComponent(redirect) : '/employee/tickets.html';
        return;
    }

    // If user exists in auth but not in either table, show helpful message
    errorEl.textContent = 'User not found in employees or HR. If you are HR, please contact an administrator to add you to hr_staff.';
});

// ✅ Forgot password function – attach this to a "Forgot password?" link in your HTML
async function forgotPassword() {
    const email = prompt('Enter your email address to reset your password:');
    if (!email) return;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html',
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Password reset email sent. Check your inbox.');
    }
}
