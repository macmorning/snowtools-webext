const chromeURL = "https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln";
const mozURL = "https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/";
const gitURL = "https://github.com/macmorning/snowtools-webext";
const chromeShortcutsURL = "chrome://extensions/shortcuts";
const firefoxShortcutsURL = "about:addons";
let tips;
context.lastTipNumber = -1;
const whatsnew = [
    { 
        version: '4.3.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Background script popup: Added a 'back' button. Note that you can use the alt+left shortcut to do the same.</li>"+
            "<li>Background script popup: Added the CodeMirror editor to the script textarea.</li>"+
            "<li></li>"+
            "</ul>"+
            "<b>Note:</b> if you're a developer, you may want to try <a href='https://docs.servicenow.com/bundle/orlando-application-development/page/build/applications/task/vscode-background-script.html' target='_blank'>the official VSCode extension</a> that ServiceNow provides."
    },{ 
        version: '4.2.1',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Fixed: the incognito window indicator was only shown for the first instance in this window.</li>"+
            "<li>Removed: the show updateset Chrome-only feature had some annoying auth issues. Need to rethink it.</li>"+
            "<li>Open a background script window: via the <b>instance contextual menu</b> or with a <b>new shortcut</b>. Make sure you configure your shortcuts in " + (isChrome ? chromeShortcutsURL : firefoxShortcutsURL) + ".</li>"+
            "</ul>"
    },{ 
        version: '4.2.0',
        msg: "Most notable new features:<br/>" +
            "<ul><li>New shortcut: switch between technical names and labels in lists and forms (UI16). Make sure you configure your shortcuts in " + (isChrome ? chromeShortcutsURL : firefoxShortcutsURL) + "</li>"+
            "</ul>"
    },{ 
        version: '4.1.0',
        msg: "Most notable new features:<br/>" +
            "<ul><li>Dropped the 'all_urls' permission requirement.</li>" +
            "<li>You can now define shortcuts for two basic actions: open this browser popup and reopen in navpage frame.</li>" +
            "<li>Enhanced the 'tips' displayed when no instance tabs were found, you can now display more cool tips!</li></ul>" +
            "If you encounter any issue with this version, please do post them on <a href='" + gitURL + "'>github</a>."
    },{ 
        version: '4.0.0',
        msg: "Most notable new features:<br/>" +
            "<ul><li>this WhatsNew feature</li>" +
            "<li>storage sync feature activation</li></ul>" +
            "<b>important:</b> You now have to <b>explicitly</b> set the storage area for your settings. Make sure you enable \"use cloud storage\" in the options page if you want to use this feature. <br/>" +
            "Just to be safe, remember you can use the export button in the options page to save your settings into a JSON file. You can import it back later in case of a bug or an issue with sync storage, or to copy your settings accross browsers."
    }
];
let commandsTip = "";

const getWhatsNew = (whatsNewJSON) => {
    // whatsNewArr contains an array of keys for "whats new" messages previously marked as read
    let whatsNewArr = [];
    if (whatsNewJSON !== undefined) {
        try {
            whatsNewArr = JSON.parse(whatsNewJSON);
        } catch(e) {
            console.error(e);
        }
    }
    if (whatsNewArr === undefined) {
        whatsNewArr = [];
    }
    let whatsnewText = "";
    whatsnew.forEach((item) => {
        if (whatsNewArr.indexOf(item.version) === -1) {
            whatsnewText += "<h3>version " + item.version 
                + "</h3>" + item.msg;
        }
    });
    return whatsnewText;
}

/**
 * Stores the messages that were already displayed and acknowledged by the user
 */
const rememberWhatsNew = () => {
    location.hash = "";
    let whatsNewArr = [];
    whatsnew.forEach((item) => {
        whatsNewArr.push(item.version);
    });
    chrome.storage.local.set({
        'whatsnew': JSON.stringify(whatsNewArr)
    })
}

/**
 * Returns the list of commands
 */
const getCommands = () => {
    let result = 'The following commands are currently configured for your browser:<ul>';
    context.commands.forEach((command) => {
            result += '<li>' + (command.name === '_execute_browser_action' ? 'Open tools popup' : command.description) + ': <e>' + command.shortcut + '</e></li>';
    });
    result += "</ul>";
    result += "See " + (isChrome ? chromeShortcutsURL : firefoxShortcutsURL) + " for configuration";
    return result;
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
        "You can export your preferences and import them into " + (isChrome ? "Firefox" : "Chrome") + " from the options page.",
        "You can rate this extension <a href=\"" + (isChrome ? chromeURL : mozURL) + "\" target=\"_blank\">here</a>.",
        "This extension is also available on <a target=\"_blank\" href=\"" + (isChrome ? mozURL : chromeURL) + "\">" + (isChrome ? "Firefox" : "Chrome") + "</a>.",
        "When switching to a specific node, the extension will send requests to your instance until we are routed to this node or the maximum number of tries was reached. You can retry as many times as you want, though.",
        "You can post enhancement requests or defects on <a target=\"_blank\" href=\"https://github.com/macmorning/snowtools-webext/issues\">github</a>.",
        "This extension requires access to downloads to let you export your preferences, access to cookies for node switching, and access to all domains because your ServiceNow instances could be accessed through a custom domain.",
        "This extension doesn't collect or upload any data.",
        "You can post issues and enhancement requests on <a target=\"_blank\" href=\"" + gitURL + "\">github</a>.",
        "Does Chuck really draw power from his bow tie?",
        getCommands()
    ];

    let number;
    number = Math.floor((Math.random() * tips.length));

    context.lastTipNumber = number;
    document.getElementById("tip").innerHTML = tips[number];
    return true;
};