/**
 * ============================================================================
 * CHAT OUTPUT FORMATTER
 * ============================================================================
 * This script bridges the raw mathematical output from calculator.js and
 * formats it into a human-readable chat card for the Foundry VTT chat log.
 * It handles string localisation, hierarchy resolution for vision modes,
 * and asynchronous HTML rendering via Handlebars.
 * ============================================================================
 */

/**
 * Generates a chat message displaying the exact lighting penalties for a specific target.
 * @param {TokenDocument} sourceDoc - The token observing the scene (the player character).
 * @param {string} targetName - The name of the target token, or the physical canvas coordinates if targeting empty space.
 * @param {Object} state - The comprehensive lighting state object returned by the calculator.
 */
export async function outputLightingToChat(sourceDoc, targetName, state) {
    // Step 1: Map the numerical tiers to their respective localisation keys.
    const tierLabels = {
        0: "rmu.light.tiers.bright",
        1: "rmu.light.tiers.uneven",
        2: "rmu.light.tiers.dim",
        3: "rmu.light.tiers.shadowy",
        4: "rmu.light.tiers.dark",
        5: "rmu.light.tiers.extremelyDark",
        6: "rmu.light.tiers.pitchBlack",
    };

    // Step 2: Determine which vision string to display on the chat card.
    // This is structured as a strict 'if/else' hierarchy. Because a character might
    // possess multiple overlapping vision talents, we only want to display the *most
    // powerful* vision mode actively contributing to their current sight calculation.
    let activeVision = "";

    if (state.activeSpecialVision === "demonSight") {
        activeVision = game.i18n.localize("rmu.vision.demonSightActive");
    } else if (state.activeSpecialVision === "thermal") {
        activeVision = game.i18n.localize("rmu.vision.thermalActive");
    } else if (state.hasDarkvision) {
        // Darkvision supersedes Nightvision
        activeVision = game.i18n.localize("rmu.vision.darkvisionActive");
    } else if (state.hasNightvision) {
        // Standard Nightvision supersedes Lesser Nightvision
        activeVision = game.i18n.localize("rmu.vision.nightvisionActive");
    } else if (state.hasLesserNightvision) {
        activeVision = game.i18n.localize("rmu.vision.lesserNightvisionActive");
    }

    // Step 3: Construct the data payload for the Handlebars template.
    // This object maps exactly to the {{variables}} inside your chat-message.hbs file.
    const templateData = {
        observerName: sourceDoc.name,
        targetName: targetName,
        hasLineOfSight: state.hasLineOfSight,
        // Only pass the illumination label if the observer can actually see the target
        conditionLabel: state.hasLineOfSight ? tierLabels[state.tier] : "",
        activeVision: activeVision,
        penaltyFull: state.penaltyFull,
        penaltyHalf: state.penaltyHalf,
    };

    // Step 4: Render the HTML asynchronously using the preloaded template.
    const templatePath = "modules/rmu-lighting-vision/templates/chat-message.hbs";
    const htmlContent = await foundry.applications.handlebars.renderTemplate(templatePath, templateData);

    // Step 5: Dispatch the formatted message to the VTT chat log.
    await ChatMessage.create({
        user: game.user.id,
        // Binds the message to the observing token, displaying their portrait next to the chat card
        speaker: ChatMessage.getSpeaker({ token: sourceDoc }),
        content: htmlContent,
    });
}
