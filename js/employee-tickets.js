const supabaseUrl = 'https://sbaslcgmbwfnqbwtzsil.supabase.co';
let employeeId = null;
let employeeName = '';

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

    const { data: tickets, error } = await query;

    if (error) {
        console.error('Error loading tickets:', error);
        listDiv.innerHTML = '<div class="empty-state">Error loading tickets. Please refresh.</div>';
        return;
    }

    if (!tickets.length) {
        listDiv.innerHTML = '<div class="empty-state">No tickets found. Start a new chat!</div>';
        return;
    }

    listDiv.innerHTML = '';
    tickets.forEach(ticket => {
        const ticketDiv = document.createElement('div');
        ticketDiv.className = 'ticket-item';
        ticketDiv.dataset.id = ticket.id;
        
        let statusClass = ticket.status.toLowerCase().replace(' ', '');
        const date = new Date(ticket.created_at);
        const formattedDate = date.toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        
        ticketDiv.innerHTML = `
            <div class="ticket-left">
                <div class="ticket-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <div class="ticket-info">
                    <h3>${escapeHTML(ticket.issue_summary || 'Chat session')}</h3>
                    <p>Case #${ticket.id.substr(0,8)} • ${formattedDate}</p>
                </div>
            </div>
            <span class="badge ${statusClass}">${ticket.status}</span>
        `;
        
        ticketDiv.addEventListener('click', () => {
            sessionStorage.setItem('currentTicketId', ticket.id);
            window.location.href = '/employee/chat.html';
        });
        
        listDiv.appendChild(ticketDiv);
    });
}

async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '/';
        return;
    }

    employeeName = user.user_metadata?.full_name || user.email || 'Employee';

    const { data: employee, error } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('auth_id', user.id)
        .single();

    if (error || !employee) {
        alert('Employee record not found. Please contact HR.');
        window.location.href = '/';
        return;
    }

    employeeId = employee.id;
    await loadTickets();

    document.getElementById('new-chat-btn').addEventListener('click', async () => {
        const summary = prompt("Please briefly describe your issue:", "New chat");
        if (summary === null) return;
        
        const category = typeof classifyIssue === 'function' ? classifyIssue(summary) : 'general'; 
        
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

        if (createError) {
            console.error('Error creating ticket:', createError);
            alert('Could not create new chat: ' + createError.message);
            return;
        }
        
        sessionStorage.setItem('currentTicketId', newTicket.id);
        window.location.href = '/employee/chat.html';
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '/';
    });
}

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

init();
window.loadTickets = loadTickets;