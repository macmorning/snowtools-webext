const chromeURL = "https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln";
const mozURL = "https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/";
const gitURL = "https://github.com/macmorning/snowtools-webext";
const whatsnew = [
    { 
        version: '4.0.0',
        msg: "Most notable new features:<br/>" +
            "<ul><li>this WhatsNew feature</li>" +
            "<li>storage sync feature activation</li></ul>" +
            "<b>important:</b> You now have to <b>explicitly</b> set the storage area for your settings. Make sure you enable \"use cloud storage\" in the options page if you want to use this feature. <br/>" +
            "Just to be safe, remember you can use the export button in the options page to save your settings into a JSON file. You can import it back later in case of a bug or an issue with sync storage, or to copy your settings accross browsers."
    }
];
const tips = [
    "Lost your settings? Go to the options pages and make sure you are using the storage area where you saved them.",
    "You can now enable autoframing for platform pages in the options page.",
    "You can hide automatically saved serice-now.com sub-domains such as \"partnerportal\", \"hi\" or \"signon\" by toggling their visibility in the options page.",
    "You can export your preferences and import them into " + (isChrome ? "Firefox" : "Chrome") + " from the options page.",
    "You can rate this extension <a href=\"" + (isChrome ? chromeURL : mozURL) + "\" target=\"_blank\">here</a>.",
    "This extension is also available on <a target=\"_blank\" href=\"" + (isChrome ? mozURL : chromeURL) + "\">" + (isChrome ? "Firefox" : "Chrome") + "</a>.",
    "If you can't switch to a specific node of an instance, it may be because it is an admin/backoffice/backup node that is not available to users via this URL.",
    "Nodes are retrieved from the xmlstats.do processor. The time it takes to fetch and parse the data depends on its size.",
    "When switching to a specific node, the extension will send requests to your instance until we are routed to this node or the maximum number of tries was reached. You can retry as many times as you want, though.",
    "You can post enhancement requests or defects on <a target=\"_blank\" href=\"https://github.com/macmorning/snowtools-webext/issues\">github</a>.",
    "Default shortcut to open this dialog is Alt+C but you can set your own shortcut in you browser preferences.",
    "This extension requires access to downloads to let you export your preferences, access to cookies for node switching, and access to all domains because your ServiceNow instances could be accessed through a custom domain.",
    "This extension doesn't collect or upload any data.",
    "Does Chuck really draw power from his bow tie?",
    "You can post issues and enhancement requests on <a target=\"_blank\" href=\"" + gitURL + "\">github</a>."
];

const getTip = () => {
    let number = Math.floor((Math.random() * tips.length));
    return tips[number];
};

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