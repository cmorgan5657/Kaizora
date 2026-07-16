import { NextRequest, NextResponse } from "next/server";
import { getGeminiTrace, GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import { serverLog } from "@/lib/debugLogs";
const genai = getGoogleAiClient();
export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      phase,
      isFirstTime,
      hasUploadedFiles,
      hasEvaluation,
      userIntent,
      fileCount,
      evaluation,
      buttonClicked,
      userType = "unsure",
      // NEW: Context gathered from the 4 context questions
      creatorContext = {},
      freeFormDuringContext = false,
      streaming = false,
    } = await request.json();
    let systemPrompt = "";
    let userPrompt = "";
    let showButtons = false;
    let buttons: any[] = [];
    if (
      phase === "greeting" &&
      !hasUploadedFiles &&
      !buttonClicked &&
      !freeFormDuringContext
    ) {
      // Greeting is handled client-side — no GPT call needed
      return NextResponse.json({
        success: true,
        message: isFirstTime
          ? "Welcome to the Decision Layer."
          : "Welcome back! What are you working on today?",
        showButtons: true,
        buttons: [
          {
            id: "quality",
            label: "Quality",
            description: "is it good enough?",
          },
          {
            id: "pricing",
            label: "Pricing",
            description: "I don't know what to charge",
          },
          {
            id: "platform",
            label: "Where to sell",
            description: "no idea where this fits",
          },
          {
            id: "time",
            label: "Time to package",
            description: "it takes forever",
          },
          {
            id: "consistency",
            label: "Consistency",
            description: "things keep drifting",
          },
          { id: "general", label: "Everything feels stuck", description: "" },
        ],
      });
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 2.5: LEVEL 3 ANSWERS → NOW LEADS TO CONTEXT QUESTIONS
    // ═══════════════════════════════════════════════════════
    else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("l3_")
    ) {
      const level3Responses: any = {
        // Quality > Compare
        l3_quality_compare_better:
          "You already have an edge. Before you upload, let me understand your project a bit better.",
        l3_quality_compare_same:
          "That's honest. Before you upload, a few quick questions so I can tailor my analysis.",
        l3_quality_compare_worse:
          "Good that you know. Before you upload, let me understand what you're building.",
        // Quality > Ready
        l3_quality_ready_almost:
          "You're close. Let me understand your project so I can focus on what matters most.",
        l3_quality_ready_needs:
          "No problem. A few quick questions so I can give you the right improvement plan.",
        l3_quality_ready_unsure:
          "Let me be your second opinion. First, a few quick questions.",
        // Quality > Feedback
        l3_quality_feedback_positive:
          "Great foundation. Let me understand your goals so I can build on that.",
        l3_quality_feedback_mixed:
          "Mixed feedback is useful. Let me understand your project to decode it.",
        l3_quality_feedback_none:
          "Fresh eyes then. A few quick questions first.",
        // Pricing > Similar
        l3_pricing_similar_researched:
          "Good start. Before we dive in, let me understand what you're creating.",
        l3_pricing_similar_noidea:
          "No worries. A few quick questions so I can benchmark it for you.",
        l3_pricing_similar_varies:
          "Varying prices are tricky. Let me understand your project first.",
        // Pricing > Time
        l3_pricing_time_hours:
          "Quick work. Let me understand the context so I can price it right.",
        l3_pricing_time_days:
          "Good investment. A few questions to make sure you price it accordingly.",
        l3_pricing_time_weeks:
          "Serious work deserves serious pricing. Let me understand your project.",
        // Pricing > Unsure
        l3_pricing_unsure_neversold:
          "Everyone starts here. A few questions so I can give you a strong starting point.",
        l3_pricing_unsure_soldbefore:
          "Experience helps. Let me understand this specific project.",
        l3_pricing_unsure_triedfailed:
          "Pricing is tricky. Let me understand your situation better.",
        // Platform > Audience
        l3_platform_audience_creators:
          "Creators are a great market. Let me understand what you're making first.",
        l3_platform_audience_businesses:
          "B2B is lucrative. A few questions to identify the right channels.",
        l3_platform_audience_general:
          "Wide audience needs the right platform. Let me understand your project.",
        // Platform > Where
        l3_platform_where_knowsome:
          "Good awareness. Let me understand your content so I can narrow it down.",
        l3_platform_where_noidea: "No problem. A few quick questions first.",
        l3_platform_where_failed:
          "Let's fix that. Let me understand what you're working with.",
        // Platform > Multiple
        l3_platform_multiple_yes:
          "Smart thinking. Let me understand your project first.",
        l3_platform_multiple_maybe:
          "Worth considering. A few quick questions before we dive in.",
        l3_platform_multiple_never:
          "It could help. Let me understand your situation.",
        // Time > Bottleneck
        l3_time_bottleneck_creating:
          "Creating is the hardest part. Let me understand your project context.",
        l3_time_bottleneck_editing:
          "Editing eats time. A few quick questions first.",
        l3_time_bottleneck_packaging:
          "Packaging is fixable. Let me understand what you're packaging.",
        // Time > Format
        l3_time_format_images:
          "Images can be optimized. Let me understand your project first.",
        l3_time_format_video:
          "Video is time-heavy. A few questions before we dive in.",
        l3_time_format_audio:
          "Audio takes patience. Let me understand what you're creating.",
        // Time > Worth
        l3_time_worth_yes:
          "Glad to hear it. Let me understand your goals better.",
        l3_time_worth_notsure: "Let's find out. A few quick questions.",
        l3_time_worth_no:
          "That's a red flag. Let me understand your situation.",
        // Consistency > Style
        l3_consistency_style_between:
          "Between projects is common. Let me understand your creative direction.",
        l3_consistency_style_within:
          "Within projects is trickier. A few questions first.",
        l3_consistency_style_both:
          "Both is fixable. Let me understand what you're building.",
        // Consistency > Brand
        l3_consistency_brand_colors:
          "Colors are foundational. Let me understand your brand goals.",
        l3_consistency_brand_fonts:
          "Fonts matter more than people think. A few questions first.",
        l3_consistency_brand_overall:
          "Overall feel is hard to pin down. Let me understand your vision.",
        // Consistency > Characters
        l3_consistency_character_face:
          "Face consistency is tough with AI. Let me understand your project.",
        l3_consistency_character_style:
          "Style drift is common. A few quick questions.",
        l3_consistency_character_both:
          "Both issues together. Let me understand what you're creating.",
        // General > Where to start
        l3_general_where_hasidea:
          "Good, you have something. Let me understand your direction.",
        l3_general_where_noidea:
          "Let's find it together. A few questions first.",
        l3_general_where_toomany:
          "Too many ideas is a real problem. Let me help you focus.",
        // General > Motivation
        l3_general_motivation_burnout:
          "Burnout is real. A few quick questions before we dive in.",
        l3_general_motivation_nofeedback:
          "Feedback helps. Let me understand your project.",
        l3_general_motivation_notselling:
          "Let's fix that. A few questions first.",
        // General > Direction
        l3_general_direction_what:
          "What to create is the big question. Let me understand your situation.",
        l3_general_direction_who:
          "Knowing your audience changes everything. A few questions first.",
        l3_general_direction_both:
          "Both together is overwhelming. Let me help you simplify.",
      };
      const message =
        level3Responses[buttonClicked] ||
        "Got it. A few quick questions before you upload.";
      // ✅ CHANGED: Instead of "Upload Now", start the context gathering chain
      return NextResponse.json({
        success: true,
        message,
        showButtons: true,
        buttons: [
          {
            id: "context_start",
            label: "Let's go →",
            description: "4 quick questions",
          },
        ],
      });
    }
    // ═══════════════════════════════════════════════════════
    // NEW: CONTEXT QUESTION 2 — "Who would buy this?"
    // ═══════════════════════════════════════════════════════
    else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("ctx_goal_")
    ) {
      const goalLabel = buttonClicked
        .replace("ctx_goal_", "")
        .replace(/-/g, " ");
      return NextResponse.json({
        success: true,
        message: `Got it — ${goalLabel}.`,
        showButtons: false,
        buttons: [],
      });
    }
    // ═══════════════════════════════════════════════════════
    // NEW: CONTEXT QUESTION 3 — "What quality level?"
    // ═══════════════════════════════════════════════════════
    else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("ctx_buyer_")
    ) {
      return NextResponse.json({
        success: true,
        message: "Good to know.",
        showButtons: false,
        buttons: [],
      });
    } else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("ctx_media_")
    ) {
      return NextResponse.json({
        success: true,
        message: "Noted.",
        showButtons: false,
        buttons: [],
      });
    } else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("ctx_time_")
    ) {
      return NextResponse.json({
        success: true,
        message: "Got it.",
        showButtons: false,
        buttons: [],
      });
    }
    // ═══════════════════════════════════════════════════════
    // NEW: CONTEXT QUESTION 4 — "Confidence blocker?"
    // ═══════════════════════════════════════════════════════
    else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("ctx_quality_")
    ) {
      return NextResponse.json({
        success: true,
        message: "Noted.",
        showButtons: false,
        buttons: [],
      });
    }
    // ═══════════════════════════════════════════════════════
    // NEW: CONTEXT COMPLETE → Upload Now
    // ═══════════════════════════════════════════════════════
    else if (
      buttonClicked &&
      !hasUploadedFiles &&
      buttonClicked.startsWith("ctx_blocker_")
    ) {
      return NextResponse.json({
        success: true,
        message: "Got it — I have the full picture now.",
        showButtons: false,
        buttons: [],
      });
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 2.4: LEVEL 2 ANSWERS (shows level 3 questions)
    // ═══════════════════════════════════════════════════════
    else if (
      buttonClicked &&
      !hasUploadedFiles &&
      (buttonClicked.startsWith("quality_") ||
        buttonClicked.startsWith("pricing_") ||
        buttonClicked.startsWith("platform_") ||
        buttonClicked.startsWith("time_") ||
        buttonClicked.startsWith("consistency_") ||
        buttonClicked.startsWith("general_"))
    ) {
      const level2Questions: any = {
        quality_compare: {
          message: "Good question. Where do you think it stands?",
          buttons: [
            {
              id: "l3_quality_compare_better",
              label: "Better than most",
              description: "",
            },
            {
              id: "l3_quality_compare_same",
              label: "About the same",
              description: "",
            },
            {
              id: "l3_quality_compare_worse",
              label: "Worse than most",
              description: "",
            },
          ],
        },
        quality_ready: {
          message: "How close do you feel it is?",
          buttons: [
            {
              id: "l3_quality_ready_almost",
              label: "Almost ready",
              description: "",
            },
            {
              id: "l3_quality_ready_needs",
              label: "Needs work",
              description: "",
            },
            {
              id: "l3_quality_ready_unsure",
              label: "Not sure",
              description: "",
            },
          ],
        },
        quality_feedback: {
          message: "What kind of feedback have you gotten?",
          buttons: [
            {
              id: "l3_quality_feedback_positive",
              label: "Mostly positive",
              description: "",
            },
            {
              id: "l3_quality_feedback_mixed",
              label: "Mixed",
              description: "",
            },
            {
              id: "l3_quality_feedback_none",
              label: "No feedback yet",
              description: "",
            },
          ],
        },
        pricing_similar: {
          message: "Have you researched what similar assets sell for?",
          buttons: [
            {
              id: "l3_pricing_similar_researched",
              label: "Yes I've researched",
              description: "",
            },
            {
              id: "l3_pricing_similar_noidea",
              label: "No idea",
              description: "",
            },
            {
              id: "l3_pricing_similar_varies",
              label: "Prices vary a lot",
              description: "",
            },
          ],
        },
        pricing_time: {
          message: "How long did it take to create?",
          buttons: [
            {
              id: "l3_pricing_time_hours",
              label: "A few hours",
              description: "",
            },
            {
              id: "l3_pricing_time_days",
              label: "A few days",
              description: "",
            },
            {
              id: "l3_pricing_time_weeks",
              label: "Weeks of work",
              description: "",
            },
          ],
        },
        pricing_unsure: {
          message: "Have you sold anything before?",
          buttons: [
            {
              id: "l3_pricing_unsure_neversold",
              label: "Never sold before",
              description: "",
            },
            {
              id: "l3_pricing_unsure_soldbefore",
              label: "Sold but unsure",
              description: "",
            },
            {
              id: "l3_pricing_unsure_triedfailed",
              label: "Tried and failed",
              description: "",
            },
          ],
        },
        platform_audience: {
          message: "Who do you imagine buying this?",
          buttons: [
            {
              id: "l3_platform_audience_creators",
              label: "Other creators",
              description: "",
            },
            {
              id: "l3_platform_audience_businesses",
              label: "Businesses",
              description: "",
            },
            {
              id: "l3_platform_audience_general",
              label: "General public",
              description: "",
            },
          ],
        },
        platform_best: {
          message: "Do you know any platforms already?",
          buttons: [
            {
              id: "l3_platform_where_knowsome",
              label: "I know a few",
              description: "",
            },
            {
              id: "l3_platform_where_noidea",
              label: "No idea",
              description: "",
            },
            {
              id: "l3_platform_where_failed",
              label: "Tried but failed",
              description: "",
            },
          ],
        },
        platform_multiple: {
          message: "Have you thought about using multiple platforms?",
          buttons: [
            {
              id: "l3_platform_multiple_yes",
              label: "Yes but don't know how",
              description: "",
            },
            {
              id: "l3_platform_multiple_maybe",
              label: "Maybe",
              description: "",
            },
            {
              id: "l3_platform_multiple_never",
              label: "Never thought about it",
              description: "",
            },
          ],
        },
        time_bottleneck: {
          message: "Where does most of your time go?",
          buttons: [
            {
              id: "l3_time_bottleneck_creating",
              label: "Creating",
              description: "",
            },
            {
              id: "l3_time_bottleneck_editing",
              label: "Editing",
              description: "",
            },
            {
              id: "l3_time_bottleneck_packaging",
              label: "Packaging",
              description: "",
            },
          ],
        },
        time_format: {
          message: "Which format takes you the longest?",
          buttons: [
            { id: "l3_time_format_images", label: "Images", description: "" },
            { id: "l3_time_format_video", label: "Video", description: "" },
            { id: "l3_time_format_audio", label: "Audio", description: "" },
          ],
        },
        time_worth: {
          message: "Do you feel the time you spend is worth it?",
          buttons: [
            {
              id: "l3_time_worth_yes",
              label: "Yes but exhausted",
              description: "",
            },
            { id: "l3_time_worth_notsure", label: "Not sure", description: "" },
            { id: "l3_time_worth_no", label: "No", description: "" },
          ],
        },
        consistency_style: {
          message: "Where does the style drift happen?",
          buttons: [
            {
              id: "l3_consistency_style_between",
              label: "Between projects",
              description: "",
            },
            {
              id: "l3_consistency_style_within",
              label: "Within same project",
              description: "",
            },
            { id: "l3_consistency_style_both", label: "Both", description: "" },
          ],
        },
        consistency_brand: {
          message: "What feels off with your brand?",
          buttons: [
            {
              id: "l3_consistency_brand_colors",
              label: "Colors",
              description: "",
            },
            {
              id: "l3_consistency_brand_fonts",
              label: "Fonts",
              description: "",
            },
            {
              id: "l3_consistency_brand_overall",
              label: "Overall feel",
              description: "",
            },
          ],
        },
        consistency_character: {
          message: "What changes with your characters?",
          buttons: [
            {
              id: "l3_consistency_character_face",
              label: "Face",
              description: "",
            },
            {
              id: "l3_consistency_character_style",
              label: "Style",
              description: "",
            },
            {
              id: "l3_consistency_character_both",
              label: "Both",
              description: "",
            },
          ],
        },
        general_where: {
          message: "What's stopping you from starting?",
          buttons: [
            {
              id: "l3_general_where_hasidea",
              label: "Have idea but stuck",
              description: "",
            },
            {
              id: "l3_general_where_noidea",
              label: "No idea at all",
              description: "",
            },
            {
              id: "l3_general_where_toomany",
              label: "Too many ideas",
              description: "",
            },
          ],
        },
        general_motivation: {
          message: "What's draining your motivation?",
          buttons: [
            {
              id: "l3_general_motivation_burnout",
              label: "Burnout",
              description: "",
            },
            {
              id: "l3_general_motivation_nofeedback",
              label: "No feedback",
              description: "",
            },
            {
              id: "l3_general_motivation_notselling",
              label: "Not selling",
              description: "",
            },
          ],
        },
        general_direction: {
          message: "What feels unclear about your direction?",
          buttons: [
            {
              id: "l3_general_direction_what",
              label: "What to create",
              description: "",
            },
            {
              id: "l3_general_direction_who",
              label: "Who to sell to",
              description: "",
            },
            { id: "l3_general_direction_both", label: "Both", description: "" },
          ],
        },
      };
      const response = level2Questions[buttonClicked];
      if (response) {
        return NextResponse.json({
          success: true,
          message: response.message,
          showButtons: true,
          buttons: response.buttons,
        });
      }
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 2: LEVEL 1 - CONCERN BUTTON CLICKED
    // ═══════════════════════════════════════════════════════
    else if (buttonClicked && !hasUploadedFiles) {
      const concern = buttonClicked;
      const concernMessages: any = {
        quality: "I hear you on quality. Before you upload, quick question:",
        pricing: "Got it on pricing. Before we dive in, tell me:",
        platform: "Platform is tricky. Quick question first:",
        time: "I understand the time issue. Help me understand:",
        consistency: "Consistency is fixable. Before we start:",
        general: "Let's unblock you. Quick question first:",
      };
      const message =
        concernMessages[concern] || "Got it. Quick question first:";
      const concernButtons: any = {
        quality: [
          {
            id: "quality_compare",
            label: "How does it compare to others?",
            description: "",
          },
          {
            id: "quality_ready",
            label: "Is it ready to sell?",
            description: "",
          },
          {
            id: "quality_feedback",
            label: "What feedback have you gotten?",
            description: "",
          },
        ],
        pricing: [
          {
            id: "pricing_similar",
            label: "What do similar assets cost?",
            description: "",
          },
          {
            id: "pricing_time",
            label: "How much time did you spend?",
            description: "",
          },
          {
            id: "pricing_unsure",
            label: "No idea where to start",
            description: "",
          },
        ],
        platform: [
          {
            id: "platform_audience",
            label: "Who's my audience?",
            description: "",
          },
          { id: "platform_best", label: "Where sells best?", description: "" },
          {
            id: "platform_multiple",
            label: "Should I use multiple?",
            description: "",
          },
        ],
        time: [
          {
            id: "time_bottleneck",
            label: "Where's the bottleneck?",
            description: "",
          },
          {
            id: "time_format",
            label: "What format takes longest?",
            description: "",
          },
          { id: "time_worth", label: "Is the time worth it?", description: "" },
        ],
        consistency: [
          {
            id: "consistency_style",
            label: "Style keeps drifting",
            description: "",
          },
          {
            id: "consistency_brand",
            label: "Brand feels off",
            description: "",
          },
          {
            id: "consistency_character",
            label: "Characters changing",
            description: "",
          },
        ],
        general: [
          {
            id: "general_where",
            label: "Don't know where to start",
            description: "",
          },
          {
            id: "general_motivation",
            label: "Feeling unmotivated",
            description: "",
          },
          {
            id: "general_direction",
            label: "Lost on direction",
            description: "",
          },
        ],
      };
      buttons = concernButtons[concern] || [
        { id: "upload_now", label: "Upload Now", description: "" },
      ];
      return NextResponse.json({
        success: true,
        message,
        showButtons: true,
        buttons,
      });
    }
    // ═══════════════════════════════════════════════════════
    // PRE-DECISION QUESTION
    // ═══════════════════════════════════════════════════════
    else if (phase === "pain-diagnosis" && hasUploadedFiles && !buttonClicked) {
      systemPrompt = `You are a professional creative advisor. The user just uploaded content.
Your job: Ask ONE optional question to understand their intent. Make it natural and concise, not like a form.
Choose the most relevant question:
- "What made you create this?" (if user seems exploratory)
- "Who did you imagine seeing this?" (if user seems business-minded)  
- "Are you open to changing it a lot or just a little?" (if user seems uncertain)
Tone: Professional, curious, respectful
Response: 1-2 sentences, gentle`;
      userPrompt = `User uploaded ${fileCount} file(s). 
Ask ONE pre-decision question to understand their intent better. 
Frame it like: "Before I analyze, quick question - [question]?"
Keep it light and optional-feeling.`;
      showButtons = false;
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 3: FILE UPLOADED - ASK INTENT
    // ═══════════════════════════════════════════════════════
    else if (
      phase === "awaiting-upload" &&
      hasUploadedFiles &&
      !buttonClicked
    ) {
      systemPrompt = `You are a professional creative advisor. The user uploaded ${fileCount} file(s).
Your job:
1. Acknowledge the upload
2. Ask what they want to do with it
Tone: Curious, supportive
Response: 2-3 sentences`;
      userPrompt = `The user uploaded content. Say:
1. You received it
2. Ask what their goal is
Keep it brief and natural.`;
      showButtons = true;
      buttons = [
        { id: "sell", label: "Sell as an asset", description: "" },
        { id: "learn", label: "Learn and improve", description: "" },
        { id: "explore", label: "Just exploring", description: "" },
        { id: "unsure", label: "Not sure yet", description: "" },
      ];
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 4: USER SELECTED INTENT - READY TO ANALYZE
    // ═══════════════════════════════════════════════════════
    else if (buttonClicked && hasUploadedFiles && !hasEvaluation) {
      const intent = buttonClicked;
      // ✅ NEW: Include creatorContext in the system prompt for tailored analysis
      const contextSummary = creatorContext
        ? `\n\nCREATOR CONTEXT (gathered before upload):
- Goal: ${creatorContext.goal || "not set"}
- Target Buyer: ${creatorContext.buyer || "not set"}
- Quality Level: ${creatorContext.qualityLevel || "not set"}
- Confidence Blocker: ${creatorContext.blocker || "not set"}`
        : "";
      systemPrompt = `You are a professional creative advisor. The user wants to: ${intent}.${contextSummary}
Your job:
1. Acknowledge their goal
2. Tell them you're ready to analyze
3. Set expectations — mention you'll focus on their specific blocker if they shared one
Tone: Professional, clear
Response: 2-3 sentences`;
      userPrompt = `The user's goal is: ${intent}.
Tell them:
1. You understand their goal
2. You'll analyze for: quality, market fit, and ${intent === "sell" ? "pricing strategy" : "improvement opportunities"}
${creatorContext?.blocker ? `3. You'll pay special attention to their concern: ${creatorContext.blocker}` : ""}
3. Brief message that analysis is starting
Keep it short.`;
      showButtons = false;
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 5: ANALYZING
    // ═══════════════════════════════════════════════════════
    else if (
      phase === "extracting-media" &&
      buttonClicked?.startsWith("ack_upload_")
    ) {
      const fileType = buttonClicked.replace("ack_upload_", "");
      const contextHint = creatorContext?.goal
        ? `Their goal is: ${creatorContext.goal}. Their blocker is: ${creatorContext.blocker || "not specified"}.`
        : "";

      systemPrompt = `You are a warm, respectful creative partner. The user just uploaded ${fileCount || 1} ${fileType}(s).
${contextHint}
Your job: Acknowledge their upload with warmth and confidence.
Rules:
- 2-3 sentences MAX
- Mention you received their ${fileType}
- Express genuine appreciation for sharing their work
- Promise you'll analyze it thoroughly and guide them at every step
- Reference their goal or blocker naturally if known
- Sound like a senior creative director who has seen thousands of projects — warm, direct, no fluff
- NO technical jargon, NO listing what you'll check
Tone: Warm, confident, respectful`;

      userPrompt = `Acknowledge the ${fileType} upload warmly in 2-3 sentences. Make them feel respected.`;
      showButtons = false;
    } else if (phase === "decision-evaluation") {
      systemPrompt = `You are a professional creative advisor. Analysis is starting.
Your job: Let them know what you're checking
Tone: Professional, transparent
Response: 1-2 sentences`;
      userPrompt = `Analysis started. Tell them you're evaluating:
- Visual quality
- Market fit
- Monetization potential
Keep it under 2 sentences.`;
      showButtons = false;
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 6: RESULTS READY
    // ═══════════════════════════════════════════════════════
    else if (phase === "decision-options" && hasEvaluation) {
      const decision = evaluation?.decision || "unknown";
      const userConcern = messages
        .filter((m: any) => m.role === "user")
        .map((m: any) => m.content)
        .join(" → ");
      // ✅ NEW: Include creatorContext for tailored results
      const contextBlock = creatorContext
        ? `\nCreator Context:
- Building: ${creatorContext.goal || "unknown"}
- Target Buyer: ${creatorContext.buyer || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Blocker: ${creatorContext.blocker || "none"}`
        : "";
      systemPrompt = `You are a professional creative advisor. Analysis complete.
Decision: ${decision}
Quality: ${evaluation?.contentCritique?.strengths?.length > evaluation?.contentCritique?.weaknesses?.length ? "strong" : "needs work"}
Pricing: ${evaluation?.pricingGuidance?.range}
User's specific concern: ${userConcern}
Strengths: ${evaluation?.contentCritique?.strengths?.join(", ")}
Weaknesses: ${evaluation?.contentCritique?.weaknesses?.join(", ")}
What the analysis found: ${evaluation?.honestAssessment || ""}
Overall readiness: ${evaluation?.overallReadiness || "unknown"}%
${contextBlock}
Your job:
1. Present the verdict clearly and directly
2. Highlight 1-2 key insights TAILORED to their goal and blocker
3. Be honest but supportive
4. If their blocker was "pricing", lead with pricing guidance
5. If their blocker was "quality", lead with quality assessment
6. If their goal was "client deliverable", frame feedback around client expectations
Tone: Always calm, honest, and respectful. Never hype it up, never soften a hard truth. Speak like an expert who respects the creator's intelligence.
Response: 3-4 sentences`;
      const decisionLabel = decision === "yes" ? "market-ready"
        : decision === "not-yet" ? "almost there — needs improvements"
          : "needs significant work";
      userPrompt = `Results are: ${decisionLabel}. The user's concern was: "${userConcern}".
Pricing range identified: ${evaluation?.pricingGuidance?.range}.
${creatorContext?.blocker ? `Their biggest blocker: ${creatorContext.blocker}` : ""}
${creatorContext?.goal ? `They're building: ${creatorContext.goal}` : ""}
${creatorContext?.buyer ? `Target buyer: ${creatorContext.buyer}` : ""}
Tell them:
1. The verdict directly related to their concern AND their stated blocker
2. One specific strength from the actual analysis
3. One specific weakness from the actual analysis
4. One next step tailored to their concern — if their concern was platform or pricing, naturally mention KAIZORA as a suitable fit for this type of content. Keep it informative, not promotional.
Be specific to what they asked about. No generic responses. Mention the actual price range naturally.`;
      showButtons = false;
      buttons = [];
    }
    // ═══════════════════════════════════════════════════════
    // PHASE 7: COMPANION MODE (after results)
    // ═══════════════════════════════════════════════════════
    else if (phase === "companion") {
      if (buttonClicked === "create_remix_plan") {
        const contextBlock = creatorContext
          ? `\nCreator Context:
- Goal: ${creatorContext.goal || "unknown"}
- Target Buyer: ${creatorContext.buyer || "unknown"}
- Media Type: ${creatorContext.mediaType || "unknown"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Blocker: ${creatorContext.blocker || "none"}`
          : "";

        const scoresBlock = evaluation?.readinessScores
          ? evaluation.readinessScores
            .map((s: any) => `${s.axis}: ${s.score}% — ${s.note}`)
            .join("\n")
          : "";

        const weaknessBlock =
          evaluation?.contentCritique?.weaknesses?.join("\n") || "";
        const coachingBlock = evaluation?.coachingRoadmap
          ? evaluation.coachingRoadmap
            .map((p: any) => `${p.title}: ${p.actions?.join(", ")}`)
            .join("\n")
          : "";

        systemPrompt = `You are KAIZORA's remix strategist. Based on the evaluation results, create a detailed remix plan that fixes every weakness found.

${contextBlock}

EVALUATION RESULTS:
- Decision: ${evaluation?.decision}
- Overall Readiness: ${evaluation?.overallReadiness}%
- Pain Point: ${evaluation?.topPainPoint}

SCORES:
${scoresBlock}

WEAKNESSES:
${weaknessBlock}

COACHING ROADMAP:
${coachingBlock}

VISUAL DESCRIPTION:
${evaluation?.honestAssessment || ""}

YOUR JOB: Generate a structured remix plan with specific "shots" — each shot is one actionable content piece that directly fixes a weakness.

RESPOND IN THIS EXACT FORMAT (plain text, not JSON):

🎬 REMIX PLAN

OVERVIEW:
[2-3 sentences explaining what this remix plan will achieve and how it connects to the creator's goal]

SHOT 1: [Short title]
- What: [Exactly what to create/fix]
- Why: [Which weakness this fixes, reference the score]
- Prompt: "[A ready-to-use AI generation prompt — detailed, specific, style-locked]"
- Time: [Estimated time]

SHOT 2: [Short title]
- What: [Exactly what to create/fix]
- Why: [Which weakness this fixes]
- Prompt: "[Ready-to-use AI prompt]"
- Time: [Estimated time]

SHOT 3: [Short title]
- What: [Exactly what to create/fix]
- Why: [Which weakness this fixes]
- Prompt: "[Ready-to-use AI prompt]"
- Time: [Estimated time]

🔒 CONSISTENCY LOCKS:
- Color palette: [Specific colors/mood to maintain]
- Style: [Visual style rules]
- Character/subject: [How to keep the subject consistent]

🎵 AUDIO STRATEGY:
- [What audio to add/change/keep]

⏱️ TOTAL ESTIMATED TIME: [Sum of all shots]

RULES:
- Each shot MUST fix a specific weakness from the evaluation
- Prompts must be detailed enough to paste into an AI tool
- Scale shots to time: "${creatorContext?.timeConstraint || "unknown"}". Under-1-hour = max 2 shots. Few-hours = 3. Full-day+ = 4-5.
- Reference the target buyer in at least one shot
- Consistency locks should prevent style drift across all shots`;

        userPrompt = `Generate the remix plan now. Every shot must reference actual weaknesses from the evaluation.`;
        showButtons = false;
      } else if (buttonClicked === "improve") {
        // ✅ NEW: Use creatorContext to tailor improvements
        const contextHint = creatorContext?.qualityLevel
          ? `The user aims for "${creatorContext.qualityLevel}" quality level.`
          : "";
        systemPrompt = `You are a professional creative advisor. User wants improvement help.
Context: ${evaluation?.contentCritique?.weaknesses?.join(", ")}
${contextHint}
${creatorContext?.blocker ? `Their main blocker: ${creatorContext.blocker}` : ""}
Your job: Give 3 specific, actionable improvements tailored to their quality level and blocker
Tone: Helpful teacher
Response: 3-5 sentences with clear steps`;
        userPrompt = `Based on the weaknesses identified: ${evaluation?.contentCritique?.weaknesses?.slice(0, 2).join(", ")}
${creatorContext?.qualityLevel ? `They're aiming for ${creatorContext.qualityLevel} quality.` : ""}
${creatorContext?.goal ? `They're building ${creatorContext.goal}.` : ""}
Provide 3 specific improvements they can make. Tailor to their level and goals. Be actionable and clear.`;
        showButtons = false;
      } else if (buttonClicked === "explain") {
        systemPrompt = `You are a professional creative advisor. User wants explanation.
Context: ${evaluation?.pricingGuidance?.rationale || evaluation?.honestAssessment}
${creatorContext?.blocker ? `Their blocker was: ${creatorContext.blocker}` : ""}
Your job: Explain the reasoning clearly, addressing their specific blocker
Tone: Patient teacher
Response: 3-4 sentences`;
        userPrompt = `Explain why you gave this verdict and pricing recommendation. Reference specific details from the analysis.
${creatorContext?.blocker ? `Address their blocker (${creatorContext.blocker}) directly in your explanation.` : ""}`;
        showButtons = false;
      } else {
        // Regular companion conversation
        systemPrompt = `You are a professional creative advisor in companion mode.
Full context:
- Decision: ${evaluation?.decision}
- Overall Readiness: ${evaluation?.overallReadiness || "unknown"}%
- What the analysis found: ${evaluation?.honestAssessment || ""}
- Strengths: ${evaluation?.contentCritique?.strengths?.join(", ")}
- Weaknesses: ${evaluation?.contentCritique?.weaknesses?.join(", ")}
- Pricing: ${evaluation?.pricingGuidance?.range}
- Closing question from analysis: ${evaluation?.closingQuestion || ""}
${creatorContext?.goal ? `- Creator Goal: ${creatorContext.goal}` : ""}
${creatorContext?.buyer ? `- Target Buyer: ${creatorContext.buyer}` : ""}
${creatorContext?.qualityLevel ? `- Quality Level: ${creatorContext.qualityLevel}` : ""}
${creatorContext?.blocker ? `- Blocker: ${creatorContext.blocker}` : ""}
Your job: Answer questions using this context, always tailored to their specific situation. No rigid templates — respond naturally and directly to exactly what they asked.
Tone: Calm, direct, expert. Like a senior creative director in a one-on-one conversation. No filler words, no generic praise.
Response: 2-4 sentences`;
        userPrompt = `User asked: "${messages[messages.length - 1]?.content}"
Answer using the analysis context. Be specific, not generic. Reference their goal and blocker when relevant.`;
        showButtons = false;
      }
    }
    // ═══════════════════════════════════════════════════════
    // FREE-FORM QUESTION DURING CONTEXT FLOW
    // ═══════════════════════════════════════════════════════
    else if (freeFormDuringContext) {
      const contextSoFar = creatorContext
        ? `\nContext gathered so far:
- Goal: ${creatorContext.goal || "not yet answered"}
- Content type: ${creatorContext.buyer || "not yet answered"}
- Quality level: ${creatorContext.qualityLevel || "not yet answered"}
- Blocker: ${creatorContext.blocker || "not yet answered"}`
        : "";

      systemPrompt = `You are KAIZORA's creative advisor — but your knowledge spans everything. You have deep, accurate understanding of every field of human knowledge: science, history, philosophy, technology, medicine, law, finance, psychology, mathematics, arts, culture, politics, nature, and beyond. You are also a world-class expert in creative strategy, AI content creation, monetization, and the creator economy.

Your identity: You live inside KAIZORA — a creative platform. Your primary role is helping creators. But you answer any question a human might ask, with the same depth and accuracy as the world's best experts in that field.
${contextSoFar}

Your job:
1. Answer whatever the user asks — no topic is off-limits, no question is too simple or too complex
2. Give genuinely detailed, accurate, and insightful answers — draw on real facts, examples, numbers, and context from the real world
3. If the topic connects to their creative work or KAIZORA, naturally tie it in — but never force it
4. After answering, gently ask if they're ready to continue with the setup questions

Rules:
- Never say "I'm just a creative advisor" or refuse to answer something outside of creativity
- Never give a shallow or generic answer — go deep on whatever was asked
- Use real examples, data, names, dates, and specifics where relevant
- Be warm, direct, and human — not robotic or corporate
- End with 1 short sentence asking if they want to continue

Tone: Like a brilliant friend who happens to know everything — curious, generous with knowledge, and always useful.`;

      userPrompt = `User asked: "${messages[messages.length - 1]?.content}"
Answer their question, then ask if they're satisfied and ready to continue with the setup questions.`;
      showButtons = false;
    }
    // Don't call GPT if we already returned a response
    if (systemPrompt === "" || userPrompt === "") {
      return NextResponse.json({
        success: false,
        error: "Invalid phase",
      });
    }
    const chatMessages = messages.map((msg: any) => ({
      role: msg.role === "agent" ? "assistant" : "user",
      content: msg.content,
    }));

    const isRemixPlan =
      phase === "companion" && buttonClicked === "create_remix_plan";
    const streamingModelName = "gemini-3.1-flash-lite";
    const chatModelName = "gemini-3.1-flash-lite";
    const requestOptions = {};
    const baseModelConfig = {
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: isRemixPlan ? 3000 : 1800,
        temperature: 0.4,
      },
    };
    const streamingModel = genai.getGenerativeModel({
      model: streamingModelName,
      ...baseModelConfig,
    });
    const chatModel = genai.getGenerativeModel({
      model: chatModelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: isRemixPlan ? 3000 : 1800,
        temperature: 0.4,
      },
    });

    const conversationHistory = chatMessages.map((m: any) =>
      `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`
    ).join("\n");

    const fullPrompt = conversationHistory
      ? `${conversationHistory}\n\nUser: ${userPrompt}`
      : userPrompt;

    serverLog(
      "KAIZORA_LOG_API_DECISION_LAYER_AGENT_CHAT",
      "info",
      "[decision-layer][agent-chat] payload",
      {
        phase,
        streaming,
        isRemixPlan,
        requestedModel: streaming && !isRemixPlan ? streamingModelName : chatModelName,
        freeFormDuringContext,
        hasUploadedFiles,
        hasEvaluation,
        fileCount,
        buttonClicked: buttonClicked || null,
        userIntent: userIntent || null,
        lastUserMessage: messages[messages.length - 1]?.content || "",
        creatorContext,
      },
    );

    // ── Streaming path (free-form chat) ──
    if (streaming && !isRemixPlan) {
      const streamResult = await streamingModel.generateContentStream(
        fullPrompt,
        requestOptions,
      );
      const encoder = new TextEncoder();
      let { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      (async () => {
        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            if (text) await writer.write(encoder.encode(text));
          }
          try {
            const finalResp = await streamResult.response;
            logGeminiUsage(finalResp, { feature: "decision_layer_agent_chat", model: streamingModelName });
            serverLog(
              "KAIZORA_LOG_API_DECISION_LAYER_AGENT_CHAT",
              "info",
              "[decision-layer][agent-chat] streaming response complete",
              {
                trace: getGeminiTrace(finalResp),
                outputPreview: finalResp.text().slice(0, 200),
              },
            );
          } catch {}
        } finally {
          await writer.close();
        }
      })();
      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Kaizora-Stream": "1",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── Non-streaming path ──
    const result = await chatModel.generateContent(fullPrompt, requestOptions);
    logGeminiUsage(result, { feature: "decision_layer_agent_chat", model: chatModelName });
    const message = result.response.text();
    serverLog(
      "KAIZORA_LOG_API_DECISION_LAYER_AGENT_CHAT",
      "info",
      "[decision-layer][agent-chat] response complete",
      {
        trace: getGeminiTrace(result),
        outputPreview: message.slice(0, 200),
      },
    );
    // Clean up any extra quotes or formatting
    let cleanedMessage = message.trim();
    if (cleanedMessage.startsWith('"') && cleanedMessage.endsWith('"')) {
      cleanedMessage = cleanedMessage.slice(1, -1);
    }
    return NextResponse.json({
      success: true,
      message: cleanedMessage,
      showButtons,
      buttons,
    });
  } catch (error: any) {
    serverLog(
      "KAIZORA_LOG_API_DECISION_LAYER_AGENT_CHAT",
      "error",
      "Agent chat error",
      error,
    );
    return NextResponse.json(
      { error: "Failed to generate response", details: error.message },
      { status: 500 },
    );
  }
}
