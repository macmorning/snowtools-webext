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
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 * @param {boolean} autohide Automatically hide after n seconds
 */
const displayMessage = (txt, autohide) => {
    if (autohide === undefined) autohide = true;
    document.getElementById("messages").innerHTML = txt.toString();
    document.getElementById("messages").classList.remove("fade");
    window.setTimeout(function () {
        document.getElementById("messages").classList.add("fade");
        // document.getElementById("messages").innerHTML = "&nbsp;";
    }, 3000);
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
    // Only works in Chrome with tabGroups API
    if (!chrome.tabs.group || !chrome.tabGroups || typeof browser !== "undefined") {
        return null; // Return null immediately if not Chrome
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
        debugLog("*SNOW TOOL BELT* Browser type (isChromium):", isChromium);
        debugLog("*SNOW TOOL BELT* typeof browser:", typeof browser);

        groupInstanceTabs(instance);
    }
};

/**
 * Groups tabs for a specific instance (Chrome only)
 * @param {string} instance - The instance hostname
 */
const groupInstanceTabs = async (instance) => {
    // Only works in Chrome with tabGroups API
    if (!chrome.tabs.group || !chrome.tabGroups || typeof browser !== "undefined") {
        displayMessage("Tab groups are only supported in Chrome", true);
        debugLog("*SNOW TOOL BELT* Tab groups not available - chrome.tabs.group:", !!chrome.tabs.group, "chrome.tabGroups:", !!chrome.tabGroups, "browser type:", typeof browser);
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
    let targetUrl;
    let instance;
    if (windowId === undefined) {
        windowId = (evt.target.getAttribute("data-window-id") ? parseInt(evt.target.getAttribute("data-window-id")) : context.windowId);
    }

    if (url) {
        instance = new URL(url).hostname;
        targetUrl = url;
    } else {
        instance = (evt.target.getAttribute("data-instance") ? evt.target.getAttribute("data-instance") : evt.target.value);
        targetUrl = "https://" + instance + "/now/nav/ui/classic/params/target/blank.do";
    }

    // Create tab options
    const tabOptions = { url: targetUrl, windowId: windowId };

    // is there an open tab for this instance ? if yes, insert the new tab after the last one
    if (context.tabs[instance] !== undefined && context.tabs[instance][windowId] !== undefined) {
        let lastTab = context.tabs[instance][windowId][context.tabs[instance][windowId].length - 1];
        tabOptions.index = lastTab.index + 1;
    }

    // Create the new tab
    const newTabResult = await chrome.tabs.create(tabOptions);

    // Try to add to existing group if Chrome supports tab groups
    if (chrome.tabs.group && chrome.tabGroups && typeof browser === "undefined") {
        try {
            // Find existing group for this instance
            const existingGroupId = await findExistingGroupForInstance(instance, windowId);

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

    return newTabResult;
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
        let url = new URL(tab.url);
        if (url.pathname !== "/nav_to.do") {
            chrome.runtime.sendMessage({ command: "execute-reframe", tabid: tabid });
        } else {
            displayMessage("Already in a frame");
        }
    });
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
    let targetInstance = "";
    let windowId = context.windowId;
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
        windowId = evt.target.getAttribute("data-window-id");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
        windowId = context.clicked.getAttribute("data-window-id");
    }

    // Store the target instance for the search
    context.searchTargetInstance = targetInstance;
    context.searchWindowId = windowId;

    // Clear previous search results
    const systemIdInput = document.getElementById("systemIdInput");
    const searchResults = document.getElementById("searchResults");
    if (systemIdInput) systemIdInput.value = "";
    if (searchResults) searchResults.innerHTML = "Enter a system ID and press Enter or click the search button.";

    // Show the search dialog
    location.hash = "searchDialog";

    // Focus the input field after a short delay to ensure the dialog is visible
    setTimeout(() => {
        if (systemIdInput) systemIdInput.focus();
    }, 100);
};

/**
 * Performs the system ID search
 */
/**
 * Validate if a string looks like a valid ServiceNow sys_id
 * @param {string} sysId - The string to validate
 * @returns {boolean} True if it looks like a valid sys_id
 */
const isValidSysId = (sysId) => {
    // ServiceNow sys_id should be exactly 32 alphanumeric characters
    const sysIdPattern = /^[a-fA-F0-9]{32}$/;
    return sysIdPattern.test(sysId);
};

