// hr-dashboard.js
let currentFilter = 'open';
let currentHrId = null;
let currentHrName = '';

const supabaseUrl = 'https://sbaslcgmbwfnqbwtzsil.supabase.co';
const vercelUrl = 'https://hr-support-hub.vercel.app';

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = type === 'error' ? '#b71c1c' : type === 'success' ? '#1e7b4c' : '#1c1c1e';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Helper to escape HTML
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

// Format date for display
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Update notification badge
async function updateNotificationCount() {
    const { count, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'escalated']);
    if (!error) {
        const badge = document.getElementById('notif-badge');
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Load KPI counts
async function loadKPIs() {
    try {
        const { count: empCount } = await supabaseClient
            .from('employees')
            .select('*', { count: 'exact', head: true });
        document.getElementById('kpi-employees').textContent = empCount?.toLocaleString() || '0';

        const { count: openCases } = await supabaseClient
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'open');
        document.getElementById('kpi-open-cases').textContent = openCases || '0';

        const { count: pendingTasks } = await supabaseClient
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        document.getElementById('kpi-pending-tasks').textContent = pendingTasks || '0';

        const { count: docsCount } = await supabaseClient
            .from('meeting_docs')
            .select('*', { count: 'exact', head: true });
        document.getElementById('kpi-meeting-count').textContent = docsCount || '0';
    } catch (err) {
        console.error('Error loading KPIs:', err);
    }
}

