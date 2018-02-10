function saveOptions (e) {
    e.preventDefault();
    try {
        localStorage.urlFilters = document.getElementById("urlFilters").value;
        document.getElementById("messages").innerHTML = "Options saved!";
    } catch (e) {
        document.getElementById("messages").innerHTML = "Options were not saved. Is localStorage enabled?";
    }
    window.setTimeout(function () { document.getElementById("messages").innerHTML = "&nbsp;"; }, 2000);
}

function restoreOptions () {
    document.getElementById("urlFilters").value = localStorage.urlFilters || "service-now.com;";
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
