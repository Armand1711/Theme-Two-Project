# Lulama — CHOSA AI Representative

<p align="center">
  <img src="docs/mockups/mockup-06-showcase.png" alt="Lulama showcase across screens" width="100%" />
</p>

<p align="center">
  A 3D conversational AI experience built for <a href="https://www.chosa.org" target="_blank">CHOSA (Children of South Africa)</a>.<br/>
  Lulama is an AI representative that shares CHOSA's story, builds emotional connection with visitors, and guides them toward meaningful support.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-0.174-black?logo=three.js&logoColor=white&style=flat-square" alt="Three.js" />
  <img src="https://img.shields.io/badge/Groq-LLaMA_3.3_70B-orange?style=flat-square" alt="Groq" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white&style=flat-square" alt="Vite" />
</p>

---

## Overview

Lulama is a purpose-built AI experience for CHOSA, a South African nonprofit that has funded and strengthened community-based organisations in the Western Cape since 2004. Rather than a static landing page, visitors encounter a 3D animated avatar that holds a real conversation, shares CHOSA's impact, and when the moment is right, opens a donation panel directly in the interface.

The system is designed around three ideas:

**Honest transparency.** Lulama identifies itself as an AI from the first message. It speaks on behalf of CHOSA, not as a pretend community worker.

**Emotional storytelling.** The conversation arc moves from connection to story to a direct, warm donation ask — guided by a large language model fine-tuned through the system prompt to stay on topic and stay truthful.

**Frictionless giving.** The donation panel appears exactly when it should: the moment a user asks how to give, or when Lulama naturally reaches the ask. Users can pick a preset amount, enter a custom amount, and complete a demo payment flow without leaving the page.

---

## Screens

<br/>

### Avatar View — Lulama in conversation

<p align="center">
  <img src="docs/mockups/mockup-01-avatar.png" alt="Avatar view with Lulama and speech bubble" width="80%" />
</p>

The main view presents Lulama as a 3D animated character rendered in a WebGL canvas. The avatar responds to each message with realistic lip sync driven by per-character viseme mapping, ambient head movement, idle breathing, and natural blinking. A speech bubble typewriters the response below — click the bubble at any point to finish it instantly.

<br/>

### Chat History View

<p align="center">
  <img src="docs/mockups/mockup-02-chat.png" alt="Chat history panel" width="80%" />
</p>

Switching to History mode replaces the avatar stage with a full conversation transcript. Both modes share the same input composer and the same dynamic quick-reply chips, which update after every AI turn to reflect contextually relevant follow-up questions for that specific exchange.

<br/>

### Full Layout — Donation Panel and Funding Panel

<p align="center">
  <img src="docs/mockups/mockup-03-full-layout.png" alt="Full three-column layout with donation and funding panels" width="80%" />
</p>

On desktop the layout splits into three columns. The funding panel on the right shows CHOSA's active fundraising projects with live progress bars. The donation panel on the left slides in when the conversation reaches the support phase, or immediately when a user asks about giving. Both panels can be opened and closed independently via the tab buttons on their edges.

<br/>

### Payment Modal

<p align="center">
  <img src="docs/mockups/mockup-04-payment.png" alt="Payment modal with demo form fields" width="80%" />
</p>

Clicking "Donate" opens a full-screen modal centred over the interface. The fields start blank and auto-type demo card details when each field is focused, illustrating how a real payment integration would behave. This is a demonstration flow only. No real transaction is processed.

<br/>

### Donation Confirmed

<p align="center">
  <img src="docs/mockups/mockup-05-success.png" alt="Donation success state" width="60%" />
</p>

Confirming the demo donation replaces the form with an animated success state. The modal closes automatically after a short delay.

---

## Features

| Feature | Detail |
|---|---|
| 3D Animated Avatar | Ready Player Me GLB model rendered with Three.js and React Three Fiber |
| Lip Sync | Per-character ARKit viseme mapping at 45 ms per character, synced to the typewriter |
| AI Conversation | Groq API running LLaMA 3.3 70B via an OpenAI-compatible client |
| Dynamic Quick Replies | Each AI response triggers a secondary Groq call to generate contextually relevant follow-up chips |
| Donation Panel | Preset amounts, custom amount input, demo payment modal with auto-type fields |
| Partner Registration | Inline form in the partner tab with a multi-step flow and success state |
| Funding Panel | Three active CHOSA projects with animated progress bars and live raise figures |
| Background Gallery | Subtle Ken Burns photo slideshow at 9% opacity using community images |
| Click to Skip | Clicking the speech bubble during typewriting completes the text instantly |
| Panel Toggles | Both side panels open and close independently via edge tab buttons |
| CHOSA Brand Aligned | Nunito body font, Playfair Display headings, CHOSA forest green palette throughout |
| Fully Responsive | Two-column layout on desktop, stacked on mobile |

