# RMU Lighting and Vision

![Latest Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Foundry Version](https://img.shields.io/badge/Foundry_VTT-v13_%7C_v13-orange)
![System](https://img.shields.io/badge/System-RMU-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Download Count](https://img.shields.io/github/downloads/Filroden/rmu-lighting-vision/rmu-lighting-vision.zip)
![Download Count](https://img.shields.io/github/downloads/Filroden/rmu-lighting-vision/latest/rmu-lighting-vision.zip)
![Last Commit](https://img.shields.io/github/last-commit/Filroden/rmu-lighting-vision)
![Issues](https://img.shields.io/github/issues/Filroden/rmu-lighting-vision)

## Overview

The **RMU Lighting and Vision** module automates the environmental penalties defined in Rolemaster Unified (RMU) Table 15-7.

Rather than modifying Foundry VTT's complex WebGL rendering engine, this module acts as a spatial mechanical sensor. It natively reads the canvas geometry, calculates light degradation over distance, checks the observer's vision traits, and outputs the precise mechanical penalties required for manoeuvres and perception checks.

## Features

- **True RMU Light Degradation:** Calculates the exact light tier (Bright, Uneven, Dim, Shadowy, Dark, Extremely Dark, Pitch Black) based on the distance from the light source (10', 30', 100', 300' thresholds).
- **Native Vision Integration:** Automatically reads the RMU Actor document to determine if a character possesses Nightvision or Darkvision (via talents, or active spells).
- **Darkvision Range Enforcement:** Mechanically enforces the configured `sight.range` of a token. If a target is beyond their Darkvision radius, the module automatically falls back to ambient lighting and Nightvision (if possessed).
- **Magical Darkness & Utterdark:** Seamlessly handles negative luminosity on the canvas, overriding ambient light to enforce Extremely Dark or Pitch Black penalties.
- **Magical Light Configuration:** Allows GMs to flag light sources as magical, with a global setting to determine whether magical light degrades over distance or illuminates its full radius equally.
- **Instant Chat Output:** Press `Shift + L` while targeting a token to immediately print a formatted chat card displaying both the "Sight Required" and "Sight Helpful" penalties.

## How to Use

1. **Configure Light Sources:** Open the configuration sheet for any Ambient Light or Token emitting light. Navigate to the native tabs to find the new **RMU Lighting Settings** section.
2. **Set Base Illumination:** Select the light level present within the first 10 feet of the source (e.g., a Torch is *Dim Light*). The module will automatically handle the mathematical degradation beyond 10 feet.
3. **Calculate Penalties:** Select your token, target an enemy token, and press `Shift + L` to output the exact environmental modifiers to the chat.

## API for System Developers

This module exposes a public API designed to be ingested by the core RMU system for automated roll resolution. It returns the raw environmental state, allowing the system to maintain control over how penalties are applied.

```javascript
const lightingModule = game.modules.get("rmu-lighting-vision");

if (lightingModule?.active && lightingModule.api) {
  // Pass the observing token and the target token documents
  const state = lightingModule.api.getLightingState(sourceDoc, targetDoc);
  
  console.log(state);
  /* Returns:
  {
    tier: 4,                  // Integer (0 = Bright, 6 = Pitch Black)
    hasNightvision: true,     // Boolean (Derived from VTT or Actor Items)
    hasDarkvision: false,     // Boolean (Accounts for range falloff)
    penaltyFull: -10,         // Final modifier if sight is required
    penaltyHalf: -5,          // Final modifier if sight is helpful
    distance: 45.2            // Grid distance to target
  }
  */
}
```
