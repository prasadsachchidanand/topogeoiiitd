(function () {
    'use strict';

    const storageKey = 'topogeoiiitd-theme';
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');

    function savedTheme() {
        try {
            const value = localStorage.getItem(storageKey);
            return value === 'dark' || value === 'light' ? value : null;
        } catch (_) {
            return null;
        }
    }

    function updateControls(theme) {
        document.querySelectorAll('.theme-toggle').forEach((button) => {
            const dark = theme === 'dark';
            button.setAttribute('aria-pressed', String(dark));
            button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
            button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';

            const icon = button.querySelector('.theme-toggle-icon');
            if (icon) {
                icon.classList.toggle('fa-sun', dark);
                icon.classList.toggle('fa-moon', !dark);
            }

            const label = button.querySelector('.theme-toggle-label');
            if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
        });
    }

    function applyTheme(theme, remember) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.dataset.theme = theme;
        updateControls(theme);
        if (remember) {
            try {
                localStorage.setItem(storageKey, theme);
            } catch (_) {
                // The selected theme still applies when storage is unavailable.
            }
        }
    }

    const initialTheme = savedTheme() || (systemPreference.matches ? 'dark' : 'light');
    applyTheme(initialTheme, false);

    document.addEventListener('click', (event) => {
        const button = event.target.closest('.theme-toggle');
        if (!button) return;
        const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(nextTheme, true);
    });

    const observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) =>
            node.nodeType === 1 && (node.matches?.('.theme-toggle') || node.querySelector?.('.theme-toggle'))))) {
            updateControls(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    systemPreference.addEventListener('change', (event) => {
        if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
    });
})();
