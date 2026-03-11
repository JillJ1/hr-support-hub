// employee-chat.js

// ==================== GLOBAL CONFIGURATION & STATE ====================
const APP_CONFIG = {
    supabaseUrl: 'https://sbaslcgmbwfnqbwtzsil.supabase.co',
    vercelUrl: 'https://hr-support-hub.vercel.app', 
    botApiUrl: 'https://hr-chatbot-production.up.railway.app/chat'
};

let currentTicketId = null;
let employeeId = null;
let employeeName = '';
let botActive = true;
let typingIndicatorId = 'bot-typing-indicator';

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

function formatBotMessage(text) {
    if (!text) return text;
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const lines = text.split('\n');
    let inList = false;
    let html = '';
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += '<li>' + trimmed.substring(2) + '</li>';
        } else {
            if (inList) { html += '</ul>'; inList = false; }
            html += trimmed ? `<p>${trimmed}</p>` : '<br>';
        }
    }
    if (inList) html += '</ul>';
    return html;
}

// ==================== UI HELPERS (TYPING INDICATOR) ====================
function showTypingIndicator() {
    if (document.getElementById(typingIndicatorId)) return;
    
    const messagesDiv = document.getElementById('messages');
    const indicatorDiv = document.createElement('div');
    indicatorDiv.id = typingIndicatorId;
    indicatorDiv.className = 'message bot typing-indicator';
    indicatorDiv.innerHTML = `<span></span><span></span><span></span>`;
    
    messagesDiv.appendChild(indicatorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById(typingIndicatorId);
    if (indicator) {
        indicator.remove();
    }
}

// ==================== CHAT LOGIC ====================
function displayMessage(msg) {
    removeTypingIndicator(); // Always remove typing indicator before appending new message
    
    const messagesDiv = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${msg.sender_type}`;
    
    let contentHtml = msg.sender_type === 'bot' ? formatBotMessage(msg.content) : escapeHTML(msg.content);
    
    let senderName = '';
    if (msg.sender_type === 'employee') senderName = 'You';
    else if (msg.sender_type === 'hr') senderName = 'HR Support';
    else senderName = 'AI Assistant';

    div.innerHTML = `<div class="sender-name">${senderName}</div>${contentHtml}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function loadMessages() {
    try {
        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('ticket_id', currentTicketId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        document.getElementById('messages').innerHTML = '';
        messages.forEach(displayMessage);
    } catch (err) {
        console.error('Error loading messages:', err);
        document.getElementById('messages').innerHTML = '<div style="text-align:center; color:#b71c1c; padding:20px;">Error loading conversation history.</div>';
    }
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const btn = document.getElementById('send-btn');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.disabled = true;
    btn.disabled = true;

    try {
        // Save employee message to database
        const { error: dbError } = await supabaseClient
            .from('messages')
            .insert({
                ticket_id: currentTicketId,
                sender_type: 'employee',
                content: text
            });

        if (dbError) throw dbError;

        // If bot is active, show typing indicator and call Railway API
        if (botActive) {
            showTypingIndicator();
            
            // AbortController to handle timeouts (15 seconds)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(APP_CONFIG.botApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: text, ticket_id: currentTicketId }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`Bot API returned ${response.status}`);
            } catch (botErr) {
                console.error("Bot API Error:", botErr);
                removeTypingIndicator();
                
                if (botErr.name === 'AbortError') {
                    displayMessage({
                        sender_type: 'bot',
                        content: 'I am experiencing a slight delay connecting to the knowledge base. Please hold on or escalate to HR if urgent.'
                    });
                } else {
                    displayMessage({
                        sender_type: 'bot',
                        content: 'I encountered an error processing your request. Please try asking again or escalate to HR.'
                    });
                }
            }
        }
    } catch (err) {
        console.error('Error sending message:', err);
        alert('Could not send message: ' + err.message);
    } finally {
        input.disabled = false;
        btn.disabled = false;
        input.focus();
    }
}

async function escalateToHR() {
    const btn = document.getElementById('escalate-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Escalating...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('tickets')
            .update({ status: 'escalated', bot_active: false })
            .eq('id', currentTicketId);

        if (error) throw error;

        // Visual update (Supabase Realtime will trigger the rest)
        botActive = false;
        displayMessage({
            sender_type: 'bot',
            content: 'Your ticket has been escalated. A human HR representative will be with you shortly.'
        });
        
        btn.style.display = 'none'; 
    } catch (err) {
        console.error('Error escalating:', err);
        alert('Could not escalate ticket: ' + err.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ==================== INITIALIZATION ====================
async function init() {
    currentTicketId = sessionStorage.getItem('currentTicketId');
    if (!currentTicketId) {
        window.location.href = '/employee/tickets.html';
        return;
    }

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
        alert('Access denied.');
        window.location.href = '/';
        return;
    }
    
    employeeId = emp.id;
    employeeName = emp.full_name;

    // Fetch initial ticket state
    const { data: ticket } = await supabaseClient
        .from('tickets')
        .select('bot_active, status')
        .eq('id', currentTicketId)
        .single();
        
    if (ticket) {
        botActive = ticket.bot_active;
        if (ticket.status === 'closed') {
            document.getElementById('input-area').style.display = 'none';
            document.getElementById('escalate-btn').style.display = 'none';
        } else if (!botActive || ticket.status === 'escalated') {
            document.getElementById('escalate-btn').style.display = 'none';
        }
    }

    await loadMessages();

    // Set up Realtime Subscriptions
    supabaseClient
        .channel(`messages-${currentTicketId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `ticket_id=eq.${currentTicketId}`
        }, (payload) => {
            // Prevent duplicate display for messages the user just sent themselves
            // The displayMessage is already called on optimistic UI update if needed,
            // but in this setup, it purely relies on the broadcast which is safer.
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
            
            // HR took over
            if (botActive && !newBotActive) {
                displayMessage({
                    sender_type: 'bot',
                    content: 'HR has joined the conversation. They will respond to you directly.'
                });
                document.getElementById('escalate-btn').style.display = 'none';
            }
            
            // Ticket was closed
            if (newStatus === 'closed') {
                document.querySelector('.input-area').style.display = 'none';
                document.getElementById('escalate-btn').style.display = 'none';
                displayMessage({
                    sender_type: 'bot',
                    content: 'This ticket has been marked as resolved.'
                });
            }
            
            botActive = newBotActive;
        })
        .subscribe();

    // Event Listeners
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = '/employee/tickets.html';
    });

    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    const escalateBtn = document.getElementById('escalate-btn');
    if (escalateBtn) escalateBtn.addEventListener('click', escalateToHR);

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '/';
    });
}

init();
