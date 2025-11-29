// Firefox compatibility
const isChromium = (typeof browser === "undefined");
const chromeAPI = isChromium ? chrome : browser;

/**
 * Cross-browser content script registration
 * @param {string} filter Domain filter for content script registration
 */
const registerContentScript = async (filter) => {
    const scriptId = `snowbelt-${filter.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const matches = [`https://${filter}/*`, `https://*.${filter}/*`];

    if (isChromium && chrome.scripting && chrome.scripting.registerContentScripts) {
        // Modern Chrome/Edge with Manifest V3
        try {
            await chrome.scripting.registerContentScripts([{
                id: scriptId,
                matches: matches,
                js: ["content-script/purify.js", "content-script/snowbelt-cs.js"],
                runAt: "document_end"
            }]);
            console.log("*SNOW TOOL BELT BG* Registered content script for:", filter);
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register content script for:", filter, error);
        }
    } else if (typeof browser !== "undefined" && browser.contentScripts) {
        // Firefox with browser.contentScripts API
        try {
            await browser.contentScripts.register({
                matches: matches,
                js: [{ file: "content-script/purify.js" }, { file: "content-script/snowbelt-cs.js" }],
                runAt: "document_end"
            });
            console.log("*SNOW TOOL BELT BG* Registered content script for:", filter);
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register content script for:", filter, error);
        }
    } else {
        console.warn("*SNOW TOOL BELT BG* Content script registration not supported");
    }
};

const context = {
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1": "instance 1 name", "url2": "instance 2 name", ...}
    instanceOptions: {}, // { "url1": { "checkState": boolean, "colorSet": boolean, "color": color, "hidden": boolean}, "url2": ...}

    useSync: false,
    storageArea: {}
};

/**
 * Tab state cache - Phase 1 implementation
 * Stores tab information reported by content scripts
 */
const tabStateCache = {
    tabs: {}, // { tabId: { type, details, updateSet, timestamp, instance, url } }
    updateSets: {} // { instance: { windowId: updateSetInfo } }
};

/**
 * Saves context into storage sync area
 */
function saveContext() {
    context.storageArea.set({
        "knownInstances": JSON.stringify(context.knownInstances),
        "instanceOptions": JSON.stringify(context.instanceOptions),
        "urlFilters": context.urlFilters
    }, function () {
        console.log("*SNOW TOOL BELT BG* Options saved!");
    });
}

/**
 * Retrieves saved options
 */
