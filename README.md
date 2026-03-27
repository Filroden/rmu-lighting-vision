# RMU Lighting and Vision

![Latest Version](https://img.shields.io/badge/Version-1.0.0-beta4-blue)
![Foundry Version](https://img.shields.io/badge/Foundry_VTT-v13_%7C_v13-orange)
![System](https://img.shields.io/badge/System-RMU-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Download Count](https://img.shields.io/github/downloads/Filroden/rmu-lighting-vision/rmu-lighting-vision.zip)
![Download Count](https://img.shields.io/github/downloads/Filroden/rmu-lighting-vision/latest/rmu-lighting-vision.zip)
![Last Commit](https://img.shields.io/github/last-commit/Filroden/rmu-lighting-vision)
![Issues](https://img.shields.io/github/issues/Filroden/rmu-lighting-vision)

## Overview

The **RMU Lighting and Vision** module implements the rules for visibility in Core Law and automates many vision talents.

## Features

- **True RMU Light Degradation:** Calculates the exact light tier (Bright, Uneven, Dim, Shadowy, Dark, Extremely Dark, Pitch Black) based on the distance from the light source (10', 30', 100', 300', 1000' and 3000' thresholds).
- **Native Talent Parsing:** Automatically reads the RMU Actor document upon token creation to determine if a character possesses advanced vision talents or detection senses, applying the correct Foundry settings instantly.
- **Magical Light Configuration:** Allows GMs to flag light sources as magical, with a global setting to determine whether magical light degrades over distance or illuminates only within its full radius equally.
- **Instant Chat Output:** Press `Shift + L` while targeting a token or hovering the mouse on the canvas to immediately print a formatted chat card displaying both the "Sight Required" and "Sight Helpful" penalties for that position, accounting for all active vision modes.
- **Diagnostic GM Heatmap:** Press `Alt + L` (GM only) to display a greyscale heatmap. This reveals the mathematical boundaries of RMU illumination tiers, magical light & darkness, and Utterlight/Utterdark, with an on-screen HUD legend.

## Installation

1. Open the Foundry VTT Setup screen and navigate to the **Add-on Modules** tab.
2. Click **Install Module** and search for "RMU Lighting and Vision" or paste the following Manifest URL:  
   `https://github.com/Filroden/rmu-lighting-vision/releases/latest/download/module.json`
3. Activate the module within your RMU World under **Manage Modules**.

## Supported Vision & Detection Talents (Beta Configuration)

### 1. Stylised Vision Modes (Canvas Shaders)

These talents completely alter how the player sees the VTT canvas, melting away shadows and applying custom WebGL colour tints.

- **Default (Basic Vision):** Shows lights which are RMU Bright, Uneven, Dim levels at Foundry "bright" levels and RMU Shadowy and Dark levels at Foundry "Dim" levels.
- **Darkvision:** Pierces complete darkness up to 10' per Tier. Shows Bright, Uneven, Dim, Shadowy and Dark in full colour at "bright" levels.
- **Nightvision:** Reduces darkness penalties by 40. Shows Bright, Uneven, Dim, Shadowy and Dark in full colour at "bright" levels.

- **Thermal Vision:** Pierces complete darkness up to 50'. Grants *See Invisibility* up to 50'. Renders the canvas in a high-contrast **Orange/Yellow** heat-map.
- **Sight, Demon:** Grants Darkvision up to 100', and Nightvision beyond 100'. Natively includes Thermal Vision (50'). Grants *See Invisibi