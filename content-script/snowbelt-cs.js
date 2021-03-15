const isChromium = (typeof browser === "undefined");
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
        // console.log("*SNOW TOOL BELT* Couldn't analyze the text we got from the stats page");
        // console.log(text);
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
    if (document.querySelector("sn-workspace-layout") || document.querySelector("sn-canvas-root")) {
        response.type = "workspace";
        try {
            // This is a very workspace DOM dependent implementation; need to find a better way of doing this 
            let root = document.querySelector("sn-workspace-tabs").shadowRoot.querySelector("chrome-tabs").shadowRoot.querySelectorAll("chrome-one-tab");
            root.forEach((elem) => {
                response.tabs.push(elem.shadowRoot.querySelector("li a span:nth-of-type(2)").innerText);
            });
        } catch (e) {
            // console.log("*SNOW TOOL BELT* unable to find workspace tabs: " + e);
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
 * @param {object} options the response object that was sent by the background script
 * @returns {boolean} true if work was done
 */
function initScript (options) {
    let frame = document.getElementById("gsft_main");
    let targetWindow = frame ? frame.contentWindow : window;
    if (options.favIconColor !== undefined) {
        updateFavicon(options.favIconColor);
    }

    // get session identifier "g_ck" from page
    window.addEventListener("message", function(event) {
        if (event.source == window &&
            event.data.direction &&
            event.data.direction == "from-snow-page-script") {
            context.g_ck = event.data.message;
        }
    });
    // inject the getSession script to get the g_ck token
    let getSessionJS = window.document.createElement("script");
    getSessionJS.setAttribute("src",chrome.runtime.getURL("/content-script/getSession.js"));
    window.document.head.appendChild(getSessionJS);

    let title = document.querySelector("title");
    if (!title) { 
        title = document.createElement("title");
        document.head.appendChild(title);
    }

    // Handle the background script popup case
    let url = new URL(window.location);
    if (url.pathname == "/sys.scripts.do") {
        document.title = "Background script popup";
        let textareaEl = document.querySelector("textarea");

        // load the Heisenberg css file
        let cssFile = window.document.createElement("link");
        cssFile.setAttribute("rel", "stylesheet");
        cssFile.setAttribute("href",chrome.runtime.getURL("/css/snowbelt.css"));
        window.document.head.appendChild(cssFile);

        if (textareaEl) {
            // We are on the initial background script page
            // retrieves execution history for the current user
            let historyUrl = new Request(url.origin + "/sys_script_execution_history_list.do?JSONv2&sysparm_action=getRecords&sysparm_query=executed_byDYNAMIC90d1921e5f510100a9ad2572f2b477fe^ORDERBYDESCstarted");
            let headers = new Headers();
            headers.append('Content-Type', 'application/json');
            headers.append('Accept', 'application/json');
            headers.append('Cache-Control', 'no-cache');

            fetch(historyUrl, {headers: headers})
                .then((response) => {
                    if (response.ok && response.status === 200) {
                        // we got a response, return the result
                        return response.json();
                    } else {
                        // there was an error while fetching the data, stop here
                    }
                }).then((data) => {
                    if (data.records && data.records.length > 0) {
                        let uniqueRecords = data.records.filter(function({script}) {
                            return !this[script] && (this[script] = script)
                        }, {})
                        context.history = {
                            records: uniqueRecords,
                            current: -1,
                            recordsCount: uniqueRecords.length
                        };
                        const table = backgroundScriptAddonTableTemplate();
                        document.body.insertAdjacentHTML("afterbegin", table);
                        let tableEl = document.getElementById("execution_history_table");
                        let tableContent = "";
                        context.history.records.forEach((record, index)=>{
                            tableContent += backgroundScriptAddonRowTemplate(record, index);
                        });
                        tableEl.innerHTML += tableContent;
                        const displayHistoryRecord = (index) => {

                            textareaEl.value = context.history.records[index].script;
                            textareaEl.innerHTML = context.history.records[index].script;
                        }
                        elements = document.querySelectorAll(".history_table tr");
                        [].forEach.call(elements, (el) => {
                            el.onclick = (evt) => {
                                let index = (evt.target.getAttribute("data-id") ? evt.target.getAttribute("data-id") : evt.target.parentNode.getAttribute("data-id"));
                                displayHistoryRecord(index);
                            }
                        });
                    }
                });
        } else {
            // We are on the execution summary page, show the back button
            const content = backgroundScriptAddonTemplate2();
            document.body.insertAdjacentHTML("afterbegin", content);
            let backBtnEl = document.querySelector("#historyBackButton");
            backBtnEl.onclick = (evt) => { window.history.back(); }
        }    
    }
}

/**
 *  Returns an HTML string to display the title and the buttons to navigate in the script history
 */
function backgroundScriptAddonTemplate2() {
    return `
        <div class="history">
            <button id="historyBackButton">&lt;- back</button>
        </div>
    `
}

/**
 *  Returns an HTML table
 */
function backgroundScriptAddonTableTemplate() {
    return `
    <div class="history">
        <table id="execution_history_table" class="history_table">
            <tr id="execution_history_header">
                <th style="width:3%;" name="">
                </th>
                <th style="width:25%;" name="last_executed">
                    <span style="white-space:nowrap">last executed</span>
                </th>
                <th style="width:72%;" name="script">
                    <span style="white-space:nowrap">script</span>
                </th>
            </tr>
        </table>
    </div>
    `
}
/**
 *  Returns an HTML table row
 */
function backgroundScriptAddonRowTemplate(row, index) {
    return `
        <tr data-id="${index}" id="execution_history_table_${row.sys_id}">
            <td name="">
                &gt;
            </td>
            <td name="started">
                ${row.started}
            </td>
            <td name="script">
                ${row.script}
            </td>
        </tr>
    `
}


/**
 * Paints the favicon with a specific color
 * @param {string} color value
 * @returns {boolean} true if work was done
 */
function updateFavicon (color) {
    // console.log("*SNOW TOOL BELT* update favicon color to: " + color);
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
                // console.log("*SNOW TOOL BELT* received message: " + JSON.stringify(request));
                let instanceName = window.location.hostname;
                let host = window.location.host;
                let statsUrl = new Request(window.location.origin + "/stats.do");

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
                    // console.log("*SNOW TOOL BELT* getting update set informations");
                    if (!context.g_ck) {
                        sendResponse({"updateSet": "", "current": "", "status": 200});
                        return false;
                    }
                    let concourseUrl = new Request(window.location.origin + "/api/now/ui/concoursepicker/updateset");
                    let headers = new Headers();
                    headers.append('Content-Type', 'application/json');
                    headers.append('Accept', 'application/json');
                    headers.append('Cache-Control', 'no-cache');
                    headers.append('X-UserToken', context.g_ck);

                    // fetch(concourseUrl, {headers: headers})
                    fetch(concourseUrl, {headers: headers})
                        .then(function(response) {
                            if (response.ok && response.status === 200) {
                                return response.text().then(function (txt) {
                                        try {
                                            let parsed = JSON.parse(txt).result;
                                            sendResponse({"updateSet": parsed.updateSet, "current": parsed.current, "status": 200});
                                        } catch(e) {
                                            // console.log("*SNOW TOOL BELT* there was an error while parsing concourse API response, stopping now: " + e);
                                            sendResponse({"updateSet": "", "current": "", "status": 200});
                                        }
                                });
                            } else {
                                // there was an error while fetching xmlstats, stop here
                                // console.log("*SNOW TOOL BELT* there was an error while fetching concourse API, stopping now: " + response.status);
                                sendResponse({"updateset": "", "current": "", "status": response.status});
                            }
                        });
                    return true;
                } else if (request.command === "scanNodes") {
                    /**
                    *  scanNodes
                    */
                    console.log("*SNOW TOOL BELT* Using this tab to search for nodes");
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
                                    // console.log("*SNOW TOOL BELT* current: " + current);

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
                                                    // console.log("*SNOW TOOL BELT* nodes: ");
                                                    // console.log(nodes);

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
                    console.log("*SNOW TOOL BELT* using this tab to switch to node " + request.node);
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
                                // console.log("*SNOW TOOL BELT* node name: " + current);
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