const getOptions = () => {
    chromeAPI.storage.local.get("useSync", (result1) => {
        context.useSync = result1.useSync;
        context.storageArea = (context.useSync ? chromeAPI.storage.sync : chromeAPI.storage.local);
        context.storageArea.get(["extraDomains", "urlFilters", "knownInstances", "instanceOptions"], (result) => {
            if (Object.keys(result).length === 0) {
                // Nothing is stored yet
                context.urlFilters = "service-now.com;";
                context.knownInstances = "{}";
                context.instanceOptions = "{}";
            } else {
                // remove http:// and https:// from filter string
                const regex = /http[s]{0,1}:\/\//gm;
                const regex2 = /\/[^;]*/gm;
                context.urlFilters = (result.urlFilters || "service-now.com;").replace(regex, "").replace(regex2, "");
                context.knownInstances = result.knownInstances;
                context.instanceOptions = result.instanceOptions;
            }


            context.urlFiltersArr = context.urlFilters.split(";");
            console.log("*SNOW TOOL BELT BG* urlFilters:", context.urlFilters);
            console.log("*SNOW TOOL BELT BG* urlFiltersArr after split:", context.urlFiltersArr);
            context.extraDomains = (result.extraDomains === "true" || result.extraDomains === true);
            if (context.extraDomains && context.urlFiltersArr.length) {
                context.urlFiltersArr.forEach(filter => {
                    if (filter && filter.length) {
                        try {
                            // Use modern chrome.scripting API with Firefox compatibility
                            registerContentScript(filter);
                        } catch (e) {
                            console.error("*SNOW TOOL BELT BG* Could not register content script for > " + filter);
                            console.error(e);
                        }
                    }
                });
            }
            try {
                context.knownInstances = JSON.parse(context.knownInstances);
            } catch (e) {
                console.log(e);
                context.knownInstances = {};
            }
            
            // Phase 1: Load tab state cache from storage
            loadTabStateCache();
            
            // Request fresh state from all tabs after a short delay to allow cache to load
            setTimeout(() => {
                requestFreshStateFromAllTabs();
            }, 500);
            
            try {
                context.instanceOptions = JSON.parse(context.instanceOptions);
            } catch (e) {
                console.log(e);
                context.instanceOptions = {};
            }
            // update tab icons
            chrome.tabs.query({}, (tabs) => {
                for (var i = 0; i < tabs.length; ++i) {
                    try {
                        if (!tabs[i].url || (!tabs[i].url.startsWith('http://') && !tabs[i].url.startsWith('https://'))) {
                            continue;
                        }
                        let instance = new URL(tabs[i].url).hostname;
                        if (context.instanceOptions[instance] !== undefined && context.instanceOptions[instance]["color"]) {
                            chrome.tabs.sendMessage(tabs[i].id, { "command": "updateFavicon", "color": context.instanceOptions[instance]["color"] }, (response) => {
                                // Handle the case where content script is not loaded
                                if (chrome.runtime.lastError) {
                                    // Silently ignore - content script may not be loaded yet
                                    console.log("*SNOW TOOL BELT BG* Content script not ready for favicon update:", chrome.runtime.lastError.message);
                                }
                            });
                        }
                    } catch (error) {
                        // Invalid URL, skip this tab
                        console.log("*SNOW TOOL BELT BG* Invalid URL in tab update:", tabs[i].url, error.message);
                    }
                }
            });
        });
    });
};

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
function tabUpdated(tabId, changeInfo, tab) {
    // Check if tab.url exists and is a valid HTTP/HTTPS URL
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
        return false;
    }

    let url;
    let instance;

    try {
        url = new URL(tab.url);
        instance = url.hostname;
    } catch (error) {
        // Invalid URL, skip processing
        console.log("*SNOW TOOL BELT BG* Invalid URL in tabUpdated:", tab.url, error.message);
        return false;
    }

    if (context.instanceOptions[instance] === undefined) {
        return false;
    }
}

/**
 * Moves tab into a navigation frame
 * @param {String} tab The tab that needs to be poped in
 */
const popIn = (tabid) => {
    tabid = parseInt(tabid);
    chromeAPI.tabs.get(tabid, (tab) => {
        try {
            if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
                console.log("*SNOW TOOL BELT BG* Invalid URL for popIn:", tab.url);
                return;
            }
            let url = new URL(tab.url);
            if (url.pathname !== "/nav_to.do") {
                // Remove leading slash from pathname before encoding
                let pathWithoutSlash = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
                let newUrl = "https://" + url.host + "/now/nav/ui/classic/params/target/" + encodeURIComponent(pathWithoutSlash + url.search);
                chromeAPI.tabs.update(tab.id, { url: newUrl });
            } else {
                displayMessage("Already in a frame");
            }
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Error in popIn:", error.message);
        }
    });
};

/**
 * Phase 1: Tab State Cache Management Functions
 */

/**
 * Load tab state cache from storage
 */
function loadTabStateCache() {
    chromeAPI.storage.session.get(['tabStateCache'], (result) => {
        if (result.tabStateCache) {
            Object.assign(tabStateCache, result.tabStateCache);
            console.log("*SNOW TOOL BELT BG* Loaded tab state cache with", Object.keys(tabStateCache.tabs).length, "tabs");
            cleanStaleEntries();
        } else {
            console.log("*SNOW TOOL BELT BG* No cached tab state found, starting fresh");
        }
    });
}

/**
 * Request fresh state from all ServiceNow tabs after service worker restart
 */
function requestFreshStateFromAllTabs() {
    console.log("*SNOW TOOL BELT BG* Requesting fresh state from all tabs");
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && (tab.url.includes('service-now.com') || tab.url.includes('.service-now.com'))) {
                // Send message to content script to report its state
                chrome.tabs.sendMessage(tab.id, { "command": "requestStateReport" }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Content script not loaded or not responsive
                        console.log("*SNOW TOOL BELT BG* Tab", tab.id, "not responsive:", chrome.runtime.lastError.message);
                    }
                });
            }
        });
    });
}

