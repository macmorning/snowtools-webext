// content-script.js
console.log("*SNOW TOOL BELT* Content script loaded");
const context = {
    currentTitle: "",
    headNode: document.getElementsByTagName("title")[0]
};

if (document.title === "ServiceNow") {
    document.getElementById("gsft_main").onload = function () {
        console.log("*SNOW TOOL BELT* Changed tab title");
        context.currentTitle = document.getElementById("gsft_main").contentDocument.title;
        document.title = context.currentTitle;
    };

    const handleTitleChange = function (mutationsList) {
        for (var mutation of mutationsList) {
            if (mutation.type === "childList" && mutation.target.text === "ServiceNow") {
                console.log("*SNOW TOOL BELT* Changed tab title back");
                document.title = context.currentTitle;
            }
        }
    };
    const observer = new MutationObserver(handleTitleChange);
    observer.observe(context.headNode, { attributes: true, childList: true });
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
