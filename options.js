const context = {
    knownInstances: {}
};

function deleteInstance (evt) {
    let id = evt.target.id.split("#")[1];
    delete context.knownInstances[id];
    document.getElementById("knownInstances").removeChild(event.toElement.parentNode); // remove the label element
    document.getElementById("knownInstances").removeChild(document.getElementById(id)); // remove the input element
}
function saveOptions (e) {
    e.preventDefault();
    try {
        localStorage.urlFilters = document.getElementById("urlFilters").value;
        for (var key in context.knownInstances) {
            context.knownInstances[key] = document.getElementById(key).value;
        }
        localStorage.knownInstances = JSON.stringify(context.knownInstances);
        document.getElementById("messages").innerHTML = "Options saved!";
    } catch (e) {
        console.log(e);
        document.getElementById("messages").innerHTML = "Options were not saved. Is localStorage enabled?";
    }
    window.setTimeout(function () { document.getElementById("messages").innerHTML = "&nbsp;"; }, 2000);
}

function restoreOptions () {
    document.getElementById("urlFilters").value = localStorage.urlFilters || "service-now.com;";
    try {
        context.knownInstances = JSON.parse(localStorage.knownInstances);
    } catch (e) {
        context.knownInstances = {};
        console.log(e);
    }
    for (var key in context.knownInstances) {
        let input = document.createElement("input");
        input.setAttribute("type", "text");
        input.setAttribute("id", key);
        input.value = context.knownInstances[key];
        let label = document.createElement("label");
        label.setAttribute("for", input.id);
        label.innerHTML = "Label for " + key + " <a class=\"deleteBtn\" title=\"delete\" href=\"#\" id=\"del#" + input.id + "\">X</a>";
        label.onclick = deleteInstance;
        document.getElementById("knownInstances").appendChild(label);
        document.getElementById("knownInstances").appendChild(input);
    }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
