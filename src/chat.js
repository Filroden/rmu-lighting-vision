/**
 * Generates a chat message displaying lighting penalties for a specific target.
 * @param {TokenDocument} sourceDoc - The token observing.
 * @param {string} targetName - The name of the target token or the canvas coordinates.
 * @param {Object} state - The lighting state object returned by the calculator.
 */
export async function outputLightingToChat(sourceDoc, targetName, state) {
    // Map the numerical tiers to their respective localisation keys
    const tierLabels = {
        0: "rmu.light.tiers.bright",
        1: "rmu.light.tiers.uneven",
        2: "rmu.light.tiers.dim",
        3: "rmu.light.tiers.shadowy",
        4: "rmu.light.tiers.dark",
        5: "rmu.light.tiers.extremelyDark",
        6: "rmu.light.tiers.pitchBlack",
    };

    // Determine which vision string to display, if any
    let activeVision = "";
    if (state.activeSpecialVision === "demonSight") {
        activeVision = game.i18n.localize("rmu.vision.demonSightActive");
    } else if (state.activeSpecialVision === "thermal") {
        activeVision = game.i18n.localize("rmu.vision.thermalActive");
    } else if (state.hasDarkvision) {
        activeVision = game.i18n.localize("rmu.vision.darkvisionActive");
    } else if (state.hasNightvision) {
        activeVision = game.i18n.localize("rmu.vision.nightvisionActive");
    } else if (state.hasLesserNightvision) {
        activeVision = game.i18n.localize("rmu.vision.lesserNightvisionActive");
    }

    // Construct the data payload for the Handlebars template
    const templateData = {
        observerName: sourceDoc.name,
        targetName: targetName,
        hasLineOfSight: state.hasLineOfSight,
        conditionLabel: state.hasLineOfSight ? tierLabels[state.tier] : "",
        activeVision: activeVision,
        penaltyFull: state.penaltyFull,
        penaltyHalf: state.penaltyHalf,
    };

    // Render the HTML using the preloaded template
    const templatePath = "modules/rmu-lighting-vision/templates/chat-message.hbs";
    const htmlContent = await foundry.applications.handlebars.renderTemplate(templatePath, templateData);

    // Dispatch the formatted message to the VTT chat log
    await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ token: sourceDoc }),
        content: htmlContent,
    });
}
