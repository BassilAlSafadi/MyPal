---
title: MyPal Gateway
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# MyPal API Gateway (combined)

Go API gateway bundled with the C# Main API in a single container. The gateway
proxies authenticated requests to the C# API over `localhost`, avoiding Hugging
Face's Space-to-Space rate limiting (HTTP 429) that broke login when the two
ran as separate Spaces.

Google OAuth is still served by the standalone `mypal-csharp` Space (browser
talks to it directly), so this container runs C# without Google credentials.
