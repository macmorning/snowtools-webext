/**
 * Shared utility functions for ServiceNow Tool Belt
 * 
 * Note: Functions are declared conditionally to avoid conflicts when loaded
 * alongside content scripts that may have their own declarations.
 */

// ============================================================================
// BROWSER COMPATIBILITY
// ============================================================================

/**
 * Detects if running in Chromium-based browser (Chrome, Edge, etc.)
 */
if (typeof isChromium === 'undefined') {
    var isChromium = (typeof browser === "undefined");
}

// ============================================================================
// SECURITY & SANITIZATION
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
if (typeof escapeHtml === 'undefined') {
    var escapeHtml = function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
}

// ============================================================================
// SERVICENOW SPECIFIC
// ============================================================================

/**
 * Removes scope suffix from update set name if present
 * Example: "My Update Set [Human Resources: Core]" -> "My Update Set"
 * @param {string} updateSetName - The update set name
 * @param {string} scopeName - The scope name
 * @returns {string} Cleaned update set name
 */
if (typeof cleanUpdateSetName === 'undefined') {
    var cleanUpdateSetName = function(updateSetName, scopeName) {
        if (!updateSetName || !scopeName) return updateSetName || 'Default';
        const suffix = ` [${scopeName}]`;
        return updateSetName.endsWith(suffix) 
            ? updateSetName.slice(0, -suffix.length) 
            : updateSetName;
    };
}

/**
 * Validates if a string is a valid ServiceNow sys_id
 * @param {string} str - String to validate
 * @returns {boolean} True if valid sys_id (32 hex characters)
 */
if (typeof isValidSysId === 'undefined') {
    var isValidSysId = function(str) {
        if (!str || typeof str !== 'string') return false;
        return /^[a-fA-F0-9]{32}$/.test(str);
    };
}

/**
 * Transforms ServiceNow page title to readable format
 * @param {string} title - Original page title
 * @returns {string} Transformed title
 */
if (typeof transformTitle === 'undefined') {
    var transformTitle = function(title) {
        let splittedName = title.toString().split("|");
        if (splittedName.length === 3) {
            // this is a specific object
            return splittedName[1].toString().trim() + " - " + splittedName[0].toString().trim();
        } else if (splittedName.length === 2) {
            // this is a list
            return splittedName[0].toString().trim();
        }
        return title;
    };
}

// ============================================================================
// ARRAY & OBJECT UTILITIES
// ============================================================================

/**
 * Sorts object properties and returns as array of [key, value] pairs
 * Only own properties will be sorted.
 * Based on: https://gist.github.com/umidjons/9614157
 * @param {Object} obj - Object to sort
 * @param {boolean} isNumericSort - Whether to use numeric sort (default: false for alphabetic)
 * @returns {Array} Sorted array of [key, value] pairs in format [[key1, val1], [key2, val2], ...]
 */
if (typeof sortProperties === 'undefined') {
    var sortProperties = function(obj, isNumericSort = false) {
        var sortable = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                sortable.push([key, obj[key]]);
            }
        }
        if (isNumericSort) {
            sortable.sort((a, b) => a[1] - b[1]);
        } else {
            sortable.sort((a, b) => {
                let x = a[1].toLowerCase();
                let y = b[1].toLowerCase();
                return x < y ? -1 : x > y ? 1 : 0;
            });
        }
        return sortable;
    };
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Removes all child nodes from an element
 * @param {HTMLElement} element - Parent element
 */
if (typeof removeChildren === 'undefined') {
    var removeChildren = function(element) {
        while (element.lastChild) {
            element.removeChild(element.lastChild);
        }
    };
}

// ============================================================================
// TIME & DATE UTILITIES
// ============================================================================

/**
 * Formats timestamp as relative time (e.g., "5m ago", "2h ago")
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
if (typeof getTimeAgo === 'undefined') {
    var getTimeAgo = function(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        return Math.floor(seconds / 86400) + 'd ago';
    };
}

// ============================================================================
// THEME & UI DETECTION
// ============================================================================

/**
 * Detects if dark mode is enabled
 * @returns {boolean} True if dark mode is active
 */
if (typeof isDarkMode === 'undefined') {
    var isDarkMode = function() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    };
}

/**
 * Checks if window is small (like a popup)
 * @returns {boolean} True if window is small
 */
if (typeof isSmallWindow === 'undefined') {
    var isSmallWindow = function() {
        return window.innerWidth < 600 || window.innerHeight < 400;
    };
}
