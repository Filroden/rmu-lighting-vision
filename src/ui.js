/**
 * Injects RMU specific light settings into both Ambient Light and Token configuration sheets.
 */
async function injectRMULightSettings(app, html, data) {
    // 1. Root Extraction (The Small Time Method)
    const root = app?.form ?? app?.element ?? (html.length !== undefined ? html[0] : html);
    if (!root) return;

    // Prevent duplicate injections if the hook fires twice
    if (root.querySelector(".rmu-light-settings")) return;

    // Dynamically determine the default fallback based on document type
    const isToken = app.document.documentName === "Token";
    const defaultBase = isToken ? -1 : 0;

    // Construct the data payload for the Handlebars template
    const templateData = {
        currentBase: app.document.getFlag("rmu-lighting-vision", "baseIllumination") ?? defaultBase,
        isMagical: app.document.getFlag("rmu-lighting-vision", "isMagical") ?? false,
        baseIlluminationOptions: {
            "-1": game.i18n.localize("rmu.light.tiers.none"),
            0: game.i18n.localize("rmu.light.tiers.bright"),
            1: game.i18n.localize("rmu.light.tiers.uneven"),
            2: game.i18n.localize("rmu.light.tiers.dim"),
            3: game.i18n.localize("rmu.light.tiers.shadowy"),
            4: game.i18n.localize("rmu.light.tiers.dark"),
        },
    };

    const templatePath = "modules/rmu-lighting-vision/templates/light-settings.hbs";
    const rmuHtml = await foundry.applications.handlebars.renderTemplate(templatePath, templateData);

    // 2. The Anchor Strategy: Target known core form inputs to guarantee we are in the right place
    // Ambient Lights use 'config.bright', Tokens use 'light.bright'.
    const anchorInput = root.querySelector('[name="config.bright"], [name="config.dim"], [name="light.bright"], [name="light.dim"]');

    if (anchorInput) {
        // Travel up the DOM to find the wrapper group for that input
        const anchorGroup = anchorInput.closest(".form-group");
        if (anchorGroup) {
            anchorGroup.insertAdjacentHTML("afterend", rmuHtml);
            return; // Success!
        }
    }

    // 3. Fallback Strategy: If the inputs change in the future, try the tabs one last time
    const targetTab = root.querySelector('[data-tab="advanced"], [data-application-part="advanced"], [data-tab="light"], [data-application-part="light"]');

    if (targetTab) {
        // Try to append after the last form-group in the tab
        const groups = targetTab.querySelectorAll(".form-group");
        if (groups.length) {
            groups[groups.length - 1].insertAdjacentHTML("afterend", rmuHtml);
        } else {
            targetTab.insertAdjacentHTML("beforeend", rmuHtml);
        }
    } else {
        console.warn("RMU Lighting & Vision | UI Injection failed. Could not find anchor fields or fallback tabs.");
    }
}

Hooks.on("renderAmbientLightConfig", injectRMULightSettings);
Hooks.on("renderTokenConfig", injectRMULightSettings);
