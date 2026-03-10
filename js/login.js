// login.js
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

    const { data: employee } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('auth_id', data.user.id)
        .single();

    const { data: hr } = await supabaseClient
        .from('hr_staff')
        .select('id')
        .eq('auth_id', data.user.id)
        .single();

    if (employee) {
        window.location.href = '/employee/tickets.html'; // 👈 changed
    } else if (hr) {
        window.location.href = '/hr/dashboard.html';
    } else {
        errorEl.textContent = 'User not found in employees or HR. Contact admin.';
    }
});