/**
 * Update tab state cache with information from content script
 * @param {number} tabId - The tab ID
 * @param {string} url - The tab URL
 * @param {Object} tabInfo - Tab information from content script
 */
function updateTabStateCache(tabId, url, tabInfo) {
    try {
        const urlObj = new URL(url);
        const instance = urlObj.hostname;
        
        // Update tab cache
        tabStateCache.tabs[tabId] = {
            ...tabInfo,
            instance: instance,
            url: url,
            lastUpdated: Date.now()
        };
        
        console.log("*SNOW TOOL BELT BG* Updated cache for tab", tabId, "instance:", instance, "type:", tabInfo.type);
        
        // Update update set cache if provided
        if (tabInfo.updateSet && tabInfo.updateSet.current) {
            if (!tabStateCache.updateSets[instance]) {
                tabStateCache.updateSets[instance] = {};
            }
            tabStateCache.updateSets[instance] = tabInfo.updateSet;
            console.log("*SNOW TOOL BELT BG* Updated update set cache for", instance, ":", tabInfo.updateSet.current.name);
        }
        
        // Persist to storage (debounced)
        debouncedSaveCache();
        
        // Phase 3: Notify popup if open
        notifyPopupOfUpdate(tabId, tabStateCache.tabs[tabId]);
        
    } catch (error) {
        console.error("*SNOW TOOL BELT BG* Error updating tab state cache:", error);
    }
}

/**
 * Phase 3: Notify popup of tab state update
 * @param {number} tabId - The tab ID that was updated
 * @param {Object} tabState - The updated tab state
 */
function notifyPopupOfUpdate(tabId, tabState) {
    // Try to send message to popup (will fail silently if popup not open)
    chromeAPI.runtime.sendMessage({
        command: "tabStateUpdated",
        tabId: tabId,
        tabState: tabState
    }, () => {
        // Ignore errors if popup is not open
        if (chromeAPI.runtime.lastError) {
            // Popup not open, that's fine
        }
    });
}

/**
 * Clean up stale entries (tabs that no longer exist)
 */
function cleanStaleEntries() {
    chromeAPI.tabs.query({}, (tabs) => {
        const activeTabIds = new Set(tabs.map(t => t.id));
        let removedCount = 0;
        
        // Remove entries for closed tabs
        Object.keys(tabStateCache.tabs).forEach(tabId => {
            if (!activeTabIds.has(parseInt(tabId))) {
                delete tabStateCache.tabs[tabId];
                removedCount++;
            }
        });
        
        if (removedCount > 0) {
            console.log("*SNOW TOOL BELT BG* Cleaned", removedCount, "stale tab entries from cache");
            debouncedSaveCache();
        }
    });
}

/**
 * Debounced save to storage to avoid excessive writes
 */
let saveTimeout;
function debouncedSaveCache() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        chromeAPI.storage.session.set({ tabStateCache: tabStateCache }, () => {
            console.log("*SNOW TOOL BELT BG* Saved tab state cache to session storage");
        });
    }, 1000);
}

/**
 * Get tab state from cache
 * @param {number} tabId - The tab ID
 * @returns {Object|null} Tab state or null if not found
 */
function getTabStateFromCache(tabId) {
    return tabStateCache.tabs[tabId] || null;
}

/**
 * Get all tab states from cache
 * @returns {Object} Complete cache object
 */
function getAllTabStatesFromCache() {
    return {
        tabs: { ...tabStateCache.tabs },
        updateSets: { ...tabStateCache.updateSets }
    };
}

/**
 * Opens a new window to show versions of the current object
 * @param {Object} tab The tab from which the command was sent
 */
const openVersions = (tab) => {
    try {
        if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
            console.log("*SNOW TOOL BELT BG* Invalid URL for openVersions:", tab.url);
            return false;
        }

        let url = new URL(tab.url);

        // Extract sys_id from URL using regex to find first 32-character alphanumeric lowercase string
        // Look for patterns after "=" or "%3D" (URL encoded "=")
        const sysIdRegex = /(?:=|%3D)([a-f0-9]{32})(?:[^a-f0-9]|$)/i;
        const match = tab.url.match(sysIdRegex);

        if (!match || !match[1]) {
            console.log("*SNOW TOOL BELT BG* No sys_id found in URL:", tab.url);
            return false;
        }

        const sysId = match[1].toLowerCase();
        console.log("*SNOW TOOL BELT BG* Found sys_id:", sysId);

        // Use existing logic to open the popup window
        let createData = {
            type: "popup",
            url: "https://" + url.host + "/sys_update_version_list.do?sysparm_query=nameCONTAINS" + sysId+"^ORDERBYDESCsys_recorded_at",
            width: 1200,
            height: 500
        };

        chrome.windows.create(createData);
        return true;

    } catch (error) {
        console.error("*SNOW TOOL BELT BG* Error in openVersions:", error.message);
        return false;
    }
}

