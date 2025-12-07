// Firefox compatibility - store on window to share with main script
window.SNOWBELT_isChromium = (typeof browser === "undefined");
window.SNOWBELT_runtimeAPI = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;

// Use window properties directly
var isChromium = window.SNOWBELT_isChromium;
var runtimeAPI = window.SNOWBELT_runtimeAPI;

/**
 * Basic content script - always loaded
 * Handles favicon updates and responds to isServiceNow checks
 * Does not include heavy features (console, info panel, searches, etc.)
 */

console.log("*SNOW TOOL BELT* Basic content script loaded");

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
    console.log("*SNOW TOOL BELT* update favicon color to: " + color);
    
    // Store the instance color for the info panel
    if (color && color !== "") {
        instanceColor = color;
        isDefaultColor = false;
        // Update info panel color if it exists
        const colorSquare = document.querySelector('.sntb-info-panel-color');
        if (colorSquare) {
            colorSquare.style.backgroundColor = color;
            colorSquare.style.boxShadow = `0 0 15px ${color}`;
            colorSquare.style.opacity = '1';
            // Remove question mark when custom color is set
            colorSquare.textContent = '';
        }
        const panel = document.querySelector('.sntb-info-panel');
        if (panel) {
            panel.style.borderColor = color;
            panel.style.boxShadow = `0 4px 20px ${color}40`;
        }
    } else {
        // No custom color set, use default teal with question mark
        isDefaultColor = true;
        const colors = getThemeColors();
        const colorSquare = document.querySelector('.sntb-info-panel-color');
        if (colorSquare) {
            colorSquare.style.backgroundColor = instanceColor;
            colorSquare.style.boxShadow = `0 0 15px ${instanceColor}`;
            colorSquare.style.opacity = '1';
            colorSquare.style.color = colors.textSecondary;
            // Add question mark for default color
            colorSquare.textContent = '?';
        }
        const panel = document.querySelector('.sntb-info-panel');
        if (panel) {
            panel.style.borderColor = instanceColor;
            panel.style.boxShadow = `0 4px 20px ${instanceColor}40`;
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
    let context = canvas.getContext("2d");

    let img = document.createElement("img");
    img.onload = function (ev) {
        // Draw the original image
        context.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);

        // Get image data to analyze colors
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
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

        console.log("*SNOW TOOL BELT* Dominant color found:", dominantColor, "with", maxCount, "pixels");

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
                context.putImageData(imageData, 0, 0);
            }
        } else {
            // Fallback to the old method if no dominant color found
            console.log("*SNOW TOOL BELT* No dominant color found, using fallback method");
            context.globalCompositeOperation = "source-in";
            context.fillStyle = color;
            context.fillRect(0, 0, 256, 256);
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
        console.log("*SNOW TOOL BELT* Basic script - isServiceNow response:", response);
        
        if (runtimeAPI.lastError) {
            console.error("*SNOW TOOL BELT* Basic script - Runtime error:", runtimeAPI.lastError);
            return;
        }
        
        if (response && response.isServiceNow && response.favIconColor) {
            console.log("*SNOW TOOL BELT* Basic script - Updating favicon with color:", response.favIconColor);
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

    // is this a workspace?
    if (document.querySelector("sn-workspace-layout") || document.querySelector("sn-canvas-root")) {
        response.type = "workspace";
        try {
            // This is a very workspace DOM dependent implementation; need to find a better way of doing this 
            let root = document.querySelector("sn-workspace-tabs").shadowRoot.querySelector("chrome-tabs").shadowRoot.querySelectorAll("chrome-one-tab");
            root.forEach((elem) => {
                response.tabs.push(elem.shadowRoot.querySelector("li a span:nth-of-type(2)").innerText);
            });
        } catch (e) {
            // console.log("*SNOW TOOL BELT* unable to find workspace tabs: " + e);
        }
    } else if (document.querySelector("div.sp-page-root")) {
        response.type = "portal";
    } else if (document.querySelector("div.status-bar-main")) {
        response.type = "app studio";
        response.details = document.querySelector("div.app-info").innerText;
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
