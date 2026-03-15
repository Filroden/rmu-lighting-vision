# Version History

| Version | Changes |
| :--- | :--- |
| **Version 1.0.0** | **NEW FEATURES**<br>- Implemented 7-tier RMU light degradation engine calculating distance thresholds (10', 30', 100', 300').<br>- Added custom ApplicationV2 UI injection for Ambient Light and Token configuration sheets to set Base Illumination and Magical Source properties.<br>- Integrated automatic detection for Nightvision and Darkvision via VTT VisionModes and RMU Actor items.<br>- Enforced Darkvision range limitations with automatic fallback to native vision traits.<br>- Handled Magical Darkness via negative luminosity overrides.<br>- Added `Shift + L` keybinding to generate comprehensive RMU penalty chat cards.<br>- Exposed `getLightingState` public API for future core system integration.<br>- Added global GM setting to toggle magical light degradation rules.|
