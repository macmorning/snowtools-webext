const context = {
    knownInstances: {},
    instanceOptions: {},
    contentScriptEnabled: true
    // Note: useSync and storageArea removed — options page no longer reads/writes storage directly.
    // All settings I/O goes through the background service worker via chrome.runtime.sendMessage.
};
chrome.commands.getAll((result) => {
    context.commands = result;
});
/**
 * Toggles visibility of advanced features options
 * @param {boolean} enabled Whether advanced features are enabled
 * @param {boolean} autoToggle Whether to automatically toggle dependent options
 */
const toggleAdvancedFeaturesOptions = (enabled, autoToggle = false) => {
    const advancedOptions = document.getElementById("advancedFeaturesOptions");
    if (advancedOptions) {
        advancedOptions.style.opacity = enabled ? "1" : "0.5";
        advancedOptions.style.pointerEvents = enabled ? "auto" : "none";
    }

    // Auto-toggle dependent options when requested
    if (autoToggle) {
        const showUpdatesets = document.getElementById("showUpdatesets");
        const showInfoPanel = document.getElementById("showInfoPanel");

        if (enabled) {
            if (showUpdatesets && !showUpdatesets.checked) {
                showUpdatesets.checked = true;
                context.showUpdatesets = true;
                chrome.runtime.sendMessage({ command: "updateSettings", settings: { showUpdatesets: true } });
            }
            if (showInfoPanel && !showInfoPanel.checked) {
                showInfoPanel.checked = true;
                context.showInfoPanel = true;
                chrome.storage.local.set({ "showInfoPanel": true });
            }
        } else {
            if (showUpdatesets && showUpdatesets.checked) {
                showUpdatesets.checked = false;
                context.showUpdatesets = false;
                chrome.runtime.sendMessage({ command: "updateSettings", settings: { showUpdatesets: false } });
            }
            if (showInfoPanel && showInfoPanel.checked) {
                showInfoPanel.checked = false;
                context.showInfoPanel = false;
                chrome.storage.local.set({ "showInfoPanel": false });
            }
            const debugMode = document.getElementById("debugMode");
            if (debugMode && debugMode.checked) {
                debugMode.checked = false;
                context.debugMode = false;
                chrome.storage.local.set({ "debugMode": false });
            }
        }
    }
};

/**
 * Displays a message using a modern notification toast.
 * @param {String} txt Message to display.
 * @param {String} details Optional details to show in a modal if provided.
 */
const displayMessage = (txt, details) => {
    if (txt === undefined) { return false; }
    if (details === undefined) { details = ""; }

    // If there are details, show a modal for error messages
    if (details) {
        showDetailsModal(txt, details);
        return;
    }

    // Show a toast notification for simple messages
    showToastNotification(txt);
};

/**
 * Shows a toast notification with theme colors
 * @param {String} message The message to display
 */
