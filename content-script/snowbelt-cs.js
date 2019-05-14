const isChrome = (typeof browser === "undefined");
console.log("*SNOW TOOL BELT* Content script loaded");
/* const context = {
    loops: 0,
    currentTitle: "",
    headNode: document.getElementsByTagName("title")[0]
}; */

/**
 * Parses the stats page and extracts the node name
 * @param {string} text The text to extract the node name from
 */
function getNameFromStatsPage (text) {
    let instanceName = "";
    try {
        instanceName = text.split("<br/>")[1].split(": ")[1];
        // if current contains ":" then split it again
        if (instanceName.indexOf(":") > -1) {
            instanceName = instanceName.split(":")[1];
        }
    } catch (e) {
        console.log("*SNOW TOOL BELT* Couldn't analyse the text we got from the stats page");
        console.log(text);
    }
    return instanceName;
}

/**
 * Gets informations about current tab
 * @returns {Object} containing informations about current tab
 */
function getTabInfo () {
    let response = {
        "type": "other", // workspace / ...
        "details": "", // app name / ...
        "tabs": []
    };

    // is this a workspace?
    if (document.querySelector("sn-workspace-layout")) {
        response.type = "workspace";
        try {
            let root = document.querySelector("sn-workspace-tabs").shadowRoot.querySelector("chrome-tabs").shadowRoot.querySelectorAll("chrome-one-tab");
            root.forEach((elem) => {
                response.tabs.push(elem.shadowRoot.querySelector("li a span:nth-of-type(2)").innerText);
            });
        } catch (e) {
            console.log("*SNOW TOOL BELT* unable to find workspace tabs: " + e);
        }
    } else if (document.querySelector("div.sp-page-root")) {
        response.type = "portal";
    } else if (document.querySelector("div.status-bar-main")) {
        response.type = "app studio";
        response.details = document.querySelector("div.app-info").innerText;
    }

    return response;
}
/**
 * Paints the favicon with a specific color
 * @param {string} color value
 * @returns {boolean} true if work was done
 */
function updateFavicon (color) {
    if (color === undefined || color === "") {
        return true;
    }
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "shortcut icon");
        document.head.appendChild(link);
    }
    let faviconUrl = link.href || window.location.origin + "/favicon.ico";
    function onImageLoaded (imgNotFound) {
        let canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        let context = canvas.getContext("2d");
        if (imgNotFound === undefined || !imgNotFound) {
            context.drawImage(img, 0, 0);
            context.globalCompositeOperation = "source-in";
        }
        context.fillStyle = color;
        context.fillRect(0, 0, 16, 16);
        if (isChrome) {
            context.fill();
        }
        link.href = canvas.toDataURL();
        link.type = "image/x-icon";
    };
    function onImageError () {
        onImageLoaded(true);
    };
    let img = document.createElement("img");
    img.addEventListener("load", onImageLoaded);
    img.addEventListener("error", onImageError);
    img.src = faviconUrl;
}

// ask background script if this tab must be considered as a ServiceNow instance, and get the favicon color
chrome.runtime.sendMessage({"command": "isServiceNow"}, function (response) {
    if (response === undefined || response.isServiceNow === false) {
        console.log("*SNOW TOOL BELT* Not a ServiceNow instance, stopping now");
    } else {
        if (response.favIconColor !== undefined) {
            updateFavicon(response.favIconColor);
        }

        // Defining how to react to messages coming from the background script or the browser action
        chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            console.log("*SNOW TOOL BELT* received message: " + JSON.stringify(request));
            let instanceName = window.location.toString().split("/")[2];
            let url = new Request("https://" + instanceName + "/stats.do");
            if (request.command === "updateFavicon") {
                /**
                *  change Favicon color
                */
                updateFavicon(request.color);
            } else if (request.command === "getTabInfo") {
                /**
                 *  retrieve content informations
                 */
                let response = getTabInfo();
                sendResponse(response);
            } else if (request.command === "scanNodes") {
                /**
                *  scanNodes
                */
                console.log("*SNOW TOOL BELT* going to search for nodes");
                // let scans = 0;
                // let maxScans = 50;
                let nodes = [];
                fetch(url, {credentials: "same-origin"})
                    .then(function (response) {
                        if (response.ok && response.status === 200) {
                            return response.text().then(function (text) {
                                if (text === undefined || !text) {
                                    return false;
                                }
                                let current = getNameFromStatsPage(text);
                                console.log("*SNOW TOOL BELT* current: " + current);

                                let xmlStatsURL = new Request("https://" + instanceName + "/xmlstats.do");
                                fetch(xmlStatsURL, {credentials: "same-origin"})
                                    .then(function (response) {
                                        if (response.ok && response.status === 200) {
                                            return response.text().then(function (txt) {
                                                let parser = new DOMParser();
                                                let xmlDoc = parser.parseFromString(txt, "text/xml");
                                                let nodesList = xmlDoc.querySelectorAll("node system_id");
                                                nodesList.forEach(function (node) {
                                                    nodes.push(node.textContent.split(":")[1]);
                                                });
                                                console.log("*SNOW TOOL BELT* nodes: ");
                                                console.log(nodes);

                                                sendResponse({"nodes": nodes, "current": current, "status": 200});
                                            });
                                        } else {
                                            // there was an error while fetching xmlstats, stop here
                                            console.log("*SNOW TOOL BELT* there was an error while fetching xmlstats, stopping now: " + response.status);
                                            sendResponse({"nodes": [], "current": "", "status": response.status});
                                        }
                                    })
                                    .catch(function (err) {
                                        console.log("*SNOW TOOL BELT* there was an error while fetching xmlstats, stopping now");
                                        console.log(err);
                                        sendResponse({"nodes": [], "current": "", "status": 500});
                                    });
                            });
                        } else {
                            // there was an error with this first fetch, stop here
                            console.log("*SNOW TOOL BELT* there was an error with the first fetch, stopping now: " + response.status);
                            sendResponse({"nodes": [], "current": "", "status": response.status});
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
                let maxTries = 50;
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
    }
});
