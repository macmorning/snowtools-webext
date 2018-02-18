// content-script.js
console.log("*SNOW TOOL BELT* Content script loaded");
const context = {
    loops: 0,
    currentTitle: "",
    headNode: document.getElementsByTagName("title")[0]
};

if (document.title === "ServiceNow") {
    document.getElementById("gsft_main").onload = function () {
        console.log("*SNOW TOOL BELT* Changed tab title");
        context.currentTitle = document.getElementById("gsft_main").contentDocument.title;
        document.title = context.currentTitle;
        context.loops = 0;
    };

    const handleTitleChange = function (mutationsList) {
        for (var mutation of mutationsList) {
            if (context.loops > 100) {
                // we don't want to end in an endless loop; can happen on login screens, for example.
                return true;
            } else if (mutation.type === "childList" && mutation.target.text === "ServiceNow") {
                console.log("*SNOW TOOL BELT* Changed tab title back");
                document.title = context.currentTitle;
                context.loops++;
            }
        }
    };
    const observer = new MutationObserver(handleTitleChange);
    observer.observe(context.headNode, { attributes: true, childList: true });
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log("*SNOW TOOL BELT* received message: " + JSON.stringify(request));
    if (request.command === "scanNodes") {
        console.log("*SNOW TOOL BELT* going to search for nodes");
        let scans = 0;
        let error = false;
        let maxScans = 10;
        let nodes = [];
        let instanceName = window.location.toString().split("/")[2];
        var url = new Request("https://" + instanceName + "/stats.do");
        for (var i = 0; i < maxScans; i++) {
            if (!error) {
                fetch(url)
                    .then(function (response) {
                        scans++; // increment number of requests sent
                        if (response.ok && response.status === 200) {
                            return response.text();
                        } else {
                            error = true;
                            sendResponse({"nodes": [], "current": ""});
                        }
                    })
                    .then(function (text) {
                        if (!text) { return false; }
                        let m = text.split("<br/>")[1].split(": ")[1];
                        if (nodes.indexOf(m) === -1) {
                            console.log("*SNOW TOOL BELT* found " + m);
                            nodes.push(m);
                        }
                        if (scans >= maxScans) {
                            // assume we got'em all and get the current node by using the same-origin header
                            fetch(url, {credentials: "same-origin"})
                                .then(function (response) {
                                    return response.text();
                                })
                                .then(function (text) {
                                    let m = text.split("<br/>")[1].split(": ")[1];
                                    sendResponse({"nodes": nodes, "current": m});
                                });
                        }
                    });
            }
        }
        return true;
    } else if (request.command === "getNode") {
        console.log("*SNOW TOOL BELT* get current node");
        fetch(url, {credentials: "same-origin"})
            .then(function (response) {
                return response.text();
            })
            .then(function (text) {
                let m = text.split("<br/>")[1].split(": ")[1];
                console.log("*SNOW TOOL BELT* current node : " + m);
                sendResponse({"current": m});
            });
        return true;
    }
});
