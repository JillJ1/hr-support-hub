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
    if (!str) return '';
    return str.replace(/[&<>\"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '\"') return '&quot;';
        return m;
    });
}

// Format bot messages (convert markdown-like syntax to HTML)
function formatBotMessage(text) {
    if (!text) return text;
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Lists
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
            html += trimmed ? `<p>${trimmed}</p>` : '<br>';
        }
    }
    if (inList) html += '</ul>';
    return html;
}

function displayMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${msg.sender_type}`;
    
    let contentHtml = '';
    if (msg.sender_type === 'bot') {
        contentHtml = formatBotMessage(msg.content);
    } else {
        contentHtml = escapeHTML(msg.content);
    }

    let senderName = '';
    if (msg.sender_type === 'employee') senderName = 'You';
    else if (msg.sender_type === 'hr') senderName = 'HR Support';
    else senderName = 'AI Assistant';

    div.innerHTML = `<div class="sender-name">${senderName}</div>${contentHtml}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
    document.getElementById('messages').innerHTML = '';
    messages.forEach(displayMessage);
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    
    // 1. Save to Supabase (Employee Message)
    const { error: dbError } = await supabaseClient
        .from('messages')
        .insert({
            ticket_id: currentTicketId,
            sender_type: 'employee',
            content: text
        });

    if (dbError) {
        console.error('Error saving message:', dbError);
        return;
    }

    // 2. If bot is active, call Railway API
    if (botActive) {
        // Show loading indicator
        const messagesDiv = document.getElementById('messages');
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'bot-loading';
        loadingDiv.className = 'message bot';
        loadingDiv.innerHTML = '<div class="sender-name">AI Assistant</div><div class="typing-indicator"><span></span><span></span><span></span></div>';
        messagesDiv.appendChild(loadingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        try {
            const response = await fetch(botApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: text,
                    ticket_id: currentTicketId
                })
            });
            const data = await response.json();
            // Success response will be handled by the real-time listener if the bot saves to DB,
            // but your Railway app usually responds directly or saves to DB. 
            // If it saves to DB, the listener below handles display.
        } catch (err) {
            console.error('Bot API Error:', err);
            if (document.getElementById('bot-loading')) document.getElementById('bot-loading').remove();
        }
    }
}

async function escalateToHR() {
    const { error } = await supabaseClient
        .from('tickets')
        .update({ status: 'escalated', bot_active: false })
        .eq('id', currentTicketId);

    if (error) {
        alert('Could not escalate: ' + error.message);
    } else {
        botActive = false;
        displayMessage({
            sender_type: 'bot',
            content: 'Your ticket has been escalated. A human HR representative will be with you shortly.'
        });
    }
}

async function init() {
    currentTicketId = sessionStorage.getItem('currentTicketId');
    if (!currentTicketId) {
        window.location.href = '/employee/tickets.html';
        return;
    }

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

    employeeId = emp.id;
    employeeName = emp.full_name;

    // Load initial ticket state
    const { data: ticket } = await supabaseClient
        .from('tickets')
        .select('bot_active')
        .eq('id', currentTicketId)
        .single();
    if (ticket) botActive = ticket.bot_active;

    loadMessages();

    // Listen for new messages
    supabaseClient
        .channel(`public:messages:ticket_id=eq.${currentTicketId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `ticket_id=eq.${currentTicketId}` 
        }, (payload) => {
            if (document.getElementById('bot-loading')) document.getElementById('bot-loading').remove();
            displayMessage(payload.new);
        })
        .subscribe();

    supabaseClient
        .channel(`public:tickets:id=eq.${currentTicketId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'tickets',
            filter: `id=eq.${currentTicketId}`
        }, (payload) => {
            botActive = payload.new.bot_active;
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
