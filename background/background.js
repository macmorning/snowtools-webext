// Browser detection — duplicated from shared/utils.js since service worker can't load it
const getPlatform = () => {
    const { userAgent } = navigator;
    if (userAgent.includes("Firefox")) return "Firefox";
    else if ("brave" in navigator) return "Brave";
    else if (userAgent.includes("Edg/")) return "Edge";
    else if (userAgent.includes("OPR")) return "Opera";
    return "Chrome";
};
const isChromium = ["Chrome", "Edge", "Brave"].includes(getPlatform());
const chromeAPI = isChromium ? chrome : browser;

// Recent tabs tracking - always keep last 10 per instance
const MAX_RECENT_TABS_PER_INSTANCE = 10;

/**
 * Registers basic content script (always loaded for favicon updates)
 */
const registerBasicContentScript = async () => {
    const scriptId = 'snowbelt-basic';
    const matches = ['https://*.service-now.com/*'];
    const excludeMatches = ['*://*/*?JSONv2*', '*://*/*?XML*', '*://*/*&XML*'];

    if (isChromium && chrome.scripting && chrome.scripting.registerContentScripts) {
        try {
            const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
            if (existing.length > 0) {
                return;
            }

            await chrome.scripting.registerContentScripts([{
                id: scriptId,
                matches: matches,
                excludeMatches: excludeMatches,
                js: ["content-script/snowbelt-cs-basic.js"],
                runAt: "document_end"
            }]);
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register basic content script:", error);
        }
    } else if (typeof browser !== "undefined" && browser.contentScripts) {
        try {
            await browser.contentScripts.register({
                matches: matches,
                excludeMatches: excludeMatches,
                js: [{ file: "content-script/snowbelt-cs-basic.js" }],
                runAt: "document_end"
            });
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register basic content script:", error);
        }
    }
};

/**
 * Registers main content scripts for service-now.com domain (full features)
 */
const registerMainContentScripts = async () => {
    const scriptId = 'snowbelt-main';
    const matches = ['https://*.service-now.com/*'];
    const excludeMatches = ['*://*/*?JSONv2*', '*://*/*?XML*', '*://*/*&XML*'];

    if (isChromium && chrome.scripting && chrome.scripting.registerContentScripts) {
        try {
            // Check if already registered
            const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
            if (existing.length > 0) {
                return;
            }

            await chrome.scripting.registerContentScripts([{
                id: scriptId,
                matches: matches,
                excludeMatches: excludeMatches,
                js: ["shared/utils.js", "content-script/snowbelt-cs.js"],
                runAt: "document_idle"
            }]);
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register main content scripts:", error);
        }
    } else if (typeof browser !== "undefined" && browser.contentScripts) {
        try {
            await browser.contentScripts.register({
                matches: matches,
                excludeMatches: excludeMatches,
                js: [{ file: "shared/utils.js" }, { file: "content-script/snowbelt-cs.js" }],
                runAt: "document_idle"
            });
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register main content scripts:", error);
        }
    }
};

/**
 * Unregisters main content scripts
 */
const unregisterMainContentScripts = async () => {
    const scriptId = 'snowbelt-main';

    if (isChromium && chrome.scripting && chrome.scripting.unregisterContentScripts) {
        try {
            // Check if script is registered before trying to unregister
            const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
            if (existing.length > 0) {
                await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
            }
        } catch (error) {
            // Silently handle "Nonexistent script ID" errors
            if (!error.message || !error.message.includes("Nonexistent script ID")) {
                console.error("*SNOW TOOL BELT BG* Failed to unregister main content scripts:", error);
            }
        }
    }
    // Note: Firefox doesn't support unregistering content scripts in MV3
};

/**
 * Cross-browser content script registration for extra domains
 * @param {string} filter Domain filter for content script registration
 * @param {boolean} basicOnly If true, only register basic script
 */
const registerContentScript = async (filter, basicOnly = false) => {
    const scriptId = basicOnly ? `snowbelt-basic-${filter.replace(/[^a-zA-Z0-9]/g, '-')}` : `snowbelt-${filter.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const matches = [`https://${filter}/*`, `https://*.${filter}/*`];
    const scripts = basicOnly ? ["content-script/snowbelt-cs-basic.js"] : ["shared/utils.js", "content-script/snowbelt-cs.js"];

    if (isChromium && chrome.scripting && chrome.scripting.registerContentScripts) {
        // Modern Chrome/Edge with Manifest V3
        try {
            // Check if already registered
            const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
            if (existing.length > 0) {
                return;
            }
            
            await chrome.scripting.registerContentScripts([{
                id: scriptId,
                matches: matches,
                js: scripts,
                runAt: "document_idle"
            }]);
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register content script for:", filter, error);
        }
    } else if (typeof browser !== "undefined" && browser.contentScripts) {
        // Firefox with browser.contentScripts API
        try {
            const jsFiles = scripts.map(file => ({ file }));
            await browser.contentScripts.register({
                matches: matches,
                js: jsFiles,
                runAt: "document_idle"
            });
        } catch (error) {
            console.error("*SNOW TOOL BELT BG* Failed to register content script for:", filter, error);
        }
    } else {
        // Firefox MV3 doesn't support dynamic content script registration
        if (isChromium) {
            console.warn("*SNOW TOOL BELT BG* Content script registration not supported");
        }
    }
};

