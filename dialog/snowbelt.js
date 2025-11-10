let isChromium = (typeof browser === "undefined");

/**
 * Debug logging function
 */
const debugLog = (...args) => {
    if (context && context.debugMode) {
        console.log(...args);
    }
};



const context = {
    windowId: 1,
    tabCount: 0,
    collapseThreshold: 5,
    tabs: {}, // tabs splitted into instances objects
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1": "instance 1 name", "url2": "instance 2 name", ...}
    instanceOptions: {}, // { "url1": { "checkState": boolean, "colorSet": boolean, "color": color, "hidden": boolean}, "url2": ...}
    knownNodes: {},
    tempInformations: {}, // store temporary data per instance, such as nodes and updates
    showUpdatesets: true,
    useSync: false,
    extraDomains: false,
    storageArea: {},
    commands: {},
    updateSets: {}, // one value per window and instance
    frameExceptions: ["/navpage.do", "/stats.do", "/nav_to.do", "/cache.do", "/login.do", "/workflow_ide.do", "/hi_login.do", "/auth_redirect.do", "/ssologin.do", "/profile_update.do"] // URLs that should not be reframed

};

/**
 * Gets a valid window ID, handling cases where the stored windowId might not exist
 * @param {Function} callback Callback function that receives the valid window ID
 */
const getValidWindowId = (callback) => {
    if (context.windowId !== null) {
        // Try to verify the window still exists
        chrome.windows.get(context.windowId, (window) => {
            if (chrome.runtime.lastError) {
                // Window doesn't exist, find a new one
                chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
                    if (windows.length > 0) {
                        context.windowId = windows[0].id;
                        callback(context.windowId);
                    } else {
                        callback(null);
                    }
                });
            } else {
                callback(context.windowId);
            }
        });
    } else {
        // No window ID set, find one
        chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
            if (windows.length > 0) {
                context.windowId = windows[0].id;
                callback(context.windowId);
            } else {
                callback(null);
            }
        });
    }
};

/**
 * Opens an update set record in a popup window
 * @param {string} instance - The instance hostname
 * @param {string} sysId - The sys_id of the update set
 * @param {string} name - The name of the update set (for display)
 */
const openUpdateSet = (instance, sysId, name) => {
    if (!sysId) {
        debugLog("*SNOW TOOL BELT* No sys_id provided for update set");
        return;
    }

    const url = `https://${instance}/sys_update_set.do?sys_id=${sysId}`;
    
    const createData = {
        type: "popup",
        url: url,
        width: 1200,
        height: 600
    };

    chrome.windows.create(createData);
    debugLog("*SNOW TOOL BELT* Opened update set:", name, "sys_id:", sysId);
};

/**
 * Makes an update set name clickable
 * @param {HTMLElement} element - The span element containing the update set name
 * @param {string} instance - The instance hostname
 * @param {number} windowId - The window ID
 */
const makeUpdateSetClickable = (element, instance, windowId) => {
    console.log("*SNOW TOOL BELT* makeUpdateSetClickable called for", instance, windowId);
    
    if (!element) {
        console.log("*SNOW TOOL BELT* No element provided");
        return;
    }
    
    if (!context.updateSets[windowId]) {
        console.log("*SNOW TOOL BELT* No updateSets for windowId", windowId);
        return;
    }
    
    if (!context.updateSets[windowId][instance]) {
        console.log("*SNOW TOOL BELT* No updateSets for instance", instance);
        return;
    }

    const updateSetData = context.updateSets[windowId][instance];
    console.log("*SNOW TOOL BELT* Update set data:", updateSetData);
    
    // Check for both sys_id and sysId (API returns sysId in camelCase)
    const sysId = updateSetData.current?.sys_id || updateSetData.current?.sysId;
    
    if (updateSetData.current && sysId) {
        console.log("*SNOW TOOL BELT* Making update set clickable:", updateSetData.current.name, "sys_id:", sysId);
        
        element.style.cursor = 'pointer';
        element.style.textDecoration = 'underline';
        element.title = `Click to open: ${updateSetData.current.name}`;
        
        // Store data attributes for the click handler
        element.setAttribute('data-update-set-sys-id', sysId);
        element.setAttribute('data-update-set-name', updateSetData.current.name);
        element.setAttribute('data-update-set-instance', instance);
        
        // Remove any existing click handlers by cloning
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        
        // Add click handler to the new element
        newElement.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sysId = newElement.getAttribute('data-update-set-sys-id');
            const name = newElement.getAttribute('data-update-set-name');
            const inst = newElement.getAttribute('data-update-set-instance');
            console.log("*SNOW TOOL BELT* Update set clicked:", name, "sys_id:", sysId);
            openUpdateSet(inst, sysId, name);
        });
        
        console.log("*SNOW TOOL BELT* Update set is now clickable");
    } else {
        console.log("*SNOW TOOL BELT* No sys_id in update set data");
    }
};

/**
 * Finds the first active and responsive tab for a given instance
 * Searches through the tabs cache and pings each non-discarded tab to verify content script availability
 * @param {string} instance - The instance hostname to search for
 * @param {Function} callback - Callback function that receives the tab ID (or null if none found)
 */
const findFirstActiveTab = (instance, callback) => {
    if (!context.tabs[instance]) {
        debugLog("*SNOW TOOL BELT* No tabs found for instance:", instance);
        callback(null);
        return;
    }

    // Collect all non-discarded tabs for this instance
    const candidateTabs = [];
    for (const winkey in context.tabs[instance]) {
        for (let i = 0; i < context.tabs[instance][winkey].length; i++) {
            const tab = context.tabs[instance][winkey][i];
            if (!tab.discarded) {
                candidateTabs.push(tab);
            }
        }
    }

    if (candidateTabs.length === 0) {
        debugLog("*SNOW TOOL BELT* No non-discarded tabs found for instance:", instance);
        callback(null);
        return;
    }

    debugLog("*SNOW TOOL BELT* Found", candidateTabs.length, "candidate tabs for instance:", instance);

    // Try each candidate tab until we find one that responds
    let currentIndex = 0;

    const tryNextTab = () => {
        if (currentIndex >= candidateTabs.length) {
            // No responsive tabs found
            debugLog("*SNOW TOOL BELT* No responsive tabs found for instance:", instance);
            callback(null);
            return;
        }

        const tab = candidateTabs[currentIndex];
        debugLog("*SNOW TOOL BELT* Pinging tab", tab.id, "for instance:", instance);

        // Ping the tab with a simple command to check if content script is available
        chrome.tabs.sendMessage(tab.id, { command: "ping" }, (response) => {
            if (chrome.runtime.lastError) {
                // Content script not available, try next tab
                debugLog("*SNOW TOOL BELT* Tab", tab.id, "not responsive:", chrome.runtime.lastError.message);
                currentIndex++;
                tryNextTab();
            } else {
                // Found a responsive tab
                debugLog("*SNOW TOOL BELT* Found responsive tab:", tab.id);
                callback(tab.id);
            }
        });
    };

    tryNextTab();
};

/**
 * Displays a toast notification in the top right corner
 * @param {String} txt Message to display.
 * @param {boolean} autohide Automatically hide after n seconds (default: true)
 */
const displayMessage = (txt, autohide) => {
    if (autohide === undefined) autohide = true;

    // Remove any existing toast notifications
    const existingToasts = document.querySelectorAll('.sntb-toast-notification');
    existingToasts.forEach(toast => toast.remove());

    // Create the toast notification
    const toast = document.createElement('div');
    toast.className = 'sntb-toast-notification';
    toast.innerHTML = `
        <div class="toast-content">
            ${txt.toString()}
        </div>
    `;

    // Add to document
    document.body.appendChild(toast);

    // Auto-hide after 4 seconds if autohide is true
    if (autohide) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('toast-fade-out');
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 300); // Wait for fade-out animation
            }
        }, 4000);
    }
};

/**
 * Switches to the tab that has the same id as the event target
 * @param {object} evt the event that triggered the action
 */
const switchTab = (evt) => {
    // evt target could be the span containing the tab title instead of the list item
    let id = (evt.target.id ? evt.target.id : evt.target.parentNode.id);

    chrome.tabs.update(parseInt(id.replace("tab", "")), { active: true });
};

/**
 * Finds an existing tab group for a specific instance
 * @param {string} instance - The instance hostname
 * @param {number} windowId - The window ID
 * @returns {Promise<number|null>} The group ID if found, null otherwise
 */
const findExistingGroupForInstance = async (instance, windowId) => {
    // Check if tabGroups API is available
    if (!chrome.tabs.group || !chrome.tabGroups) {
        return null; // Return null immediately if API not available
    }

    try {
        // Get all tabs for this instance in the specified window
        const allTabs = await chrome.tabs.query({ windowId: windowId });
        const instanceTabs = allTabs.filter(tab => {
            if (!tab.url) return false;
            try {
                const url = new URL(tab.url);
                return url.hostname === instance;
            } catch (e) {
                return false;
            }
        });

        // Check if any instance tab is in a group
        for (const tab of instanceTabs) {
            if (tab.groupId && tab.groupId !== -1) {
                return tab.groupId;
            }
        }

        return null;
    } catch (error) {
        debugLog("*SNOW TOOL BELT* Error finding existing group:", error);
        return null;
    }
};

/**
 * Maps instance colors to Chrome tab group colors
 * @param {string} instanceColor - The hex color for the instance
 * @returns {string} Chrome tab group color name
 */
