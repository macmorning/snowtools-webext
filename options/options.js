let isChromium = (typeof browser === "undefined");
const context = {
    knownInstances: {},
    instanceOptions: {},
    useSync: false,
    storageArea: {}
};
chrome.commands.getAll((result) => { 
    context.commands = result;
});
/**
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 */
const displayMessage = (txt, details) => {
    if (txt === undefined) { return false; }
    if (details === undefined) { details = ""; }

    let messages = document.getElementById("messages");
    let messagesDetails = document.getElementById("messages_details");

    messages.innerHTML = "&nbsp;";
    messagesDetails.innerText = "&nbsp;";
    messagesDetails.style.visibility = "hidden";

    window.setTimeout(() => {
        messages.innerHTML = txt;
        location.hash = "messagePopin";
        if (details) {
            messagesDetails.innerText = details;
            messagesDetails.style.visibility = "visible";
        }
    }, 100);
};

/**
 * Opens the colorPicker popup
 * @param {object} evt the event that triggered the action
 */
const selectColor = (evt) => {
    let targetInstance = "";
    if (evt.target.getAttribute("data-instance")) {
        targetInstance = evt.target.getAttribute("data-instance");
    } else if (context.clicked && context.clicked.getAttribute("data-instance")) {
        targetInstance = context.clicked.getAttribute("data-instance");
    }

    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    } else {
        document.getElementById("colorPicker").querySelector("[name='instanceName']").innerText = targetInstance;
        if (context.instanceOptions[targetInstance]["color"] !== undefined) {
            document.getElementById("colorPickerColor").value = context.instanceOptions[targetInstance]["color"];
        } else {
            document.getElementById("colorPickerColor").value = "#000000";
        }
    }
    // document.getElementById("colorPicker").style.display = "block";
    location.hash = "colorPicker";
};

const removeFilter = (ev) => {
    if (ev && ev.target && ev.target.getAttribute("data-id")) {
        context.urlFilters = context.urlFilters.replace(ev.target.getAttribute("data-id") + ";", ";");
        saveFilters();
        rebuildDomainsList();
    }
};

const addFilter = (el) => {
    if (el && el.value && context.urlFilters.indexOf(el.value + ";") == -1) {
        // remove http:// and https:// from filter string
        // each filter can match a pattern seach as equant.com or service-now.com
        const regex = /http[s]{0,1}:\/\//gm;
        const regex2 = /\/[^;]*/gm;
        newFilter = el.value.replace(regex, "").replace(regex2, "");
        el.value = "";
        context.urlFilters += newFilter + ";";
        saveFilters();
        rebuildDomainsList();
    }
};
const rebuildDomainsList = () => {

    let urlFiltersList = document.getElementById("urlFiltersList");
    let urlFiltersListContainer = document.getElementById("urlFiltersListContainer");
    if (context.extraDomains) {
        urlFiltersListContainer.style.display = "block";
        while (urlFiltersList.firstChild) {
            urlFiltersList.removeChild(urlFiltersList.firstChild);
        };
        let urlFiltersArray = context.urlFilters.split(";");
        urlFiltersArray.sort();
        urlFiltersArray.forEach(domain => {
            if (domain.length) {
                let templateInstance = document.getElementById("domainRow");
                let domainRow = templateInstance.innerHTML.toString().replace(/\{\{domainid\}\}/g, domain).replace(/\{\{title\}\}/g, domain);
                urlFiltersList.innerHTML += domainRow;
            }
        });
        // add remove filter actions
        elements = document.querySelectorAll("a[title=\"remove\"]");
        [].forEach.call(elements, (el) => {
            el.addEventListener("click", removeFilter);
        });
    } else {
        urlFiltersListContainer.style.display = "none";
    }
};
/**
 * Restores the options saved into storage area
 */