const context = {
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1": "instance 1 name", "url2": "instance 2 name", ...}
    instanceOptions: {}, // { "url1": { "checkState": boolean, "colorSet": boolean, "color": color, "hidden": boolean}, "url2": ...}
    contentScriptEnabled: true, // Whether content script features are enabled
    showUpdatesets: true, // Whether to show update sets in the popup
    maxSearchResults: 50, // Maximum number of search results
    useSync: false, // Whether to mirror settings to sync storage
    storageArea: {} // Always chromeAPI.storage.local — sync is only a mirror
};

/**
 * Mirrors data to sync storage (fire-and-forget).
 * Called after every local write when useSync is enabled.
 * Silently fails if sync quota is exceeded.
 * @param {Object} data - The key/value pairs to mirror to sync
 */
function mirrorToSync(data) {
    if (!context.useSync) return;
    chromeAPI.storage.sync.set(data, () => {
        if (chromeAPI.runtime.lastError) {
            console.warn("*SNOW TOOL BELT BG* Sync mirror failed (quota?):", chromeAPI.runtime.lastError.message);
        }
    });
}

/**
 * Tab state cache - Phase 1 implementation
 * Stores tab information reported by content scripts
 */
const tabStateCache = {
    tabs: {}, // { tabId: { type, details, updateSet, timestamp, instance, url } }
    updateSets: {} // { instance: { windowId: updateSetInfo } }
};

/**
 * Safely saves a newly discovered instance by merging with current storage contents.
 * Reads from storage first to avoid overwriting richer data written by the popup or options page.
 * Only writes if the instance is genuinely absent from storage.
 * @param {string} hostname - The instance hostname to save
 */
async function saveNewInstance(hostname) {
    try {
        const result = await context.storageArea.get(["knownInstances", "instanceOptions"]);

        let knownInstances = {};
        let instanceOptions = {};
        try { knownInstances = JSON.parse(result.knownInstances || "{}"); } catch (e) { knownInstances = {}; }
        try { instanceOptions = JSON.parse(result.instanceOptions || "{}"); } catch (e) { instanceOptions = {}; }

        // Only write if genuinely missing — never overwrite existing entries
        if (knownInstances[hostname] !== undefined) {
            // Still update in-memory context to match storage
            context.knownInstances = knownInstances;
            context.instanceOptions = instanceOptions;
            return;
        }

        knownInstances[hostname] = hostname;
        instanceOptions[hostname] = { hidden: false };

        await context.storageArea.set({
            "knownInstances": JSON.stringify(knownInstances),
            "instanceOptions": JSON.stringify(instanceOptions)
        });

        // Keep in-memory context in sync with what we just wrote
        context.knownInstances = knownInstances;
        context.instanceOptions = instanceOptions;
    } catch (e) {
        console.error("*SNOW TOOL BELT BG* Error saving new instance:", e);
    }
}

/**
 * Retrieves saved options. Always reads from local storage (sync migration ensures data is here).
 */
