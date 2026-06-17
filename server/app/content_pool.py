"""Curated fallback weapons. Used when the LLM times out, returns junk, or is
unavailable (showcase "safe mode"). The LLM only ever returns these same string
fields; numbers are applied client-side from the shared archetype table."""
import random

ARCHETYPES = [
    "heavy_bomb", "light_spam", "homing_pest", "boomerang", "scatter", "sticky_trap", "cloud",
]

POOL = [
    {"name": "Flaming Rubber Duck", "archetype": "heavy_bomb",  "flavor": "Quacks once, then detonates.", "voiceBark": "QUACK. BOOM.", "visualPrompt": "a flaming rubber duck"},
    {"name": "Glitter Machine Gun", "archetype": "light_spam",  "flavor": "Fabulous and relentless.",     "voiceBark": "SPARKLE",      "visualPrompt": "a glitter machine gun"},
    {"name": "Angry Wasp Jar",      "archetype": "homing_pest", "flavor": "It knows where you live.",      "voiceBark": "BZZZZ",        "visualPrompt": "a jar of angry wasps"},
    {"name": "Cursed Frisbee",      "archetype": "boomerang",   "flavor": "Always comes back. Sorry.",     "voiceBark": "WHOOSH",       "visualPrompt": "a glowing cursed frisbee"},
    {"name": "Confetti Cannon",     "archetype": "scatter",     "flavor": "Celebrate. Violently.",         "voiceBark": "TA-DA",        "visualPrompt": "a colorful confetti cannon"},
    {"name": "Bubblegum Mine",      "archetype": "sticky_trap", "flavor": "Step in it. Regret it.",        "voiceBark": "SPLAT",        "visualPrompt": "a pink bubblegum mine"},
    {"name": "Fart Cloud Deluxe",   "archetype": "cloud",       "flavor": "Lingers like a bad opinion.",   "voiceBark": "PFFFT",        "visualPrompt": "a green stink cloud"},
]


def random_fallback():
    item = dict(random.choice(POOL))
    item["source"] = "fallback"
    return item