const performSearch = () => {
    const systemIdInput = document.getElementById("systemIdInput");
    const searchResults = document.getElementById("searchResults");

    if (!systemIdInput || !searchResults) return;

    const systemId = systemIdInput.value.trim();

    if (!systemId) {
        searchResults.innerHTML = "Please enter a system ID to search.";
        return;
    }

    // Validate sys_id format
    if (!isValidSysId(systemId)) {
        searchResults.innerHTML = `
            <div class="search-error">
                ❌ Invalid sys_id format
            </div>
            <div class="search-error-details">
                A valid sys_id must be exactly 32 hexadecimal characters (0-9, a-f).
                <br>Example: a1b2c3d4e5f6789012345678901234ab
            </div>
        `;
        return;
    }

    const targetInstance = context.searchTargetInstance;
    const windowId = context.searchWindowId;

    // Find a non-discarded tab for the instance to run the search
    let tabId = -1;
    if (context.tabs[targetInstance]) {
        for (var winkey in context.tabs[targetInstance]) {
            for (var i = 0; i < context.tabs[targetInstance][winkey].length; i++) {
                if (tabId < 0 && !context.tabs[targetInstance][winkey][i].discarded) {
                    tabId = context.tabs[targetInstance][winkey][i].id;
                }
            }
        }
    }

    if (tabId < 0) {
        searchResults.innerHTML = "No active tab available for this instance to perform the search.";
        return;
    }

    // Disable UI elements during search
    systemIdInput.disabled = true;
    const searchButton = document.getElementById("searchButton");
    if (searchButton) searchButton.disabled = true;

    // Show loading animation
    showSearchLoader(true);

    // Send message to content script
    chrome.tabs.sendMessage(tabId, {
        "command": "searchSystemId",
        "systemId": systemId,
        "instance": targetInstance
    }, (response) => {
        showSearchLoader(false);

        // Re-enable UI elements
        systemIdInput.disabled = false;
        const searchButton = document.getElementById("searchButton");
        if (searchButton) searchButton.disabled = false;

        if (chrome.runtime.lastError) {
            searchResults.innerHTML = `Error: ${chrome.runtime.lastError.message}`;
            return;
        }

        if (response && response.status === 200) {
            displaySearchResults(response);
        } else if (response && response.status !== 200) {
            searchResults.innerHTML = `Search failed with status: ${response.status}`;
        } else {
            searchResults.innerHTML = "No response from the tab. Try refreshing the page.";
        }
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
 * Displays the search results
 * @param {object} response - The response from the content script
 */
const displaySearchResults = (response) => {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) return;

    if (response.found) {
        // Record found - show success message with link
        let resultHtml = `
            <div class="search-success">
                ✓ Record found: <strong>${response.displayValue}</strong>
            </div>
            <div class="search-details">
                <strong>Table:</strong> ${response.actualClass || response.table}<br>
                <strong>sys_id:</strong> <a href="#" class="sys-id-link" data-url="${response.directUrl}">${response.systemId}</a><br>
                <strong>Instance:</strong> ${response.instance}
            </div>
            <div class="search-actions">
                <a href="#" class="search-result-link" data-url="${response.directUrl}">Open Record</a>
            </div>
        `;
        searchResults.innerHTML = resultHtml;

        // Add click handler for the sys_id link
        const sysIdLink = searchResults.querySelector('.sys-id-link');
        if (sysIdLink) {
            sysIdLink.addEventListener('click', function (e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                // Use the same newTab function that the extension uses for opening tabs
                newTab({ target: { getAttribute: () => null } }, url, context.windowId);
            });
        }

        // Add click handler for the Open Record button
        const openRecordButton = searchResults.querySelector('.search-result-link');
        if (openRecordButton) {
            openRecordButton.addEventListener('click', function (e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                // Use the same newTab function that the extension uses for opening tabs
                newTab({ target: { getAttribute: () => null } }, url, context.windowId);
            });
        }
    } else {
        // Record not found
        let resultHtml = `
            <div class="search-not-found">
                ❌ Record not found: <strong>${response.systemId}</strong>
            </div>
            <div class="search-not-found-details">
                <strong>Instance:</strong> ${response.instance}<br>
        `;

        if (response.searchedTables) {
            resultHtml += `<strong>Tables searched:</strong> ${response.searchedTables}<br>`;
        }

        resultHtml += `
                The sys_id was not found in any accessible table on this instance.
            </div>
        `;
        searchResults.innerHTML = resultHtml;
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

    // try to find a non discarded tab for the instance to run the scan
    let id = -1;
    for (var winkey in context.tabs[targetInstance]) {
        for (var i = 0; i < context.tabs[targetInstance][winkey].length; i++) {
            if (id < 0 && !context.tabs[targetInstance][winkey][i].discarded) {
                id = context.tabs[targetInstance][winkey][i].id;
            }
        }
    }
    if (id < 0) {
        displayMessage("No tab is available to fetch nodes informations.");
        return false;
    }

    if (context.tempInformations[targetInstance] === undefined || context.tempInformations[targetInstance].nodes === undefined || context.tempInformations[targetInstance].nodes.length === 0) {
        showLoader(targetInstance, windowId, true);
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
    // try to find a non discarded tab for the instance to run the scan
    let id = -1;
    let windowId = context.windowId;
    for (var winkey in context.tabs[targetInstance]) {
        for (var i = 0; i < context.tabs[targetInstance][winkey].length; i++) {
            if (id < 0 && !context.tabs[targetInstance][winkey][i].discarded) {
                id = context.tabs[targetInstance][winkey][i].id;
                windowId = context.tabs[targetInstance][winkey][i].windowId;
            }
        }
    }

    if (id < 0) {
        displayMessage("No tab is available for node switch.");
        return false;
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
            document.getElementById("theme-toggle").addEventListener("click", () => {
                if (typeof ThemeManager !== "undefined") {
                    ThemeManager.toggleTheme();
                }
            });

            document.getElementById("new_tab").addEventListener("change", newTab);
            document.getElementById("search_custom").addEventListener("click", searchNow);
            document.getElementById("search_doc").addEventListener("click", searchNow);
            document.getElementById("search_api").addEventListener("click", searchNow);
            document.getElementById("searchInput").addEventListener("keyup", function (event) {
                event.preventDefault();
                if (event.keyCode === 13) {
                    document.getElementById("search_custom").click();
                }
            });
            document.getElementById("searchInput").focus();

            // Search dialog event listeners
            const systemIdInput = document.getElementById("systemIdInput");
            const searchButton = document.getElementById("searchButton");

            if (searchButton) {
                searchButton.addEventListener("click", performSearch);
            }

            if (systemIdInput) {
                systemIdInput.addEventListener("keyup", function (event) {
                    if (event.key === "Enter") {
                        performSearch();
                    }
                });

                // Add real-time validation feedback
                systemIdInput.addEventListener("input", function (event) {
                    const value = event.target.value.trim();
                    const searchButton = document.getElementById("searchButton");

                    if (value === "") {
                        // Empty input - neutral state
                        event.target.classList.remove("valid", "invalid");
                        if (searchButton) searchButton.disabled = false;
                    } else if (isValidSysId(value)) {
                        // Valid sys_id - green border
                        event.target.classList.remove("invalid");
                        event.target.classList.add("valid");
                        if (searchButton) searchButton.disabled = false;
                    } else {
                        // Invalid sys_id - red border
                        event.target.classList.remove("valid");
                        event.target.classList.add("invalid");
                        if (searchButton) searchButton.disabled = true;
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
    let currentText = document.getElementById("searchInput").value;
    let targetUrl = "";
    if (evt.target.id === "search_doc") {
        targetUrl = "https://www.servicenow.com/docs/en-US/search?q=";
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

        elements = document.querySelectorAll("a[title=\"reopen in a frame\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", popIn);
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
                                    let url = new URL(tab.url);
                                    let newURL = "https://" + instance + url.pathname + url.search;
                                    newTab(e, newURL, tab.windowId);
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
        elements = document.querySelectorAll("a[title=\"close tabs\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", closeTabs);
        });

        // add open new tab actions
        elements = document.querySelectorAll("a[title=\"open a new tab\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", newTab);
        });

        // add the "other actions" menu
        elements = document.querySelectorAll("a[title=\"other options\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", (e) => {
                context.clicked = e.target;
                let items = [
                    { title: "&#8681; Nodes", fn: scanNodes },
                    { title: "&#10000; Script", fn: openBackgroundScriptWindow },
                    { title: "&#9088; Rename", fn: renameInstance },
                    { title: "&#128065; Hide", fn: hideInstance },
                    { title: "⌕ Search", fn: openSearchDialog },
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

        for (let key2 in context.tabs) {
            for (let key3 in context.tabs[key2]) {
                context.tabs[key2][key3].forEach((tab, index) => {
                    updateTabInfo(key2, key3, index);
                });
            }
        }

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
    let url;
    try {
        url = new URL(tab.url);
    } catch (e) {
        displayMessage("Error accessing tab definition. Do we have the tabs permission?");
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
 * Updates tab informations: type, tabs, ...
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
                        document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span").innerText = current;
                        document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span").title = current;
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
        let typeEl = document.getElementById("tab" + tab.id + "_type");
        if (typeEl) {
            switch (tab.snt_type) {
                case "non responsive":
                    typeEl.innerText = "😴"; // sleepy face
                    typeEl.title = "Content script is not available yet";
                    // retry in 2 seconds
                    window.setTimeout(() => {
                        updateTabInfo(instance, windowId, index);
                    }, 3000);
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
        let instance = tabLi.parentElement.getAttribute("data-instance");
        tab.instance = new URL(tab.url).hostname;
        if (tab.instance !== instance) {
            // frack it, just redraw everything
            bootStrap();
        } else {
            tabLi.innerText = transformTitle(changeInfo.title);
            for (let tabSearch in context.tabs[instance][tab.windowId]) {
                if (context.tabs[instance][tab.windowId][tabSearch].id == tab.id) {
                    context.tabs[instance][tab.windowId][tabSearch].url = tab.url;
                    updateTabInfo(instance, tab.windowId, tabSearch);
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
        width: 700,
        height: 500
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

const whatsnew = [
    {
        version: '7.0.0',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>Search by sys_id, from the instance contextual menu</li>" +
            "<li>In Chromium, put tabs inside a group</li>" +
            "<li>Light and Dark themes</li>" +
            "<li>Background script popup is now using the new UI</li>" +
            "<li>Display technical field names now works better</li>" +
            "<li>Removed the auto-frame feature because it's implemented by SN now</li>" +
            "</ul>"
    }, {
        version: '6.1.0',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>Corrected a few issues following the manifest version upgrade.</li>" +
            "</ul>"
    }, {
        version: '6.0.0',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>Upgraded manifest to v3. Not a big change from a user point of view but it was such a pain I thought it deserved its own major release.</li>" +
            "<li>Not much more, to be honest. Please create issues on github if you see the extension misbehaving.</li>" +
            "<li>If you are using extra-service-now.com domains, you may have to re-enable the option, so the extension requests the new, renamed authorization to access all urls.</li>" +
            "</ul>"
    }, {
        version: '5.1.0',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>Finally made some updates required by the recent ServiceNow UI changes.</li>" +
            "<li>Updated the documentation search link.</li>" +
            "</ul>"
    }, {
        version: '5.0.0',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>Removed the broadest default permissions for the extension.</li>" +
            "</ul>" +
            "<b>important:</b> You now have to <b>explicitly</b> allow the extension to be used outside of the service-now.com domain. \"Enable extra domains for content script\" in the options page if you want to use this feature. <br/>" +
            "Just to be safe, remember you can use the export button in the options page to save your settings into a JSON file. You can import it back later in case of a bug or an issue with sync storage, or to copy your settings accross browsers."
    }, {
        version: '4.7.1',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>The previous background scripts are now selectable from a list.</li>" +
            "<li>Make sure you configure your shortcuts in the <a href='#' class='shortcuts-config-link'>shortcuts configuration</a>.</li>" +
            "</ul>"
    }, {
        version: '4.7.0',
        msg: "Most notable changes:<br/>" +
            "<ul>" +
            "<li>Enhanced the background script popup window with an execution history!</li>" +
            "<li>Make sure you configure your shortcuts in the <a href='#' class='shortcuts-config-link'>shortcuts configuration</a>.</li>" +
            "</ul>"
    }
];

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
            whatsnewText += "<h3>version " + item.version
                + "</h3>" + item.msg;
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
const displayWhatsNew = () => {
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
            context.windowId = 1;
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