const getOptions = (onReady) => {
    // Always read from local storage — sync is only a mirror
    context.storageArea = chromeAPI.storage.local;
    context.storageArea.get(["useSync", "extraDomains", "urlFilters", "knownInstances", "instanceOptions", "contentScriptEnabled", "showUpdatesets", "maxSearchResults"], (result) => {
            // Use per-key defaults instead of wiping everything when result is empty.
            // An empty result can mean "first run" OR "wrong storage bucket" — we can't tell
            // the difference, so we must never reset to defaults for keys that have a safe fallback.
            context.useSync = (result.useSync === true || result.useSync === "true");
            const regex = /http[s]{0,1}:\/\//gm;
            const regex2 = /\/[^;]*/gm;
            context.urlFilters = (result.urlFilters || "service-now.com;").replace(regex, "").replace(regex2, "");
            const rawKnownInstances = result.knownInstances || "{}";
            const rawInstanceOptions = result.instanceOptions || "{}";

            context.urlFiltersArr = context.urlFilters.split(";");
            
            // Always register basic content script (for favicon updates)
            registerBasicContentScript();
            
            // Check if content script features are enabled (default: true)
            const contentScriptEnabled = (result.contentScriptEnabled === "true" || result.contentScriptEnabled === true || result.contentScriptEnabled === undefined);
            context.contentScriptEnabled = contentScriptEnabled;

            context.showUpdatesets = (result.showUpdatesets === "true" || result.showUpdatesets === true || result.showUpdatesets === undefined);
            context.maxSearchResults = result.maxSearchResults || 20;
            
            if (contentScriptEnabled) {
                // Register main content scripts for service-now.com
                registerMainContentScripts();
            } else {
                // Unregister main content scripts if disabled
                unregisterMainContentScripts();
            }
            
            context.extraDomains = (result.extraDomains === "true" || result.extraDomains === true);
            if (context.extraDomains && context.urlFiltersArr.length) {
                context.urlFiltersArr.forEach(filter => {
                    if (filter && filter.length) {
                        try {
                            // Always register basic script for extra domains
                            registerContentScript(filter, true);
                            
                            // Register full script only if content script features are enabled
                            if (contentScriptEnabled) {
                                registerContentScript(filter, false);
                            }
                        } catch (e) {
                            console.error("*SNOW TOOL BELT BG* Could not register content script for > " + filter);
                            console.error(e);
                        }
                    }
                });
            }
            try {
                context.knownInstances = JSON.parse(rawKnownInstances);
            } catch (e) {
                context.knownInstances = {};
            }
            
            // Phase 1: Load tab state cache from storage
            loadTabStateCache();
            
            // Request fresh state from all tabs after a short delay to allow cache to load
            setTimeout(() => {
                requestFreshStateFromAllTabs();
            }, 500);
            
            try {
                context.instanceOptions = JSON.parse(rawInstanceOptions);
            } catch (e) {
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
                                }
                            });
                        }
                    } catch (error) {
                        // Invalid URL, skip this tab
                    }
                }
            });
    
    if (onReady) onReady();
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
            cleanStaleEntries();
        }
    });
}

/**
 * Request fresh state from all ServiceNow tabs after service worker restart
 */
function requestFreshStateFromAllTabs() {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && (tab.url.includes('service-now.com') || tab.url.includes('.service-now.com'))) {
                chrome.tabs.sendMessage(tab.id, { "command": "requestStateReport" }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Content script not loaded or not responsive
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
        
        // Update update set cache if provided
        if (tabInfo.updateSet && tabInfo.updateSet.current) {
            if (!tabStateCache.updateSets[instance]) {
                tabStateCache.updateSets[instance] = {};
            }
            tabStateCache.updateSets[instance] = tabInfo.updateSet;
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
        chromeAPI.storage.session.set({ tabStateCache: tabStateCache });
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
            return false;
        }

        let url = new URL(tab.url);

        const sysIdRegex = /(?:=|%3D)([a-f0-9]{32})(?:[^a-f0-9]|$)/i;
        const match = tab.url.match(sysIdRegex);

        if (!match || !match[1]) {
            return false;
        }

        const sysId = match[1].toLowerCase();

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
        const queryInfo = { url: `*://${instance}/*` };
        if (windowId !== undefined && windowId !== null) {
            queryInfo.windowId = windowId;
        }
        
        const tabs = await chrome.tabs.query(queryInfo);
        
        if (tabs.length === 0) {
            return { success: false, message: "No tabs found for this instance", count: 0 };
        }
        
        const reloadPromises = tabs.map(tab => chrome.tabs.reload(tab.id));
        await Promise.all(reloadPromises);
        
        return { success: true, message: `Reloaded ${tabs.length} tab(s)`, count: tabs.length };
        
    } catch (error) {
        console.error("*SNOW TOOL BELT BG* Error reloading tabs:", error);
        return { success: false, message: error.message, count: 0 };
    }
}

/**
 * Command listener
 * @param {String} command Id of the command that was issued
 */
