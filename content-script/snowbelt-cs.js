// content-script.js
console.log("*SNOW TOOL BELT* Content script loaded");
const context = {
    loops: 0,
    currentTitle: "",
    headNode: document.getElementsByTagName("title")[0]
};

function getNameFromStatsPage (text) {
    let instanceName = "";
    instanceName = text.split("<br/>")[1].split(": ")[1];
    // if current contains ":" then split it again
    if (instanceName.indexOf(":") > -1) {
        instanceName = instanceName.split(":")[1];
    }
    return instanceName;
}

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
    let instanceName = window.location.toString().split("/")[2];
    let url = new Request("https://" + instanceName + "/stats.do");
    if (request.command === "scanNodes") {
        /**
         *  scanNodes
         */
        console.log("*SNOW TOOL BELT* going to search for nodes");
        let scans = 0;
        let maxScans = 50;
        let nodes = [];
        fetch(url, {credentials: "same-origin"})
            .then(function (response) {
                if (response.ok && response.status === 200) {
                    return response.text();
                } else {
                    // there was an error with this first fetch, stop here
                    console.log("*SNOW TOOL BELT* there was an error with the first scan, stopping now: " + response.status);
                    sendResponse({"nodes": [], "current": "", "status": response.status});
                }
            })
            .then(function (text) {
                if (text === undefined || !text) {
                    return false;
                }
                let current = getNameFromStatsPage(text);
                console.log("*SNOW TOOL BELT* found " + current);
                nodes.push(current);
                for (var i = 0; i < maxScans; i++) {
                    fetch(url)
                        .then(function (response) {
                            scans++; // increment number of requests sent
                            return response.text();
                        })
                        .then(function (text) {
                            if (!text) { return false; }
                            let m = getNameFromStatsPage(text);
                            if (nodes.indexOf(m) === -1) {
                                console.log("*SNOW TOOL BELT* found " + m);
                                nodes.push(m);
                            }
                            if (scans >= maxScans) {
                            // assume we got'em all and get the current node by using the same-origin header
                                sendResponse({"nodes": nodes, "current": current, "status": 200});
                            }
                        });
                }
            })
            .catch(function (err) {
                console.log("*SNOW TOOL BELT* there was an error with the first scan, stopping now");
                console.log(err);
                sendResponse({"nodes": [], "current": "", "status": 500});
            });
        return true;
    } else if (request.command === "switchNode") {
        /**
         *  switchNode
         */
        console.log("*SNOW TOOL BELT* switch to node " + request.node);
        let targetNode = request.node.toString();
        let maxTries = 40;
        let tries = 0;
        let tryAgain = function () {
            fetch(url, {credentials: "same-origin"})
                .then(function (response) {
                    if (response.ok && response.status === 200) {
                        return response.text();
                    } else {
                    // there was an error with this first fetch, stop here
                        console.log("*SNOW TOOL BELT* there was an error while trying to switch nodes, stopping now");
                        sendResponse({"status": response.status});
                    }
                })
                .then(function (text) {
                    let current = getNameFromStatsPage(text);
                    console.log("*SNOW TOOL BELT* node name: " + current);
                    if (current === targetNode) {
                        sendResponse({"status": 200, "current": current});
                    } else if (tries < maxTries) {
                        tries++;
                        // send the removeCookie command to background script, then try again
                        chrome.runtime.sendMessage({"command": "removeCookie", "instance": instanceName}, tryAgain);
                    } else {
                        console.log("*SNOW TOOL BELT* maximum number of tries reached without success");
                        sendResponse({"status": 500, "message": "Maximum number of tries reached", "current": current});
                    }
                });
        };

        fetch(url, {credentials: "same-origin"})
            .then(function (response) {
                if (response.ok && response.status === 200) {
                    return response.text();
                } else {
                // there was an error with this first fetch, stop here
                    console.log("*SNOW TOOL BELT* there was an error while trying to switch nodes, stopping now");
                    sendResponse({"status": response.status});
                }
            })
            .then(function (text) {
                let current = getNameFromStatsPage(text);
                if (current === targetNode) {
                    console.log("*SNOW TOOL BELT* teeeheee we are already on target node");
                    sendResponse({"status": 200});
                } else {
                    // send the removeCookie command to background script, then try again
                    chrome.runtime.sendMessage({"command": "removeCookie", "instance": instanceName}, tryAgain);
                }
            });
        return true;
    }
});
