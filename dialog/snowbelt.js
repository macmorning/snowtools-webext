const isChrome = (typeof browser === "undefined");
const context = {
    tabCount: 0,
    collapseThreshold: 5,
    tabs: {}, // array of tabs
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1": "instance 1 name", "url2": "instance 2 name", ...}
    instanceOptions: {}, // { "url1": { "checkState": boolean, "colorSet": boolean, "color": color, "hidden": boolean}, "url2": ...}
    knownNodes: {}
};

/**
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 */
const displayMessage = (txt) => {
    document.getElementById("messages").innerHTML = txt.toString();
    window.setTimeout(function () { document.getElementById("messages").innerHTML = "&nbsp;"; }, 3000);
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
 * Creates a new tab and opens the url stored in the value of the event target
 * @param {object} evt the event that triggered the action
 */
const newTab = (evt) => {
    let instance = (evt.target.getAttribute("data-instance") ? evt.target.getAttribute("data-instance") : evt.target.value);
    let targetUrl = "https://" + instance + "/nav_to.do?uri=blank.do";
    // is there an open tab for this instance ? if yes, insert the new tab after the last one
    if (context.tabs[instance] !== undefined) {
        let lastTab = context.tabs[instance][context.tabs[instance].length - 1];
        let index = lastTab.index + 1;
        let windowId = lastTab.windowId;
        chrome.tabs.create({ index: index, windowId: windowId, url: targetUrl });
    } else {
        chrome.tabs.create({ url: targetUrl });
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
        let urlArray = tab.url.split("/");
        if (urlArray[3].indexOf("nav_to.do") === -1) {
            let newUrl = "https://" + urlArray[2] + "/nav_to.do?uri=" + encodeURI(urlArray[3]);
            chrome.tabs.update(tab.id, {url: newUrl});
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
    context.tabs[instance].forEach((tab) => {
        chrome.tabs.remove(parseInt(tab.id));
    });
};

/**
 * Lets the user edit the name of the instance
 * @param {object} evt the event that triggered the action
 */
const renameInstance = (evt) => {
    let targetInstance = "";
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
    }
    let instanceLabel = document.querySelector("div[data-instance='" + targetInstance + "']");
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
    document.getElementById("colorPicker").style.display = "block";
};

/**
 * Starts scanning the instance nodes
 * @param {object} evt the event that triggered the action
 */
const scanNodes = (evt) => {
    let targetInstance = "";
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
    }

    // try to find a non discarded tab for the instance to run the scan
    let id = -1;
    for (var i = 0; i < context.tabs[targetInstance].length; i++) {
        if (id < 0 && !context.tabs[targetInstance][i].discarded) {
            id = context.tabs[targetInstance][i].id;
        }
    }
    if (id < 0) {
        displayMessage("No tab is available to fetch nodes informations.");
        return false;
    }

    document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.add("loading");
    chrome.tabs.sendMessage(id, {"command": "scanNodes"}, (response) => {
        document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.remove("loading");
        if (response !== undefined && response && response.status !== undefined && response.status === 200 && response.nodes !== undefined && response.nodes.length > 0) {
            let nodes = response.nodes;
            nodes.sort();
            saveNodes(targetInstance, nodes);
            refreshNodes(targetInstance, response.current);
        } else if (response !== undefined && response.status !== undefined && response.status !== 200) {
            displayMessage("Got http status " + response.status + "...");
        } else if (response === undefined) {
            displayMessage("Couldn't get an answer from tab; try refreshing it.");
        }
    });
};

/**
 * Switch to instance node
 * @param {object} evt the event that triggered the action
 */
const switchNode = (evt) => {
    let targetInstance = evt.target.getAttribute("data-instance");
    let targetNode = evt.target.value;
    // try to find a non discarded tab for the instance to run the scan
    let id = -1;
    for (var i = 0; i < context.tabs[targetInstance].length; i++) {
        if (id < 0 && !context.tabs[targetInstance][i].discarded) {
            id = context.tabs[targetInstance][i].id;
        }
    }
    if (id < 0) {
        displayMessage("No tab is available for node scan.");
        return false;
    }

    console.log("switching " + targetInstance + " to " + targetNode);
    document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.add("loading");
    chrome.tabs.sendMessage(id, {"command": "switchNode", "node": targetNode}, (response) => {
        document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.remove("loading");
        if (response && response.status === 200) {
            displayMessage("Node switched to " + response.current);
        } else if (response.status !== 200) {
            displayMessage("Error switching to " + targetNode + " (" + response.message + ")");
            if (response.current) {
                refreshNodes(targetInstance, response.current);
            }
        }
    });
};

/**
 * Saves nodes in local context
 * @param {String} instanceName fqdn of target instance
 * @param {Array} nodes array of nodes names
 */
const saveNodes = (instanceName, nodes) => {
    if (context.knownNodes[instanceName] !== undefined && context.knownNodes[instanceName].length > 0) {
        context.knownNodes[instanceName] = context.knownNodes[instanceName].concat(nodes.filter((item) => {
            return context.knownNodes[instanceName].indexOf(item) < 0;
        }));
        context.knownNodes[instanceName].sort();
    } else {
        context.knownNodes[instanceName] = nodes;
    }
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
    chrome.storage.sync.set({
        "knownInstances": JSON.stringify(context.knownInstances)
    }, function () {
        console.log("Saved instances to storage.sync");
    });
};

/**
 * Saves the instances checked states
 */
const saveInstanceOptions = () => {
    chrome.storage.sync.set({
        "instanceOptions": JSON.stringify(context.instanceOptions)
    }, () => {
        console.log("Saved instance options to storage.sync");
    });
};

/**
 * Saves selected color
 * @param {object} evt the event that triggered the action
 */
const saveColor = (evt) => {
    let targetInstance = "";
    targetInstance = context.clicked.getAttribute("data-instance");
    document.getElementById("colorPicker").style.display = "none";
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
    document.getElementById("colorPicker").style.display = "none";
    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    }
    try {
        delete context.instanceOptions[targetInstance]["color"];
    } catch (e) {
        console.log(e);
    }
    updateColor(targetInstance);
    saveInstanceOptions();
};