const mapInstanceColorToTabGroupColor = (instanceColor) => {
    if (!instanceColor) return 'grey';

    // Convert hex to RGB for color matching
    const hex = instanceColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Map to closest Chrome tab group color
    // Chrome supports: grey, blue, red, yellow, green, pink, purple, cyan, orange
    const colors = [
        { name: 'red', r: 244, g: 67, b: 54 },
        { name: 'orange', r: 255, g: 152, b: 0 },
        { name: 'yellow', r: 255, g: 235, b: 59 },
        { name: 'green', r: 76, g: 175, b: 80 },
        { name: 'cyan', r: 0, g: 188, b: 212 },
        { name: 'blue', r: 33, g: 150, b: 243 },
        { name: 'purple', r: 156, g: 39, b: 176 },
        { name: 'pink', r: 233, g: 30, b: 99 },
        { name: 'grey', r: 158, g: 158, b: 158 }
    ];

    // Find closest color by Euclidean distance
    let closestColor = 'grey';
    let minDistance = Infinity;

    colors.forEach(color => {
        const distance = Math.sqrt(
            Math.pow(r - color.r, 2) +
            Math.pow(g - color.g, 2) +
            Math.pow(b - color.b, 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color.name;
        }
    });

    return closestColor;
};

/**
 * Context menu handler for grouping tabs
 * @param {object} evt - The event object
 */
const groupTabs = (evt) => {
    const instance = context.clicked.getAttribute("data-instance");
    if (instance) {
        // Test API availability first
        debugLog("*SNOW TOOL BELT* Testing tab groups API availability");
        debugLog("*SNOW TOOL BELT* chrome.tabs.group exists:", !!(chrome.tabs && chrome.tabs.group));
        debugLog("*SNOW TOOL BELT* chrome.tabGroups exists:", !!chrome.tabGroups);
        debugLog("*SNOW TOOL BELT* chrome.tabGroups.update exists:", !!(chrome.tabGroups && chrome.tabGroups.update));

        groupInstanceTabs(instance);
    }
};

/**
 * Reloads all tabs for a specific instance
 * @param {object} evt - The event object
 */
const reloadInstanceTabs = (evt) => {
    const instance = context.clicked.getAttribute("data-instance");
    const windowId = context.clicked.getAttribute("data-window-id");
    
    if (instance) {
        chrome.runtime.sendMessage({
            "command": "execute-reloadtabs",
            "instance": instance,
            "windowId": windowId ? parseInt(windowId) : null
        }, (response) => {
            if (chrome.runtime.lastError) {
                displayMessage("Failed to reload tabs: " + chrome.runtime.lastError.message, true);
            } else if (response && response.success) {
                displayMessage(response.message, false);
            } else {
                displayMessage("Failed to reload tabs: " + (response && response.message ? response.message : "Unknown error"), true);
            }
        });
    }
};

/**
 * Groups tabs for a specific instance (Chrome only)
 * @param {string} instance - The instance hostname
 */
const groupInstanceTabs = async (instance) => {
    // Check if tabGroups API is available
    if (!chrome.tabs.group || !chrome.tabGroups) {
        displayMessage("Tab groups are not supported in this browser", true);
        debugLog("*SNOW TOOL BELT* Tab groups not available - chrome.tabs.group:", !!chrome.tabs.group, "chrome.tabGroups:", !!chrome.tabGroups);
        return;
    }

    try {
        debugLog("*SNOW TOOL BELT* Starting tab grouping for instance:", instance);

        // Get all tabs for this instance in current window
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        debugLog("*SNOW TOOL BELT* Found", allTabs.length, "total tabs in window");

        const instanceTabs = allTabs.filter(tab => {
            if (!tab.url) return false;
            try {
                const url = new URL(tab.url);
                return url.hostname === instance;
            } catch (e) {
                return false;
            }
        });

        debugLog("*SNOW TOOL BELT* Found", instanceTabs.length, "tabs for instance", instance);

        if (instanceTabs.length === 0) {
            displayMessage("No tabs found for this instance", true);
            return;
        }

        if (instanceTabs.length === 1) {
            displayMessage("Only one tab found - grouping requires multiple tabs", true);
            return;
        }

        // Check if any of the instance tabs are already in a group
        let existingGroupId = null;

        for (const tab of instanceTabs) {
            if (tab.groupId && tab.groupId !== -1) {
                existingGroupId = tab.groupId;
                debugLog("*SNOW TOOL BELT* Found existing group:", existingGroupId);
                break;
            }
        }

        let targetGroupId = existingGroupId;

        // If no existing group, create a new one
        if (!existingGroupId) {
            debugLog("*SNOW TOOL BELT* No existing group found, creating new group");

            // Extract instance name (first part before first dot)
            const instanceName = instance.split('.')[0];
            debugLog("*SNOW TOOL BELT* Instance name for group:", instanceName);

            // Get instance color for tab group
            const instanceColor = (context.instanceOptions && context.instanceOptions[instance] && context.instanceOptions[instance].color) || '#4285f4'; // Default to blue
            const groupColor = mapInstanceColorToTabGroupColor(instanceColor);
            debugLog("*SNOW TOOL BELT* Instance color:", instanceColor, "-> Group color:", groupColor);

            // Create new group with all tabs
            const tabIds = instanceTabs.map(tab => tab.id);
            debugLog("*SNOW TOOL BELT* Creating group with tab IDs:", tabIds);

            targetGroupId = await chrome.tabs.group({
                tabIds: tabIds
            });

            debugLog("*SNOW TOOL BELT* Created group with ID:", targetGroupId);

            // Configure the group
            await chrome.tabGroups.update(targetGroupId, {
                title: instanceName,
                color: groupColor,
                collapsed: false
            });

            debugLog("*SNOW TOOL BELT* Updated group with title and color");

            displayMessage(`Created "${instanceName}" group with ${instanceTabs.length} tabs`, true);
        } else {
            // Move remaining tabs to existing group
            const tabsToGroup = instanceTabs.filter(tab => tab.groupId !== targetGroupId).map(tab => tab.id);

            if (tabsToGroup.length === 0) {
                displayMessage(`All ${instanceTabs.length} tabs are already grouped`, true);
                return;
            }

            debugLog("*SNOW TOOL BELT* Adding tabs to existing group:", tabsToGroup);

            await chrome.tabs.group({
                groupId: targetGroupId,
                tabIds: tabsToGroup
            });

            displayMessage(`Added ${tabsToGroup.length} tabs to existing group (${instanceTabs.length} total)`, true);
        }

    } catch (error) {
        debugLog("*SNOW TOOL BELT* Error grouping instance tabs:", error);
        console.error("*SNOW TOOL BELT* Full error details:", error);
        displayMessage("Error grouping tabs: " + error.message, true);
    }
};



/**
 * Creates a new tab and opens the url stored in the value of the event target or the url parameter
 * @param {object} evt the event that triggered the action
 * @param {string} url url that should be opened
 * @param {Integer} windowId Id of the window in which the new tab should be opened
 */
const newTab = async (evt, url, windowId) => {
    console.log("*SNOW TOOL BELT* newTab on: " + url);
    let targetUrl;
    let instance;

    // Get a valid window ID
    return new Promise((resolve) => {
        const processNewTab = (validWindowId) => {
            if (windowId === undefined) {
                windowId = (evt.target.getAttribute("data-window-id") ? parseInt(evt.target.getAttribute("data-window-id")) : validWindowId);
            }

            if (url) {
                instance = new URL(url).hostname;
                targetUrl = url;
            } else {
                instance = (evt.target.getAttribute("data-instance") ? evt.target.getAttribute("data-instance") : evt.target.value);
                targetUrl = "https://" + instance + "/";
            }

            // Create tab options
            const tabOptions = { url: targetUrl };

            // Only add windowId if we have a valid one
            if (validWindowId) {
                tabOptions.windowId = validWindowId;
            }

            // is there an open tab for this instance ? if yes, insert the new tab after the last one
            if (context.tabs[instance] !== undefined && context.tabs[instance][windowId] !== undefined) {
                let lastTab = context.tabs[instance][windowId][context.tabs[instance][windowId].length - 1];
                tabOptions.index = lastTab.index + 1;
            }

            // Create the new tab
            chrome.tabs.create(tabOptions).then(async (newTabResult) => {
                // Try to add to existing group if tabGroups API is available
                if (chrome.tabs.group && chrome.tabGroups) {
                    try {
                        // Find existing group for this instance
                        const existingGroupId = await findExistingGroupForInstance(instance, validWindowId);

                        if (existingGroupId) {
                            debugLog("*SNOW TOOL BELT* Adding new tab to existing group:", existingGroupId);
                            await chrome.tabs.group({
                                groupId: existingGroupId,
                                tabIds: [newTabResult.id]
                            });
                            debugLog("*SNOW TOOL BELT* Successfully added tab to group");
                        }
                    } catch (error) {
                        debugLog("*SNOW TOOL BELT* Error adding new tab to group:", error);
                        // Don't show error to user, just log it - tab creation still succeeded
                    }
                }

                resolve(newTabResult);
            }).catch((error) => {
                debugLog("*SNOW TOOL BELT* Error creating tab:", error);
                displayMessage("Error creating tab: " + error.message);
                resolve(null);
            });
        };

        // Get a valid window ID and process the tab creation
        getValidWindowId(processNewTab);
    });
};

/**
 * Handles when an instance checkbox is clicked (collapse)
 * @param {object} evt the event that triggered the action
 */
const checkInstance = (evt) => {
    let instance = evt.target.getAttribute("data-instance");
    if (context.instanceOptions[instance] === undefined) {
        context.instanceOptions[instance] = {};
    }
    context.instanceOptions[instance]["checkState"] = evt.target.checked;
    saveInstanceOptions();
};

/**
 * Closes a tab given its id
 * @param {object} evt the event that triggered the action
 */
const closeTab = (evt) => {
    let tabid = parseInt(evt.target.getAttribute("data-id"));
    chrome.tabs.remove(tabid);
};

/**
 * Moves tab into a navigation frame
 * @param {object} evt the event that triggered the action
 */


const popIn = (evt) => {
    let tabid = "";
    if (evt.target.getAttribute("data-id")) {
        tabid = evt.target.getAttribute("data-id");
    } else if (context.clicked && context.clicked.getAttribute("data-id")) {
        tabid = context.clicked.getAttribute("data-id");
    }
    tabid = parseInt(tabid);
    chrome.tabs.get(tabid, (tab) => {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
            displayMessage("Cannot reframe this type of page");
            return;
        }
        try {
            let url = new URL(tab.url);
            if (url.pathname !== "/nav_to.do") {
                chrome.runtime.sendMessage({ command: "execute-reframe", tabid: tabid });
            } else {
                displayMessage("Already in a frame");
            }
        } catch (e) {
            displayMessage("Cannot reframe this page");
        }
    });
};

/**
 * Loads keyboard shortcuts and displays them in the shortcuts button tooltip
 */
const loadShortcutsTooltip = () => {
    if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.getAll) {
        chrome.commands.getAll((commands) => {
            if (commands && commands.length > 0) {
                let tooltipText = "Keyboard shortcuts:\n";
                commands.forEach((command) => {
                    if (command.shortcut) {
                        const description = command.name === '_execute_action' ? 'Open tools popup' : command.description;
                        tooltipText += `${description}: ${command.shortcut}\n`;
                    }
                });
                // Remove the last newline and set the tooltip
                tooltipText = tooltipText.trim();
                const shortcutsButton = document.getElementById("shortcuts");
                if (shortcutsButton) {
                    shortcutsButton.title = tooltipText;
                }
            }
        });
    }
};

