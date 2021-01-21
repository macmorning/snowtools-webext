const context = {
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1": "instance 1 name", "url2": "instance 2 name", ...}
    instanceOptions: {}, // { "url1": { "checkState": boolean, "colorSet": boolean, "color": color, "hidden": boolean}, "url2": ...}
    autoFrame: false,
    useSync: false,
    storageArea: {}
};

/**
 * Saves context into storage sync area
 */
function saveContext () {
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
    chrome.storage.local.get("useSync",(result1) => {
        context.useSync = result1.useSync;
        context.storageArea = (context.useSync ? chrome.storage.sync : chrome.storage.local);
        context.storageArea.get(["urlFilters", "knownInstances", "instanceOptions", "autoFrame"], (result) => {
            if (Object.keys(result).length === 0) {
                // Nothing is stored yet
                context.urlFilters = "service-now.com;";
                context.knownInstances = "{}";
                context.instanceOptions = "{}";
            } else {
                // remove http:// and https:// from filter string
                const regex = /http[s]{0,1}:\/\//gm;
                const regex2 = /\/[^;]*/gm;
                context.urlFilters = result.urlFilters.replace(regex, "").replace(regex2, "");
                context.knownInstances = result.knownInstances;
                context.instanceOptions = result.instanceOptions;
            }

            context.autoFrame = (result.autoFrame === "true" || result.autoFrame === true);
            context.urlFiltersArr = context.urlFilters.split(";");
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
            chrome.tabs.query({}, (tabs) => {
                for (var i = 0; i < tabs.length; ++i) {
                    let instance = new URL(tabs[i].url).hostname;
                    if (context.instanceOptions[instance] !== undefined && context.instanceOptions[instance]["color"]) {
                        chrome.tabs.sendMessage(tabs[i].id, {"command": "updateFavicon", "color": context.instanceOptions[instance]["color"]});
                    }
                }
            });

            console.log(context);
        });
    });
};

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
function tabUpdated (tabId, changeInfo, tab) {
    let url = new URL(tab.url);
    let instance = url.hostname;
    if (context.instanceOptions[instance] === undefined) {
        return false;
    }

    let exceptions = ["/navpage.do", "/stats.do", "/nav_to.do", "/cache.do", "/login.do", "/workflow_ide.do", "/hi_login.do", "/auth_redirect.do", "/ssologin.do", "/profile_update.do"];
    if (context.autoFrame && changeInfo.url !== undefined
         && url.pathname.substring(url.pathname.length - 3) === ".do"
         && exceptions.indexOf(url.pathname) === -1
         && url.pathname.substring(1,2) !== "$"
         ) {
        // url was changed, check if we should move it to the servicenow frame
        // in this version we consider that any .do page other than one in the exceptions array is out of the iframe and is not a portal or workspace page
        let newUrl = "https://" + url.host + "/nav_to.do?uri=" + encodeURI(url.pathname + url.search);
        chrome.tabs.update(tab.id, {url: newUrl});
    }
}

/**
 * Moves tab into a navigation frame
 * @param {String} tab The tab that needs to be poped in
 */
const popIn = (tabid) => {
    tabid = parseInt(tabid);
    chrome.tabs.get(tabid, (tab) => {
        let url = new URL(tab.url);
        if (url.pathname !== "/nav_to.do") {
            let newUrl = "https://" + url.host + "/nav_to.do?uri=" + encodeURI(url.pathname + url.search);
            chrome.tabs.update(tab.id, {url: newUrl});
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
    let url = new URL(tab.url);
    if (url.pathname == "/nav_to.do") {
        // this is a framed nav window, get the base uri
        url = new URL("https://" + url.host + url.searchParams.get("uri"));
    }
    var tableName = url.pathname.replace("/","").replace(".do","");
    var sysId = url.searchParams.get("sys_id");
    if (!tableName || !sysId) {
        return false;
    }
    let createData = {
        type: "popup",
        url: "https://" + url.host + "/sys_update_version_list.do?sysparm_query=nameSTARTSWITH" + tableName + "_" + sysId,
        width: 1200,
        height: 500
    };
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
        url: "https://" + url.host + "/sys.scripts.do",
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
function storageEvent (objChanged, area) {
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
    chrome.tabs.query({currentWindow: true, active: true}, (tabs) => {
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
            chrome.tabs.sendMessage(currentTab.id, { "command": command });
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
    context.urlFiltersArr.forEach(function (filter) {
        if (matchFound || filter.trim() === "") return true;
        if (hostname.indexOf(filter.trim()) > -1) {
            let color = "";
            let hidden = false;
            if (context.instanceOptions[hostname] !== undefined) {
                hidden = context.instanceOptions[hostname]["hidden"];
                color = context.instanceOptions[hostname]["color"];
            }
            matchFound = true;

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
        chrome.cookies.getAll({"url": "https://" + targetInstance}, function (cookiesArray) {
            cookiesArray.forEach(function (cookie) {
                if (cookie.name.indexOf("BIGipServerpool") > -1 || cookie.name.indexOf("JSESSIONID") > -1 || cookie.name.indexOf("X-Mapping") > -1) {
                    chrome.cookies.remove({"url": "https://" + targetInstance, "name": cookie.name});
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

chrome.runtime.onMessage.addListener(msgListener);
chrome.tabs.onUpdated.addListener(tabUpdated);
chrome.storage.onChanged.addListener(storageEvent);
chrome.commands.onCommand.addListener(cmdListener);
getOptions();
