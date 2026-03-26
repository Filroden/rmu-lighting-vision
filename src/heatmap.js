import { getBestIlluminationTier } from "./calculator.js";

export class RMULightHeatmap {
    static layer = null;
    static isVisible = false;

    /**
     * Toggles the heat map on and off. Strictly restricted to Game Masters.
     */
    static toggle() {
        if (!canvas?.ready || !game.user.isGM) return;

        if (this.isVisible) {
            this.clear();
            ui.notifications.info(game.i18n.localize("rmu.lighting.heatmap.disabled"));
        } else {
            // 1. Fire the notification immediately
            ui.notifications.info(game.i18n.localize("rmu.lighting.heatmap.generating"));

            // 2. Yield the main thread for 50ms so Foundry can actually draw the notification to the screen
            setTimeout(() => {
                this.render();
                ui.notifications.info(game.i18n.localize("rmu.lighting.heatmap.complete"));
            }, 50);
        }
    }

    /**
     * Destroys the PIXI graphics layer and removes the HTML legend.
     */
    static clear() {
        if (this.layer) {
            this.layer.destroy({ children: true, texture: true, baseTexture: true });
            this.layer = null;
        }

        // Remove the HTML legend overlay
        const legend = document.getElementById("rmu-heatmap-legend");
        if (legend) legend.remove();

        this.isVisible = false;
    }

    /**
     * Injects a native HTML overlay to act as a fixed HUD legend.
     */
    static buildLegend() {
        if (document.getElementById("rmu-heatmap-legend")) return;

        const legend = document.createElement("div");
        legend.id = "rmu-heatmap-legend";

        // Style it as a sleek, click-through HUD element
        Object.assign(legend.style, {
            position: "absolute",
            top: "15px",
            marginRight: "15px",
            backgroundColor: "var(--filroden-color-bg-darkest)",
            color: "var(--filroden-color-text-main-solid)",
            border: "var(--filroden-border-main)",
            borderRadius: "var(--filroden-radius-medium)",
            padding: "var(--filroden-space-m)",
            boxShadow: "var(--filroden-shadow-window)",
            zIndex: 100,
            fontFamily: "var(--filroden-font-family)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
        });

        // The same colors used in the canvas generation
        const tiers = [
            { hex: "#FFFFFF", label: game.i18n.localize("rmu.light.tiers.bright") },
            { hex: "#D4D4D4", label: game.i18n.localize("rmu.light.tiers.uneven") },
            { hex: "#AAAAAA", label: game.i18n.localize("rmu.light.tiers.dim") },
            { hex: "#808080", label: game.i18n.localize("rmu.light.tiers.shadowy") },
            { hex: "#555555", label: game.i18n.localize("rmu.light.tiers.dark") },
            { hex: "#2A2A2A", label: game.i18n.localize("rmu.light.tiers.extremelyDark") },
            { hex: "#000000", label: game.i18n.localize("rmu.light.tiers.pitchBlack") },
        ];

        let html = `<h3 style="margin: 0 0 var(--filroden-space-s) 0; border-bottom: 1px solid var(--filroden-color-border); padding-bottom: var(--filroden-space-xs); font-size: var(--filroden-font-size-m); text-align: center; color: var(--filroden-color2-text-main-solid);">RMU Heatmap</h3>`;
        html += `<div style="display: flex; flex-direction: column; gap: var(--filroden-space-s);">`;

        for (const t of tiers) {
            html += `
            <div style="display: flex; align-items: center; gap: var(--filroden-space-m);">
                <div style="width: var(--filroden-font-size-m); height: var(--filroden-font-size-m); background-color: ${t.hex}; border: var(--filroden-border-main); border-radius: var(--filroden-radius-small);"></div>
                <span style="font-size: var(--filroden-font-size-s);">${t.label}</span>
            </div>`;
        }
        html += `</div>`;

        legend.innerHTML = html;

        // Target Foundry's native right-side UI wrapper
        const uiRight = document.getElementById("ui-right");
        if (uiRight) {
            uiRight.appendChild(legend);
        } else {
            document.body.appendChild(legend); // Safe fallback
        }
    }

    /**
     * Calculates and draws the heat map over the canvas.
     */
    static render() {
        if (this.layer) {
            this.layer.destroy({ children: true, texture: true, baseTexture: true });
            this.layer = null;
        }

        const RESOLUTION_SCALE = 0.25;

        const rect = canvas.dimensions.sceneRect;
        const stepSize = Math.max(10, canvas.grid.size * RESOLUTION_SCALE);

        const htmlCanvas = document.createElement("canvas");
        htmlCanvas.width = rect.width;
        htmlCanvas.height = rect.height;
        const ctx = htmlCanvas.getContext("2d", { alpha: true });

        const colors = [
            "rgba(255, 255, 255, 0.65)", // Tier 0: Bright
            "rgba(212, 212, 212, 0.65)", // Tier 1: Uneven
            "rgba(170, 170, 170, 0.65)", // Tier 2: Dim
            "rgba(128, 128, 128, 0.65)", // Tier 3: Shadowy
            "rgba(85, 85, 85, 0.65)", // Tier 4: Dark
            "rgba(42, 42, 42, 0.65)", // Tier 5: Extremely Dark
            "rgba(0, 0, 0, 0.65)", // Tier 6: Pitch Black
        ];

        for (let x = rect.x; x < rect.right; x += stepSize) {
            for (let y = rect.y; y < rect.bottom; y += stepSize) {
                const point = { x: x + stepSize / 2, y: y + stepSize / 2 };

                const tier = getBestIlluminationTier(null, point);

                ctx.fillStyle = colors[tier];
                ctx.fillRect(x - rect.x, y - rect.y, stepSize, stepSize);
            }
        }

        const baseTexture = new PIXI.BaseTexture(htmlCanvas);
        const texture = new PIXI.Texture(baseTexture);
        this.layer = new PIXI.Sprite(texture);

        this.layer.x = rect.x;
        this.layer.y = rect.y;

        canvas.drawings.addChild(this.layer);

        // Trigger the HUD creation
        this.buildLegend();

        this.isVisible = true;
    }
}

/**
 * Initializes the keyboard listener.
 */
export function initHeatmapListener() {
    window.addEventListener("keydown", (event) => {
        if (event.altKey && event.code === "KeyL") {
            if (!game.user.isGM) return;

            event.preventDefault();
            RMULightHeatmap.toggle();
        }
    });

    Hooks.on("canvasTearDown", () => {
        RMULightHeatmap.clear();
    });
}
