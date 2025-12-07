const chromeURL = "https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln";
const edgeURL = "https://microsoftedge.microsoft.com/addons/detail/servicenow-tool-belt/ofefboehibiaekjaiaiacalcdeonfbil";
const mozURL = "https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/";
const gitURL = "https://github.com/macmorning/snowtools-webext";


// Browser detection now comes from shared/utils.js
// Detect specific browser (Chrome vs Edge)
const isEdge = isChromium && navigator.userAgent.includes('Edg/');
const isChrome = isChromium && !isEdge;

const shortcutsURL = (isChromium ? "chrome://extensions/shortcuts" : "Firefox shortcuts settings");

/**
 * Opens the shortcuts configuration page for the current browser
 */
const openShortcutsPage = () => {
    if (isChromium) {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    } else {
        // Firefox: Use the dedicated shortcuts API if available
        if (typeof browser !== "undefined" && browser.commands && browser.commands.openShortcutSettings) {
            try {
                browser.commands.openShortcutSettings();
            } catch (error) {
                console.error("Could not open shortcuts settings:", error);
                // Fallback: show instructions to user
                alert("To configure keyboard shortcuts in Firefox:\n1. Type 'about:addons' in the address bar\n2. Click on the gear icon\n3. Select 'Manage Extension Shortcuts'");
            }
        } else {
            // Fallback for older Firefox versions or if API is not available
            alert("To configure keyboard shortcuts in Firefox:\n1. Type 'about:addons' in the address bar\n2. Click on the gear icon\n3. Select 'Manage Extension Shortcuts'");
        }
    }
};

let tips = [];

// Initialize context properties when context is available
// This will be called from snowbelt.js after context is defined
const initializeTipsContext = () => {
    if (typeof context !== 'undefined') {
        context.lastTipNumber = -1;
        
        // Get version from manifest
        try {
            const manifest = chrome.runtime.getManifest();
            context.currentVersion = manifest.version;
            const helpElement = document.getElementById("help");
            if (helpElement) {
                helpElement.title = "current version: " + context.currentVersion;
            }
        } catch (e) {
            // Fallback if manifest access fails
            context.currentVersion = "unknown";
            console.error("Could not get version from manifest:", e);
        }
    }
};

let commandsTip = "";



/**
 * Returns the list of commands
 */
const getCommands = () => {
    if (context && context.commands) {
        let result = 'The following commands are currently <a href="#" id="shortcutsLink">configured for your browser</a>:<ul>';
        context.commands.forEach((command) => {
            result += '<li>' + (command.name === '_execute_action' ? 'Open tools popup' : command.description) + ': <b>' + command.shortcut + '</b></li>';
        });
        result += "</ul>";
        return result;
    }
}

const nextTip = async () => {
    if (tips.length === 0) {
        await loadTipsData();
    }

    let number;
    number = context.lastTipNumber + 1;
    if (number >= tips.length) { number = 0; }
    context.lastTipNumber = number;
    document.getElementById("tip").classList.add("fade");
    window.setTimeout(() => {
        document.getElementById("tip").innerHTML = tips[number];
        document.getElementById("tip").classList.remove("fade");
        document.getElementById("tipsContainer").classList.remove("fade");
    }, 300);
    return true;
}
/**
 * Loads tips data from external JSON file
 */
const loadTipsData = async () => {
    try {
        const response = await fetch(chrome.runtime.getURL('dialog/tips.json'));
        const tipsData = await response.json();

        // Process tips with dynamic content
        tips = tipsData.map(tip => {
            // Determine current and other browser info
            let currentBrowserName, currentBrowserURL, otherBrowserName, otherBrowserURL;
            
            if (isEdge) {
                currentBrowserName = "Edge";
                currentBrowserURL = edgeURL;
                otherBrowserName = "Chrome";
                otherBrowserURL = chromeURL;
            } else if (isChrome) {
                currentBrowserName = "Chrome";
                currentBrowserURL = chromeURL;
                otherBrowserName = "Edge";
                otherBrowserURL = edgeURL;
            } else {
                // Firefox
                currentBrowserName = "Firefox";
                currentBrowserURL = mozURL;
                otherBrowserName = "Chrome";
                otherBrowserURL = chromeURL;
            }
            
            return tip
                .replace('{otherBrowser}', otherBrowserName)
                .replace('{currentBrowserURL}', currentBrowserURL)
                .replace('{otherBrowserURL}', otherBrowserURL)
                .replace('{gitURL}', gitURL)
                .replace('{commands}', getCommands() || 'Commands not available');
        });
    } catch (error) {
        console.error('Failed to load tips data:', error);
        // Fallback tips
        tips = [
            "Lost your settings?<br/>Go to the options pages and make sure you are using the storage area where you saved them.",
            "You can post issues and enhancement requests on <a target=\"_blank\" href=\"" + gitURL + "\">github</a>.",
            "This extension doesn't collect or upload any data."
        ];
    }
};

const getTip = async () => {
    if (tips.length === 0) {
        await loadTipsData();
    }

    let number;
    number = Math.floor((Math.random() * tips.length));

    context.lastTipNumber = number;
    document.getElementById("tip").innerHTML = tips[number];
    return true;
};

// If there is a "shortcuts" element, like on the options page, add the shortcuts list
if (document.querySelector("span#shortcuts")) {
    chrome.commands.getAll((result) => {
        context.commands = result;
        document.querySelector("span#shortcuts").insertAdjacentHTML("afterend", getCommands());
    });
}

// Add event listener for shortcuts links (using event delegation for dynamic content)
document.addEventListener('click', function (e) {
    if (e.target.id === 'shortcutsLink' || e.target.classList.contains('shortcuts-config-link')) {
        e.preventDefault();
        openShortcutsPage();
    }
});