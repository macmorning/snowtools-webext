const isChrome = (typeof browser === "undefined");
const context = {
    g_ck: ""
}
/**
 * Changes field labels to technical names and the other way round
 */
function switchFieldNames() {
    // this is *very* DOM dependent and could break anyday if ServiceNow changes the structure of their pages
    let doc = (document.getElementsByTagName("iframe")[0] ? document.getElementsByTagName("iframe")[0].contentWindow.document : document);
    // for [related] lists
    let fields = doc.querySelectorAll("[glide_field]");
    [].forEach.call(fields, (el) => {
        childEl = el.querySelector("span a");
        childEl.innerText = (childEl.innerText === el.getAttribute("glide_field")) ? el.getAttribute("glide_label") : el.getAttribute("glide_field");
    });
    // for forms
    fields = doc.querySelectorAll("label[for].control-label");
    [].forEach.call(fields, (el) => {
        childEl = el.querySelector("span.label-text");
        if (el.getAttribute("data-sntb-name") && el.getAttribute("data-sntb-name") !== childEl.innerText) {
            childEl.innerText = el.getAttribute("data-sntb-name");
        } else {
            el.setAttribute("data-sntb-name", childEl.innerText);   // save original name into a custom attribute
            childEl.innerText = el.getAttribute("for").replace("sys_display.","").replace("select_0","");
        }
    });
    // for workspace?
    // much harder because of shadow-roots; would it be useful anyway? Admins can just use classic UI form and display workspace view.
}
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
        console.log("*SNOW TOOL BELT* Couldn't analyze the text we got from the stats page");
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
            // This is a very workspace DOM dependent implementation; need to find a better way of doing this 
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
 * Initializes all content script features 
 * @param {object} response the response object that was sent by the background script
 * @returns {boolean} true if work was done
 */
function initScript (response) {
    let frame = document.getElementById("gsft_main");
    let targetWindow = frame ? frame.contentWindow : window;
    console.log(targetWindow);
    if (response.favIconColor !== undefined) {
        updateFavicon(response.favIconColor);
    }

    // get session identifier "g_ck" from page
    window.addEventListener("message", function(event) {
        if (event.source == window &&
            event.data.direction &&
            event.data.direction == "from-page-script") {
            context.g_ck = event.data.message;
        }
        console.log(context.g_ck);
    });
    let getSessionJS = window.document.createElement("script");
    getSessionJS.setAttribute("src",chrome.runtime.getURL("/content-script/getSession.js"));
    window.document.head.appendChild(getSessionJS);

    // Handle the background script popup case
    let title = document.querySelector("title");
    if (!title) { 
        title = document.createElement("title");
        document.head.appendChild(title);
    }

    /*if (window.location.pathname.indexOf("sys.scripts.do") > -1) {
        title.innerText = "Background Script";
        let backBtn = document.getElementById("snowtools-backbtn");
        if (!backBtn) {
            backBtn = document.createElement("button");
            backBtn.id = "snowtools-backbtn";
            backBtn.style = "cursor: pointer;top:7px; right: 7px; position: fixed;";
            backBtn.innerHTML = "&#8678; back";
            backBtn.onclick = (evt) => { window.history.back(); };
            document.body.appendChild(backBtn);
        }

        if (!targetWindow.codeMirrorLoaded) {
            targetWindow.codeMirrorLoaded = true;
            let codeCSS = targetWindow.document.createElement("link");
            codeCSS.setAttribute("href", "/styles/GlideEditor5Includes.cssx?v=01-12-2020_1944");
            codeCSS.setAttribute("rel", "stylesheet");
            targetWindow.document.head.appendChild(codeCSS);
            let doctypeJS = targetWindow.document.createElement("script");
            doctypeJS.setAttribute("src","/scripts/doctype/js_includes_doctype.jsx");
            doctypeJS.onload = () => {
                console.warn('onload doctype');
                let codeJS = targetWindow.document.createElement("script");
                codeJS.setAttribute("src","/scripts/GlideEditor5Includes.jsx");
                codeJS.onload = () => {
                    console.warn('onload codejs');
                    let codeJavascriptJS = targetWindow.document.createElement("script");
                    codeJavascriptJS.setAttribute("src","/scripts/snc-code-editor/codemirror/mode/javascript/javascript.js");
                    codeJavascriptJS.onload = () => {
                        console.warn('onload codejavascript');
                        let injectedJS = targetWindow.document.createElement("script");
                        injectedJS.setAttribute("src",chrome.runtime.getURL("/content-script/activateCodeMirror.js"));
                        targetWindow.document.head.appendChild(injectedJS);
                    }
                    targetWindow.document.head.appendChild(codeJavascriptJS);
                }
                targetWindow.document.head.appendChild(codeJS);
            }
            targetWindow.document.head.appendChild(doctypeJS);
        }
    } */

}

