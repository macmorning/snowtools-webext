const isChrome = (typeof browser === "undefined");
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
    storageArea: {},
    commands: {},
    updateSets: {} // one value per window and instance
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

    chrome.tabs.update(parseInt(id.replace("tab", "")), {active: true});
};

/**
 * Creates a new tab and opens the url stored in the value of the event target or the url parameter
 * @param {object} evt the event that triggered the action
 * @param {string} url url that should be opened
 * @param {Integer} windowId Id of the window in which the new tab should be opened
 */
const newTab = (evt, url, windowId) => {
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
        targetUrl = "https://" + instance + "/nav_to.do?uri=blank.do";
    }
    // is there an open tab for this instance ? if yes, insert the new tab after the last one
    if (context.tabs[instance] !== undefined && context.tabs[instance][windowId] !== undefined) {
        let lastTab = context.tabs[instance][windowId][context.tabs[instance][windowId].length - 1];
        let index = lastTab.index + 1;
        chrome.tabs.create({ index: index, windowId: windowId, url: targetUrl });
    } else {
        chrome.tabs.create({ url: targetUrl, windowId: windowId });
    }
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
            chrome.runtime.sendMessage({command: "execute-reframe", tabid: tabid});
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
        chrome.tabs.sendMessage(id, {"command": "scanNodes"}, (response) => {
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
    chrome.tabs.sendMessage(id, {"command": "switchNode", "node": targetNode}, (response) => {
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
        el.style.color = color;
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
    context.knownInstances = {};
    context.instanceOptions = {};
    chrome.storage.local.get("useSync",(result1) => {
        context.useSync = result1.useSync;
        context.storageArea = (context.useSync ? chrome.storage.sync : chrome.storage.local);
        context.storageArea.get(["urlFilters", "knownInstances", "instanceOptions","showUpdatesets"], (result) => {
            context.urlFilters = result.urlFilters || "service-now.com";
            context.urlFiltersArr = context.urlFilters.split(";");
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
        targetUrl = "https://docs.servicenow.com/search?q=";
    } else if (evt.target.id === "search_api") {
        targetUrl = "https://developer.servicenow.com/app.do#!/search?category=API&q=";
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
                checked = (context.tabs[key].length <= context.collapseThreshold ? "checked" : "");
            }
            let instanceRow = templateInstance.innerHTML.toString().replace(/\{\{instanceName\}\}/g, instanceName).replace(/\{\{windowId\}\}/g, winkey).replace(/\{\{windowIdLabel\}\}/g, (winkey != 1 ? " ["+winkey+"]":"")).replace(/\{\{instance\}\}/g, key).replace(/\{\{checked\}\}/g, checked);

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
        document.getElementById("tipsContainer").style.display = "none";
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
                            title: context.knownInstances[instance],
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
                    { title: "&#9088; Rename", fn: renameInstance }
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
                el.style.color = color;
            } else {
                el.style.color = "black";
            }
            // add open color picker
            if (isChrome) {
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
                el.style.display = "block";
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
    } catch(e) {
        displayMessage("Error accessing tab definition. Do we have the tabs permission?");
        return false;
    }
    tab.instance = url.hostname;
    if (tab.instance === "nowlearning.service-now.com" || tab.instance === "signon.service-now.com" || tab.instance === "hi.service-now.com" || tab.instance === "partnerportal.service-now.com") {
        // known non-instance subdomains of service-now.com
        return false;
    }
    let matchFound = false;
    for (let i = 0; i < context.urlFiltersArr.length && matchFound !== true; i++) {
        let filter = context.urlFiltersArr[i].trim();
        if (filter !== "" && tab.url.toString().indexOf(filter) > -1) {
            matchFound = true;
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
    let tab = context.tabs[instance][windowId][index];
    let url = new URL(tab.url);
    chrome.tabs.sendMessage(tab.id, {"command": "getTabInfo"}, (response) => {
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
                chrome.tabs.sendMessage(tab.id, {"command": "getUpdateSet"}, (response) => {
                    let current = "";
                    if (response.current && response.current.name) {
                        context.updateSets[windowId][instance] = response;
                        current = response.current.name;
                    } else {
                        current = "unknown";
                    }
                    document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span").innerText = current;
                    document.querySelector(".updateset[data-instance='" + instance + "'][data-window-id='" + windowId + "']>span").title = current;
            });
            }
        }

        // hide "reopen in frame"
        if (tab.snt_type !== "other" || url.pathname === "/nav_to.do" || url.pathname === "/navpage.do") {
            document.querySelector("a[data-id=\"" + tab.id + "\"][title=\"reopen in a frame\"]").style.display = "none";
        } else {
            document.querySelector("a[data-id=\"" + tab.id + "\"][title=\"reopen in a frame\"]").style.display = "inline";
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
                    updateTabInfo(instance,tab.windowId,tabSearch);
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
    chrome.tabs.query({highlighted: true}, (tabs) => {
        let elems = document.querySelectorAll("li.selectedTab");
        [].forEach.call(elems, (el) => {
            el.classList.remove("selectedTab");
        });
        tabs.forEach((tab) => {
            try {
                document.getElementById("tab" + tab.id).classList.add("selectedTab");
            } catch (e) {}
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
        url: "https://" + targetInstance + "/sys.scripts.do",
        width: 700,
        height: 500
    };
    let creating = chrome.windows.create(createData);
}

const openInPanel = () => {
    let createData = {
        type: "popup",
        url: (isChrome ? "dialog/snowbelt.html" : "snowbelt.html"),
        width: 700,
        height: 500
    };
    let creating = chrome.windows.create(createData);
}

const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL("options.html"));
    }
 
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
    console.warn("** bootstrapin' **");
    chrome.windows.getCurrent((wi) => {
        context.windowType = wi.type;
        if (context.windowType == "popup") {
            document.getElementById("open_in_panel").style.display = "none";
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
                        el.style.display = "inline";
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
        chrome.windows.getAll({windowTypes: ["normal"]}, getWindows);
    };
    chrome.tabs.query({}, getTabs);
};

document.addEventListener("DOMContentLoaded", () => {
    getOptions();
    displayWhatsNew();
});