---

## Tech Stack

**Frontend**

| Library | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 8 | Build tool and dev server |
| Three.js | 0.174 | 3D rendering engine |
| @react-three/fiber | 9 | React renderer for Three.js |
| @react-three/drei | 10 | Three.js helpers (Environment, useGLTF) |
| openai | latest | Groq API client (OpenAI-compatible) |

**APIs**

| Service | Use |
|---|---|
| Groq (llama-3.3-70b-versatile) | Main conversation and dynamic prompt generation |

**Design**

| Tool | Detail |
|---|---|
| Nunito | Body and label typography |
| Playfair Display | Display headings |
| CHOSA green (#3D9E6B / #2D7A52) | Primary brand colour |
| CSS custom properties | Full design token system |

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A free Groq API key from [console.groq.com](https://console.groq.com)

### Installation

Clone the repository and install dependencies.

```bash
git clone https://github.com/Armand1711/lulama.git
cd lulama
npm install
```

Copy the example environment file and add your key.

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder with your Groq API key.

```env
VITE_GROQ_API_KEY=your_groq_key_here
```

Start the development server.

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_GROQ_API_KEY` | Yes | Groq API key for the LLaMA conversation model |
| `VITE_ELEVENLABS_API_KEY` | No | ElevenLabs key for voice TTS (browser speech fallback used if empty) |
| `VITE_ELEVENLABS_VOICE_ID` | No | ElevenLabs voice ID (defaults to Charlotte) |

---

## Project Structure

```
lulama/
├── public/
│   ├── models/
│   │   └── brunette.glb          # Ready Player Me avatar model
│   ├── gallery/
│   │   └── photo-01.jpg … photo-09.jpg  # Background community photos
│   └── chosa-logo.png            # CHOSA brand logo
├── src/
│   ├── components/
│   │   └── Avatar.jsx            # 3D avatar, lip sync, viseme engine
│   ├── App.jsx                   # All UI components and application logic
│   ├── index.css                 # Full design system and layout
│   └── main.jsx                  # React entry point
├── docs/
│   └── mockups/                  # README screenshots
├── .env.example
└── index.html
```

---

## Adding Community Photos

The background gallery rotates through images placed in `public/gallery/`. Name each file `photo-01.jpg` through `photo-09.jpg`. The component detects which files exist and skips any that are missing, so you can add photos incrementally. Each image displays at 9% opacity with a slow Ken Burns pan, providing subtle environmental texture without distracting from the conversation.

---

## Updating CHOSA Projects

The funding panel data lives in the `PROJECTS` array near the top of `src/App.jsx`. Each entry takes the following shape.

```js
{
  id: 1,
  name: 'Ulwazi Creche Renovation',
  location: 'Khayelitsha',
  description: 'New roof, safe windows, and learning materials for 52 young children.',
  goal: 95000,
  raised: 71400,
  tag: 'Early Learning',
}
```

Update the `raised` figure at any time to reflect current fundraising progress. The progress bar and percentage calculate automatically.

---

## Customising the AI Persona

Lulama's behaviour is controlled entirely through the `SYSTEM_PROMPT` constant in `src/App.jsx`. The prompt defines what she knows, what she does not fabricate, how she speaks, and when to make the donation ask. Editing this string is the primary way to adjust tone, add new talking points, or change the conversation arc.

The `INITIAL_MESSAGE` object controls the first message Lulama delivers when the page loads. This is also passed back into every API call as context so the model understands where the conversation began.

---

## Roadmap

Future improvements planned for this project.

Real payment integration via PayFast or Stripe for South African cards.

ElevenLabs voice TTS connected so Lulama speaks as well as types.

CMS integration so CHOSA staff can update project data and the AI prompt without touching code.

Mobile-optimised avatar mode with a smaller canvas and reduced particle load.

Accessibility audit covering screen reader support and keyboard navigation throughout.

---

## Acknowledgements

Built for CHOSA (Children of South Africa). Their mission to fund and strengthen community-based organisations in the Western Cape since 2004 is what this project exists to support.

Learn more at [chosa.org](https://www.chosa.org) or donate directly at [chosa.org.za/donate](https://www.chosa.org.za/donate).

---

## Author

**Armand** — [contact@luminara.design](mailto:contact@luminara.design)

Project built as part of the PP 410 final portfolio at the Cape Peninsula University of Technology.

---

## License

This project is provided for educational and portfolio purposes. The CHOSA name, logo, and brand assets belong to Children of South Africa and are used with acknowledgement of their organisation.