const cmdListener = (command) => {
    let currentTab = {};
    chromeAPI.tabs.query({ currentWindow: true, active: true }, (tabs) => {
        currentTab = tabs[0];
        let hostname;
        try {
            if (!currentTab.url || (!currentTab.url.startsWith('http://') && !currentTab.url.startsWith('https://'))) {
                return false;
            }
            hostname = new URL(currentTab.url).hostname;
        } catch (e) {
            console.error("*SNOW TOOL BELT BG* Unable to get sender hostname: " + e);
            return false;
        }
        let test = isServiceNow(hostname);
        if (test.isServiceNow === false) {
            return false;
        }
        if (command === "execute-reframe") {
            popIn(currentTab.id);
        } else if (command === "execute-openversions") {
            if (!context.contentScriptEnabled) {
                return true;
            }
            
            openVersions(currentTab);
        } else if (command === "execute-fieldnames") {
            if (!context.contentScriptEnabled) {
                return true;
            }
            
            chrome.tabs.sendMessage(currentTab.id, { "command": command }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script not ready
                }
            });
        } else if (command === "execute-console") {
            if (!context.contentScriptEnabled) {
                return true;
            }
            
            chrome.tabs.sendMessage(currentTab.id, { "command": "toggleConsole" }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script not ready
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
    let matchFound = false;
    let response = { "isServiceNow": false };

    if (!context.urlFiltersArr || context.urlFiltersArr.length === 0) {
        return response;
    }

    context.urlFiltersArr.forEach(function (filter) {
        if (filter.trim() === "") return false;
        if (matchFound) return true;
        matchFound = (hostname.indexOf(filter) > 0 ? true : false);
        if (matchFound) {
            let color = "";
            let hidden = false;
            if (context.instanceOptions[hostname] !== undefined) {
                hidden = context.instanceOptions[hostname]["hidden"];
                color = context.instanceOptions[hostname]["color"];
            }

            // This is an instance we did not know about, save it
            if (context.knownInstances[hostname] === undefined) {
                context.knownInstances[hostname] = hostname;
                context.instanceOptions[hostname] = {
                    'hidden': false
                };
                saveNewInstance(hostname);
            }

            const friendlyName = context.knownInstances[hostname] || hostname;

            response = { 
                "isServiceNow": true, 
                "favIconColor": color, 
                "hidden": hidden, 
                "instanceName": friendlyName,
                "contentScriptEnabled": context.contentScriptEnabled 
            };
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
    let hostname;
    try {
        hostname = new URL(sender.url).hostname;
    } catch (e) {
        // Try to get hostname from message if provided
        if (message.hostname) {
            hostname = message.hostname;
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
        sendResponse({ "isServiceNow": false });
        return true;
    }
    if (message.command === "execute-reframe" && message.tabid) {
        popIn(message.tabid);
        sendResponse(true);
        return true;
    }
    
    if (message.command === "execute-openversions" && sender.tab) {
        const result = openVersions(sender.tab);
        sendResponse({ success: result });
        return true;
    }
    
    if (message.command === "execute-backgroundscript" && sender.tab) {
        openBackgroundScriptWindow(sender.tab);
        sendResponse({ success: true });
        return true;
    }
    
    if (message.command === "execute-reloadtabs") {
        reloadInstanceTabs(message.instance, message.windowId).then(result => {
            sendResponse(result);
        });
        return true;
    }
    
    // Handle content script registration update
    if (message.command === "updateContentScriptRegistration") {
        context.contentScriptEnabled = message.enabled;
        if (message.enabled) {
            registerMainContentScripts().then(() => {
                sendResponse({ success: true });
            });
        } else {
            unregisterMainContentScripts().then(() => {
                sendResponse({ success: true });
            });
        }
        return true;
    }
    
    // Phase 1: Handle tab state cache messages
    if (message.command === "reportTabState" && sender.tab) {
        updateTabStateCache(sender.tab.id, sender.tab.url, message.tabInfo);
        sendResponse({ success: true });
        return true;
    }
    
    if (message.command === "getTabStateCache") {
        sendResponse({ cache: getAllTabStatesFromCache() });
        return true;
    }
    
    if (message.command === "getTabState" && message.tabId) {
        const tabState = getTabStateFromCache(message.tabId);
        sendResponse({ tabState: tabState });
        return true;
    }
    
    // Handle recent tabs request
    if (message.command === "getRecentTabs") {
        const instance = message.instance;
        
        chromeAPI.storage.local.get(['recentTabs'], (result) => {
            let recentTabs = [];
            try {
                recentTabs = result.recentTabs ? JSON.parse(result.recentTabs) : [];
            } catch (e) {
                console.error("*SNOW TOOL BELT BG* Error parsing recent tabs:", e);
                recentTabs = [];
            }
            
            // Filter by instance (already limited to 10 per instance)
            const instanceTabs = recentTabs.filter(tab => tab.instance === instance);
            
            sendResponse({ tabs: instanceTabs });
        });
        
        return true; // Async response
    }
    
    // Handle reopen tab request
    if (message.command === "reopenTab") {
        const url = message.url;
        
        chromeAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs && tabs.length > 0 ? tabs[0] : null;
            
            const createProperties = {
                url: url,
                active: false
            };
            
            // Try to place in same window and next to current tab
            if (currentTab) {
                createProperties.windowId = currentTab.windowId;
                createProperties.index = currentTab.index + 1;
            }
            
            // Create the tab
            chromeAPI.tabs.create(createProperties, (newTab) => {
                // Try to add to same group if current tab is in a group
                try {
                    if (currentTab && currentTab.groupId && currentTab.groupId !== -1) {
                        chrome.tabs.group({
                            tabIds: [newTab.id],
                            groupId: currentTab.groupId
                        }, () => {
                            if (chrome.runtime.lastError) {
                                // Could not add to group
                            }
                        });
                    }
                } catch (error) {
                    // Tab groups not available
                }
                
                sendResponse({ success: true, tabId: newTab.id });
            });
        });
        
        return true; // Async response
    }
    
    // -------------------------------------------------------------------------
    // Settings API (Phase 2) — background is the sole writer of settings storage
    // -------------------------------------------------------------------------

    /**
     * Returns the full current settings to the caller (popup or options page).
     * Waits for settings to be loaded from storage before responding (handles service worker restart race).
     */
    if (message.command === "getSettings") {
        settingsReady.then(() => {
            sendResponse({
                knownInstances: context.knownInstances,
                instanceOptions: context.instanceOptions,
                urlFilters: context.urlFilters,
                extraDomains: context.extraDomains,
                showUpdatesets: context.showUpdatesets,
                maxSearchResults: context.maxSearchResults,
                contentScriptEnabled: context.contentScriptEnabled,
                useSync: context.useSync
            });
        });
        return true;
    }

    /**
     * Updates a single key for a single instance in instanceOptions and persists.
     * message: { command, instance, key, value }
     */
    if (message.command === "updateInstanceOption") {
        const { instance, key, value } = message;
        if (!instance || key === undefined) {
            sendResponse({ success: false, error: "Missing instance or key" });
            return true;
        }
        if (!context.instanceOptions[instance]) {
            context.instanceOptions[instance] = {};
        }
        // value === null means delete the key (e.g. removing a color)
        if (value === null || value === undefined) {
            delete context.instanceOptions[instance][key];
        } else {
            context.instanceOptions[instance][key] = value;
        }
        context.storageArea.set({
            "instanceOptions": JSON.stringify(context.instanceOptions)
        }, () => {
            if (chromeAPI.runtime.lastError) {
                console.error("*SNOW TOOL BELT BG* Error saving instanceOptions:", chromeAPI.runtime.lastError);
                sendResponse({ success: false, error: chromeAPI.runtime.lastError.message });
            } else {
                mirrorToSync({ instanceOptions: JSON.stringify(context.instanceOptions) });
                
                // Broadcast color changes to all tabs for this instance
                if (key === "color") {
                    chrome.tabs.query({ url: `*://${instance}/*` }, (tabs) => {
                        if (chrome.runtime.lastError) return;
                        tabs.forEach(tab => {
                            chrome.tabs.sendMessage(tab.id, { command: "updateFavicon", color: value || "" }, () => {
                                if (chrome.runtime.lastError) { /* tab not ready, ignore */ }
                            });
                        });
                    });
                }
                
                sendResponse({ success: true });
            }
        });
        return true;
    }

    /**
     * Updates the friendly name for an instance in knownInstances and persists.
     * message: { command, instance, name }
     */
    if (message.command === "updateKnownInstance") {
        const { instance, name } = message;
        if (!instance || name === undefined) {
            sendResponse({ success: false, error: "Missing instance or name" });
            return true;
        }
        context.knownInstances[instance] = name;
        context.storageArea.set({
            "knownInstances": JSON.stringify(context.knownInstances)
        }, () => {
            if (chromeAPI.runtime.lastError) {
                console.error("*SNOW TOOL BELT BG* Error saving knownInstances:", chromeAPI.runtime.lastError);
                sendResponse({ success: false, error: chromeAPI.runtime.lastError.message });
            } else {
                mirrorToSync({ knownInstances: JSON.stringify(context.knownInstances) });
                sendResponse({ success: true });
            }
        });
        return true;
    }

    /**
     * Bulk-updates settings (used by options page for urlFilters, extraDomains, etc.).
     * message: { command, settings: { key: value, ... } }
     * Only whitelisted keys are accepted to prevent accidental overwrites.
     */
    if (message.command === "updateSettings") {
        const ALLOWED_KEYS = [
            "urlFilters", "extraDomains", "showUpdatesets",
            "contentScriptEnabled", "maxSearchResults",
            "knownInstances", "instanceOptions"
        ];
        const updates = {};
        for (const key of ALLOWED_KEYS) {
            if (message.settings && message.settings[key] !== undefined) {
                // Update in-memory context
                context[key] = message.settings[key];
                // Serialize objects to JSON for storage
                updates[key] = (typeof message.settings[key] === "object")
                    ? JSON.stringify(message.settings[key])
                    : message.settings[key];
            }
        }
        if (Object.keys(updates).length === 0) {
            sendResponse({ success: false, error: "No valid keys provided" });
            return true;
        }

        // Clean instanceOptions: remove entries for instances not in knownInstances
        if (updates.knownInstances || message.settings.knownInstances) {
            const currentKnown = context.knownInstances || {};
            let cleaned = false;
            for (const key of Object.keys(context.instanceOptions)) {
                if (currentKnown[key] === undefined) {
                    delete context.instanceOptions[key];
                    cleaned = true;
                }
            }
            if (cleaned) {
                updates.instanceOptions = JSON.stringify(context.instanceOptions);
            }
        }

        context.storageArea.set(updates, () => {
            if (chromeAPI.runtime.lastError) {
                console.error("*SNOW TOOL BELT BG* Error saving settings:", chromeAPI.runtime.lastError);
                sendResponse({ success: false, error: chromeAPI.runtime.lastError.message });
            } else {
                mirrorToSync(updates);
                sendResponse({ success: true });
            }
        });
        return true;
    }

    /**
     * Toggles sync mirroring. If enabling, merges local ↔ sync (both directions) then writes merged to both.
     * For instanceOptions: per-instance deep merge — sync fills missing keys (e.g. color) that local doesn't have.
     * message: { command, useSync: boolean }
     */
    if (message.command === "setUseSync") {
        const newUseSync = (message.useSync === true || message.useSync === "true");
        context.useSync = newUseSync;
        chromeAPI.storage.local.set({ useSync: newUseSync }, async () => {
            if (chromeAPI.runtime.lastError) {
                sendResponse({ success: false, error: chromeAPI.runtime.lastError.message });
                return;
            }

            if (newUseSync) {
                try {
                    // Read sync data
                    const syncData = await chromeAPI.storage.sync.get([
                        "knownInstances", "instanceOptions", "urlFilters",
                        "extraDomains", "showUpdatesets", "contentScriptEnabled", "maxSearchResults"
                    ]);

                    // Parse
                    let syncInstances = {}, syncOptions = {};
                    try { syncInstances = JSON.parse(syncData.knownInstances || "{}"); } catch(e) {}
                    try { syncOptions = JSON.parse(syncData.instanceOptions || "{}"); } catch(e) {}

                    // Merge knownInstances: union of both.
                    // If local has the hostname as name (not renamed), prefer sync's friendly name.
                    const mergedInstances = { ...syncInstances };
                    for (const inst of Object.keys(context.knownInstances)) {
                        const localName = context.knownInstances[inst];
                        const syncName = syncInstances[inst];
                        if (localName && localName !== inst) {
                            mergedInstances[inst] = localName;
                        } else if (syncName && syncName !== inst) {
                            mergedInstances[inst] = syncName;
                        } else {
                            mergedInstances[inst] = localName || syncName || inst;
                        }
                    }

                    // Merge instanceOptions: per-instance deep merge.
                    // For each instance, sync fills keys that local doesn't have (e.g. color from sync).
                    const mergedOptions = {};
                    const allInstanceKeys = new Set([...Object.keys(syncOptions), ...Object.keys(context.instanceOptions)]);
                    for (const inst of allInstanceKeys) {
                        const syncOpts = syncOptions[inst] || {};
                        const localOpts = context.instanceOptions[inst] || {};
                        // Sync fills gaps, local wins for keys it has
                        mergedOptions[inst] = { ...syncOpts, ...localOpts };
                    }

                    // Update in-memory context
                    context.knownInstances = mergedInstances;
                    context.instanceOptions = mergedOptions;

                    // Write merged result to both local and sync
                    const mergedData = {
                        knownInstances: JSON.stringify(mergedInstances),
                        instanceOptions: JSON.stringify(mergedOptions),
                        urlFilters: context.urlFilters,
                        extraDomains: context.extraDomains,
                        showUpdatesets: context.showUpdatesets,
                        contentScriptEnabled: context.contentScriptEnabled,
                        maxSearchResults: context.maxSearchResults
                    };
                    await chromeAPI.storage.local.set(mergedData);
                    chromeAPI.storage.sync.set(mergedData, () => {
                        if (chromeAPI.runtime.lastError) {
                            console.warn("*SNOW TOOL BELT BG* Sync upload after merge failed:", chromeAPI.runtime.lastError.message);
                        }
                    });
                } catch (e) {
                    console.error("*SNOW TOOL BELT BG* Error during sync enable merge:", e);
                }
            }

            sendResponse({ success: true });
        });
        return true;
    }

    sendResponse("");
};

chromeAPI.runtime.onMessage.addListener(msgListener);
chromeAPI.tabs.onUpdated.addListener(tabUpdated);
chromeAPI.commands.onCommand.addListener(cmdListener);

/**
 * Startup sync merge: if useSync is enabled, merges any new data from sync into local.
 * Local is always primary. Sync entries not in local are added (e.g. from another device).
 * Local entries always win for conflicts.
 * Runs every startup (not just once) so cross-device sync works continuously.
 */
async function mergeSyncOnStartup() {
    try {
        const useSyncResult = await chromeAPI.storage.local.get(['useSync']);
        context.useSync = (useSyncResult.useSync === true || useSyncResult.useSync === "true");

        if (!context.useSync) {
            return;
        }

        // Read from both
        const syncData = await chromeAPI.storage.sync.get([
            "knownInstances", "instanceOptions", "urlFilters",
            "extraDomains", "showUpdatesets", "contentScriptEnabled", "maxSearchResults"
        ]);
        const localData = await chromeAPI.storage.local.get([
            "knownInstances", "instanceOptions", "urlFilters"
        ]);

        // Parse
        let syncInstances = {}, localInstances = {};
        let syncOptions = {}, localOptions = {};
        try { syncInstances = JSON.parse(syncData.knownInstances || "{}"); } catch(e) {}
        try { localInstances = JSON.parse(localData.knownInstances || "{}"); } catch(e) {}
        try { syncOptions = JSON.parse(syncData.instanceOptions || "{}"); } catch(e) {}
        try { localOptions = JSON.parse(localData.instanceOptions || "{}"); } catch(e) {}

        // Merge knownInstances: union of both.
        // If local has the hostname as name (not renamed), prefer sync's friendly name.
        const mergedInstances = { ...syncInstances };
        for (const inst of Object.keys(localInstances)) {
            const localName = localInstances[inst];
            const syncName = syncInstances[inst];
            if (localName && localName !== inst) {
                mergedInstances[inst] = localName; // local has a real name
            } else if (syncName && syncName !== inst) {
                mergedInstances[inst] = syncName; // sync has a real name, local doesn't
            } else {
                mergedInstances[inst] = localName || syncName || inst;
            }
        }

        // Deep merge instanceOptions: per-instance, sync fills missing keys
        const mergedOptions = {};
        const allInstanceKeys = new Set([...Object.keys(syncOptions), ...Object.keys(localOptions)]);
        for (const inst of allInstanceKeys) {
            const sOpts = syncOptions[inst] || {};
            const lOpts = localOptions[inst] || {};
            mergedOptions[inst] = { ...sOpts, ...lOpts };
        }

        const syncAdded = Object.keys(mergedInstances).length - Object.keys(localInstances).length;

        // Write merged data back to local (only if sync added something)
        if (syncAdded > 0 || Object.keys(mergedOptions).length > Object.keys(localOptions).length) {
            await chromeAPI.storage.local.set({
                knownInstances: JSON.stringify(mergedInstances),
                instanceOptions: JSON.stringify(mergedOptions)
            });
        }

        // Also pull non-instance settings from sync if local doesn't have them
        const settingsToMerge = {};
        if (!localData.urlFilters && syncData.urlFilters) settingsToMerge.urlFilters = syncData.urlFilters;
        if (syncData.extraDomains !== undefined && !localData.extraDomains) settingsToMerge.extraDomains = syncData.extraDomains;
        if (Object.keys(settingsToMerge).length > 0) {
            await chromeAPI.storage.local.set(settingsToMerge);
        }
    } catch (error) {
        console.error("*SNOW TOOL BELT BG* Sync merge error:", error);
    }
}

// Run sync merge before loading options.
// settingsReady resolves once getOptions has finished loading data from storage.
// Any message handler that needs settings (like getSettings) must await this.
const settingsReady = mergeSyncOnStartup().then(() => {
    return new Promise(resolve => getOptions(resolve));
});


/**
 * Phase 1: Tab lifecycle event listeners for cache management
 */

/**
 * Adds a closed tab to recent tabs history
 * @param {object} tab Tab object with url, title, and instance
 */
const addToRecentTabs = (tab) => {
    chromeAPI.storage.local.get(['recentTabs'], (result) => {
        let recentTabs = [];
        try {
            recentTabs = result.recentTabs ? JSON.parse(result.recentTabs) : [];
        } catch (e) {
            console.error("*SNOW TOOL BELT BG* Error parsing recent tabs:", e);
            recentTabs = [];
        }
        
        const recentTab = {
            url: tab.url,
            title: tab.title || 'Untitled',
            instance: tab.instance || extractInstanceFromUrl(tab.url),
            timestamp: Date.now()
        };
        
        // Remove duplicates (same URL)
        recentTabs = recentTabs.filter(t => t.url !== recentTab.url);
        
        // Add to beginning
        recentTabs.unshift(recentTab);
        
        // Keep only last 10 per instance
        const tabsByInstance = {};
        recentTabs.forEach(t => {
            if (!tabsByInstance[t.instance]) {
                tabsByInstance[t.instance] = [];
            }
            if (tabsByInstance[t.instance].length < MAX_RECENT_TABS_PER_INSTANCE) {
                tabsByInstance[t.instance].push(t);
            }
        });
        
        // Flatten back to array
        recentTabs = Object.values(tabsByInstance).flat();
        
        // Remove tabs older than 24 hours
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        recentTabs = recentTabs.filter(t => t.timestamp > oneDayAgo);
        
        // Save to storage
        chromeAPI.storage.local.set({ recentTabs: JSON.stringify(recentTabs) });
    });
};

/**
 * Extracts instance name from URL
 * @param {string} url URL to extract from
 * @returns {string} Instance name
 */
const extractInstanceFromUrl = (url) => {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return 'Unknown';
    }
};

// Listen for tab removal to clean up cache and track recent tabs
chromeAPI.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // Get tab info before cleaning cache
    const cachedTab = tabStateCache.tabs[tabId];
    
    // Try to get full tab info from Chrome API (might still be available briefly)
    chromeAPI.tabs.get(tabId, (tab) => {
        if (chromeAPI.runtime.lastError) {
            // Tab already gone, use cached info if available
            if (cachedTab && cachedTab.url) {
                // Check if it's a ServiceNow tab
                if (cachedTab.url.includes('service-now.com')) {
                    addToRecentTabs({
                        url: cachedTab.url,
                        title: cachedTab.title || 'Untitled',
                        instance: cachedTab.instance || extractInstanceFromUrl(cachedTab.url)
                    });
                }
            }
        } else if (tab && tab.url && tab.url.includes('service-now.com')) {
            // Tab info still available
            addToRecentTabs({
                url: tab.url,
                title: tab.title,
                instance: extractInstanceFromUrl(tab.url)
            });
        }
    });
    
    // Clean up cache
    if (tabStateCache.tabs[tabId]) {
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
            if (!cachedState || cachedState.lastUpdated < loadTime) {
                tabStateCache.tabs[tabId] = {
                    type: "non responsive",
                    lastUpdated: Date.now(),
                    url: tab.url,
                    title: tab.title,
                    instance: new URL(tab.url).hostname
                };
                debouncedSaveCache();
            }
        }, 10000);
    }
});

