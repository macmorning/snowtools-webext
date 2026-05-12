// Browser detection — duplicated from shared/utils.js since basic script loads before it
const _getPlatform = () => {
    const { userAgent } = navigator;
    if (userAgent.includes("Firefox")) return "Firefox";
    else if ("brave" in navigator) return "Brave";
    else if (userAgent.includes("Edg/")) return "Edge";
    else if (userAgent.includes("OPR")) return "Opera";
    return "Chrome";
};
window.SNOWBELT_isChromium = ["Chrome", "Edge", "Brave"].includes(_getPlatform());
window.SNOWBELT_runtimeAPI = window.SNOWBELT_isChromium ? chrome.runtime : browser.runtime;

// Use window properties directly
var isChromium = window.SNOWBELT_isChromium;
var runtimeAPI = window.SNOWBELT_runtimeAPI;

/**
 * Basic content script - always loaded
 * Handles favicon updates and responds to isServiceNow checks
 * Does not include heavy features (console, info panel, searches, etc.)
 */

console.log("*SNOW TOOL BELT* Basic content script loaded");

// Guard against double-injection (e.g. Firefox static manifest + dynamic registration both firing)
// Uses the same window-based pattern as isChromium/runtimeAPI above
if (typeof window.SNOWBELT_context === 'undefined') {
    window.SNOWBELT_context = {
        g_ck: "",
        debugMode: false
    };
}
var context = window.SNOWBELT_context;

/**
 * Debug logging function - only logs when debug mode is enabled
 * @param {...any} args - Arguments to log
 */
if (typeof window.SNOWBELT_debugLog === 'undefined') {
    window.SNOWBELT_debugLog = function(...args) {
        if (window.SNOWBELT_context && window.SNOWBELT_context.debugMode) {
            console.log(...args);
        }
    };
}
var debugLog = window.SNOWBELT_debugLog;


/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string (e.g., "#ff0000")
 * @returns {Object|null} RGB object with r, g, b properties or null if invalid
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

/**
 * Updates the favicon with a colored border
 * @param {string} color - The color to use for the favicon border
 */
function updateFavicon(color) {
    debugLog("*SNOW TOOL BELT* update favicon color to: " + color);
    
    // Store the instance color for the info panel
    if (color && color !== "") {
        instanceColor = color;
        isDefaultColor = false;
        // Update info panel border color if it exists
        const panel = document.querySelector('.sntb-info-panel');
        if (panel) {
            panel.style.borderColor = color;
            panel.style.boxShadow = `2px 0 12px ${color}40`;
            // Update icon colors
            const icons = panel.querySelectorAll('.sntb-info-panel-position, .sntb-info-panel-close');
            icons.forEach(icon => { icon.style.color = color; });
        }
    } else {
        // No custom color set, use default teal
        isDefaultColor = true;
        const panel = document.querySelector('.sntb-info-panel');
        if (panel) {
            panel.style.borderColor = instanceColor;
            panel.style.boxShadow = `2px 0 12px ${instanceColor}40`;
            const icons = panel.querySelectorAll('.sntb-info-panel-position, .sntb-info-panel-close');
            icons.forEach(icon => { icon.style.color = instanceColor; });
        }
    }
    
    if (color === undefined || color === "") {
        return true;
    }
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "shortcut icon");
        document.head.appendChild(link);
    }
    let faviconUrl = link.href || window.location.origin + "/favicon.ico";

    let canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    let canvasContext = canvas.getContext("2d");

    let img = document.createElement("img");
    img.onload = function (ev) {
        // Draw the original image
        canvasContext.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);

        // Get image data to analyze colors
        const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Find the most used non-transparent color
        const colorCounts = {};
        let maxCount = 0;
        let dominantColor = null;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip transparent pixels
            if (a < 128) continue;

            // Create color key (ignore very light colors like white/near-white)
            const colorKey = `${r},${g},${b}`;
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;

            // Skip very light colors (brightness > 240) as they're likely background
            if (brightness > 240) continue;

            colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;

            if (colorCounts[colorKey] > maxCount) {
                maxCount = colorCounts[colorKey];
                dominantColor = { r, g, b };
            }
        }

        debugLog("*SNOW TOOL BELT* Dominant color found:", dominantColor, "with", maxCount, "pixels");

        if (dominantColor) {
            // Replace the dominant color with the instance color
            const targetColor = hexToRgb(color);
            if (targetColor) {
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Skip transparent pixels
                    if (a < 128) continue;

                    // Check if this pixel matches the dominant color (with some tolerance)
                    const colorDistance = Math.sqrt(
                        Math.pow(r - dominantColor.r, 2) +
                        Math.pow(g - dominantColor.g, 2) +
                        Math.pow(b - dominantColor.b, 2)
                    );

                    // Replace colors that are close to the dominant color
                    if (colorDistance < 50) {
                        data[i] = targetColor.r;
                        data[i + 1] = targetColor.g;
                        data[i + 2] = targetColor.b;
                        // Keep original alpha
                    }
                }

                // Put the modified image data back
                canvasContext.putImageData(imageData, 0, 0);
            }
        } else {
            // Fallback to the old method if no dominant color found
            debugLog("*SNOW TOOL BELT* No dominant color found, using fallback method");
            canvasContext.globalCompositeOperation = "source-in";
            canvasContext.fillStyle = color;
            canvasContext.fillRect(0, 0, 256, 256);
        }

        link.href = canvas.toDataURL();
        link.type = "image/x-icon";
    };
    img.src = faviconUrl;
}