// Load recent cases for dashboard
async function loadRecentCases() {
    const tbody = document.querySelector('#dashboard-cases-table tbody');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    const filter = document.getElementById('recent-case-filter').value;
    let query = supabaseClient
        .from('tickets')
        .select(`
            *,
            employees (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

    const now = new Date();
    if (filter !== 'all') {
        let startDate;
        if (filter === 'day') {
            startDate = new Date(now.setHours(0,0,0,0));
        } else if (filter === 'week') {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            startDate = new Date(firstDay.setHours(0,0,0,0));
        } else if (filter === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        query = query.gte('created_at', startDate.toISOString());
    }

    const { data: tickets, error } = await query;

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4">Error loading cases</td></tr>';
        return;
    }

    if (!tickets.length) {
        tbody.innerHTML = '<tr><td colspan="4">No cases in this period</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    tickets.forEach(ticket => {
        const tr = document.createElement('tr');
        tr.addEventListener('click', () => {
            sessionStorage.setItem('currentTicketId', ticket.id);
            window.location.href = '/hr/ticket.html';
        });
        let statusClass = 'status-open';
        let statusText = 'Open';
        if (ticket.status === 'inprogress') {
            statusClass = 'status-inprogress';
            statusText = 'In Progress';
        } else if (ticket.status === 'closed') {
            statusClass = 'status-resolved';
            statusText = 'Resolved';
        } else if (ticket.status === 'escalated') {
            statusClass = 'status-escalated';
            statusText = 'Escalated';
        }
        tr.innerHTML = `
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${escapeHTML(ticket.employees?.full_name || 'Unknown')}</td>
            <td>${escapeHTML(ticket.issue_summary || 'No summary')}</td>
            <td>${formatDate(ticket.created_at)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Load tasks for dashboard
async function loadTasks() {
    const list = document.getElementById('dashboard-task-list');
    list.innerHTML = '';

    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error(error);
        list.innerHTML = '<li class="task-item">Error loading tasks</li>';
        return;
    }

    if (!tasks.length) {
        list.innerHTML = '<li class="task-item">No pending tasks</li>';
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <div class="task-details"><h4>${escapeHTML(task.title)}</h4><p>${escapeHTML(task.description || '')}</p></div>
            <button class="btn btn-outline" onclick="completeTask('${task.id}', this)">Complete</button>
        `;
        list.appendChild(li);
    });
}

// Load employee directory
async function loadEmployeeDirectory() {
    const tbody = document.querySelector('#emp-table tbody');
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

    const { data: employees, error } = await supabaseClient
        .from('employees')
        .select('*')
        .order('full_name');

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6">Error loading employees</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    employees.forEach(emp => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.setAttribute('data-emp-id', emp.id);
        tr.setAttribute('data-emp-name', emp.full_name);
        tr.setAttribute('data-emp-email', emp.email);
        tr.setAttribute('data-emp-position', emp.position || '');
        tr.onclick = () => viewEmployeeProfile(emp.id, emp.full_name, emp.email, emp.position);
        tr.innerHTML = `
            <td>${emp.id.substr(0,8)}</td>
            <td>${escapeHTML(emp.full_name)}</td>
            <td>${escapeHTML(emp.email || '')}</td>
            <td>${escapeHTML(emp.position || '')}</td>
            <td>${escapeHTML(emp.department || '')}</td>
            <td>${emp.start_date ? formatDate(emp.start_date) : ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Load cases table (full list)
async function loadCasesTable() {
    const tbody = document.querySelector('#cases-table tbody');
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

    const { data: tickets, error } = await supabaseClient
        .from('tickets')
        .select(`
            *,
            employees (full_name),
            assigned_to_hr:hr_staff!tickets_assigned_to_fkey (display_name)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7">Error loading cases</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    for (const ticket of tickets) {
        const tr = document.createElement('tr');
        let statusClass = 'status-open';
        let statusText = 'Open';
        if (ticket.status === 'inprogress') {
            statusClass = 'status-inprogress';
            statusText = 'In Progress';
        } else if (ticket.status === 'closed') {
            statusClass = 'status-resolved';
            statusText = 'Resolved';
        } else if (ticket.status === 'escalated') {
            statusClass = 'status-escalated';
            statusText = 'Escalated';
        }

        const assignBtn = ticket.assigned_to
            ? `<button class="btn btn-unassign" data-ticket-id="${ticket.id}" onclick="unassignTicket(this)">Unassign (${ticket.assigned_to_hr?.display_name || 'Me'})</button>`
            : `<button class="btn btn-assign" data-ticket-id="${ticket.id}" onclick="assignTicket(this)">Assign to Me</button>`;

        const { data: hrStaff } = await supabaseClient
            .from('hr_staff')
            .select('id, display_name');
        let reassignOptions = '<option value="">+ Reassign to</option>';
        hrStaff?.forEach(h => {
            const selected = ticket.assigned_to === h.id ? 'selected' : '';
            reassignOptions += `<option value="${h.id}" ${selected}>${escapeHTML(h.display_name)}</option>`;
        });

        tr.innerHTML = `
            <td>${ticket.id.substr(0,8)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${escapeHTML(ticket.employees?.full_name || 'Unknown')}</td>
            <td>${escapeHTML(ticket.category || 'Uncategorized')}</td>
            <td>${formatDate(ticket.created_at)}</td>
            <td>${assignBtn}</td>
            <td>
                <select class="reassign-select" data-ticket-id="${ticket.id}" onchange="updateReassign(this)">
                    ${reassignOptions}
                </select>
            </td>
        `;

        tr.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
            sessionStorage.setItem('currentTicketId', ticket.id);
            window.location.href = '/hr/ticket.html';
        });

        tbody.appendChild(tr);
    }
}

// Load full tasks list
async function loadFullTasks() {
    const list = document.getElementById('main-task-list');
    list.innerHTML = '';

    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        list.innerHTML = '<li class="task-item">Error loading tasks</li>';
        return;
    }

    if (!tasks.length) {
        list.innerHTML = '<li class="task-item">No tasks</li>';
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        if (task.status === 'completed') li.classList.add('completed');
        li.innerHTML = `
            <div class="task-details"><h4>${escapeHTML(task.title)}</h4><p>${escapeHTML(task.description || '')}</p></div>
            <div style="display:flex; gap: 8px;">
                <button class="btn btn-outline btn-complete" onclick="completeTask('${task.id}', this)">${task.status === 'completed' ? 'Completed' : 'Complete'}</button>
                <button class="btn btn-outline" style="color: var(--danger-red); border-color: #fca5a5;" onclick="deleteTask('${task.id}', this)">Delete</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// Assign ticket to current HR
async function assignTicket(button) {
    const ticketId = button.dataset.ticketId;
    if (!ticketId) return;

    const { error } = await supabaseClient
        .from('tickets')
        .update({ assigned_to: currentHrId, status: 'inprogress' })
        .eq('id', ticketId);

    if (error) {
        console.error('Error assigning ticket:', error);
        showToast('Error assigning ticket: ' + error.message, 'error');
    } else {
        showToast('Ticket assigned to you', 'success');
        loadCasesTable();
        loadRecentCases();
        updateNotificationCount();
    }
}

async function unassignTicket(button) {
    const ticketId = button.dataset.ticketId;
    if (!ticketId) return;

    const { error } = await supabaseClient
        .from('tickets')
        .update({ assigned_to: null, status: 'open' })
        .eq('id', ticketId);

    if (error) {
        showToast('Error unassigning ticket: ' + error.message, 'error');
    } else {
        showToast('Ticket unassigned', 'success');
        loadCasesTable();
        loadRecentCases();
        updateNotificationCount();
    }
}

async function updateReassign(select) {
    const ticketId = select.dataset.ticketId;
    const hrId = select.value || null;
    const { error } = await supabaseClient
        .from('tickets')
        .update({ assigned_to: hrId })
        .eq('id', ticketId);
    if (error) {
        showToast('Error reassigning: ' + error.message, 'error');
    } else {
        showToast('Ticket reassigned', 'success');
        loadCasesTable();
    }
}

async function completeTask(taskId, button) {
    const { error } = await supabaseClient
        .from('tasks')
        .update({ status: 'completed' })
        .eq('id', taskId);
    if (error) {
        showToast('Error completing task: ' + error.message, 'error');
    } else {
        const li = button.closest('.task-item');
        li.classList.add('completed');
        button.textContent = 'Completed';
        showToast('Task completed', 'success');
        updateNotificationCount();
    }
}

async function deleteTask(taskId, button) {
    if (!confirm('Delete this task?')) return;
    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', taskId);
    if (error) {
        showToast('Error deleting task: ' + error.message, 'error');
    } else {
        button.closest('.task-item').remove();
        showToast('Task deleted', 'success');
    }
}

function viewEmployeeProfile(id, name, email, position) {
    document.getElementById('modal-emp-name').textContent = name;
    document.getElementById('modal-emp-id').textContent = id;

    const tbody = document.getElementById('modal-emp-tickets');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    supabaseClient
        .from('tickets')
        .select('*')
        .eq('employee_id', id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
            if (error) {
                tbody.innerHTML = '<tr><td colspan="4">Error loading tickets</td></tr>';
                return;
            }
            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="4">No tickets found</td></tr>';
                return;
            }
            tbody.innerHTML = '';
            data.forEach(t => {
                const tr = document.createElement('tr');
                let statusClass = 'status-open';
                if (t.status === 'inprogress') statusClass = 'status-inprogress';
                else if (t.status === 'closed') statusClass = 'status-resolved';
                else if (t.status === 'escalated') statusClass = 'status-escalated';
                tr.innerHTML = `
                    <td>${t.id.substr(0,8)}</td>
                    <td><span class="status-badge ${statusClass}">${t.status}</span></td>
                    <td>${escapeHTML(t.issue_summary || '')}</td>
                    <td>${formatDate(t.created_at)}</td>
                `;
                tbody.appendChild(tr);
            });
        });

    document.getElementById('emp-profile-modal').classList.add('active');
}

// Navigation function
function navigate(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`a[onclick="navigate('${viewId}')"]`);
    if (activeLink) activeLink.classList.add('active');

    if (viewId === 'view-dashboard') {
        loadKPIs();
        loadRecentCases();
        loadTasks();
        loadDashboardCharts();   // <-- restored
        updateNotificationCount();
    } else if (viewId === 'view-employees') {
        loadEmployeeDirectory();
        updateNotificationCount();
    } else if (viewId === 'view-cases') {
        loadCasesTable();
        updateNotificationCount();
    } else if (viewId === 'view-tasks') {
        loadFullTasks();
        updateNotificationCount();
    } else if (viewId === 'view-analytics') {
        loadAnalytics();
    }
}

// Populate employee list for datalist
async function populateEmployeeList() {
    const { data: employees } = await supabaseClient
        .from('employees')
        .select('id, full_name')
        .order('full_name');
    const datalist = document.getElementById('employee-list');
    datalist.innerHTML = '';
    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.full_name;
        option.dataset.id = emp.id;
        datalist.appendChild(option);
    });
}

// Create new ticket from modal (with HR notification)
async function submitNewTicket(e) {
    e.preventDefault();
    const empName = document.getElementById('new-ticket-emp').value;
    const summary = document.getElementById('new-ticket-summary').value;
    const status = document.getElementById('new-ticket-status').value;

    const options = document.querySelectorAll('#employee-list option');
    let empId = null;
    for (let opt of options) {
        if (opt.value === empName) {
            empId = opt.dataset.id;
            break;
        }
    }
    if (!empId) {
        alert('Please select a valid employee from the list.');
        return;
    }

    const ticketStatus = status === 'Open' ? 'open' : 'inprogress';
    const assignedTo = status === 'In Progress' ? currentHrId : null;
    const category = typeof classifyIssue === 'function' ? classifyIssue(summary) : 'general';

    const { data: newTicket, error } = await supabaseClient
        .from('tickets')
        .insert({
            employee_id: empId,
            issue_summary: summary,
            category: category,
            status: ticketStatus,
            assigned_to: assignedTo
        })
        .select()
        .single();

    if (error) {
        alert('Error creating ticket: ' + error.message);
    } else {
        closeModal('create-ticket-modal');
        showToast('Ticket created', 'success');
        updateNotificationCount();

        // Notify HR
        const hrEmail = 'jcjj.1104@gmail.com'; // Replace with actual HR email
        const ticketLink = `${vercelUrl}/hr/ticket.html?id=${newTicket.id}`;
        const emailPayload = {
            to: hrEmail,
            subject: `New ticket created on behalf of ${empName}`,
            html: `<p>A new ticket has been created by HR:</p>
                   <p><strong>Employee:</strong> ${empName}</p>
                   <p><strong>Issue:</strong> ${summary}</p>
                   <p><a href="${ticketLink}">View Ticket</a></p>`
        };
        try {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailPayload)
            });
        } catch (err) {
            console.error('Error sending HR notification:', err);
        }

        if (!document.getElementById('view-cases').classList.contains('hidden')) {
            loadCasesTable();
        }
        if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
            loadRecentCases();
        }
    }
}