/**
 * Closes all tabs given their instance
 * @param {object} evt the event that triggered the action
 */
const closeTabs = (evt) => {
    let instance = evt.target.getAttribute("data-instance");
    let windowId = evt.target.getAttribute("data-window-id");
    context.tabs[instance][windowId].forEach((tab) => {
        chrome.tabs.remove(parseInt(tab.id));
    });
};


/**
 * Lets the user hide selected instance
 * @param {object} evt the event that triggered the action
 */
const hideInstance = (evt) => {
    let targetInstance = "";
    let windowId = context.windowId;
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
        windowId = evt.target.getAttribute("data-window-id");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
        windowId = context.clicked.getAttribute("data-window-id");
    }

    elements = document.querySelectorAll("li[data-instance=\"" + targetInstance + "\"");
    [].forEach.call(elements, (el) => {
        el.classList.add("hidden");
    });
    context.instanceOptions[targetInstance]["hidden"] = true;
    saveInstanceOptions();
};

/**
 * Lets the user edit the name of the instance
 * @param {object} evt the event that triggered the action
 */
const renameInstance = (evt) => {
    let targetInstance = "";
    let windowId = context.windowId;
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
        windowId = evt.target.getAttribute("data-window-id");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
        windowId = context.clicked.getAttribute("data-window-id");
    }

    let instanceLabel = document.querySelector("div.instance-label[data-instance='" + targetInstance + "'][data-window-id='" + windowId + "']");
    if (!instanceLabel) { return false; }
    instanceLabel.setAttribute("contenteditable", "true");
    instanceLabel.focus();
    var range = document.createRange();
    var sel = window.getSelection();
    range.setStart(instanceLabel, 0);
    range.setEnd(instanceLabel, 1);
    // range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
};

/**
 * Opens the search dialog for system ID lookup
 * @param {object} evt the event that triggered the action
 */
const openSearchDialog = (evt) => {
    getValidWindowId((validWindowId) => {
        let targetInstance = "";
        let windowId = validWindowId;
        if (evt.target.getAttribute("data-instance")) {
            targetInstance = evt.target.getAttribute("data-instance");
            windowId = evt.target.getAttribute("data-window-id") || validWindowId;
        } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
            targetInstance = context.clicked.getAttribute("data-instance");
            windowId = context.clicked.getAttribute("data-window-id") || validWindowId;
        }

        // Store the target instance for the search
        context.searchTargetInstance = targetInstance;
        context.searchWindowId = windowId;

        // Clear previous search results
        const searchInput = document.getElementById("objectSearchInput");
        const searchResults = document.getElementById("searchResults");
        if (searchInput) {
            searchInput.value = "";
            searchInput.classList.remove("valid", "invalid", "sys-id", "object-name");
        }
        if (searchResults) searchResults.innerText = "";

        // Show the search dialog
        location.hash = "searchDialog";

        // Focus the input field after a short delay to ensure the dialog is visible
        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 100);
    });
};

/**
 * Performs the system ID search
 */
/**
 * Validate if a string looks like a valid ServiceNow sys_id
 * @param {string} input - The string to validate
 * @returns {boolean} True if it looks like a valid sys_id
 */
const isValidSysId = (input) => {
    // ServiceNow sys_id should be exactly 32 alphanumeric characters
    const sysIdPattern = /^[a-fA-F0-9]{32}$/;
    return sysIdPattern.test(input);
};

/**
 * Determines the search type based on input
 * @param {string} input - The search input
 * @returns {object} Object with type and value
 */
const determineSearchType = (input) => {
    const trimmedInput = input.trim();

    if (trimmedInput.length === 32 && /^[a-fA-F0-9]{32}$/.test(trimmedInput)) {
        return { type: 'sysId', value: trimmedInput };
    } else if (trimmedInput.length > 0) {
        // Check if it's a starts with search (ends with *)
        const isStartsWith = trimmedInput.endsWith('*');

        if (isStartsWith) {
            // For wildcard searches, require at least 4 characters before the *
            const searchTerm = trimmedInput.slice(0, -1); // Remove the *
            if (searchTerm.length < 4) {
                return { type: 'invalid', value: trimmedInput, error: 'Wildcard searches require at least 4 characters before the *' };
            }
        }

        // Check if it looks like a ServiceNow number (letters followed by digits, no wildcard)
        // Examples: INC0001234, REQ0005678, RITM0012345, CHG0001234
        if (!isStartsWith && /^[A-Za-z]+\d+$/.test(trimmedInput)) {
            return {
                type: 'number',
                value: trimmedInput
            };
        }

        return {
            type: 'multiSearch',
            value: trimmedInput,
            isStartsWith: isStartsWith
        };
    } else {
        return { type: 'invalid', value: '' };
    }
};

const performSearch = () => {
    const searchInputElement = document.getElementById("objectSearchInput");
    const searchResults = document.getElementById("searchResults");
    const globalSearchCheckbox = document.getElementById("globalSearchCheckbox");

    if (!searchInputElement || !searchResults) return;

    const searchInput = searchInputElement.value.trim();

    if (!searchInput) {
        searchResults.innerHTML = '<div class="search-empty">Please enter a search term</div>';
        return;
    }

    // Determine search type
    const searchType = determineSearchType(searchInput);

    if (searchType.type === 'invalid') {
        searchResults.innerHTML = '<div class="search-empty">Please enter a valid search term</div>';
        return;
    }

    // Get global search preference (only relevant for sys_id searches)
    const globalSearch = globalSearchCheckbox ? globalSearchCheckbox.checked : false;

    // Hide help text during search
    const searchHelp = document.getElementById("searchHelp");
    if (searchHelp) searchHelp.classList.add("hidden");

    const targetInstance = context.searchTargetInstance;
    const windowId = context.searchWindowId;

    // Disable UI elements during search
    searchInputElement.disabled = true;
    const searchButton = document.getElementById("searchButton");
    if (searchButton) searchButton.disabled = true;

    // Show loading animation
    showSearchLoader(true);

    // Find a responsive tab for the instance
    findFirstActiveTab(targetInstance, (tabId) => {
        if (tabId === null) {
            showSearchLoader(false);
            searchInputElement.disabled = false;
            if (searchButton) searchButton.disabled = false;
            searchResults.innerText = "No active tab available for this instance to perform the search.";
            return;
        }

        // Show appropriate loading message
        if (searchType.type === 'sysId') {
            if (globalSearch) {
                showSearchProgress("Searching popular tables first.");
                // After 2 seconds, update message to indicate extended search
                context.searchProgressTimeout = setTimeout(() => {
                    showSearchProgress("The record was not found in popular tables. Now searching everywhere.<br><small>It may take a while.</small>");
                }, 2000);
            } else {
                showSearchProgress("Searching common tables.");
            }
        }

        // Send message to content script
        chrome.tabs.sendMessage(tabId, {
            "command": "searchObject",
            "searchType": searchType.type,
            "searchValue": searchType.value,
            "instance": targetInstance,
            "globalSearch": globalSearch
        }, (response) => {
        showSearchLoader(false);

        // Clear progress timeout if it exists
        if (context.searchProgressTimeout) {
            clearTimeout(context.searchProgressTimeout);
            context.searchProgressTimeout = null;
        }

        // Re-enable UI elements
        searchInputElement.disabled = false;
        const searchButton = document.getElementById("searchButton");
        if (searchButton) searchButton.disabled = false;

        if (chrome.runtime.lastError) {
            searchResults.innerHTML = `
                <div class="search-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-content">
                        <strong>Connection Error</strong><br>
                        <small>The content script is not available on this tab. Please reload the tab and try again.</small>
                    </div>
                </div>
            `;
            return;
        }

        if (response && (response.status === 200 || response.status === 404)) {
            displaySearchResults(response);
        } else if (response && response.status !== 200 && response.status !== 404) {
            searchResults.innerText = `Search failed with status: ${response.status}`;
        } else {
            searchResults.innerText = "No response from the tab. Try refreshing the page.";
        }
        });
    });
};

/**
 * Shows or hides the search loading animation
 * @param {boolean} show - Whether to show the loading animation
 */
const showSearchLoader = (show) => {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) return;

    if (show) {
        let dotIndex = 0;
        searchResults.innerHTML = `
            <div>Searching<span id='searchDots'><span class='dot1'>.</span><span class='dot2'>.</span><span class='dot3'>.</span></span></div>
            <div class="search-reminder">
                ⚠️ Please keep this popup open until the search completes
            </div>
        `;

        // Animate the dots by cycling their opacity
        const animateDots = () => {
            const dotsElement = document.getElementById("searchDots");
            if (dotsElement) {
                const dots = dotsElement.querySelectorAll('span');

                // Reset all dots to low opacity
                dots.forEach(dot => {
                    dot.classList.remove('dot-active');
                    dot.classList.add('dot-inactive');
                });

                // Show dots progressively: 0 dots, 1 dot, 2 dots, 3 dots, then repeat
                for (let i = 0; i < dotIndex; i++) {
                    if (dots[i]) {
                        dots[i].classList.remove('dot-inactive');
                        dots[i].classList.add('dot-active');
                    }
                }

                dotIndex = (dotIndex + 1) % 4; // 0, 1, 2, 3, then back to 0
                context.searchAnimation = setTimeout(animateDots, 400);
            }
        };

        context.searchAnimation = setTimeout(animateDots, 500);
    } else {
        // Clear the animation
        if (context.searchAnimation) {
            clearTimeout(context.searchAnimation);
            context.searchAnimation = null;
        }
    }
};

/**
 * Shows search progress with a specific message
 * @param {string} message - Progress message to display
 */
const showSearchProgress = (message) => {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) return;

    searchResults.innerHTML = `
        <div class="search-progress">
            <div class="progress-message">${message}</div>
            <div class="progress-dots">
                <span class="dot1">.</span><span class="dot2">.</span><span class="dot3">.</span>
            </div>
        </div>
    `;
};

/**
 * Displays the search results
 * @param {object} response - The response from the content script
 */
