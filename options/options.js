const context = {
    knownInstances: {},
    instanceOptions: {},
    separator: ","
};

/**
 * Displays a message for a short time.
 * @param {String} txt Message to display.
 */
function displayMessage (txt) {
    document.getElementById("messages").innerHTML = txt;
    window.setTimeout(function () { document.getElementById("messages").innerHTML = "&nbsp;"; }, 3000);
}

/**
 * Opens the colorPicker popup
 * @param {object} evt the event that triggered the action
 */
function selectColor (evt) {
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
}

/**
 * Restores the options saved into local storage
 */
function restoreOptions () {
    document.getElementById("urlFilters").value = localStorage.urlFilters || "service-now.com;";
    document.getElementById("separator").value = localStorage.separator || ",";
    try {
        context.knownInstances = JSON.parse(localStorage.knownInstances);
    } catch (e) {
        context.knownInstances = {};
        console.log(e);
    }
    try {
        context.instanceOptions = JSON.parse(localStorage.instanceOptions);
    } catch (e) {
        context.instanceOptions = {};
        console(e);
    }
    if (context.knownInstances !== {}) {
        // if knownInstances is not empty, build the input fields
        for (var key in context.knownInstances) {
            let input = document.createElement("input");
            input.setAttribute("type", "text");
            input.setAttribute("id", key);
            input.value = context.knownInstances[key];
            var hidden = (context.instanceOptions[key]["hidden"] !== undefined ? context.instanceOptions[key]["hidden"] : false);
            let label = document.createElement("label");
            label.className = "instance-label";
            label.setAttribute("for", input.id);
            label.innerHTML = "<label class='switch'  title=\"show or hide this instance\"><input type='checkbox' id=\"show#" + input.id + "\" " + (!hidden ? "checked" : "") + "><span class='slider round'></span></label>" +
                "<a class=\"button\" data-instance=\"" + key + "\" title=\"pick a color\" id=\"color#" + input.id + "\">&#127912;</a>" +
                " Label for " + key +
                " <a class=\"button\" data-instance=\"" + key + "\" title=\"forget this instance\" id=\"del#" + input.id + "\">&#10799;</a>";

            document.getElementById("knownInstances").appendChild(label);
            document.getElementById("knownInstances").appendChild(input);
        }

        // add remove instance
        let elements = {};
        elements = document.querySelectorAll("a[title=\"forget this instance\"]");
        [].forEach.call(elements, function (el) {
            el.addEventListener("click", deleteInstance);
        });

        // add close tab actions
        elements = document.querySelectorAll("a[title=\"pick a color\"]");
        [].forEach.call(elements, function (el) {
            el.addEventListener("click", function (e) {
                context.clicked = e.target;
                selectColor(e);
            });
        });

        // Save and close button
        document.getElementById("popin_color").addEventListener("click", saveColor);
        document.getElementById("popin_no_color").addEventListener("click", saveNoColor);
    }
}

/**
 * Saves selected color
 * @param {object} evt the event that triggered the action
 */
function saveColor (evt) {
    let targetInstance = "";
    targetInstance = context.clicked.getAttribute("data-instance");
    document.getElementById("colorPicker").style.display = "none";
    if (context.instanceOptions[targetInstance] === undefined) {
        context.instanceOptions[targetInstance] = {};
    }
    context.instanceOptions[targetInstance]["color"] = document.getElementById("colorPickerColor").value;
    saveInstanceOptions();
}

/**
 * Saves no color for the instance
 * @param {object} evt the event that triggered the action
 */
function saveNoColor (evt) {
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
}

/**
 * Removes the the known instance from the local context.knownInstances object
 * @param {object} evt the event that triggered the action
 */
function deleteInstance (evt) {
    let id = evt.target.id.split("#")[1];
    displayMessage("Forgetting about " + id + "...");
    delete context.knownInstances[id];
    document.getElementById("knownInstances").removeChild(evt.target.parentNode); // remove the label element
    document.getElementById("knownInstances").removeChild(document.getElementById(id)); // remove the input element
}

/**
 * Saves the instances checked states
 */
function saveInstanceOptions () {
    if (typeof (Storage) !== "undefined") {
        localStorage.instanceOptions = JSON.stringify(context.instanceOptions);
    }
}

/**
 * Save the options into local storage
 * @param {object} evt the event that triggered the action
 */
function saveOptions (evt) {
    evt.preventDefault();
    try {
        localStorage.urlFilters = document.getElementById("urlFilters").value;
        localStorage.separator = document.getElementById("separator").value || ",";
        for (var key in context.knownInstances) {
            context.knownInstances[key] = document.getElementById(key).value;
            if (context.instanceOptions[key] === undefined) {
                context.instanceOptions[key] = {};
            }
            context.instanceOptions[key].hidden = !document.getElementById("show#" + key).checked;
        }
        localStorage.knownInstances = JSON.stringify(context.knownInstances);
        saveInstanceOptions();
        displayMessage("Options saved!");
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Is localStorage enabled?");
    }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