const restoreOptions = () => {
    // clearOptions first
    let instancesDiv = document.getElementById("knownInstancesList");
    while (instancesDiv.firstChild) {
        instancesDiv.removeChild(instancesDiv.firstChild);
    };
    chrome.storage.local.get("useSync", (result1) => {
        context.useSync = (result1.useSync === "true" || result1.useSync === true);
        document.getElementById("useSync").checked = context.useSync;
        // load options from storage area depending on the useSync setting
        context.storageArea = (context.useSync ? chrome.storage.sync : chrome.storage.local);
        context.storageArea.get(["extraDomains", "urlFilters", "knownInstances", "instanceOptions", "autoFrame", "showUpdatesets"], (result) => {
            context.extraDomains = (result.extraDomains === "true" || result.extraDomains === true);
            context.urlFilters = result.urlFilters || "service-now.com;";
            rebuildDomainsList();
            
            document.getElementById("extraDomains").checked = context.extraDomains;
            // document.getElementById("urlFilters").value = context.urlFilters;
            document.getElementById("autoFrame").checked = (result.autoFrame === "true" || result.autoFrame === true);
            document.getElementById("showUpdatesets").checked = (result.showUpdatesets === "true" || result.showUpdatesets === true || result.showUpdatesets === undefined);
            try {
                if (result.knownInstances !== undefined) { context.knownInstances = JSON.parse(result.knownInstances); }
                else { context.knownInstances = {}; }
            } catch (e) {
                context.knownInstances = {};
                console.log(e);
            }
            try {
                if (result.instanceOptions !== undefined) { context.instanceOptions = JSON.parse(result.instanceOptions); }
                else { context.instanceOptions = {}; }
            } catch (e) {
                context.instanceOptions = {};
                console.log(e);
            }
            if (Object.keys(context.knownInstances).length !== 0) {
                // if knownInstances is not empty, build the input fields
                sortInstances(sortProperties(context.knownInstances, false));
                for (var key in context.knownInstances) {
                    if (!key.endsWith("service-now.com") && !context.extraDomains) {
                        document.getElementById("extraDomainsHighlight").style.display = "inline";
                    }
                    let input = document.createElement("input");
                    input.setAttribute("type", "text");
                    input.setAttribute("name", "instanceLabel");
                    input.setAttribute("id", key);
                    input.value = context.knownInstances[key];
                    var hidden = (context.instanceOptions[key]["hidden"] !== undefined ? context.instanceOptions[key]["hidden"] : false);
                    let label = document.createElement("label");
                    label.className = "instance-label";
                    label.setAttribute("for", input.id);
                    label.innerHTML = "<a class=\"no_underline button color-indicator\" data-instance=\"" + key + "\" title=\"pick a color\">&#9632;</a>" + key + 
                        " <span class='pull-right'>" +
                        "<label class='switch'  title=\"show or hide this instance\"><input name='showOrHide' type='checkbox' id=\"show#" + input.id + "\" " + (!hidden ? "checked" : "") + "><span class='slider round'></span></label>" +
                        " <a class=\"no_underline button\" data-instance=\"" + key + "\" title=\"forget this instance\" id=\"del#" + input.id + "\">&#10799;</a></span>";

                    instancesDiv.appendChild(label);
                    instancesDiv.appendChild(input);
                }

                // add remove instance
                let elements = {};
                elements = document.querySelectorAll("a[title=\"forget this instance\"]");
                [].forEach.call(elements, (el) => {
                    el.addEventListener("click", deleteInstance);
                });

                // show/hide actions
                elements = document.querySelectorAll("input[name=\"showOrHide\"]");
                [].forEach.call(elements, (el) => {
                    el.addEventListener("change", saveOptions);
                });

                // store label change
                elements = document.querySelectorAll("input[name=\"instanceLabel\"]");
                [].forEach.call(elements, (el) => {
                    el.addEventListener("change", saveOptions);
                });
                
                // add close tab actions
                elements = document.querySelectorAll("a[title=\"pick a color\"]");
                [].forEach.call(elements, (el) => {
                    let instance = el.getAttribute("data-instance");
                    let color = "";
                    if (instance) {
                        color = (context.instanceOptions[instance]["color"] !== undefined ? context.instanceOptions[instance]["color"] : "");
                    }
                    if (color) {
                        el.style.color = color;
                    } else {
                        el.style.color = "black";
                    }
                    el.addEventListener("click", (e) => {
                        context.clicked = e.target;
                        selectColor(e);
                    });
                });

                // Save and close button
                document.getElementById("popin_color").addEventListener("click", saveColor);
                document.getElementById("popin_no_color").addEventListener("click", saveNoColor);

                // Filter instances
                document.getElementById("instanceFilter").addEventListener("keyup", (ev) => {
                    let elements = document.getElementById("knownInstancesList").querySelectorAll("input[type='text']");
                    [].forEach.call(elements, (el) => {
                        if (el.value !== "" && el.value.toLowerCase().indexOf(ev.target.value.toLowerCase()) === -1
                                && el.id.toLowerCase().indexOf(ev.target.value.toLowerCase()) === -1) {
                            el.style.display = "none";
                            document.getElementById("knownInstancesList").querySelector("label[for='" + el.id + "']").style.display = "none";
                        } else {
                            el.style.display = "initial";
                            document.getElementById("knownInstancesList").querySelector("label[for='" + el.id + "']").style.display = "initial";
                        }
                    });
                });
            }
        });
    });
};