/**
 * Updates the color indicator of target instance
 * @param {String} instance id of the instance color that needs an update
 */
const updateColor = (instance) => {
    el = document.querySelector("span.color-indicator[data-instance=\"" + instance + "\"");
    color = (context.instanceOptions[instance]["color"] !== undefined ? context.instanceOptions[instance]["color"] : "black");
    el.style.color = color;
};

/**
 * Retrieves saved options
 */
const getOptions = () => {
    context.urlFilters = "service-now.com";
    context.urlFiltersArr = ["service-now.com"];
    context.knownInstances = {};
    context.instanceOptions = {};
    chrome.storage.sync.get(["urlFilters", "knownInstances", "instanceOptions"], (result) => {
        context.urlFilters = result.urlFilters || "service-now.com";
        context.urlFiltersArr = context.urlFilters.split(";");
        try {
            context.knownInstances = JSON.parse(result.knownInstances);
        } catch (e) {
            context.knownInstances = {};
            console.log(e);
        }
        try {
            context.instanceOptions = JSON.parse(result.instanceOptions);
        } catch (e) {
            context.instanceOptions = {};
            console.log(e);
        }

        console.log("Loaded options");
        console.log(context);
        bootStrap();
        document.getElementById("config").addEventListener("click", openOptions);
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
        chrome.tabs.onActivated.addListener(tabActivated);
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

        // get the html template structure for the instance row
        let templateInstance = document.getElementById("instance-row");
        // replace template placeholders with their actual values
        let checked = "";
        if (context.instanceOptions[key] !== undefined && context.instanceOptions[key]["checkState"] !== undefined) {
            checked = (context.instanceOptions[key]["checkState"] ? "checked" : "");
        } else {
            checked = (context.tabs[key].length <= context.collapseThreshold ? "checked" : "");
        }
        let instanceRow = templateInstance.innerHTML.toString().replace(/\{\{instanceName\}\}/g, instanceName).replace(/\{\{instance\}\}/g, key).replace(/\{\{checked\}\}/g, checked);

        // get the html template structure for the tab row
        let templateLI = document.getElementById("tab-row");
        let tabList = "";
        context.tabs[key].forEach((tab) => {
            context.tabCount++;
            // replace template placeholders with their actual values
            tabList += templateLI.innerHTML.toString().replace(/\{\{tabid\}\}/g, tab.id).replace(/\{\{instance\}\}/g, key).replace(/\{\{title\}\}/g, tab.title);
        });
        instanceRow = instanceRow.replace(/\{\{linksToTabs\}\}/g, tabList);

        openTabs.innerHTML += instanceRow;
    }

    if (context.tabCount === 0) {
        let li1 = document.createElement("li");
        li1.innerHTML += "<div class='tips' title='cool tip'><h1>&#128161;</h1>" + getTip() + "</p>";
        openTabs.appendChild(li1);
    } else {
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
        // add the "other actions" menu
        /* removed for now
        elements = document.querySelectorAll("a[title=\"other commands\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", function (e) {
                context.clicked = e.target;
                let items = [
                    { title: "", fn: }
                ];

                basicContext.show(items, e);
            });
        });
        */

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
                    { title: "&#128270; Fetch nodes", fn: scanNodes },
                    { title: "&#10000; Rename", fn: renameInstance }
                ];
                // only add the select color option if we are on Chrome, because FF closes the popup when it displays the color picker
                if (isChrome) {
                    items.push({ title: "&#127912; Select color", fn: selectColor }); // -- 🎨
                } else {
                    items.push({ title: "&#127912; Select color", fn: openOptions }); // -- 🎨
                }
                basicContext.show(items, e);
            });
        });

        // Display colors
        elements = document.querySelectorAll("span.color-indicator");
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
        elements = document.querySelectorAll("div[data-instance]");
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
    while (elt.firstChild) {
        elt.removeChild(elt.firstChild);
    }
};

