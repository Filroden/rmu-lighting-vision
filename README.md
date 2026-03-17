# RMU Lighting and Vision

![Latest Version](https://img.shields.io/badge/Version-1.0.0-beta2-blue)
![Foundry Version](https://img.shields.io/badge/Foundry_VTT-v13_%7C_v13-orange)
![System](https://img.shields.io/badge/System-RMU-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Download Count](https://img.shields.io/github/downloads/Filroden/rmu-lighting-vision/rmu-lighting-vision.zip)
![Download Count](https://img.shields.io/github/downloads/Filroden/rmu-lighting-vision/latest/rmu-lighting-vision.zip)
![Last Commit](https://img.shields.io/github/last-commit/Filroden/rmu-lighting-vision)
![Issues](https://img.shields.io/github/issues/Filroden/rmu-lighting-vision)

## Overview

The **RMU Lighting and Vision** module automates the environmental penalties defined in Rolemaster Unified (RMU) Core Law Table 15-7, alongside a suite of Core and Creature Law vision talents.

## Features

- **True RMU Light Degradation:** Calculates the exact light tier (Bright, Uneven, Dim, Shadowy, Dark, Extremely Dark, Pitch Black) based on the distance from the light source (10', 30', 100', 300', 1000' and 3000' thresholds).
- **Native Talent Parsing:** Automatically reads the RMU Actor document upon token creation to determine if a character possesses advanced vision talents or detection senses, applying the correct Foundry settings instantly.
- **Magical Light Configuration:** Allows GMs to flag light sources as magical, with a global setting to determine whether magical light degrades over distance or illuminates only within its full radius equally.
- **Instant Chat Output:** Press `Shift + L` while targeting a token or hovering the mouse on the canvas to immediately print a formatted chat card displaying both the "Sight Required" and "Sight Helpful" penalties for that position, accounting for all active vision modes.

## Supported Vision & Detection Talents (Beta Configuration)

*Note for Beta Testers: To facilitate testing, the mechanical configurations for these talents are currently hardcoded. Future updates will move these thresholds into configurable Game Settings.*

### 1. Stylised Vision Modes (Canvas Shaders)

These talents completely alter how the player sees the VTT canvas, melting away shadows and applying custom WebGL colour tints.

- **Default:** Shows lights which are Bright, Uneven, Dim at "bright" levels and Shadowy, Dark at "Dim" levels.
- **Darkvision:** Pierces complete darkness up to 10' per Tier. Shows Bright, Uneven, Dim, Shadowy and Dark in full colour at "bright" levels.
- **Nightvision:** Reduces darkness penalties by 40. Shows Bright, Uneven, Dim, Shadowy and Dark in full colour at "bright" levels.
- **Thermal Vision:** Pierces complete darkness up to 50'. Grants *See Invisibility* up to 50'. Renders the canvas in a high-contrast **Orange/Yellow** heat-map.
- **Sight, Demon:** Grants Darkvision up to 100', and Nightvision beyond 100'. Natively includes Thermal Vision (50'). Grants *See Invisibility* up to 5' per Level. Renders the canvas in a high-contrast **Crimson** tint.

### 2. Detection Senses (Token Outlines)

These talents do not colour the canvas, but act as a radar. They pierce physical walls and pitch-black darkness to reveal hidden tokens using coloured outlines.

- **Life Sense (Cyan Outline):** Range of 5' per Tier.
  - *Exclusion Rule:* Completely ignores any token that possesses a talent named **"Lifeless"**.
- **Presence Sense (Red Outline):** Range of 5' per Level.
  - *Exclusion Rule:* Completely ignores any token that possesses a talent named **"Animalistic"** or **"Mindless"**.
- **Tremorsense:** Flat 50' range. Uses native Foundry *Tremorsense* mechanics.
- **Invisibility Sense:** Range of 5' per Level. Reveals invisible tokens.
- **Air Movement Detection:** Range of 1' per Tier. Mapped mechanically to native Foundry *See Invisibility*.
- **Electrolocation, Passive:** Range of 1' per Level. Mapped mechanically to native Foundry *See Invisibility*.

## How to Use

1. **Configure Light Sources:** Open the configuration sheet for any Ambient Light or Token emitting light. Find the new **RMU Lighting Settings** section.
2. **Set Base Illumination:** Select the light level present within the first 10 feet of the source (e.g., a Torch is *Dim Light*). The module will automatically degrade the light mathematically. Set the option if the source is magical. Depending on your game setting, this will make the magic light either act like a spotlight with no light spilling beyond the radius, or it will act like natural light but suffer 2 steps of light degradation at the first boundary before degrading normally.
3. **Automated Tokens:** Simply drag an Actor with recognised vision talents onto the canvas. The module will automatically configure their Vision Modes and Detection Ranges.
4. **Calculate Penalties:** Select your token, target an enemy token, and press `Shift + L` to output the exact environmental modifiers to the chat.

## Visual Mapping & Game Settings

Because Rolemaster Unified features a 7-tier lighting system, and Foundry VTT's rendering engine only supports 3 distinct visual states (Bright, Dim, and Unlit), the module must group the RMU tiers into visual brackets.

The underlying math and `Shift + L` chat card penalties will **always** calculate the true 7-tier RMU values perfectly, regardless of how the VTT visually renders them. However, GMs can customise how these tiers are painted onto the canvas using two specific Game Settings:

### 1. Light Mapping (How Sources Emit Light)

This setting dictates which RMU tiers are assigned to Foundry's Bright and Dim radii.

| RMU Light Level | "Forgiving" Setting | "Strict" Setting |
| :--- | :--- | :--- |
| **Bright** | Bright Radius | Bright Radius |
| **Uneven** | Bright Radius | Bright Radius |
| **Dim** | Bright Radius | Dim Radius |
| **Shadowy** | Dim Radius | Dim Radius |
| **Dark** | Dim Radius | Dim Radius |
| **Extremely Dark** | Unlit (Off) | Unlit (Off) |
| **Pitch Black** | Unlit (Off) | Unlit (Off) |

### 2. Vision Strictness (How Characters Perceive Light)

This setting alters how standard vision (Basic Vision) perceives the "Dim Radius" group (Shadowy/Dark).

- **Standard:** Normal vision can see into Shadowy/Dark areas, interpreting them as Dim light.
- **Gritty:** Normal vision is completely blind in Shadowy/Dark areas. They render as Pitch Black. Nightvision is required to elevate these areas back up to Dim light.

| Vision Mode | Standard Setting | Gritty Setting |
| :--- | :--- | :--- |
| **Basic Vision** | Sees Group 2 as **Dim** | Sees Group 2 as **Off (Pitch Black)** |
| **Nightvision** | Sees Group 2 as Bright | Sees Group 2 as **Dim** |
| **Darkvision** | Sees Group 2 as Bright | Sees Group 2 as Bright |

---

## Migrating Existing Maps & Tokens

If you are installing this module into an ongoing campaign, your existing map assets will not automatically update until they are prompted. To make this easy, the module includes a dedicated **Lighting & Vision Control Panel**.

**1. Automating the Scene (Tokens & Lights)**
To force the module to sweep your current map and apply the correct rules:

- Go to **Game Settings** and click **Configure Settings**.
- Navigate to the **Module Settings** tab and find **RMU Lighting and Vision**.
- Click the **Open Control Panel** button.
- Select **Update Scene to RMU Rules**.
- *Result:* The engine will read the character sheets of every token on the canvas, silently injecting the correct native vision settings (like Darkvision or Life Sense). It will also recalculate the physical light radii of all torches and spells to match your current Strictness settings.

**2. Configuring Existing Light Sources (Manual Step)**
Unlike vision, the engine cannot automatically guess the narrative intent behind your pre-existing light sources (e.g., whether a placed light was meant to be a torch, a glowing mushroom, or a magical aura).

- By default, the engine will treat all pre-existing Ambient Lights and Token Lights as **Bright Light** (Tier 0).
- To fix this, you must double-click your existing Ambient Lights (or tokens holding lights) and manually select the correct **RMU Base Illumination** tier from the new dropdown menu in their configuration sheets.

**3. Uninstalling or Disabling**
If you wish to stop using the module, simply open the Control Panel and click **Restore Foundry Defaults**. This will strip the custom RMU shaders from your tokens and restore your light radii exactly to where they were before the module was applied.

## Upcoming Features (Roadmap)

The following features are currently in development for full release:

- **Active Effects Integration:** Support for spells and potions temporarily granting vision talents.
- **Localisation and Metric Support:** I will add the usual es, es-419, fr and sv translations and make sure the module supports metric units.

## API for System Developers

This module exposes a public API designed to be ingested by the core RMU system for automated roll resolution.

```javascript
const lightingModule = game.modules.get("rmu-lighting-vision");

if (lightingModule?.active && lightingModule.api) {
  // Pass the observing token and the target token documents
  const state = lightingModule.api.getLightingState(sourceDoc, targetDoc);
  console.log(state);
}
```
