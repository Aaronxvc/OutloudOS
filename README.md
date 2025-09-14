# OutloudOS

> A sovereign OS experiment — Flipper-style ESP32 terminal + browser desktop + local LLMs.

OutloudOS is a retro-inspired personal OS I’m building from scratch.  
It combines **hardware** (ESP32 “Flipper-like” terminal), a **browser desktop UI**, and **local AI models (Ollama)** into one cohesive system.

The long-term vision: a **sovereign, local-first operating system** where  
- prompts, data, and macros are yours,  
- apps can be created on the fly using a DSL,  
- and even small hardware devices become portals into your personal OS.

---

## ✨ Features

- **Flipper-style ESP32 terminal** with OLED + buttons  
  → Sends DSL commands or freeform prompts to the backend.  

- **ASP.NET Receiver (SignalR hub)**  
  → Bridges devices and desktop, fans out streams in real-time.  

- **Browser desktop (Node + HTML/JS)**  
  → Shows live token streams, retro-styled UI.  

- **Local LLM integration (Ollama)**  
  → All prompts run locally, no cloud required.  

- **Domain-Specific Language (DSL)**  
  - `prompt "write a haiku"` → stream model response  
  - `save "meeting notes"` → append to journal  
  - `read` → replay journal  
  - `clear` → wipe journal  

---

## 🏗 Architecture

[ESP32 Watch/Terminal] → BLE/Wi-Fi → /proto/* → [ASP.NET Receiver] ←→ [SignalR Hub] → Browser UI
↓
[Node API + Ollama]


- **hardware/** → ESP32 firmware + .NET Receiver  
- **frontend/** → Node server + static files (index.html, script.js, style.css)  

---

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/YOURUSER/OutloudOS.git
cd OutloudOS
