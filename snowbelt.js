const context = {
    tabCount: 0,
    tabs: {},
    urlFilters: []
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
        li1.innerHTML += "<h3>" + key + "</h3>";

        let img = document.createElement("img");
        img.src = context.tabs[key][0].favIconUrl;
        img.className = "instanceFavicon";

        let ul = document.createElement("ul");
        ul.className = "linksToTabs";

        context.tabs[key].forEach(function (tab) {
            context.tabCount++;
            let li = document.createElement("li");
            if (!tab.selected) {
                li.className = "linkToTab";
                li.onclick = switchTab;
            } else { li.className = "selectedTab"; }
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
    let urlFilters = "service-now.com";
    if (typeof (Storage) !== "undefined") {
        urlFilters = localStorage.urlFilters || "service-now.com";
    }
    urlFiltersArr = urlFilters.split(";");

    var getTabs = function (tabs) {
        tabs.forEach(function (tab) {
            let matchFound = false;
            urlFiltersArr.forEach(function (filter) {
                if (matchFound || filter.trim() === "") return true;
                if (tab.url.toString().indexOf(filter.trim()) > -1) {
                    matchFound = true;
                }
            });
            if (matchFound) {
                let splittedInstance = tab.url.toString().split("/");
                tab.instance = splittedInstance[2];

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
        injectScript();
    };

    chrome.tabs.query({}, getTabs);
}

document.addEventListener("DOMContentLoaded", function () {
    bootStrap();
    document.querySelector("#go-to-options").addEventListener("click", function () {
        if (chrome.runtime.openOptionsPage) {
            // New way to open options pages, if supported (Chrome 42+).
            chrome.runtime.openOptionsPage();
        } else {
            // Reasonable fallback.
            window.open(chrome.runtime.getURL("options.html"));
        }
    });
});