/**
 * Generates the list of links to the tabs
 * @param {String} instance optional - the instance for which we want to refresh the nodes list
 * @param {String} selectNode optional - the current node for this instance
 */
const refreshNodes = (instance, selectNode) => {
    if (context.knownNodes === undefined) { return false; }
    var addNodes = (key, elt, selectNode) => {
        context.knownNodes[key].forEach((item) => {
            let option = document.createElement("option");
            option.value = item;
            option.innerText = item;
            if (selectNode !== undefined && item === selectNode) {
                option.setAttribute("selected", "selected");
            }
            elt.appendChild(option);
        });
    };
    if (instance !== undefined) {
        let select = document.querySelector("select[data-instance=\"" + instance + "\"]");
        removeChildren(select);
        addNodes(instance, select, selectNode);
        select.style.display = "inline-block";
    } else {
        Object.keys(context.knownNodes).forEach((key) => {
            let select = document.querySelector("select[data-instance=\"" + key + "\"]");
            if (select) {
                removeChildren(select);
                addNodes(key, select);
            }
        });
    }
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
    let splittedInstance = tab.url.toString().split("/");
    tab.instance = splittedInstance[2];
    if (tab.instance === "signon.service-now.com" || tab.instance === "hi.service-now.com" || tab.instance === "partnerportal.service-now.com") {
        // known non-instance subdomains of service-now.com
        return false;
    }
    let matchFound = false;
    context.urlFiltersArr.forEach((filter) => {
        if (matchFound || filter.trim() === "") return true;
        if (tab.url.toString().indexOf(filter.trim()) > -1) {
            matchFound = true;
        }
    });
    if (matchFound) {
        tab.title = transformTitle(tab.title);
        // if this is the first tab we find for this instance, create the container is the context.tab object
        if (!context.tabs.hasOwnProperty(tab.instance)) { context.tabs[tab.instance] = []; }
        context.tabs[tab.instance].push(tab);
        return true;
    }
    return false;
};

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
const tabUpdated = (tabId, changeInfo, tab) => {
    let tabLi = document.querySelector("#tab" + tabId + " > span");
    if (tabLi && changeInfo.title !== undefined) {
        tabLi.innerText = transformTitle(changeInfo.title);
    } else if (!tabLi) {
        if (tabCreated(tab)) {
            refreshList();
            refreshKnownInstances();
        }
    }
};

/**
 * Reflects changes that occur when a tab is removed
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} removeInfo contains the informations about the remove event
 */
const tabRemoved = (tabId, removeInfo) => {
    let tabLi = document.getElementById("tab" + tabId);
    if (tabLi) {
        // remove the tab from context.tabs
        let instance = tabLi.getAttribute("data-instance");
        if (instance && context.tabs.hasOwnProperty(instance)) {
            for (var i = 0; i < context.tabs[instance].length; i++) {
                if (context.tabs[instance][i].id === tabId) {
                    context.tabs[instance].splice(i, 1);
                }
            }
        }
        // then remove the node
        let parent = tabLi.parentNode;
        parent.removeChild(tabLi);
        // if there is no tab left for the instance, remove the instance list item
        if (context.tabs[instance].length === 0) {
            delete context.tabs[instance];
            document.getElementById("opened_tabs").removeChild(document.querySelector("li[data-instance=\"" + instance + "\""));
        }
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
    chrome.tabs.query({active: true}, (tabs) => {
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

const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL("options.html"));
    }
};
/**
 * Initial function that gets the saved preferences and the list of open tabs
 */
const bootStrap = () => {
    var getTabs = (tabs) => {
        tabs.forEach((tab) => {
            tabCreated(tab);
        });
        refreshList();
        // saveKnownInstances();
        // saveInstanceOptions();
        refreshKnownInstances();
    };
    chrome.tabs.query({}, getTabs);
};

document.addEventListener("DOMContentLoaded", () => {
    getOptions();
});
