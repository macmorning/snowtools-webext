const chromeURL = "https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln";
const mozURL = "https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/";
const gitURL = "https://github.com/macmorning/snowtools-webext";


const shortcutsURL = (isChromium ? "chrome://extensions/shortcuts" : "about:addons");

let tips;
context.lastTipNumber = -1;
context.currentVersion = "6.1.0";
document.getElementById("help").title = "current version: " + context.currentVersion;

const whatsnew = [
    { 
<<<<<<< HEAD
        version: '6.1.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Corrected a few issues following the manifest version upgrade.</li>"+
            "</ul>"
    },{ 
        version: '6.0.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Upgraded manifest to v3. Not a big change from a user point of view but it was such a pain I thought it deserved its own major release.</li>"+
            "<li>Not much more, to be honest. Please create issues on github if you see the extension misbehaving.</li>"+
            "<li>If you are using extra-service-now.com domains, you may have to re-enable the option, so the extension requests the new, renamed authorization to access all urls.</li>"+
            "</ul>"
    },{ 
=======
>>>>>>> d8f595514a28ad6bec65b0b88a3afd6414279e02
        version: '5.1.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Finally made some updates required by the recent ServiceNow UI changes.</li>"+
            "<li>Updated the documentation search link.</li>"+
            "</ul>"
    },{ 
        version: '5.0.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Removed the broadest default permissions for the extension.</li>"+
            "</ul>"+
            "<b>important:</b> You now have to <b>explicitly</b> allow the extension to be used outside of the service-now.com domain. \"Enable extra domains for content script\" in the options page if you want to use this feature. <br/>" +
            "Just to be safe, remember you can use the export button in the options page to save your settings into a JSON file. You can import it back later in case of a bug or an issue with sync storage, or to copy your settings accross browsers."
    },{ 
        version: '4.7.1',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>The previous background scripts are now selectable from a list.</li>"+
            "<li>Make sure you configure your shortcuts in " + shortcutsURL + ".</li>"+
            "</ul>"
    },{ 
        version: '4.7.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Enhanced the background script popup window with an execution history!</li>"+
            "<li>Make sure you configure your shortcuts in " + shortcutsURL + ".</li>"+
            "</ul>"
    },{ 
        version: '4.6.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Removed a few console logs from the content script.</li>"+
            "<li>Updated the URL for dev portal search to use the latest release by default.</li>"+
            "<li>Updated the options page, removed the 'save' button and the annoying confirmation messages.</li>"+
            "</ul>"
    },{ 
        version: '4.5.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>Changed the layout of the instance list a little.</li>"+
            "<li>In the 'open on instance' popup, the instances that are currently open in a tab are more visible.</li>"+
            "<li>See versions of current object: <b>new shortcut</b>. Make sure you configure your shortcuts in " + shortcutsURL + ".</li>"+
            "</ul>"
    },{ 
        version: '4.4.0',
        msg: "Most notable changes:<br/>" +
            "<ul>"+
            "<li>The extension is now available for the new Edge browser (Chromium). Remember you can export your settings in a json file and import them into another browser.</li>"+
            "<li>Options page is a little more useable. It opens in a tab and the instance list has a filter field.</li>"+
            "<li>Added a <i>hide</i> contextual action in instances menus.</li>"+
            "<li>Removed some useless refreshes on Firefox.</li>"+
            "</ul>"
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
    if (context && context.commands) {
        let result = 'The following commands are currently configured for your browser:<ul>';
        context.commands.forEach((command) => {
                result += '<li>' + (command.name === '_execute_browser_action' ? 'Open tools popup' : command.description) + ': <b>' + command.shortcut + '</b></li>';
        });
        result += "</ul>";
        result += "See " + shortcutsURL + " for configuration";
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