/**
 * Paints the favicon with a specific color
 * @param {string} color value
 * @returns {boolean} true if work was done
 */
function updateFavicon (color) {
    console.log("*SNOW TOOL BELT* update favicon color to: " + color);
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

    let canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    let context = canvas.getContext("2d");

    let img = document.createElement("img");
    img.onload = function (ev) {
        context.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "source-in";

        context.fillStyle = color;
        context.fillRect(0, 0, 256, 256);

        link.href = canvas.toDataURL();
        link.type = "image/x-icon";
    };
    img.src = faviconUrl;
}


(function () {
    console.log("*SNOW TOOL BELT* Content script loaded");
    // ask background script if this tab must be considered as a ServiceNow instance, and get the favicon color
    chrome.runtime.sendMessage({"command": "isServiceNow"}, function (response) {
        if (response === undefined || response.isServiceNow === false) {
            console.log("*SNOW TOOL BELT* Not a ServiceNow instance, stopping now");
        } else {
            initScript(response);

            // Defining how to react to messages coming from the background script or the browser action
            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                console.log("*SNOW TOOL BELT* received message: " + JSON.stringify(request));
                let instanceName = window.location.hostname;
                let host = window.location.host;
                let statsUrl = new Request("https://" + host + "/stats.do");

                /* No need to search for g_ck for now
                let g_ck = "";
                try {
                    if (window.g_ck) {
                        // for SP and workspace
                        g_ck = window.g_ck;
                    } else if (document.getElementById("sysparm_ck")) {
                        // for backoffice form out of iframe
                        g_ck = document.getElementById("sysparm_ck").value;
                    } else if (document.getElementsByTagName("iframe")[0] && document.getElementsByTagName("iframe")[0].contentWindow.document.getElementById("sysparm_ck")) {
                        // for backoffice form inside of iframe
                        g_ck = document.getElementsByTagName("iframe")[0].contentWindow.document.getElementById("sysparm_ck").value;
                    }
                } catch(e) {
                    // we could not find a g_ck token, no REST call can be made from this instance of the content script
                }*/
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
                } else if (request.command === "execute-fieldnames") {
                    /**
                     *  switch fieldnames/labels
                     */
                    sendResponse(true);
                    switchFieldNames();
                } else if (request.command === "getUpdateSet") {
                    console.log("*SNOW TOOL BELT* getting update set informations");

                    let concourseUrl = new Request("https://" + host + "/api/now/ui/concoursepicker/updateset");
                    let headers = new Headers();
                    headers.append('Content-Type', 'application/json');
                    headers.append('Accept', 'application/json');
                    headers.append('Cache-Control', 'no-cache');
                    headers.append('Cache-Control', 'no-cache');

                    // fetch(concourseUrl, {headers: headers})
                    fetch(concourseUrl, {credentials: "same-origin", headers: headers})
                        .then(function(response) {
                            if (response.ok && response.status === 200) {
                                return response.text().then(function (txt) {
                                        try {
                                            let parsed = JSON.parse(txt).result;
                                            sendResponse({"updateSet": parsed.updateSet, "current": parsed.current, "status": 200});
                                        } catch(e) {
                                            console.log("*SNOW TOOL BELT* there was an error while parsing concourse API response, stopping now: " + e);
                                            sendResponse({"updateSet": "", "current": "", "status": 200});
                                        }
                                });
                            } else {
                                // there was an error while fetching xmlstats, stop here
                                console.log("*SNOW TOOL BELT* there was an error while fetching concourse API, stopping now: " + response.status);
                                sendResponse({"updateset": "", "current": "", "status": response.status});
                            }
                        });
                    return true;
                } else if (request.command === "scanNodes") {
                    /**
                    *  scanNodes
                    */
                    console.log("*SNOW TOOL BELT* going to search for nodes");
                    // let scans = 0;
                    // let maxScans = 50;
                    let nodes = [];
                    fetch(statsUrl, {credentials: "same-origin"})
                        .then(function (response) {
                            if (response.ok && response.status === 200) {
                                return response.text().then(function (text) {
                                    if (text === undefined || !text) {
                                        return false;
                                    }
                                    let current = getNameFromStatsPage(text);
                                    console.log("*SNOW TOOL BELT* current: " + current);

                                    let xmlStatsURL = new Request("https://" + host + "/xmlstats.do");
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
                        fetch(statsUrl, {credentials: "same-origin"})
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

                    fetch(statsUrl, {credentials: "same-origin"})
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
                                sendResponse({"status": 200, "current": current});
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
})();

