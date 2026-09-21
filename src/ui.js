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
    const root = app?.form ?? app?.element ?? (html.length === undefined ? html : html[0]);
    if (!root) return;

    if (root.querySelector(".rmu-light-settings")) return;

    const isToken = app.document.documentName === "Token";
    const defaultBase = isToken ? -1 : 0;

    const templateData = {
        currentBase: app.document.getFlag("rmu-lighting-vision", "baseIllumination") ?? defaultBase,
        isMagical: app.document.getFlag("rmu-lighting-vision", "isMagical") ?? false,
        isUtter: app.document.getFlag("rmu-lighting-vision", "isUtter") ?? false,
        isConstant: app.document.getFlag("rmu-lighting-vision", "isConstant") ?? false,
        baseIlluminationOptions: {
            "-1": game.i18n.localize("rmu.light.tiers.none"), // Represents "not set", treating the light as core Foundry using the values for dim/bright radii
            0: game.i18n.localize("rmu.light.tiers.bright"),
            1: game.i18n.localize("rmu.light.tiers.uneven"),
            2: game.i18n.localize("rmu.light.tiers.dim"),
            3: game.i18n.localize("rmu.light.tiers.shadowy"),
            4: game.i18n.localize("rmu.light.tiers.dark"),
            5: game.i18n.localize("rmu.light.tiers.extremelyDark"),
            6: game.i18n.localize("rmu.light.tiers.pitchBlack"),
        },
    };

    const templatePath = "modules/rmu-lighting-vision/templates/light-settings.hbs";
    const rmuHtml = await foundry.applications.handlebars.renderTemplate(templatePath, templateData);

    let injectionSuccessful = false;

    // 2. The Anchor Strategy
    const anchorInput = root.querySelector('[name="config.bright"], [name="config.dim"], [name="light.bright"], [name="light.dim"]');

    if (anchorInput) {
        const anchorGroup = anchorInput.closest(".form-group");
        if (anchorGroup) {
            anchorGroup.insertAdjacentHTML("afterend", rmuHtml);
            injectionSuccessful = true;
        }
    }

    // 3. The Fallback Strategy
    if (!injectionSuccessful) {
        const targetTab = root.querySelector('[data-tab="advanced"], [data-application-part="advanced"], [data-tab="light"], [data-application-part="light"]');
        if (targetTab) {
            const groups = targetTab.querySelectorAll(".form-group");
            if (groups.length) {
                groups[groups.length - 1].insertAdjacentHTML("afterend", rmuHtml);
            } else {
                targetTab.insertAdjacentHTML("beforeend", rmuHtml);
            }
            injectionSuccessful = true;
        }
    }

    // Abort if couldn't place the HTML anywhere
    if (!injectionSuccessful) {
        console.warn("RMU Lighting & Vision | UI Injection failed. Could not find anchor fields or fallback tabs.");
        return;
    }

    // 4. Bind Frontend Mutually Exclusive UI Logic
    setTimeout(() => {
        const injectedFieldset = root.querySelector(".rmu-light-settings");
        enforceMutuallyExclusiveCheckboxes(injectedFieldset);
    }, 0);
}

/**
 * Binds event listeners to ensure Environmental and Magical lights are mutually exclusive,
 * and enforces the Utter implies Magical hierarchy.
 * @param {HTMLElement} fieldset - The injected RMU settings fieldset.
 */
function enforceMutuallyExclusiveCheckboxes(fieldset) {
    if (!fieldset) return;

    const magCb = fieldset.querySelector(".rmu-magical-cb");
    const uttCb = fieldset.querySelector(".rmu-utter-cb");
    const conCb = fieldset.querySelector(".rmu-constant-cb");

    if (!magCb || !uttCb || !conCb) return;

    // --- RULE 1: Constant is mutually exclusive with Magical/Utter ---
    conCb.addEventListener("change", (e) => {
        if (e.target.checked) {
            magCb.checked = false;
            uttCb.checked = false;
        }
    });

    const disableConstant = (e) => {
        if (e.target.checked) conCb.checked = false;
    };

    magCb.addEventListener("change", disableConstant);
    uttCb.addEventListener("change", disableConstant);

    // --- RULE 2: Utter implies Magical ---
    // If 'Utter' is checked, 'Magical' MUST be checked.
    uttCb.addEventListener("change", (e) => {
        if (e.target.checked) {
            magCb.checked = true;
        }
    });

    // If 'Magical' is unchecked, 'Utter' MUST be unchecked.
    magCb.addEventListener("change", (e) => {
        if (!e.target.checked) {
            uttCb.checked = false;
        }
    });
}

// Bind the injection logic to Foundry's core rendering hooks
Hooks.on("renderAmbientLightConfig", injectRMULightSettings);
Hooks.on("renderTokenConfig", injectRMULightSettings);