/**
 * Opens a new background script window on target instance
 * @param {Object} tab The tab from which the command was sent
 */
const openBackgroundScriptWindow = (tab) => {
    try {
        if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
            console.log("*SNOW TOOL BELT BG* Invalid URL for openBackgroundScriptWindow:", tab.url);
            return;
        }
        let url = new URL(tab.url);
        let createData = {
            type: "popup",
            url: "https://" + url.host + "/sys.scripts.modern.do",
            width: 700,
            height: 850
        };
        let creating = chrome.windows.create(createData);
    } catch (error) {
        console.error("*SNOW TOOL BELT BG* Error in openBackgroundScriptWindow:", error.message);
    }
}

/**
 * Reloads all tabs for a specific instance
 * @param {string} instance The instance hostname
 * @param {number} windowId Optional window ID to filter tabs
 * @returns {Promise} Promise that resolves with result object
 */
const reloadInstanceTabs = async (instance, windowId) => {
    try {
        console.log("*SNOW TOOL BELT BG* Reloading tabs for instance:", instance, "windowId:", windowId);
        
        // Query for all tabs matching the instance
        const queryInfo = { url: `*://${instance}/*` };
        if (windowId !== undefined && windowId !== null) {
            queryInfo.windowId = windowId;
        }
        
        const tabs = await chrome.tabs.query(queryInfo);
        console.log("*SNOW TOOL BELT BG* Found", tabs.length, "tabs to reload");
        
        if (tabs.length === 0) {
            return { success: false, message: "No tabs found for this instance", count: 0 };
        }
        
        // Reload all matching tabs
        const reloadPromises = tabs.map(tab => chrome.tabs.reload(tab.id));
        await Promise.all(reloadPromises);
        
        console.log("*SNOW TOOL BELT BG* Successfully reloaded", tabs.length, "tabs");
        return { success: true, message: `Reloaded ${tabs.length} tab(s)`, count: tabs.length };
        
    } catch (error) {
        console.error("*SNOW TOOL BELT BG* Error reloading tabs:", error);
        return { success: false, message: error.message, count: 0 };
    }
}

/**
 * Handles a change event coming from storage
 * @param {Object} objChanged an object that contains the items that changed with newValue and oldValue
 * @param {String} area Storage area (should be "sync")
 */
function storageEvent(objChanged, area) {
    // Phase 1: Ignore tabStateCache updates to avoid unnecessary reloads
    if (objChanged.tabStateCache) {
        console.log("*SNOW TOOL BELT BG* Tab state cache updated, skipping options reload");
        return false;
    }
    
    // FF doesn't check if there is an actual change between new and old values
    if ((objChanged.instanceOptions && objChanged.instanceOptions.newValue === objChanged.instanceOptions.oldValue) || (objChanged.knownInstances && objChanged.knownInstances.newValue === objChanged.knownInstances.oldValue)) {
        return false;
    } else {
        console.log("*SNOW TOOL BELT BG* Storage update, reloading options");
        getOptions();
    }
}
/**
 * Command listener
 * @param {String} command Id of the command that was issued
 */
