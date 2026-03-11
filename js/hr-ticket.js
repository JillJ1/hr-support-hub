const supabaseUrl = 'https://sbaslcgmbwfnqbwtzsil.supabase.co';
let currentTicketId = null;
let currentHrId = null;
let currentHrName = '';
let currentTicket = null;

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = type === 'error' ? '#b71c1c' : type === 'success' ? '#1e7b4c' : '#1c1c1e';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
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

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
}

async function createAssignmentTask(ticket) {
    try {
        const taskTitle = `Handle ticket #${ticket.id.substr(0,8)} - ${ticket.issue_summary || 'No summary'}`;
        const { error } = await supabaseClient
            .from('tasks')
            .insert({
                title: taskTitle,
                description: `Ticket assigned to you. Employee: ${ticket.employees?.full_name || 'Unknown'}`,
                status: 'pending',
                assigned_to: currentHrId
            });
        if (error) console.error('Error creating task:', error);
    } catch (err) {
        console.error('Task creation failed:', err);
    }
}

function displayMessage(msg) {
    const chatDiv = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.sender_type}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = msg.content;
    msgDiv.appendChild(bubble);
    chatDiv.appendChild(msgDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

async function loadTicket() {
    try {
        const { data: ticket, error } = await supabaseClient
            .from('tickets')
            .select(`
                *,
                employees (*)
            `)
            .eq('id', currentTicketId)
            .single();

        if (error) throw error;
        currentTicket = ticket;

        document.getElementById('ticket-id').textContent = `Case #${ticket.id.substr(0,8)}`;
        updateStatusPill(ticket.status);

        const emp = ticket.employees;
        document.getElementById('employee-name').textContent = emp.full_name;
        document.getElementById('employee-email').textContent = emp.email || '';
        document.getElementById('employee-position').textContent = emp.position || 'N/A';
        document.getElementById('employee-dept').textContent = emp.department || 'N/A';
        document.getElementById('employee-phone').textContent = emp.phone || 'Not provided';
        document.getElementById('employee-start').textContent = emp.start_date ? new Date(emp.start_date).toLocaleDateString() : 'N/A';

        // Set category dropdown value
        const categorySelect = document.getElementById('ticket-category');
        if (categorySelect && ticket.category) {
            categorySelect.value = ticket.category;
        }

        const { data: messages, error: msgError } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('ticket_id', currentTicketId)
            .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        document.getElementById('chat-history').innerHTML = '';
        messages.forEach(displayMessage);

        loadNotes();

        supabaseClient
            .channel(`ticket-${currentTicketId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `ticket_id=eq.${currentTicketId}`
            }, (payload) => {
                displayMessage(payload.new);
            })
            .subscribe();

    } catch (err) {
        console.error('Error loading ticket:', err);
        showToast('Failed to load ticket', 'error');
    }
}

function updateStatusPill(status) {
    const pill = document.getElementById('status-pill');
    let statusText = status.charAt(0).toUpperCase() + status.slice(1);
    if (status === 'inprogress') statusText = 'In Progress';
    pill.textContent = statusText;
    pill.className = `status-pill ${status.replace(' ', '')}`;
}

async function loadNotes() {
    const { data: notes, error } = await supabaseClient
        .from('internal_notes')
        .select(`
            *,
            hr_staff (display_name)
        `)
        .eq('ticket_id', currentTicketId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading notes:', error);
        return;
    }

    const notesDiv = document.getElementById('notes-list');
    notesDiv.innerHTML = '';
    notes.forEach(note => {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note';
        noteDiv.innerHTML = `
            <strong>${escapeHTML(note.hr_staff?.display_name || 'HR')}</strong> 
            <small>${new Date(note.created_at).toLocaleString()}</small>
            <p>${escapeHTML(note.note)}</p>
        `;
        notesDiv.appendChild(noteDiv);
    });
}

async function sendReply() {
    const input = document.getElementById('reply-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const { data: msg, error } = await supabaseClient
        .from('messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'hr',
            sender_id: currentHrId,
            content: text
        })
        .select()
        .single();

    if (error) {
        showToast('Error sending reply: ' + error.message, 'error');
    } else {
        displayMessage(msg);
        const { data: ticket } = await supabaseClient
            .from('tickets')
            .select('first_hr_response_at')
            .eq('id', currentTicketId)
            .single();
        if (!ticket.first_hr_response_at) {
            await supabaseClient
                .from('tickets')
                .update({ first_hr_response_at: new Date().toISOString() })
                .eq('id', currentTicketId);
        }
    }
}

async function addNote() {
    const textarea = document.getElementById('new-note');
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';

    const { error } = await supabaseClient
        .from('internal_notes')
        .insert({
            ticket_id: currentTicketId,
            hr_id: currentHrId,
            note: text
        });

    if (error) {
        showToast('Error adding note: ' + error.message, 'error');
    } else {
        loadNotes();
        showToast('Note added', 'success');
    }
}

async function assignToMe() {
    console.log('assignToMe called, currentHrId:', currentHrId, 'ticketId:', currentTicketId);
    try {
        const { error } = await supabaseClient
            .from('tickets')
            .update({ assigned_to: currentHrId, status: 'inprogress' })
            .eq('id', currentTicketId);

        if (error) {
            console.error('Assign error:', error);
            showToast('Error assigning: ' + error.message, 'error');
        } else {
            console.log('Assign successful');
            showToast('Ticket assigned to you', 'success');
            await createAssignmentTask(currentTicket);
            updateStatusPill('inprogress');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
        showToast('Unexpected error', 'error');
    }
}

async function takeOver() {
    console.log('takeOver called, currentHrId:', currentHrId, 'ticketId:', currentTicketId);
    try {
        const { error } = await supabaseClient
            .from('tickets')
            .update({ assigned_to: currentHrId, status: 'inprogress', bot_active: false })
            .eq('id', currentTicketId);

        if (error) {
            console.error('Take over error:', error);
            showToast('Error taking over: ' + error.message, 'error');
        } else {
            console.log('Take over successful');
            showToast('You have taken over this conversation', 'success');
            await createAssignmentTask(currentTicket);
            await supabaseClient
                .from('messages')
                .insert({
                    ticket_id: currentTicketId,
                    sender_type: 'bot',
                    content: 'HR has joined the conversation. They will respond directly.'
                });
            updateStatusPill('inprogress');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
        showToast('Unexpected error', 'error');
    }
}

async function changeStatus() {
    const newStatus = document.getElementById('status-dropdown').value;
    const { error } = await supabaseClient
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', currentTicketId);

    if (error) {
        showToast('Error updating status: ' + error.message, 'error');
    } else {
        showToast(`Status changed to ${newStatus}`, 'success');
        updateStatusPill(newStatus);
    }
}

async function resolve() {
    try {
        const { error } = await supabaseClient
            .from('tickets')
            .update({ status: 'closed', resolved_at: new Date().toISOString() })
            .eq('id', currentTicketId);

        if (error) {
            showToast('Error resolving ticket: ' + error.message, 'error');
            console.error('Resolve error:', error);
        } else {
            showToast('Ticket resolved', 'success');
            updateStatusPill('closed');

            const employeeEmail = currentTicket.employees?.email;
            console.log('Employee email:', employeeEmail);
            if (employeeEmail) {
                const chatLogHtml = await formatChatLog(currentTicketId);
                const emailPayload = {
                    to: employeeEmail,
                    subject: `Your support ticket #${currentTicketId.substr(0,8)} has been resolved`,
                    html: chatLogHtml
                };
                try {
                    // Use supabaseUrl directly (already has https://)
                    const response = await fetch(
                        `${supabaseUrl}/functions/v1/send-email`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(emailPayload)
                        }
                    );
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('Email send failed:', errorText);
                    } else {
                        console.log('Email sent successfully');
                    }
                } catch (err) {
                    console.error('Error sending email:', err);
                }
            } else {
                console.log('No employee email found');
            }
        }
    } catch (err) {
        console.error('Unexpected error:', err);
        showToast('Unexpected error', 'error');
    }
}

