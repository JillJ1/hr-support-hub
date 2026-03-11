// employee-tickets.js

// ==================== GLOBAL CONFIGURATION & STATE ====================
const APP_CONFIG = {
    supabaseUrl: 'https://sbaslcgmbwfnqbwtzsil.supabase.co',
    vercelUrl: 'https://hr-support-hub.vercel.app'
};

let employeeId = null;
let employeeName = '';

// ==================== UTILITY FUNCTIONS ====================
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
}

function setButtonLoading(button, isLoading, loadingText = 'Processing...') {
    if (isLoading) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = loadingText;
        button.style.opacity = '0.7';
        button.style.cursor = 'wait';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
    }
}

// ==================== TICKET LOADING ====================
async function loadTickets() {
    const listDiv = document.getElementById('ticket-list');
    const timeFilter = document.getElementById('time-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    listDiv.innerHTML = '<div class="empty-state">Loading your tickets...</div>';

    let query = supabaseClient
        .from('tickets')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });

    const now = new Date();
    if (timeFilter !== 'all') {
        let startDate;
        if (timeFilter === 'today') {
            startDate = new Date(now.setHours(0,0,0,0));
        } else if (timeFilter === 'week') {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            startDate = new Date(firstDay.setHours(0,0,0,0));
        } else if (timeFilter === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (timeFilter === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }
        query = query.gte('created_at', startDate.toISOString());
    }

    if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
    }

    try {
        const { data: tickets, error } = await query;

        if (error) throw error;

        if (!tickets.length) {
            listDiv.innerHTML = '<div class="empty-state">No tickets found for the selected filters.</div>';
            return;
        }

        listDiv.innerHTML = '';
        tickets.forEach(ticket => {
            const div = document.createElement('div');
            div.className = 'ticket-item';
            
            let statusText = 'Open';
            let statusColor = '#0a5b8c'; // Blue
            let statusBg = '#e0f0ff';
            
            if (ticket.status === 'inprogress') { 
                statusText = 'In Progress'; 
                statusColor = '#d97706'; // Orange
                statusBg = '#fef3c7';
            } else if (ticket.status === 'closed') { 
                statusText = 'Resolved'; 
                statusColor = '#059669'; // Green
                statusBg = '#d1fae5';
            } else if (ticket.status === 'escalated') { 
                statusText = 'Escalated'; 
                statusColor = '#dc2626'; // Red
                statusBg = '#fee2e2';
            }

            const date = new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            div.innerHTML = `
                <div>
                    <strong style="font-size: 1.05rem; color: #1c1c1e;">${escapeHTML(ticket.issue_summary || 'No summary provided')}</strong>
                    <div class="ticket-meta" style="color: #6c6c70; font-size: 0.85rem; margin-top: 4px;">Ticket ID: ${ticket.id.substr(0,8)} • Created: ${date}</div>
                </div>
                <div>
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; color: ${statusColor}; background-color: ${statusBg};">${statusText}</span>
                </div>
            `;
            
            div.addEventListener('click', () => {
                sessionStorage.setItem('currentTicketId', ticket.id);
                window.location.href = '/employee/chat.html';
            });
            
            listDiv.appendChild(div);
        });
    } catch (err) {
        console.error('Error loading tickets:', err);
        listDiv.innerHTML = '<div class="empty-state" style="color: var(--danger-red);">Failed to load tickets. Please try again later.</div>';
    }
}

// ==================== INITIALIZATION ====================
async function init() {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
        window.location.href = '/';
        return;
    }

    const { data: emp, error: empError } = await supabaseClient
        .from('employees')
        .select('id, full_name')
        .eq('auth_id', user.id)
        .single();

    if (empError || !emp) {
        alert('Access denied. Employee profile not found.');
        window.location.href = '/';
        return;
    }

    employeeId = emp.id;
    employeeName = emp.full_name;

    document.getElementById('emp-name-display').textContent = employeeName;

    loadTickets();

    // Set up real-time updates for tickets list
    supabaseClient
        .channel('employee-tickets-changes')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'tickets', 
            filter: `employee_id=eq.${employeeId}` 
        }, () => {
            loadTickets();
        })
        .subscribe();

    // Create New Chat (With Loading State)
    document.getElementById('new-chat-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        
        const summary = prompt("Please briefly describe your issue:", "New chat");
        if (!summary) return;
        
        setButtonLoading(btn, true, 'Creating...');
        
        const category = typeof classifyIssue === 'function' ? classifyIssue(summary) : 'general'; 
        
        try {
            const { data: newTicket, error: createError } = await supabaseClient
                .from('tickets')
                .insert({ 
                    employee_id: employeeId, 
                    status: 'open', 
                    bot_active: true, 
                    issue_summary: summary,
                    category: category
                })
                .select()
                .single();

            if (createError) throw createError;
            
            sessionStorage.setItem('currentTicketId', newTicket.id);
            window.location.href = '/employee/chat.html';
        } catch (err) {
            console.error('Error creating ticket:', err);
            alert('Could not create new chat: ' + err.message);
            setButtonLoading(btn, false);
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '/';
    });
}

window.loadTickets = loadTickets;
init();
