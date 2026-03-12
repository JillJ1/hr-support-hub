// employee-chat.js – updated with escalation visibility and scroll fix

const supabaseUrl = 'https://sbaslcgmbwfnqbwtzsil.supabase.co';
const vercelUrl = 'https://hr-support-hub.vercel.app';

const botApiUrl = window.BOT_API_URL || 'https://hr-chatbot-production.up.railway.app/chat';

let currentTicketId = null;
let employeeId = null;
let employeeName = '';
let botActive = true;
let loadingTimeout = null;
let ticketStatus = null;
let ticketRating = null;

// Helper to scroll chat to bottom
function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    if (messagesDiv) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
}

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
    scrollToBottom(); // scroll after each new message
}

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
    scrollToBottom(); // scroll after loading all messages
}

function showTyping(message = 'Thinking') {
    const messagesDiv = document.getElementById('messages');
    removeTyping();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    messagesDiv.appendChild(typingDiv);
    scrollToBottom();

    loadingTimeout = setTimeout(() => {
        removeTyping();
        const fallbackMsg = {
            sender_type: 'bot',
            content: '⚠️ The assistant is taking longer than expected. Please wait or escalate to HR.'
        };
        displayMessage(fallbackMsg);
    }, 10000);
}

function removeTyping() {
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;

    showTyping();

    const { error: msgError } = await supabaseClient
        .from('messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'employee',
            content: text
        });

    if (msgError) {
        console.error('Error saving message:', msgError);
        removeTyping();
        input.disabled = false;
        showToast('Failed to send message', 'error');
        return;
    }

    if (botActive) {
        try {
            const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError || !sessionData?.session?.access_token) {
                throw new Error('No valid session token');
            }
            const token = sessionData.session.access_token;

            const response = await fetch(botApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ query: text, ticket_id: currentTicketId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Bot API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            removeTyping();

            const { error: botError } = await supabaseClient
                .from('messages')
                .insert({
                    ticket_id: currentTicketId,
                    sender_type: 'bot',
                    content: data.answer
                });

            if (botError) {
                console.error('Error saving bot message:', botError);
            }

        } catch (error) {
            console.error('Bot error:', error);
            removeTyping();
            showToast(`Bot error: ${error.message}`, 'error');
            await supabaseClient
                .from('messages')
                .insert({
                    ticket_id: currentTicketId,
                    sender_type: 'bot',
                    content: '⚠️ Sorry, I encountered an error. Please try again or escalate to HR.'
                });
        }
    } else {
        removeTyping();
    }

    input.disabled = false;
    input.focus();
}

async function escalateToHR() {
    // ✅ Make ticket visible to HR
    const { error } = await supabaseClient
        .from('tickets')
        .update({ priority: 'high', visible_to_hr: true })
        .eq('id', currentTicketId);

    if (error) {
        console.error('Error escalating:', error);
        alert('Could not escalate. Please try again.');
        return;
    }

    const hrEmail = 'jcjj.1104@gmail.com'; // Should be env variable
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

    await supabaseClient
        .from('messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'bot',
            content: 'Your request has been escalated to HR. Someone will contact you soon.'
        });

    document.getElementById('escalate-btn').disabled = true;
    document.getElementById('escalate-btn').textContent = 'Escalated';
}

async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '/';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    let ticketId = urlParams.get('id');
    if (!ticketId) {
        ticketId = sessionStorage.getItem('currentTicketId');
    }
    if (!ticketId) {
        alert('No ticket selected. Redirecting to tickets list.');
        window.location.href = '/employee/tickets.html';
        return;
    }
    sessionStorage.removeItem('currentTicketId');
    currentTicketId = ticketId;

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

    const { data: ticketData, error: ticketError } = await supabaseClient
        .from('tickets')
        .select('bot_active, status, rating')
        .eq('id', currentTicketId)
        .single();

    if (ticketError) {
        console.error('Error loading ticket:', ticketError);
        alert('Could not load ticket.');
        window.location.href = '/employee/tickets.html';
        return;
    }

    botActive = ticketData?.bot_active ?? true;
    ticketStatus = ticketData?.status;
    ticketRating = ticketData?.rating;

    await loadMessages();

    if (ticketStatus === 'closed' && !ticketRating) {
        showRatingPrompt();
    }

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
            const newStatus = payload.new.status;
            const newRating = payload.new.rating;

            if (botActive && !newBotActive) {
                displayMessage({
                    sender_type: 'bot',
                    content: 'HR has joined the conversation. They will respond to you directly.'
                });
            }
            botActive = newBotActive;

            if (newStatus === 'closed' && newStatus !== ticketStatus && !newRating) {
                showRatingPrompt();
            }
            ticketStatus = newStatus;
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

function showToast(message, type = 'info') {
    // Simple toast – you can replace with your preferred implementation
    alert(message);
}

// Rating prompt functions (unchanged) ...

init();