// New function to handle category dropdown changes
async function updateCategory(newCategory) {
    if (!currentTicketId) {
        showToast('No ticket loaded', 'error');
        return;
    }
    const { error } = await supabaseClient
        .from('tickets')
        .update({ category: newCategory })
        .eq('id', currentTicketId);
    if (error) {
        showToast('Error updating category: ' + error.message, 'error');
    } else {
        showToast('Category updated', 'success');
    }
}

async function openEmployeeProfile() {
    const emp = currentTicket.employees;
    if (!emp) return;

    document.getElementById('modal-avatar').textContent = getInitials(emp.full_name);
    document.getElementById('modal-name').textContent = emp.full_name;
    document.getElementById('modal-email').textContent = emp.email || '';
    document.getElementById('modal-position').textContent = emp.position || 'N/A';
    document.getElementById('modal-dept').textContent = emp.department || 'N/A';
    document.getElementById('modal-phone').textContent = emp.phone || 'Not provided';
    document.getElementById('modal-start').textContent = emp.start_date ? new Date(emp.start_date).toLocaleDateString() : 'N/A';

    const { data: tickets } = await supabaseClient
        .from('tickets')
        .select('id, issue_summary, status, created_at')
        .eq('employee_id', emp.id)
        .order('created_at', { ascending: false });

    const listDiv = document.getElementById('modal-ticket-list');
    listDiv.innerHTML = '';
    if (tickets && tickets.length) {
        tickets.forEach(t => {
            const div = document.createElement('div');
            div.className = 'modal-ticket-item';
            div.textContent = `${t.created_at.slice(0,10)} - ${t.issue_summary || 'No summary'} (${t.status})`;
            div.onclick = () => {
                closeModal();
                sessionStorage.setItem('currentTicketId', t.id);
                window.location.reload();
            };
            listDiv.appendChild(div);
        });
    } else {
        listDiv.innerHTML = '<p>No other tickets found.</p>';
    }

    document.getElementById('employee-profile-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('employee-profile-modal').classList.remove('active');
}

let notesOpen = true;
function toggleNotes() {
    const content = document.getElementById('notes-content');
    const icon = document.getElementById('notes-collapse-icon');
    if (notesOpen) {
        content.style.maxHeight = '0px';
        icon.textContent = '▶';
    } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        icon.textContent = '▼';
    }
    notesOpen = !notesOpen;
}

