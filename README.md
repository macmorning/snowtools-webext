
# ServiceNow Tool Belt

Browser extension for ServiceNow developers and administrators. Manage multiple instances, search records, and boost productivity.

## Features

### Tab & Instance Management
- **Grouped tabs**: View tabs organized by ServiceNow instance
- **Instance switching**: Open records/lists on different instances
- **Custom colors**: Assign colors to distinguish instances
- **Tab groups** (Chrome): Auto-organize tabs with colored groups

### Search & Navigation
- **Universal search**: Find records by sys_id, task number, username, or group name
- **Smart detection**: Automatically identifies correct table and record class
- **Wildcard search**: Use `*` for "starts with" searches
- **Cross-instance**: Search on any available instance

### Developer Tools
- **Field name toggle**: Switch between display names and technical field names
- **Background scripts**: Enhanced script editor with better UX
- **Version history**: Quick access to record versions for any object, incl. from Flow Designer
- **Frame navigation**: Reopen pages in ServiceNow's navigation frame

### Configuration
- **Auto-discovery**: Automatically detect visited instances
- **Export/Import**: Backup configurations as JSON
- **Theme support**: Light/dark themes based on system preference
- **Keyboard shortcuts**: Configurable hotkeys for common actions

## Installation

[![Mozilla Add-on](https://img.shields.io/amo/users/snow-tool-belt.svg?label=firefox%20users&logo=mozilla)](https://addons.mozilla.org/fr/firefox/addon/snow-tool-belt/)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/jflcifhpkilfaomlnikfaaccmpidkmln.svg?label=chrome%20users&logo=google)](https://chrome.google.com/webstore/detail/servicenow-tool-belt/jflcifhpkilfaomlnikfaaccmpidkmln) 
[![](https://img.shields.io/badge/dynamic/json?label=edge&nbsp;users&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fofefboehibiaekjaiaiacalcdeonfbil)](https://microsoftedge.microsoft.com/addons/detail/servicenow-tool-belt/ofefboehibiaekjaiaiacalcdeonfbil)

## Contributing

Found a bug or have a feature idea? Contributions welcome!

1. **Create/assign** yourself to an issue
2. **Fork** the repository  
3. **Test** on Firefox, Chrome, and Edge
4. **Submit** a pull request

**Requirements**: ESLint only, no external dependencies.
