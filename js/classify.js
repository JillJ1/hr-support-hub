// classify.js
// Simple keyword-based classifier for ticket categories
function classifyIssue(text) {
    if (!text) return 'Other';
    const lower = text.toLowerCase();
    
    if (lower.includes('pto') || lower.includes('vacation') || lower.includes('time off') || lower.includes('accrual')) {
        return 'PTO';
    }
    if (lower.includes('benefit') || lower.includes('insurance') || lower.includes('enrollment') || lower.includes('medical')) {
        return 'Benefits';
    }
    if (lower.includes('pay') || lower.includes('salary') || lower.includes('wage') || lower.includes('compensation')) {
        return 'Payroll';
    }
    if (lower.includes('safety') || lower.includes('incident') || lower.includes('report')) {
        return 'Safety';
    }
    if (lower.includes('schedule') || lower.includes('shift') || lower.includes('hours')) {
        return 'Scheduling';
    }
    if (lower.includes('tuition') || lower.includes('reimbursement') || lower.includes('education')) {
        return 'Education';
    }
    return 'Other';
}