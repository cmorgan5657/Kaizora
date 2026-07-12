import { useEffect, useRef } from "react";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export const useDecisionLayerTour = (
  shouldStart: boolean,
  onEnd?: () => void,
) => {
  const driverRef = useRef<Driver | null>(null);
                
  useEffect(() => {
    if (!shouldStart) {
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }

    const candidateSteps: DriveStep[] = [
      {
        element: "#split-container",
        popover: {
          title: "Decision Layer Workspace",
          description:
            "This view is split into two working zones. The conversation happens on the left, and your progress plus analysis context live on the right.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: "#agent-chat-panel",
        popover: {
          title: "Creative Partner",
          description:
            "The agent interviews you first, learns the blocker behind the work, and then gives you an honest readiness verdict.",
          side: "right",
          align: "start",
        },
      },
      {
        element: "#decision-layer-quick-actions",
        popover: {
          title: "Quick Direction Buttons",
          description:
            "Use these prompts when you want to move fast. They help the agent understand whether you are stuck on quality, pricing, platform fit, or something else.",
          side: "top",
          align: "start",
        },
      },
      {
        element: "#decision-layer-composer",
        popover: {
          title: "Ask Naturally",
          description:
            "You can type freely here at any time, so the conversation is not locked to the preset buttons.",
          side: "top",
          align: "start",
        },
      },
      {
        element: "#progress-bar",
        popover: {
          title: "Progress Tracking",
          description:
            "This bar shows where you are in the intake and evaluation flow, from questions to upload to the final decision.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: "#decision-layer-analysis-preview",
        popover: {
          title: "What Gets Evaluated",
          description:
            "Before you upload, this panel explains the six dimensions Decision Layer uses to judge readiness, pricing potential, and next steps.",
          side: "left",
          align: "start",
        },
      },
    ];

    const steps = candidateSteps.filter(
      (step) =>
        !step.element ||
        (typeof step.element === "string" &&
          document.querySelector(step.element) !== null),
    );

    if (steps.length === 0) {
      onEnd?.();
      return;
    }

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.75,
      smoothScroll: true,
      allowClose: true,
      showButtons: ["previous", "next", "close"],
      nextBtnText: "Next →",
      prevBtnText: "← Back",
      doneBtnText: "Let's Go",
      onDestroyed: () => {
        driverRef.current = null;
        onEnd?.();
      },
      steps,
    });

    driverRef.current = driverObj;
    driverObj.drive();

    return () => {
      driverObj.destroy();
    };
  }, [onEnd, shouldStart]);
};
