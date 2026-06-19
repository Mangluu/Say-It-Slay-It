"""LLM forging: phrase -> weapon ItemSpec (strings/enum only).

Grammar-constrained JSON (Ollama `format` = JSON Schema) makes it structurally
impossible for the model to emit numbers, so balance can never be affected by
what a player shouts. Validation + clamp + denylist + timeout-to-fallback on top.
"""
import json
import os
import threading

import ollama

from .content_pool import ARCHETYPES, POOL, random_fallback

# Serialize LLM calls so concurrent/typed forges queue instead of piling up on Ollama.
_lock = threading.Lock()
# Explicit timeout so a hung Ollama request RAISES (releasing _lock on all paths) instead
# of stalling the entire forge subsystem forever; the except branch then returns a fallback.
_client = ollama.Client(timeout=20.0)

# Smaller model by default: on this Blackwell/Ollama build the 7B runs slowly,
# and a 3B is plenty for naming a weapon + picking an archetype. Override with
# MICDROP_MODEL.
MODEL = os.environ.get("MICDROP_MODEL", "qwen2.5:1.5b-instruct")

SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "archetype": {"type": "string", "enum": ARCHETYPES},
        "flavor": {"type": "string"},
        "voiceBark": {"type": "string"},
        "visualPrompt": {"type": "string"},
    },
    "required": ["name", "archetype", "flavor", "visualPrompt"],
}

SYSTEM = (
    "You are a weapon designer for a funny couch-brawler. Given a short (sometimes misheard) phrase, invent ONE "
    "absurd but PG-13 weapon. Output STRICT JSON ONLY with exactly these keys: "
    "name (string, under 5 words, genuinely funny), archetype (one value from the allowed enum), "
    "flavor (one short funny sentence), "
    "visualPrompt (a short plain description of the weapon as ONE single physical object for an image generator, "
    "e.g. 'a flaming rubber duck' or 'a chrome boomerang with glowing edges': just the object itself, no scene, "
    "no people, no background). No other keys. No numbers or stats. "
    "Choose the archetype that best fits the phrase: "
    "heavy_bomb (big slow explosive), light_spam (fast weak rapid-fire), homing_pest (tracks the foe), "
    "boomerang (returns), scatter (spread shot), sticky_trap (placed trap), cloud (lingering gas)."
)

# PG-13 substring denylist for the summer-school audience (a name containing any
# of these is replaced with a clean fallback). Extend as needed.
DENYLIST = {
    "fuck", "shit", "cunt", "bitch", "dick", "cock", "pussy", "penis", "vagina",
    "nigger", "nigga", "faggot", "retard", "rape", "nazi", "whore", "slut", "bastard",
}

# Diverse examples anchor archetype VARIETY (the small model otherwise overuses
# one archetype). Each maps a phrase to a clearly different archetype.
EXAMPLES = [
    {"role": "user", "content": 'Phrase: "flaming rubber duck of doom"'},
    {"role": "assistant", "content": json.dumps({"name": "Flaming Rubber Duck of Doom", "archetype": "heavy_bomb", "flavor": "Quacks once, then detonates.", "visualPrompt": "a flaming rubber duck"})},
    {"role": "user", "content": 'Phrase: "rubber chicken machine gun"'},
    {"role": "assistant", "content": json.dumps({"name": "Rubber Chicken SMG", "archetype": "light_spam", "flavor": "Squeaks with every shot.", "visualPrompt": "a rubber chicken shaped gun"})},
    {"role": "user", "content": 'Phrase: "glitter shotgun"'},
    {"role": "assistant", "content": json.dumps({"name": "Glitter Boomstick", "archetype": "scatter", "flavor": "Fabulous and everywhere at once.", "visualPrompt": "a sparkly glitter shotgun"})},
    {"role": "user", "content": 'Phrase: "homesick boomerang"'},
    {"role": "assistant", "content": json.dumps({"name": "Homesick Boomerang", "archetype": "boomerang", "flavor": "It always comes back to you.", "visualPrompt": "a wooden boomerang with sad eyes"})},
]


def _clean(s, n):
    return str(s or "").strip()[:n]


def _safe_name(name):
    low = name.lower()
    for bad in DENYLIST:
        if bad in low:
            return "Mystery Mcguffin"
    return name or "Mystery Mcguffin"


def forge_item(phrase: str) -> dict:
    phrase = (phrase or "").strip()[:120]
    if not phrase:
        return random_fallback()
    try:
        # Loose JSON mode (format="json") is much faster than schema-grammar
        # decoding. The fairness firewall is preserved by validating/clamping
        # below: we only read the string fields and the archetype enum, and the
        # model is never asked for numbers.
        with _lock:
            resp = _client.chat(
                model=MODEL,
                messages=[{"role": "system", "content": SYSTEM}, *EXAMPLES,
                          {"role": "user", "content": f'Phrase: "{phrase}"'}],
                format="json",
                options={"temperature": 0.9, "num_predict": 56, "top_p": 0.9},
                keep_alive="30m",
            )
        data = json.loads(resp["message"]["content"])
        arch = data.get("archetype")
        if arch not in ARCHETYPES:
            return random_fallback()
        name = _safe_name(_clean(data.get("name"), 40))
        return {
            "name": name,
            "archetype": arch,
            "flavor": _clean(data.get("flavor"), 80),
            "voiceBark": _clean(data.get("voiceBark"), 24),  # optional; "" if absent
            "visualPrompt": _clean(data.get("visualPrompt") or name, 160),  # for P5 sprites
            "source": "llm",
        }
    except Exception as e:  # timeout, bad JSON, model down -> safe fallback
        item = random_fallback()
        item["error"] = str(e)[:120]
        return item


def warm():
    """Pre-warm the model so the first real forge is fast."""
    try:
        _client.chat(model=MODEL, messages=[{"role": "user", "content": "ok"}],
                     options={"num_predict": 1}, keep_alive="30m")
    except Exception:
        pass
