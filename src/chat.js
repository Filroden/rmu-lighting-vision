/**
 * Generates a chat message displaying lighting penalties for a specific target.
 * Utilises a preloaded Handlebars template for the UI layout.
 * @param {TokenDocument} sourceDoc - The token observing.
 * @param {TokenDocument} targetDoc - The token being observed.
 * @param {Object} state - The lighting state object returned by the calculator.
 */
export async function outputLightingToChat(sourceDoc, targetDoc, state) {
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
    if (state.hasDarkvision) {
        activeVision = game.i18n.localize("rmu.vision.darkvisionActive");
    } else if (state.hasNightvision) {
        activeVision = game.i18n.localize("rmu.vision.nightvisionActive");
    }

    // Construct the data payload for the Handlebars template
    const templateData = {
        observerName: sourceDoc.name,
        targetName: targetDoc.name,
        conditionLabel: tierLabels[state.tier],
        activeVision: activeVision,
        penaltyFull: state.penaltyFull,
        penaltyHalf: state.penaltyHalf,
    };

    // Render the HTML using the preloaded template
    const templatePath = "modules/rmu-lighting-vision/templates/chat-message.hbs";
    const htmlContent = await renderTemplate(templatePath, templateData);

    // Dispatch the formatted message to the VTT chat log
    await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ token: sourceDoc }),
        content: htmlContent,
    });
}
