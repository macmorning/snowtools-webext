const context = {
    knownInstances: {},
    instanceOptions: {},
    useSync: false,
    storageArea: {}
};

/**
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 */
const displayMessage = (txt, details) => {
    if (txt === undefined) { return false; }
    if (details === undefined) { details = ""; }

    let messages = document.getElementById("messages");
    let messagesMore = document.getElementById("messages_more");
    let messagesDetails = document.getElementById("messages_details");

    messages.innerHTML = "&nbsp;";
    messagesDetails.innerHTML = "&nbsp;";
    messagesMore.style.visibility = "hidden";

    window.setTimeout(() => {
        messages.innerHTML = txt;
        if (details) {
            messagesMore.style.visibility = "visible";
            messagesMore.style.cursor = "pointer";
            messagesMore.onclick = (evt) => {
                messagesDetails.innerHTML = details;
            };
        }
    }, 500);
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

/**
 * Restores the options saved into storage area
 */
const restoreOptions = () => {
    // clearOptions first
    let instancesDiv = document.getElementById("knownInstances");
    while (instancesDiv.firstChild) {
        instancesDiv.removeChild(instancesDiv.firstChild);
    };
    chrome.storage.local.get("useSync", (result1) => {
        context.useSync = (result1.useSync === "true" || result1.useSync === true);
        document.getElementById("useSync").checked = context.useSync;
        // load options from storage area depending on the useSync setting
        context.storageArea = (context.useSync ? chrome.storage.sync : chrome.storage.local);
        context.storageArea.get(["urlFilters", "knownInstances", "instanceOptions", "autoFrame"], (result) => {
            document.getElementById("urlFilters").value = result.urlFilters || "service-now.com;";
            document.getElementById("autoFrame").checked = (result.autoFrame === "true" || result.autoFrame === true);
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
            if (context.knownInstances !== {}) {
                // if knownInstances is not empty, build the input fields
                sortInstances(sortProperties(context.knownInstances, false));
                for (var key in context.knownInstances) {
                    let input = document.createElement("input");
                    input.setAttribute("type", "text");
                    input.setAttribute("id", key);
                    input.value = context.knownInstances[key];
                    var hidden = (context.instanceOptions[key]["hidden"] !== undefined ? context.instanceOptions[key]["hidden"] : false);
                    let label = document.createElement("label");
                    label.className = "instance-label";
                    label.setAttribute("for", input.id);
                    label.innerHTML = "<a class=\"no_underline button color-indicator\" data-instance=\"" + key + "\" title=\"pick a color\">&#9632;</a>" + key + 
                        " <span class='pull-right'>" +
                        "<label class='switch'  title=\"show or hide this instance\"><input type='checkbox' id=\"show#" + input.id + "\" " + (!hidden ? "checked" : "") + "><span class='slider round'></span></label>" +
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
    displayMessage("Forgetting about " + id + "...");
    delete context.knownInstances[id];
    document.getElementById("knownInstances").removeChild(evt.target.parentNode.parentNode); // remove the label element
    document.getElementById("knownInstances").removeChild(document.getElementById(id)); // remove the input element
};

/**
 * Saves the instances checked states
 */
const saveInstanceOptions = () => {
    try {
        context.storageArea.set({
            "instanceOptions": JSON.stringify(context.instanceOptions)
        }, () => {
            displayMessage("Options saved!");
            console.log("Saved instance options");
        });
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Please report this error with below details.", e);
    }
};

/**
 * Saves the options into storage
 * @param {object} evt the event that triggered the action
 */
const saveOptions = (evt) => {
    evt.preventDefault();
    try {
        // remove http:// and https:// from filter string
        const regex = /http[s]{0,1}:\/\//gm;
        const regex2 = /\/[^;]*/gm;
        context.urlFilters = document.getElementById("urlFilters").value.replace(regex, "").replace(regex2, "");
        context.autoFrame = document.getElementById("autoFrame").checked;
        context.useSync = document.getElementById("useSync").checked;
        document.getElementById("urlFilters").value = context.urlFilters;

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
            "urlFilters": context.urlFilters,
            "autoFrame": context.autoFrame
        }, () => {
            displayMessage("Options saved!");
        });
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
    evt.preventDefault();

    context.storageArea.get(["urlFilters", "knownInstances", "instanceOptions"], (result) => {
        // let string = encodeURIComponent(JSON.stringify(result));
        var blob = new Blob([JSON.stringify(result)], {type: "application/json;charset=utf-8"});
        try {
            chrome.downloads.download({
                filename: "snow-toolbelt-backup.json",
                saveAs: true,
                url: URL.createObjectURL(blob)
            });
        } catch (e) {
            displayMessage("Sorry, there was a browser error. Please report it with below details.", e);
            console.log(e);
        }
    });
};
/**
 * Imports the options into storage
 * @param {object} evt the event that triggered the action
 */
const importOptions = (evt) => {
    let file = evt.target.files[0];
    let reader = new FileReader();
    reader.onerror = (event) => {
        displayMessage("Sorry, there was an error importing your file. Please report it with below details.", JSON.stringify(event));
        reader.abort();
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
                    "urlFilters": obj.urlFilters,
                    "autoFrame": obj.autoFrame,
                }, () => {
                    displayMessage("Options restored from file");
                    restoreOptions();
                });
            }
        } catch (e) {
            console.log(e);
            displayMessage("Sorry, there was an error importing your file. Please report it with below details.", e);
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
        context.storageArea.getBytesInUse((bytes) => {
            console.log(bytes);
        });
        chrome.storage.local.set({
            "useSync" : context.useSync
        });
        restoreOptions();
    } catch(e) {
        console.error(e);
        displayMessage("There was an error accessing the desired storage area.", e);
        evt.target.checked = !context.useSync;
    }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.getElementById("useSync").addEventListener("change", toggleSync);
document.getElementById("export").addEventListener("click", exportOptions);
document.getElementById("import").addEventListener("click", openFileSelect);
document.getElementById("importFile").style.display = "none";
document.getElementById("importFile").addEventListener("change", importOptions);