const cmdListener = (command) => {
    console.log("*SNOW TOOL BELT BG* received command " + command);
    let currentTab = {};
    // What is the current tab when the user pressed the keyboard combination?
    chromeAPI.tabs.query({ currentWindow: true, active: true }, (tabs) => {
        currentTab = tabs[0];
        let hostname;
        try {
            if (!currentTab.url || (!currentTab.url.startsWith('http://') && !currentTab.url.startsWith('https://'))) {
                console.log("*SNOW TOOL BELT BG* Invalid URL for command:", currentTab.url);
                return false;
            }
            hostname = new URL(currentTab.url).hostname;
        } catch (e) {
            console.error("*SNOW TOOL BELT BG* Unable to get sender hostname: " + e);
            return false;
        }
        let test = isServiceNow(hostname);
        console.warn(test);
        if (test.isServiceNow === false) {
            // do nothing
            return false;
        }
        if (command === "execute-reframe") {
            popIn(currentTab.id);
        } else if (command === "execute-openversions") {
            openVersions(currentTab);
        } else if (command === "execute-fieldnames") {
            chrome.tabs.sendMessage(currentTab.id, { "command": command }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("*SNOW TOOL BELT BG* Could not execute field names command:", chrome.runtime.lastError.message);
                }
            });
        } else if (command === "execute-console") {
            chrome.tabs.sendMessage(currentTab.id, { "command": "toggleConsole" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("*SNOW TOOL BELT BG* Could not execute console command:", chrome.runtime.lastError.message);
                }
            });
        } else if (command === "execute-backgroundscript") {
            openBackgroundScriptWindow(currentTab);
        }
        return true;
    });
}
/**
 * Returns an object if current URL is known to be a ServiceNow instance
 * @param {String} FQDN of the current calling tab
 */
const isServiceNow = (hostname) => {
    console.log("*SNOW TOOL BELT BG* isServiceNow? hostname=" + hostname);
    console.log("*SNOW TOOL BELT BG* urlFiltersArr:", context.urlFiltersArr);
    let matchFound = false;
    let response = { "isServiceNow": false };

    if (!context.urlFiltersArr || context.urlFiltersArr.length === 0) {
        console.log("*SNOW TOOL BELT BG* urlFiltersArr is empty or undefined");
        return response;
    }

    context.urlFiltersArr.forEach(function (filter) {
        // console.log("matchFound=" + matchFound);
        // console.log("filter=" + filter);
        // console.log("hostname.indexOf(filter)=" + hostname.indexOf(filter));

        if (filter.trim() === "") return false;
        if (matchFound) return true;
        matchFound = (hostname.indexOf(filter) > 0 ? true : false);
        if (matchFound) {
            let color = "";
            let hidden = false;
            if (context.instanceOptions[hostname] !== undefined) {
                hidden = context.instanceOptions[hostname]["hidden"];
                color = context.instanceOptions[hostname]["color"];
                console.log("*SNOW TOOL BELT BG* Found instance options for", hostname, "- color:", color, "hidden:", hidden);
            } else {
                console.log("*SNOW TOOL BELT BG* No instance options found for", hostname);
            }

            // This is an instance we did not know about, save it
            if (context.knownInstances[hostname] === undefined) {
                console.log("*SNOW TOOL BELT BG* New instance discovered:", hostname);
                context.knownInstances[hostname] = hostname;
                context.instanceOptions[hostname] = {
                    'hidden': false
                };
                saveContext();
            }

            // Get friendly name from knownInstances
            const friendlyName = context.knownInstances[hostname] || hostname;

            response = { "isServiceNow": true, "favIconColor": color, "hidden": hidden, "instanceName": friendlyName };
            console.log("*SNOW TOOL BELT BG* Returning response:", response);
        }
    });
    return (response);
}
/**
 * Message listener
 * @param {Object} message The object send with the message: {command, node}
 * @param {Object} sender The sender tab or window
 * @param {Function} sendResponse
 */