// Create new task
async function submitNewTask(e) {
    e.preventDefault();
    const title = document.getElementById('new-task-title').value;
    const desc = document.getElementById('new-task-desc').value;

    const { error } = await supabaseClient
        .from('tasks')
        .insert({
            title,
            description: desc,
            status: 'pending',
            assigned_to: currentHrId
        });

    if (error) {
        alert('Error creating task: ' + error.message);
    } else {
        closeModal('create-task-modal');
        showToast('Task created', 'success');
        if (!document.getElementById('view-tasks').classList.contains('hidden')) {
            loadFullTasks();
        }
        if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
            loadTasks();
        }
    }
}

// Global search
async function performSearch(query) {
    if (query.length < 2) {
        document.getElementById('search-results').classList.remove('active');
        return;
    }
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<div class="dropdown-header">Quick Results</div>';

    const [employees, ticketsBySummary, ticketsById] = await Promise.all([
        supabaseClient.from('employees').select('id, full_name').ilike('full_name', `%${query}%`).limit(5),
        supabaseClient.from('tickets').select('id, issue_summary').ilike('issue_summary', `%${query}%`).limit(5),
        supabaseClient.from('tickets').select('id, issue_summary').ilike('id', `%${query}%`).limit(5)
    ]);

    if (employees.data?.length) {
        employees.data.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.textContent = `👤 ${emp.full_name}`;
            div.onclick = () => {
                document.getElementById('global-search').value = emp.full_name;
                resultsDiv.classList.remove('active');
                viewEmployeeProfile(emp.id, emp.full_name);
            };
            resultsDiv.appendChild(div);
        });
    }
    if (ticketsBySummary.data?.length) {
        ticketsBySummary.data.forEach(ticket => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.textContent = `📋 ${ticket.issue_summary || 'Ticket'} (${ticket.id.substr(0,8)})`;
            div.onclick = () => {
                sessionStorage.setItem('currentTicketId', ticket.id);
                window.location.href = '/hr/ticket.html';
            };
            resultsDiv.appendChild(div);
        });
    }
    if (ticketsById.data?.length) {
        ticketsById.data.forEach(ticket => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.textContent = `🔍 ID: ${ticket.id.substr(0,8)} – ${ticket.issue_summary || 'No summary'}`;
            div.onclick = () => {
                sessionStorage.setItem('currentTicketId', ticket.id);
                window.location.href = '/hr/ticket.html';
            };
            resultsDiv.appendChild(div);
        });
    }
    if (!employees.data?.length && !ticketsBySummary.data?.length && !ticketsById.data?.length) {
        resultsDiv.innerHTML += '<div class="search-item">No results found</div>';
    }
    resultsDiv.classList.add('active');
}

