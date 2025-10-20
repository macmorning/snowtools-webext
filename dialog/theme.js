/**
 * Theme management for ServiceNow Tool Belt
 * Handles automatic dark/light theme detection and manual theme switching
 */

const ThemeManager = {
    THEMES: {
        AUTO: "auto",
        LIGHT: "light",
        DARK: "dark"
    },

    currentTheme: "auto",

    /**
     * Initialize theme management
     */
    init() {
        this.loadThemePreference();
        this.applyTheme();
        this.setupMediaQueryListener();
    },

    /**
     * Load theme preference from storage
     */
    loadThemePreference() {
        chrome.storage.local.get("themePreference", (result) => {
            this.currentTheme = result.themePreference || this.THEMES.AUTO;
            this.applyTheme();
        });
    },

    /**
     * Save theme preference to storage
     */
    saveThemePreference(theme) {
        this.currentTheme = theme;
        chrome.storage.local.set({ "themePreference": theme });
        this.applyTheme();
    },

    /**
     * Apply the current theme to the document
     */
    applyTheme() {
        const body = document.body;

        // Remove existing theme classes
        body.classList.remove("theme-light", "theme-dark", "theme-auto");

        // Add current theme class
        body.classList.add(`theme-${this.currentTheme}`);

        // For auto theme, also add the detected theme class
        if (this.currentTheme === this.THEMES.AUTO) {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            body.classList.add(prefersDark ? "theme-dark-detected" : "theme-light-detected");
        }

        // Update icon visibility for dark theme
        this.updateIconVisibility();
    },

    /**
     * Update icon visibility for current theme
     */
    updateIconVisibility() {
        const isDark = this.getEffectiveTheme() === this.THEMES.DARK;

        // Add or remove dark-theme-icons class for better icon visibility
        if (isDark) {
            document.body.classList.add("dark-theme-icons");
        } else {
            document.body.classList.remove("dark-theme-icons");
        }
    },

    /**
     * Setup listener for system theme changes
     */
    setupMediaQueryListener() {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        mediaQuery.addEventListener("change", () => {
            if (this.currentTheme === this.THEMES.AUTO) {
                this.applyTheme();
            }
        });
    },

    /**
     * Get the effective theme (resolves auto to actual theme)
     */
    getEffectiveTheme() {
        if (this.currentTheme === this.THEMES.AUTO) {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ?
                this.THEMES.DARK : this.THEMES.LIGHT;
        }
        return this.currentTheme;
    },

    /**
     * Toggle between light and dark themes
     */
    toggleTheme() {
        const effectiveTheme = this.getEffectiveTheme();
        const newTheme = effectiveTheme === this.THEMES.DARK ?
            this.THEMES.LIGHT : this.THEMES.DARK;
        this.saveThemePreference(newTheme);
    },

    /**
     * Reset to auto theme
     */
    resetToAuto() {
        this.saveThemePreference(this.THEMES.AUTO);
    }
};

// Initialize theme management when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => ThemeManager.init());
} else {
    ThemeManager.init();
}