const msgListener = (message, sender, sendResponse) => {
    console.log("*SNOW TOOL BELT BG* received message");
    console.log(sender);
    console.log(message);
    let hostname;
    try {
        hostname = new URL(sender.url).hostname;
        console.log("*SNOW TOOL BELT BG* hostname from sender.url=" + hostname);
    } catch (e) {
        console.error("*SNOW TOOL BELT BG* Unable to get sender hostname from sender.url: " + e);
        // Try to get hostname from message if provided
        if (message.hostname) {
            hostname = message.hostname;
            console.log("*SNOW TOOL BELT BG* Using hostname from message=" + hostname);
        }
    }

    if (message.command === "removeCookie" && message.instance) {
        let targetInstance = message.instance;
        chrome.cookies.getAll({ "url": "https://" + targetInstance }, function (cookiesArray) {
            cookiesArray.forEach(function (cookie) {
                if (cookie.name.indexOf("BIGipServer") > -1 || cookie.name.indexOf("JSESSIONID") > -1 || cookie.name.indexOf("X-Mapping") > -1) {
                    chrome.cookies.remove({ "url": "https://" + targetInstance, "name": cookie.name });
                }
            });
        });
        sendResponse(true);
        return true;
    } else if (message.command === "isServiceNow" && hostname) {
        sendResponse(isServiceNow(hostname));
        return true;
    } else if (message.command === "isServiceNow" && !hostname) {
        // If hostname couldn't be extracted, return false
        console.log("*SNOW TOOL BELT BG* isServiceNow called but hostname is undefined");
        sendResponse({ "isServiceNow": false });
        return true;
    }
    if (message.command === "execute-reframe" && message.tabid) {
        popIn(message.tabid);
        sendResponse(true);
        return true;
    }
    
    if (message.command === "execute-openversions" && sender.tab) {
        console.log("*SNOW TOOL BELT BG* Opening versions for tab", sender.tab.id);
        const result = openVersions(sender.tab);
        sendResponse({ success: result });
        return true;
    }
    
    if (message.command === "execute-backgroundscript" && sender.tab) {
        console.log("*SNOW TOOL BELT BG* Opening background script for tab", sender.tab.id);
        openBackgroundScriptWindow(sender.tab);
        sendResponse({ success: true });
        return true;
    }
    
    if (message.command === "execute-reloadtabs") {
        console.log("*SNOW TOOL BELT BG* Reloading tabs for instance", message.instance, "windowId", message.windowId);
        reloadInstanceTabs(message.instance, message.windowId).then(result => {
            sendResponse(result);
        });
        return true;
    }
    
    // Phase 1: Handle tab state cache messages
    if (message.command === "reportTabState" && sender.tab) {
        console.log("*SNOW TOOL BELT BG* Received tab state report from tab", sender.tab.id);
        updateTabStateCache(sender.tab.id, sender.tab.url, message.tabInfo);
        sendResponse({ success: true });
        return true;
    }
    
    if (message.command === "getTabStateCache") {
        console.log("*SNOW TOOL BELT BG* Sending tab state cache to popup");
        sendResponse({ cache: getAllTabStatesFromCache() });
        return true;
    }
    
    if (message.command === "getTabState" && message.tabId) {
        const tabState = getTabStateFromCache(message.tabId);
        sendResponse({ tabState: tabState });
        return true;
    }
    
    sendResponse("");
};

chromeAPI.runtime.onMessage.addListener(msgListener);
chromeAPI.tabs.onUpdated.addListener(tabUpdated);
chromeAPI.storage.onChanged.addListener(storageEvent);
chromeAPI.commands.onCommand.addListener(cmdListener);

// Firefox-specific: Add initialization logging
console.log("*SNOW TOOL BELT BG* Background script initializing, browser:", isChromium ? "Chrome" : "Firefox");
getOptions();


/**
 * Phase 1: Tab lifecycle event listeners for cache management
 */

// Listen for tab removal to clean up cache
chromeAPI.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabStateCache.tabs[tabId]) {
        console.log("*SNOW TOOL BELT BG* Tab", tabId, "removed, cleaning cache");
        delete tabStateCache.tabs[tabId];
        debouncedSaveCache();
    }
});

// Listen for tab updates to mark tabs as potentially stale
chromeAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Tab finished loading, content script should report soon
        // Record the load time to check against later
        const loadTime = Date.now();
        
        // If no report after 10 seconds, mark as non-responsive
        setTimeout(() => {
            const cachedState = tabStateCache.tabs[tabId];
            // Only mark as non-responsive if:
            // 1. No cached state exists, OR
            // 2. Cached state hasn't been updated since this page load
            if (!cachedState || cachedState.lastUpdated < loadTime) {
                console.log("*SNOW TOOL BELT BG* Tab", tabId, "loaded but no state report received within 10 seconds");
                tabStateCache.tabs[tabId] = {
                    type: "non responsive",
                    lastUpdated: Date.now(),
                    url: tab.url,
                    instance: new URL(tab.url).hostname
                };
                debouncedSaveCache();
            } else {
                console.log("*SNOW TOOL BELT BG* Tab", tabId, "reported state successfully after load");
            }
        }, 10000);
    }
});

console.log("*SNOW TOOL BELT BG* Phase 1: Tab state cache management initialized");
