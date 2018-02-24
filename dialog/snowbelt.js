const context = {
    tabCount: 0,
    tabs: {}, // array of tabs
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1" : "instance 1 name", "url2" : "instnce 2 name", ...}
    knownNodes: {} // { "url1" : ["node1","node2", ...], "url2" : ...}
};

/**
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 */
function displayMessage (txt) {
    document.getElementById("messages").innerHTML = txt.toString();
    window.setTimeout(function () { document.getElementById("messages").innerHTML = "&nbsp;"; }, 3000);
}
/**
 * Switches to the tab that has the same id as the event target
 * @param {object} evt the event that triggered the action
 */
function switchTab (evt) {
    chrome.tabs.update(parseInt(evt.target.id), {active: true});
}

/**
 * Creates a new tab and opens the url stored in the value of the event target
 * @param {object} evt the event that triggered the action
 */
function newTab (evt) {
    let targetUrl = (evt.target.getAttribute("data-instance") ? evt.target.getAttribute("data-instance") : evt.target.value);
    targetUrl = "https://" + targetUrl + "/nav_to.do?uri=blank.do";
    chrome.tabs.create({ url: targetUrl });
}

/**
 * Closes a tab given its id
 * @param {object} evt the event that triggered the action
 */
function closeTab (evt) {
    let tabid = parseInt(evt.target.getAttribute("data-id"));
    // document.getElementById(tabid).parentNode.removeChild(document.getElementById(tabid));
    chrome.tabs.remove(tabid);
}

/**
 * Starts scanning the instance nodes
 * @param {object} evt the event that triggered the action
 */
function scanNodes (evt) {
    let targetInstance = evt.target.getAttribute("data-instance");
    let id = context.tabs[targetInstance][0].id; // we will ask the first tab found for the target instance to scan the nodes
    document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.add("loading");
    chrome.tabs.sendMessage(id, {"command": "scanNodes"}, function (response) {
        document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.remove("loading");
        if (response && response.status === 200 && response.nodes !== undefined && response.nodes.length > 0) {
            let nodes = response.nodes;
            nodes.sort();
            saveNodes(targetInstance, nodes);
            refreshNodes(targetInstance, response.current);
        } else if (response.status !== 200) {
            let nodes = ["Got http status " + response.status];
            saveNodes(targetInstance, nodes);
            refreshNodes(targetInstance, response.current);
        }
    });
}

/**
 * Switch to instance node
 * @param {object} evt the event that triggered the action
 */
function switchNode (evt) {
    let targetInstance = evt.target.getAttribute("data-instance");
    if (targetInstance.indexOf("service-now.com") === -1) {
        displayMessage("Sorry! Switching nodes only works on service-now.com instances for now.");
        return true;
    }
    let targetNode = evt.target.value;
    let id = context.tabs[targetInstance][0].id; // we will ask the first tab found for the target instance to switch node
    console.log("switching " + targetInstance + " to " + targetNode);
    document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.add("loading");
    chrome.tabs.sendMessage(id, {"command": "switchNode", "node": targetNode}, function (response) {
        document.querySelector("li[data-instance=\"" + targetInstance + "\"]").classList.remove("loading");
        if (response && response.status === 200) {
            displayMessage("Node switched to " + response.current);
        } else if (response.status !== 200) {
            displayMessage("Error switching to " + response.current + " (" + response.status + ")");
            if (response.current) {
                refreshNodes(targetInstance, response.current);
            }
        }
    });
}

/**
 * Saves nodes in local storage
 * @param {String} instanceName fqdn of target instance
 * @param {Array} nodes array of nodes names
 */
function saveNodes (instanceName, nodes) {
    context.knownNodes[instanceName] = nodes;
    if (typeof (Storage) !== "undefined") {
        localStorage.knownNodes = JSON.stringify(context.knownNodes);
    }
}

/**
 * Saves the known instances; called after the open tabs have been parsed
 */
function saveKnownInstances () {
    if (typeof (Storage) !== "undefined") {
        localStorage.knownInstances = JSON.stringify(context.knownInstances);
    }
}

/**
 * Retrieves saved options
 */
