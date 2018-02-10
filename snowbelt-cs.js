// content-script.js
console.log("*SNOW TOOL BELT* Content script loaded");

if (document.title === "ServiceNow") {
    document.getElementById("gsft_main").onload = function () {
        console.log("*SNOW TOOL BELT* Changed tab title");
        document.title = document.getElementById("gsft_main").contentDocument.title;
    };
}

/*
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log("received message: " + JSON.stringify(request));
    if (request.command === "getTitle") {
        console.log("sending response " + document.getElementById("gsft_main").contentDocument.title);
        sendResponse({"title": document.getElementById("gsft_main").contentDocument.title});
    }
});
*/
