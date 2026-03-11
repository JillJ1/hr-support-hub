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
        listDiv.innerHTML = '<div class="empty-state">Error loading tickets.</div>';
        return;
    }

    if (!tickets.length) {
        listDiv.innerHTML = '<div class="empty-state">No tickets found.</div>';
        return;
    }

    listDiv.innerHTML = '';
    tickets.forEach(ticket => {
        const div = document.createElement('div');
        div.className = 'ticket-item';
        let statusClass = 'status-open';
        if (ticket.status === 'inprogress') statusClass = 'status-inprogress';
        else if (ticket.status === 'closed') statusClass = 'status-resolved';
        else if (ticket.status === 'escalated') statusClass = 'status-escalated';

        const date = new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        div.innerHTML = `
            <div>
                <strong>${escapeHTML(ticket.issue_summary || 'No summary')}</strong>
                <div class="ticket-meta">ID: ${ticket.id.substr(0,8)} • ${date}</div>
            </div>
            <span class="status-badge ${statusClass}">${ticket.status}</span>
        `;
        div.onclick = () => {
            sessionStorage.setItem('currentTicketId', ticket.id);
            window.location.href = '/employee/chat.html';
        };
        listDiv.appendChild(div);
    });
}

async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '/';
        return;
    }

    const { data: emp } = await supabaseClient
        .from('employees')
        .select('id, full_name')
        .eq('auth_id', user.id)
        .single();

    if (!emp) {
        alert('Employee profile not found.');
        window.location.href = '/';
        return;
    }

    employeeId = emp.id;
    employeeName = emp.full_name;

    loadTickets();

    // Listen for changes
    supabaseClient
        .channel('public:tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `employee_id=eq.${employeeId}` }, payload => {
            loadTickets();
        })
        .subscribe();

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
    return String(str).replace(/[&<>\"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '\"') return '&quot;';
        return m;
    });
}

init();
window.loadTickets = loadTickets;