/**
 * Initialize basic script - check if ServiceNow and update favicon
 */
function initBasicScript() {
    // Ask background script if this is a ServiceNow instance
    runtimeAPI.sendMessage({
        "command": "isServiceNow",
        "hostname": window.location.hostname,
        "url": window.location.href
    }, function (response) {
        debugLog("*SNOW TOOL BELT* Basic script - isServiceNow response:", response);
        
        if (runtimeAPI.lastError) {
            console.error("*SNOW TOOL BELT* Basic script - Runtime error:", runtimeAPI.lastError);
            return;
        }
        
        if (response && response.isServiceNow && response.favIconColor) {
            debugLog("*SNOW TOOL BELT* Basic script - Updating favicon with color:", response.favIconColor);
            updateFavicon(response.favIconColor);
        }
    });
}

/**
 * Gets informations about current tab
 * @returns {Object} containing informations about current tab
 */
function getTabInfo() {
    let response = {
        "type": "other", // workspace / ...
        "details": "", // app name / ...
        "tabs": []
    };


    if (document.querySelector("div.sp-page-root")) {
        response.type = "portal";
    } else if (document.querySelector("div.status-bar-main")) {
        response.type = "app studio";
        const appInfo = document.querySelector("div.app-info");
        if (appInfo) {
            response.details = appInfo.innerText;
        }
    }
    
    return response;
}

/**
 * Message listener for basic commands
 */
runtimeAPI.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "updateFavicon" && request.color) {
        updateFavicon(request.color);
        sendResponse({ success: true });
        return true;
    }
    
    if (request.command === "ping") {
        sendResponse({ success: true });
        return true;
    }
    
    if (request.command === "requestStateReport") {
        /**
         * Request to report current tab state (used after service worker restart)
         */
        debugLog("*SNOW TOOL BELT* Received request to report state");
        const tabInfo = getTabInfo();
        runtimeAPI.sendMessage({
            command: "reportTabState",
            tabInfo: tabInfo
        });
        sendResponse({ status: "reported" });
    }
    
    if (request.command === "getTabInfo") {
        /**
         *  retrieve content informations
         */
        let response = getTabInfo();
        sendResponse(response);
    } 
    return false;
});

// Initialize on load
initBasicScript();

console.log("*SNOW TOOL BELT* Basic content script initialized");
