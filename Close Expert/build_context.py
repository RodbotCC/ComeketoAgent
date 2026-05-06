#!/usr/bin/env python3
"""
Regenerate JSON context harness from Close help scrape (close-help-docs/).
Run from anywhere: python build_context.py
"""

from __future__ import annotations

import html
import json
import re
from collections import defaultdict
from pathlib import Path

CTX = Path(__file__).resolve().parent
WORKSPACE = CTX.parent
SCRAPE = WORKSPACE / "close-help-docs"
MANIFEST = SCRAPE / "manifest.json"
PAGES = SCRAPE / "pages"
TOPICS_DIR = CTX / "topics"

# Ordered: more specific / distinctive rules before broad ones.
RULES: list[tuple[str, list[str]]] = [
    (
        "sms_compliance",
        ["10dlc", "a2p", "a2p-", "mms compliance", "sms registration", "regulatory-bundle"],
    ),
    ("whatsapp", ["whatsapp"]),
    (
        "sms_messaging",
        ["sms", "mms", "forwarding-sms", "simpletexting", "texting", "sms-deliverability"],
    ),
    (
        "calling_dialer",
        [
            "dialer",
            "power dial",
            "predictive dial",
            "calling-from",
            "calling and",
            "call block",
            "call coach",
            "call quality",
            "call report",
            "call task",
            "voicemail",
            "telephony",
            "headset",
            "increase-call",
            "bring-your-own-carrier",
            "porting-your-number",
            "group number",
            "premium-phone",
        ],
    ),
    (
        "email",
        [
            "email",
            "smtp",
            "imap",
            "inbox",
            "mailgun",
            "sendgrid",
            "mailchimp",
            "deliverability",
            "bulk email",
            "dedicated-email",
            "unsubscribe",
            "forwarding-email",
            "set-up-outbound-email",
            "email-sending",
            "email-filter",
            "which-ip-addresses",
        ],
    ),
    (
        "meetings_scheduling",
        [
            "calendly",
            "savvycal",
            "scheduling-link",
            "book-meeting",
            "zoom",
            "meetings",
            "google calendar",
        ],
    ),
    (
        "workflows_automation",
        [
            "workflow",
            "sequence",
            "zapier",
            "dripify",
            "automating-action",
            "newsletter",
            "automated-sender",
            "perform-an-action-when-a-workflow",
        ],
    ),
    (
        "integrations",
        [
            "integration",
            "hubspot",
            "facebook-lead",
            "segment",
            "slack",
            "google-forms",
            "docusign",
            "getaccept",
            "linkmatch",
            "leadfuze",
            "chrome",
            "oauth",
            "api-keys",
            "create-oauth",
            "zapier-api",
            "help scout",
            "helpdesk",
            "mcp-server",
            "close-mcp",
        ],
    ),
    (
        "smart_views_search",
        [
            "smart view",
            "smart-view",
            "search-and-smart",
            "searching-guide",
            "lead-filtering",
            "lead filter",
            "calculations-in-smart",
        ],
    ),
    (
        "reporting",
        [
            "report",
            "analytics",
            "activity-comparison",
            "activity-overview",
            "opportunities-report",
            "opportunity-funnel",
            "sent-email-report",
            "status-change-report",
            "workflow-reporting",
        ],
    ),
    (
        "opportunities_pipeline",
        [
            "opportunity",
            "pipeline",
            "funnel",
            "probability",
            "pipeline status",
        ],
    ),
    (
        "leads_contacts_crm_core",
        [
            "lead",
            "contact",
            "merge",
            "duplicate",
            "import",
            "export",
            "uploading-lead",
            "edit-merge-delete",
            "updating-existing-lead",
            "avoiding-lead",
            "lead assignment",
            "lead visibility",
            "lead status",
            "lead scoring",
            "parentchild",
            "conversation",
            "inbox",
            "prospecting",
            "explorer",
        ],
    ),
    (
        "customization",
        [
            "custom field",
            "custom activit",
            "custom object",
            "note template",
            "custom-activit",
            "custom-field",
            "custom-object",
        ],
    ),
    (
        "playbooks_ai",
        [
            "playbook",
            "chloe",
            "ai-enrich",
            "call-assistant",
            "notetaker",
            "prompt-training",
            "chatgpt",
        ],
    ),
    (
        "tasks_notes",
        ["task", "note", "activity-recorder"],
    ),
    (
        "account_users_roles",
        [
            "user role",
            "admin-account",
            "super-user",
            "restricted-user",
            "adding-and-removing-users",
            "roles-permission",
            "account-setting",
            "plans-and-billing",
            "cancellation",
            "single-sign-on",
            "enabling-2fa",
        ],
    ),
    (
        "mobile_desktop",
        [
            "desktop-app",
            "mobile-app",
            "reinstalling",
            "restarting-the-close",
            "opening-links-in-the-desktop",
            "browser-notification",
            "system-requirement",
        ],
    ),
    (
        "security_compliance_data",
        [
            "security",
            "vulnerability",
            "gdpr",
            "eu-data",
            "data-usage",
            "data-security",
            "open-source-acknowledgment",
            "german-regulatory",
        ],
    ),
    (
        "getting_started_onboarding",
        [
            "onboarding-checklist",
            "setup-implementation",
            "build-a-sales-process",
            "quick-start-import",
            "knowledge-hub",
            "communicat",  # communications-kit, champion-kit
            "champion-kit",
            "organizational-tool",
        ],
    ),
    (
        "costs_usage_monitoring",
        ["cost", "usage balance", "managing-your-usage", "network-logs", "error-logs", "enabling-quality-of-service"],
    ),
    (
        "troubleshooting",
        [
            "troubleshoot",
            "issue",
            "not syncing",
            "diagnosing",
            "debug",
            "windows-screen",
            "clearing-the-configuration",
            "reinstall",
        ],
    ),
    ("keyboard_ux", ["keyboard-shortcut", "keybinding", "spell-check", "fullscreen"]),
    ("general_reference", []),
]


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s).strip())