const displaySearchResults = (response) => {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) return;



    if (response.found) {
        let resultHtml = '';

        if (response.searchType === 'sysId' || response.searchType === 'number') {
            // Single sys_id or number result - use same compact format as other results
            const safeUrl = DOMPurify.sanitize(response.directUrl);
            const safeDisplayValue = DOMPurify.sanitize(response.displayValue);
            const safeClass = DOMPurify.sanitize(response.actualClass);
            resultHtml = `
                <div class="search-results-list single-result">
                    <div class="search-result-item">
                        <div class="result-content">
                            <a href="#" class="result-name-link" data-url="${safeUrl}">${safeDisplayValue}</a>
                            <span class="result-class">${safeClass}</span>
                        </div>
                    </div>
                </div>
            `;
        } else if ((response.searchType === 'objectName' || response.searchType === 'multiSearch') && response.results) {
            // Group results by actual class name
            const groupedResults = {};
            response.results.forEach(result => {
                const classKey = result.actualClass || result.sourceTable || 'unknown';
                if (!groupedResults[classKey]) {
                    groupedResults[classKey] = [];
                }
                groupedResults[classKey].push(result);
            });

            // Sort class names alphabetically
            const classNames = Object.keys(groupedResults).sort();
            const hasMultipleClasses = classNames.length > 1;
            const resultClass = response.results.length === 1 ? 'single-result' : 'multiple-results';

            resultHtml = `<div class="search-results-list ${resultClass}">`;

            if (hasMultipleClasses) {
                // Multiple classes - show grouped results with expand/collapse
                classNames.forEach(className => {
                    const classResults = groupedResults[className];
                    // Sort results within each class alphabetically by name
                    classResults.sort((a, b) => {
                        const nameA = a.displayName || a.name || a.username || a.value || '';
                        const nameB = b.displayName || b.name || b.username || b.value || '';
                        return nameA.localeCompare(nameB);
                    });

                    const groupId = `group-${className.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    const isExpanded = classResults.length <= 3; // Auto-expand small groups
                    const safeClassName = DOMPurify.sanitize(className);

                    resultHtml += `
                        <div class="result-group">
                            <div class="result-group-header" data-group="${groupId}">
                                <span class="group-toggle ${isExpanded ? 'expanded' : 'collapsed'}">${isExpanded ? '▼' : '▶'}</span>
                                <span class="group-title">${safeClassName}</span>
                                <span class="group-count">(${classResults.length})</span>
                            </div>
                            <div class="result-group-content ${isExpanded ? 'expanded' : 'collapsed'}" id="${groupId}">
                    `;

                    classResults.forEach((result, index) => {
                        const displayName = result.displayName || result.name || result.username || result.value;
                        const safeDisplayName = DOMPurify.sanitize(displayName);
                        const safeUrl = DOMPurify.sanitize(result.directUrl);

                        resultHtml += `
                            <div class="search-result-item grouped" data-index="${index}">
                                <div class="result-content">
                                    <a href="#" class="result-name-link" data-url="${safeUrl}">${safeDisplayName}</a>
                                </div>
                            </div>
                        `;
                    });

                    resultHtml += `
                            </div>
                        </div>
                    `;
                });
            } else {
                // Single class - show flat list
                const className = classNames[0];
                const classResults = groupedResults[className];
                // Sort results alphabetically by name
                classResults.sort((a, b) => {
                    const nameA = a.displayName || a.name || a.username || a.value || '';
                    const nameB = b.displayName || b.name || b.username || b.value || '';
                    return nameA.localeCompare(nameB);
                });

                classResults.forEach((result, index) => {
                    const displayName = result.displayName || result.name || result.username || result.value;
                    const classToDisplay = result.actualClass || result.sourceTable || 'unknown';
                    const safeDisplayName = DOMPurify.sanitize(displayName);
                    const safeClass = DOMPurify.sanitize(classToDisplay);
                    const safeUrl = DOMPurify.sanitize(result.directUrl);

                    resultHtml += `
                        <div class="search-result-item" data-index="${index}">
                            <div class="result-content">
                                <a href="#" class="result-name-link" data-url="${safeUrl}">${safeDisplayName}</a>
                                <span class="result-class">${safeClass}</span>
                            </div>
                        </div>
                    `;
                });
            }

            resultHtml += '</div>';

            // Add warning if we hit the API limit
            if (response.hitLimit) {
                resultHtml += `
                    <div class="search-limit-warning">
                        <div class="warning-icon">⚠️</div>
                        <div class="warning-text">
                            <strong>Results limited to ${response.totalResults}</strong><br>
                            <small>There may be more results. Try a more specific search or increase the limit in options.</small>
                        </div>
                    </div>
                `;
            }
        }

        searchResults.innerHTML = resultHtml;

        // Add class to container based on result count
        if (response.searchType === 'objectName' && response.results && response.results.length > 1) {
            searchResults.classList.add('has-multiple-results');
        } else {
            searchResults.classList.remove('has-multiple-results');
        }

        // Add click handlers for all links
        const resultLinks = searchResults.querySelectorAll('.search-result-link, .sys-id-link, .result-name-link');
        resultLinks.forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                getValidWindowId((validWindowId) => {
                    newTab({ target: { getAttribute: () => null } }, url, validWindowId);
                });
            });
        });

        // Add expand/collapse handlers for grouped results
        const groupHeaders = searchResults.querySelectorAll('.result-group-header');
        groupHeaders.forEach(header => {
            header.addEventListener('click', function (e) {
                e.preventDefault();
                const groupId = this.getAttribute('data-group');
                const groupContent = document.getElementById(groupId);
                const toggle = this.querySelector('.group-toggle');

                if (groupContent && toggle) {
                    const isExpanded = groupContent.classList.contains('expanded');

                    if (isExpanded) {
                        // Collapse
                        groupContent.classList.remove('expanded');
                        groupContent.classList.add('collapsed');
                        toggle.classList.remove('expanded');
                        toggle.classList.add('collapsed');
                        toggle.textContent = '▶';
                    } else {
                        // Expand
                        groupContent.classList.remove('collapsed');
                        groupContent.classList.add('expanded');
                        toggle.classList.remove('collapsed');
                        toggle.classList.add('expanded');
                        toggle.textContent = '▼';
                    }
                }
            });
        });
    } else {
        // No results found
        let resultHtml = `
            <div class="search-not-found">
                ❌ No results found for: <strong>${response.searchValue}</strong>
            </div>
            <div class="search-not-found-details">
                <strong>Instance:</strong> ${response.instance}<br>
        `;

        if (response.searchType === 'sysId' && response.searchedTables) {
            resultHtml += `<strong>Tables searched:</strong> ${response.searchedTables}<br>`;
            resultHtml += `The sys_id was not found in any accessible table on this instance.`;
        } else if (response.searchType === 'number') {
            resultHtml += `<strong>Table:</strong> ${response.table || 'unknown'}<br>`;
            resultHtml += `${response.displayValue || 'No record found with that number.'}`;
        } else if (response.searchType === 'objectName') {
            resultHtml += `No objects found with that exact name in sys_metadata.`;
        } else if (response.searchType === 'multiSearch') {
            resultHtml += `No matches found in sys_metadata, sys_user, or sys_user_group.`;
        }

        resultHtml += `
            </div>
        `;
        searchResults.innerHTML = resultHtml;
        searchResults.classList.remove('has-multiple-results');
    }
};

/**
 * Opens the colorPicker popup
 * @param {object} evt the event that triggered the action
 */
const selectColor = (evt) => {
    let targetInstance = "";
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
    }

    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    } else {
        document.getElementById("colorPicker").querySelector("[name='instanceName']").innerText = targetInstance;
        if (context.instanceOptions[targetInstance]["color"] !== undefined) {
            document.getElementById("colorPickerColor").value = context.instanceOptions[targetInstance]["color"];
        } else {
            document.getElementById("colorPickerColor").value = "#000000";
        }
    }
    // document.getElementById("colorPicker").style.display = "block";
    location.hash = "colorPicker";
};

/**
 * Starts scanning the instance nodes
 * @param {object} evt the event that triggered the action
 */
const scanNodes = (evt) => {
    let targetInstance = "";
    let windowId = context.windowId;
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
        windowId = evt.target.getAttribute("data-window-id");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
        windowId = context.clicked.getAttribute("data-window-id");
    }

    if (context.tempInformations[targetInstance] === undefined || context.tempInformations[targetInstance].nodes === undefined || context.tempInformations[targetInstance].nodes.length === 0) {
        showLoader(targetInstance, windowId, true);
        
        // Find a responsive tab for the instance
        findFirstActiveTab(targetInstance, (id) => {
            if (id === null) {
                showLoader(targetInstance, windowId, false);
                displayMessage("No tab is available to fetch nodes informations.");
                return;
            }

            chrome.tabs.sendMessage(id, { "command": "scanNodes" }, (response) => {
                showLoader(targetInstance, windowId, false);
                if (response !== undefined && response && response.status !== undefined && response.status === 200 && response.nodes !== undefined && response.nodes.length > 0) {
                    let nodes = response.nodes;
                    nodes.sort();
                    saveNodes(targetInstance, nodes, response.current);
                    refreshNodes(targetInstance, evt);
                } else if (response !== undefined && response.status !== undefined && response.status !== 200) {
                    displayMessage("Got http status " + response.status + "...");
                } else if (response === undefined) {
                    displayMessage("Couldn't get an answer from tab; try refreshing it.");
                }
            });
        });
    } else {
        refreshNodes(targetInstance, evt);
    }
};
/**
 * @description Shows or hides the loader indicator for target instance
 * @param {String} targetInstance 
 * @param {Integer} windowId
 * @param {boolean} enable 
 */
const showLoader = (targetInstance, windowId, enable) => {
    if (enable) {
        document.querySelector(".color-indicator[data-instance=\"" + targetInstance + "\"][data-window-id=\"" + windowId + "\"]").classList.add("loading");
    } else {
        document.querySelector(".color-indicator[data-instance=\"" + targetInstance + "\"][data-window-id=\"" + windowId + "\"]").classList.remove("loading");
    }
}
/**
 * Switch to instance node
 * @param {String} targetInstance
 * @param {String} targetNode
 */
const switchNode = (targetInstance, targetNode) => {
    location.hash = "";
    if (targetInstance === undefined || !targetInstance || targetNode === undefined || !targetNode) {
        console.warn("*switchNode* Missing targetInstance (" + targetInstance + ") or targetNode (" + targetNode + ")");
    }
    // Find a responsive tab for the instance
    findFirstActiveTab(targetInstance, (id) => {
        if (id === null) {
            displayMessage("No tab is available for node switch.");
            return;
        }

        // Get window ID from the found tab
        let windowId = context.windowId;
        for (var winkey in context.tabs[targetInstance]) {
            for (var i = 0; i < context.tabs[targetInstance][winkey].length; i++) {
                if (context.tabs[targetInstance][winkey][i].id === id) {
                    windowId = context.tabs[targetInstance][winkey][i].windowId;
                    break;
                }
            }
        }

        console.log("*switchNode* Switching " + targetInstance + " to " + targetNode);
        showLoader(targetInstance, windowId, true);
        chrome.tabs.sendMessage(id, { "command": "switchNode", "node": targetNode }, (response) => {
            showLoader(targetInstance, windowId, false);
            if (response && response.status === 200) {
                context.tempInformations[targetInstance].currentNode = response.current;
                displayMessage("Node switched to " + response.current);
            } else if (response.status !== 200) {
                displayMessage("Error switching to " + targetNode + " (" + response.message + ")");
            }
        });
    });
};

/**
 * Saves nodes in local context
 * @param {String} instanceName fqdn of target instance
 * @param {Array} nodes array of nodes names
 * @param {String} currentNode name of current node
 */
const saveNodes = (instanceName, nodes, currentNode) => {
    if (context.tempInformations[instanceName] === undefined) {
        context.tempInformations[instanceName] = {};
    }
    context.tempInformations[instanceName].nodes = nodes;
    context.tempInformations[instanceName].currentNode = currentNode;
};

/**
 * Rebuild the knownInstances from the object returned by sortProperties.
 * @param {Array} arr array of items in [[key,value],[key,value],...] format.
 */
const sortInstances = (arr) => {
    context.knownInstances = {};
    arr.forEach((item) => {
        context.knownInstances[item[0]] = item[1];
    });
};

/**
 * Sort object properties (only own properties will be sorted).
 * https://gist.github.com/umidjons/9614157
 * @author umidjons
 * @param {object} obj object to sort properties
 * @param {bool} isNumericSort true - sort object properties as numeric value, false - sort as string value.
 * @returns {Array} array of items in [[key,value],[key,value],...] format.
 */
const sortProperties = (obj, isNumericSort) => {
    isNumericSort = isNumericSort || false; // by default text sort
    var sortable = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) { sortable.push([key, obj[key]]); }
    }
    if (isNumericSort) {
        sortable.sort((a, b) => {
            return a[1] - b[1];
        });
    } else {
        sortable.sort((a, b) => {
            let x = a[1].toLowerCase();
            let y = b[1].toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        });
    }
    return sortable; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
};

/**
 * Saves the known instances; called after the open tabs have been parsed
 */
const saveKnownInstances = () => {
    context.storageArea.set({
        "knownInstances": JSON.stringify(context.knownInstances)
    }, function () {
        console.log("Saved instances to storage");
    });
};

/**
 * Saves the instances checked states
 */
const saveInstanceOptions = () => {
    context.storageArea.set({
        "instanceOptions": JSON.stringify(context.instanceOptions)
    }, () => {
        console.log("Saved instance options to storage");
    });
};

/**
 * Saves selected color
 * @param {object} evt the event that triggered the action
 */
const saveColor = (evt) => {
    let targetInstance = "";
    targetInstance = context.clicked.getAttribute("data-instance");
    // document.getElementById("colorPicker").style.display = "none";
    location.hash = "";
    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    }
    context.instanceOptions[targetInstance]["color"] = document.getElementById("colorPickerColor").value;
    updateColor(targetInstance);
    saveInstanceOptions();
};

/**
 * Saves no color for the instance
 * @param {object} evt the event that triggered the action
 */
const saveNoColor = (evt) => {
    let targetInstance = "";
    targetInstance = context.clicked.getAttribute("data-instance");
    // document.getElementById("colorPicker").style.display = "none";
    location.hash = "";
    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    }
    try {
        delete context.instanceOptions[targetInstance]["color"];
    } catch (e) {
        console.error(e);
    }
    updateColor(targetInstance);
    saveInstanceOptions();
};

/**
 * Updates the color indicator of target instance
 * @param {String} instance id of the instance color that needs an update
 */
const updateColor = (instance) => {
    color = (context.instanceOptions[instance]["color"] !== undefined ? context.instanceOptions[instance]["color"] : "black");
    elements = document.querySelectorAll("div.color-indicator[data-instance=\"" + instance + "\"");
    [].forEach.call(elements, (el) => {
        el.style.backgroundColor = color;
    });
};

/**
 * Retrieves saved options
 */
const getOptions = () => {

    chrome.commands.getAll((result) => {
        context.commands = result;
    });
    context.urlFilters = "service-now.com";
    context.urlFiltersArr = ["service-now.com"];
    context.extraDomains = false;
    context.knownInstances = {};
    context.instanceOptions = {};
    chrome.storage.local.get("useSync", (result1) => {
        context.useSync = result1.useSync;
        context.storageArea = (context.useSync ? chrome.storage.sync : chrome.storage.local);
        context.storageArea.get(["extraDomains", "urlFilters", "knownInstances", "instanceOptions", "showUpdatesets"], (result) => {
            context.extraDomains = (result.extraDomains === "true" || result.extraDomains === true);
            if (context.extraDomains) {
                context.urlFilters = result.urlFilters || "service-now.com";
                context.urlFiltersArr = context.urlFilters.split(";");
            }
            context.showUpdatesets = (result.showUpdatesets === "true" || result.showUpdatesets === true || result.showUpdatesets === undefined);
            try {
                context.knownInstances = JSON.parse(result.knownInstances);
            } catch (e) {
                context.knownInstances = {};
                console.error(e);
            }
            try {
                context.instanceOptions = JSON.parse(result.instanceOptions);
            } catch (e) {
                context.instanceOptions = {};
                console.error(e);
            }

            console.log("Loaded options");
            console.log(context);
            bootStrap();

            document.getElementById("config").addEventListener("click", openOptions);
            document.getElementById("open_in_panel").addEventListener("click", openInPanel);
            document.getElementById("show_news").addEventListener("click", showWhatsNew);
            document.getElementById("shortcuts").addEventListener("click", openShortcutsPage);

            // Load and display keyboard shortcuts in tooltip
            loadShortcutsTooltip();
            
            // Phase 3: Listen for real-time tab state updates from background
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.command === "tabStateUpdated") {
                    console.log("*SNOW TOOL BELT* Phase 3: Received tab state update for tab", message.tabId);
                    updateTabDisplayFromCache(message.tabId, message.tabState);
                }
            });


            document.getElementById("new_tab").addEventListener("change", newTab);
            document.getElementById("search_custom").addEventListener("click", searchNow);
            document.getElementById("search_doc").addEventListener("click", searchNow);
            document.getElementById("search_api").addEventListener("click", searchNow);
            document.getElementById("searchInput").addEventListener("keyup", function (event) {
                event.preventDefault();
                if (event.key === "Enter") {
                    document.getElementById("search_custom").click();
                }
            });
            document.getElementById("searchInput").focus();

            // Search dialog event listeners
            const searchInputElement = document.getElementById("objectSearchInput");
            const searchButton = document.getElementById("searchButton");

            if (searchButton) {
                searchButton.addEventListener("click", performSearch);
            }

            if (searchInputElement) {
                searchInputElement.addEventListener("keyup", function (event) {
                    if (event.key === "Enter") {
                        performSearch();
                    }
                });

                // Add real-time validation feedback
                searchInputElement.addEventListener("input", function (event) {
                    const value = event.target.value.trim();
                    const searchButton = document.getElementById("searchButton");
                    const searchHelp = document.getElementById("searchHelp");
                    const searchType = determineSearchType(value);

                    if (value === "") {
                        // Empty input - neutral state
                        if (searchButton) searchButton.disabled = false;
                        if (searchHelp) searchHelp.innerHTML = '<small>Enter a sys_id, number, object name, user name, group name... Add * at the end to force "starts with" search.</small>';
                    } else if (searchType.type === 'invalid') {
                        // Invalid input - disable search
                        if (searchButton) searchButton.disabled = true;
                        if (searchHelp && searchType.error) {
                            searchHelp.innerHTML = `<small class="error-text">${searchType.error}</small>`;
                        }
                    } else {
                        // Valid input (sysId, number, objectName, multiSearch) - enable search
                        if (searchButton) searchButton.disabled = false;
                        if (searchHelp) {
                            if (searchType.type === 'sysId') {
                                searchHelp.innerHTML = '<small>Searching by sys_id</small>';
                            } else if (searchType.type === 'number') {
                                searchHelp.innerHTML = '<small>Searching by ServiceNow number</small>';
                            } else {
                                searchHelp.innerHTML = '<small>Searching by name</small>';
                            }
                        }
                    }
                });
            }

            // listen to tabs events
            chrome.tabs.onUpdated.addListener(tabUpdated);
            chrome.tabs.onRemoved.addListener(tabRemoved);
            chrome.tabs.onAttached.addListener(tabAttached);
            chrome.tabs.onActivated.addListener(tabActivated);
        });
    });
};
/**
 * Searches on ServiceNow doc or api sites
 * @param {object} evt the event that triggered the action
 */
const searchNow = (evt) => {
    console.log("**** event on " + evt.target.id);
    let currentText = document.getElementById("searchInput").value;
    let targetUrl = "";
    if (evt.target.id === "search_doc") {
        targetUrl = "https://www.servicenow.com/docs/search?q=";
    } else if (evt.target.id === "search_api") {
        targetUrl = "https://developer.servicenow.com/dev.do#!/search/latest/Reference/";
    } else {
        targetUrl = "https://cse.google.com/cse?cx=009916188806958231212:pa-o5rpnjhs&ie=UTF-8&q=";
    }

    targetUrl = targetUrl + currentText;
    chrome.tabs.create({ url: targetUrl });
};

/**
 * Generates the list of links to the tabs
 */
const refreshList = () => {
    let openTabs = document.getElementById("opened_tabs");
    removeChildren(openTabs);
    for (var key in context.tabs) {
        let instanceName = "";
        if (context.knownInstances !== undefined && context.knownInstances[key] !== undefined) {
            // we already know about this instance
            instanceName = context.knownInstances[key];
        } else {
            // else, save instance url into the knownInstances object
            instanceName = key;
            context.knownInstances[key] = key;
            context.instanceOptions[key] = {};
        }
        for (var winkey in context.tabs[key]) {
            // get the html template structure for the instance row
            let templateInstance = document.getElementById("instance-row");
            // replace template placeholders with their actual values
            let checked = "";
            if (context.instanceOptions[key] !== undefined && context.instanceOptions[key]["checkState"] !== undefined) {
                checked = (context.instanceOptions[key]["checkState"] ? "checked" : "");
            } else {
                checked = (context.tabs[key].length <= context.collapseThreshold ? "" : "checked");
            }
            let instanceRow = templateInstance.innerHTML.toString().replace(/\{\{instanceName\}\}/g, instanceName).replace(/\{\{windowId\}\}/g, winkey).replace(/\{\{windowIdLabel\}\}/g, (winkey != 1 ? " [" + winkey + "]" : "")).replace(/\{\{instance\}\}/g, key).replace(/\{\{checked\}\}/g, checked);

            // get the html template structure for the tab row
            let templateLI = document.getElementById("tab-row");
            let tabList = "";

            context.tabs[key][winkey].forEach((tab, index) => {
                context.tabCount++;
                // replace template placeholders with their actual values
                tabList += templateLI.innerHTML.toString().replace(/\{\{tabid\}\}/g, tab.id).replace(/\{\{windowId\}\}/g, tab.windowId).replace(/\{\{instance\}\}/g, key).replace(/\{\{title\}\}/g, tab.title).replace(/\{\{contextid\}\}/g, index);
            });
            instanceRow = instanceRow.replace(/\{\{linksToTabs\}\}/g, tabList);
            openTabs.innerHTML += instanceRow;
        }
    }
    saveKnownInstances();
    saveInstanceOptions();

    if (context.tabCount === 0) {
        window.setTimeout(function () {
            getTip();
            // add next tip action
            document.getElementById("nextTip").addEventListener("click", nextTip);
        }, 300);
    } else {
        document.getElementById("tipsContainer").classList.add("hidden");
        setActiveTab();

        // add close tab actions
        let elements = {};
        elements = document.querySelectorAll("a[title=\"close tab\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", closeTab);
        });



        // add the "open on" menu
        elements = document.querySelectorAll("a[title=\"open on...\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", function (e) {
                context.clicked = e.target;
                let tabid = e.target.getAttribute("data-id");
                if (!tabid) return false;
                let items = [];
                Object.keys(context.knownInstances).forEach((instance) => {
                    if (context.instanceOptions !== undefined &&
                        (context.instanceOptions[instance] === undefined ||
                            context.instanceOptions[instance].hidden === undefined ||
                            context.instanceOptions[instance].hidden === false)) {
                        items.push({
                            title: "<span class='small-instance-label" + (context.tabs[instance] !== undefined ? " enhanced" : "") + "'>" + context.knownInstances[instance] + "</span>",
                            fn: () => {
                                chrome.tabs.get(parseInt(tabid), (tab) => {
                                    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
                                        displayMessage("Cannot open this type of page on another instance");
                                        return;
                                    }
                                    try {
                                        let url = new URL(tab.url);
                                        let newURL = "https://" + instance + url.pathname + url.search;
                                        newTab(e, newURL, tab.windowId);
                                    } catch (e) {
                                        displayMessage("Cannot open this page on another instance");
                                    }
                                });
                            }
                        });
                    }
                });
                basicContext.show(items, e);
            });
        });

        // add switch tab actions
        elements = document.querySelectorAll("li.link-to-tab");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", switchTab);
        });

        // add close tabs actions
        elements = document.querySelectorAll("a[title=\"reopen in a frame\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", popIn);
        });

        elements = document.querySelectorAll("a[title=\"close tabs\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", closeTabs);
        });

        // add open new tab actions
        elements = document.querySelectorAll("a[title=\"open a new tab\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", newTab);
        });

        // add search objects actions
        elements = document.querySelectorAll("a[title=\"search objects\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", (e) => {
                context.clicked = e.target;
                openSearchDialog(e);
            });
        });

        // add the "other actions" menu
        elements = document.querySelectorAll("a[title=\"other options\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", (e) => {
                context.clicked = e.target;
                let items = [
                    { title: "&#8681; Nodes", fn: scanNodes },
                    { title: "&#10000; Script", fn: openBackgroundScriptWindow },
                    { title: "&#8635; Reload tabs", fn: reloadInstanceTabs },
                    { title: "&#9088; Rename", fn: renameInstance },
                    { title: "&#128065; Hide", fn: hideInstance },
                    { title: "&#9776; Group", fn: groupTabs }
                ];
                basicContext.show(items, e);
            });
        });

        // Display colors
        elements = document.querySelectorAll("div.color-indicator");
        [].forEach.call(elements, (el) => {
            let instance = el.getAttribute("data-instance");
            let color = "";
            if (instance) {
                color = (context.instanceOptions[instance]["color"] !== undefined ? context.instanceOptions[instance]["color"] : "");
            }
            if (color) {
                el.style.backgroundColor = color;
            } else {
                el.style.backgroundColor = "black";
            }
            // add open color picker
            if (isChromium) {
                el.addEventListener("click", (e) => {
                    context.clicked = e.target;
                    selectColor(e);
                });
            } else {
                el.addEventListener("click", (e) => {
                    context.clicked = e.target;
                    openOptions(e);
                });
            }
        });

        // Instance name edition
        elements = document.querySelectorAll("div.instance-label[data-instance]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("keydown", (e) => {
                if (e.keyCode === 13) {
                    e.preventDefault();
                    e.target.blur();
                }
            });
            el.addEventListener("blur", (e) => {
                e.preventDefault();
                let newText = e.target.innerText.trim();
                e.target.innerText = newText;
                context.knownInstances[e.target.getAttribute("data-instance")] = newText;
                e.target.setAttribute("contenteditable", "false");
                let instanceElArray = document.querySelectorAll("div.instance-label[data-instance='" + el.getAttribute("data-instance") + "']");
                [].forEach.call(instanceElArray, (instanceEl) => {
                    instanceEl.innerText = newText;
                });
                saveKnownInstances();
                refreshKnownInstances();
            });
        });

        // add switch node actions
        elements = document.querySelectorAll(".nodes-list");
        [].forEach.call(elements, (el) => {
            el.addEventListener("change", switchNode);
        });

        // add check listener
        elements = document.querySelectorAll(".instance-checkbox");
        [].forEach.call(elements, (el) => {
            el.addEventListener("change", checkInstance);
        });

        // Save and close button
        document.getElementById("popin_color").addEventListener("click", saveColor);
        document.getElementById("popin_no_color").addEventListener("click", saveNoColor);

        // Phase 2: Load tab info from cache instead of making API calls
        console.log("*SNOW TOOL BELT* Phase 2: Loading tab states from cache");
        chrome.runtime.sendMessage({ command: "getTabStateCache" }, (response) => {
            if (response && response.cache) {
                console.log("*SNOW TOOL BELT* Phase 2: Received cache with", Object.keys(response.cache.tabs).length, "tabs");
                const cache = response.cache;
                
                for (let key2 in context.tabs) {
                    for (let key3 in context.tabs[key2]) {
                        context.tabs[key2][key3].forEach((tab, index) => {
                            updateTabInfoFromCache(key2, key3, index, cache);
                        });
                    }
                }
            } else {
                console.log("*SNOW TOOL BELT* Phase 2: No cache available, falling back to legacy method");
                // Fallback to legacy method if cache not available
                for (let key2 in context.tabs) {
                    for (let key3 in context.tabs[key2]) {
                        context.tabs[key2][key3].forEach((tab, index) => {
                            updateTabInfo(key2, key3, index);
                        });
                    }
                }
            }
        });

        // Update set indicator
        if (context.showUpdatesets) {
            elements = document.querySelectorAll(".updateset");
            [].forEach.call(elements, (el) => {
                el.classList.add("show");
            });
        }
    }
};

/**
 * Generates the select list of known instances
 */
const refreshKnownInstances = () => {
    let selectInstance = document.getElementById("new_tab");
    removeChildren(selectInstance);
    sortInstances(sortProperties(context.knownInstances, false));

    let optionDefault = document.createElement("option");
    optionDefault.text = "select a known instance to open a new tab";
    selectInstance.appendChild(optionDefault);

    for (var instanceKey in context.knownInstances) {
        if (!context.instanceOptions[instanceKey].hidden) {
            let option = document.createElement("option");
            option.text = context.knownInstances[instanceKey];
            option.setAttribute("value", instanceKey);
            option.setAttribute("data-instance", instanceKey);
            selectInstance.appendChild(option);
        }
    }
};

/**
 * Generates the list of links to the tabs
 * @param {Object} elt parent node
 */
const removeChildren = (elt) => {
    while (elt.lastChild) {
        elt.removeChild(elt.lastChild);
    }
};

/**
 * Generates the list of links to the tabs
 * @param {String} instance optional - the instance for which we want to refresh the nodes list
 * @param {Event} evt optional - the original event, used to hook the popup
 */
const refreshNodes = (instance, evt) => {
    basicContext.close();
    if (context.tempInformations[instance].nodes === undefined) { return false; }
    let items = [];
    const selectNode = (evt) => {
        switchNode(instance, evt.target.innerText);
    };
    let currentNode = context.tempInformations[instance].currentNode;
    let listEl = document.getElementById("nodeList");
    removeChildren(listEl);

    context.tempInformations[instance].nodes.forEach((item) => {
        let liEl = document.createElement("li");
        if (item == currentNode) {
            liEl.innerText = item + " (current)";
        } else {
            liEl.innerHTML = "<a href='#'>" + item + "</a>";
            liEl.addEventListener("click", selectNode);
        }
        listEl.appendChild(liEl);
    });
    // basicContext.show(items, evt);
    location.hash = "nodePicker";
};

/**
 * Returns the updated title
 * @param {String} title Original title of the tab
 */
const transformTitle = (title) => {
    let splittedName = title.toString().split("|");
    if (splittedName.length === 3) {
        // this is a specific object
        return splittedName[1].toString().trim() + " - " + splittedName[0].toString().trim();
    } else if (splittedName.length === 2) {
        // this is a list of objects
        return splittedName[0].toString().trim();
    } else {
        return title;
    }
};

/**
 * Reflects changes that occur when a tab is found or created
 * @param {Tab} tab the Tab object itself
 */
const tabCreated = (tab) => {
    // Ignore special browser pages and empty tabs
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('about:') || 
        tab.url.startsWith('edge://') ||
        tab.url === '') {
        return false;
    }
    
    let url;
    try {
        url = new URL(tab.url);
    } catch (e) {
        // Invalid URL, silently ignore
        console.log("*SNOW TOOL BELT* Could not parse tab URL:", tab.url);
        return false;
    }
    tab.instance = url.hostname;
    if (context.instanceOptions[tab.instance] !== undefined && context.instanceOptions[tab.instance]['hidden'] === true) {
        return false;
    }
    let matchFound = false;
    // testing each
    for (let i = 0; i < context.urlFiltersArr.length && matchFound !== true; i++) {
        let filter = context.urlFiltersArr[i].trim();
        if (filter !== "") {
            // each filter can match a pattern seach as equant.com or service-now.com
            let regex = new RegExp(filter.replace("*", "(.*)"));
            matchFound = (tab.instance.match(regex) ? true : false);
        }
    }
    if (matchFound) {
        tab.title = transformTitle(tab.title);
        // if this is the first tab we find for this instance, create the container in the context.tabs object
        if (!context.tabs.hasOwnProperty(tab.instance)) {
            context.tabs[tab.instance] = {};
        }
        // if this is the first tab we find for this instance and window, create the container in the context.tabs[tab.instance] object
        if (!context.tabs[tab.instance].hasOwnProperty(tab.windowId)) {
            context.tabs[tab.instance][tab.windowId] = [];
        }

        context.tabs[tab.instance][tab.windowId].push(tab);
        return true;
    }
    return false;
};

/**
 * Phase 3: Update tab display from real-time cache update
 * @param {number} tabId - The tab ID
 * @param {Object} tabState - The updated tab state
 */
const updateTabDisplayFromCache = (tabId, tabState) => {
    // Find the tab in context.tabs
    let found = false;
    for (let instance in context.tabs) {
        for (let windowId in context.tabs[instance]) {
            const tabIndex = context.tabs[instance][windowId].findIndex(t => t.id === tabId);
            if (tabIndex !== -1) {
                const tab = context.tabs[instance][windowId][tabIndex];
                tab.snt_type = tabState.type;
                tab.snt_details = tabState.details || "";
                tab.snt_tabs = tabState.tabs || [];
                
                // Update UI (only if debug mode is enabled)
                chrome.storage.local.get("debugMode", (result) => {
                    if (result.debugMode !== true) return;
                    
                    const typeEl = document.getElementById("tab" + tabId + "_type");
                    if (typeEl) {
                        switch (tabState.type) {
                            case "loading":
                                typeEl.innerText = "⏳";
                                typeEl.title = "Loading...";
                                break;
                            case "non responsive":
                                typeEl.innerText = "😴";
                                typeEl.title = "Content script is not available yet";
                                break;
                            case "portal":
                                typeEl.innerText = "⎆";
                                typeEl.title = "Service Portal";
                                break;
                            case "app studio":
                                typeEl.innerText = "✬";
                                typeEl.title = "App Studio: " + tabState.details;
                                break;
                            case "workspace":
                                typeEl.innerText = "⚒";
                                typeEl.title = "Workspace: " + JSON.stringify(tabState.tabs);
                                break;
                            default:
                                typeEl.innerText = "";
                                typeEl.title = "";
                        }
                        console.log("*SNOW TOOL BELT* Phase 3: Updated UI for tab", tabId, "type:", tabState.type);
                    }
                });
                
                // Update update set if provided
                if (tabState.updateSet && tabState.updateSet.current) {
                    if (context.updateSets[windowId] === undefined) { context.updateSets[windowId] = {}; }
                    context.updateSets[windowId][instance] = tabState.updateSet;
                    
                    const updateSetEl = document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span");
                    if (updateSetEl && tabState.updateSet.current.name) {
                        updateSetEl.innerText = tabState.updateSet.current.name;
                        updateSetEl.title = `Click to open: ${tabState.updateSet.current.name}`;
                        console.log("*SNOW TOOL BELT* Phase 3: Updated update set for", instance);
                        
                        // Make it clickable
                        makeUpdateSetClickable(updateSetEl, instance, windowId);
                    }
                }
                
                // Show/hide "reopen in frame" button based on URL
                try {
                    const url = new URL(tab.url);
                    const shouldShowReframeButton = url.pathname.endsWith(".do")
                        && context.frameExceptions.indexOf(url.pathname) === -1
                        && !url.pathname.startsWith("/$")
                        && !url.pathname.includes("now/nav/ui/classic/params/target");

                    const reframeButton = document.querySelector("a[data-id=\"" + tabId + "\"][title=\"reopen in a frame\"]");
                    if (reframeButton) {
                        if (shouldShowReframeButton) {
                            reframeButton.classList.remove("hidden");
                            reframeButton.classList.add("visible");
                        } else {
                            reframeButton.classList.remove("visible");
                            reframeButton.classList.add("hidden");
                        }
                    }
                } catch (e) {
                    console.log("*SNOW TOOL BELT* Phase 3: Error checking reframe button visibility:", e);
                }
                
                found = true;
                break;
            }
        }
        if (found) break;
    }
};

/**
 * Phase 2: Update tab info from cache
 * @param {*} instance
 * @param {*} windowId
 * @param {*} index
 * @param {Object} cache - The tab state cache from background
 */
const updateTabInfoFromCache = (instance, windowId, index, cache) => {
    if (!context.tabs[instance] || !context.tabs[instance][windowId] || !context.tabs[instance][windowId][index]) {
        return false;
    }
    
    let tab = context.tabs[instance][windowId][index];
    const cachedState = cache.tabs[tab.id];
    
    if (cachedState) {
        // Use cached state
        tab.snt_type = cachedState.type;
        tab.snt_details = cachedState.details || "";
        tab.snt_tabs = cachedState.tabs || [];
        
        console.log("*SNOW TOOL BELT* Phase 2: Using cached state for tab", tab.id, "type:", cachedState.type);
    } else {
        // No cache yet, mark as loading
        tab.snt_type = "loading";
        console.log("*SNOW TOOL BELT* Phase 2: No cache for tab", tab.id, "marking as loading");
    }
    
    // Update UI (only if debug mode is enabled)
    chrome.storage.local.get("debugMode", (result) => {
        if (result.debugMode !== true) return;
        
        let typeEl = document.getElementById("tab" + tab.id + "_type");
        if (typeEl) {
            switch (tab.snt_type) {
                case "loading":
                    typeEl.innerText = "⏳";
                    typeEl.title = "Loading...";
                    break;
                case "non responsive":
                    typeEl.innerText = "😴";
                    typeEl.title = "Content script is not available yet";
                    break;
                case "portal":
                    typeEl.innerText = "⎆";
                    typeEl.title = "Service Portal";
                    break;
                case "app studio":
                    typeEl.innerText = "✬";
                    typeEl.title = "App Studio: " + tab.snt_details;
                    break;
                case "workspace":
                    typeEl.innerText = "⚒";
                    typeEl.title = "Workspace: " + JSON.stringify(tab.snt_tabs);
                    break;
                default:
                    typeEl.innerText = "";
                    typeEl.title = "";
            }
        }
    });
    
    // Update update sets from cache if available
    if (context.showUpdatesets && cache.updateSets && cache.updateSets[instance]) {
        if (context.updateSets[windowId] === undefined) { context.updateSets[windowId] = {}; }
        context.updateSets[windowId][instance] = cache.updateSets[instance];
        
        const updateSetEl = document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span");
        if (updateSetEl && cache.updateSets[instance].current && cache.updateSets[instance].current.name) {
            const current = cache.updateSets[instance].current.name;
            updateSetEl.innerText = current;
            updateSetEl.title = `Click to open: ${current}`;
            console.log("*SNOW TOOL BELT* Phase 2: Using cached update set for", instance, ":", current);
            
            // Make it clickable
            makeUpdateSetClickable(updateSetEl, instance, windowId);
        }
    }
    
    // Show/hide "reopen in frame" button based on URL
    try {
        const url = new URL(tab.url);
        const shouldShowReframeButton = url.pathname.endsWith(".do")
            && context.frameExceptions.indexOf(url.pathname) === -1
            && !url.pathname.startsWith("/$")
            && !url.pathname.includes("now/nav/ui/classic/params/target");

        const reframeButton = document.querySelector("a[data-id=\"" + tab.id + "\"][title=\"reopen in a frame\"]");
        if (reframeButton) {
            if (shouldShowReframeButton) {
                reframeButton.classList.remove("hidden");
                reframeButton.classList.add("visible");
            } else {
                reframeButton.classList.remove("visible");
                reframeButton.classList.add("hidden");
            }
        }
    } catch (e) {
        console.log("*SNOW TOOL BELT* Error checking reframe button visibility:", e);
    }
    
    return true;
};

/**
 * Updates tab informations: type, tabs, ... (Legacy - Phase 4 will remove this)
 * @param {*} instance
 * @param {*} windowId
 * @param {*} index
 */
const updateTabInfo = (instance, windowId, index) => {
    if (!context.tabs[instance] || !context.tabs[instance][windowId] || !context.tabs[instance][windowId][index]) {
        return false;
    }
    let tab = context.tabs[instance][windowId][index];
    let url = new URL(tab.url);
    chrome.tabs.sendMessage(tab.id, { "command": "getTabInfo" }, (response) => {
        if (!response && chrome.runtime.lastError) {
            // console.warn("tab " + index + " > " + chrome.runtime.lastError.message);
            tab.snt_type = "non responsive";
        } else {
            tab.snt_type = response.type;
            tab.snt_details = response.details;
            tab.snt_tabs = response.tabs;

            if (context.showUpdatesets && (context.updateSets[windowId] === undefined || context.updateSets[windowId][instance] === undefined)) {
                if (context.updateSets[windowId] === undefined) { context.updateSets[windowId] = {}; }
                if (context.updateSets[windowId][instance] === undefined) { context.updateSets[windowId][instance] = {}; }
                // if content script is active in this tab and we didn't get current update set yet, retrieve it
                chrome.tabs.sendMessage(tab.id, { "command": "getUpdateSet" }, (response) => {
                    let current = "";
                    if (response.current && response.current.name) {
                        context.updateSets[windowId][instance] = response;
                        current = response.current.name;
                        const updateSetEl = document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span");
                        if (updateSetEl) {
                            updateSetEl.innerText = current;
                            updateSetEl.title = `Click to open: ${current}`;
                            
                            // Make it clickable
                            makeUpdateSetClickable(updateSetEl, instance, windowId);
                        }
                    } else {
                        // let it be
                    }
                });
            }
        }


        // show/hide "reopen in frame" button
        const shouldShowReframeButton = url.pathname.endsWith(".do")
            && context.frameExceptions.indexOf(url.pathname) === -1
            && !url.pathname.startsWith("/$")
            && !url.pathname.includes("now/nav/ui/classic/params/target");

        const reframeButton = document.querySelector("a[data-id=\"" + tab.id + "\"][title=\"reopen in a frame\"]");
        if (reframeButton) {
            if (shouldShowReframeButton) {
                reframeButton.classList.remove("hidden");
                reframeButton.classList.add("visible");
            } else {
                reframeButton.classList.remove("visible");
                reframeButton.classList.add("hidden");
            }
        }
        chrome.storage.local.get("debugMode", (result) => {
            if (result.debugMode !== true) return;
            
            let typeEl = document.getElementById("tab" + tab.id + "_type");
            if (typeEl) {
                switch (tab.snt_type) {
                    case "non responsive":
                        typeEl.innerText = "😴"; // sleepy face
                        typeEl.title = "Content script is not available yet";
                        // Phase 4: No retry needed - real-time updates will handle this
                        break;
                    case "portal":
                        typeEl.innerText = "⎆";
                        typeEl.title = "Service Portal";
                        break;
                    case "app studio":
                        typeEl.innerText = "✬";
                        typeEl.title = "App Studio: " + tab.snt_details;
                        break;
                    case "workspace":
                        typeEl.innerText = "⚒"; // briefcase
                        typeEl.title = "Workspace: " + JSON.stringify(tab.snt_tabs);
                        break;
                    default:
                        typeEl.innerText = "";
                        typeEl.title = "";
                        break;
                }
            } else {
                console.warn("tab type element " + "tab" + tab.id + "_type" + " is not available yet");
            }
        });
    });
};

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
const tabUpdated = (tabId, changeInfo, tab) => {
    let tabLi = document.querySelector("#tab" + tabId + "_title");

    if (tabLi && changeInfo.title !== undefined) {
        // Ignore special browser pages
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
            return;
        }
        
        let instance = tabLi.parentElement.getAttribute("data-instance");
        try {
            tab.instance = new URL(tab.url).hostname;
        } catch (e) {
            console.log("*SNOW TOOL BELT* Could not parse tab URL in tabUpdated:", tab.url);
            return;
        }
        
        if (tab.instance !== instance) {
            // frack it, just redraw everything
            bootStrap();
        } else {
            tabLi.innerText = transformTitle(changeInfo.title);
            for (let tabSearch in context.tabs[instance][tab.windowId]) {
                if (context.tabs[instance][tab.windowId][tabSearch].id == tab.id) {
                    context.tabs[instance][tab.windowId][tabSearch].url = tab.url;
                    // Phase 4: No need to call updateTabInfo - real-time updates will handle this
                    break;
                }
            }
        }
    } else if (!tabLi) {
        if (tabCreated(tab)) {
            bootStrap();
        }
    }
};

/**
 * Reflects changes made when a tab is attached to a new or existing window
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} attachInfo contains the informations that changed
 */
const tabAttached = (tabId, attachInfo) => {
    if (document.getElementById("tab" + tabId)) {
        // frack it, just redraw everything
        bootStrap();
    }
}

/**
 * Reflects changes that occur when a tab is removed
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} removeInfo contains the informations about the remove event
 */
const tabRemoved = (tabId, removeInfo) => {
    if (document.getElementById("tab" + tabId)) {
        // frack it, just redraw everything
        window.setTimeout(bootStrap, 200);
    }
};

/**
 * Reflects changes that occur when a tab is activated
 * @param {Object} activeInfo contains the informations about the activated event (tabId & windowId)
 */
const tabActivated = (activeInfo) => {
    setActiveTab();
};

/**
 * Shows the current active tabs
 */
const setActiveTab = () => {
    chrome.tabs.query({ highlighted: true }, (tabs) => {
        let elems = document.querySelectorAll("li.selectedTab");
        [].forEach.call(elems, (el) => {
            el.classList.remove("selectedTab");
        });
        tabs.forEach((tab) => {
            try {
                document.getElementById("tab" + tab.id).classList.add("selectedTab");
            } catch (e) { }
        });
    });
};

/**
 * Opens a new background script window on target instance
 * @param {object} evt the event that triggered the action
 */
const openBackgroundScriptWindow = (evt) => {

    let targetInstance = "";
    let windowId = context.windowId;
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
        windowId = evt.target.getAttribute("data-window-id");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
        windowId = context.clicked.getAttribute("data-window-id");
    }

    let createData = {
        type: "popup",
        url: "https://" + targetInstance + "/sys.scripts.modern.do",
        width: 700,
        height: 800
    };
    let creating = chrome.windows.create(createData);
}

const openInPanel = () => {
    let createData = {
        type: "popup",
        url: (isChromium ? "dialog/snowbelt.html" : "snowbelt.html"),
        width: 720,  // Slightly wider to account for browser chrome
        height: 600  // Taller to better accommodate content
    };
    let creating = chrome.windows.create(createData);
}

const openOptions = (elt) => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL("options.html"));
    }
};

/**
 * Shows the what's new popup
 */
const showWhatsNew = async () => {
    await loadWhatsNewData();
    // Get all whatsnew content (not just unread)
    let whatsNewText = "";
    whatsnew.forEach((item) => {
        whatsNewText += "<h3>version " + item.version + "</h3>";
        whatsNewText += item.msg;

        // Add bullet points for items
        if (item.items && item.items.length > 0) {
            whatsNewText += "<ul>";
            item.items.forEach((listItem) => {
                whatsNewText += "<li>" + listItem + "</li>";
            });
            whatsNewText += "</ul>";
        }

        // Add important note if present
        if (item.important) {
            whatsNewText += "<br/><b>important:</b> " + item.important;
        }
    });

    if (whatsNewText) {
        document.getElementById("whatsnewText").innerHTML = whatsNewText;
        document.getElementById("whatsnewRemember").addEventListener("click", rememberWhatsNew);
        location.hash = "whatsnewPopup";
    }
};

// Whatsnew data will be loaded from external JSON file
let whatsnew = [];

/**
 * Loads whatsnew data from external JSON file
 */
const loadWhatsNewData = async () => {
    try {
        const response = await fetch(chrome.runtime.getURL('dialog/whatsnew.json'));
        whatsnew = await response.json();
    } catch (error) {
        console.error('Failed to load whatsnew data:', error);
        whatsnew = []; // Fallback to empty array
    }
};

const getWhatsNew = (whatsNewJSON) => {
    // whatsNewArr contains an array of keys for "whats new" messages previously marked as read
    let whatsNewArr = [];
    if (whatsNewJSON !== undefined) {
        try {
            whatsNewArr = JSON.parse(whatsNewJSON);
        } catch (e) {
            console.error(e);
        }
    }
    if (whatsNewArr === undefined) {
        whatsNewArr = [];
    }
    let whatsnewText = "";
    whatsnew.forEach((item) => {
        if (whatsNewArr.indexOf(item.version) === -1) {
            whatsnewText += "<h3>version " + item.version + "</h3>";
            whatsnewText += item.msg;

            // Add bullet points for items
            if (item.items && item.items.length > 0) {
                whatsnewText += "<ul>";
                item.items.forEach((listItem) => {
                    whatsnewText += "<li>" + listItem + "</li>";
                });
                whatsnewText += "</ul>";
            }

            // Add important note if present
            if (item.important) {
                whatsnewText += "<br/><b>important:</b> " + item.important;
            }
        }
    });
    return whatsnewText;
};

/**
 * Stores the messages that were already displayed and acknowledged by the user
 */
const rememberWhatsNew = () => {
    location.hash = "";
    let whatsNewArr = [];
    whatsnew.forEach((item) => {
        whatsNewArr.push(item.version);
    });
    chrome.storage.local.set({
        'whatsnew': JSON.stringify(whatsNewArr)
    })
};

/**
 * Displays news
 */
const displayWhatsNew = async () => {
    await loadWhatsNewData();
    chrome.storage.local.get("whatsnew", (result) => {
        let whatsNew = getWhatsNew(result.whatsnew);
        if (whatsNew) {
            document.getElementById("whatsnewText").innerHTML = whatsNew;
            document.getElementById("whatsnewRemember").addEventListener("click", rememberWhatsNew);
            location.hash = "whatsnewPopup";
        }
    });
}

/**
 * Initial function that gets the saved preferences and the list of open tabs
 */
const bootStrap = () => {
    console.info("** bootstrapin' **");
    chrome.windows.getCurrent((wi) => {
        context.windowType = wi.type;
        if (context.windowType == "popup") {
            document.getElementById("open_in_panel").classList.add("hidden");
        }

        if (wi.type == "popup") {
            // For popup windows (detached), find the first available normal window
            chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
                if (windows.length > 0) {
                    context.windowId = windows[0].id;
                } else {
                    // Fallback: create a new window if none exist
                    context.windowId = null; // Will be handled in operations
                }
            });
        } else {
            context.windowId = (wi.id !== undefined ? wi.id : 1);
        }
    });
    let getWindows = (windows) => {
        windows.forEach((window) => {
            if (window.incognito) {
                let elements = document.querySelectorAll("span[data-window-id='" + window.id + "'].incognito");
                if (elements.length > 0) {
                    [].forEach.call(elements, (el) => {
                        el.classList.add("inline-visible");
                    });
                }
            }
        });
    };
    let getTabs = (tabs) => {
        if (document.getElementById("opened_tabs")) {
            removeChildren(document.getElementById("opened_tabs"));
            context.tabs = [];
        }
        tabs.forEach((tab) => {
            tabCreated(tab);
        });
        refreshList();
        refreshKnownInstances();
        chrome.windows.getAll({ windowTypes: ["normal"] }, getWindows);
    };
    chrome.tabs.query({}, getTabs);
};

document.addEventListener("DOMContentLoaded", () => {
    getOptions();
    displayWhatsNew();
});

// Search dialog functionality
document.addEventListener("DOMContentLoaded", () => {
    const objectSearchButton = document.getElementById("objectSearchButton");
    const objectSearchInput = document.getElementById("objectSearchInput");

    if (objectSearchInput) {
        // Search function triggered by Enter key or button click
        const performObjectSearch = () => {
            // Trigger the main search function
            performSearch();
        };

        // Enter key triggers search
        objectSearchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                performObjectSearch();
            }
        });

        // Button click triggers search
        if (objectSearchButton) {
            objectSearchButton.addEventListener("click", performObjectSearch);
        }
    }
});