async function init() {
    showToast('Page loaded', 'info');

    let ticketId = sessionStorage.getItem('currentTicketId');
    if (!ticketId) {
        const urlParams = new URLSearchParams(window.location.search);
        ticketId = urlParams.get('id');
    }
    if (!ticketId) {
        alert('No ticket ID specified.');
        window.location.href = '/hr/dashboard.html';
        return;
    }
    currentTicketId = ticketId;
    sessionStorage.removeItem('currentTicketId');

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
    console.log('currentHrId:', currentHrId);

    await loadTicket();

    const sendBtn = document.getElementById('send-reply-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendReply);
    else console.error('send-reply-btn not found');

    const replyInput = document.getElementById('reply-input');
    if (replyInput) {
        replyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendReply();
        });
    }

    const addNoteBtn = document.getElementById('add-note-btn');
    if (addNoteBtn) addNoteBtn.addEventListener('click', addNote);

    const assignBtn = document.getElementById('assign-to-me-btn');
    if (assignBtn) {
        assignBtn.addEventListener('click', assignToMe);
        console.log('Assign button listener attached');
    } else {
        console.error('assign-to-me-btn not found');
    }

    const takeOverBtn = document.getElementById('take-over-btn');
    if (takeOverBtn) {
        takeOverBtn.addEventListener('click', takeOver);
        console.log('Take over button listener attached');
    } else {
        console.error('take-over-btn not found');
    }

    const resolveBtn = document.getElementById('resolve-btn');
    if (resolveBtn) resolveBtn.addEventListener('click', resolve);

    const statusDropdown = document.getElementById('status-dropdown');
    if (statusDropdown) statusDropdown.addEventListener('change', changeStatus);

    const menuBtn = document.getElementById('employee-menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', openEmployeeProfile);
}

window.toggleNotes = toggleNotes;
window.closeModal = closeModal;
window.updateCategory = updateCategory; // expose the category update function

init();

async function formatChatLog(ticketId) {
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('sender_type, content, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

    if (error) return '<p>Could not retrieve chat log.</p>';

    let html = '<h3>Your Conversation with HR Support</h3>';
    messages.forEach(msg => {
        const sender = msg.sender_type === 'employee' ? 'You' : 
                      (msg.sender_type === 'hr' ? 'HR' : 'Bot');
        const time = new Date(msg.created_at).toLocaleString();
        html += `<p><strong>${sender} (${time}):</strong><br>${escapeHTML(msg.content)}</p>`;
    });
    return html;
}