def body_from_page(path: Path) -> str:
    raw = path.read_text(encoding="utf-8", errors="replace")
    if "---" in raw:
        raw = raw.split("---", 1)[1]
    return normalize(raw)


def excerpt(text: str, max_len: int = 480) -> str:
    text = normalize(text)
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rsplit(" ", 1)[0] + "…"


STOP_KW = frozenset(
    "with for and the how when what from your are can use not this that our any per via all may set new get use".split()
)


def keyword_pack(slug: str, title: str, sample: str) -> list[str]:
    out: list[str] = []
    for part in slug.replace("_", "-").split("-"):
        if len(part) > 2 and part not in {"the", "and", "for", "with", "via"}:
            out.append(part)
    for w in re.findall(r"[A-Za-z][A-Za-z0-9/+]{2,}", title):
        wl = w.lower()
        if wl not in {
            "the",
            "and",
            "for",
            "with",
            "from",
            "your",
            "how",
            "not",
            "when",
            "what",
            "this",
            "that",
        } and wl not in STOP_KW:
            out.append(w)
    # Capitalized phrases in sample (rough UI strings)
    for m in re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", sample[:1200]):
        if len(m) < 40 and not re.match(r"^(Since|Once|Even|Use|The|This|That|Read|Start|Below)\b", m):
            out.append(m)
    seen: dict[str, None] = {}
    for k in out:
        kl = k.lower()
        if kl in STOP_KW and " " not in k:
            continue
        if kl not in seen:
            seen[kl] = None
    return sorted(seen.keys(), key=lambda x: (-len(x), x))[:24]


