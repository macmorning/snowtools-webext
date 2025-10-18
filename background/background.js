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
            try {
                context.instanceOptions = JSON.parse(context.instanceOptions);
            } catch (e) {
                console.log(e);
                context.instanceOptions = {};
            }
            // update tab icons
            chrome.tabs.query({}, (tabs) => {
                for (var i = 0; i < tabs.length; ++i) {
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
    let url = new URL(tab.url);
    let instance = url.hostname;
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
        let url = new URL(tab.url);
        if (url.pathname !== "/nav_to.do") {
            let newUrl = "https://" + url.host + "/nav_to.do?uri=" + encodeURI(url.pathname + url.search);
            chromeAPI.tabs.update(tab.id, { url: newUrl });
        } else {
            displayMessage("Already in a frame");
        }
    });
};

/**
 * Opens a new window to show versions of the current object
 * @param {Object} tab The tab from which the command was sent
 */
const openVersions = (tab) => {
    // console.log("*SNOW TOOL BELT BG* openVersions");
    let url = new URL(tab.url);
    if (url.pathname == "/nav_to.do") {
        // this is a framed nav window, get the base uri
        url = new URL("https://" + url.host + url.searchParams.get("uri"));
    }
    var tableName = url.pathname.replace("/", "").replace(".do", "");
    var sysId = url.searchParams.get("sys_id");
    if (url.pathname.startsWith("/now/nav/ui/classic/params/target")) {
        // this the "new" ui management
        tableName = tableName.replace("now/nav/ui/classic/params/target/", "").split("%3F")[0];
        sysId = url.pathname.split("%3D")[1].split("%26")[0];
    }
    // console.log("*SNOW TOOL BELT BG* tableName: " + tableName);
    // console.log("*SNOW TOOL BELT BG* sysId: " + sysId);
    if (!tableName || !sysId) {
        return false;
    }
    let createData = {
        type: "popup",
        url: "https://" + url.host + "/sys_update_version_list.do?sysparm_query=nameSTARTSWITH" + tableName + "_" + sysId,
        width: 1200,
        height: 500
    };
    // console.log(createData);
    let creating = chrome.windows.create(createData);
}

/**
 * Opens a new background script window on target instance
 * @param {Object} tab The tab from which the command was sent
 */
const openBackgroundScriptWindow = (tab) => {
    let url = new URL(tab.url);
    let createData = {
        type: "popup",
        url: "https://" + url.host + "/sys.scripts.modern.do",
        width: 700,
        height: 850
    };
    let creating = chrome.windows.create(createData);
}

/**
 * Handles a change event coming from storage
 * @param {Object} objChanged an object that contains the items that changed with newValue and oldValue
 * @param {String} area Storage area (should be "sync")
 */
function storageEvent(objChanged, area) {
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
            hostname = new URL(currentTab.url).hostname;
        } catch (e) {
            console.error("*SNOW TOOL BELT BG* Unable to get sender hostname: " + e);
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
            }

            // This is an instance we did not know about, save it
            if (context.knownInstances[hostname] === undefined) {
                context.knownInstances[hostname] = hostname;
                context.instanceOptions[hostname] = {
                    'hidden': false
                };
                saveContext();
            }

            response = { "isServiceNow": true, "favIconColor": color, "hidden": hidden };
        }
        console.log(response);
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
        console.log("*SNOW TOOL BELT BG* hostname=" + hostname);
    } catch (e) {
        console.error("*SNOW TOOL BELT BG* Unable to get sender hostname: " + e);
    }
    if (message.command === "execute-reframe" && message.tabid) {
        popIn(message.tabid);
        sendResponse(true);
        return true;
    }
    if (message.command === "removeCookie" && message.instance) {
        let targetInstance = message.instance;
        chrome.cookies.getAll({ "url": "https://" + targetInstance }, function (cookiesArray) {
            cookiesArray.forEach(function (cookie) {
                if (cookie.name.indexOf("BIGipServerpool") > -1 || cookie.name.indexOf("JSESSIONID") > -1 || cookie.name.indexOf("X-Mapping") > -1) {
                    chrome.cookies.remove({ "url": "https://" + targetInstance, "name": cookie.name });
                }
            });
        });
        sendResponse(true);
        return true;
    } else if (message.command === "isServiceNow" && sender.url) {
        sendResponse(isServiceNow(hostname));
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

