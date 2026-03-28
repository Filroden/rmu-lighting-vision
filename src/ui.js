/**
 * ============================================================================
 * UI INJECTION & DOM MANIPULATION
 * ============================================================================
 * This script intercepts the rendering cycle of Foundry VTT's native Token
 * and Ambient Light configuration sheets. It non-destructively injects the
 * custom RMU Lighting dropdown menus directly into the HTML, allowing GMs
 * to flag lights as Magical or Utter without opening a separate module app.
 * ============================================================================
 */

/**
 * Injects RMU specific light settings into both Ambient Light and Token configuration sheets.
 * @param {Application} app - The Foundry Application class rendering the sheet.
 * @param {jQuery|HTMLElement} html - The HTML or jQuery object of the sheet.
 * @param {Object} data - The data context provided to the sheet.
 */
async function injectRMULightSettings(app, html, data) {
    // 1. Root Extraction (Cross-Version Compatibility)
    // Foundry is transitioning between old ApplicationV1 (jQuery) and new ApplicationV2 (HTMLElement).
    // This extraction safely navigates both architectures to find the true DOM root.
    const root = app?.form ?? app?.element ?? (html.length !== undefined ? html[0] : html);
    if (!root) return;

    // Defensive Check: Prevent duplicate DOM injections.
    // Foundry's render hooks can sometimes fire multiple times during tab switching or resizing.
    if (root.querySelector(".rmu-light-settings")) return;

    // Dynamically determine the default fallback based on document type.
    // Ambient Lights exist solely to emit light, so they default to 'Bright' (0).
    // Tokens are usually just actors, so they default to 'None' (-1) to prevent everyone from glowing.
    const isToken = app.document.documentName === "Token";
    const defaultBase = isToken ? -1 : 0;

    // Construct the data payload for the Handlebars template, pulling existing flags from the database.
    const templateData = {
        currentBase: app.document.getFlag("rmu-lighting-vision", "baseIllumination") ?? defaultBase,
        isMagical: app.document.getFlag("rmu-lighting-vision", "isMagical") ?? false,
        isUtter: app.document.getFlag("rmu-lighting-vision", "isUtter") ?? false,
        // Localise the dropdown menu options
        baseIlluminationOptions: {
            "-1": game.i18n.localize("rmu.light.tiers.none"),
            0: game.i18n.localize("rmu.light.tiers.bright"),
            1: game.i18n.localize("rmu.light.tiers.uneven"),
            2: game.i18n.localize("rmu.light.tiers.dim"),
            3: game.i18n.localize("rmu.light.tiers.shadowy"),
            4: game.i18n.localize("rmu.light.tiers.dark"),
            5: game.i18n.localize("rmu.light.tiers.extremelyDark"),
            6: game.i18n.localize("rmu.light.tiers.pitchBlack"),
        },
    };

    // Render the injected HTML asynchronously using the preloaded template
    const templatePath = "modules/rmu-lighting-vision/templates/light-settings.hbs";
    const rmuHtml = await foundry.applications.handlebars.renderTemplate(templatePath, templateData);

    // 2. The Anchor Strategy
    // We target known core Foundry form inputs to guarantee our custom UI appears
    // exactly where the user expects it (right underneath the native radius settings).
    // Ambient Lights use 'config.bright', Tokens use 'light.bright'.
    const anchorInput = root.querySelector('[name="config.bright"], [name="config.dim"], [name="light.bright"], [name="light.dim"]');

    if (anchorInput) {
        // Travel up the DOM tree to find the wrapper group for that input
        const anchorGroup = anchorInput.closest(".form-group");
        if (anchorGroup) {
            anchorGroup.insertAdjacentHTML("afterend", rmuHtml);
            return; // Successful injection!
        }
    }

    // 3. The Fallback Strategy
    // If Foundry drastically renames its inputs in a future VTT update, the Anchor Strategy will fail.
    // As a fallback, we aggressively target the entire 'Advanced' or 'Light' tab containers to
    // ensure the RMU settings still appear *somewhere* usable rather than failing silently.
    const targetTab = root.querySelector('[data-tab="advanced"], [data-application-part="advanced"], [data-tab="light"], [data-application-part="light"]');

    if (targetTab) {
        // Try to neatly append it after the last existing form-group in the tab
        const groups = targetTab.querySelectorAll(".form-group");
        if (groups.length) {
            groups[groups.length - 1].insertAdjacentHTML("afterend", rmuHtml);
        } else {
            // Absolute last resort: just dump it at the bottom of the tab
            targetTab.insertAdjacentHTML("beforeend", rmuHtml);
        }
    } else {
        // If even the fallback fails, log a warning so developers know the UI architecture has changed
        console.warn("RMU Lighting & Vision | UI Injection failed. Could not find anchor fields or fallback tabs.");
    }
}

// Bind the injection logic to Foundry's core rendering hooks
Hooks.on("renderAmbientLightConfig", injectRMULightSettings);
Hooks.on("renderTokenConfig", injectRMULightSettings);
