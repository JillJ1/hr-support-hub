// tour.js
function startTour() {
    const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
            scrollTo: true,
            cancelIcon: {
                enabled: true
            },
            classes: 'shepherd-theme-arrows',
            modalOverlayOpeningPadding: 10,
            modalOverlayOpeningRadius: 8
        }
    });

    tour.addStep({
        id: 'welcome',
        text: 'Welcome to the HR Dashboard! This quick tour will show you the main features.',
        buttons: [
            {
                text: 'Exit',
                action: tour.cancel
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'kpis',
        text: 'These KPI cards give you a snapshot of active employees, open cases, pending tasks, and meeting resources.',
        attachTo: {
            element: '.kpi-grid',
            on: 'bottom'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'recent-cases',
        text: 'Recent cases show the latest open tickets. Click any row to view details.',
        attachTo: {
            element: '#dashboard-cases-table',
            on: 'top'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'tasks',
        text: 'Your action items – tasks that need your attention.',
        attachTo: {
            element: '#dashboard-task-list',
            on: 'top'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'sidebar',
        text: 'Use the sidebar to navigate to Employee Directory, Case Management, Tasks, Analytics, and more.',
        attachTo: {
            element: '.sidebar',
            on: 'right'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'meeting-resources',
        text: 'Click here to open the Meeting Resources modal where you can upload and view documents.',
        attachTo: {
            element: '.kpi-card:last-child',
            on: 'top'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'case-management-link',
        text: 'Go to Case Management to see all tickets and assign them.',
        attachTo: {
            element: '#nav-cases',
            on: 'right'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ],
        beforeShowPromise: function() {
            navigate('view-dashboard');
            return Promise.resolve();
        }
    });

    tour.addStep({
        id: 'analytics-link',
        text: 'Analytics tab provides insights and trends.',
        attachTo: {
            element: '#nav-analytics',
            on: 'right'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'employee-directory-link',
        text: 'Employee Directory lets you search and view employee profiles.',
        attachTo: {
            element: '#nav-emp',
            on: 'right'
        },
        buttons: [
            {
                text: 'Back',
                action: tour.back
            },
            {
                text: 'Finish',
                action: tour.complete
            }
        ]
    });

    tour.start();
}

// Optional: auto-start for first-time users
if (!localStorage.getItem('hrTourTaken')) {
    // Uncomment the next line if you want the tour to auto-start on first visit
    // setTimeout(() => startTour(), 1000);
    localStorage.setItem('hrTourTaken', 'true');
}

// Expose globally
window.startTour = startTour;