/**
 * Rebuild the knownInstances from the object returned by sortProperties.
 * @param {Array} arr array of items in [[key,value],[key,value],...] format.
 */
const sortInstances = (arr) => {
    context.knownInstances = {};
    arr.forEach((item) => {
        context.knownInstances[item[0]] = item[1];
    });
};

/**
 * Sort object properties (only own properties will be sorted).
 * https://gist.github.com/umidjons/9614157
 * @author umidjons
 * @param {object} obj object to sort properties
 * @param {bool} isNumericSort true - sort object properties as numeric value, false - sort as string value.
 * @returns {Array} array of items in [[key,value],[key,value],...] format.
 */
const sortProperties = (obj, isNumericSort) => {
    isNumericSort = isNumericSort || false; // by default text sort
    var sortable = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) { sortable.push([key, obj[key]]); }
    }
    if (isNumericSort) {
        sortable.sort((a, b) => {
            return a[1] - b[1];
        });
    } else {
        sortable.sort((a, b) => {
            let x = a[1].toLowerCase();
            let y = b[1].toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        });
    }
    return sortable; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
};

/**
 * Saves selected color
 * @param {object} evt the event that triggered the action
 */
const saveColor = (evt) => {
    let targetInstance = "";
    targetInstance = context.clicked.getAttribute("data-instance");
    context.clicked.style.color = document.getElementById("colorPickerColor").value;
    location.hash = "";
    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    }
    context.instanceOptions[targetInstance]["color"] = document.getElementById("colorPickerColor").value;
    saveInstanceOptions();
};

/**
 * Saves no color for the instance
 * @param {object} evt the event that triggered the action
 */
const saveNoColor = (evt) => {
    let targetInstance = "";
    targetInstance = context.clicked.getAttribute("data-instance");
    context.clicked.style.color = "#000000";
    location.hash = "";
    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    }
    try {
        delete context.instanceOptions[targetInstance]["color"];
    } catch (e) {
        console.log(e);
    }
    saveInstanceOptions();
};

/**
 * Removes the the known instance from the local context.knownInstances object
 * @param {object} evt the event that triggered the action
 */
const deleteInstance = (evt) => {
    let id = evt.target.id.split("#")[1];
    // displayMessage("Forgetting about " + id + "...");
    delete context.knownInstances[id];
    delete context.instanceOptions[id];
    document.getElementById("knownInstancesList").removeChild(evt.target.parentNode.parentNode); // remove the label element
    document.getElementById("knownInstancesList").removeChild(document.getElementById(id)); // remove the input element
    saveOptions(evt);
};

/**
 * Saves the domain filters
 */
const saveFilters = () => {
    context.storageArea.set({ "urlFilters": context.urlFilters }, () => {});
}
/**
 * Saves the instances checked states
 */
const saveInstanceOptions = () => {
    try {
        context.storageArea.set({
            "instanceOptions": JSON.stringify(context.instanceOptions)
        }, () => {
            // displayMessage("Options saved");
            console.log("Saved instance options");
        });
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Please report this error with below details.", e);
    }
};

async function register(hosts, code) {
    return await chrome.contentScripts.register({
        matches: [hosts],
        js: [{code}],
        runAt: "document_idle"
    });
}

/**
 * Saves the options into storage
 * @param {object} evt the event that triggered the action
 */
const saveOptions = (evt) => {
    evt.preventDefault();
    try {
        if (evt.target.id === "autoFrame") {
            context.autoFrame = evt.target.checked;
            context.storageArea.set({ "autoFrame": context.autoFrame }, () => {});
        } else if (evt.target.id === "showUpdatesets") {
            context.showUpdatesets = evt.target.checked;
            context.storageArea.set({ "showUpdatesets": context.showUpdatesets }, () => {});
        } else if (evt.target.id === "extraDomains") {
            console.log(evt.target.checked);
            context.extraDomains = evt.target.checked;
            if (context.extraDomains) {
                chrome.permissions.contains({
                    origins: ["https://*/*"]
                }, (result) => {
                    console.log("result before > " + result);
                });
                chrome.permissions.request({
                    origins: ["https://*/*"]
                }, granted => {
                    if (granted) {
                        context.storageArea.set({ "extraDomains": context.extraDomains }, () => {
                            // this should trigger an event that will be catched by the background script, which will ask the browser to inject the content script
                            rebuildDomainsList();
                        });
                    } else {
                        evt.target.checked = false;
                        context.extraDomains = false;
                        rebuildDomainsList();
                        displayMessage("Your permission is required to use the extension outside of service-now.com domains.");
                    }
                    chrome.permissions.contains({
                        origins: ["https://*/*"]
                    }, (result) => {
                        console.log("result after > " + result);
                    });
                });
            } else {
                chrome.permissions.remove({
                    origins: ["https://*/*"]
                });
                context.storageArea.set({ "extraDomains": context.extraDomains }, () => { 
                    rebuildDomainsList();
                });
            }
        } else {
            for (var key in context.knownInstances) {
                context.knownInstances[key] = document.getElementById(key).value;
                if (context.instanceOptions[key] === undefined) {
                    context.instanceOptions[key] = {};
                }
                context.instanceOptions[key].hidden = !document.getElementById("show#" + key).checked;
            }    
            context.storageArea.set({
                "knownInstances": JSON.stringify(context.knownInstances),
                "instanceOptions": JSON.stringify(context.instanceOptions),
            }, () => {
                console.log("Options saved!");
            });
        }
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Please report this error with below details.", e);
    }
};
/**
 * Exports the options into storage
 * @param {object} evt the event that triggered the action
 */
