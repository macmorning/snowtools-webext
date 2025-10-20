const chromeURL = "https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln";
const mozURL = "https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/";
const gitURL = "https://github.com/macmorning/snowtools-webext";


// Ensure browser detection is available (fallback if not defined in snowbelt.js)
if (typeof isChromium === 'undefined') {
    window.isChromium = (typeof browser === "undefined");
}

const shortcutsURL = (isChromium ? "chrome://extensions/shortcuts" : "about:addons");

/**
 * Opens the shortcuts configuration page for the current browser
 */
const openShortcutsPage = () => {
    if (isChromium) {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    } else {
        // Firefox: Open add-ons manager where users can manage extension shortcuts
        chrome.tabs.create({ url: "about:addons" });
    }
};

let tips;
context.lastTipNumber = -1;
context.currentVersion = "7.0.0";
try {
    document.getElementById("help").title = "current version: " + context.currentVersion;
} catch (e) {
    // ignore errors here;
}

let commandsTip = "";



/**
 * Returns the list of commands
 */
const getCommands = () => {
    if (context && context.commands) {
        let result = 'The following commands are currently <a href="#" id="shortcutsLink">configured for your browser</a>:<ul>';
        context.commands.forEach((command) => {
            result += '<li>' + (command.name === '_execute_action' ? 'Open tools popup' : command.description) + ': <b>' + command.shortcut + '</b></li>';
        });
        result += "</ul>";
        return result;
    }
}

const nextTip = () => {
    let number;
    number = context.lastTipNumber + 1;
    if (number >= tips.length) { number = 0; }
    context.lastTipNumber = number;
    document.getElementById("tip").classList.add("fade");
    window.setTimeout(() => {
        document.getElementById("tip").innerHTML = tips[number];
        document.getElementById("tip").classList.remove("fade");
        document.getElementById("tipsContainer").classList.remove("fade");
    }, 300);
    return true;
}
const getTip = () => {
    tips = [
        "Lost your settings?<br/>Go to the options pages and make sure you are using the storage area where you saved them.",
        "You can hide automatically saved serice-now.com sub-domains such as \"partnerportal\", \"hi\" or \"signon\" by toggling their visibility in the options page.",
        "You can export your preferences and import them into " + (isChromium ? "Firefox" : "Chrome") + " from the options page.",
        "You can rate this extension <a href=\"" + (isChromium ? chromeURL : mozURL) + "\" target=\"_blank\">here</a>.",
        "This extension is also available on <a target=\"_blank\" href=\"" + (isChromium ? mozURL : chromeURL) + "\">" + (isChromium ? "Firefox" : "Chrome") + "</a>.",
        "When switching to a specific node, the extension will send requests to your instance until we are routed to this node or the maximum number of tries was reached. You can retry as many times as you want, though.",
        "You can post enhancement requests or defects on <a target=\"_blank\" href=\"https://github.com/macmorning/snowtools-webext/issues\">github</a>.",
        "This extension requires access to downloads to let you export your preferences, access to cookies for node switching, and access to all domains because your ServiceNow instances could be accessed through a custom domain.",
        "This extension doesn't collect or upload any data.",
        "You can post issues and enhancement requests on <a target=\"_blank\" href=\"" + gitURL + "\">github</a>.",
        "Does Chuck really draw power from his bow tie?",
        "You can unhide hidden instances from the options page.",
        "If you want to see the tabs open in private windows, you have to allow the extension to run in private mode.",
        getCommands()
    ];

    let number;
    number = Math.floor((Math.random() * tips.length));

    context.lastTipNumber = number;
    document.getElementById("tip").innerHTML = tips[number];
    return true;
};

// If there is a "shortcuts" element, like on the options page, add the shortcuts list
if (document.querySelector("span#shortcuts")) {
    chrome.commands.getAll((result) => {
        context.commands = result;
        document.querySelector("span#shortcuts").insertAdjacentHTML("afterend", getCommands());
    });
}

// Add event listener for shortcuts links (using event delegation for dynamic content)
document.addEventListener('click', function(e) {
    if (e.target.id === 'shortcutsLink' || e.target.classList.contains('shortcuts-config-link')) {
        e.preventDefault();
        openShortcutsPage();
    }
});