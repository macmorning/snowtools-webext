const context = {
    tabs: {}
};

function switchTab (evt) {
    chrome.tabs.update(parseInt(evt.target.id), {active: true});
}

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
}

function bootStrap () {
    var getTabs = function (tabs) {
        tabs.forEach(function (tab) {
            if (tab.url.toString().indexOf("service-now.com") > -1 ||
                tab.url.toString().indexOf("navpage.do") > -1 ||
                tab.url.toString().indexOf("sysparm") > -1) {
                    
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
    };

    chrome.tabs.query({}, getTabs);
}

document.addEventListener("DOMContentLoaded", function () {
    console.log("script loaded");
    bootStrap();
});
