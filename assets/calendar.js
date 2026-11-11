// "Add to Calendar" menu shared by the schedule and series pages.
// Pages call TopoCalendar.register(talks) after loading their data; any
// <button class="calendar-btn" data-talk-id="..."> then opens the menu.
(function () {
    'use strict';

    const talksById = new Map();

    function talkRange(talk) {
        const clock = String(talk.time || '').match(/(\d{1,2}):(\d{2})/);
        const start = clock ? new Date(`${talk.date}T${clock[1].padStart(2, '0')}:${clock[2]}:00+05:30`) : new Date(NaN);
        const end = new Date(start.getTime() + (Number(talk.durationMinutes) || 60) * 60 * 1000);
        return { start, end };
    }

    const utcStamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    function summary(talk) {
        return talk.series ? `${talk.title} - ${talk.series}` : talk.title;
    }

    function details(talk) {
        return `Speaker: ${talk.speaker || 'TBA'}\n\n${talk.abstract || ''}\n\nZoom: ${talk.zoomLink || 'TBA'}\nID: ${talk.meetingId || 'TBA'}\nPasscode: ${talk.passcode || 'TBA'}`;
    }

    function location(talk) {
        return talk.zoomLink ? `Zoom - ${talk.zoomLink}` : 'Online';
    }

    function googleUrl(talk) {
        const { start, end } = talkRange(talk);
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: summary(talk),
            dates: `${utcStamp(start)}/${utcStamp(end)}`,
            details: details(talk),
            location: location(talk)
        });
        return `https://calendar.google.com/calendar/render?${params}`;
    }

    function downloadIcs(talk) {
        const { start, end } = talkRange(talk);
        const esc = (text) => String(text || '').replace(/[\\,;]/g, '\\$&').replace(/\r?\n/g, '\\n');
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Topology and Geometry Seminar//IIIT Delhi//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${talk.id}@topogeoiiitd`,
            `DTSTAMP:${utcStamp(new Date())}`,
            `DTSTART:${utcStamp(start)}`,
            `DTEND:${utcStamp(end)}`,
            `SUMMARY:${esc(summary(talk))}`,
            `DESCRIPTION:${esc(details(talk))}`,
            `LOCATION:${esc(location(talk))}`,
            'STATUS:CONFIRMED',
            'END:VEVENT',
            'END:VCALENDAR',
            ''
        ].join('\r\n');

        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${String(talk.title).replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_') || 'talk'}.ics`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function closeMenu() {
        document.querySelector('.calendar-dropdown')?.remove();
    }

    function showOptions(talk, button) {
        closeMenu();

        const menu = document.createElement('div');
        menu.className = 'calendar-dropdown bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48';
        menu.innerHTML = `
            <button type="button" class="google-btn w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center transition-colors border-b border-gray-100">
                <i class="fab fa-google text-red-500 mr-3"></i>Google Calendar
            </button>
            <button type="button" class="ics-btn w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center transition-colors">
                <i class="fas fa-calendar-alt text-blue-500 mr-3"></i>Apple Calendar / Outlook
            </button>`;

        const card = button.closest('.bg-white');
        if (card) {
            card.style.position = 'relative';
            card.appendChild(menu);
            menu.style.cssText = `position:absolute;top:${button.offsetTop + button.offsetHeight + 5}px;right:20px`;
        } else {
            document.body.appendChild(menu);
            const rect = button.getBoundingClientRect();
            menu.style.cssText = `position:fixed;top:${rect.bottom + 5}px;left:${rect.left}px`;
        }

        menu.querySelector('.google-btn').addEventListener('click', () => {
            window.open(googleUrl(talk), '_blank', 'noopener');
            closeMenu();
        });
        menu.querySelector('.ics-btn').addEventListener('click', () => {
            downloadIcs(talk);
            closeMenu();
        });
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('.calendar-btn[data-talk-id]');
        if (button) {
            event.preventDefault();
            const talk = talksById.get(button.dataset.talkId);
            if (talk) showOptions(talk, button);
            return;
        }
        if (!event.target.closest('.calendar-dropdown')) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });

    window.TopoCalendar = {
        register(talks) {
            (talks || []).forEach((talk) => talksById.set(String(talk.id), talk));
        },
        googleUrl,
        downloadIcs
    };
})();
