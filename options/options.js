const context = {
    knownInstances: {},
    instanceOptions: {}
};

/**
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 */
const displayMessage = (txt) => {
    document.getElementById("messages").innerHTML = txt;
    window.setTimeout(() => { document.getElementById("messages").innerHTML = "&nbsp;"; }, 3000);
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
    document.getElementById("colorPicker").style.display = "block";
};

/**
 * Restores the options saved into local storage
 */
const restoreOptions = () => {
    // clearOptions first
    let instancesDiv = document.getElementById("knownInstances");
    while (instancesDiv.firstChild) {
        instancesDiv.removeChild(instancesDiv.firstChild);
    };
    // load options from sync storage area
    chrome.storage.sync.get(["urlFilters", "knownInstances", "instanceOptions"], (result) => {
        document.getElementById("urlFilters").value = result.urlFilters || "service-now.com;";
        try {
            context.knownInstances = JSON.parse(result.knownInstances);
        } catch (e) {
            context.knownInstances = {};
            console.log(e);
        }
        try {
            context.instanceOptions = JSON.parse(result.instanceOptions);
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
                label.innerHTML = key + " <span class='pull-right'><label class='switch'  title=\"show or hide this instance\"><input type='checkbox' id=\"show#" + input.id + "\" " + (!hidden ? "checked" : "") + "><span class='slider round'></span></label>" +
                    "<a class=\"button\" data-instance=\"" + key + "\" title=\"pick a color\" id=\"color#" + input.id + "\">&#127912;</a>" +
                    " <a class=\"button\" data-instance=\"" + key + "\" title=\"forget this instance\" id=\"del#" + input.id + "\">&#10799;</a></span>";

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
    document.getElementById("colorPicker").style.display = "none";
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
    document.getElementById("colorPicker").style.display = "none";
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
    chrome.storage.sync.set({
        "instanceOptions": JSON.stringify(context.instanceOptions)
    }, () => {
        console.log("Saved instance options to storage.sync");
    });
};

/**
 * Saves the options into sync storage
 * @param {object} evt the event that triggered the action
 */
const saveOptions = (evt) => {
    evt.preventDefault();
    try {
        context.urlFilters = document.getElementById("urlFilters").value;
        for (var key in context.knownInstances) {
            context.knownInstances[key] = document.getElementById(key).value;
            if (context.instanceOptions[key] === undefined) {
                context.instanceOptions[key] = {};
            }
            context.instanceOptions[key].hidden = !document.getElementById("show#" + key).checked;
        }
        ;

        chrome.storage.sync.set({
            "knownInstances": JSON.stringify(context.knownInstances),
            "instanceOptions": JSON.stringify(context.instanceOptions),
            "urlFilters": context.urlFilters
        }, () => {
            displayMessage("Options saved!");
        });
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Is storage enabled?");
    }
};
/**
 * Exports the options into sync storage
 * @param {object} evt the event that triggered the action
 */
const exportOptions = (evt) => {
    evt.preventDefault();
    chrome.storage.sync.get(["urlFilters", "knownInstances", "instanceOptions"], (result) => {
        // let string = encodeURIComponent(JSON.stringify(result));
        var blob = new Blob([JSON.stringify(result)], {type: "application/json;charset=utf-8"});
        try {
            chrome.downloads.download({
                filename: "snow-toolbelt-backup.json",
                saveAs: true,
                url: URL.createObjectURL(blob)
            });
        } catch (e) {
            console.log(e);
        }
    });
};
/**
 * Imports the options into sync storage
 * @param {object} evt the event that triggered the action
 */
const importOptions = (evt) => {
    let file = evt.target.files[0];
    let reader = new FileReader();
    reader.onerror = (event) => {
        reader.abort();
        displayMessage("Sorry, there was an error importing your file.");
    };
    reader.onload = (event) => {
        try {
            let obj = JSON.parse(event.target.result);
            if (obj.knownInstances !== undefined) {
                // verify json integrity
                JSON.parse(obj.knownInstances);
                JSON.parse(obj.instanceOptions);

                chrome.storage.sync.set({
                    "knownInstances": obj.knownInstances,
                    "instanceOptions": obj.instanceOptions,
                    "urlFilters": obj.urlFilters
                }, () => {
                    displayMessage("Options restored from file");
                    restoreOptions();
                });
            }
        } catch (ex) {
            console.log(ex);
            displayMessage("Sorry, there was an error importing your file.");
        }
    };
    reader.readAsText(file);
};
/**
 * Opens the file selection window
 * @param {object} evt the event that triggered the action
 */
const openFileSelect = (evt) => {
    document.getElementById("importFile").click();
};

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.getElementById("export").addEventListener("click", exportOptions);
document.getElementById("import").addEventListener("click", openFileSelect);
document.getElementById("importFile").style.display = "none";
document.getElementById("importFile").addEventListener("change", importOptions);
