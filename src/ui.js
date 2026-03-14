/**
 * Injects RMU specific light settings into both Ambient Light and Token configuration sheets.
 */
async function injectRMULightSettings(app, html, data) {
    // Construct the data payload for the Handlebars template
    const templateData = {
        currentBase: app.document.getFlag("rmu-lighting-vision", "baseIllumination") ?? 0,
        isMagical: app.document.getFlag("rmu-lighting-vision", "isMagical") ?? false,
        baseIlluminationOptions: {
            0: game.i18n.localize("rmu.light.tiers.bright"),
            1: game.i18n.localize("rmu.light.tiers.uneven"),
            2: game.i18n.localize("rmu.light.tiers.dim"),
            3: game.i18n.localize("rmu.light.tiers.shadowy"),
            4: game.i18n.localize("rmu.light.tiers.dark"),
        },
    };

    // Render the template using the preloaded file path
    const templatePath = "modules/rmu-lighting-vision/templates/light-settings.hbs";
    const rmuHtml = await renderTemplate(templatePath, templateData);

    // ApplicationV2 typically uses tabs. We target the 'Advanced' or 'Light' tab depending on the sheet.
    const targetTab = html[0].querySelector('.tab[data-tab="advanced"], .tab[data-tab="light"]');
    if (targetTab) {
        targetTab.insertAdjacentHTML("beforeend", rmuHtml);
    }
}

// Hook into both standard light sources and token-emitted light sheets
Hooks.on("renderAmbientLightConfig", injectRMULightSettings);
Hooks.on("renderTokenConfig", injectRMULightSettings);

// Hook into both standard light sources and token-emitted light sheets
Hooks.on("renderAmbientLightConfig", injectRMULightSettings);
Hooks.on("renderTokenConfig", injectRMULightSettings);
