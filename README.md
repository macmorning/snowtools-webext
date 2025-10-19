
# ServiceNow Tool Belt

A comprehensive browser extension designed to enhance productivity for ServiceNow developers and administrators across multiple instances.

## Core Features

### Tab Management
* **Instance-based organization**: View all open tabs grouped by ServiceNow instance
* **Smart tab creation**: Open new tabs on any known instance with proper positioning
* **Cross-instance navigation**: Open the same record or list on different instances
* **Tab grouping** (Chrome): Organize instance tabs into colored groups with one click
* **Visual identification**: Custom favicon colors for each instance
* **Update set tracking**: Display current update set for each session

### Instance Management
* **Automatic discovery**: Automatically detect and record visited ServiceNow instances
* **Custom naming**: Set friendly names for instances (e.g., "Dev", "Test", "Production")
* **Visibility control**: Show or hide specific instances from the main interface
* **Color coding**: Assign unique colors to distinguish instances at a glance

### Search & Navigation
* **sys_id search**: Find any record across all tables using its system ID
* **Smart record detection**: Automatically identifies the correct table and record class
* **Direct access**: One-click navigation to found records
* **Cross-instance search**: Search on any available instance

### Developer Tools
* **Background script enhancement**: Enhanced script editor with execution history
* **Field name switching**: Toggle between display names and technical field names
* **Version tracking**: Quick access to record version history
* **Frame navigation**: Reopen pages in ServiceNow's navigation frame

### Keyboard Shortcuts
* **Customizable hotkeys**: Configure shortcuts for common actions
* **Quick access**: Instant popup access, field switching, version viewing
* **Background scripts**: Hotkey to open script editor on current instance
* **Frame toggle**: Keyboard shortcut for frame navigation

### Configuration & Sync
* **Cross-browser sync**: Synchronize settings between Chrome, Firefox, and Edge
* **Export/Import**: Backup and restore configurations via JSON files
* **Cloud storage**: Optional sync using browser's cloud storage
* **Theme support**: Light, dark, or automatic theme based on system preference

### Advanced Features
* **Multi-domain support**: Works with custom ServiceNow domains beyond service-now.com
* **Node switching**: Switch between cluster nodes for testing and troubleshooting
* **Debug mode**: Detailed console logging for extension troubleshooting
* **Responsive design**: Adapts to different screen sizes and browser windows

## Browser Support
* **Chrome**: Full feature set including tab groups
* **Firefox**: Complete functionality with browser-specific optimizations  
* **Edge**: Full compatibility with Chromium-based features

To do:
* ... who knows? Post an enhancement request! 

Where to get the extension for your browser:

[![Mozilla Add-on](https://img.shields.io/amo/users/snow-tool-belt.svg?label=firefox%20users&logo=mozilla)](https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/jflcifhpkilfaomlnikfaaccmpidkmln.svg?label=chrome%20users&logo=google)](https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln) 
[![](https://img.shields.io/badge/dynamic/json?label=edge&nbsp;users&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fofefboehibiaekjaiaiacalcdeonfbil)](https://microsoftedge.microsoft.com/addons/detail/servicenow-tool-belt/ofefboehibiaekjaiaiacalcdeonfbil)

# Contributing

You have an idea of a useful feature that is missing? There's this annoying bug I never took the time to fix? You are very welcome to contribute to this project, and it's simple.
There is no specific tool required except ESLint. No external dependency.

Assign yourself to an issue, existing or new, and comment it to let people know you're working on it.
For enhancements or complex features, discuss the implementation on the issue thread.
Fork the repository, work on the issue or enhancement. Test on the latest versions of [Firefox](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Temporary_Installation_in_Firefox), [Chrome](https://developer.chrome.com/extensions/getstarted#unpacked) and Edge then send a pull request. I'll review it, merge, and upload the new version of the packaged extension.
Done. :)