function getOptions () {
    context.urlFilters = "service-now.com";
    context.urlFiltersArr = ["service-now.com"];
    context.knownInstances = {};
    context.knownNodes = {};
    if (typeof (Storage) !== "undefined") {
        context.urlFilters = localStorage.urlFilters || "service-now.com";
        context.urlFiltersArr = context.urlFilters.split(";");
        try {
            context.knownInstances = JSON.parse(localStorage.knownInstances);
        } catch (e) {
            // could not parse the saved data, perhaps someone messed with it
            context.knownInstances = {};
        }
        try {
            context.knownNodes = JSON.parse(localStorage.knownNodes);
        } catch (e) {
            // could not parse the saved data, perhaps someone messed with it
            context.knownNodes = {};
        }
    }
    console.log("Loaded options");
    console.log(context);
}
/**
 * Searches on ServiceNow doc or api sites
 * @param {object} evt the event that triggered the action
 */
function searchNow (evt) {
    let currentText = document.getElementById("searchInput").value;
    let targetUrl = (evt.target.id === "search_doc" ? "https://docs.servicenow.com/search?q=" + currentText : "https://developer.servicenow.com/app.do#!/search?category=API&q=" + currentText);
    chrome.tabs.create({ url: targetUrl });
}
/**
 * Generates the list of links to the tabs
 */
function refreshList () {
    let openTabs = document.querySelector("#opened_tabs");
    let activeTab = "";
    removeChildren(openTabs);
    for (var key in context.tabs) {
        let li1 = document.createElement("li");
        li1.setAttribute("data-instance", key);
        let instanceName = "";
        if (context.knownInstances !== undefined && context.knownInstances[key] !== undefined) {
            // we already know about this instance
            instanceName = context.knownInstances[key];
        } else {
            // else, save instance url into the knownInstances object
            instanceName = key;
            context.knownInstances[key] = key;
        }
        let instanceNameH3 = document.createElement("h3");
        instanceNameH3.innerHTML = instanceName;

        // new tab link
        let newTabAction = document.createElement("a");
        newTabAction.setAttribute("href", "#");
        newTabAction.setAttribute("data-instance", key);
        newTabAction.className = "button-muted";
        newTabAction.innerHTML = "&plus;";
        newTabAction.onclick = newTab;
        newTabAction.title = "open a new tab";
        instanceNameH3.appendChild(newTabAction);

        // commands
        let instanceCommandsNode = document.createElement("a");
        instanceCommandsNode.setAttribute("href", "#");
        instanceCommandsNode.classList.add("instance-commands", "button-muted");
        instanceCommandsNode.setAttribute("data-instance", key);
        instanceCommandsNode.innerHTML = "&#128270;";
        instanceCommandsNode.onclick = scanNodes;
        instanceCommandsNode.title = "scan nodes";

        // nodes list
        let instanceNodes = document.createElement("select");
        instanceNodes.className = "nodes-list";
        instanceNodes.setAttribute("data-instance", key);
        instanceNodes.onchange = switchNode;
        // nodes list default option
        let option = document.createElement("option");
        option.text = "Scan instance to discover its nodes";
        instanceNodes.appendChild(option);

        instanceNameH3.appendChild(instanceNodes);
        instanceNameH3.appendChild(instanceCommandsNode);
        li1.appendChild(instanceNameH3);

        // unordered list of tabs for current instance
        let ul = document.createElement("ul");
        ul.classList.add("linksToTabs");

        context.tabs[key].forEach(function (tab) {
            context.tabCount++;
            let li = document.createElement("li");
            if (tab.active) {
                activeTab = tab.id;
            }
            li.className = "linkToTab";
            li.setAttribute("data-instance", key);
            li.onclick = switchTab;
            li.id = tab.id; // li id is the same as tab id for easy switching
            li.innerText = tab.title;

            ul.appendChild(li);
            addCloseLink(tab.id, li);
        });
        li1.appendChild(ul);
        openTabs.appendChild(li1);
    }
    if (activeTab) {
        setActiveTab(activeTab);
    }
    if (context.tabCount === 0) {
        let li1 = document.createElement("li");
        li1.innerHTML += "<p class=\"text-muted\">No tab found :( Have you configured your URL filters in the options page?</p>";
        openTabs.appendChild(li1);
    }
}

/**
 * Generates the select list of known instances
 */
function refreshKnownInstances () {
    let selectInstance = document.getElementById("new_tab");
    removeChildren(selectInstance);

    let optionDefault = document.createElement("option");
    optionDefault.text = "Select a known instance to open a new tab";
    selectInstance.appendChild(optionDefault);

    for (var instanceKey in context.knownInstances) {
        let option = document.createElement("option");
        option.text = context.knownInstances[instanceKey];
        option.setAttribute("value", instanceKey);
        option.setAttribute("data-instance", instanceKey);
        selectInstance.appendChild(option);
    }
}
/**
 * Generates the list of links to the tabs
 * @param {Object} elt parent node
 */
