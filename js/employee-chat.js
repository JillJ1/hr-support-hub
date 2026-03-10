// employee-chat.js
const supabaseUrl = 'https://sbaslcgmbwfnqbwtzsil.supabase.co';
const vercelUrl = 'https://hr-support-hub.vercel.app'; // Your live frontend URL

let currentTicketId = null;
let employeeId = null;
let employeeName = '';
let botApiUrl = 'https://hr-chatbot-production.up.railway.app/chat';
let botActive = true;
let loadingTimeout = null;

// Helper to escape HTML
function escapeHTML(str) {
    return str.replace(/[&<>"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
}

// Format bot messages (convert markdown-like syntax to HTML)
function formatBotMessage(text) {
    if (!text) return text;
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const lines = text.split('\n');
    let inList = false;
    let html = '';
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += '<li>' + trimmed.substring(2) + '</li>';
        } else {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            html += line + '<br>';
        }
    }
    if (inList) html += '</ul>';
    return html;
}

// Display a message in the chat window
function displayMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.sender_type}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (msg.sender_type === 'bot') {
        bubble.innerHTML = formatBotMessage(escapeHTML(msg.content));
    } else {
        bubble.textContent = escapeHTML(msg.content);
    }
    msgDiv.appendChild(bubble);
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Load all previous messages for this ticket
async function loadMessages() {
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('ticket_id', currentTicketId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error loading messages:', error);
        return;
    }
    messages.forEach(displayMessage);
}

// Show typing indicator
function showTyping(message = 'Thinking') {
    const messagesDiv = document.getElementById('messages');
    removeTyping();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    loadingTimeout = setTimeout(() => {
        const typing = document.getElementById('typing-indicator');
        if (typing) {
            // Could update text if we had a span for it
        }
    }, 5000);
}

// Remove typing indicator
function removeTyping() {
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

// Send a message (employee -> bot)
async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;

    showTyping();

    const { data: empMsg, error: msgError } = await supabaseClient
        .from('messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'employee',
            content: text
        })
        .select()
        .single();

    if (msgError) {
        console.error('Error saving message:', msgError);
        removeTyping();
        input.disabled = false;
        return;
    }

    displayMessage(empMsg);

    if (botActive) {
        try {
            const response = await fetch(botApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: text })
            });
            if (!response.ok) throw new Error('Bot API error');
            const data = await response.json();

            removeTyping();

            const { data: botMsg, error: botError } = await supabaseClient
                .from('messages')
                .insert({
                    ticket_id: currentTicketId,
                    sender_type: 'bot',
                    content: data.answer
                })
                .select()
                .single();

            if (botError) {
                console.error('Error saving bot message:', botError);
            } else {
                displayMessage(botMsg);
            }

        } catch (error) {
            console.error('Bot error:', error);
            removeTyping();
            const { data: errMsg } = await supabaseClient
                .from('messages')
                .insert({
                    ticket_id: currentTicketId,
                    sender_type: 'bot',
                    content: '⚠️ Sorry, I encountered an error. Please try again or escalate to HR.'
                })
                .select()
                .single();
            if (errMsg) displayMessage(errMsg);
        }
    } else {
        removeTyping();
    }

    input.disabled = false;
    input.focus();
}

// Escalate to HR (now sends email notification)
async function escalateToHR() {
    const { error } = await supabaseClient
        .from('tickets')
        .update({ priority: 'high' })
        .eq('id', currentTicketId);

    if (error) {
        console.error('Error escalating:', error);
        alert('Could not escalate. Please try again.');
        return;
    }

    // Notify HR of escalation – link now points to live Vercel domain
    const hrEmail = 'jcjj.1104@gmail.com'; // Replace with actual HR email later
    const ticketLink = `${vercelUrl}/hr/ticket.html?id=${currentTicketId}`;
    const emailPayload = {
        to: hrEmail,
        subject: `Ticket escalated by ${employeeName}`,
        html: `<p>A ticket has been escalated:</p>
               <p><strong>Employee:</strong> ${employeeName}</p>
               <p><strong>Ticket ID:</strong> ${currentTicketId}</p>
               <p><a href="${ticketLink}">View Ticket</a></p>`
    };
    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailPayload)
        });
        if (!response.ok) console.error('Escalation email failed', await response.text());
    } catch (err) {
        console.error('Error sending escalation email:', err);
    }

    const { data: sysMsg } = await supabaseClient
        .from('messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'bot',
            content: 'Your request has been escalated to HR. Someone will contact you soon.'
        })
        .select()
        .single();
    if (sysMsg) displayMessage(sysMsg);

    document.getElementById('escalate-btn').disabled = true;
    document.getElementById('escalate-btn').textContent = 'Escalated';
}

// Initialize the page
async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '/';
        return;
    }

    const { data: employee, error: empError } = await supabaseClient
        .from('employees')
        .select('id, full_name')
        .eq('auth_id', user.id)
        .single();

    if (empError || !employee) {
        console.error('Not an employee:', empError);
        alert('You are not registered as an employee. Please contact HR.');
        return;
    }

    employeeId = employee.id;
    employeeName = employee.full_name;

    currentTicketId = sessionStorage.getItem('currentTicketId');
    if (!currentTicketId) {
        alert('No ticket selected. Redirecting to tickets list.');
        window.location.href = '/employee/tickets.html';
        return;
    }
    sessionStorage.removeItem('currentTicketId');

    const { data: ticketData, error: ticketError } = await supabaseClient
        .from('tickets')
        .select('bot_active')
        .eq('id', currentTicketId)
        .single();

    if (ticketError) {
        console.error('Error loading ticket:', ticketError);
        alert('Could not load ticket.');
        window.location.href = '/employee/tickets.html';
        return;
    }

    botActive = ticketData?.bot_active ?? true;

    await loadMessages();

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

    supabaseClient
        .channel(`ticket-${currentTicketId}-status`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'tickets',
            filter: `id=eq.${currentTicketId}`
        }, (payload) => {
            const newBotActive = payload.new.bot_active;
            if (botActive && !newBotActive) {
                displayMessage({
                    sender_type: 'bot',
                    content: 'HR has joined the conversation. They will respond to you directly.'
                });
            }
            botActive = newBotActive;
        })
        .subscribe();

    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = '/employee/tickets.html';
    });

    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    document.getElementById('escalate-btn').addEventListener('click', escalateToHR);

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '/';
    });
}

init();
