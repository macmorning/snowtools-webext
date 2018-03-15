const context = {
    knownInstances: {},
    instancesColors: {},
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
 * Rebuild the knownInstances from the object returned by sortProperties.
 * @param {Array} arr array of items in [[key,value],[key,value],...] format.
 */
function sortInstances (arr) {
    context.knownInstances = {};
    arr.forEach(function (item) {
        context.knownInstances[item[0]] = item[1];
    });
}

/**
 * Sort object properties (only own properties will be sorted).
 * https://gist.github.com/umidjons/9614157
 * @author umidjons
 * @param {object} obj object to sort properties
 * @param {bool} isNumericSort true - sort object properties as numeric value, false - sort as string value.
 * @returns {Array} array of items in [[key,value],[key,value],...] format.
 */
function sortProperties (obj, isNumericSort) {
    isNumericSort = isNumericSort || false; // by default text sort
    var sortable = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) { sortable.push([key, obj[key]]); }
    }
    if (isNumericSort) {
        sortable.sort(function (a, b) {
            return a[1] - b[1];
        });
    } else {
        sortable.sort(function (a, b) {
            let x = a[1].toLowerCase();
            let y = b[1].toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        });
    }
    return sortable; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
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
    if (context.knownInstances !== {}) {
        // if knownInstances is not empty, then sort it by label and build the input fields
        sortInstances(sortProperties(context.knownInstances, false));
        for (var key in context.knownInstances) {
            let input = document.createElement("input");
            input.setAttribute("type", "text");
            input.setAttribute("id", key);
            input.value = context.knownInstances[key];
            let label = document.createElement("label");
            label.setAttribute("for", input.id);
            label.innerHTML = "Label for " + key + " <a class=\"button-muted\" title=\"delete\" href=\"#\" id=\"del#" + input.id + "\">&#10799;</a>";
            label.onclick = deleteInstance;
            document.getElementById("knownInstances").appendChild(label);
            document.getElementById("knownInstances").appendChild(input);
        }
    }
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
        }
        sortInstances(sortProperties(context.knownInstances, false));
        localStorage.knownInstances = JSON.stringify(context.knownInstances);
        displayMessage("Options saved!");
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Is localStorage enabled?");
    }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
