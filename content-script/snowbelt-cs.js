// content-script.js
console.log("*SNOW TOOL BELT* Content script loaded");
const context = {
    loops: 0,
    currentTitle: "",
    headNode: document.getElementsByTagName("title")[0]
};

if (document.title === "ServiceNow") {
    document.getElementById("gsft_main").onload = function () {
        console.log("*SNOW TOOL BELT* Changed tab title");
        context.currentTitle = document.getElementById("gsft_main").contentDocument.title;
        document.title = context.currentTitle;
        context.loops = 0;
    };

    const handleTitleChange = function (mutationsList) {
        for (var mutation of mutationsList) {
            if (context.loops > 100) {
                // we don't want to end in an endless loop; can happen on login screens, for example.
                return true;
            } else if (mutation.type === "childList" && mutation.target.text === "ServiceNow") {
                console.log("*SNOW TOOL BELT* Changed tab title back");
                document.title = context.currentTitle;
                context.loops++;
            }
        }
    };
    const observer = new MutationObserver(handleTitleChange);
    observer.observe(context.headNode, { attributes: true, childList: true });
}