const showToastNotification = (message) => {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.sntb-toast-notification');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = 'sntb-toast-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--btn-hover-color, #81B5A1);
            color: var(--main-bg-color, #F7F7F7);
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: 'Helvetica', sans-serif;
            font-size: 14px;
            max-width: 400px;
            border: 1px solid var(--muted-color, #81B5A1);
            transition: opacity 0.3s ease-out;
        ">
            ${message}
        </div>
    `;
    document.body.appendChild(notification);

    // Auto-remove after 4 seconds with fade out
    setTimeout(() => {
        if (notification.parentElement) {
            const notificationDiv = notification.firstElementChild;
            notificationDiv.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }
    }, 4000);
};

/**
 * Shows a modal for error messages with details
 * @param {String} message The main error message
 * @param {String} details The error details
 */
const showDetailsModal = (message, details) => {
    const modal = document.createElement('div');
    modal.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div style="
                background: var(--main-bg-color, #F7F7F7);
                color: var(--main-color, #293E40);
                padding: 20px;
                border-radius: 8px;
                max-width: 80%;
                max-height: 80%;
                overflow: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                font-family: 'Helvetica', sans-serif;
                border: 1px solid var(--muted-color, #81B5A1);
            ">
                <h3 style="margin-top: 0; color: var(--highlight, #d66419);">⚠️ Error</h3>
                <p>${message}</p>
                <textarea readonly style="
                    width: 100%;
                    height: 150px;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    border: 1px solid var(--disabled-color, #cecece);
                    padding: 10px;
                    resize: vertical;
                    background: var(--alt-bg-color, #e7e7e7);
                    color: var(--main-color, #293E40);
                    margin-top: 10px;
                " onclick="this.select()">${details}</textarea>
                <div style="margin-top: 15px; text-align: right;">
                    <button onclick="this.closest('div[style*=\"position: fixed\"]').remove()" style="
                        background: var(--highlight, #d66419);
                        color: var(--main-bg-color, #F7F7F7);
                        border: none;
                        padding: 10px 20px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: background-color 0.2s ease;
                    " onmouseover="this.style.background='var(--btn-hover-color, #81B5A1)'" onmouseout="this.style.background='var(--highlight, #d66419)'">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
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
                // Sanitize domain to prevent XSS
                const safeDomain = escapeHtml(domain);
                let templateInstance = document.getElementById("domainRow");
                let domainRow = templateInstance.innerHTML.toString().replace(/\{\{domainid\}\}/g, safeDomain).replace(/\{\{title\}\}/g, safeDomain);
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
 * Restores the options from the background service worker.
 * Background is the sole reader/writer of storage — options page never accesses storage directly.
 */
const restoreOptions = () => {
    // Clear the instances list first
    let instancesDiv = document.getElementById("knownInstancesList");
    while (instancesDiv.firstChild) {
        instancesDiv.removeChild(instancesDiv.firstChild);
    }

    // Load always-local settings (debugMode, showInfoPanel) in parallel with background settings
    chrome.storage.local.get(["debugMode", "showInfoPanel", "showViewportBorder", "trackRecentTabs", "maxRecentTabs", "removeAfterReopen", "groupRecentByInstance"], (localResult) => {
        const debugMode = localResult.debugMode === true;
        document.getElementById("debugMode").checked = debugMode;
        context.debugMode = debugMode;

        const showInfoPanel = localResult.showInfoPanel !== false; // Default to true
        document.getElementById("showInfoPanel").checked = showInfoPanel;
        context.showInfoPanel = showInfoPanel;

        const showViewportBorder = localResult.showViewportBorder !== false; // Default to true
        document.getElementById("showViewportBorder").checked = showViewportBorder;
    });

    // Load all other settings from background.
    // Retry once after a short delay if the service worker isn't ready yet.
    const loadFromBackground = (retryCount = 0) => {
        chrome.runtime.sendMessage({ command: "getSettings" }, (response) => {
            if (chrome.runtime.lastError) {
                if (retryCount < 2) {
                    console.log("*SNOW TOOL BELT* Background not ready, retrying in 500ms...");
                    setTimeout(() => loadFromBackground(retryCount + 1), 500);
                } else {
                    console.error("*SNOW TOOL BELT* Error getting settings from background:", chrome.runtime.lastError);
                    displayMessage("Could not load settings. Please try reloading the page.");
                }
                return;
            }

            context.knownInstances = response.knownInstances || {};
            context.instanceOptions = response.instanceOptions || {};
        context.urlFilters = response.urlFilters || "service-now.com;";
        context.extraDomains = response.extraDomains || false;
        context.showUpdatesets = (response.showUpdatesets !== false);
        context.contentScriptEnabled = (response.contentScriptEnabled !== false);
        context.maxSearchResults = response.maxSearchResults || 20;

        // Populate UI
        document.getElementById("useSync").checked = response.useSync || false;
        document.getElementById("extraDomains").checked = context.extraDomains;
        document.getElementById("showUpdatesets").checked = context.showUpdatesets;
        document.getElementById("contentScriptEnabled").checked = context.contentScriptEnabled;
        document.getElementById("maxSearchResults").value = context.maxSearchResults;

        toggleAdvancedFeaturesOptions(context.contentScriptEnabled);
        rebuildDomainsList();

        if (Object.keys(context.knownInstances).length !== 0) {
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
                var hidden = (context.instanceOptions[key] && context.instanceOptions[key]["hidden"] !== undefined ? context.instanceOptions[key]["hidden"] : false);
                let label = document.createElement("label");
                label.className = "instance-label";
                label.setAttribute("for", input.id);
                const safeKey = escapeHtml(key);
                label.innerHTML = "<a class=\"no_underline button color-indicator\" data-instance=\"" + safeKey + "\" title=\"pick a color\">&#9632;</a>" + safeKey +
                    " <span class='pull-right'>" +
                    "<label class='switch' title=\"show or hide this instance\"><input name='showOrHide' type='checkbox' id=\"show#" + input.id + "\" " + (!hidden ? "checked" : "") + "><span class='slider round'></span></label>" +
                    " <a class=\"no_underline button\" data-instance=\"" + safeKey + "\" title=\"forget this instance\" id=\"del#" + input.id + "\">&#10799;</a></span>";

                instancesDiv.appendChild(label);
                instancesDiv.appendChild(input);
            }

            let elements = document.querySelectorAll("a[title=\"forget this instance\"]");
            [].forEach.call(elements, (el) => { el.addEventListener("click", deleteInstance); });

            elements = document.querySelectorAll("input[name=\"showOrHide\"]");
            [].forEach.call(elements, (el) => { el.addEventListener("change", saveOptions); });

            elements = document.querySelectorAll("input[name=\"instanceLabel\"]");
            [].forEach.call(elements, (el) => { el.addEventListener("change", saveOptions); });

            elements = document.querySelectorAll("a[title=\"pick a color\"]");
            [].forEach.call(elements, (el) => {
                let instance = el.getAttribute("data-instance");
                let color = (instance && context.instanceOptions[instance] && context.instanceOptions[instance]["color"]) ? context.instanceOptions[instance]["color"] : "";
                el.style.backgroundColor = color || "black";
                el.addEventListener("click", (e) => {
                    context.clicked = e.target;
                    selectColor(e);
                });
            });

            document.getElementById("popin_color").addEventListener("click", saveColor);
            document.getElementById("popin_no_color").addEventListener("click", saveNoColor);

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
    };
    loadFromBackground();
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

// sortProperties is now in shared/utils.js

/**
 * Saves selected color via background API
 * @param {object} evt the event that triggered the action
 */
const saveColor = (evt) => {
    const targetInstance = context.clicked.getAttribute("data-instance");
    const color = document.getElementById("colorPickerColor").value;
    context.clicked.style.backgroundColor = color;
    location.hash = "";
    if (!context.instanceOptions[targetInstance]) context.instanceOptions[targetInstance] = {};
    context.instanceOptions[targetInstance]["color"] = color;
    chrome.runtime.sendMessage({
        command: "updateInstanceOption",
        instance: targetInstance,
        key: "color",
        value: color
    }, (response) => {
        if (chrome.runtime.lastError) console.error("*SNOW TOOL BELT* Error saving color:", chrome.runtime.lastError);
    });
};

/**
 * Saves no color for the instance via background API
 * @param {object} evt the event that triggered the action
 */
const saveNoColor = (evt) => {
    const targetInstance = context.clicked.getAttribute("data-instance");
    context.clicked.style.backgroundColor = "#000000";
    location.hash = "";
    if (!context.instanceOptions[targetInstance]) context.instanceOptions[targetInstance] = {};
    try { delete context.instanceOptions[targetInstance]["color"]; } catch (e) { console.log(e); }
    chrome.runtime.sendMessage({
        command: "updateInstanceOption",
        instance: targetInstance,
        key: "color",
        value: null  // null = delete the key in background handler
    }, (response) => {
        if (chrome.runtime.lastError) console.error("*SNOW TOOL BELT* Error removing color:", chrome.runtime.lastError);
    });
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
 * Saves the domain filters via background API
 */
const saveFilters = () => {
    chrome.runtime.sendMessage({
        command: "updateSettings",
        settings: { urlFilters: context.urlFilters }
    }, (response) => {
        if (chrome.runtime.lastError) console.error("*SNOW TOOL BELT* Error saving urlFilters:", chrome.runtime.lastError);
    });
};

/**
 * Saves the instance options via background API
 */
const saveInstanceOptions = () => {
    chrome.runtime.sendMessage({
        command: "updateSettings",
        settings: { instanceOptions: context.instanceOptions }
    }, (response) => {
        if (chrome.runtime.lastError) console.error("*SNOW TOOL BELT* Error saving instanceOptions:", chrome.runtime.lastError);
    });
};

async function register(hosts, code) {
    return await chrome.contentScripts.register({
        matches: [hosts],
        js: [{ code }],
        runAt: "document_idle"
    });
}

/**
 * Saves the options via background API
 * @param {object} evt the event that triggered the action
 */
const saveOptions = (evt) => {
    evt.preventDefault();
    try {
        if (evt.target.id === "showUpdatesets") {
            context.showUpdatesets = evt.target.checked;
            chrome.runtime.sendMessage({ command: "updateSettings", settings: { showUpdatesets: context.showUpdatesets } });

        } else if (evt.target.id === "debugMode") {
            // debugMode is always local — not routed through background
            context.debugMode = evt.target.checked;
            chrome.storage.local.set({ "debugMode": context.debugMode });

        } else if (evt.target.id === "showInfoPanel") {
            // showInfoPanel is always local — not routed through background
            context.showInfoPanel = evt.target.checked;
            chrome.storage.local.set({ "showInfoPanel": context.showInfoPanel });

        } else if (evt.target.id === "showViewportBorder") {
            // showViewportBorder is always local
            chrome.storage.local.set({ "showViewportBorder": evt.target.checked });

        } else if (evt.target.id === "contentScriptEnabled") {
            context.contentScriptEnabled = evt.target.checked;
            toggleAdvancedFeaturesOptions(context.contentScriptEnabled, true);
            chrome.runtime.sendMessage({
                command: "updateSettings",
                settings: { contentScriptEnabled: context.contentScriptEnabled }
            }, () => {
                // Also notify background to register/unregister content scripts
                chrome.runtime.sendMessage({
                    command: "updateContentScriptRegistration",
                    enabled: context.contentScriptEnabled
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("*SNOW TOOL BELT* Error notifying background:", chrome.runtime.lastError);
                    }
                });
            });

        } else if (evt.target.id === "maxSearchResults") {
            const value = parseInt(evt.target.value);
            if (value >= 5 && value <= 100) {
                context.maxSearchResults = value;
                chrome.runtime.sendMessage({ command: "updateSettings", settings: { maxSearchResults: context.maxSearchResults } });
            } else {
                evt.target.value = context.maxSearchResults || 20;
                displayMessage("Maximum search results must be between 5 and 100.");
            }

        } else if (evt.target.id === "extraDomains") {
            context.extraDomains = evt.target.checked;
            if (context.extraDomains) {
                chrome.permissions.request({ origins: ["https://*/*"] }, granted => {
                    if (granted) {
                        chrome.runtime.sendMessage({ command: "updateSettings", settings: { extraDomains: context.extraDomains } }, () => {
                            rebuildDomainsList();
                        });
                    } else {
                        evt.target.checked = false;
                        context.extraDomains = false;
                        rebuildDomainsList();
                        displayMessage("Your permission is required to use the extension outside of service-now.com domains.");
                    }
                });
            } else {
                chrome.permissions.remove({ origins: ["https://*/*"] });
                chrome.runtime.sendMessage({ command: "updateSettings", settings: { extraDomains: context.extraDomains } }, () => {
                    rebuildDomainsList();
                });
            }

        } else {
            // Instance label or visibility change — collect all and save
            for (var key in context.knownInstances) {
                context.knownInstances[key] = document.getElementById(key).value;
                if (!context.instanceOptions[key]) context.instanceOptions[key] = {};
                context.instanceOptions[key].hidden = !document.getElementById("show#" + key).checked;
            }
            chrome.runtime.sendMessage({
                command: "updateSettings",
                settings: {
                    knownInstances: context.knownInstances,
                    instanceOptions: context.instanceOptions
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("*SNOW TOOL BELT* Error saving options:", chrome.runtime.lastError);
                } else {
                    console.log("*SNOW TOOL BELT* Options saved via background API");
                }
            });
        }
    } catch (e) {
        console.log(e);
        displayMessage("Options could not be saved. Please report this error with below details.", e);
    }
};
/**
 * Exports the options via background API
 * @param {object} evt the event that triggered the action
 */
const exportOptions = (evt) => {
    chrome.permissions.request({ permissions: ['downloads'] }, (granted) => {
        if (granted) {
            chrome.runtime.sendMessage({ command: "getSettings" }, (response) => {
                if (chrome.runtime.lastError) {
                    displayMessage("Could not export settings.", chrome.runtime.lastError.message);
                    return;
                }
                // Build export object matching the original format
                const exportObj = {
                    knownInstances: JSON.stringify(response.knownInstances || {}),
                    instanceOptions: JSON.stringify(response.instanceOptions || {}),
                    urlFilters: response.urlFilters || "service-now.com;",
                    extraDomains: response.extraDomains || false,
                    showUpdatesets: response.showUpdatesets !== false,
                    maxSearchResults: response.maxSearchResults || 20,
                    contentScriptEnabled: response.contentScriptEnabled !== false
                };
                var blob = new Blob([JSON.stringify(exportObj)], { type: "application/json;charset=utf-8" });
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
 * Imports the options via background API
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
                // Verify JSON integrity
                const knownInstances = JSON.parse(obj.knownInstances);
                const instanceOptions = JSON.parse(obj.instanceOptions);

                chrome.runtime.sendMessage({
                    command: "updateSettings",
                    settings: {
                        knownInstances: knownInstances,
                        instanceOptions: instanceOptions,
                        extraDomains: false, // always reset to avoid permission issues
                        urlFilters: obj.urlFilters,
                        showUpdatesets: obj.showUpdatesets,
                        maxSearchResults: obj.maxSearchResults || 20,
                        contentScriptEnabled: obj.contentScriptEnabled !== undefined ? obj.contentScriptEnabled : true
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        displayMessage("Sorry, there was an error importing your file.", chrome.runtime.lastError.message);
                    } else {
                        displayMessage("Options restored from file");
                        restoreOptions();
                    }
                });
            }
        } catch (e) {
            console.log(e);
            displayMessage("Sorry, there was an error importing your file. Please report the details below.", e);
        } finally {
            evt.target.value = "";
        }
    };
    reader.readAsText(file);
};

/**
 * Triggered when user changes the "useSync" toggle
 * @param {Event} evt the event that triggered the action
 */
const toggleSync = (evt) => {
    const newUseSync = evt.target.checked;
    chrome.runtime.sendMessage({ command: "setUseSync", useSync: newUseSync }, (response) => {
        if (chrome.runtime.lastError || (response && !response.success)) {
            console.error("*SNOW TOOL BELT* Error setting useSync:", chrome.runtime.lastError || response.error);
            displayMessage("There was an error switching sync mode.");
            evt.target.checked = !newUseSync;
            return;
        }
        displayMessage(newUseSync 
            ? "Sync enabled. Your settings will be mirrored to cloud storage." 
            : "Sync disabled. Settings are stored locally only.");
    });
};

/**
 * Opens the file selection window
 * @param {Event} evt the event that triggered the action
 */
const openFileSelect = (evt) => {
    document.getElementById("importFile").click();
};

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.getElementById("useSync").addEventListener("change", toggleSync);

document.getElementById("extraDomains").addEventListener("change", saveOptions);
document.getElementById("showUpdatesets").addEventListener("change", saveOptions);
document.getElementById("contentScriptEnabled").addEventListener("change", saveOptions);

document.getElementById("debugMode").addEventListener("change", saveOptions);
document.getElementById("showInfoPanel").addEventListener("change", saveOptions);
document.getElementById("showViewportBorder").addEventListener("change", saveOptions);
document.getElementById("maxSearchResults").addEventListener("change", saveOptions);
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