const exportOptions = (evt) => {
    chrome.permissions.request({
        permissions: ['downloads']
    }, (granted) => {
        if (granted) {
            context.storageArea.get(["extraDomains","urlFilters", "knownInstances", "instanceOptions", "autoFrame", "showUpdatesets"], (result) => {
                // let string = encodeURIComponent(JSON.stringify(result));
                var blob = new Blob([JSON.stringify(result)], {type: "application/json;charset=utf-8"});
                try {
                    chrome.downloads.download({
                        filename: "snow-toolbelt-backup.json",
                        saveAs: true,
                        url: URL.createObjectURL(blob)
                    });
                } catch (e) {
                    displayMessage("Sorry, there was a browser error. Please report it with the details below.", e);
                    console.log(e);
                }
            });
        } else {
            displayMessage("Sorry, the extension can only export your data if you approved the requested permission.");
        }
    });
    evt.preventDefault();
};
/**
 * Imports the options into storage
 * @param {object} evt the event that triggered the action
 */
const importOptions = (evt) => {
    let file = evt.target.files[0];
    let reader = new FileReader();
    reader.onerror = (event) => {
        displayMessage("Sorry, there was an error importing your file. Please report it with the details below.", JSON.stringify(event));
        reader.abort();
        evt.target.value = "";
    };
    reader.onload = (event) => {
        try {
            let obj = JSON.parse(event.target.result);
            if (obj.knownInstances !== undefined) {
                // verify json integrity
                JSON.parse(obj.knownInstances);
                JSON.parse(obj.instanceOptions);
                
                context.storageArea.set({
                    "knownInstances": obj.knownInstances,
                    "instanceOptions": obj.instanceOptions,
                    "extraDomains": false, // always set to false by default to request the all_urls permission again if required
                    "urlFilters": obj.urlFilters,
                    "autoFrame": obj.autoFrame,
                    "showUpdatesets": obj.showUpdatesets
                }, () => {
                    displayMessage("Options restored from file");
                    restoreOptions();
                });
            }
        } catch (e) {
            console.log(e);
            displayMessage("Sorry, there was an error importing your file. Please report it the details below.", e);
        } finally {
            evt.target.value = "";
        }
    };
    reader.readAsText(file);
};
/**
 * Opens the file selection window
 * @param {Event} evt the event that triggered the action
 */
const openFileSelect = (evt) => {
    document.getElementById("importFile").click();
};

/**
 * Triggered when user changes the "useSync" toggle
 * @param {Event} evt the event that triggered the action
 */
const toggleSync = (evt) => {
    context.useSync = evt.target.checked;
    context.storageArea = (context.useSync ? chrome.storage.sync : chrome.storage.local);
    try {
        context.storageArea.get(["urlFilters"],(result) => {
            chrome.storage.local.set({
                "useSync" : context.useSync
            });
            restoreOptions();
        });
    } catch(e) {
        console.error(e);
        displayMessage("There was an error accessing the desired storage area.", e);
        evt.target.checked = !context.useSync;
    }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.getElementById("useSync").addEventListener("change", toggleSync);
document.getElementById("autoFrame").addEventListener("change", saveOptions);
document.getElementById("extraDomains").addEventListener("change", saveOptions);
document.getElementById("showUpdatesets").addEventListener("change", saveOptions);
document.getElementById("export").addEventListener("click", exportOptions);
document.getElementById("import").addEventListener("click", openFileSelect);
document.getElementById("importFile").style.display = "none";
document.getElementById("importFile").addEventListener("change", importOptions);
document.getElementById("newFilter").addEventListener("keyup", function (event) {
    event.preventDefault();
    if (event.keyCode === 13) {
        addFilter(event.target);
    }
});