// Toggle dropdown menus
function toggleDropdown(id) {
    document.querySelectorAll('.dropdown-menu, .search-dropdown').forEach(el => {
        if (el.id !== id) el.classList.remove('active');
    });
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active');
}

// Filter employees
function filterEmployees() {
    const searchTerm = document.getElementById('emp-search').value.toLowerCase();
    const deptFilter = document.getElementById('emp-dept').value;
    const rows = document.querySelectorAll('#emp-table tbody tr');

    rows.forEach(row => {
        const name = row.cells[1].textContent.toLowerCase();
        const position = row.cells[3].textContent;
        const matchesSearch = name.includes(searchTerm);
        const matchesDept = deptFilter === 'All Departments' || position.includes(deptFilter);
        row.style.display = matchesSearch && matchesDept ? '' : 'none';
    });
}

// Filter cases
function filterCases() {
    const statusFilter = document.getElementById('case-status-filter').value;
    const assignFilter = document.getElementById('case-assign-filter').value;
    const rows = document.querySelectorAll('#cases-table tbody tr');

    rows.forEach(row => {
        const status = row.cells[1].textContent.trim();
        const assigneeCell = row.cells[5].textContent.trim();
        
        let matchesStatus = statusFilter === 'Status: All' || status === statusFilter;
        let matchesAssign = true;
        
        if (assignFilter === 'Me') {
            matchesAssign = assigneeCell.includes('Unassign');
        } else if (assignFilter === 'Unassigned') {
            matchesAssign = assigneeCell.includes('Assign');
        }
        
        row.style.display = matchesStatus && matchesAssign ? '' : 'none';
    });
}

// Logout
async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = '/';
}

// Close modal helper
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Open create case modal
function openCreateCaseModal() {
    document.getElementById('new-ticket-emp').value = '';
    document.getElementById('create-ticket-modal').classList.add('active');
    populateEmployeeList();
}
function openCreateTicketFromEmp() {
    closeModal('emp-profile-modal');
    document.getElementById('create-ticket-modal').classList.add('active');
    populateEmployeeList();
}

// Sort table (simple)
function sortTable(tableId, colIndex, isNumeric = false) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const dir = table.dataset.sortDir === 'asc' ? 'desc' : 'asc';
    table.dataset.sortDir = dir;

    rows.sort((a, b) => {
        const cellA = a.cells[colIndex].textContent.trim();
        const cellB = b.cells[colIndex].textContent.trim();
        if (isNumeric) {
            return dir === 'asc' ? parseFloat(cellA) - parseFloat(cellB) : parseFloat(cellB) - parseFloat(cellA);
        } else {
            return dir === 'asc' ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
        }
    });
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}

// ==================== Add Employee ====================
async function addEmployee() {
    const fullName = prompt("Enter employee's full name:");
    if (!fullName) return;
    const email = prompt("Enter employee's email:");
    if (!email) return;
    const position = prompt("Enter position (optional):");
    const department = prompt("Enter department (optional):");

    const { error } = await supabaseClient
        .from('employees')
        .insert({
            full_name: fullName,
            email: email,
            position: position || null,
            department: department || null
        });

    if (error) {
        showToast('Error adding employee: ' + error.message, 'error');
    } else {
        showToast('Employee added', 'success');
        loadEmployeeDirectory();
    }
}

// ==================== Analytics Functions (Enhanced) ====================
let ticketsChart, categoryChart, ratingChart;

