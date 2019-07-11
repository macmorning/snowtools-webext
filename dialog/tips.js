const chromeURL = "https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln";
const mozURL = "https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/";

const tips = [
    "You can now enable autoframing for platform pages in the options page.",
    "You can hide automatically saved serice-now.com sub-domains such as \"partnerportal\", \"hi\" or \"signon\" by toggling their visibility in the options page.",
    "You can export your preferences and import them into " + (isChrome ? "Firefox" : "Chrome") + " from the options page.",
    "You can rate this extension <a href=\"" + (isChrome ? chromeURL : mozURL) + "\" target=\"_blank\">here</a>.",
    "This extension is also available on <a target=\"_blank\" href=\"" + (isChrome ? mozURL : chromeURL) + "\">" + (isChrome ? "Firefox" : "Chrome") + "</a>.",
    "If you can't switch to a specific node of an instance, it may be because it is an admin/backoffice/backup node that is not available to users via this URL.",
    "When switching to a specific node, the extension will send requests to your instance until we are routed to this node or the maximum number of tries was reached. You can retry as many times as you want, though.",
    "You can post enhancement requests or defects on <a target=\"_blank\" href=\"https://github.com/macmorning/snowtools-webext/issues\">github</a>.",
    "Default shortcut to open this dialog is Alt+C but you can set your own shortcut in you browser preferences.",
    "This extension requires access to downloads to let you export your preferences, access to cookies for node switching, and access to all domains because your ServiceNow instances could be accessed through a custom domain.",
    "This extension doesn't collect or upload any data.",
    "Does Chuck really draw power from his bow tie?"
];

const getTip = () => {
    let number = Math.floor((Math.random() * tips.length));
    return tips[number];
};
