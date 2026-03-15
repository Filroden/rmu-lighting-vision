/**
 * Maps an RMU Base Illumination tier to physical Foundry VTT radii.
 * Exported so the migration sweep can access it.
 */
export const RADIUS_MAPPING = {
    "-1": { bright: 0, dim: 0 },
    0: { bright: 30, dim: 100 },
    1: { bright: 10, dim: 30 },
    2: { bright: 0, dim: 10 },
    3: { bright: 0, dim: 0 },
    4: { bright: 0, dim: 0 },
    5: { bright: 0, dim: 0 },
    6: { bright: 0, dim: 0 },
};

/**
 * Intercepts document updates to auto-populate native light radii based on RMU tiers.
 */
function syncLightRadii(document, updateData) {
    // ESCAPE HATCH: If the GM has disabled the lighting engine, abort immediately.
    // This allows the GM to manually edit light radii without the module interfering.
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    const rmuFlags = updateData.flags?.["rmu-lighting-vision"];
    if (rmuFlags && rmuFlags.baseIllumination !== undefined) {
        const tier = parseInt(rmuFlags.baseIllumination, 10);
        const newRadii = RADIUS_MAPPING[tier];

        if (newRadii) {
            const isToken = document.documentName === "Token";

            // NON-DESTRUCTIVE BACKUP: If we haven't already backed up the original radii, do it now.
            const existingBackup = document.flags?.["rmu-lighting-vision"]?.originalRadii;
            if (!existingBackup) {
                const currentLight = isToken ? document.light : document.config;

                updateData.flags = updateData.flags || {};
                updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
                updateData.flags["rmu-lighting-vision"].originalRadii = {
                    bright: currentLight?.bright ?? 0,
                    dim: currentLight?.dim ?? 0,
                };
            }

            // Inject the calculated radii
            if (isToken) {
                updateData.light = updateData.light || {};
                updateData.light.bright = newRadii.bright;
                updateData.light.dim = newRadii.dim;
            } else {
                updateData.config = updateData.config || {};
                updateData.config.bright = newRadii.bright;
                updateData.config.dim = newRadii.dim;
            }
        }
    }
}

Hooks.on("preUpdateAmbientLight", syncLightRadii);
Hooks.on("preUpdateToken", syncLightRadii);
