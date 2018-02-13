const context = {
    tabCount: 0,
    tabs: {}, // array of tabs
    urlFilters: "",
    knownInstances: {} // { "url1" : "instance 1 name", "url2" : "instnce 2 name", ...}
};

/*  switches to the tab with the matching tab id
 *  @param {event} evt - the event that generated the switch
 */
function switchTab (evt) {
    chrome.tabs.update(parseInt(evt.target.id), {active: true});
}

/*  generates the list of links to the tabs
 */
function refreshList () {
    for (var key in context.tabs) {
        let li1 = document.createElement("li");
        let instanceName = "";
        if (context.knownInstances !== undefined && context.knownInstances[key] !== undefined) {
            instanceName = context.knownInstances[key];
        } else {
            instanceName = key;
            context.knownInstances[key] = key; // save instance url into the knownInstances object
        }
        li1.innerHTML += "<h3>" + instanceName + "</h3>";

        let ul = document.createElement("ul");
        ul.className = "linksToTabs";

        context.tabs[key].forEach(function (tab) {
            context.tabCount++;
            let li = document.createElement("li");
            if (!tab.active) {
                li.className = "linkToTab";
            } else { li.className = "selectedTab"; }
            li.onclick = switchTab;
            li.id = tab.id; // li id is the same as tab id for easy switching
            li.innerHTML = tab.title;
            ul.appendChild(li);
        });
        li1.appendChild(ul);
        document.querySelector("#opened_tabs").appendChild(li1);
    }
    if (context.tabCount === 0) {
        let li1 = document.createElement("li");
        li1.innerHTML += "<h3>No tab found; make sure you configured your URL filters in the options page.</h3>";
        document.querySelector("#opened_tabs").appendChild(li1);
    }
    let selectInstance = document.getElementById("new_tab");
    for (var instanceKey in context.knownInstances) {
        let option = document.createElement("option");
        option.text = context.knownInstances[instanceKey];
        option.setAttribute("value", "https://" + instanceKey);
        selectInstance.appendChild(option);
    }
}
/*
function getTitle (id) {
    chrome.tabs.sendMessage(id, {"command": "getTitle"}, function (response) {
        console.log("received response: " + JSON.stringify(response));
        window.setTimeout(function () { document.getElementById(id).innerHTML = response.title; }, 500);
    });
}
*/

/*  Initial function that gets the saved preferences and the list of open tabs
 */
function bootStrap () {
    let urlFiltersArr = context.urlFilters.split(";");

    var getTabs = function (tabs) {
        tabs.forEach(function (tab) {
            let splittedInstance = tab.url.toString().split("/");
            tab.instance = splittedInstance[2];
            if (tab.instance === "signon.service-now.com") {
                // known non-instance subdomains of service-now.com
                return false;
            }
            let matchFound = false;
            urlFiltersArr.forEach(function (filter) {
                if (matchFound || filter.trim() === "") return true;
                if (tab.url.toString().indexOf(filter.trim()) > -1) {
                    matchFound = true;
                }
            });
            if (matchFound) {
                let splittedName = tab.title.toString().split("|");
                if (splittedName.length === 3) {
                    // this is a specific object
                    tab.title = splittedName[1].toString().trim() + " - " + splittedName[0].toString().trim();
                } else if (splittedName.length === 2) {
                    // this is a list of objects
                    tab.title = splittedName[0].toString().trim();
                }

                // if this is the first tab we find for this instance, create the container is the context.tab object
                if (!context.tabs.hasOwnProperty(tab.instance)) { context.tabs[tab.instance] = []; }
                context.tabs[tab.instance].push(tab);
            }
        });
        refreshList();
        saveKnownInstances();
    };

    chrome.tabs.query({}, getTabs);
}

function saveKnownInstances () {
    if (typeof (Storage) !== "undefined") {
        localStorage.knownInstances = JSON.stringify(context.knownInstances);
    }
}

function getOptions () {
    context.urlFilters = "service-now.com";
    context.knownInstances = {};
    if (typeof (Storage) !== "undefined") {
        context.urlFilters = localStorage.urlFilters || "service-now.com";
        try {
            context.knownInstances = JSON.parse(localStorage.knownInstances);
        } catch (e) {
            // could not parse the saved data, perhaps someone messed with it
            context.knownInstances = {};
        }
    }
}

function newTab (evt) {
    let targetUrl = evt.target.value;
    chrome.tabs.create({ url: targetUrl });
}

document.addEventListener("DOMContentLoaded", function () {
    getOptions();
    bootStrap();
    document.getElementById("go-to-options").addEventListener("click", function () {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL("options.html"));
        }
    });
    document.getElementById("new_tab").addEventListener("change", newTab);
});
