# Mileage placement prototype — throwaway

Question: where should mileage live without two stacked navigation controls?

Run `python3 src/features/progress/prototypes/mileage-placement.prototype.py`, then open <http://localhost:8787/progress?variant=A>.
Use the floating arrows, keyboard left/right arrows, or the option list to compare:

- **A — Title menu:** switch Time/Mileage from a compact title; the period control stays visible.
- **B — Progress card:** time Progress stays the landing screen, with a monthly Mileage card that opens a separate detail screen.
- **C — Home card:** mileage sits next to the Service Report on Home and opens its own screen. Progress stays dedicated to time.

This iOS-only repository has no web router. The single browser `/progress` comparison recreates the existing native Progress and Home surroundings using the app's Inter font, dark palette, card density, and bottom navigation. It is isolated next to Progress, not wired into production navigation. There are no native imports, real store reads, writes, network services, or persisted browser data. URL parameters preserve the selected variant; every other state resets on reload.

Click through entry points, the title menu, period controls, month arrows, vehicle filter, category breakdown, report preview, and quick actions. The review panel shows current navigation and sample state. Buttons outside this placement question show a brief prototype notice. Amounts and vehicles are explicitly fictional fixtures, separate from the simulator's test records.

Verdict: **B — Progress card**, selected by the User on September 4, 2026. The placement and navigation were accepted; the card's typography and hierarchy needed refinement. The native implementation uses a clear Mileage heading, a prominent distance with a smaller unit, quieter period/vehicle metadata, and a chevron. The card opens a dedicated mileage screen in the selected period and Back returns to Progress. Month, Service Year, and All Time all retain the entry point; Map keeps its tab. The prototype preserves the original alternatives as the source of this decision.

Capture branch: `mileage-placement-prototype`. This branch contains only the throwaway comparison and verdict, not the final native implementation. Issue: <https://github.com/leviFrosty/witness-work/issues/256>. Do not ship the prototype files.