function removeChildren (elt) {
    while (elt.firstChild) {
        elt.removeChild(elt.firstChild);
    }
}

/**
 * Generates the list of links to the tabs
 * @param {String} instance optional - the instance for which we want to refresh the nodes list
 * @param {String} selectNode optional - the current node for this instance
 */
function refreshNodes (instance, selectNode) {
    if (context.knownNodes === undefined) { return false; }
    var addNodes = function (key, elt, selectNode) {
        context.knownNodes[key].forEach(function (item) {
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
        Object.keys(context.knownNodes).forEach(function (key) {
            let select = document.querySelector("select[data-instance=\"" + key + "\"]");
            if (select) {
                removeChildren(select);
                addNodes(key, select);
            }
        });
    }
}

/**
 * Returns the updated title
 * @param {String} title Original title of the tab
 */
function transformTitle (title) {
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
}

/**
 * Adds the close link to the li element
 * @param {Integer} tabId the id of the updated tab
 * @param {Element} li element to which the close action must be appended
 */
function addCloseLink (tabid, li) {
    // close tab link
    let closeTabAction = document.createElement("a");
    closeTabAction.setAttribute("href", "#");
    closeTabAction.setAttribute("data-id", tabid);
    closeTabAction.className = "button-muted";
    closeTabAction.innerHTML = "&times;";
    closeTabAction.onclick = closeTab;
    closeTabAction.title = "close tab";
    li.appendChild(closeTabAction);
}

/**
 * Reflects changes that occur when a tab is found or created
 * @param {Tab} tab the Tab object itself
 */
function tabCreated (tab) {
    let splittedInstance = tab.url.toString().split("/");
    tab.instance = splittedInstance[2];
    if (tab.instance === "signon.service-now.com") {
        // known non-instance subdomains of service-now.com
        return false;
    }
    let matchFound = false;
    context.urlFiltersArr.forEach(function (filter) {
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
}

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
function tabUpdated (tabId, changeInfo, tab) {
    let tabLi = document.getElementById(tabId);
    if (tabLi && changeInfo.title !== undefined) {
        tabLi.innerText = transformTitle(changeInfo.title);
        addCloseLink(tabId, tabLi);
    } else if (!tabLi) {
        if (tabCreated(tab)) {
            refreshList();
            refreshKnownInstances();
        }
    }
}

/**
 * Reflects changes that occur when a tab is removed
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} removeInfo contains the informations about the remove event
 */
function tabRemoved (tabId, removeInfo) {
    let tabLi = document.getElementById(tabId);
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
        tabLi.parentNode.removeChild(tabLi);
    }
}

/**
 * Reflects changes that occur when a tab is activated
 * @param {Object} activeInfo contains the informations about the activated event (tabId & windowId)
 */
function tabActivated (activeInfo) {
    setActiveTab(activeInfo.tabId);
}

/**
 * Shows the current active tabs
 * @param {Integer} tabId the id of the updated tab
 */
function setActiveTab (tabId) {
    let elems = document.querySelectorAll("li.selectedTab");

    [].forEach.call(elems, function (el) {
        el.classList.remove("selectedTab");
    });
    document.getElementById(tabId).className = "selectedTab";
}

/**
 * Initial function that gets the saved preferences and the list of open tabs
 */
function bootStrap () {
    var getTabs = function (tabs) {
        tabs.forEach(function (tab) {
            tabCreated(tab);
        });
        refreshList();
        saveKnownInstances();
        refreshKnownInstances();
        // refreshNodes();
    };
    chrome.tabs.query({}, getTabs);
}

document.addEventListener("DOMContentLoaded", function () {
    getOptions();
    bootStrap();
    document.getElementById("config").addEventListener("click", function () {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL("options.html"));
        }
    });
    document.getElementById("new_tab").addEventListener("change", newTab);
    document.getElementById("search_doc").addEventListener("click", searchNow);
    document.getElementById("search_api").addEventListener("click", searchNow);
    document.getElementById("searchInput").addEventListener("keyup", function (event) {
        event.preventDefault();
        if (event.target.value.length > 2) {
            console.log(words.length);
        }
        if (event.keyCode === 13) {
            document.getElementById("search_doc").click();
        }
    });
    document.getElementById("searchInput").focus();

    // listen to tabs events
    chrome.tabs.onUpdated.addListener(tabUpdated);
    chrome.tabs.onRemoved.addListener(tabRemoved);
    chrome.tabs.onActivated.addListener(tabActivated);
});
