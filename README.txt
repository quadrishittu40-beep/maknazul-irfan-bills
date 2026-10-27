MAKNAZUL IRFAN BILLS & SERVICES — COLOURS AND ICONS

FILES
- public/styles.css: colour/background and service-icon CSS.
- public/icon.svg: custom app/favicon icon.
- public/manifest.json: optional PWA manifest.
- ADD-TO-HEAD.html: HTML lines to insert in public/index.html.

HOW TO APPLY
1. Back up your existing public/styles.css first.
2. This is an add-on stylesheet, not the full original app stylesheet. If your app already has CSS, copy these rules into your existing stylesheet and replace duplicate rules rather than replacing the entire file.
3. Copy icon.svg and manifest.json into your project's public folder.
4. Copy the three lines in ADD-TO-HEAD.html into the <head> section of public/index.html.
5. Add an icon span inside each matching service button, for example:
   <span class="service-icon purple">🎓</span>
   <span class="service-icon blue">✎</span>
   <span class="service-icon orange">📚</span>
   <span class="service-icon green">🏫</span>
   <span class="service-icon cyan">📱</span>
   <span class="service-icon pink">⚡</span>
6. Commit your changes to GitHub and redeploy on Vercel.

No Paystack keys or other secrets are included. Store Paystack secret keys in Vercel environment variables only.
