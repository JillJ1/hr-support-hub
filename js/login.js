// login.js – updated with HR-first check and forgot password function

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

    // 👉 Check HR first, then employee (avoids HR users with accidental employee records)
    const { data: hr } = await supabaseClient
        .from('hr_staff')
        .select('id')
        .eq('auth_id', data.user.id)
        .maybeSingle();

    if (hr) {
        window.location.href = '/hr/dashboard.html';
        return;
    }

    const { data: employee } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('auth_id', data.user.id)
        .maybeSingle();

    if (employee) {
        window.location.href = '/employee/tickets.html';
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
        redirectTo: window.location.origin + '/reset-password.html', // you'll need to create this page later
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Password reset email sent. Check your inbox.');
    }
}