/**
 * Tab Group Sync: Listen for tab group updates to sync collapse state with popup
 * Uses feature detection with try-catch for cross-browser compatibility
 */
try {
    if (chrome.tabGroups && chrome.tabGroups.onUpdated) {
        chrome.tabGroups.onUpdated.addListener(async (group) => {
            // Find which instance this group belongs to
            try {
                const tabs = await chrome.tabs.query({ groupId: group.id });
                if (tabs.length === 0) return;
                
                const firstTab = tabs[0];
                if (!firstTab.url) return;
                
                const url = new URL(firstTab.url);
                const instance = url.hostname;
                
                // checkState=true means expanded, collapsed=true means collapsed
                if (!context.instanceOptions[instance]) {
                    context.instanceOptions[instance] = {};
                }
                
                context.instanceOptions[instance]["checkState"] = !group.collapsed;

                context.storageArea.set({
                    "instanceOptions": JSON.stringify(context.instanceOptions)
                }, () => {
                    if (chromeAPI.runtime.lastError) {
                        console.error("*SNOW TOOL BELT BG* Error saving instanceOptions after tab group sync:", chromeAPI.runtime.lastError);
                    }
                });
                
                // Notify popup if it's open
                chrome.runtime.sendMessage({
                    command: "tabGroupStateChanged",
                    instance: instance,
                    windowId: group.windowId,
                    collapsed: group.collapsed
                }, () => {
                    if (chrome.runtime.lastError) {
                        // Popup not open, that's fine
                    }
                });
                
            } catch (error) {
                console.error("*SNOW TOOL BELT BG* Error syncing tab group state:", error);
            }
        });
    }
} catch (error) {
    // Tab groups API not available
}