async function loadAnalytics(startDate = null, endDate = null) {
    const kpis = ['total-tickets', 'open-tickets', 'avg-resolution', 'avg-response', 'avg-rating'];
    kpis.forEach(id => document.getElementById(id).textContent = '…'); // show loading

    try {
        let query = supabaseClient.from('tickets').select('*');
        if (startDate && endDate) {
            query = query.gte('created_at', startDate).lte('created_at', endDate);
        }
        const { data: tickets, error } = await query;
        if (error) throw error;

        const total = tickets.length;
        const open = tickets.filter(t => t.status === 'open').length;
        const rated = tickets.filter(t => t.rating !== null && t.rating !== -1);
        const avgRating = rated.length ? (rated.reduce((acc, t) => acc + t.rating, 0) / rated.length).toFixed(1) : 'N/A';

        let totalResponseDays = 0, responseCount = 0;
        let totalResolutionDays = 0, resolutionCount = 0;
        tickets.forEach(t => {
            if (t.first_hr_response_at && t.created_at) {
                const responseTime = (new Date(t.first_hr_response_at) - new Date(t.created_at)) / (1000*60*60*24);
                totalResponseDays += responseTime;
                responseCount++;
            }
            if (t.resolved_at && t.created_at) {
                const resolutionTime = (new Date(t.resolved_at) - new Date(t.created_at)) / (1000*60*60*24);
                totalResolutionDays += resolutionTime;
                resolutionCount++;
            }
        });
        const avgResponse = responseCount ? (totalResponseDays / responseCount).toFixed(1) : 'N/A';
        const avgResolution = resolutionCount ? (totalResolutionDays / resolutionCount).toFixed(1) : 'N/A';

        document.getElementById('total-tickets').textContent = total;
        document.getElementById('open-tickets').textContent = open;
        document.getElementById('avg-resolution').textContent = avgResolution;
        document.getElementById('avg-response').textContent = avgResponse;
        document.getElementById('avg-rating').textContent = avgRating;

        // Tickets over time (daily)
        const dailyCounts = {};
        tickets.forEach(t => {
            const day = t.created_at.slice(0,10);
            dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        });
        const days = Object.keys(dailyCounts).sort();
        const counts = days.map(d => dailyCounts[d]);

        if (ticketsChart) ticketsChart.destroy();
        const ctxTickets = document.getElementById('ticketsChart')?.getContext('2d');
        if (ctxTickets) {
            ticketsChart = new Chart(ctxTickets, {
                type: 'line',
                data: { 
                    labels: days, 
                    datasets: [{ 
                        label: 'Tickets Created', 
                        data: counts, 
                        borderColor: '#0a5b8c', 
                        backgroundColor: 'rgba(10,91,140,0.1)',
                        tension: 0.2
                    }] 
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true },
                        tooltip: { enabled: true }
                    }
                }
            });
        }

        // Category breakdown
        const categories = {};
        tickets.forEach(t => {
            const cat = t.category || 'Uncategorized';
            categories[cat] = (categories[cat] || 0) + 1;
        });
        const catLabels = Object.keys(categories);
        const catData = Object.values(categories);

        if (categoryChart) categoryChart.destroy();
        const ctxCategory = document.getElementById('categoryChart')?.getContext('2d');
        if (ctxCategory) {
            categoryChart = new Chart(ctxCategory, {
                type: 'pie',
                data: { 
                    labels: catLabels, 
                    datasets: [{ 
                        data: catData, 
                        backgroundColor: ['#0a5b8c', '#ffc107', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#94a3b8'] 
                    }] 
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }

        // Satisfaction trend (weekly)
        const weekly = {};
        tickets.filter(t => t.rating !== null && t.rating !== -1).forEach(t => {
            const date = new Date(t.created_at);
            const week = `${date.getFullYear()}-W${Math.ceil((date.getDate() + (new Date(date.getFullYear(), date.getMonth(), 1).getDay()))/7)}`;
            if (!weekly[week]) { weekly[week] = { sum: 0, count: 0 }; }
            weekly[week].sum += t.rating;
            weekly[week].count++;
        });
        const weeks = Object.keys(weekly).sort();
        const avgRatings = weeks.map(w => (weekly[w].sum / weekly[w].count).toFixed(1));

        if (ratingChart) ratingChart.destroy();
        const ctxRating = document.getElementById('ratingChart')?.getContext('2d');
        if (ctxRating) {
            ratingChart = new Chart(ctxRating, {
                type: 'line',
                data: { 
                    labels: weeks, 
                    datasets: [{ 
                        label: 'Avg Rating', 
                        data: avgRatings, 
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        tension: 0.2
                    }] 
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    scales: { y: { min: 1, max: 5 } }
                }
            });
        }

        // Raw data table
        const tbody = document.querySelector('#analytics-raw-table tbody');
        if (tbody) {
            tbody.innerHTML = '';
            tickets.slice(0, 50).forEach(t => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${t.id.substr(0,8)}</td>
                    <td>${t.category || 'Uncategorized'}</td>
                    <td><span class="status-badge status-${t.status}">${t.status}</span></td>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td>${t.rating || '-'}</td>
                `;
                tbody.appendChild(row);
            });
        }

    } catch (err) {
        console.error('Analytics error:', err);
        showToast('Error loading analytics: ' + err.message, 'error');
    }
}

function applyAnalyticsFilter() {
    const quarter = document.getElementById('quarter-select').value;
    const now = new Date();
    const year = now.getFullYear();
    let start, end;
    if (quarter === 'Q1') {
        start = new Date(year, 0, 1);
        end = new Date(year, 2, 31);
    } else if (quarter === 'Q2') {
        start = new Date(year, 3, 1);
        end = new Date(year, 5, 30);
    } else if (quarter === 'Q3') {
        start = new Date(year, 6, 1);
        end = new Date(year, 8, 30);
    } else if (quarter === 'Q4') {
        start = new Date(year, 9, 1);
        end = new Date(year, 11, 31);
    } else {
        start = document.getElementById('start-date').value;
        end = document.getElementById('end-date').value;
        if (!start || !end) {
            alert('Please select custom dates');
            return;
        }
        start = new Date(start).toISOString().split('T')[0];
        end = new Date(end).toISOString().split('T')[0];
    }
    loadAnalytics(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
}

document.getElementById('quarter-select').addEventListener('change', function() {
    const custom = this.value === 'custom';
    document.getElementById('start-date').style.display = custom ? 'inline-block' : 'none';
    document.getElementById('end-date').style.display = custom ? 'inline-block' : 'none';
});

function exportAnalyticsCSV() {
    supabaseClient.from('tickets').select('*').then(({ data, error }) => {
        if (error) {
            showToast('Error exporting', 'error');
            return;
        }
        const headers = ['ID','Category','Status','Created','Resolved','Rating','Feedback'];
        const rows = data.map(t => [
            t.id,
            t.category || '',
            t.status,
            t.created_at,
            t.resolved_at || '',
            t.rating !== null && t.rating !== -1 ? t.rating : '',
            t.feedback_comment || ''
        ]);
        let csv = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tickets_export.csv';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// ==================== Meeting Documents Functions ====================
let currentHrIdForDocs = null;

async function loadMeetingDocs() {
    const listDiv = document.getElementById('docs-list');
    listDiv.innerHTML = '<p>Loading...</p>';
    
    const { data: docs, error } = await supabaseClient
        .from('meeting_docs')
        .select('*, hr_staff(display_name)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading docs:', error);
        listDiv.innerHTML = '<p>Error loading documents.</p>';
        return;
    }

    if (!docs.length) {
        listDiv.innerHTML = '<p>No documents yet. Upload one!</p>';
        document.getElementById('kpi-meeting-count').textContent = '0';
        return;
    }

    document.getElementById('kpi-meeting-count').textContent = docs.length;

    let html = '<ul style="list-style: none; padding: 0;">';
    docs.forEach(doc => {
        const uploadedBy = doc.hr_staff?.display_name || 'HR';
        const date = new Date(doc.created_at).toLocaleDateString();
        html += `
            <li style="padding: 10px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${escapeHTML(doc.title)}</strong><br>
                    <small>Uploaded by ${escapeHTML(uploadedBy)} on ${date}</small>
                    ${doc.description ? `<p>${escapeHTML(doc.description)}</p>` : ''}
                </div>
                <a href="${doc.file_url}" target="_blank" class="btn btn-outline">View</a>
            </li>
        `;
    });
    html += '</ul>';
    listDiv.innerHTML = html;
}

async function uploadDocument() {
    const fileInput = document.getElementById('doc-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a file.');
        return;
    }

    const title = prompt('Enter a title for this document:', file.name);
    if (!title) return;
    const description = prompt('Enter a brief description (optional):', '');

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { data, error } = await supabaseClient.storage
        .from('meeting-docs')
        .upload(fileName, file);

    if (error) {
        console.error('Upload error:', error);
        alert('Upload failed: ' + error.message);
        return;
    }

    const { data: urlData } = supabaseClient.storage
        .from('meeting-docs')
        .getPublicUrl(fileName);

    const { error: dbError } = await supabaseClient
        .from('meeting_docs')
        .insert({
            title: title,
            description: description,
            file_url: urlData.publicUrl,
            uploaded_by: currentHrIdForDocs
        });

    if (dbError) {
        console.error('DB insert error:', dbError);
        alert('Failed to save document info.');
    } else {
        alert('Document uploaded successfully!');
        fileInput.value = '';
        loadMeetingDocs();
    }
}

function openMeetingDocsModal() {
    loadMeetingDocs();
    document.getElementById('meeting-docs-modal').classList.add('active');
}

function closeMeetingDocsModal() {
    document.getElementById('meeting-docs-modal').classList.remove('active');
}

// ==================== CSV Import/Export Functions ====================

// Export employees to CSV
async function exportEmployeesCSV() {
    const { data: employees, error } = await supabaseClient
        .from('employees')
        .select('email, full_name, position, department, phone, marital_status, start_date');
    if (error) {
        showToast('Error exporting employees', 'error');
        console.error(error);
        return;
    }

    const headers = ['Email', 'Full Name', 'Position', 'Department', 'Phone', 'Marital Status', 'Start Date'];
    const csvRows = [headers.join(',')];

    employees.forEach(emp => {
        const row = [
            emp.email,
            `"${emp.full_name || ''}"`,
            `"${emp.position || ''}"`,
            `"${emp.department || ''}"`,
            emp.phone || '',
            emp.marital_status || '',
            emp.start_date || ''
        ];
        csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export started', 'success');
}

// Open import modal
function openImportCSVModal() {
    document.getElementById('import-csv-modal').classList.add('active');
    document.getElementById('import-preview').innerHTML = '';
    document.getElementById('csv-upload').value = '';
}

// Process CSV upload with validation and preview
async function processCSVUpload() {
    const fileInput = document.getElementById('csv-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a CSV file.');
        return;
    }

    const text = await file.text();
    const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
    if (rows.length < 2) {
        alert('CSV file is empty.');
        return;
    }

    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const required = ['email', 'full_name'];
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length) {
        alert(`CSV missing required columns: ${missing.join(', ')}`);
        return;
    }

    const emailIdx = headers.indexOf('email');
    const nameIdx = headers.indexOf('full_name');
    const positionIdx = headers.indexOf('position');
    const deptIdx = headers.indexOf('department');
    const phoneIdx = headers.indexOf('phone');
    const maritalIdx = headers.indexOf('marital_status');
    const startIdx = headers.indexOf('start_date');

    const data = rows.slice(1).filter(row => row.length === headers.length && row[emailIdx]?.trim());
    if (!data.length) {
        alert('No valid data rows found.');
        return;
    }

    let previewHtml = '<h4>Preview (first 5 rows):</h4><table class="data-table"><thead><tr>';
    headers.forEach(h => previewHtml += `<th>${h}</th>`);
    previewHtml += '</tr></thead><tbody>';
    data.slice(0,5).forEach(row => {
        previewHtml += '<tr>' + row.map(cell => `<td>${escapeHTML(cell)}</td>`).join('') + '</tr>';
    });
    previewHtml += '</tbody></table>';
    previewHtml += `<p>Total rows to process: ${data.length}</p>`;
    document.getElementById('import-preview').innerHTML = previewHtml;

    if (!confirm(`Proceed with import? This will update existing employees (by email) and insert new ones.`)) return;

    let success = 0, errors = [];
    for (const row of data) {
        const record = {
            email: row[emailIdx],
            full_name: row[nameIdx] || '',
            position: positionIdx >= 0 ? row[positionIdx] || null : null,
            department: deptIdx >= 0 ? row[deptIdx] || null : null,
            phone: phoneIdx >= 0 ? row[phoneIdx] || null : null,
            marital_status: maritalIdx >= 0 ? row[maritalIdx] || null : null,
            start_date: startIdx >= 0 ? row[startIdx] || null : null
        };
        if (!record.email.includes('@')) {
            errors.push(`Invalid email: ${record.email}`);
            continue;
        }
        const { error } = await supabaseClient
            .from('employees')
            .upsert(record, { onConflict: 'email' });
        if (error) {
            errors.push(`Error updating ${record.email}: ${error.message}`);
        } else {
            success++;
        }
    }

    if (errors.length) {
        console.error('Import errors:', errors);
        showToast(`Import completed with ${errors.length} errors. Check console.`, 'error');
    } else {
        showToast(`Import successful: ${success} records processed.`, 'success');
    }
    closeModal('import-csv-modal');
    if (!document.getElementById('view-employees').classList.contains('hidden')) {
        loadEmployeeDirectory();
    }
}

// ==================== Notification Functions ====================
async function loadNotificationItems() {
    try {
        const { data: openTickets, error: ticketError } = await supabaseClient
            .from('tickets')
            .select('id, issue_summary, employees(full_name)')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(5);

        const { data: pendingTasks, error: taskError } = await supabaseClient
            .from('tasks')
            .select('id, title')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5);

        const dropdown = document.getElementById('notif-dropdown');
        let html = '<div class="dropdown-header">Notifications</div>';

        if (openTickets?.length) {
            html += '<div style="padding: 8px 15px; background: #f0f9ff; font-weight: 600;">Open Tickets</div>';
            openTickets.forEach(t => {
                html += `
                    <a href="/hr/ticket.html" class="dropdown-item" onclick="sessionStorage.setItem('currentTicketId', '${t.id}'); return true;">
                        🎫 ${t.issue_summary?.substring(0,30) || 'Ticket'} - ${t.employees?.full_name || 'Unknown'}
                    </a>
                `;
            });
        }

        if (pendingTasks?.length) {
            html += '<div style="padding: 8px 15px; background: #f0f9ff; font-weight: 600;">Pending Tasks</div>';
            pendingTasks.forEach(t => {
                html += `
                    <a href="/hr/tasks.html" class="dropdown-item" onclick="navigate('view-tasks'); return false;">
                        ✅ ${t.title}
                    </a>
                `;
            });
        }

        if (!openTickets?.length && !pendingTasks?.length) {
            html += '<div class="dropdown-item">No new notifications</div>';
        }

        dropdown.innerHTML = html;
    } catch (err) {
        console.error('Error loading notifications:', err);
    }
}

async function updateNotificationCount() {
    try {
        const { count: openCount, error: ticketError } = await supabaseClient
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'open');

        const { count: taskCount, error: taskError } = await supabaseClient
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (ticketError || taskError) throw new Error('Count error');

        const total = (openCount || 0) + (taskCount || 0);
        const badge = document.getElementById('notif-badge');
        badge.textContent = total;
        badge.style.display = total > 0 ? 'flex' : 'none';

        loadNotificationItems();
    } catch (err) {
        console.error('Error updating notification count:', err);
    }
}

// ==================== Dashboard Charts ====================
let dashboardTicketsChart, dashboardCategoryChart;

async function loadDashboardCharts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: tickets, error } = await supabaseClient
        .from('tickets')
        .select('created_at, category')
        .gte('created_at', thirtyDaysAgo.toISOString());

    if (error) {
        console.error('Error loading dashboard charts:', error);
        return;
    }

    const daily = {};
    tickets.forEach(t => {
        const day = t.created_at.slice(0,10);
        daily[day] = (daily[day] || 0) + 1;
    });
    const days = Object.keys(daily).sort();
    const counts = days.map(d => daily[d]);

    if (dashboardTicketsChart) dashboardTicketsChart.destroy();
    dashboardTicketsChart = new Chart(document.getElementById('dashboard-tickets-chart'), {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Tickets',
                data: counts,
                borderColor: '#0a5b8c',
                backgroundColor: 'rgba(10,91,140,0.1)',
                tension: 0.2
            }]
        },
        options: { responsive: true }
    });

    const categories = {};
    tickets.forEach(t => {
        const cat = t.category || 'Uncategorized';
        categories[cat] = (categories[cat] || 0) + 1;
    });
    const catLabels = Object.keys(categories);
    const catData = Object.values(categories);

    if (dashboardCategoryChart) dashboardCategoryChart.destroy();
    dashboardCategoryChart = new Chart(document.getElementById('dashboard-category-chart'), {
        type: 'pie',
        data: {
            labels: catLabels,
            datasets: [{
                data: catData,
                backgroundColor: ['#0a5b8c', '#ffc107', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#94a3b8']
            }]
        },
        options: { responsive: true }
    });
}

// ==================== Initialize ====================
async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '/';
        return;
    }

    const { data: hr } = await supabaseClient
        .from('hr_staff')
        .select('id, display_name')
        .eq('auth_id', user.id)
        .single();

    if (!hr) {
        alert('Access denied. HR only.');
        window.location.href = '/';
        return;
    }
    currentHrId = hr.id;
    currentHrName = hr.display_name;
    currentHrIdForDocs = currentHrId;

    // Sidebar toggle
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebar-overlay').classList.add('active');
    });
    document.getElementById('close-menu').addEventListener('click', closeMenu);
    document.getElementById('sidebar-overlay').addEventListener('click', closeMenu);

    // Search
    document.getElementById('global-search').addEventListener('input', (e) => performSearch(e.target.value));
    document.getElementById('global-search').addEventListener('focus', () => {
        if (document.getElementById('global-search').value.length >= 2) {
            document.getElementById('search-results').classList.add('active');
        }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.header-right') && !e.target.closest('.header-search')) {
            document.querySelectorAll('.dropdown-menu, .search-dropdown').forEach(el => el.classList.remove('active'));
        }
    });

    // Realtime subscriptions
    supabaseClient
        .channel('tickets-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
            if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
                loadRecentCases();
                loadKPIs();
            }
            if (!document.getElementById('view-cases').classList.contains('hidden')) {
                loadCasesTable();
            }
            updateNotificationCount();
        })
        .subscribe();

    supabaseClient
        .channel('tasks-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
            if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
                loadTasks();
                loadKPIs();
            }
            if (!document.getElementById('view-tasks').classList.contains('hidden')) {
                loadFullTasks();
            }
            updateNotificationCount();
        })
        .subscribe();

    supabaseClient
        .channel('notifications-tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
            updateNotificationCount();
        })
        .subscribe();

    supabaseClient
        .channel('notifications-tasks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
            updateNotificationCount();
        })
        .subscribe();

    // Tour button listener
    const tourBtn = document.getElementById('start-tour-btn');
    if (tourBtn) {
        tourBtn.addEventListener('click', startTour);
        console.log('Tour button listener attached');
    } else {
        console.error('Tour button not found');
    }

    // Expose CSV functions globally
    window.exportEmployeesCSV = exportEmployeesCSV;
    window.openImportCSVModal = openImportCSVModal;
    window.processCSVUpload = processCSVUpload;

    navigate('view-dashboard');
}

function closeMenu() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

// Expose functions to global scope
window.navigate = navigate;
window.viewEmployeeProfile = viewEmployeeProfile;
window.openCreateCaseModal = openCreateCaseModal;
window.openCreateTicketFromEmp = openCreateTicketFromEmp;
window.submitNewTicket = submitNewTicket;
window.submitNewTask = submitNewTask;
window.assignTicket = assignTicket;
window.unassignTicket = unassignTicket;
window.updateReassign = updateReassign;
window.completeTask = completeTask;
window.deleteTask = deleteTask;
window.toggleDropdown = toggleDropdown;
window.filterEmployees = filterEmployees;
window.filterCases = filterCases;
window.sortTable = sortTable;
window.closeModal = closeModal;
window.signOut = signOut;
window.viewProfile = () => { alert('Profile page coming soon'); };
window.applyAnalyticsFilter = applyAnalyticsFilter;
window.exportAnalyticsCSV = exportAnalyticsCSV;
window.openMeetingDocsModal = openMeetingDocsModal;
window.closeMeetingDocsModal = closeMeetingDocsModal;
window.uploadDocument = uploadDocument;
window.addEmployee = addEmployee;

init();