def classify(slug: str, title: str, hay: str) -> list[str]:
    matched: list[str] = []
    for topic_id, patterns in RULES:
        if topic_id == "general_reference":
            continue
        if any(p in hay for p in patterns):
            matched.append(topic_id)
    if not matched:
        return ["general_reference"]
    return matched[:6]


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    articles: dict = manifest.get("articles", {})

    by_topic: dict[str, list[dict]] = defaultdict(list)
    slug_index: list[dict] = []
    tree_nodes: dict = {
        "close-crm-ai-context": {
            "ROUTER.json": "start here",
            "slug_index.json": "flat lookup by slug + topics",
            "tree.json": "directory overview",
            "topics": {},
        },
        "close-help-docs": {"pages": f"{len(list(PAGES.glob('*.txt')))} .txt bodies"},
    }

    for slug, meta in sorted(articles.items()):
        if "file" not in meta:
            continue
        rel_file = meta["file"]
        page_path = PAGES / rel_file
        if not page_path.exists():
            continue
        title = normalize(meta.get("title", slug))
        url = meta.get("url", f"https://help.close.com/docs/{slug}")
        body = body_from_page(page_path)
        ex = excerpt(body)
        hay = f"{slug} {title} {body[:1500]}".lower()
        topics = classify(slug, title, hay)
        kws = keyword_pack(slug, title, body)

        rel_to_workspace = f"close-help-docs/pages/{rel_file}"
        entry = {
            "slug": slug,
            "title": title,
            "url": url,
            "body_file": rel_to_workspace,
            "topics": topics,
            "excerpt": ex,
            "keywords": kws,
        }
        slug_index.append(
            {
                "slug": slug,
                "title": title,
                "topics": topics,
                "body_file": rel_to_workspace,
                "excerpt": ex[:200] + ("…" if len(ex) > 200 else ""),
            }
        )
        for t in topics:
            by_topic[t].append({k: v for k, v in entry.items() if k != "topics"} | {"topic": t})

    TOPICS_DIR.mkdir(parents=True, exist_ok=True)
    topic_files: dict[str, str] = {}
    for topic_id, entries in sorted(by_topic.items()):
        path = TOPICS_DIR / f"{topic_id}.json"
        doc = {
            "topic_id": topic_id,
            "article_count": len(entries),
            "articles": sorted(entries, key=lambda x: x["slug"]),
        }
        path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
        topic_files[topic_id] = f"topics/{topic_id}.json"
        tree_nodes["close-crm-ai-context"]["topics"][f"{topic_id}.json"] = f"{len(entries)} articles"

    hints = {
        "sms_compliance": "10DLC A2P registration carrier compliance",
        "sms_messaging": "SMS MMS texting deliverability templates",
        "whatsapp": "WhatsApp channel",
        "calling_dialer": "calls voicemail power/predictive dialer phone BYOC",
        "email": "SMTP IMAP sync templates bulk deliverability inbox",
        "meetings_scheduling": "Calendly Zoom meetings calendar booking",
        "workflows_automation": "workflows sequences Zapier automation",
        "integrations": "third-party OAuth API Slack HubSpot MCP",
        "smart_views_search": "Smart Views filters search segments",
        "reporting": "reports analytics dashboards",
        "opportunities_pipeline": "opportunities pipelines confidence stages",
        "leads_contacts_crm_core": "leads contacts import CRM core",
        "customization": "custom fields activities objects",
        "playbooks_ai": "Playbooks Chloe AI enrichment",
        "tasks_notes": "tasks notes activities",
        "account_users_roles": "users roles billing admin SSO 2FA",
        "mobile_desktop": "desktop mobile apps",
        "security_compliance_data": "security GDPR data privacy",
        "getting_started_onboarding": "onboarding implementation setup kits",
        "costs_usage_monitoring": "costs usage quotas logs monitoring QoS",
        "troubleshooting": "errors diagnostics sync fixes",
        "keyboard_ux": "shortcuts keybindings UX",
        "general_reference": "misc pages not matched elsewhere",
    }

    router = {
        "_agent_instructions": (
            "1) Read topic_hints below and open topics/<topic_id>.json for grouped articles. "
            "2) Or grep slug_index.json for slug/title/excerpt. "
            "3) For full text, open body_file path (plain text under close-help-docs/pages/)."
        ),
        "generated_for": "Close CRM help (help.close.com) mirror",
        "bodies_directory": "close-help-docs/pages",
        "topic_hints": hints,
        "topic_files": topic_files,
    }
    (CTX / "ROUTER.json").write_text(json.dumps(router, indent=2), encoding="utf-8")
    (CTX / "slug_index.json").write_text(
        json.dumps({"slug_count": len(slug_index), "slugs": slug_index}, indent=2),
        encoding="utf-8",
    )
    (CTX / "tree.json").write_text(json.dumps(tree_nodes, indent=2), encoding="utf-8")
    print(f"Wrote {len( topic_files)} topic files, ROUTER.json, slug_index.json ({len(slug_index)} articles)")


if __name__ == "__main__":
    main()
