const context = {
    tabs: []
};
focusedWindowId = undefined;
currentWindowId = undefined;

function refreshList () {
    context.tabs.forEach(function (item) {
        let tab = document.createElement("li");
        tab.innerHTML = item.title;
        document.querySelector("#opened_tabs").appendChild(tab);
    });
}
function bootStrap () {
    console.log("bootstrapping");
    chrome.tabs.query({}, function (tabs) {
        tabs.forEach(function (tab) {
            if (tab.url.toString().indexOf("service-now.com") > -1) {
                context.tabs.push(tab);
            }
        });
        refreshList();
    });
}

document.addEventListener("DOMContentLoaded", function () {
    console.log("script loaded");
    bootStrap();
});
